import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import {
  type SubmitHighScoreInput,
  type SubmitHighScoreResult,
  resolveStoredLeaderboardEntry,
  validateSubmitHighScoreInput,
  type StoredLeaderboardEntry,
} from './submitHighScore';

initializeApp();

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/html-classic\.itch\.zone$/,
  /^https:\/\/itch\.io$/,
  /^https:\/\/.+\.itch\.io$/,
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
];

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }

  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

function applyCorsHeaders(requestOrigin: string | undefined, response: { set: (name: string, value: string) => void }): void {
  if (isAllowedOrigin(requestOrigin)) {
    response.set('Access-Control-Allow-Origin', requestOrigin as string);
  }

  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type');
  response.set('Access-Control-Max-Age', '3600');
  response.set('Vary', 'Origin');
}

async function processSubmitHighScore(payload: SubmitHighScoreInput): Promise<SubmitHighScoreResult> {
  const db = getFirestore();
  const docRef = db.collection('leaderboard').doc(payload.playerId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    const existing = snapshot.exists
      ? ({
          playerId: snapshot.id,
          initials: snapshot.get('initials') as string,
          score: snapshot.get('score') as number,
          level: (snapshot.get('level') as number | undefined) ?? 1,
          battleReached: (snapshot.get('battleReached') as number | undefined) ?? 1,
          loopCount: (snapshot.get('loopCount') as number | undefined) ?? 0,
          endedBy: ((snapshot.get('endedBy') as LeaderboardDocument['endedBy'] | undefined) ?? 'retire'),
        } satisfies StoredLeaderboardEntry)
      : null;
    const { stored, result } = resolveStoredLeaderboardEntry(existing, payload);

    if (!snapshot.exists) {
      transaction.set(docRef, {
        playerId: stored.playerId,
        initials: stored.initials,
        score: stored.score,
        level: stored.level,
        battleReached: stored.battleReached,
        loopCount: stored.loopCount,
        endedBy: stored.endedBy,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (result.replacedBest) {
      transaction.update(docRef, {
        initials: stored.initials,
        score: stored.score,
        level: stored.level,
        battleReached: stored.battleReached,
        loopCount: stored.loopCount,
        endedBy: stored.endedBy,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return result;
  });
}

export const submitHighScore = onCall(
  {
    cors: true,
    invoker: 'public',
  },
  async (request) => {
    let payload;

    try {
      payload = validateSubmitHighScoreInput(request.data);
    } catch (error) {
      throw new HttpsError(
        'invalid-argument',
        error instanceof Error ? error.message : 'Invalid score payload.',
      );
    }

    return processSubmitHighScore(payload);
  },
);

export const submitHighScoreHttp = onRequest(
  {
    cors: false,
    invoker: 'public',
  },
  async (request, response) => {
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
      payload = validateSubmitHighScoreInput(request.body);
    } catch (error) {
      const httpsError = new HttpsError(
        'invalid-argument',
        error instanceof Error ? error.message : 'Invalid score payload.',
      );
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
  },
);

export interface LeaderboardDocument {
  playerId: string;
  initials: string;
  score: number;
  level: number;
  battleReached: number;
  loopCount: number;
  endedBy: 'defeat' | 'retire' | 'timeout';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
