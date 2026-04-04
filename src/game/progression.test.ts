import { describe, expect, it } from 'vitest';
import { getProgressionState, getRunXpForScore } from './progression.ts';

describe('matchcrow progression', () => {
  it('awards no XP for zero-score runs and a minimum for positive-score runs', () => {
    expect(getRunXpForScore(0)).toBe(0);
    expect(getRunXpForScore(40)).toBe(5);
    expect(getRunXpForScore(420)).toBe(42);
  });

  it('derives level progress from total XP', () => {
    expect(getProgressionState(0)).toMatchObject({
      totalXp: 0,
      level: 1,
      xpIntoLevel: 0,
      xpForNextLevel: 100,
      xpToNextLevel: 100,
    });

    expect(getProgressionState(100)).toMatchObject({
      totalXp: 100,
      level: 2,
      xpIntoLevel: 0,
      xpForNextLevel: 150,
      xpToNextLevel: 150,
    });

    expect(getProgressionState(260)).toMatchObject({
      totalXp: 260,
      level: 3,
      xpIntoLevel: 10,
      xpForNextLevel: 200,
      xpToNextLevel: 190,
    });
  });
});
