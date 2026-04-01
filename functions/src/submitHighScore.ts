export interface SubmitHighScoreInput {
  playerId: string;
  initials: string;
  score: number;
}

export interface StoredLeaderboardEntry {
  playerId: string;
  initials: string;
  score: number;
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

  return {
    playerId,
    initials,
    score,
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
