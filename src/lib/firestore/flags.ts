// Firestore Flags Service
import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Flag, FlagRequest, FlagStatus, StudyMode } from '@/lib/types';

const FLAGS_COLLECTION = 'flags';

export async function createFlag(
  userId: string,
  userEmail: string,
  flagData: FlagRequest
): Promise<Flag> {
  const flag = {
    userId,
    userEmail,
    courseId: flagData.courseId,
    courseName: flagData.courseName,
    mode: flagData.mode,
    question: flagData.question.substring(0, 500),
    aiResponse: flagData.aiResponse.substring(0, 500),
    studentDescription: flagData.studentDescription,
    status: 'open' as FlagStatus,
    createdAt: new Date().toISOString(),
  };

  const docRef = await addDoc(collection(db, FLAGS_COLLECTION), flag);
  return { id: docRef.id, ...flag };
}

export async function getAllFlags(): Promise<Flag[]> {
  const q = query(
    collection(db, FLAGS_COLLECTION),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Flag));
}

export async function getOpenFlags(): Promise<Flag[]> {
  const q = query(
    collection(db, FLAGS_COLLECTION),
    where('status', '==', 'open'),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Flag));
}

export async function resolveFlag(
  flagId: string,
  adminNote: string,
  goldenCorrection?: string
): Promise<void> {
  const docRef = doc(db, FLAGS_COLLECTION, flagId);
  await updateDoc(docRef, {
    status: 'resolved' as FlagStatus,
    adminNote,
    goldenCorrection: goldenCorrection || null,
    resolvedAt: new Date().toISOString(),
  });
}
