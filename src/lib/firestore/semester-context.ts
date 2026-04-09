// Firestore Semester Context Service — Cross-session memory
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  collection,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { SemesterContext } from '@/lib/types';

const CONTEXT_COLLECTION = 'semester_context';

function makeContextId(userId: string, courseId: string, semester: number): string {
  return `${userId}_${courseId}_${semester}`;
}

export async function getSemesterContext(
  userId: string,
  courseId: string,
  semester: number
): Promise<SemesterContext | null> {
  const contextId = makeContextId(userId, courseId, semester);
  const docRef = doc(db, CONTEXT_COLLECTION, contextId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as SemesterContext;
}

export async function createOrUpdateSemesterContext(
  userId: string,
  courseId: string,
  semester: number,
  updates: {
    globalSummary?: string;
    learningGaps?: string[];
    conceptsCovered?: string[];
  }
): Promise<void> {
  const contextId = makeContextId(userId, courseId, semester);
  const docRef = doc(db, CONTEXT_COLLECTION, contextId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    await updateDoc(docRef, {
      ...updates,
      lastUpdated: new Date().toISOString(),
    });
  } else {
    await setDoc(docRef, {
      userId,
      courseId,
      semester,
      globalSummary: updates.globalSummary || '',
      learningGaps: updates.learningGaps || [],
      conceptsCovered: updates.conceptsCovered || [],
      lastUpdated: new Date().toISOString(),
      archived: false,
    });
  }
}

/**
 * Archive old semester context when semester changes.
 */
export async function archiveSemesterContext(
  userId: string,
  oldSemester: number
): Promise<void> {
  const q = query(
    collection(db, CONTEXT_COLLECTION),
    where('userId', '==', userId),
    where('semester', '==', oldSemester),
    where('archived', '==', false)
  );

  const snapshot = await getDocs(q);

  for (const docSnap of snapshot.docs) {
    await updateDoc(docSnap.ref, {
      archived: true,
      lastUpdated: new Date().toISOString(),
    });
  }
}

/**
 * Get the student's summary for injection into AI context.
 */
export async function getStudentSummaryForAI(
  userId: string,
  courseId: string,
  semester: number
): Promise<string | undefined> {
  const context = await getSemesterContext(userId, courseId, semester);
  if (!context || context.archived) return undefined;
  return context.globalSummary || undefined;
}
