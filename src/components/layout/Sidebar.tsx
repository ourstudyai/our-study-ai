// Sidebar — Course list with readiness badges
'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { signOut } from '@/lib/firebase/auth';
import { Course } from '@/lib/types';
import { getFilteredCourses } from '@/lib/firestore/courses';

// Same demo courses as dashboard
const DEMO_COURSES: Course[] = [
  { id: 'theo-101', name: 'Introduction to Sacred Scripture', code: 'THEO-101', department: 'theology', year: 1, semester: 1, description: '', createdAt: '' },
  { id: 'theo-102', name: 'Fundamental Theology', code: 'THEO-102', department: 'theology', year: 1, semester: 1, description: '', createdAt: '' },
  { id: 'theo-103', name: 'Patristic Theology', code: 'THEO-103', department: 'theology', year: 1, semester: 1, description: '', createdAt: '' },
  { id: 'theo-104', name: 'Liturgy & Sacraments I', code: 'THEO-104', department: 'theology', year: 1, semester: 1, description: '', createdAt: '' },
  { id: 'phil-101', name: 'Introduction to Philosophy', code: 'PHIL-101', department: 'philosophy', year: 1, semester: 1, description: '', createdAt: '' },
  { id: 'phil-102', name: 'Logic & Critical Thinking', code: 'PHIL-102', department: 'philosophy', year: 1, semester: 1, description: '', createdAt: '' },
  { id: 'phil-103', name: 'Ancient Greek Philosophy', code: 'PHIL-103', department: 'philosophy', year: 1, semester: 1, description: '', createdAt: '' },
  { id: 'phil-104', name: 'Philosophy of Nature', code: 'PHIL-104', department: 'philosophy', year: 1, semester: 1, description: '', createdAt: '' },
];

export default function Sidebar() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    async function loadCourses() {
      if (!userProfile?.department || !userProfile?.year || !userProfile?.currentSemester) return;

      try {
        const filtered = await getFilteredCourses(
          userProfile.department,
          userProfile.year,
          userProfile.currentSemester
        );
        if (filtered.length > 0) {
          setCourses(filtered);
        } else {
          setCourses(DEMO_COURSES.filter(
            (c) => c.department === userProfile.department && c.year === userProfile.year && c.semester === userProfile.currentSemester
          ));
        }
      } catch {
        setCourses(DEMO_COURSES.filter(
          (c) => c.department === userProfile.department && c.year === userProfile.year && c.semester === userProfile.currentSemester
        ));
      }
    }
    loadCourses();
  }, [userProfile]);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const activeCourseId = pathname.includes('/course/') ? pathname.split('/course/')[1] : null;

  return (
    <aside
      className="hidden md:flex flex-col fixed left-0 top-0 h-full z-30 border-r"
      style={{
        width: 'var(--sidebar-width)',
        background: 'var(--navy-mid)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Logo */}
      <div className="p-4 flex items-center gap-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-seminary-gold to-seminary-burgundy flex items-center justify-center flex-shrink-0">
          <span className="text-lg font-bold text-white font-display">S</span>
        </div>
        <div>
          <h1 className="text-sm font-bold font-display">Our Study AI</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {userProfile?.department === 'theology' ? '✝️' : '🏛️'} Year {userProfile?.year} · Sem {userProfile?.currentSemester}
          </p>
        </div>
      </div>

      {/* Course List */}
      <div className="flex-1 overflow-y-auto p-3">
        <p className="text-xs font-medium uppercase tracking-wider mb-3 px-2"
          style={{ color: 'var(--text-muted)' }}>
          Your Courses
        </p>

        {courses.map((course) => (
          <button
            key={course.id}
            onClick={() => router.push(`/dashboard/course/${course.id}`)}
            className={`sidebar-item mb-1 w-full ${activeCourseId === course.id ? 'active' : ''}`}
            id={`sidebar-course-${course.id}`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{course.name}</p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {course.code}
              </p>
            </div>
            {/* Readiness badge */}
            <span className="badge-blue text-xs flex-shrink-0">—%</span>
          </button>
        ))}
      </div>

      {/* Dashboard link */}
      <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => router.push('/dashboard')}
          className={`sidebar-item w-full ${pathname === '/dashboard' ? 'active' : ''}`}
        >
          <span>🏠</span>
          <span className="text-sm">Dashboard</span>
        </button>
      </div>

      {/* User footer */}
      <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">
              {userProfile?.displayName?.[0] || '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{userProfile?.displayName}</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              {userProfile?.email}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="btn-ghost text-xs flex-shrink-0"
            title="Sign out"
          >
            ↗
          </button>
        </div>
      </div>
    </aside>
  );
}
