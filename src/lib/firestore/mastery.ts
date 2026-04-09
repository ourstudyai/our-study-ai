// Firestore Mastery Tracking Service (Phase 1 Stub + Core Logic)
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
import { MasteryRecord, ReadinessStatus } from '@/lib/types';

const MASTERY_COLLECTION = 'mastery_tracking';

function makeMasteryId(userId: string, courseId: string, conceptId: string): string {
  return `${userId}_${courseId}_${conceptId}`;
}

/**
 * Record a student's answer to a concept question.
 * Implements the regression/recovery rules:
 * - REGRESSION: Previously correct → now incorrect = immediate "Area for Growth"
 * - RECOVERY: "Area for Growth" → "Strong" only after 3 consecutive correct across different sessions
 */
export async function recordAttempt(
  userId: string,
  courseId: string,
  conceptId: string,
  topicName: string,
  isCorrect: boolean,
  sessionId: string
): Promise<MasteryRecord> {
  const masteryId = makeMasteryId(userId, courseId, conceptId);
  const docRef = doc(db, MASTERY_COLLECTION, masteryId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    // First attempt on this concept
    const newRecord: Omit<MasteryRecord, 'id'> = {
      userId,
      courseId,
      conceptId,
      topicName,
      attempts: 1,
      successCount: isCorrect ? 1 : 0,
      consecutiveCorrect: isCorrect ? 1 : 0,
      currentStatus: isCorrect ? 'developing' : 'needs_work',
      previouslyCorrect: isCorrect,
      lastAttemptAt: new Date().toISOString(),
      lastSessionId: sessionId,
    };

    await setDoc(docRef, newRecord);
    return { id: masteryId, ...newRecord };
  }

  const existing = docSnap.data() as Omit<MasteryRecord, 'id'>;
  const isDifferentSession = existing.lastSessionId !== sessionId;

  let newStatus: ReadinessStatus = existing.currentStatus;
  let newConsecutive = existing.consecutiveCorrect;
  let newPreviouslyCorrect = existing.previouslyCorrect;

  if (isCorrect) {
    newConsecutive = isDifferentSession ? existing.consecutiveCorrect + 1 : existing.consecutiveCorrect;
    newPreviouslyCorrect = true;

    // RECOVERY RULE: Return to "Strong" only after 3 consecutive correct across different sessions
    if (existing.currentStatus === 'area_for_growth') {
      if (newConsecutive >= 3 && isDifferentSession) {
        newStatus = 'strong';
        newConsecutive = 0; // Reset counter
      }
    } else if (newConsecutive >= 3) {
      newStatus = 'strong';
    } else if (newConsecutive >= 1) {
      newStatus = 'developing';
    }
  } else {
    newConsecutive = 0; // Reset consecutive on any wrong answer

    // REGRESSION RULE: Previously correct → now incorrect = "Area for Growth"
    if (existing.previouslyCorrect) {
      newStatus = 'area_for_growth';
    } else {
      newStatus = 'needs_work';
    }
  }

  const updates = {
    attempts: existing.attempts + 1,
    successCount: existing.successCount + (isCorrect ? 1 : 0),
    consecutiveCorrect: newConsecutive,
    currentStatus: newStatus,
    previouslyCorrect: newPreviouslyCorrect,
    lastAttemptAt: new Date().toISOString(),
    lastSessionId: sessionId,
  };

  await updateDoc(docRef, updates);
  return { id: masteryId, ...existing, ...updates };
}

/**
 * Get all mastery records for a student in a course.
 */
export async function getCourseMastery(
  userId: string,
  courseId: string
): Promise<MasteryRecord[]> {
  const q = query(
    collection(db, MASTERY_COLLECTION),
    where('userId', '==', userId),
    where('courseId', '==', courseId)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as MasteryRecord));
}

/**
 * Calculate readiness percentage for a course.
 */
export async function getCourseReadinessPercentage(
  userId: string,
  courseId: string
): Promise<number> {
  const records = await getCourseMastery(userId, courseId);

  if (records.length === 0) return 0;

  const strongCount = records.filter((r) => r.currentStatus === 'strong').length;
  const developingCount = records.filter((r) => r.currentStatus === 'developing').length;

  // Strong = 100%, Developing = 60%, Needs Work = 20%, Area for Growth = 10%
  const totalPoints =
    strongCount * 100 +
    developingCount * 60 +
    records.filter((r) => r.currentStatus === 'needs_work').length * 20 +
    records.filter((r) => r.currentStatus === 'area_for_growth').length * 10;

  return Math.round(totalPoints / (records.length * 100) * 100);
}

/**
 * Get readiness color based on percentage.
 */
export function getReadinessColor(percentage: number): 'red' | 'amber' | 'blue' {
  if (percentage < 40) return 'red';
  if (percentage < 70) return 'amber';
  return 'blue';
}
