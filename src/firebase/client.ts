import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

export interface FirebaseClients {
  app: FirebaseApp;
  firestore: Firestore;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

let cachedClients: FirebaseClients | null = null;

export function isFirebaseConfigured(): boolean {
  return Object.values(firebaseConfig).every((value) => typeof value === 'string' && value.length > 0);
}

export function getFirebaseClients(): FirebaseClients {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }

  if (cachedClients) {
    return cachedClients;
  }

  const app = getApps()[0] ?? initializeApp(firebaseConfig);

  cachedClients = {
    app,
    firestore: getFirestore(app),
  };

  return cachedClients;
}
