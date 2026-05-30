// Firebase Client SDK initialization
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase (prevent re-initialization in dev hot reload)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Force account selection on every sign-in
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Enable Firestore offline persistence (IndexedDB).
// Caches every document read during a session — courses, materials, chat history
// all remain readable offline exactly as last seen.
// Only runs client-side; silently ignored if already enabled or in SSR.
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open — persistence only works in one tab at a time.
      // Non-fatal: the other tab still works online.
      console.warn('[Firestore] Offline persistence unavailable: multiple tabs open.');
    } else if (err.code === 'unimplemented') {
      // Browser doesn't support IndexedDB (very rare).
      console.warn('[Firestore] Offline persistence not supported in this browser.');
    }
  });
}

export default app;
