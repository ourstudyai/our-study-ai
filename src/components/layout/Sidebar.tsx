'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { signOut } from '@/lib/firebase/auth';
import { Course } from '@/lib/types';
import { getFilteredCourses } from '@/lib/firestore/courses';

export default function Sidebar() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    if (!userProfile?.department || !userProfile?.year || !userProfile?.currentSemester) return;
    getFilteredCourses(userProfile.department, userProfile.year, userProfile.currentSemester)
      .then(setCourses)
      .catch(console.error);
  }, [userProfile]);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const activeCourseId = pathname.includes('/course/')
    ? pathname.split('/course/')[1]
    : null;

  const readinessDot = (status?: string) => {
    if (status === 'verified') return '#22c55e';
    if (status === 'partial') return '#facc15';
    return '#ef4444';
  };

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
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-600 to-yellow-800 flex items-center justify-center flex-shrink-0">
          <span className="text-lg font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>S</span>
        </div>
        <div>
          <h1 className="text-sm font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>Our Study AI</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {userProfile?.department === 'theology' ? '✝️' : '🏛️'} Year {userProfile?.year} · Sem {userProfile?.currentSemester}
          </p>
        </div>
      </div>

      {/* Course List */}
      <div className="flex-1 overflow-y-auto p-3">
        <p className="text-xs font-medium uppercase tracking-wider mb-3 px-2" style={{ color: 'var(--text-muted)' }}>
          Your Courses
        </p>
        {courses.map((course) => (
          <button
            key={course.id}
            onClick={() => router.push(`/dashboard/course/${course.id}`)}
            className={`sidebar-item mb-1 w-full ${activeCourseId === course.id ? 'active' : ''}`}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: readinessDot(course.readiness) }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{course.name}</p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{course.code}</p>
            </div>
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
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--gold-dim)', border: '1px solid var(--border-hover)' }}>
            <span className="text-xs font-bold" style={{ color: 'var(--gold-light)' }}>
              {userProfile?.displayName?.[0] || '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{userProfile?.displayName}</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{userProfile?.email}</p>
          </div>
          <button onClick={handleSignOut} className="btn-ghost text-xs flex-shrink-0" title="Sign out">↗</button>
        </div>
      </div>
    </aside>
  );
}