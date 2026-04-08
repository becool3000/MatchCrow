import { describe, expect, it } from 'vitest';
import { BOSS_BATTLE_TIMER_MS, NORMAL_BATTLE_TIMER_MS } from '../campaignData.ts';
import type { CheckpointOptionId, RunBoonId } from '../campaignData.ts';
import {
  advanceClock,
  chooseCheckpointOption,
  createStateFromKinds,
  pickRunBoon,
  setSelectedAction,
  skipBattle,
  trySwap,
  type CampaignRunState,
} from './engine.ts';
import type { TileKind } from './types.ts';

describe('MatchCrow campaign engine', () => {
  it('uses attack by default and scores on offensive turns', () => {
    const state = createStateFromKinds(buildSingleMatchBoard('coin', 'key'));
    const swap = trySwap(state, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(11));

    expect(swap.accepted).toBe(true);
    expect(swap.boardResult?.totalScoreDelta).toBeGreaterThan(0);
    expect(swap.state.score).toBe(swap.boardResult?.totalScoreDelta);
    expect(swap.timerBonusApplied).toBeGreaterThanOrEqual(0);
  });

  it('does not add score for defend or heal turns', () => {
    const defendState = setSelectedAction(createStateFromKinds(buildSingleMatchBoard('coin', 'key')), 'defend');
    const defendSwap = trySwap(defendState, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(2));

    expect(defendSwap.accepted).toBe(true);
    expect(defendSwap.state.score).toBe(0);
    expect(defendSwap.events.some((event) => event.type === 'player-shield' && event.amount > 0)).toBe(true);
    expect(defendSwap.state.selectedAction).toBe('defend');

    const healBase = createStateFromKinds(buildSingleMatchBoard('coin', 'key'), { currentHp: 30 });
    const healState = setSelectedAction(healBase, 'heal');
    const healSwap = trySwap(healState, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(3));

    expect(healSwap.accepted).toBe(true);
    expect(healSwap.state.score).toBe(0);
    expect(healSwap.events.some((event) => event.type === 'player-heal' && event.amount > 0)).toBe(true);
    expect(healSwap.state.selectedAction).toBe('heal');
  });

  it('auto-targets the weakest living enemy in paired battles', () => {
    const state = createStateFromKinds(buildSingleMatchBoard('coin', 'key'), { battleIndex: 3 });
    const firstEnemyId = state.enemies[0]?.id;
    const secondEnemyId = state.enemies[1]?.id;

    expect(firstEnemyId).toBeTruthy();
    expect(secondEnemyId).toBeTruthy();

    const mutableState = state as CampaignRunState;
    mutableState.enemies[0] = { ...mutableState.enemies[0], currentHp: 8 };
    mutableState.enemies[1] = { ...mutableState.enemies[1], currentHp: 1 };
    const result = trySwap(mutableState, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(6));

    expect(result.accepted).toBe(true);
    expect(result.events.some((event) => event.type === 'enemy-damaged' && event.enemyId === secondEnemyId)).toBe(true);
    expect(result.state.selectedTargetId).toBe(firstEnemyId);
  });

  it('ends the run when the battle timer expires', () => {
    const state = createStateFromKinds(buildSingleMatchBoard('coin', 'key'));
    const expired = advanceClock(state, NORMAL_BATTLE_TIMER_MS);

    expect(expired.state.phase).toBe('ended');
    expect(expired.state.runEndedReason).toBe('timeout');
    expect(expired.state.battleTimerMs).toBe(0);
  });

  it('uses boss timers on boss battles', () => {
    const normal = createStateFromKinds(buildSingleMatchBoard('coin', 'key'), { battleIndex: 1 });
    const boss = createStateFromKinds(buildSingleMatchBoard('coin', 'key'), { battleIndex: 10 });

    expect(normal.battleTimerMaxMs).toBe(NORMAL_BATTLE_TIMER_MS);
    expect(boss.battleTimerMaxMs).toBe(BOSS_BATTLE_TIMER_MS);
  });

  it('awards battle clear bonuses and loops after battle 30', () => {
    const state = createStateFromKinds(buildSingleMatchBoard('coin', 'key'), { battleIndex: 30, score: 500 });
    const mutable = state as CampaignRunState;
    mutable.enemies[0] = { ...mutable.enemies[0], currentHp: 1, maxHp: 1 };
    const result = trySwap(mutable, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(9));

    expect(result.accepted).toBe(true);
    expect(result.clearBonusAwarded).toBe(9_000);
    expect(result.state.battleIndex).toBe(1);
    expect(result.state.loopCount).toBe(1);
    expect(result.state.battleTimerMaxMs).toBe(NORMAL_BATTLE_TIMER_MS + BOSS_BATTLE_TIMER_MS);
  });

  it('carries leftover timer into the next battle', () => {
    const state = createStateFromKinds(buildSingleMatchBoard('coin', 'key'), {
      battleIndex: 9,
      battleTimerMs: 12_345,
      battleTimerMaxMs: NORMAL_BATTLE_TIMER_MS,
    });
    const mutable = state as CampaignRunState;
    mutable.enemies[0] = { ...mutable.enemies[0], currentHp: 1, maxHp: 1 };
    const result = trySwap(mutable, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(4));

    expect(result.accepted).toBe(true);
    expect(result.state.battleIndex).toBe(10);
    expect(result.state.battleTimerMs).toBe(BOSS_BATTLE_TIMER_MS + 12_345);
    expect(result.state.battleTimerMaxMs).toBe(BOSS_BATTLE_TIMER_MS + 12_345);
  });

  it('preserves the resolved board when advancing to the next battle', () => {
    const state = createStateFromKinds(buildSingleMatchBoard('coin', 'key'), { battleIndex: 9 });
    const mutable = state as CampaignRunState;
    mutable.enemies[0] = { ...mutable.enemies[0], currentHp: 1, maxHp: 1 };
    const result = trySwap(mutable, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(12));

    expect(result.accepted).toBe(true);
    expect(result.battleAdvanced).toBe(true);
    expect(result.boardResult?.board).toBeTruthy();
    expect(result.state.board).toBe(result.boardResult?.board);
  });

  it('enters a checkpoint after the configured regular battles', () => {
    const state = createStateFromKinds(buildSingleMatchBoard('coin', 'key'), { battleIndex: 3 });
    const mutable = state as CampaignRunState;
    mutable.enemies[0] = { ...mutable.enemies[0], currentHp: 0, maxHp: 14 };
    mutable.enemies[1] = { ...mutable.enemies[1], currentHp: 1, maxHp: 14 };
    const result = trySwap(mutable, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(14));

    expect(result.accepted).toBe(true);
    expect(result.state.phase).toBe('checkpoint');
    expect(result.state.battleIndex).toBe(4);
    expect(result.state.checkpointOptions).toEqual(['boon-draft', 'recover', 'bank-time']);
    expect(result.events.some((event) => event.type === 'checkpoint-ready')).toBe(true);
  });

  it('enters a major boon draft after boss clears and pauses the timer outside battle', () => {
    const state = createStateFromKinds(buildSingleMatchBoard('coin', 'key'), { battleIndex: 10 });
    const mutable = state as CampaignRunState;
    mutable.enemies[0] = { ...mutable.enemies[0], currentHp: 1, maxHp: 72 };
    const result = trySwap(mutable, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(15));
    const paused = advanceClock(result.state, 5_000);

    expect(result.accepted).toBe(true);
    expect(result.state.phase).toBe('boon-draft');
    expect(result.state.boonDraft?.tier).toBe('major');
    expect(result.state.boonDraft?.options.length).toBeGreaterThan(0);
    expect(paused.changed).toBe(false);
    expect(paused.state.battleTimerMs).toBe(result.state.battleTimerMs);
  });

  it('applies checkpoint recover and bank time before resuming battle', () => {
    const checkpointState = {
      ...createStateFromKinds(buildSingleMatchBoard('coin', 'key'), {
        battleIndex: 4,
        currentHp: 20,
        battleTimerMs: 12_000,
        battleTimerMaxMs: 12_000,
      }),
      phase: 'checkpoint' as const,
      enemies: [],
      checkpointOptions: ['boon-draft', 'recover', 'bank-time'] satisfies CheckpointOptionId[],
      selectedTargetId: null,
    };

    const recovered = chooseCheckpointOption(checkpointState, 'recover', createSeededRng(16));
    const banked = chooseCheckpointOption(checkpointState, 'bank-time', createSeededRng(17));

    expect(recovered.phase).toBe('battle');
    expect(recovered.player.currentHp).toBe(26);
    expect(banked.phase).toBe('battle');
    expect(banked.battleTimerMs).toBe(20_000);
  });

  it('stores picked run boons and applies their battle hooks', () => {
    const draftState = {
      ...createStateFromKinds(buildSingleMatchBoard('coin', 'key'), {
        battleIndex: 5,
      }),
      phase: 'boon-draft' as const,
      enemies: [],
      boonDraft: {
        tier: 'minor' as const,
        options: ['first-crush', 'feather-bed', 'afterglow'] satisfies RunBoonId[],
      },
      checkpointOptions: null,
      selectedTargetId: null,
    };

    const picked = pickRunBoon(draftState, 'first-crush');
    const baseline = createStateFromKinds(buildSingleMatchBoard('coin', 'key'), { battleIndex: 5 });
    const boosted = trySwap(picked, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(18));
    const normal = trySwap(baseline, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(18));
    const boostedDamage = boosted.events.find((event) => event.type === 'enemy-damaged');
    const normalDamage = normal.events.find((event) => event.type === 'enemy-damaged');

    expect(picked.runBoons['first-crush']).toBe(1);
    expect(picked.phase).toBe('battle');
    expect(boostedDamage?.type).toBe('enemy-damaged');
    expect(normalDamage?.type).toBe('enemy-damaged');
    if (boostedDamage?.type !== 'enemy-damaged' || normalDamage?.type !== 'enemy-damaged') {
      throw new Error('Expected damage events to exist.');
    }
    expect(boostedDamage.amount + boostedDamage.blocked).toBe(normalDamage.amount + normalDamage.blocked + 4);
  });

  it('applies boss-entry and boss-kill major boon hooks', () => {
    const bossState = createStateFromKinds(buildSingleMatchBoard('coin', 'key'), {
      battleIndex: 10,
      currentHp: 20,
      runBoons: { unshaken: 1, 'royal-tempo': 1 },
    });
    const mutable = bossState as CampaignRunState;
    mutable.enemies[0] = { ...mutable.enemies[0], currentHp: 1, maxHp: 72 };
    const result = trySwap(mutable, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(19));

    expect(bossState.player.shield).toBe(12);
    expect(bossState.battleFlags.healPowerBonus).toBe(6);
    expect(result.events.some((event) => event.type === 'player-heal' && event.amount > 0)).toBe(true);
    expect(result.timerBonusApplied).toBeGreaterThanOrEqual(8_000);
  });

  it('can skip to the next battle without changing score or rerolling the board', () => {
    const state = createStateFromKinds(buildSingleMatchBoard('coin', 'key'), {
      battleIndex: 9,
      score: 321,
      battleTimerMs: 9_000,
      battleTimerMaxMs: NORMAL_BATTLE_TIMER_MS,
    });
    const skipped = skipBattle(state);

    expect(skipped.battleIndex).toBe(10);
    expect(skipped.score).toBe(321);
    expect(skipped.board).toBe(state.board);
    expect(skipped.battleTimerMs).toBe(BOSS_BATTLE_TIMER_MS + 9_000);
  });
});

function buildSingleMatchBoard(kind: TileKind, blocker: TileKind): TileKind[][] {
  const rows: TileKind[][] = [
    ['key', 'coin', 'ring', 'button', 'trinket', 'key', 'coin', 'ring'],
    ['coin', 'ring', 'button', 'trinket', 'key', 'coin', 'ring', 'button'],
    ['ring', 'button', 'trinket', 'key', 'coin', 'ring', 'button', 'trinket'],
    ['button', 'trinket', 'key', 'coin', 'ring', 'button', 'trinket', 'key'],
    ['trinket', 'key', 'coin', 'ring', 'button', 'trinket', 'key', 'coin'],
    ['key', 'coin', 'ring', 'button', 'trinket', 'key', 'coin', 'ring'],
    ['coin', 'ring', 'button', 'trinket', 'key', 'coin', 'ring', 'button'],
    ['ring', 'button', 'trinket', 'key', 'coin', 'ring', 'button', 'trinket'],
  ];

  rows[0][0] = kind;
  rows[1][0] = kind;
  rows[2][0] = blocker;
  rows[2][1] = kind;
  if (rows[3][0] === kind) {
    rows[3][0] = blocker;
  }

  return rows;
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
