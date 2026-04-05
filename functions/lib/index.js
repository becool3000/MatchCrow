"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitHighScore = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const submitHighScore_1 = require("./submitHighScore");
(0, app_1.initializeApp)();
exports.submitHighScore = (0, https_1.onCall)({
    cors: true,
    invoker: 'public',
}, async (request) => {
    let payload;
    try {
        payload = (0, submitHighScore_1.validateSubmitHighScoreInput)(request.data);
    }
    catch (error) {
        throw new https_1.HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid score payload.');
    }
    const db = (0, firestore_1.getFirestore)();
    const docRef = db.collection('leaderboard').doc(payload.playerId);
    const result = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(docRef);
        const existing = snapshot.exists
            ? {
                playerId: snapshot.id,
                initials: snapshot.get('initials'),
                score: snapshot.get('score'),
                level: snapshot.get('level') ?? 1,
                battleReached: snapshot.get('battleReached') ?? 1,
                loopCount: snapshot.get('loopCount') ?? 0,
                endedBy: (snapshot.get('endedBy') ?? 'retire'),
            }
            : null;
        const { stored, result } = (0, submitHighScore_1.resolveStoredLeaderboardEntry)(existing, payload);
        if (!snapshot.exists) {
            transaction.set(docRef, {
                playerId: stored.playerId,
                initials: stored.initials,
                score: stored.score,
                level: stored.level,
                battleReached: stored.battleReached,
                loopCount: stored.loopCount,
                endedBy: stored.endedBy,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        else if (result.replacedBest) {
            transaction.update(docRef, {
                initials: stored.initials,
                score: stored.score,
                level: stored.level,
                battleReached: stored.battleReached,
                loopCount: stored.loopCount,
                endedBy: stored.endedBy,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        return result;
    });
    return result;
});
//# sourceMappingURL=index.js.map