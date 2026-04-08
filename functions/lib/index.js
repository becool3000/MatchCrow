"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitHighScoreHttp = exports.submitHighScore = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const submitHighScore_1 = require("./submitHighScore");
(0, app_1.initializeApp)();
const ALLOWED_ORIGIN_PATTERNS = [
    /^https:\/\/html-classic\.itch\.zone$/,
    /^https:\/\/itch\.io$/,
    /^https:\/\/.+\.itch\.io$/,
    /^http:\/\/localhost(?::\d+)?$/,
    /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
];
function isAllowedOrigin(origin) {
    if (!origin) {
        return false;
    }
    return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}
function applyCorsHeaders(requestOrigin, response) {
    if (isAllowedOrigin(requestOrigin)) {
        response.set('Access-Control-Allow-Origin', requestOrigin);
    }
    response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
    response.set('Access-Control-Max-Age', '3600');
    response.set('Vary', 'Origin');
}
async function processSubmitHighScore(payload) {
    const db = (0, firestore_1.getFirestore)();
    const docRef = db.collection('leaderboard').doc(payload.playerId);
    return db.runTransaction(async (transaction) => {
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
}
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
    return processSubmitHighScore(payload);
});
exports.submitHighScoreHttp = (0, https_1.onRequest)({
    cors: false,
    invoker: 'public',
}, async (request, response) => {
    const requestOrigin = request.get('origin');
    applyCorsHeaders(requestOrigin, response);
    if (request.method === 'OPTIONS') {
        response.status(204).send('');
        return;
    }
    if (request.method !== 'POST') {
        response.status(405).json({
            error: 'Method not allowed.',
        });
        return;
    }
    let payload;
    try {
        payload = (0, submitHighScore_1.validateSubmitHighScoreInput)(request.body);
    }
    catch (error) {
        const httpsError = new https_1.HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid score payload.');
        response.status(400).json({
            error: {
                status: httpsError.code,
                message: httpsError.message,
            },
        });
        return;
    }
    const result = await processSubmitHighScore(payload);
    response.status(200).json(result);
});
//# sourceMappingURL=index.js.map