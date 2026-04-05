"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const submitHighScore_1 = require("./submitHighScore");
(0, vitest_1.describe)('submitHighScore helpers', () => {
    (0, vitest_1.it)('normalizes initials to three uppercase letters', () => {
        (0, vitest_1.expect)((0, submitHighScore_1.normalizeInitials)('a1b!cdef')).toBe('ABC');
    });
    (0, vitest_1.it)('validates a legal payload', () => {
        (0, vitest_1.expect)((0, submitHighScore_1.validateSubmitHighScoreInput)({
            playerId: 'player-1',
            initials: 'abc',
            score: 1234,
            level: 3,
            battleReached: 12,
            loopCount: 1,
            endedBy: 'retire',
        })).toEqual({
            playerId: 'player-1',
            initials: 'ABC',
            score: 1234,
            level: 3,
            battleReached: 12,
            loopCount: 1,
            endedBy: 'retire',
        });
    });
    (0, vitest_1.it)('rejects malformed initials and scores', () => {
        (0, vitest_1.expect)(() => (0, submitHighScore_1.validateSubmitHighScoreInput)({
            playerId: 'player-1',
            initials: 'A1',
            score: 42,
            level: 1,
            battleReached: 1,
            loopCount: 0,
            endedBy: 'defeat',
        })).toThrow('Initials must be exactly 3 letters.');
        (0, vitest_1.expect)(() => (0, submitHighScore_1.validateSubmitHighScoreInput)({
            playerId: 'player-1',
            initials: 'ABC',
            score: -1,
            level: 1,
            battleReached: 1,
            loopCount: 0,
            endedBy: 'defeat',
        })).toThrow('Score must be a non-negative integer.');
    });
    (0, vitest_1.it)('creates a new leaderboard record when none exists', () => {
        const { stored, result } = (0, submitHighScore_1.resolveStoredLeaderboardEntry)(null, {
            playerId: 'player-1',
            initials: 'ABC',
            score: 500,
            level: 2,
            battleReached: 8,
            loopCount: 0,
            endedBy: 'timeout',
        });
        (0, vitest_1.expect)(stored.score).toBe(500);
        (0, vitest_1.expect)(stored.level).toBe(2);
        (0, vitest_1.expect)(result.replacedBest).toBe(true);
    });
    (0, vitest_1.it)('updates only when the new score is higher', () => {
        const lower = (0, submitHighScore_1.resolveStoredLeaderboardEntry)({ playerId: 'player-1', initials: 'ABC', score: 500, level: 1, battleReached: 5, loopCount: 0, endedBy: 'defeat' }, { playerId: 'player-1', initials: 'XYZ', score: 450, level: 2, battleReached: 6, loopCount: 0, endedBy: 'retire' });
        const higher = (0, submitHighScore_1.resolveStoredLeaderboardEntry)({ playerId: 'player-1', initials: 'ABC', score: 500, level: 1, battleReached: 5, loopCount: 0, endedBy: 'defeat' }, { playerId: 'player-1', initials: 'XYZ', score: 750, level: 3, battleReached: 10, loopCount: 1, endedBy: 'retire' });
        (0, vitest_1.expect)(lower.stored).toEqual({
            playerId: 'player-1',
            initials: 'ABC',
            score: 500,
            level: 1,
            battleReached: 5,
            loopCount: 0,
            endedBy: 'defeat',
        });
        (0, vitest_1.expect)(lower.result.replacedBest).toBe(false);
        (0, vitest_1.expect)(higher.stored).toEqual({
            playerId: 'player-1',
            initials: 'XYZ',
            score: 750,
            level: 3,
            battleReached: 10,
            loopCount: 1,
            endedBy: 'retire',
        });
        (0, vitest_1.expect)(higher.result.replacedBest).toBe(true);
    });
});
//# sourceMappingURL=submitHighScore.test.js.map