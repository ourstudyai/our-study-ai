'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { getCourseById } from '@/lib/firestore/courses';
import TopicsPanel from '@/components/course/TopicsPanel';
import PastQuestionsPanel from '@/components/course/PastQuestionsPanel';
import AOCPanel from '@/components/course/AOCPanel';
import StudyMemoryPanel from '@/components/course/StudyMemoryPanel';

type StudyMode = 'plain_explainer' | 'practice_questions' | 'exam_preparation' | 'progress_check' | 'research' | 'readiness_assessment';

const MODES: { id: StudyMode; label: string; icon: string; description: string }[] = [
    { id: 'plain_explainer', label: 'Plain Explainer', icon: '💡', description: 'Understand any concept in plain language' },
    { id: 'practice_questions', label: 'Practice Questions', icon: '❓', description: 'Test yourself with course-based questions' },
    { id: 'exam_preparation', label: 'Exam Prep', icon: '📝', description: 'Write and review full exam answers' },
    { id: 'progress_check', label: 'Progress Check', icon: '📊', description: 'Assess your understanding of a topic' },
    { id: 'research', label: 'Research', icon: '🔬', description: 'Deep answers with full citations' },
    { id: 'readiness_assessment', label: 'Exam Readiness', icon: '🎯', description: 'Full assessment across all course topics' },
];

type SideTab = 'past-questions' | 'aoc' | 'memory';

export default function CoursePage() {
    const { courseId } = useParams<{ courseId: string }>();
    const { firebaseUser } = useAuth();
    const router = useRouter();
    const [course, setCourse] = useState<any>(null);
    const [activeMode, setActiveMode] = useState<StudyMode>('plain_explainer');
    const [activeSideTab, setActiveSideTab] = useState<SideTab>('past-questions');
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    useEffect(() => {
        if (!firebaseUser || !courseId) return;
        getCourseById(courseId).then((data) => {
            setCourse(data);
            setLoading(false);
        });
    }, [firebaseUser, courseId]);

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

    const sideTabs: { id: SideTab; label: string; icon: string }[] = [
        { id: 'past-questions', label: 'Past Questions', icon: '📝' },
        { id: 'aoc', label: 'Areas of Concentration', icon: '🎯' },
        { id: 'memory', label: 'Study Memory', icon: '🧠' },
    ];

    return (
        <div className="min-h-screen flex flex-col" style={{ background: 'var(--navy)', color: 'var(--text-primary)' }}>

            {/* Top bar */}
            <div className="px-6 pt-5 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <button onClick={() => router.back()} style={{ color: 'var(--gold)' }} className="mb-2 text-sm hover:underline">
                    ← Back
                </button>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif' }}>
                            {course.name}
                        </h1>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{course.description}</p>
                    </div>
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                        {sidebarOpen ? '▶ Hide Panel' : '◀ Show Panel'}
                    </button>
                </div>

                {/* Mode selector */}
                <div className="flex gap-2 mt-4 flex-wrap">
                    {MODES.map((mode) => (
                        <button
                            key={mode.id}
                            onClick={() => setActiveMode(mode.id)}
                            title={mode.description}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                            style={{
                                background: activeMode === mode.id ? 'var(--gold)' : 'var(--navy-card)',
                                color: activeMode === mode.id ? 'var(--navy)' : 'var(--text-secondary)',
                                border: '1px solid var(--border)',
                            }}
                        >
                            {mode.icon} {mode.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">

                {/* Chat area */}
                <div className="flex-1 overflow-y-auto">
                    <TopicsPanel courseId={courseId} mode={activeMode} />
                </div>

                {/* Side panel */}
                {sidebarOpen && (
                    <div className="w-80 flex-shrink-0 border-l flex flex-col" style={{ borderColor: 'var(--border)', background: 'var(--navy-card)' }}>
                        {/* Side tabs */}
                        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
                            {sideTabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveSideTab(tab.id)}
                                    className="flex-1 py-2.5 text-xs font-medium transition-colors"
                                    style={{
                                        background: activeSideTab === tab.id ? 'var(--navy)' : 'transparent',
                                        color: activeSideTab === tab.id ? 'var(--gold)' : 'var(--text-secondary)',
                                        borderBottom: activeSideTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent',
                                    }}
                                >
                                    {tab.icon} {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Side content */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {activeSideTab === 'past-questions' && <PastQuestionsPanel courseId={courseId} />}
                            {activeSideTab === 'aoc' && <AOCPanel courseId={courseId} />}
                            {activeSideTab === 'memory' && <StudyMemoryPanel courseId={courseId} />}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}