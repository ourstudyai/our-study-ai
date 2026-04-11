'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { getCourse } from '@/lib/firestore/courses';
import TopicsPanel from '@/components/course/TopicsPanel';
import PastQuestionsPanel from '@/components/course/PastQuestionsPanel';
import AOCPanel from '@/components/course/AOCPanel';
import StudyMemoryPanel from '@/components/course/StudyMemoryPanel';

type TabType = 'topics' | 'past-questions' | 'aoc' | 'memory';

export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [course, setCourse] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabType>('topics');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser || !courseId) return;
    getCourse(courseId).then((data) => {
      setCourse(data);
      setLoading(false);
    });
  }, [user, courseId]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--navy)' }}>
      <p style={{ color: 'var(--gold)' }}>Loading course...</p>
    </div>
  );

  if (!course) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--navy)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Course not found.</p>
    </div>
  );

  const tabs: { id: TabType; label: string }[] = [
    { id: 'topics', label: 'Topics' },
    { id: 'past-questions', label: 'Past Questions' },
    { id: 'aoc', label: 'AOC' },
    { id: 'memory', label: 'Study Memory' },
  ];

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--navy)', color: 'var(--text-primary)' }}>
      <button onClick={() => router.back()} style={{ color: 'var(--gold)' }} className="mb-4 text-sm hover:underline">
        ← Back
      </button>
      <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif' }}>
        {course.name}
      </h1>
      <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>{course.description}</p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2 rounded text-sm font-medium transition-all"
            style={{
              background: activeTab === tab.id ? 'var(--gold)' : 'var(--navy-card)',
              color: activeTab === tab.id ? 'var(--navy)' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'topics' && <TopicsPanel courseId={courseId} />}
        {activeTab === 'past-questions' && <PastQuestionsPanel courseId={courseId} />}
        {activeTab === 'aoc' && <AOCPanel courseId={courseId} />}
        {activeTab === 'memory' && <StudyMemoryPanel courseId={courseId} />}
      </div>
    </div>
  );
}