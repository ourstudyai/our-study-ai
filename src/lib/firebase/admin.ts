// Firebase Admin SDK initialization (server-side only)
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

export function getAdminDb() { return getFirestore(getAdminApp()); }
export function getAdminAuth() { return getAuth(getAdminApp()); }

// Backwards-compatible lazy proxies
export const adminDb = new Proxy({} as ReturnType<typeof getFirestore>, {
  get(_t, prop) { return (getAdminDb() as any)[prop]; },
});
export const adminAuth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_t, prop) { return (getAdminAuth() as any)[prop]; },
});
