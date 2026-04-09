// Firestore User Service
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
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
