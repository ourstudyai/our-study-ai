'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { getFilteredCourses } from '@/lib/firestore/courses';
import { Course, Department } from '@/lib/types';

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
  const userDepartment = (userProfile?.department ?? 'theology') as Department;

  const [activeDept, setActiveDept] = useState<Department>(userDepartment);
  const [activeYear, setActiveYear] = useState<number>(userYear);
  const [activeSemester, setActiveSemester] = useState<number>(1);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const accessibleYears = Array.from({ length: userYear }, (_, i) => i + 1);

  useEffect(() => {
    setLoading(true);
    getFilteredCourses(activeDept, activeYear, activeSemester)
      .then(setCourses)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeDept, activeYear, activeSemester]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeYear > userYear) setActiveYear(userYear);
  }, [activeDept]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)', color: 'var(--text-primary)', padding: '16px' }}>

      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--gold)', fontSize: '1.3rem', fontWeight: 'bold' }}>
          My Courses
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2px' }}>
          {userProfile?.name ?? 'Student'} · Year {userYear} · {userDepartment}
        </p>
      </div>

      {/* Department switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {DEPARTMENTS.map((d) => (
          <button
            key={d.id}
            onClick={() => setActiveDept(d.id)}
            style={{
              padding: '5px 14px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 500,
              border: '1px solid var(--border)',
              background: activeDept === d.id ? 'var(--gold)' : 'var(--navy-card)',
              color: activeDept === d.id ? 'var(--navy)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Year switcher */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {accessibleYears.map((y) => (
          <button
            key={y}
            onClick={() => setActiveYear(y)}
            style={{
              padding: '4px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 500,
              border: '1px solid var(--border)',
              background: activeYear === y ? 'var(--gold)' : 'var(--navy-card)',
              color: activeYear === y ? 'var(--navy)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Year {y}
          </button>
        ))}
      </div>

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
              color: activeSemester === s.id ? 'var(--navy)' : 'var(--text-secondary)',
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {courses.map((course) => (
            <button
              key={course.id}
              onClick={() => router.push(`/dashboard/course/${course.id}`)}
              style={{
                textAlign: 'left', padding: '14px', borderRadius: '14px',
                border: '1px solid var(--border)', background: 'var(--navy-card)',
                cursor: 'pointer', transition: 'border-color 0.2s',
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