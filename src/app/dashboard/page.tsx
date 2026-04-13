'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { getCourseById } from '@/lib/firestore/courses';
import PastQuestionsPanel from '@/components/course/PastQuestionsPanel';
import AOCPanel from '@/components/course/AOCPanel';
import StudyMemoryPanel from '@/components/course/StudyMemoryPanel';
import ReactMarkdown from 'react-markdown';

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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const PLACEHOLDERS: Record<string, string> = {
  plain_explainer: 'Ask about any concept or paste a confusing passage...',
  practice_questions: 'Ask for practice questions, e.g. "Give me 5 questions on sacraments"',
  exam_preparation: 'Ask an exam question or paste your draft answer for review...',
  progress_check: 'Explain a topic in your own words and I will assess you...',
  research: 'Ask any question for a deeply sourced answer...',
  readiness_assessment: 'Type "Start assessment" to begin your exam readiness check...',
};

const MarkdownRenderer = ({ content }: { content: string }) => (
  <ReactMarkdown
    components={{
      h1: ({ children }) => <h1 style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif', fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{children}</h1>,
      h2: ({ children }) => <h2 style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.4rem', marginTop: '1rem' }}>{children}</h2>,
      h3: ({ children }) => <h3 style={{ color: 'var(--gold)', fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.3rem', marginTop: '0.8rem' }}>{children}</h3>,
      p: ({ children }) => <p style={{ marginBottom: '0.8rem', lineHeight: '1.8' }}>{children}</p>,
      strong: ({ children }) => <strong style={{ color: 'var(--gold)', fontWeight: 'bold' }}>{children}</strong>,
      em: ({ children }) => <em style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>{children}</em>,
      ul: ({ children }) => <ul style={{ paddingLeft: '1.5rem', marginBottom: '0.8rem', listStyleType: 'disc' }}>{children}</ul>,
      ol: ({ children }) => <ol style={{ paddingLeft: '1.5rem', marginBottom: '0.8rem', listStyleType: 'decimal' }}>{children}</ol>,
      li: ({ children }) => <li style={{ marginBottom: '0.3rem', lineHeight: '1.7' }}>{children}</li>,
      blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--gold)', paddingLeft: '1rem', margin: '0.8rem 0', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{children}</blockquote>,
    }}
  >
    {content}
  </ReactMarkdown>
);

export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { firebaseUser } = useAuth();
  const router = useRouter();
  const [course, setCourse] = useState<any>(null);
  const [activeMode, setActiveMode] = useState<StudyMode>('plain_explainer');
  const [activeSideTab, setActiveSideTab] = useState<SideTab>('past-questions');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!firebaseUser || !courseId) return;
    getCourseById(courseId).then((data) => {
      setCourse(data);
      setLoading(false);
    });
  }, [firebaseUser, courseId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, streamingMessage]);

  const sendMessage = async (text?: string) => {
    const message = text || input;
    if (!message.trim() || isStreaming) return;
    setInput('');
    if (drawerOpen) setDrawerOpen(false);

    const userMsg: ChatMessage = { role: 'user', content: message, timestamp: new Date().toISOString() };
    setChatHistory(prev => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamingMessage('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          courseId,
          courseName: course?.name || '',
          courseDescription: course?.description || '',
          mode: activeMode,
          conversationHistory: chatHistory.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.type === 'text' && json.content) {
                fullResponse += json.content;
                setStreamingMessage(fullResponse);
              }
            } catch { }
          }
        }
      }

      const aiMsg: ChatMessage = { role: 'assistant', content: fullResponse, timestamp: new Date().toISOString() };
      setChatHistory(prev => [...prev, aiMsg]);
      setStreamingMessage('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsStreaming(false);
    }
  };

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
    { id: 'aoc', label: 'AOC', icon: '🎯' },
    { id: 'memory', label: 'Memory', icon: '🧠' },
  ];

  const isEmpty = chatHistory.length === 0 && !streamingMessage;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--navy)', color: 'var(--text-primary)' }}>

      {/* TOP BAR */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 16px', gap: '8px' }}>
          <button onClick={() => router.back()} style={{ color: 'var(--gold)', fontSize: '0.85rem', flexShrink: 0 }}>← Back</button>

          {/* Contribute button — links to /contribute with course pre-selected */}
          <button
            onClick={() => router.push(`/contribute?courseId=${courseId}`)}
            style={{
              fontSize: '0.7rem',
              padding: '3px 8px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              background: 'transparent',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            📤 Contribute
          </button>

          <h1 style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif', fontSize: '1rem', fontWeight: 'bold', flex: 1, textAlign: 'center', margin: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {course.name}
          </h1>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden md:block"
            style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'transparent', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {sidebarOpen ? '▶ Hide' : '◀ Show'}
          </button>
        </div>

        {/* Modes */}
        <div style={{ display: 'flex', gap: '5px', padding: '2px 12px 5px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id)}
              title={mode.description}
              style={{
                flexShrink: 0,
                padding: '3px 9px',
                borderRadius: '8px',
                fontSize: '0.7rem',
                fontWeight: 500,
                border: '1px solid var(--border)',
                background: activeMode === mode.id ? 'var(--gold)' : 'var(--navy-card)',
                color: activeMode === mode.id ? 'var(--navy)' : 'var(--text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {mode.icon} {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: isEmpty ? 'center' : 'flex-end' }}>
            {isEmpty && (
              <div style={{ textAlign: 'center', maxWidth: '320px', padding: '0 16px', margin: '0 auto' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>{MODES.find(m => m.id === activeMode)?.icon}</div>
                <div style={{ color: 'var(--gold)', fontWeight: 600, marginBottom: '4px', fontSize: '0.9rem' }}>{MODES.find(m => m.id === activeMode)?.label}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{MODES.find(m => m.id === activeMode)?.description}</div>
              </div>
            )}

            {chatHistory.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%',
                  borderRadius: '16px',
                  padding: '10px 14px',
                  fontSize: '0.875rem',
                  background: msg.role === 'user' ? 'var(--gold)' : 'var(--navy-card)',
                  color: msg.role === 'user' ? 'var(--navy)' : 'var(--text-primary)',
                  border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                }}>
                  {msg.role === 'assistant' ? <MarkdownRenderer content={msg.content} /> : msg.content}
                </div>
              </div>
            ))}

            {streamingMessage && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ maxWidth: '85%', borderRadius: '16px', padding: '10px 14px', fontSize: '0.875rem', background: 'var(--navy-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                  <MarkdownRenderer content={streamingMessage} />
                  <span style={{ display: 'inline-block', width: '6px', height: '16px', marginLeft: '4px', background: 'var(--gold)', animation: 'pulse 1s infinite' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ flexShrink: 0, padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
            <div className="md:hidden" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '5px' }}>
              <button
                onClick={() => setDrawerOpen(true)}
                style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '8px', background: 'var(--navy-card)', border: '1px solid var(--border)', color: 'var(--gold)', cursor: 'pointer' }}
              >
                📚 Past Q · AOC · Memory
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={PLACEHOLDERS[activeMode]}
                rows={2}
                style={{
                  flex: 1, borderRadius: '12px', padding: '8px 12px', fontSize: '0.875rem',
                  resize: 'none', background: 'var(--navy-card)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', minWidth: 0, outline: 'none',
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={isStreaming || !input.trim()}
                style={{
                  flexShrink: 0, padding: '8px 16px', borderRadius: '12px', fontWeight: 600,
                  fontSize: '0.875rem', background: 'var(--gold)', color: 'var(--navy)', border: 'none',
                  cursor: isStreaming || !input.trim() ? 'not-allowed' : 'pointer',
                  opacity: isStreaming || !input.trim() ? 0.6 : 1,
                }}
              >
                {isStreaming ? '...' : '↑'}
              </button>
            </div>
          </div>
        </div>

        {/* DESKTOP SIDE PANEL */}
        {sidebarOpen && (
          <div
            className="hidden md:flex"
            style={{ width: '272px', flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--navy-card)', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              {sideTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSideTab(tab.id)}
                  style={{
                    flex: 1, padding: '8px 4px', fontSize: '0.72rem', fontWeight: 500,
                    background: activeSideTab === tab.id ? 'var(--navy)' : 'transparent',
                    color: activeSideTab === tab.id ? 'var(--gold)' : 'var(--text-secondary)',
                    border: 'none',
                    borderBottom: activeSideTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {activeSideTab === 'past-questions' && <PastQuestionsPanel courseId={courseId} onStudy={(text) => sendMessage(text)} />}
              {activeSideTab === 'aoc' && <AOCPanel courseId={courseId} onStudy={(text) => sendMessage(text)} />}
              {activeSideTab === 'memory' && <StudyMemoryPanel courseId={courseId} chatHistory={chatHistory} />}
            </div>
          </div>
        )}
      </div>

      {/* MOBILE BOTTOM DRAWER */}
      {drawerOpen && (
        <div
          className="md:hidden"
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setDrawerOpen(false); }}
        >
          <div style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '16px 16px 0 0', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {sideTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSideTab(tab.id)}
                    style={{
                      padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 500,
                      background: activeSideTab === tab.id ? 'var(--gold)' : 'transparent',
                      color: activeSideTab === tab.id ? 'var(--navy)' : 'var(--text-secondary)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                    }}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setDrawerOpen(false)} style={{ color: 'var(--text-muted)', fontSize: '1.2rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {activeSideTab === 'past-questions' && <PastQuestionsPanel courseId={courseId} onStudy={(text) => sendMessage(text)} />}
              {activeSideTab === 'aoc' && <AOCPanel courseId={courseId} onStudy={(text) => sendMessage(text)} />}
              {activeSideTab === 'memory' && <StudyMemoryPanel courseId={courseId} chatHistory={chatHistory} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}