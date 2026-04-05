import {
  BOSS_BATTLE_TIMER_MS,
  ENEMY_DEFINITIONS,
  NORMAL_BATTLE_TIMER_MS,
  getBattleClearBonus,
  getBattleTimerMs,
  getEncounterDefinition,
  type EnemyId,
  type EnemyIntentPattern,
  type EnemyIntentType,
  type PlayerActionId,
  type RunEndedReason,
} from '../campaignData.ts';
import { DEFAULT_STATUS } from '../assets/manifest.ts';
import { DEFAULT_RUN_TILE_POOL } from '../tileCatalog.ts';
import { createBoardStateFromKinds, initializeBoard, trySwapOnBoard } from './board.ts';
import type { BoardResolutionResult, BoardState, Cell, TileKind } from './types.ts';

export interface PlayerBonuses {
  maxHpBonus: number;
  attackBonus: number;
  guardBonus: number;
  healBonus: number;
}

export interface PlayerRuntimeState extends PlayerBonuses {
  currentHp: number;
  maxHp: number;
  shield: number;
}

export interface EnemyRuntimeState {
  id: string;
  enemyId: EnemyId;
  name: string;
  title: string;
  currentHp: number;
  maxHp: number;
  shield: number;
  intentIndex: number;
  intent: EnemyIntentPattern;
  boss: boolean;
}

export interface CampaignRunState {
  phase: 'battle' | 'ended';
  battleIndex: number;
  loopCount: number;
  battleTimerMs: number;
  battleTimerMaxMs: number;
  board: BoardState;
  player: PlayerRuntimeState;
  enemies: EnemyRuntimeState[];
  selectedAction: PlayerActionId;
  selectedTargetId: string | null;
  score: number;
  highScore: number;
  lastMessage: string;
  runEndedReason: RunEndedReason | null;
}

export interface CampaignClockResult {
  state: CampaignRunState;
  changed: boolean;
  displayedSecondChanged: boolean;
  becameComplete: boolean;
}

export type CampaignEvent =
  | { type: 'player-action'; action: PlayerActionId; targetId?: string }
  | { type: 'player-shield'; amount: number }
  | { type: 'player-heal'; amount: number }
  | { type: 'enemy-damaged'; enemyId: string; amount: number; blocked: number; defeated: boolean }
  | { type: 'enemy-action'; enemyId: string; intentType: EnemyIntentType; amount: number }
  | { type: 'enemy-shield'; enemyId: string; amount: number }
  | { type: 'enemy-heal'; enemyId: string; amount: number }
  | { type: 'player-damaged'; amount: number; blocked: number; defeated: boolean }
  | { type: 'score'; amount: number }
  | { type: 'timer'; amount: number }
  | { type: 'battle-cleared'; bonus: number; battleIndex: number; nextBattleIndex: number; nextLoopCount: number }
  | { type: 'run-ended'; reason: RunEndedReason };

export interface CampaignResolution {
  accepted: boolean;
  reason?: string;
  state: CampaignRunState;
  boardResult?: BoardResolutionResult;
  events: CampaignEvent[];
  battleAdvanced: boolean;
  timerBonusApplied: number;
  clearBonusAwarded: number;
}

const PLAYER_BASE_MAX_HP = 40;

export function initializeRun(
  rng: () => number = Math.random,
  highScore = 0,
  bonuses: PlayerBonuses = createEmptyBonuses(),
): CampaignRunState {
  return createBattleState({
    battleIndex: 1,
    board: initializeBoard(rng, DEFAULT_RUN_TILE_POOL),
    highScore,
    loopCount: 0,
    player: createPlayerState(bonuses),
    score: 0,
  });
}

export function createStateFromKinds(
  kinds: TileKind[][],
  options: {
    battleIndex?: number;
    highScore?: number;
    loopCount?: number;
    score?: number;
    bonuses?: PlayerBonuses;
    currentHp?: number;
    battleTimerMs?: number;
    battleTimerMaxMs?: number;
  } = {},
): CampaignRunState {
  const bonuses = options.bonuses ?? createEmptyBonuses();
  const player = createPlayerState(bonuses);

  player.currentHp = Math.min(player.maxHp, options.currentHp ?? player.maxHp);

  return createBattleState({
    battleIndex: options.battleIndex ?? 1,
    board: createBoardStateFromKinds(kinds),
    highScore: options.highScore ?? 0,
    loopCount: options.loopCount ?? 0,
    player,
    score: options.score ?? 0,
    battleTimerMs: options.battleTimerMs,
    battleTimerMaxMs: options.battleTimerMaxMs,
  });
}

export function setSelectedAction(
  currentState: CampaignRunState,
  action: PlayerActionId,
): CampaignRunState {
  if (currentState.phase !== 'battle') {
    return currentState;
  }

  return {
    ...currentState,
    selectedAction: action,
    lastMessage: getActionSelectionMessage(action),
  };
}

export function retireRun(currentState: CampaignRunState): CampaignRunState {
  if (currentState.phase !== 'battle') {
    return currentState;
  }

  return endRun(currentState, 'retire', 'You retired and banked the run.');
}

export function skipBattle(currentState: CampaignRunState): CampaignRunState {
  if (currentState.phase !== 'battle') {
    return currentState;
  }

  return {
    ...advanceToNextBattle(currentState),
    lastMessage: 'Dev skip advanced to the next battle.',
  };
}

export function advanceClock(
  currentState: CampaignRunState,
  elapsedMs: number,
): CampaignClockResult {
  if (currentState.phase !== 'battle' || elapsedMs <= 0) {
    return {
      state: currentState,
      changed: false,
      displayedSecondChanged: false,
      becameComplete: false,
    };
  }

  const nextBattleTimerMs = Math.max(0, currentState.battleTimerMs - elapsedMs);
  const displayedSecondChanged =
    toDisplayedSeconds(currentState.battleTimerMs) !== toDisplayedSeconds(nextBattleTimerMs);

  if (nextBattleTimerMs === currentState.battleTimerMs) {
    return {
      state: currentState,
      changed: false,
      displayedSecondChanged,
      becameComplete: false,
    };
  }

  if (nextBattleTimerMs === 0) {
    return {
      state: endRun(currentState, 'timeout', 'The battle timer ran out.'),
      changed: true,
      displayedSecondChanged,
      becameComplete: true,
    };
  }

  return {
    state: {
      ...currentState,
      battleTimerMs: nextBattleTimerMs,
    },
    changed: true,
    displayedSecondChanged,
    becameComplete: false,
  };
}

export function trySwap(
  currentState: CampaignRunState,
  from: Cell,
  to: Cell,
  rng: () => number = Math.random,
): CampaignResolution {
  if (currentState.phase !== 'battle') {
    return rejectedResolution(currentState, currentState.lastMessage || 'The run is over.');
  }

  const boardResult = trySwapOnBoard(currentState.board, from, to, rng, DEFAULT_RUN_TILE_POOL);

  if (!boardResult.accepted) {
    return rejectedResolution(
      {
        ...currentState,
        lastMessage:
          boardResult.reason === 'not-adjacent'
            ? 'Only adjacent tiles can swap.'
            : 'That swap does not make a match.',
      },
      boardResult.reason === 'not-adjacent'
        ? 'Only adjacent tiles can swap.'
        : 'That swap does not make a match.',
    );
  }

  const events: CampaignEvent[] = [];
  const nextState = cloneState(currentState);
  nextState.board = boardResult.board;
  nextState.selectedTargetId = getWeakestLivingEnemyId(nextState.enemies);

  const turnSummary = summarizeBoardTurn(boardResult);
  const selectedAction = nextState.selectedAction;
  const selectedTargetId = nextState.selectedTargetId;
  let timerBonusApplied = 0;
  let clearBonusAwarded = 0;
  let battleAdvanced = false;

  if (selectedAction === 'attack') {
    const target = selectedTargetId ? nextState.enemies.find((enemy) => enemy.id === selectedTargetId) : undefined;

    if (!target) {
      return rejectedResolution(
        {
          ...currentState,
          lastMessage: 'No living target found.',
        },
        'No living target found.',
      );
    }

    const attackAmount = turnSummary.turnPower + nextState.player.attackBonus;
    const damageOutcome = applyDamage(target, attackAmount);

    events.push({
      type: 'player-action',
      action: selectedAction,
      targetId: target.id,
    });
    events.push({
      type: 'enemy-damaged',
      enemyId: target.id,
      amount: damageOutcome.appliedToHp,
      blocked: damageOutcome.absorbedByShield,
      defeated: target.currentHp <= 0,
    });

    nextState.score += boardResult.totalScoreDelta;
    nextState.highScore = Math.max(nextState.highScore, nextState.score);
    events.push({ type: 'score', amount: boardResult.totalScoreDelta });

    timerBonusApplied = boardResult.totalBonusTimeMs;
    nextState.battleTimerMs += timerBonusApplied;

    if (timerBonusApplied > 0) {
      events.push({ type: 'timer', amount: timerBonusApplied });
    }

    if (nextState.enemies.every((enemy) => enemy.currentHp <= 0)) {
      clearBonusAwarded = getBattleClearBonus(nextState.battleIndex);
      nextState.score += clearBonusAwarded;
      nextState.highScore = Math.max(nextState.highScore, nextState.score);
      events.push({ type: 'score', amount: clearBonusAwarded });
      battleAdvanced = true;
    }

    nextState.lastMessage = `Attack hit ${target.name} for ${attackAmount}.`;
  } else if (selectedAction === 'defend') {
    const shieldGain = turnSummary.turnPower + nextState.player.guardBonus;
    nextState.player.shield += shieldGain;
    events.push({ type: 'player-action', action: 'defend' });
    events.push({ type: 'player-shield', amount: shieldGain });
    nextState.lastMessage = `Defend gained ${shieldGain} shield.`;
  } else {
    const requestedHeal = Math.ceil(turnSummary.turnPower * 0.75) + nextState.player.healBonus;
    const healAmount = Math.max(0, Math.min(requestedHeal, nextState.player.maxHp - nextState.player.currentHp));
    nextState.player.currentHp += healAmount;
    events.push({ type: 'player-action', action: 'heal' });
    events.push({ type: 'player-heal', amount: healAmount });
    nextState.lastMessage = healAmount > 0 ? `Heal restored ${healAmount} HP.` : 'Heal found no missing HP.';
  }

  if (battleAdvanced) {
    events.push({
      type: 'battle-cleared',
      bonus: clearBonusAwarded,
      battleIndex: nextState.battleIndex,
      nextBattleIndex: nextState.battleIndex === 30 ? 1 : nextState.battleIndex + 1,
      nextLoopCount: nextState.battleIndex === 30 ? nextState.loopCount + 1 : nextState.loopCount,
    });
    const advancedState = advanceToNextBattle(nextState);

    return {
      accepted: true,
      state: advancedState,
      boardResult,
      events,
      battleAdvanced: true,
      timerBonusApplied,
      clearBonusAwarded,
    };
  }

  applyEnemyTurn(nextState, events);
  nextState.selectedTargetId = getWeakestLivingEnemyId(nextState.enemies);

  if (nextState.player.currentHp <= 0) {
    const endedState = endRun(nextState, 'defeat', 'The flock has fallen.');
    events.push({ type: 'run-ended', reason: 'defeat' });

    return {
      accepted: true,
      state: endedState,
      boardResult,
      events,
      battleAdvanced: false,
      timerBonusApplied,
      clearBonusAwarded,
    };
  }

  return {
    accepted: true,
    state: nextState,
    boardResult,
    events,
    battleAdvanced: false,
    timerBonusApplied,
    clearBonusAwarded,
  };
}

function createBattleState(options: {
  battleIndex: number;
  loopCount: number;
  board: BoardState;
  player: PlayerRuntimeState;
  score: number;
  highScore: number;
  battleTimerMs?: number;
  battleTimerMaxMs?: number;
}): CampaignRunState {
  const enemies = createEncounterEnemies(options.battleIndex, options.loopCount);
  const battleTimerMaxMs = options.battleTimerMaxMs ?? getBattleTimerMs(options.battleIndex);
  const selectedTargetId = getWeakestLivingEnemyId(enemies);

  return {
    phase: 'battle',
    battleIndex: options.battleIndex,
    loopCount: options.loopCount,
    battleTimerMs: options.battleTimerMs ?? battleTimerMaxMs,
    battleTimerMaxMs,
    board: options.board,
    player: options.player,
    enemies,
    selectedAction: 'attack',
    selectedTargetId,
    score: options.score,
    highScore: Math.max(options.highScore, options.score),
    lastMessage: buildBattleIntroMessage(options.battleIndex, options.loopCount, enemies),
    runEndedReason: null,
  };
}

function createPlayerState(bonuses: PlayerBonuses): PlayerRuntimeState {
  const maxHp = PLAYER_BASE_MAX_HP + bonuses.maxHpBonus;

  return {
    ...bonuses,
    currentHp: maxHp,
    maxHp,
    shield: 0,
  };
}

function createEncounterEnemies(battleIndex: number, loopCount: number): EnemyRuntimeState[] {
  const encounter = getEncounterDefinition(battleIndex);

  return encounter.enemyIds.map((enemyId, index) => {
    const definition = ENEMY_DEFINITIONS[enemyId];
    const scaledMaxHp = Math.round(definition.maxHp * (1 + 0.18 * loopCount));

    return {
      id: `battle-${battleIndex}-enemy-${index}`,
      enemyId,
      name: definition.name,
      title: definition.title,
      currentHp: scaledMaxHp,
      maxHp: scaledMaxHp,
      shield: 0,
      intentIndex: 0,
      intent: scaleIntent(definition, 0, loopCount, scaledMaxHp, scaledMaxHp),
      boss: Boolean(definition.boss),
    };
  });
}

function summarizeBoardTurn(boardResult: BoardResolutionResult): {
  totalTilesCleared: number;
  comboSteps: number;
  bigMatchSteps: number;
  hasBigMatch: boolean;
  turnPower: number;
} {
  const totalTilesCleared = boardResult.steps.reduce((sum, step) => sum + step.clearedCells.length, 0);
  const comboSteps = boardResult.steps.length;
  const bigMatchSteps = boardResult.steps.filter((step) => step.bigMatch).length;

  return {
    totalTilesCleared,
    comboSteps,
    bigMatchSteps,
    hasBigMatch: bigMatchSteps > 0,
    turnPower: totalTilesCleared + Math.max(0, comboSteps - 1) + 2 * bigMatchSteps,
  };
}

function applyEnemyTurn(state: CampaignRunState, events: CampaignEvent[]): void {
  state.enemies.forEach((enemy) => {
    if (enemy.currentHp <= 0 || state.player.currentHp <= 0) {
      return;
    }

    const definition = ENEMY_DEFINITIONS[enemy.enemyId];

    if (definition.passive === 'queen-shield') {
      const shieldAmount = definition.passiveShieldAmount ?? 0;
      enemy.shield += shieldAmount;
      events.push({ type: 'enemy-shield', enemyId: enemy.id, amount: shieldAmount });
    }

    const intent = enemy.intent;
    events.push({ type: 'enemy-action', enemyId: enemy.id, intentType: intent.type, amount: intent.value });

    if (intent.type === 'attack') {
      const damageOutcome = applyDamageToPlayer(state.player, intent.value);
      events.push({
        type: 'player-damaged',
        amount: damageOutcome.appliedToHp,
        blocked: damageOutcome.absorbedByShield,
        defeated: state.player.currentHp <= 0,
      });
    } else if (intent.type === 'guard') {
      const guardGain = definition.passive === 'ant-double-guard' ? intent.value * 2 : intent.value;
      enemy.shield += guardGain;
      events.push({ type: 'enemy-shield', enemyId: enemy.id, amount: guardGain });
    } else {
      const healAmount = Math.max(0, Math.min(intent.value, enemy.maxHp - enemy.currentHp));
      enemy.currentHp += healAmount;
      events.push({ type: 'enemy-heal', enemyId: enemy.id, amount: healAmount });
    }

    enemy.intentIndex = (enemy.intentIndex + 1) % definition.intentPattern.length;
    enemy.intent = scaleIntent(definition, enemy.intentIndex, state.loopCount, enemy.currentHp, enemy.maxHp);
  });

  if (state.player.currentHp > 0) {
    state.lastMessage = `Battle ${state.battleIndex} continues.`;
  }
}

function scaleIntent(
  definition: (typeof ENEMY_DEFINITIONS)[EnemyId],
  intentIndex: number,
  loopCount: number,
  currentHp: number,
  maxHp: number,
): EnemyIntentPattern {
  const baseIntent = definition.intentPattern[intentIndex] ?? definition.intentPattern[0];
  let value = baseIntent.value + loopCount;

  if (
    definition.passive === 'crow-enrage' &&
    currentHp <= maxHp / 2 &&
    (baseIntent.type === 'attack' || baseIntent.type === 'heal')
  ) {
    value += definition.enrageBonus ?? 0;
  }

  return {
    ...baseIntent,
    value,
    label: formatIntentLabel(baseIntent.type, value),
  };
}

function formatIntentLabel(type: EnemyIntentType, value: number): string {
  if (type === 'attack') {
    return `Attack ${value}`;
  }

  if (type === 'guard') {
    return `Guard ${value}`;
  }

  return `Heal ${value}`;
}

function applyDamage(
  enemy: EnemyRuntimeState,
  amount: number,
): { absorbedByShield: number; appliedToHp: number } {
  const absorbedByShield = Math.min(enemy.shield, amount);
  enemy.shield -= absorbedByShield;
  const appliedToHp = Math.max(0, amount - absorbedByShield);
  enemy.currentHp = Math.max(0, enemy.currentHp - appliedToHp);

  return {
    absorbedByShield,
    appliedToHp,
  };
}

function applyDamageToPlayer(
  player: PlayerRuntimeState,
  amount: number,
): { absorbedByShield: number; appliedToHp: number } {
  const absorbedByShield = Math.min(player.shield, amount);
  player.shield -= absorbedByShield;
  const appliedToHp = Math.max(0, amount - absorbedByShield);
  player.currentHp = Math.max(0, player.currentHp - appliedToHp);

  return {
    absorbedByShield,
    appliedToHp,
  };
}

function advanceToNextBattle(currentState: CampaignRunState): CampaignRunState {
  const nextBattleIndex = currentState.battleIndex === 30 ? 1 : currentState.battleIndex + 1;
  const nextLoopCount = currentState.battleIndex === 30 ? currentState.loopCount + 1 : currentState.loopCount;
  const carriedBattleTimerMs = currentState.battleTimerMs;
  const nextBattleTimerMs = getBattleTimerMs(nextBattleIndex) + carriedBattleTimerMs;

  return {
    ...createBattleState({
      battleIndex: nextBattleIndex,
      board: currentState.board,
      highScore: currentState.highScore,
      loopCount: nextLoopCount,
      player: {
        ...currentState.player,
        shield: 0,
      },
      score: currentState.score,
      battleTimerMs: nextBattleTimerMs,
      battleTimerMaxMs: nextBattleTimerMs,
    }),
  };
}

function endRun(
  currentState: CampaignRunState,
  reason: RunEndedReason,
  message: string,
): CampaignRunState {
  return {
    ...currentState,
    phase: 'ended',
    battleTimerMs: 0,
    runEndedReason: reason,
    lastMessage: message,
  };
}

function rejectedResolution(state: CampaignRunState, reason: string): CampaignResolution {
  return {
    accepted: false,
    reason,
    state,
    events: [],
    battleAdvanced: false,
    timerBonusApplied: 0,
    clearBonusAwarded: 0,
  };
}

function cloneState(currentState: CampaignRunState): CampaignRunState {
  return {
    ...currentState,
    board: currentState.board,
    player: { ...currentState.player },
    enemies: currentState.enemies.map((enemy) => ({ ...enemy, intent: { ...enemy.intent } })),
  };
}

function createEmptyBonuses(): PlayerBonuses {
  return {
    maxHpBonus: 0,
    attackBonus: 0,
    guardBonus: 0,
    healBonus: 0,
  };
}

function buildBattleIntroMessage(
  battleIndex: number,
  loopCount: number,
  enemies: EnemyRuntimeState[],
): string {
  const enemyText = enemies.map((enemy) => enemy.name).join(' and ');
  const loopLabel = loopCount > 0 ? ` Loop ${loopCount + 1}.` : '';

  return `Battle ${battleIndex}: ${enemyText}.${loopLabel} ${DEFAULT_STATUS}`;
}

function getActionSelectionMessage(action: PlayerActionId): string {
  if (action === 'attack') {
    return 'Attack selected. Make a match to deal damage.';
  }

  if (action === 'defend') {
    return 'Defend selected. Make a match to build shield.';
  }

  if (action === 'heal') {
    return 'Heal selected. Make a match to restore HP.';
  }

  return DEFAULT_STATUS;
}

function toDisplayedSeconds(timeRemainingMs: number): number {
  return Math.ceil(Math.max(0, timeRemainingMs) / 1_000);
}

function getWeakestLivingEnemyId(enemies: EnemyRuntimeState[]): string | null {
  let weakest: EnemyRuntimeState | null = null;

  for (const enemy of enemies) {
    if (enemy.currentHp <= 0) {
      continue;
    }

    if (!weakest || enemy.currentHp < weakest.currentHp) {
      weakest = enemy;
    }
  }

  return weakest?.id ?? null;
}

export { BOSS_BATTLE_TIMER_MS, NORMAL_BATTLE_TIMER_MS };
