'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { getFilteredCourses } from '@/lib/firestore/courses';
import { Course, Department } from '@/lib/types';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';

const DEPARTMENTS: { id: Department; label: string }[] = [
  { id: 'theology', label: '✝️ Theology' },
  { id: 'philosophy', label: '🏛️ Philosophy' },
];

const SEMESTERS = [
  { id: 1, label: 'Semester 1' },
  { id: 2, label: 'Semester 2' },
];

export default function DashboardPage() {
  const { userProfile } = useAuth();
  const router = useRouter();

  const userYear = userProfile?.year ?? 1;
  const userDepartment = (userProfile?.department ?? 'philosophy') as Department;

  const [activeDept, setActiveDept] = useState<Department>(userDepartment);
  const [activeYear, setActiveYear] = useState<number>(userYear);
  const [activeSemester, setActiveSemester] = useState<number>(userProfile?.currentSemester ?? 1);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any>(null);

  // Year access logic per handoff doc:
  // Theology students: all 4 philosophy years + theology years up to current
  // Philosophy students: philosophy years up to current only
  const getAccessibleYears = (dept: Department): number[] => {
    if (dept === 'philosophy') {
      if (userDepartment === 'theology') {
        // Theology student browsing philosophy — all 4 years
        return [1, 2, 3, 4];
      }
      // Philosophy student browsing philosophy — up to their year
      return Array.from({ length: userYear }, (_, i) => i + 1);
    }
    // Theology dept
    if (userDepartment === 'philosophy') {
      // Philosophy student cannot browse theology
      return [];
    }
    // Theology student browsing theology — up to their year
    return Array.from({ length: userYear }, (_, i) => i + 1);
  };

  const accessibleYears = getAccessibleYears(activeDept);

  // When switching dept, snap year to a valid one
  useEffect(() => {
    const years = getAccessibleYears(activeDept);
    if (years.length === 0) return;
    if (!years.includes(activeYear)) setActiveYear(years[years.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDept]);

  useEffect(() => {
    setLoading(true);
    getFilteredCourses(activeDept, activeYear, activeSemester)
      .then(setCourses)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeDept, activeYear, activeSemester]);

  // Load assignments for this user's courses
  useEffect(() => {
    if (!userProfile?.department || !userProfile?.year) return;
    const load = async () => {
      try {
        const now = new Date().toISOString();
        const snap = await getDocs(query(
          collection(db, 'assignments'),
          where('status', '==', 'active'),
          where('department', '==', userProfile.department),
          where('year', '==', userProfile.year),
          orderBy('dueDate', 'asc')
        ));
        const active = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((a: any) => a.dueDate >= now);
        setAssignments(active);
      } catch {}
    };
    load();
  }, [userProfile]);

  // Load timetable
  useEffect(() => {
    if (!userProfile?.department) return;
    const load = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'timetables'),
          where('department', '==', userProfile.department),
          where('type', '==', 'regular')
        ));
        if (!snap.empty) setTimetable({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } catch {}
    };
    load();
  }, [userProfile]);

  // Hide theology tab entirely for philosophy students
  const visibleDepts = userDepartment === 'philosophy'
    ? DEPARTMENTS.filter(d => d.id === 'philosophy')
    : DEPARTMENTS;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--body-bg)', color: 'var(--text-primary)', padding: '16px', maxWidth: '100vw', overflowX: 'hidden' }}>

      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--gold)', fontSize: '1.3rem', fontWeight: 'bold' }}>
          My Courses
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2px' }}>
          {userProfile?.displayName ?? 'Student'} · Year {userYear} · {userDepartment}
        </p>
      </div>

      {/* Department switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {visibleDepts.map((d) => (
          <button
            key={d.id}
            onClick={() => setActiveDept(d.id)}
            style={{
              padding: '5px 14px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 500,
              border: '1px solid var(--border)',
              background: activeDept === d.id ? 'var(--gold)' : 'var(--navy-card)',
              color: activeDept === d.id ? 'var(--ink)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Year switcher */}
      {accessibleYears.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {accessibleYears.map((y) => (
            <button
              key={y}
              onClick={() => setActiveYear(y)}
              style={{
                padding: '4px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 500,
                border: '1px solid var(--border)',
                background: activeYear === y ? 'var(--gold)' : 'var(--navy-card)',
                color: activeYear === y ? 'var(--ink)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Year {y}
            </button>
          ))}
        </div>
      )}

      {/* Semester switcher */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {SEMESTERS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSemester(s.id)}
            style={{
              padding: '4px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 500,
              border: '1px solid var(--border)',
              background: activeSemester === s.id ? 'var(--gold)' : 'var(--navy-card)',
              color: activeSemester === s.id ? 'var(--ink)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Course grid */}
      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading courses...</p>
      ) : courses.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: '40px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No courses found for this selection.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
          {courses.map((course) => (
            <button
              key={course.id}
              onClick={() => router.push(`/dashboard/course/${course.id}`)}
              style={{
                textAlign: 'left', padding: '14px', borderRadius: '14px',
                border: '1px solid var(--border)', background: 'var(--navy-card)',
                cursor: 'pointer', transition: 'border-color 0.2s', width: '100%',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--gold)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{ color: 'var(--gold)', fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px', fontFamily: 'Playfair Display, serif' }}>
                {course.name}
              </div>
              {course.code && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '6px' }}>
                  {course.code}
                </div>
              )}
              {course.description && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.5', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {course.description}
                </div>
              )}
              <div style={{ marginTop: '8px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Year {course.year} · Sem {course.semester}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}