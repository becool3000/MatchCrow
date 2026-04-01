import { describe, expect, it } from 'vitest';
import {
  normalizeInitials,
  resolveStoredLeaderboardEntry,
  validateSubmitHighScoreInput,
} from './submitHighScore';

describe('submitHighScore helpers', () => {
  it('normalizes initials to three uppercase letters', () => {
    expect(normalizeInitials('a1b!cdef')).toBe('ABC');
  });

  it('validates a legal payload', () => {
    expect(
      validateSubmitHighScoreInput({
        playerId: 'player-1',
        initials: 'abc',
        score: 1234,
      }),
    ).toEqual({
      playerId: 'player-1',
      initials: 'ABC',
      score: 1234,
    });
  });

  it('rejects malformed initials and scores', () => {
    expect(() =>
      validateSubmitHighScoreInput({
        playerId: 'player-1',
        initials: 'A1',
        score: 42,
      }),
    ).toThrow('Initials must be exactly 3 letters.');

    expect(() =>
      validateSubmitHighScoreInput({
        playerId: 'player-1',
        initials: 'ABC',
        score: -1,
      }),
    ).toThrow('Score must be a non-negative integer.');
  });

  it('creates a new leaderboard record when none exists', () => {
    const { stored, result } = resolveStoredLeaderboardEntry(null, {
      playerId: 'player-1',
      initials: 'ABC',
      score: 500,
    });

    expect(stored.score).toBe(500);
    expect(result.replacedBest).toBe(true);
  });

  it('updates only when the new score is higher', () => {
    const lower = resolveStoredLeaderboardEntry(
      { playerId: 'player-1', initials: 'ABC', score: 500 },
      { playerId: 'player-1', initials: 'XYZ', score: 450 },
    );
    const higher = resolveStoredLeaderboardEntry(
      { playerId: 'player-1', initials: 'ABC', score: 500 },
      { playerId: 'player-1', initials: 'XYZ', score: 750 },
    );

    expect(lower.stored).toEqual({ playerId: 'player-1', initials: 'ABC', score: 500 });
    expect(lower.result.replacedBest).toBe(false);
    expect(higher.stored).toEqual({ playerId: 'player-1', initials: 'XYZ', score: 750 });
    expect(higher.result.replacedBest).toBe(true);
  });
});
