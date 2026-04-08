import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { getFirebaseClients, isFirebaseConfigured } from '../firebase/client.ts';

export interface LeaderboardEntry {
  playerId: string;
  initials: string;
  score: number;
  level: number;
  battleReached: number;
  loopCount: number;
  endedBy: 'defeat' | 'retire' | 'timeout';
  updatedAt?: Date | null;
}

export interface SubmitEligibility {
  canSubmit: boolean;
  reason?: string;
}

export interface SubmitScoreRequest {
  playerId: string;
  initials: string;
  score: number;
  level: number;
  battleReached: number;
  loopCount: number;
  endedBy: 'defeat' | 'retire' | 'timeout';
}

export interface SubmitResult {
  accepted: boolean;
  replacedBest: boolean;
  score: number;
  initials: string;
}

export function normalizeInitials(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

export function getSubmitEligibility(
  highScore: number,
  lastSubmittedScore: number,
): SubmitEligibility {
  if (highScore <= 0) {
    return {
      canSubmit: false,
      reason: 'Earn a score before posting.',
    };
  }

  if (highScore <= lastSubmittedScore) {
    return {
      canSubmit: false,
      reason: 'Beat your posted best to submit again.',
    };
  }

  return {
    canSubmit: true,
  };
}

export function canReadRemoteLeaderboard(): boolean {
  return isFirebaseConfigured();
}

export function canSubmitRemoteScore(): boolean {
  return isFirebaseConfigured();
}

export async function fetchTopScores(): Promise<LeaderboardEntry[]> {
  if (!canReadRemoteLeaderboard()) {
    throw new Error('Leaderboard is not configured.');
  }

  const { firestore } = getFirebaseClients();
  const leaderboardQuery = query(
    collection(firestore, 'leaderboard'),
    orderBy('score', 'desc'),
    limit(100),
  );
  const snapshot = await getDocs(leaderboardQuery);

  return snapshot.docs.map((doc) => {
    const updatedAt = doc.get('updatedAt');

    return {
      playerId: doc.id,
      initials: doc.get('initials') as string,
      score: doc.get('score') as number,
      level: (doc.get('level') as number | undefined) ?? 1,
      battleReached: (doc.get('battleReached') as number | undefined) ?? 0,
      loopCount: (doc.get('loopCount') as number | undefined) ?? 0,
      endedBy: ((doc.get('endedBy') as LeaderboardEntry['endedBy'] | undefined) ?? 'retire'),
      updatedAt: updatedAt && typeof updatedAt.toDate === 'function' ? updatedAt.toDate() : null,
    };
  });
}

export async function submitScore(request: SubmitScoreRequest): Promise<SubmitResult> {
  if (!canSubmitRemoteScore()) {
    throw new Error('Score submission is not configured.');
  }

  const initials = normalizeInitials(request.initials);

  if (!/^[A-Z]{3}$/.test(initials)) {
    throw new Error('Use exactly 3 letters.');
  }

  if (!Number.isSafeInteger(request.score) || request.score < 0) {
    throw new Error('Score must be a non-negative integer.');
  }

  if (!Number.isSafeInteger(request.level) || request.level < 1) {
    throw new Error('Level must be a positive integer.');
  }

  if (!Number.isSafeInteger(request.battleReached) || request.battleReached < 1) {
    throw new Error('Battle reached must be a positive integer.');
  }

  if (!Number.isSafeInteger(request.loopCount) || request.loopCount < 0) {
    throw new Error('Loop count must be a non-negative integer.');
  }

  const { app } = getFirebaseClients();
  const projectId = app.options.projectId;

  if (!projectId) {
    throw new Error('Firebase project ID is missing.');
  }

  const response = await fetch(
    `https://us-central1-${projectId}.cloudfunctions.net/submitHighScoreHttp`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...request,
        initials,
      }),
    },
  );

  if (!response.ok) {
    throw new Error('Score submission failed.');
  }

  return (await response.json()) as SubmitResult;
}
