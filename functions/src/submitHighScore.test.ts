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
        level: 3,
        battleReached: 12,
        loopCount: 1,
        endedBy: 'retire',
      }),
    ).toEqual({
      playerId: 'player-1',
      initials: 'ABC',
      score: 1234,
      level: 3,
      battleReached: 12,
      loopCount: 1,
      endedBy: 'retire',
    });
  });

  it('rejects malformed initials and scores', () => {
    expect(() =>
      validateSubmitHighScoreInput({
        playerId: 'player-1',
        initials: 'A1',
        score: 42,
        level: 1,
        battleReached: 1,
        loopCount: 0,
        endedBy: 'defeat',
      }),
    ).toThrow('Initials must be exactly 3 letters.');

    expect(() =>
      validateSubmitHighScoreInput({
        playerId: 'player-1',
        initials: 'ABC',
        score: -1,
        level: 1,
        battleReached: 1,
        loopCount: 0,
        endedBy: 'defeat',
      }),
    ).toThrow('Score must be a non-negative integer.');
  });

  it('creates a new leaderboard record when none exists', () => {
    const { stored, result } = resolveStoredLeaderboardEntry(null, {
      playerId: 'player-1',
      initials: 'ABC',
      score: 500,
      level: 2,
      battleReached: 8,
      loopCount: 0,
      endedBy: 'timeout',
    });

    expect(stored.score).toBe(500);
    expect(stored.level).toBe(2);
    expect(result.replacedBest).toBe(true);
  });

  it('updates only when the new score is higher', () => {
    const lower = resolveStoredLeaderboardEntry(
      { playerId: 'player-1', initials: 'ABC', score: 500, level: 1, battleReached: 5, loopCount: 0, endedBy: 'defeat' },
      { playerId: 'player-1', initials: 'XYZ', score: 450, level: 2, battleReached: 6, loopCount: 0, endedBy: 'retire' },
    );
    const higher = resolveStoredLeaderboardEntry(
      { playerId: 'player-1', initials: 'ABC', score: 500, level: 1, battleReached: 5, loopCount: 0, endedBy: 'defeat' },
      { playerId: 'player-1', initials: 'XYZ', score: 750, level: 3, battleReached: 10, loopCount: 1, endedBy: 'retire' },
    );

    expect(lower.stored).toEqual({
      playerId: 'player-1',
      initials: 'ABC',
      score: 500,
      level: 1,
      battleReached: 5,
      loopCount: 0,
      endedBy: 'defeat',
    });
    expect(lower.result.replacedBest).toBe(false);
    expect(higher.stored).toEqual({
      playerId: 'player-1',
      initials: 'XYZ',
      score: 750,
      level: 3,
      battleReached: 10,
      loopCount: 1,
      endedBy: 'retire',
    });
    expect(higher.result.replacedBest).toBe(true);
  });
});
