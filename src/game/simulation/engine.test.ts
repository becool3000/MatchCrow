import { describe, expect, it } from 'vitest';
import { findMatchGroups, hasLegalMove, initializeBoard } from './board.ts';
import { advanceClock, createStateFromKinds, initializeRun, RUN_DURATION_MS, trySwap } from './engine.ts';
import type { Cell, TileKind } from './types.ts';

describe('MatchCrow match-3 engine', () => {
  it('initializes a board without starting matches and with at least one legal move', () => {
    const board = initializeBoard(createSeededRng(1));

    expect(findMatchGroups(board.grid)).toHaveLength(0);
    expect(hasLegalMove(board.grid)).toBe(true);
  });

  it('accepts a valid swap and increases score and high score', () => {
    const state = createStateFromKinds(buildSingleMatchBoard('coin', 'key'), 10);
    const swap = trySwap(state, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(11));

    expect(swap.accepted).toBe(true);
    expect(swap.result?.totalScoreDelta).toBeGreaterThan(0);
    expect(swap.state.score).toBe(swap.result?.totalScoreDelta);
    expect(swap.state.highScore).toBe(swap.state.score);
    expect(swap.state.lastMessage).toContain('Cleared');
  });

  it('rejects an adjacent swap that does not make a match', () => {
    const state = initializeRun(createSeededRng(3));
    const swap = findFirstRejectedSwap(state);

    expect(swap).not.toBeNull();

    if (!swap) {
      return;
    }

    expect(swap.result.accepted).toBe(false);
    expect(swap.result.state.score).toBe(state.score);
    expect(swap.result.reason).toBe('That swap does not make a match.');
  });

  it('updates a saved high score when the current score exceeds it', () => {
    const state = createStateFromKinds(buildSingleMatchBoard('ring', 'trinket'), 10);
    const swap = trySwap(state, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(16));

    expect(swap.accepted).toBe(true);
    expect(swap.state.score).toBeGreaterThan(10);
    expect(swap.state.highScore).toBe(swap.state.score);
  });

  it('ends the run when the timer expires and rejects later swaps', () => {
    const state = initializeRun(createSeededRng(21));
    const expired = advanceClock(state, RUN_DURATION_MS);

    expect(expired.state.runComplete).toBe(true);
    expect(expired.state.timeRemainingMs).toBe(0);
    expect(expired.state.lastMessage).toContain('Time is up');

    const swap = trySwap(expired.state, { row: 0, col: 0 }, { row: 0, col: 1 }, createSeededRng(22));

    expect(swap.accepted).toBe(false);
    expect(swap.reason).toContain('Time is up');
    expect(swap.state.runComplete).toBe(true);
  });

  it('awards bonus time for four-tile clears', () => {
    const state = createStateFromKinds(buildFourMatchBoard('coin', 'key'), 0);
    const swap = trySwap(state, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(23));

    expect(swap.accepted).toBe(true);
    expect(swap.result?.totalBonusTimeMs).toBe(2_000);
    expect(swap.state.timeRemainingMs).toBe(RUN_DURATION_MS + (swap.result?.totalBonusTimeMs ?? 0));
    expect(swap.state.lastMessage).toContain('bonus');
  });
});

function findFirstRejectedSwap(state: ReturnType<typeof initializeRun>): {
  from: Cell;
  to: Cell;
  result: ReturnType<typeof trySwap>;
} | null {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const directions: Cell[] = [
        { row, col: col + 1 },
        { row: row + 1, col },
      ];

      for (const to of directions) {
        if (to.row >= 8 || to.col >= 8) {
          continue;
        }

        const result = trySwap(state, { row, col }, to, createSeededRng(9));

        if (!result.accepted) {
          return {
            from: { row, col },
            to,
            result,
          };
        }
      }
    }
  }

  return null;
}

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

function buildFourMatchBoard(kind: TileKind, blocker: TileKind): TileKind[][] {
  const rows = buildSingleMatchBoard(kind, blocker);

  rows[3][0] = kind;
  rows[4][0] = blocker;

  return rows;
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
