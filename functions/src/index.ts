import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  resolveStoredLeaderboardEntry,
  validateSubmitHighScoreInput,
  type StoredLeaderboardEntry,
} from './submitHighScore';

initializeApp();

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

    const db = getFirestore();
    const docRef = db.collection('leaderboard').doc(payload.playerId);

    const result = await db.runTransaction(async (transaction) => {
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

    return result;
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
