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
        })).toEqual({
            playerId: 'player-1',
            initials: 'ABC',
            score: 1234,
        });
    });
    (0, vitest_1.it)('rejects malformed initials and scores', () => {
        (0, vitest_1.expect)(() => (0, submitHighScore_1.validateSubmitHighScoreInput)({
            playerId: 'player-1',
            initials: 'A1',
            score: 42,
        })).toThrow('Initials must be exactly 3 letters.');
        (0, vitest_1.expect)(() => (0, submitHighScore_1.validateSubmitHighScoreInput)({
            playerId: 'player-1',
            initials: 'ABC',
            score: -1,
        })).toThrow('Score must be a non-negative integer.');
    });
    (0, vitest_1.it)('creates a new leaderboard record when none exists', () => {
        const { stored, result } = (0, submitHighScore_1.resolveStoredLeaderboardEntry)(null, {
            playerId: 'player-1',
            initials: 'ABC',
            score: 500,
        });
        (0, vitest_1.expect)(stored.score).toBe(500);
        (0, vitest_1.expect)(result.replacedBest).toBe(true);
    });
    (0, vitest_1.it)('updates only when the new score is higher', () => {
        const lower = (0, submitHighScore_1.resolveStoredLeaderboardEntry)({ playerId: 'player-1', initials: 'ABC', score: 500 }, { playerId: 'player-1', initials: 'XYZ', score: 450 });
        const higher = (0, submitHighScore_1.resolveStoredLeaderboardEntry)({ playerId: 'player-1', initials: 'ABC', score: 500 }, { playerId: 'player-1', initials: 'XYZ', score: 750 });
        (0, vitest_1.expect)(lower.stored).toEqual({ playerId: 'player-1', initials: 'ABC', score: 500 });
        (0, vitest_1.expect)(lower.result.replacedBest).toBe(false);
        (0, vitest_1.expect)(higher.stored).toEqual({ playerId: 'player-1', initials: 'XYZ', score: 750 });
        (0, vitest_1.expect)(higher.result.replacedBest).toBe(true);
    });
});
//# sourceMappingURL=submitHighScore.test.js.map