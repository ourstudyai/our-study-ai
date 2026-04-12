'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { signOut } from '@/lib/firebase/auth';
import { getFilteredCourses } from '@/lib/firestore/courses';
import { Course } from '@/lib/types';

interface MobileMenuProps {
  onClose: () => void;
}

export default function MobileMenu({ onClose }: MobileMenuProps) {
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

  const handleCourseClick = (courseId: string) => {
    router.push(`/dashboard/course/${courseId}`);
    onClose();
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
    onClose();
  };

  const readinessDot = (status?: string) => {
    if (status === 'verified') return '#22c55e';
    if (status === 'partial') return '#facc15';
    return '#ef4444';
  };

  return (
    <div
      className="fixed inset-0 z-50 md:hidden flex flex-col animate-fade-in"
      style={{ background: 'var(--navy)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-600 to-yellow-800 flex items-center justify-center">
            <span className="text-base font-bold text-white">S</span>
          </div>
          <div>
            <h1 className="text-sm font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>Our Study AI</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {userProfile?.department === 'theology' ? '✝️ Theology' : '🏛️ Philosophy'} · Year {userProfile?.year} · Sem {userProfile?.currentSemester}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="btn-ghost text-xl px-3 py-2">✕</button>
      </div>

      {/* Course List */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
          Your Courses
        </p>

        {courses.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading courses...</p>
        )}

        {courses.map((course) => {
          const isActive = pathname.includes(`/course/${course.id}`);
          return (
            <button
              key={course.id}
              onClick={() => handleCourseClick(course.id)}
              className="w-full text-left p-4 rounded-xl mb-2 transition-all"
              style={{
                background: isActive ? 'var(--gold-dim)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isActive ? 'rgba(201,150,58,0.3)' : 'var(--border)'}`,
              }}
            >
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: readinessDot(course.readiness) }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: isActive ? 'var(--gold-light)' : 'var(--text-primary)' }}>{course.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{course.code}</p>
                </div>
              </div>
            </button>
          );
        })}

        <button
          onClick={() => { router.push('/dashboard'); onClose(); }}
          className="w-full text-left p-4 rounded-xl mb-2 flex items-center gap-3 mt-2"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
        >
          <span>🏠</span>
          <span className="text-sm font-medium">Dashboard</span>
        </button>
      </div>

      {/* Footer */}
      <div className="p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--gold-dim)', border: '1px solid var(--border-hover)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--gold-light)' }}>
                {userProfile?.displayName?.[0] || '?'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{userProfile?.displayName}</p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{userProfile?.email}</p>
            </div>
          </div>
          <button onClick={handleSignOut} className="btn-secondary text-xs flex-shrink-0">Sign Out</button>
        </div>
      </div>
    </div>
  );
}