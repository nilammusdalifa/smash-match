import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const database: Database = getDatabase(app);

let anonymousAuthPromise: Promise<string> | null = null;

/**
 * Resolves once this device has a Firebase anonymous auth UID, signing in
 * silently if it doesn't have one yet. Safe to call multiple times.
 */
export function ensureAnonymousAuth(): Promise<string> {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser.uid);
  }
  if (!anonymousAuthPromise) {
    anonymousAuthPromise = new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          if (user) {
            unsubscribe();
            resolve(user.uid);
          }
        },
        (err) => {
          unsubscribe();
          reject(err);
        }
      );
      signInAnonymously(auth).catch((err) => {
        unsubscribe();
        reject(err);
      });
    });
  }
  return anonymousAuthPromise;
}
