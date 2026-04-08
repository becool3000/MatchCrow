import { describe, expect, it } from 'vitest';
import { trySwapOnBoard } from './board.ts';
import {
  advanceClock,
  initializeRun,
  chooseCheckpointOption,
  pickRunBoon,
  setSelectedAction,
  trySwap,
  type CampaignResolution,
  type CampaignRunState,
  type PlayerBonuses,
} from './engine.ts';
import type { CheckpointOptionId, RunBoonId } from '../campaignData.ts';
import type { BoardResolutionResult, Cell } from './types.ts';

interface MoveCandidate {
  from: Cell;
  to: Cell;
  rngSeed: number;
  turnPower: number;
  timerBonusMs: number;
  scoreDelta: number;
}

interface SimulatedRunResult {
  highestBattleReached: number;
  finalState: CampaignRunState;
}

interface AutoplayOptions {
  checkpointStyle?: 'boons' | 'resources';
}

const AUTOPLAY_SEEDS = Array.from({ length: 20 }, (_, index) => index + 1);
const MAX_AUTOPLAY_TURNS = 240;
// Approximate scene-time spent per resolved turn so timer pressure is represented in autoplay tests.
const TURN_TIME_SCALE = 8.2;

describe('MatchCrow balance milestones', () => {
  it('lets mixed builds reach the expected boss milestones', () => {
    const level5Mixed = countRunsReachingBattle(10, {
      maxHpBonus: 8,
      attackBonus: 3,
      guardBonus: 3,
      healBonus: 3,
    });
    const level10Mixed = countRunsReachingBattle(20, {
      maxHpBonus: 24,
      attackBonus: 6,
      guardBonus: 6,
      healBonus: 6,
    });
    const level15Mixed = countRunsReachingBattle(30, {
      maxHpBonus: 32,
      attackBonus: 12,
      guardBonus: 9,
      healBonus: 9,
    });

    expect(level5Mixed).toBeGreaterThanOrEqual(14);
    expect(level10Mixed).toBeGreaterThanOrEqual(14);
    expect(level15Mixed).toBeGreaterThanOrEqual(14);
  }, 30_000);

  it('makes boon-first checkpoint routing materially stronger than pure recovery routing', () => {
    const level5MixedWithBoons = countRunsReachingBattle(20, {
      maxHpBonus: 8,
      attackBonus: 3,
      guardBonus: 3,
      healBonus: 3,
    });
    const level5MixedResourcesOnly = countRunsReachingBattle(
      20,
      {
        maxHpBonus: 8,
        attackBonus: 3,
        guardBonus: 3,
        healBonus: 3,
      },
      { checkpointStyle: 'resources' },
    );

    expect(level5MixedWithBoons).toBeGreaterThan(level5MixedResourcesOnly);
    expect(level5MixedWithBoons - level5MixedResourcesOnly).toBeGreaterThanOrEqual(3);
  }, 30_000);
});

function countRunsReachingBattle(
  targetBattle: number,
  bonuses: PlayerBonuses,
  options?: AutoplayOptions,
): number {
  let successes = 0;

  for (const seed of AUTOPLAY_SEEDS) {
    const result = simulateAutoplayRun(seed, bonuses, targetBattle, options);

    if (result.highestBattleReached >= targetBattle) {
      successes += 1;
    }
  }

  return successes;
}

function simulateAutoplayRun(
  seed: number,
  bonuses: PlayerBonuses,
  targetBattle: number,
  options?: AutoplayOptions,
): SimulatedRunResult {
  let state = initializeRun(createSeededRng(seed), 0, bonuses);
  let highestBattleReached = getBattleProgressValue(state);

  for (let turnIndex = 0; turnIndex < MAX_AUTOPLAY_TURNS && state.phase !== 'ended'; turnIndex += 1) {
    if (highestBattleReached >= targetBattle) {
      break;
    }

    if (state.phase === 'checkpoint') {
      state = chooseCheckpointOption(
        state,
        chooseCheckpointOptionForAutoplay(state, options),
        createSeededRng(deriveDecisionSeed(seed, turnIndex, state.battleIndex)),
      );
      highestBattleReached = Math.max(highestBattleReached, getBattleProgressValue(state));
      continue;
    }

    if (state.phase === 'boon-draft' && state.boonDraft) {
      state = pickRunBoon(state, chooseRunBoonForAutoplay(state));
      highestBattleReached = Math.max(highestBattleReached, getBattleProgressValue(state));
      continue;
    }

    const action = chooseAutoplayAction(state);
    const move = chooseBestMove(state, seed, turnIndex);
    const resolution = trySwap(
      setSelectedAction(state, action),
      move.from,
      move.to,
      createSeededRng(move.rngSeed),
    );

    if (!resolution.accepted) {
      throw new Error(`Autoplay produced an illegal move at turn ${turnIndex}.`);
    }

    state = resolution.state;
    highestBattleReached = Math.max(highestBattleReached, getBattleProgressValue(state));

    if (state.phase !== 'battle') {
      continue;
    }

    const elapsedMs = estimateTurnElapsedMs(resolution);
    state = advanceClock(state, elapsedMs).state;
    highestBattleReached = Math.max(highestBattleReached, getBattleProgressValue(state));
  }

  return {
    highestBattleReached,
    finalState: state,
  };
}

function chooseAutoplayAction(state: CampaignRunState): 'attack' | 'defend' | 'heal' {
  const incomingAttackTotal = getIncomingAttackTotal(state);
  const hpRatio = state.player.currentHp / Math.max(1, state.player.maxHp);
  const significantShieldBreak =
    incomingAttackTotal > state.player.shield + Math.ceil(state.player.maxHp * 0.12);

  if (hpRatio <= 0.45) {
    return 'heal';
  }

  if (
    incomingAttackTotal >= Math.ceil(state.player.maxHp * 0.35) ||
    significantShieldBreak
  ) {
    return 'defend';
  }

  return 'attack';
}

function chooseBestMove(state: CampaignRunState, runSeed: number, turnIndex: number): MoveCandidate {
  const candidates = enumerateMoveCandidates(state, runSeed, turnIndex);

  if (candidates.length === 0) {
    throw new Error('Autoplay could not find a legal move.');
  }

  candidates.sort((left, right) => {
    if (right.turnPower !== left.turnPower) {
      return right.turnPower - left.turnPower;
    }

    if (right.timerBonusMs !== left.timerBonusMs) {
      return right.timerBonusMs - left.timerBonusMs;
    }

    if (right.scoreDelta !== left.scoreDelta) {
      return right.scoreDelta - left.scoreDelta;
    }

    if (left.from.row !== right.from.row) {
      return left.from.row - right.from.row;
    }

    if (left.from.col !== right.from.col) {
      return left.from.col - right.from.col;
    }

    if (left.to.row !== right.to.row) {
      return left.to.row - right.to.row;
    }

    return left.to.col - right.to.col;
  });

  return candidates[0];
}

function enumerateMoveCandidates(state: CampaignRunState, runSeed: number, turnIndex: number): MoveCandidate[] {
  const candidates: MoveCandidate[] = [];

  for (let row = 0; row < state.board.grid.length; row += 1) {
    for (let col = 0; col < state.board.grid[row].length; col += 1) {
      const directions = [
        { row: 0, col: 1 },
        { row: 1, col: 0 },
      ];

      for (const direction of directions) {
        const to = { row: row + direction.row, col: col + direction.col };

        if (
          to.row >= state.board.grid.length ||
          to.col >= state.board.grid[row].length
        ) {
          continue;
        }

        const rngSeed = deriveMoveSeed(runSeed, turnIndex, row, col, to.row, to.col);
        const boardResult = trySwapOnBoard(
          state.board,
          { row, col },
          to,
          createSeededRng(rngSeed),
        );

        if (!boardResult.accepted) {
          continue;
        }

        candidates.push({
          from: { row, col },
          to,
          rngSeed,
          turnPower: summarizeTurnPower(boardResult),
          timerBonusMs: boardResult.totalBonusTimeMs,
          scoreDelta: boardResult.totalScoreDelta,
        });
      }
    }
  }

  return candidates;
}

function summarizeTurnPower(boardResult: BoardResolutionResult): number {
  const totalTilesCleared = boardResult.steps.reduce(
    (sum, step) => sum + step.clearedCells.length,
    0,
  );
  const comboSteps = boardResult.steps.length;
  const bigMatchSteps = boardResult.steps.filter((step) => step.bigMatch).length;

  return totalTilesCleared + Math.max(0, comboSteps - 1) + 2 * bigMatchSteps;
}

function getIncomingAttackTotal(state: CampaignRunState): number {
  return state.enemies.reduce((sum, enemy) => {
    if (enemy.currentHp <= 0 || enemy.intent.type !== 'attack') {
      return sum;
    }

    return sum + enemy.intent.value;
  }, 0);
}

function chooseCheckpointOptionForAutoplay(
  state: CampaignRunState,
  options?: AutoplayOptions,
): CheckpointOptionId {
  if (options?.checkpointStyle === 'resources') {
    if (state.player.currentHp < state.player.maxHp) {
      return 'recover';
    }

    return 'bank-time';
  }

  const hpRatio = state.player.currentHp / Math.max(1, state.player.maxHp);

  if (hpRatio <= 0.55) {
    return 'recover';
  }

  if (state.battleTimerMs <= 12_000) {
    return 'bank-time';
  }

  return 'boon-draft';
}

function chooseRunBoonForAutoplay(state: CampaignRunState): RunBoonId {
  const hpRatio = state.player.currentHp / Math.max(1, state.player.maxHp);
  const isMajor = state.boonDraft?.tier === 'major';
  const options = state.boonDraft?.options ?? [];

  const priority = isMajor
    ? hpRatio <= 0.55
      ? (['unshaken', 'overwhelming-heart', 'royal-tempo'] as const)
      : (['overwhelming-heart', 'royal-tempo', 'unshaken'] as const)
    : state.battleTimerMs <= 12_000
      ? (['time-siphon', 'lucky-swing', 'big-feelings', 'first-crush', 'feather-bed', 'afterglow', 'soft-guard', 'cascade-kiss'] as const)
      : hpRatio <= 0.55
        ? (['feather-bed', 'afterglow', 'soft-guard', 'big-feelings', 'first-crush', 'time-siphon', 'lucky-swing', 'cascade-kiss'] as const)
        : (['big-feelings', 'first-crush', 'cascade-kiss', 'time-siphon', 'lucky-swing', 'feather-bed', 'afterglow', 'soft-guard'] as const);

  const fallback = options[0];

  if (!fallback) {
    throw new Error('Autoplay boon draft had no options.');
  }

  return priority.find((boonId) => options.includes(boonId)) ?? fallback;
}

function estimateTurnElapsedMs(resolution: CampaignResolution): number {
  const boardStepMs =
    resolution.boardResult?.steps.reduce((sum) => sum + 400, 0) ?? 0;
  const playerActionMs = resolution.events.some((event) => event.type === 'player-action')
    ? 420
    : 0;
  const enemyActionMs = resolution.events.reduce((sum, event) => {
    if (event.type !== 'enemy-action') {
      return sum;
    }

    return sum + (event.intentType === 'attack' ? 320 : 180);
  }, 0);
  const impactMs = resolution.events.reduce((sum, event) => {
    if (event.type === 'enemy-damaged' || event.type === 'player-damaged') {
      return sum + 120;
    }

    if (
      event.type === 'player-shield' ||
      event.type === 'player-heal' ||
      event.type === 'enemy-shield' ||
      event.type === 'enemy-heal'
    ) {
      return sum + 60;
    }

    return sum;
  }, 0);
  const clearMs = resolution.battleAdvanced ? 180 : 0;

  return Math.round(
    (140 + boardStepMs + playerActionMs + enemyActionMs + impactMs + clearMs) *
      TURN_TIME_SCALE,
  );
}

function getBattleProgressValue(state: CampaignRunState): number {
  return state.loopCount * 30 + state.battleIndex;
}

function deriveMoveSeed(
  runSeed: number,
  turnIndex: number,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
): number {
  let value = runSeed >>> 0;
  value = Math.imul(value ^ 0x9e3779b9, 1664525) >>> 0;
  value = Math.imul(value ^ turnIndex, 1013904223) >>> 0;
  value = Math.imul(value ^ (fromRow << 12) ^ (fromCol << 8) ^ (toRow << 4) ^ toCol, 2246822519) >>> 0;
  return value >>> 0;
}

function deriveDecisionSeed(runSeed: number, turnIndex: number, battleIndex: number): number {
  let value = runSeed >>> 0;
  value = Math.imul(value ^ 0x85ebca6b, 1664525) >>> 0;
  value = Math.imul(value ^ turnIndex, 1013904223) >>> 0;
  value = Math.imul(value ^ battleIndex, 2246822519) >>> 0;
  return value >>> 0;
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
