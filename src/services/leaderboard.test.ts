import { describe, expect, it } from 'vitest';
import {
  getSubmitEligibility,
  normalizeInitials,
} from './leaderboard.ts';

describe('leaderboard client helpers', () => {
  it('hides submit when the local high score does not beat the posted best', () => {
    expect(getSubmitEligibility(200, 200)).toEqual({
      canSubmit: false,
      reason: 'Beat your posted best to submit again.',
    });
    expect(getSubmitEligibility(150, 200)).toEqual({
      canSubmit: false,
      reason: 'Beat your posted best to submit again.',
    });
  });

  it('shows submit when the local high score beats the posted best', () => {
    expect(getSubmitEligibility(250, 200)).toEqual({
      canSubmit: true,
    });
  });

  it('normalizes initials to uppercase letters only', () => {
    expect(normalizeInitials('a!b2cdef')).toBe('ABC');
    expect(normalizeInitials('xy')).toBe('XY');
  });
});
