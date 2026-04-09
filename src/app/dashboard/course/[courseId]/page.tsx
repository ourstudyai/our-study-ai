// Course Chat Page — Main study interface
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { useChat } from '@/hooks/useChat';
import { Course, StudyMode, STUDY_MODE_LABELS, STUDY_MODE_ICONS, ChatSession } from '@/lib/types';
import ChatInterface from '@/components/chat/ChatInterface';
import ModeSelector from '@/components/chat/ModeSelector';
import SessionHistory from '@/components/chat/SessionHistory';
import { getUserSessions } from '@/lib/firestore/chat';

// Demo courses lookup
const DEMO_COURSES: Record<string, Course> = {
  'theo-101': { id: 'theo-101', name: 'Introduction to Sacred Scripture', code: 'THEO-101', department: 'theology', year: 1, semester: 1, description: 'Foundations of Biblical study including hermeneutics, the canon, inspiration, and major themes of the Old and New Testaments.', createdAt: '' },
  'theo-102': { id: 'theo-102', name: 'Fundamental Theology', code: 'THEO-102', department: 'theology', year: 1, semester: 1, description: 'The nature of revelation, faith, and the credibility of the Christian message.', createdAt: '' },
  'theo-103': { id: 'theo-103', name: 'Patristic Theology', code: 'THEO-103', department: 'theology', year: 1, semester: 1, description: 'Study of the Church Fathers and their contributions to the development of Christian doctrine.', createdAt: '' },
  'theo-104': { id: 'theo-104', name: 'Liturgy & Sacraments I', code: 'THEO-104', department: 'theology', year: 1, semester: 1, description: 'Theological foundations of Christian worship, the sacramental system, and the Eucharist.', createdAt: '' },
  'phil-101': { id: 'phil-101', name: 'Introduction to Philosophy', code: 'PHIL-101', department: 'philosophy', year: 1, semester: 1, description: 'Fundamental questions of philosophy: What is knowledge? What is real? What is the good?', createdAt: '' },
  'phil-102': { id: 'phil-102', name: 'Logic & Critical Thinking', code: 'PHIL-102', department: 'philosophy', year: 1, semester: 1, description: 'Formal and informal logic, valid argument forms, fallacies, and methods of sound reasoning.', createdAt: '' },
  'phil-103': { id: 'phil-103', name: 'Ancient Greek Philosophy', code: 'PHIL-103', department: 'philosophy', year: 1, semester: 1, description: 'From the Pre-Socratics through Plato and Aristotle.', createdAt: '' },
  'phil-104': { id: 'phil-104', name: 'Philosophy of Nature', code: 'PHIL-104', department: 'philosophy', year: 1, semester: 1, description: 'Philosophical analysis of the natural world: causality, teleology, substance, change.', createdAt: '' },
};

export default function CourseChatPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const { userProfile, firebaseUser } = useAuth();
  const router = useRouter();

  const [course, setCourse] = useState<Course | null>(null);
  const [activeMode, setActiveMode] = useState<StudyMode>('plain_explainer');
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  useEffect(() => {
    // Load course info (demo fallback)
    const demoCourse = DEMO_COURSES[courseId];
    if (demoCourse) {
      setCourse(demoCourse);
    }
  }, [courseId]);

  useEffect(() => {
    async function loadSessions() {
      if (!firebaseUser?.uid || !courseId) return;
      try {
        const userSessions = await getUserSessions(firebaseUser.uid, courseId);
        setSessions(userSessions);
      } catch (e) {
        // Firestore not configured yet — use empty
        setSessions([]);
      }
    }
    loadSessions();
  }, [firebaseUser?.uid, courseId]);

  const chat = useChat({
    courseId,
    courseName: course?.name || 'Unknown Course',
    courseDescription: course?.description || '',
    mode: activeMode,
    userId: firebaseUser?.uid || '',
  });

  const handleModeChange = (mode: StudyMode) => {
    setActiveMode(mode);
    // Clear chat when switching modes for clarity
    chat.setMessages([]);
    chat.setSessionId(null);
  };

  const handleSessionSelect = (session: ChatSession) => {
    setActiveMode(session.mode);
    chat.setSessionId(session.id);
    setShowHistory(false);
    // Messages would be loaded from Firestore here
  };

  if (!course) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">📚</div>
          <h3 className="text-lg font-semibold mb-2">Course Not Found</h3>
          <button onClick={() => router.push('/dashboard')} className="btn-primary mt-4">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Course Header + Mode Selector */}
      <div className="flex-shrink-0 border-b px-4 py-3"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-secondary)' }}>

        {/* Course info row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => router.push('/dashboard')}
              className="btn-ghost text-sm flex-shrink-0">
              ←
            </button>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">{course.name}</h2>
              <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                {course.code} · {STUDY_MODE_LABELS[activeMode]}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* History button */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="btn-ghost text-xs"
              title="Session history"
            >
              🕐
            </button>
          </div>
        </div>

        {/* Mode selector */}
        <ModeSelector activeMode={activeMode} onModeChange={handleModeChange} />
      </div>

      {/* Main chat area */}
      <div className="flex-1 relative overflow-hidden">
        <ChatInterface
          messages={chat.messages}
          isStreaming={chat.isStreaming}
          error={chat.error}
          onSendMessage={chat.sendMessage}
          onRegenerate={chat.regenerateLastResponse}
          onRetry={chat.retryLastMessage}
          courseName={course.name}
          mode={activeMode}
          courseId={courseId}
          userId={firebaseUser?.uid || ''}
          userEmail={firebaseUser?.email || ''}
        />

        {/* Session History Panel */}
        {showHistory && (
          <SessionHistory
            sessions={sessions}
            onSelectSession={handleSessionSelect}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    </div>
  );
}
