// Firestore User Service
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { UserProfile, Department } from '@/lib/types';

const USERS_COLLECTION = 'users';

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const docRef = doc(db, USERS_COLLECTION, uid);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;
  return { uid: docSnap.id, ...docSnap.data() } as UserProfile;
}

export async function createUserProfile(
  uid: string,
  email: string,
  displayName: string,
  photoURL?: string
): Promise<UserProfile> {
  const profile: Omit<UserProfile, 'uid'> = {
    email,
    displayName,
    photoURL,
    isActive: true,
    role: 'student',
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const docRef = doc(db, USERS_COLLECTION, uid);
  await setDoc(docRef, profile);

  return { uid, ...profile };
}

export async function completeOnboarding(
  uid: string,
  department: Department,
  year: number,
  semester: number = 1
): Promise<void> {
  const docRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(docRef, {
    department,
    year,
    currentSemester: semester,
    onboardingComplete: true,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<UserProfile>
): Promise<void> {
  const docRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function softDeleteUserAccount(uid: string): Promise<void> {
  // Mark user as deleted in Firestore
  const ref = doc(db, USERS_COLLECTION, uid);
  await updateDoc(ref, {
    isActive: false,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fcmToken: null,
    settings: null,
  });

  // Delete personal data — bookmarks, chat sessions, chat messages, mastery
  const PERSONAL_COLLECTIONS: { col: string; field: string }[] = [
    { col: 'bookmarks', field: 'userId' },
    { col: 'chat_sessions', field: 'userId' },
    { col: 'chat_messages', field: 'userId' },
    { col: 'mastery_tracking', field: 'userId' },
  ];

  for (const { col, field } of PERSONAL_COLLECTIONS) {
    try {
      const snap = await getDocs(query(collection(db, col), where(field, '==', uid)));
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      if (snap.docs.length > 0) await batch.commit();
    } catch (e) {
      console.warn(`[softDelete] Failed to delete ${col}:`, e);
    }
  }
}

export async function getOrCreateUserProfile(
  uid: string,
  email: string,
  displayName: string,
  photoURL?: string
): Promise<UserProfile> {
  const existing = await getUserProfile(uid);
  if (existing) return existing;
  return createUserProfile(uid, email, displayName, photoURL);
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, USERS_COLLECTION));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
}

export async function advanceSemesterForAllUsers(
  newSemester: number,
  newYear?: number
): Promise<void> {
  const snap = await getDocs(collection(db, USERS_COLLECTION));
  const batches = [];
  let batch = writeBatch(db);
  let count = 0;
  for (const d of snap.docs) {
    const updates: Record<string, any> = {
      currentSemester: newSemester,
      updatedAt: new Date().toISOString(),
    };
    if (newYear !== undefined) updates.year = newYear;
    batch.update(d.ref, updates);
    count++;
    if (count === 499) {
      batches.push(batch.commit());
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count > 0) batches.push(batch.commit());
  await Promise.all(batches);
}

