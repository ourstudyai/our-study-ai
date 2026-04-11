'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export default function DashboardPage() {
  const { firebaseUser, userProfile } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<any[]>([]);

  useEffect(() => {
    if (!firebaseUser) return;
    const fetchCourses = async () => {
      const q = query(collection(db, 'courses'), where('userId', '==', firebaseUser.uid));
      const snap = await getDocs(q);
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchCourses();
  }, [firebaseUser]);

  return (
    <div className="p-6" style={{ color: 'var(--text-primary)' }}>
      <h1 className="text-3xl font-bold mb-6" style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif' }}>
        Welcome back{userProfile?.displayName ? `, ${userProfile.displayName}` : ''}
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((course) => (
          <div
            key={course.id}
            onClick={() => router.push(`/dashboard/course/${course.id}`)}
            className="p-4 rounded-xl cursor-pointer hover:scale-105 transition-transform"
            style={{ background: 'var(--navy-card)', border: '1px solid var(--border)' }}
          >
            <h2 className="font-semibold mb-1" style={{ color: 'var(--gold)' }}>{course.name}</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{course.code}</p>
          </div>
        ))}
      </div>
    </div>
  );
}