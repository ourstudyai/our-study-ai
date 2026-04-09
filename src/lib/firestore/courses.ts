// Firestore Courses Service
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Course, Department } from '@/lib/types';

const COURSES_COLLECTION = 'courses';

/**
 * Get courses filtered by department, year, and semester.
 * This is the core access control — students only see their courses.
 */
export async function getFilteredCourses(
  department: Department,
  year: number,
  semester: number
): Promise<Course[]> {
  const q = query(
    collection(db, COURSES_COLLECTION),
    where('department', '==', department),
    where('year', '==', year),
    where('semester', '==', semester),
    orderBy('name', 'asc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Course));
}

/**
 * Get a single course by ID.
 */
export async function getCourseById(courseId: string): Promise<Course | null> {
  const docRef = doc(db, COURSES_COLLECTION, courseId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Course;
}

/**
 * Get all courses for a department (admin use).
 */
export async function getCoursesByDepartment(
  department: Department
): Promise<Course[]> {
  const q = query(
    collection(db, COURSES_COLLECTION),
    where('department', '==', department),
    orderBy('year', 'asc'),
    orderBy('semester', 'asc'),
    orderBy('name', 'asc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Course));
}
