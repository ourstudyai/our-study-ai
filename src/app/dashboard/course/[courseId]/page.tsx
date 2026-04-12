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
  plain_explainer: 'Ask about any concept...',
  practice_questions: 'Ask for practice questions...',
  exam_preparation: 'Ask an exam question or paste your draft...',
  progress_check: 'Explain a topic in your own words...',
  research: 'Ask any question for a sourced answer...',
  readiness_assessment: 'Type "Start assessment" to begin...',
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

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--navy)', color: 'var(--text-primary)' }}>

      {/* ── TOP BAR ── */}
      <div className="flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>

        {/* Row 1: back + title + desktop panel toggle */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <button onClick={() => router.back()} style={{ color: 'var(--gold)' }} className="text-sm">
            ← Back
          </button>
          {/* Desktop only — hide/show panel */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden md:block text-xs px-3 py-1 rounded-lg border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {sidebarOpen ? '▶ Hide Panel' : '◀ Show Panel'}
          </button>
        </div>

        {/* Course name */}
        <div className="px-4 pb-1">
          <h1 className="text-base md:text-xl font-bold leading-tight" style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif' }}>
            {course.name}
          </h1>
          <p className="text-xs hidden md:block mt-0.5" style={{ color: 'var(--text-secondary)' }}>{course.description}</p>
        </div>

        {/* Mode selector — horizontal scroll on mobile, wrap on desktop */}
        <div
          className="flex gap-1.5 px-4 pb-3 mt-1"
          style={{ overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id)}
              title={mode.description}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: activeMode === mode.id ? 'var(--gold)' : 'var(--navy-card)',
                color: activeMode === mode.id ? 'var(--navy)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              {mode.icon} <span className="hidden sm:inline">{mode.label}</span>
              <span className="sm:hidden">{mode.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-4 pb-4">
            {chatHistory.length === 0 && !streamingMessage && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-sm px-4">
                  <p className="text-3xl mb-2">{MODES.find(m => m.id === activeMode)?.icon}</p>
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--gold)' }}>
                    {MODES.find(m => m.id === activeMode)?.label}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {MODES.find(m => m.id === activeMode)?.description}
                  </p>
                </div>
              </div>
            )}

            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="rounded-2xl px-4 py-3 text-sm"
                  style={{
                    maxWidth: '85%',
                    background: msg.role === 'user' ? 'var(--gold)' : 'var(--navy-card)',
                    color: msg.role === 'user' ? 'var(--navy)' : 'var(--text-primary)',
                    border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  }}
                >
                  {msg.role === 'assistant' ? <MarkdownRenderer content={msg.content} /> : msg.content}
                </div>
              </div>
            ))}

            {streamingMessage && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-3 text-sm"
                  style={{ maxWidth: '85%', background: 'var(--navy-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                  <MarkdownRenderer content={streamingMessage} />
                  <span className="inline-block w-1.5 h-4 ml-1 animate-pulse" style={{ background: 'var(--gold)' }} />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input — pinned at bottom */}
          <div
            className="flex-shrink-0 px-3 md:px-6 py-3 border-t"
            style={{
              borderColor: 'var(--border)',
              paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
            }}
          >
            {/* Mobile: drawer toggle button above input */}
            <div className="flex md:hidden justify-end mb-2">
              <button
                onClick={() => setDrawerOpen(true)}
                className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', color: 'var(--gold)' }}
              >
                📚 Past Q · AOC · Memory
              </button>
            </div>

            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={PLACEHOLDERS[activeMode]}
                rows={2}
                className="flex-1 rounded-xl p-3 text-sm resize-none"
                style={{
                  background: 'var(--navy-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  minWidth: 0,
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={isStreaming || !input.trim()}
                className="px-4 py-3 rounded-xl font-medium text-sm flex-shrink-0"
                style={{
                  background: 'var(--gold)',
                  color: 'var(--navy)',
                  opacity: isStreaming || !input.trim() ? 0.6 : 1,
                }}
              >
                {isStreaming ? '...' : '↑'}
              </button>
            </div>
          </div>
        </div>

        {/* ── DESKTOP SIDE PANEL ── */}
        {sidebarOpen && (
          <div className="hidden md:flex w-72 flex-shrink-0 border-l flex-col" style={{ borderColor: 'var(--border)', background: 'var(--navy-card)' }}>
            <div className="flex border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
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
            <div className="flex-1 overflow-y-auto p-3">
              {activeSideTab === 'past-questions' && <PastQuestionsPanel courseId={courseId} onStudy={(text) => sendMessage(text)} />}
              {activeSideTab === 'aoc' && <AOCPanel courseId={courseId} onStudy={(text) => sendMessage(text)} />}
              {activeSideTab === 'memory' && <StudyMemoryPanel courseId={courseId} chatHistory={chatHistory} />}
            </div>
          </div>
        )}
      </div>

      {/* ── MOBILE BOTTOM DRAWER ── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setDrawerOpen(false); }}>
          <div
            className="flex flex-col rounded-t-2xl"
            style={{
              background: 'var(--navy-card)',
              border: '1px solid var(--border)',
              maxHeight: '75vh',
            }}
          >
            {/* Drawer handle */}
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="flex gap-2">
                {sideTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSideTab(tab.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: activeSideTab === tab.id ? 'var(--gold)' : 'transparent',
                      color: activeSideTab === tab.id ? 'var(--navy)' : 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setDrawerOpen(false)} style={{ color: 'var(--text-muted)' }} className="text-lg px-2">✕</button>
            </div>

            {/* Drawer content */}
            <div className="flex-1 overflow-y-auto p-4">
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