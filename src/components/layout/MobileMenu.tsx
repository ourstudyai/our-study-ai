// Mobile Menu — Full-screen overlay with course list
'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { signOut } from '@/lib/firebase/auth';
import { Course } from '@/lib/types';

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

interface MobileMenuProps {
  onClose: () => void;
}

export default function MobileMenu({ onClose }: MobileMenuProps) {
  const { userProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const courses = DEMO_COURSES.filter(
    (c) =>
      c.department === userProfile?.department &&
      c.year === userProfile?.year &&
      c.semester === userProfile?.currentSemester
  );

  const handleCourseClick = (courseId: string) => {
    router.push(`/dashboard/course/${courseId}`);
    onClose();
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 md:hidden animate-fade-in" style={{ background: 'var(--navy)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-seminary-gold to-seminary-burgundy flex items-center justify-center">
            <span className="text-lg font-bold text-white font-display">S</span>
          </div>
          <div>
            <h1 className="text-sm font-bold font-display">Our Study AI</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {userProfile?.department === 'theology' ? '✝️ Theology' : '🏛️ Philosophy'} · Year {userProfile?.year}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="btn-ghost text-lg">✕</button>
      </div>

      {/* Course List */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-xs font-medium uppercase tracking-wider mb-4"
          style={{ color: 'var(--text-muted)' }}>
          Your Courses
        </p>

        {courses.map((course) => {
          const isActive = pathname.includes(`/course/${course.id}`);
          return (
            <button
              key={course.id}
              onClick={() => handleCourseClick(course.id)}
              className={`w-full text-left p-4 rounded-xl mb-2 transition-all duration-200 ${isActive ? '' : ''
                }`}
              style={{
                background: isActive ? 'rgba(124, 108, 240, 0.1)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isActive ? 'rgba(124, 108, 240, 0.3)' : 'var(--border)'}`,
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{course.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{course.code}</p>
                </div>
                <span className="badge-blue">—%</span>
              </div>
            </button>
          );
        })}

        {/* Dashboard */}
        <button
          onClick={() => { router.push('/dashboard'); onClose(); }}
          className="w-full text-left p-4 rounded-xl mb-2 flex items-center gap-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
        >
          <span>🏠</span>
          <span className="text-sm font-medium">Dashboard</span>
        </button>
      </div>

      {/* Footer */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <span className="text-sm font-bold text-white">{userProfile?.displayName?.[0]}</span>
            </div>
            <div>
              <p className="text-sm font-medium">{userProfile?.displayName}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{userProfile?.email}</p>
            </div>
          </div>
          <button onClick={handleSignOut} className="btn-secondary text-xs">Sign Out</button>
        </div>
      </div>
    </div>
  );
}
