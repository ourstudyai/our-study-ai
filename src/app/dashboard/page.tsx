'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { getFilteredCourses } from '@/lib/firestore/courses';
import { Course } from '@/lib/types';

export default function DashboardPage() {
  const { firebaseUser, userProfile } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser || !userProfile) return;

    const dept = userProfile.department;
    const year = userProfile.year;
    const sem = userProfile.currentSemester;

    if (!dept || !year || !sem) {
      setLoading(false);
      return;
    }

    getFilteredCourses(dept, year, sem)
      .then((data) => setCourses(data))
      .catch(console.error)
      .finally(() => setLoading(false));

  }, [firebaseUser, userProfile]);

  const readinessColor = (status?: string) => {
    if (status === 'verified') return '#22c55e';
    if (status === 'partial') return '#facc15';
    return '#ef4444';
  };

  return (
    <div className="p-6" style={{ color: 'var(--text-primary)' }}>
      <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif' }}>
        Welcome back{userProfile?.displayName ? `, ${userProfile.displayName}` : ''}
      </h1>

      {userProfile && (
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          {userProfile.department?.charAt(0).toUpperCase()}{userProfile.department?.slice(1)} · Year {userProfile.year} · Semester {userProfile.currentSemester}
        </p>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading your courses...</p>
      ) : courses.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-lg mb-2" style={{ color: 'var(--text-muted)' }}>No courses found for your current profile.</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Check that your department, year and semester are set correctly in your profile.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => (
            <div
              key={course.id}
              onClick={() => router.push(`/dashboard/course/${course.id}`)}
              className="p-4 rounded-xl cursor-pointer hover:scale-105 transition-transform"
              style={{ background: 'var(--navy-card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: readinessColor(course.readiness) }}
                  title={course.readiness || 'empty'}
                />
                <h2 className="font-semibold" style={{ color: 'var(--gold)' }}>{course.name}</h2>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{course.code}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}