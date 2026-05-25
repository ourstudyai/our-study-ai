'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { getFilteredCourses, getAllCourses } from '@/lib/firestore/courses';
import { Course, Department } from '@/lib/types';
import MiniLoader from '@/components/MiniLoader';
import LuxLoader from '@/components/LuxLoader';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';

const DEPARTMENTS: { id: Department; label: string; icon: string }[] = [
  { id: 'philosophy', label: 'Philosophy', icon: '🏛️' },
  { id: 'theology', label: 'Theology', icon: '✝️' },
];

const SEMESTERS = [
  { id: 1, label: 'Semester 1' },
  { id: 2, label: 'Semester 2' },
];

function greeting(name: string) {
  const h = new Date().getHours();
  const salutation = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const first = name?.split(' ')[0] ?? 'Scholar';
  return { salutation, first };
}

export default function DashboardPage() {
  const { userProfile } = useAuth();
  const router = useRouter();

  const userYear = userProfile?.year ?? 1;
  const userDepartment = (userProfile?.department ?? 'philosophy') as Department;

  const [activeDept, setActiveDept] = useState<Department>(userDepartment);
  const [activeYear, setActiveYear] = useState<number>(userYear);
  const [activeSemester, setActiveSemester] = useState<number>(userProfile?.currentSemester ?? 1);
  const [courses, setCourses] = useState<Course[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any>(null);

  const getAccessibleYears = (_dept: Department): number[] => [1, 2, 3, 4];
  const accessibleYears = getAccessibleYears(activeDept);

  useEffect(() => {
    const years = getAccessibleYears(activeDept);
    if (years.length === 0) return;
    if (!years.includes(activeYear)) setActiveYear(years[years.length - 1]);
  }, [activeDept]);

  useEffect(() => {
    setLoading(true);
    getFilteredCourses(activeDept, activeYear, activeSemester)
      .then(setCourses)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeDept, activeYear, activeSemester]);

  useEffect(() => {
    getAllCourses().then(setAllCourses).catch(console.error);
  }, []);

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

  const { salutation, first } = greeting(userProfile?.displayName ?? '');

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--body-bg)',
      backgroundImage: 'var(--body-bg-image)',
      color: 'var(--text-primary)',
      padding: '20px 16px 40px',
      maxWidth: '100vw',
      overflowX: 'hidden',
    }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--gold)',
          opacity: 0.5,
          marginBottom: '4px',
        }}>
          {salutation}
        </p>
        <h1 style={{
          fontFamily: 'Playfair Display, Georgia, serif',
          fontSize: '1.6rem',
          fontWeight: 700,
          color: 'var(--gold)',
          lineHeight: 1.2,
          marginBottom: '4px',
        }}>
          {first}
        </h1>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
          {activeDept.charAt(0).toUpperCase() + activeDept.slice(1)}
          {' · '}Year {activeYear}
          {' · '}Semester {activeSemester}
        </p>
      </div>

      {/* ── Department tabs ──────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: '0',
        marginBottom: '16px',
        background: 'var(--navy-card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '4px',
      }}>
        {DEPARTMENTS.map((d) => {
          const active = activeDept === d.id;
          return (
            <button
              key={d.id}
              onClick={() => setActiveDept(d.id)}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '9px',
                fontSize: '0.8rem',
                fontWeight: active ? 700 : 500,
                fontFamily: active ? 'Playfair Display, serif' : 'inherit',
                border: 'none',
                background: active
                  ? 'linear-gradient(135deg, var(--gold-light) 0%, var(--gold) 100%)'
                  : 'transparent',
                color: active ? 'var(--ink)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: active ? 'var(--shadow-gold)' : 'none',
              }}
            >
              <span style={{ fontSize: '0.9rem' }}>{d.icon}</span>
              {d.label}
            </button>
          );
        })}
      </div>

      {/* ── Year + Semester row ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '22px', alignItems: 'center', flexWrap: 'wrap' }}>

        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {accessibleYears.map((y) => {
            const active = activeYear === y;
            return (
              <button
                key={y}
                onClick={() => setActiveYear(y)}
                style={{
                  padding: '5px 13px',
                  borderRadius: '99px',
                  fontSize: '0.75rem',
                  fontWeight: active ? 700 : 500,
                  border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
                  background: active ? 'var(--gold-dim)' : 'transparent',
                  color: active ? 'var(--gold)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                Y{y}
              </button>
            );
          })}
        </div>

        <div style={{ width: '1px', height: '20px', background: 'var(--border)', flexShrink: 0 }} />

        <div style={{ display: 'flex', gap: '5px' }}>
          {SEMESTERS.map((s) => {
            const active = activeSemester === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSemester(s.id)}
                style={{
                  padding: '5px 13px',
                  borderRadius: '99px',
                  fontSize: '0.75rem',
                  fontWeight: active ? 700 : 500,
                  border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
                  background: active ? 'var(--gold-dim)' : 'transparent',
                  color: active ? 'var(--gold)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                S{s.id}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Course grid ──────────────────────────────────────────────────── */}
      {loading ? (
        <MiniLoader label="Loading courses..." />
      ) : (
        <>
          {courses.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '48px' }}>
              <p style={{ fontSize: '2rem', marginBottom: '10px' }}>📭</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '4px' }}>
                No courses for this selection.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                Try a different year, semester, or department.
              </p>
            </div>
          ) : (
            <>
              <p style={{
                fontSize: '0.62rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--gold)',
                opacity: 0.55,
                marginBottom: '12px',
              }}>
                {courses.length} course{courses.length !== 1 ? 's' : ''}
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '12px',
              }}>
                {courses.map((course) => (
                  <button
                    key={course.id}
                    onClick={() => router.push(`/dashboard/course/${course.id}`)}
                    className="card"
                    style={{
                      textAlign: 'left',
                      padding: '16px',
                      cursor: 'pointer',
                      width: '100%',
                      transition: 'all 0.2s ease',
                      background: 'var(--navy-card)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-hover)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = 'var(--shadow-gold)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'var(--shadow-card)';
                    }}
                  >
                    <div style={{
                      width: '28px',
                      height: '2px',
                      background: 'var(--gold)',
                      borderRadius: '99px',
                      marginBottom: '10px',
                      opacity: 0.6,
                    }} />

                    <div style={{
                      fontFamily: 'Playfair Display, serif',
                      color: 'var(--gold)',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      marginBottom: '4px',
                      lineHeight: 1.3,
                    }}>
                      {course.name}
                    </div>

                    {course.code && (
                      <div style={{
                        color: 'var(--text-muted)',
                        fontSize: '0.7rem',
                        marginBottom: '6px',
                        letterSpacing: '0.04em',
                      }}>
                        {course.code}
                      </div>
                    )}

                    {course.description && (
                      <div style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.74rem',
                        lineHeight: 1.55,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        marginBottom: '10px',
                      }}>
                        {course.description}
                      </div>
                    )}

                    <div style={{
                      fontSize: '0.65rem',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: 0.7,
                    }}>
                      <span>Y{course.year}</span>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span>S{course.semester}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
          </div>
  );
}

                                            
