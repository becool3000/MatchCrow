import { DEFAULT_STATUS } from '../assets/manifest.ts';
import {
  createBoardStateFromKinds,
  initializeBoard,
  trySwapOnBoard,
} from './board.ts';
import type {
  BoardResolutionResult,
  BoardState,
  Cell,
  TileKind,
} from './types.ts';

export const RUN_DURATION_MS = 60_000;
const RUN_COMPLETE_STATUS = 'Time is up. Reset to start another 1:00 run.';

export interface MatchCrowState {
  board: BoardState;
  score: number;
  highScore: number;
  lastMessage: string;
  timeRemainingMs: number;
  runComplete: boolean;
}

export interface MatchCrowResolution {
  accepted: boolean;
  reason?: string;
  state: MatchCrowState;
  result?: BoardResolutionResult;
  swap?: {
    from: Cell;
    to: Cell;
  };
}

export interface MatchCrowClockResult {
  state: MatchCrowState;
  changed: boolean;
  displayedSecondChanged: boolean;
  becameComplete: boolean;
}

export function initializeRun(
  rng: () => number = Math.random,
  highScore = 0,
): MatchCrowState {
  return {
    board: initializeBoard(rng),
    score: 0,
    highScore,
    lastMessage: DEFAULT_STATUS,
    timeRemainingMs: RUN_DURATION_MS,
    runComplete: false,
  };
}

export function createStateFromKinds(
  kinds: TileKind[][],
  highScore = 0,
): MatchCrowState {
  return {
    board: createBoardStateFromKinds(kinds),
    score: 0,
    highScore,
    lastMessage: DEFAULT_STATUS,
    timeRemainingMs: RUN_DURATION_MS,
    runComplete: false,
  };
}

export function advanceClock(
  currentState: MatchCrowState,
  elapsedMs: number,
): MatchCrowClockResult {
  if (currentState.runComplete || elapsedMs <= 0) {
    return {
      state: currentState,
      changed: false,
      displayedSecondChanged: false,
      becameComplete: false,
    };
  }

  const nextTimeRemainingMs = Math.max(0, currentState.timeRemainingMs - elapsedMs);
  const becameComplete = nextTimeRemainingMs === 0;
  const displayedSecondChanged =
    toDisplayedSeconds(currentState.timeRemainingMs) !== toDisplayedSeconds(nextTimeRemainingMs);

  if (nextTimeRemainingMs === currentState.timeRemainingMs) {
    return {
      state: currentState,
      changed: false,
      displayedSecondChanged,
      becameComplete: false,
    };
  }

  return {
    state: becameComplete
      ? {
          ...currentState,
          timeRemainingMs: 0,
          runComplete: true,
          lastMessage: RUN_COMPLETE_STATUS,
        }
      : {
          ...currentState,
          timeRemainingMs: nextTimeRemainingMs,
        },
    changed: true,
    displayedSecondChanged,
    becameComplete,
  };
}

export function trySwap(
  currentState: MatchCrowState,
  from: Cell,
  to: Cell,
  rng: () => number = Math.random,
): MatchCrowResolution {
  if (currentState.runComplete || currentState.timeRemainingMs <= 0) {
    return {
      accepted: false,
      reason: RUN_COMPLETE_STATUS,
      state: {
        ...currentState,
        timeRemainingMs: 0,
        runComplete: true,
        lastMessage: RUN_COMPLETE_STATUS,
      },
    };
  }

  const boardResult = trySwapOnBoard(currentState.board, from, to, rng);

  if (!boardResult.accepted) {
    return {
      accepted: false,
      reason:
        boardResult.reason === 'not-adjacent'
          ? 'Only adjacent tiles can swap.'
          : 'That swap does not make a match.',
      state: {
        ...currentState,
        lastMessage:
          boardResult.reason === 'not-adjacent'
            ? 'Only adjacent tiles can swap.'
            : 'That swap does not make a match.',
      },
      swap: boardResult.swap,
    };
  }

  const totalCleared = boardResult.steps.reduce((sum, step) => sum + step.clearedCells.length, 0);
  const comboCount = boardResult.steps.length;
  const nextScore = currentState.score + boardResult.totalScoreDelta;
  const nextHighScore = Math.max(currentState.highScore, nextScore);
  const nextTimeRemainingMs = currentState.timeRemainingMs + boardResult.totalBonusTimeMs;
  const boardMessage = buildBoardMessage(
    totalCleared,
    comboCount,
    boardResult.totalBonusTimeMs,
    boardResult.reshuffled,
  );

  return {
    accepted: true,
    state: {
      ...currentState,
      board: boardResult.board,
      score: nextScore,
      highScore: nextHighScore,
      lastMessage: boardMessage,
      timeRemainingMs: nextTimeRemainingMs,
      runComplete: false,
    },
    result: boardResult,
    swap: boardResult.swap,
  };
}

function buildBoardMessage(
  totalCleared: number,
  comboCount: number,
  bonusTimeMs: number,
  reshuffled: boolean,
): string {
  const comboText = comboCount > 1 ? ` Combo x${comboCount}!` : '';
  const bonusText = bonusTimeMs > 0 ? ` +${formatBonusSeconds(bonusTimeMs)}s bonus!` : '';
  const reshuffleText = reshuffled ? ' The board reshuffled.' : '';

  if (totalCleared <= 0) {
    return `${DEFAULT_STATUS}${reshuffleText}`.trim();
  }

  return `Cleared ${totalCleared} tiles.${comboText}${bonusText}${reshuffleText}`.trim();
}

function toDisplayedSeconds(timeRemainingMs: number): number {
  return Math.ceil(Math.max(0, timeRemainingMs) / 1_000);
}

function formatBonusSeconds(bonusTimeMs: number): string {
  const seconds = bonusTimeMs / 1_000;
  return Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1).replace(/\.0$/, '');
}
