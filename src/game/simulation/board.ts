import {
  GRID_SIZE,
  TILE_KINDS,
  type BoardCombatPayload,
  type BoardResolutionResult,
  type BoardResolveStep,
  type BoardState,
  type Cell,
  type MatchGroup,
  type SpawnedTile,
  type Tile,
  type TileCounts,
  type TileKind,
  type TileMove,
} from './types.ts';

export function initializeBoard(rng: () => number = Math.random): BoardState {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const board: BoardState = {
      grid: Array.from({ length: GRID_SIZE }, () => Array<Tile | null>(GRID_SIZE).fill(null)),
      nextTileId: 1,
    };

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const excluded = new Set<TileKind>();
        const leftA = col >= 1 ? board.grid[row][col - 1]?.kind : undefined;
        const leftB = col >= 2 ? board.grid[row][col - 2]?.kind : undefined;
        const upA = row >= 1 ? board.grid[row - 1][col]?.kind : undefined;
        const upB = row >= 2 ? board.grid[row - 2][col]?.kind : undefined;

        if (leftA && leftA === leftB) {
          excluded.add(leftA);
        }

        if (upA && upA === upB) {
          excluded.add(upA);
        }

        const kind = pickKind(excluded, rng);
        board.grid[row][col] = createTile(board, kind);
      }
    }

    if (hasLegalMove(board.grid)) {
      return board;
    }
  }

  throw new Error('Failed to initialize a playable MatchCrow board.');
}

export function createBoardStateFromKinds(kinds: TileKind[][]): BoardState {
  const board: BoardState = {
    grid: Array.from({ length: GRID_SIZE }, () => Array<Tile | null>(GRID_SIZE).fill(null)),
    nextTileId: 1,
  };

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      board.grid[row][col] = createTile(board, kinds[row][col]);
    }
  }

  return board;
}

export function cloneBoardState(board: BoardState): BoardState {
  return {
    nextTileId: board.nextTileId,
    grid: board.grid.map((row) => row.map((tile) => (tile ? { ...tile } : null))),
  };
}

export function trySwapOnBoard(
  board: BoardState,
  from: Cell,
  to: Cell,
  rng: () => number = Math.random,
): BoardResolutionResult {
  if (!isOrthogonallyAdjacent(from, to)) {
    return {
      accepted: false,
      reason: 'not-adjacent',
      board,
      swap: { from, to },
      steps: [],
      totalPayload: createEmptyPayload(),
      totalScoreDelta: 0,
      reshuffled: false,
      reshuffleMoves: [],
    };
  }

  const working = cloneBoardState(board);
  swapTiles(working.grid, from, to);

  if (findMatchGroups(working.grid).length === 0) {
    return {
      accepted: false,
      reason: 'no-match',
      board,
      swap: { from, to },
      steps: [],
      totalPayload: createEmptyPayload(),
      totalScoreDelta: 0,
      reshuffled: false,
      reshuffleMoves: [],
    };
  }

  const steps: BoardResolveStep[] = [];
  const totalPayload = createEmptyPayload();
  let totalScoreDelta = 0;
  let reshuffled = false;
  let reshuffleMoves: TileMove[] = [];
  let stepIndex = 0;

  while (true) {
    const matches = findMatchGroups(working.grid);

    if (matches.length === 0) {
      break;
    }

    const clearedCells = collectClearedCells(matches);
    const clearedTileIds: string[] = [];
    const clearedCounts = createEmptyCounts();

    clearedCells.forEach((cell) => {
      const tile = working.grid[cell.row][cell.col];

      if (!tile) {
        return;
      }

      clearedTileIds.push(tile.id);
      clearedCounts[tile.kind] += 1;
      working.grid[cell.row][cell.col] = null;
    });

    const droppedTiles = applyGravity(working.grid);
    const spawnedTiles = refillBoard(working, rng);
    const multiplier = Math.min(3, stepIndex + 1);
    const payload = countsToPayload(clearedCounts, multiplier);
    const scoreDelta = payload.totalCleared * 10;

    totalPayload.damage += payload.damage;
    totalPayload.guard += payload.guard;
    totalPayload.grit += payload.grit;
    totalPayload.heal += payload.heal;
    totalPayload.weakPotency += payload.weakPotency;
    totalPayload.totalCleared += payload.totalCleared;
    totalPayload.multiplier = payload.multiplier;
    totalScoreDelta += scoreDelta;

    steps.push({
      matches,
      clearedCells,
      clearedTileIds,
      clearedCounts,
      droppedTiles,
      spawnedTiles,
      payload,
      scoreDelta,
      bigMatch: payload.totalCleared >= 4,
    });

    stepIndex += 1;
  }

  if (!hasLegalMove(working.grid)) {
    const reshuffle = reshuffleBoard(working, rng);
    reshuffled = true;
    reshuffleMoves = reshuffle.moves;
    working.grid = reshuffle.board.grid;
    working.nextTileId = reshuffle.board.nextTileId;
  }

  return {
    accepted: true,
    board: working,
    swap: { from, to },
    steps,
    totalPayload,
    totalScoreDelta,
    reshuffled,
    reshuffleMoves,
  };
}

export function reshuffleBoard(
  board: BoardState,
  rng: () => number = Math.random,
): { board: BoardState; moves: TileMove[] } {
  const tiles = board.grid.flat().filter((tile): tile is Tile => tile !== null).map((tile) => ({ ...tile }));
  const originalPositions = new Map<string, Cell>();

  board.grid.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      if (tile) {
        originalPositions.set(tile.id, { row: rowIndex, col: colIndex });
      }
    });
  });

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const shuffled = [...tiles];
    shuffleInPlace(shuffled, rng);

    const candidate: BoardState = {
      nextTileId: board.nextTileId,
      grid: Array.from({ length: GRID_SIZE }, () => Array<Tile | null>(GRID_SIZE).fill(null)),
    };
    const moves: TileMove[] = [];

    shuffled.forEach((tile, index) => {
      const row = Math.floor(index / GRID_SIZE);
      const col = index % GRID_SIZE;
      const from = originalPositions.get(tile.id);

      candidate.grid[row][col] = tile;

      if (from) {
        moves.push({
          tileId: tile.id,
          kind: tile.kind,
          from,
          to: { row, col },
        });
      }
    });

    if (findMatchGroups(candidate.grid).length === 0 && hasLegalMove(candidate.grid)) {
      return { board: candidate, moves };
    }
  }

  return {
    board: cloneBoardState(board),
    moves: [],
  };
}

export function findMatchGroups(grid: (Tile | null)[][]): MatchGroup[] {
  const rawGroups: MatchGroup[] = [];

  for (let row = 0; row < GRID_SIZE; row += 1) {
    let col = 0;

    while (col < GRID_SIZE) {
      const tile = grid[row][col];

      if (!tile) {
        col += 1;
        continue;
      }

      let runEnd = col + 1;

      while (runEnd < GRID_SIZE && grid[row][runEnd]?.kind === tile.kind) {
        runEnd += 1;
      }

      if (runEnd - col >= 3) {
        rawGroups.push({
          kind: tile.kind,
          cells: Array.from({ length: runEnd - col }, (_, index) => ({ row, col: col + index })),
        });
      }

      col = runEnd;
    }
  }

  for (let col = 0; col < GRID_SIZE; col += 1) {
    let row = 0;

    while (row < GRID_SIZE) {
      const tile = grid[row][col];

      if (!tile) {
        row += 1;
        continue;
      }

      let runEnd = row + 1;

      while (runEnd < GRID_SIZE && grid[runEnd][col]?.kind === tile.kind) {
        runEnd += 1;
      }

      if (runEnd - row >= 3) {
        rawGroups.push({
          kind: tile.kind,
          cells: Array.from({ length: runEnd - row }, (_, index) => ({ row: row + index, col })),
        });
      }

      row = runEnd;
    }
  }

  return mergeOverlappingGroups(rawGroups);
}

export function hasLegalMove(grid: (Tile | null)[][]): boolean {
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const directions: Cell[] = [
        { row, col: col + 1 },
        { row: row + 1, col },
      ];

      for (const to of directions) {
        if (to.row >= GRID_SIZE || to.col >= GRID_SIZE) {
          continue;
        }

        const cloned = grid.map((gridRow) => [...gridRow]);
        swapTiles(cloned, { row, col }, to);

        if (findMatchGroups(cloned).length > 0) {
          return true;
        }
      }
    }
  }

  return false;
}

export function kindsFromGrid(grid: (Tile | null)[][]): (TileKind | null)[][] {
  return grid.map((row) => row.map((tile) => tile?.kind ?? null));
}

export function createEmptyCounts(): TileCounts {
  return {
    key: 0,
    coin: 0,
    ring: 0,
    button: 0,
    trinket: 0,
  };
}

function createEmptyPayload(): BoardCombatPayload {
  return {
    damage: 0,
    guard: 0,
    grit: 0,
    heal: 0,
    weakPotency: 0,
    multiplier: 1,
    totalCleared: 0,
  };
}

function countsToPayload(counts: TileCounts, multiplier: number): BoardCombatPayload {
  const totalCleared = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const baseGrit = counts.ring > 0 ? Math.max(1, Math.floor(counts.ring / 3)) : 0;

  return {
    damage: counts.coin * 2 * multiplier,
    guard: counts.button * 2 * multiplier,
    grit: baseGrit * multiplier,
    heal: counts.trinket * 2 * multiplier,
    weakPotency: Math.ceil(counts.key / 3) * multiplier,
    multiplier,
    totalCleared,
  };
}

function createTile(board: BoardState, kind: TileKind): Tile {
  const tile: Tile = {
    id: `tile-${board.nextTileId}`,
    kind,
  };

  board.nextTileId += 1;

  return tile;
}

function pickKind(excluded: Set<TileKind>, rng: () => number): TileKind {
  const candidates = TILE_KINDS.filter((kind) => !excluded.has(kind));
  return candidates[Math.floor(rng() * candidates.length)] ?? TILE_KINDS[0];
}

function isOrthogonallyAdjacent(from: Cell, to: Cell): boolean {
  return Math.abs(from.row - to.row) + Math.abs(from.col - to.col) === 1;
}

function swapTiles(grid: (Tile | null)[][], from: Cell, to: Cell): void {
  const temp = grid[from.row][from.col];
  grid[from.row][from.col] = grid[to.row][to.col];
  grid[to.row][to.col] = temp;
}

function collectClearedCells(matches: MatchGroup[]): Cell[] {
  const keys = new Set<string>();
  const cells: Cell[] = [];

  matches.forEach((group) => {
    group.cells.forEach((cell) => {
      const key = `${cell.row}:${cell.col}`;

      if (keys.has(key)) {
        return;
      }

      keys.add(key);
      cells.push(cell);
    });
  });

  return cells;
}

function applyGravity(grid: (Tile | null)[][]): TileMove[] {
  const moves: TileMove[] = [];

  for (let col = 0; col < GRID_SIZE; col += 1) {
    let writeRow = GRID_SIZE - 1;

    for (let row = GRID_SIZE - 1; row >= 0; row -= 1) {
      const tile = grid[row][col];

      if (!tile) {
        continue;
      }

      if (row !== writeRow) {
        grid[writeRow][col] = tile;
        grid[row][col] = null;
        moves.push({
          tileId: tile.id,
          kind: tile.kind,
          from: { row, col },
          to: { row: writeRow, col },
        });
      }

      writeRow -= 1;
    }

    for (let row = writeRow; row >= 0; row -= 1) {
      grid[row][col] = null;
    }
  }

  return moves;
}

function refillBoard(board: BoardState, rng: () => number): SpawnedTile[] {
  const spawned: SpawnedTile[] = [];

  for (let col = 0; col < GRID_SIZE; col += 1) {
    let emptyRows = 0;

    for (let row = 0; row < GRID_SIZE; row += 1) {
      if (board.grid[row][col] === null) {
        emptyRows += 1;
      }
    }

    for (let row = 0; row < emptyRows; row += 1) {
      const tile = createTile(board, pickKind(new Set(), rng));
      board.grid[row][col] = tile;
      spawned.push({
        tile,
        fromRow: row - emptyRows,
        to: { row, col },
      });
    }
  }

  return spawned;
}

function mergeOverlappingGroups(groups: MatchGroup[]): MatchGroup[] {
  const merged: MatchGroup[] = [];

  groups.forEach((group) => {
    const overlaps: number[] = [];

    merged.forEach((existing, index) => {
      if (existing.kind !== group.kind) {
        return;
      }

      if (hasOverlap(existing.cells, group.cells)) {
        overlaps.push(index);
      }
    });

    if (overlaps.length === 0) {
      merged.push({
        kind: group.kind,
        cells: [...group.cells],
      });
      return;
    }

    const mergedCells = [...group.cells];

    overlaps
      .sort((a, b) => b - a)
      .forEach((index) => {
        mergedCells.push(...merged[index].cells);
        merged.splice(index, 1);
      });

    merged.push({
      kind: group.kind,
      cells: dedupeCells(mergedCells),
    });
  });

  return merged;
}

function hasOverlap(a: Cell[], b: Cell[]): boolean {
  const keys = new Set(a.map((cell) => `${cell.row}:${cell.col}`));
  return b.some((cell) => keys.has(`${cell.row}:${cell.col}`));
}

function dedupeCells(cells: Cell[]): Cell[] {
  const keys = new Set<string>();
  const unique: Cell[] = [];

  cells.forEach((cell) => {
    const key = `${cell.row}:${cell.col}`;

    if (keys.has(key)) {
      return;
    }

    keys.add(key);
    unique.push(cell);
  });

  return unique;
}

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const temp = items[index];
    items[index] = items[swapIndex];
    items[swapIndex] = temp;
  }
}
