import {
  advanceClock,
  createStateFromKinds,
  initializeRun,
  trySwap,
  type MatchCrowClockResult,
  type MatchCrowResolution,
  type MatchCrowState,
} from './simulation/engine.ts';
import type { Cell, TileKind } from './simulation/types.ts';
import { getSubmitEligibility, normalizeInitials } from '../services/leaderboard.ts';

type RestartListener = (state: MatchCrowState) => void;

const HIGH_SCORE_STORAGE_KEY = 'matchcrow.high-score';
const PLAYER_ID_STORAGE_KEY = 'matchcrow.player-id';
const LAST_SUBMITTED_SCORE_STORAGE_KEY = 'matchcrow.last-submitted-score';
const LAST_SUBMITTED_INITIALS_STORAGE_KEY = 'matchcrow.last-submitted-initials';

export interface MatchCrowLeaderboardState {
  playerId: string;
  lastSubmittedScore: number;
  lastSubmittedInitials: string;
  canSubmit: boolean;
  submitReason?: string;
}

export interface MatchCrowViewState extends MatchCrowState {
  leaderboard: MatchCrowLeaderboardState;
}

export class CrowsCacheGame {
  private readonly rng: () => number;
  private state: MatchCrowState;
  private readonly restartListeners = new Set<RestartListener>();
  private highScore = 0;
  private readonly playerId: string;
  private lastSubmittedScore: number;
  private lastSubmittedInitials: string;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
    this.highScore = readNumber(HIGH_SCORE_STORAGE_KEY);
    this.playerId = readOrCreatePlayerId();
    this.lastSubmittedScore = readNumber(LAST_SUBMITTED_SCORE_STORAGE_KEY);
    this.lastSubmittedInitials = readString(LAST_SUBMITTED_INITIALS_STORAGE_KEY);
    this.state = initializeRun(this.rng, this.highScore);
  }

  getState(): MatchCrowState {
    return this.state;
  }

  getViewState(): MatchCrowViewState {
    const submitEligibility = getSubmitEligibility(this.state.highScore, this.lastSubmittedScore);
    const canSubmit = submitEligibility.canSubmit && this.state.runComplete;
    const submitReason = canSubmit
      ? undefined
      : !this.state.runComplete && this.state.highScore > 0
        ? 'Finish the run before posting.'
        : submitEligibility.reason;

    return {
      ...this.state,
      leaderboard: {
        playerId: this.playerId,
        lastSubmittedScore: this.lastSubmittedScore,
        lastSubmittedInitials: this.lastSubmittedInitials,
        canSubmit,
        submitReason,
      },
    };
  }

  advanceClock(elapsedMs: number): MatchCrowClockResult {
    const result = advanceClock(this.state, elapsedMs);

    if (result.changed) {
      this.state = result.state;
    }

    return result;
  }

  trySwap(from: Cell, to: Cell): MatchCrowResolution {
    const result = trySwap(this.state, from, to, this.rng);

    if (result.accepted) {
      this.state = result.state;
      this.syncHighScore();
    }

    return result;
  }

  restart(): MatchCrowState {
    this.highScore = Math.max(this.highScore, this.state.highScore);
    this.state = initializeRun(this.rng, this.highScore);
    this.restartListeners.forEach((listener) => listener(this.state));
    this.syncHighScore();
    return this.state;
  }

  onRestart(listener: RestartListener): () => void {
    this.restartListeners.add(listener);

    return () => {
      this.restartListeners.delete(listener);
    };
  }

  createStateFromKinds(kinds: TileKind[][]): MatchCrowState {
    return createStateFromKinds(kinds, this.highScore);
  }

  recordSubmittedScore(initials: string, score: number): void {
    const nextInitials = normalizeInitials(initials);

    if (score > this.lastSubmittedScore) {
      this.lastSubmittedScore = score;
      writeNumber(LAST_SUBMITTED_SCORE_STORAGE_KEY, this.lastSubmittedScore);
    }

    if (nextInitials.length === 3) {
      this.lastSubmittedInitials = nextInitials;
      writeString(LAST_SUBMITTED_INITIALS_STORAGE_KEY, this.lastSubmittedInitials);
    }
  }

  private syncHighScore(): void {
    if (this.state.highScore <= this.highScore) {
      return;
    }

    this.highScore = this.state.highScore;
    writeNumber(HIGH_SCORE_STORAGE_KEY, this.highScore);
  }
}

function readNumber(storageKey: string): number {
  try {
    if (typeof window === 'undefined') {
      return 0;
    }

    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? Number.parseInt(raw, 10) : 0;

    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  } catch {
    return 0;
  }
}

function writeNumber(storageKey: string, value: number): void {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(storageKey, `${Math.max(0, value)}`);
  } catch {
    // Ignore storage failures in private browsing or test environments.
  }
}

function readString(storageKey: string): string {
  try {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.localStorage.getItem(storageKey) ?? '';
  } catch {
    return '';
  }
}

function writeString(storageKey: string, value: string): void {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(storageKey, value);
  } catch {
    // Ignore storage failures in private browsing or test environments.
  }
}

function readOrCreatePlayerId(): string {
  const existing = readString(PLAYER_ID_STORAGE_KEY);

  if (existing) {
    return existing;
  }

  const nextId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `player-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  writeString(PLAYER_ID_STORAGE_KEY, nextId);
  return nextId;
}
