// Firebase Client SDK initialization
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDlGaMqMMtMH5cfQ28XVuF3fABKkws5-H4",
  authDomain: "ourstudyai-cd5ee.firebaseapp.com",
  projectId: "ourstudyai-cd5ee",
  storageBucket: "ourstudyai-cd5ee.firebasestorage.app",
  messagingSenderId: "325989009755",
  appId: "1:325989009755:web:145a1c36d501337057327e",
};

// Initialize Firebase (prevent re-initialization in dev hot reload)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Force account selection on every sign-in
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export default app;
