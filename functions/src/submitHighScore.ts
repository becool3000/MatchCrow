export interface SubmitHighScoreInput {
  playerId: string;
  initials: string;
  score: number;
  level: number;
  battleReached: number;
  loopCount: number;
  endedBy: 'defeat' | 'retire' | 'timeout';
}

export interface StoredLeaderboardEntry {
  playerId: string;
  initials: string;
  score: number;
  level: number;
  battleReached: number;
  loopCount: number;
  endedBy: 'defeat' | 'retire' | 'timeout';
}

export interface SubmitHighScoreResult {
  accepted: boolean;
  replacedBest: boolean;
  score: number;
  initials: string;
}

export function normalizeInitials(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

export function validateSubmitHighScoreInput(input: SubmitHighScoreInput): SubmitHighScoreInput {
  const playerId = input.playerId.trim();
  const initials = normalizeInitials(input.initials);
  const score = input.score;

  if (!playerId) {
    throw new Error('Player ID is required.');
  }

  if (!/^[A-Z]{3}$/.test(initials)) {
    throw new Error('Initials must be exactly 3 letters.');
  }

  if (!Number.isSafeInteger(score) || score < 0) {
    throw new Error('Score must be a non-negative integer.');
  }

  if (!Number.isSafeInteger(input.level) || input.level < 1) {
    throw new Error('Level must be a positive integer.');
  }

  if (!Number.isSafeInteger(input.battleReached) || input.battleReached < 1) {
    throw new Error('Battle reached must be a positive integer.');
  }

  if (!Number.isSafeInteger(input.loopCount) || input.loopCount < 0) {
    throw new Error('Loop count must be a non-negative integer.');
  }

  return {
    playerId,
    initials,
    score,
    level: input.level,
    battleReached: input.battleReached,
    loopCount: input.loopCount,
    endedBy: input.endedBy,
  };
}

export function resolveStoredLeaderboardEntry(
  existing: StoredLeaderboardEntry | null,
  incoming: SubmitHighScoreInput,
): { stored: StoredLeaderboardEntry; result: SubmitHighScoreResult } {
  if (!existing) {
    return {
      stored: {
        playerId: incoming.playerId,
        initials: incoming.initials,
        score: incoming.score,
        level: incoming.level,
        battleReached: incoming.battleReached,
        loopCount: incoming.loopCount,
        endedBy: incoming.endedBy,
      },
      result: {
        accepted: true,
        replacedBest: true,
        score: incoming.score,
        initials: incoming.initials,
      },
    };
  }

  if (incoming.score > existing.score) {
    return {
      stored: {
        playerId: existing.playerId,
        initials: incoming.initials,
        score: incoming.score,
        level: incoming.level,
        battleReached: incoming.battleReached,
        loopCount: incoming.loopCount,
        endedBy: incoming.endedBy,
      },
      result: {
        accepted: true,
        replacedBest: true,
        score: incoming.score,
        initials: incoming.initials,
      },
    };
  }

  return {
    stored: existing,
    result: {
      accepted: true,
      replacedBest: false,
      score: existing.score,
      initials: existing.initials,
    },
  };
}
