import { describe, expect, it } from 'vitest';
import {
  createBoardStateFromKinds,
  findMatchGroups,
  hasLegalMove,
  initializeBoard,
  trySwapOnBoard,
} from './board.ts';
import {
  createStateFromKinds,
  initializeRun,
  pickReward,
  skipSpecial,
  trySwap,
  useSpecial,
} from './engine.ts';
import type { Cell, TileKind } from './types.ts';

describe('MatchCrow hybrid engine', () => {
  it('initializes a board without starting matches and with at least one legal move', () => {
    const board = initializeBoard(createSeededRng(1));

    expect(findMatchGroups(board.grid)).toHaveLength(0);
    expect(hasLegalMove(board.grid)).toBe(true);
  });

  it('resolves a legal swap into board effects and enters the special window', () => {
    const state = initializeRun(createSeededRng(2));
    const swap = findFirstAcceptedSwap(state);

    expect(swap).not.toBeNull();

    if (!swap) {
      return;
    }

    expect(swap.result.accepted).toBe(true);
    expect(swap.result.state.phase).toBe('player_special_window');
    expect(swap.result.events.some((event) => event.type === 'board_step')).toBe(true);
  });

  it('rejects an adjacent swap that produces no match without advancing the turn', () => {
    const state = initializeRun(createSeededRng(3));
    const swap = findFirstRejectedSwap(state);

    expect(swap).not.toBeNull();

    if (!swap) {
      return;
    }

    expect(swap.result.accepted).toBe(false);
    expect(swap.result.state.phase).toBe('player_board_turn');
  });

  it('maps each tile kind to the intended combat payload', () => {
    const coinResult = trySwapOnBoard(
      createBoardStateFromKinds(buildSingleMatchBoard('coin', 'key')),
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      createSeededRng(11),
    );
    const buttonResult = trySwapOnBoard(
      createBoardStateFromKinds(buildSingleMatchBoard('button', 'coin')),
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      createSeededRng(12),
    );
    const ringResult = trySwapOnBoard(
      createBoardStateFromKinds(buildSingleMatchBoard('ring', 'trinket')),
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      createSeededRng(13),
    );
    const trinketResult = trySwapOnBoard(
      createBoardStateFromKinds(buildSingleMatchBoard('trinket', 'button')),
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      createSeededRng(14),
    );
    const keyResult = trySwapOnBoard(
      createBoardStateFromKinds(buildSingleMatchBoard('key', 'ring')),
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      createSeededRng(15),
    );

    expect(coinResult.steps[0]?.payload.damage).toBe(6);
    expect(buttonResult.steps[0]?.payload.guard).toBe(6);
    expect(ringResult.steps[0]?.payload.grit).toBe(1);
    expect(trinketResult.steps[0]?.payload.heal).toBe(6);
    expect(keyResult.steps[0]?.payload.weakPotency).toBe(1);
  });

  it('allows a special after the board settles and then resolves the enemy turn', () => {
    const state = createStateFromKinds(buildSingleMatchBoard('ring', 'coin'));
    const swap = trySwap(state, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(16));

    expect(swap.accepted).toBe(true);
    expect(swap.state.player.grit).toBe(2);

    const special = useSpecial(swap.state, 'feather-flurry', createSeededRng(17));

    expect(special.accepted).toBe(true);
    expect(special.state.phase).toBe('player_board_turn');
    expect(special.state.enemy.statuses.some((status) => status.id === 'bleed')).toBe(true);
  });

  it('offers rewards after a non-boss kill and advances to the next encounter', () => {
    const state = createStateFromKinds(buildSingleMatchBoard('coin', 'key'));
    state.enemy.hp = 5;

    const victory = trySwap(state, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(18));

    expect(victory.accepted).toBe(true);
    expect(victory.state.phase).toBe('reward');
    expect(victory.state.rewardOptions).toHaveLength(3);

    const reward = pickReward(victory.state, victory.state.rewardOptions[0]!.id, createSeededRng(19));

    expect(reward.accepted).toBe(true);
    expect(reward.state.phase).toBe('player_board_turn');
    expect(reward.state.encounterIndex).toBe(1);
    expect(reward.state.enemy.id).toBe('magpie');
    expect(findMatchGroups(reward.state.board.grid)).toHaveLength(0);
  });

  it('can end in defeat when the enemy answers after the special window', () => {
    const state = createStateFromKinds(buildSingleMatchBoard('button', 'coin'));
    state.player.hp = 1;

    const swap = trySwap(state, { row: 2, col: 0 }, { row: 2, col: 1 }, createSeededRng(20));
    const defeat = skipSpecial(swap.state, createSeededRng(21));

    expect(defeat.accepted).toBe(true);
    expect(defeat.state.phase).toBe('defeat');
    expect(defeat.events.some((event) => event.type === 'defeat')).toBe(true);
  });
});

function findFirstAcceptedSwap(state: ReturnType<typeof initializeRun>): {
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

        const result = trySwap(state, { row, col }, to, createSeededRng(7));

        if (result.accepted) {
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

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
