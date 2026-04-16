// src/app/dashboard/course/[courseId]/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { getCourseById } from '@/lib/firestore/courses';
import PastQuestionsPanel from '@/components/course/PastQuestionsPanel';
import AOCPanel from '@/components/course/AOCPanel';
import StudyMemoryPanel from '@/components/course/StudyMemoryPanel';
import SettingsPanel from '@/components/SettingsPanel';
import ReactMarkdown from 'react-markdown';
import { useSettings } from '@/components/AppShell';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

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
  practice_questions: 'Ask for practice questions...',
  exam_preparation: 'Ask an exam question or paste your draft...',
  progress_check: 'Explain a topic in your own words...',
  research: 'Ask any question for a sourced answer...',
  readiness_assessment: 'Type "Start assessment" to begin...',
};

/* ── Markdown renderer ──────────────────────────────────────────────────── */
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

/* ── Draggable floating settings button ─────────────────────────────────── */
function DraggableSettingsButton({ onClick, topOverride }: { onClick: () => void; topOverride: number }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPos({ x: window.innerWidth - 310, y: topOverride });
  }, [topOverride]);

  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

  const startHold = (cx: number, cy: number) => {
    if (!pos) return;
    holdTimer.current = setTimeout(() => {
      dragging.current = true;
      didDrag.current = false;
      offset.current = { x: cx - pos.x, y: cy - pos.y };
    }, 300);
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      didDrag.current = true;
      setPos({ x: clamp(e.clientX - offset.current.x, 0, window.innerWidth - 56), y: clamp(e.clientY - offset.current.y, 0, window.innerHeight - 56) });
    };
    const up = () => { if (holdTimer.current) clearTimeout(holdTimer.current); dragging.current = false; };
    const tmove = (e: TouchEvent) => {
      if (!dragging.current) return;
      didDrag.current = true;
      const t = e.touches[0];
      setPos({ x: clamp(t.clientX - offset.current.x, 0, window.innerWidth - 56), y: clamp(t.clientY - offset.current.y, 0, window.innerHeight - 56) });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', tmove, { passive: true });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', tmove);
      window.removeEventListener('touchend', up);
    };
  }, []);

  if (!pos) return null;

  return (
    <button
      onMouseDown={e => startHold(e.clientX, e.clientY)}
      onTouchStart={e => { const t = e.touches[0]; startHold(t.clientX, t.clientY); }}
      onClick={() => { if (!didDrag.current) onClick(); didDrag.current = false; }}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999,
        cursor: 'grab', touchAction: 'none', userSelect: 'none',
        width: '44px', height: '44px', borderRadius: '50%',
        background: 'var(--navy-card)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.2rem', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        transition: 'box-shadow 0.2s',
      }}
      title="Settings (hold to move)"
    >
      ⚙️
    </button>
  );
}

/* ── Per-message action bar ─────────────────────────────────────────────── */
interface MessageActionsProps {
  message: ChatMessage;
  messageIndex: number;
  courseId: string;
  userId: string;
  onRegenerate: () => void;
}

function MessageActions({ message, messageIndex, courseId, userId, onRegenerate }: MessageActionsProps) {
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [copied, setCopied] = useState(false);

  const btnStyle = (active = false): React.CSSProperties => ({
    background: 'none',
    border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
    borderRadius: '6px',
    padding: '4px 8px',
    cursor: 'pointer',
    color: active ? 'var(--gold)' : 'var(--text-muted)',
    fontSize: '0.78rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.15s ease',
  });

  const sendFeedback = async (type: 'like' | 'dislike') => {
    try {
      await addDoc(collection(db, 'feedback'), {
        type,
        messageContent: message.content,
        courseId,
        userId,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error('Feedback write failed:', err);
    }
  };

  const handleLike = async () => {
    if (liked) return;
    setLiked(true);
    setDisliked(false);
    await sendFeedback('like');
  };

  const handleDislike = async () => {
    if (disliked) return;
    setDisliked(true);
    setLiked(false);
    await sendFeedback('dislike');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: message.content });
      } catch { /* user cancelled */ }
    } else {
      await handleCopy(); // fallback
    }
  };

  return (
    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap', paddingLeft: '4px' }}>
      {/* Like */}
      <button style={btnStyle(liked)} onClick={handleLike} title="Helpful">
        <i className="fa-regular fa-thumbs-up" />
      </button>

      {/* Dislike */}
      <button style={btnStyle(disliked)} onClick={handleDislike} title="Not helpful">
        <i className="fa-regular fa-thumbs-down" />
      </button>

      {/* Copy */}
      <button style={btnStyle(copied)} onClick={handleCopy} title="Copy to clipboard">
        <i className={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'} />
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>

      {/* Regenerate */}
      <button style={btnStyle()} onClick={onRegenerate} title="Regenerate response">
        <i className="fa-solid fa-rotate-right" />
        <span>Retry</span>
      </button>

      {/* Share */}
      <button style={btnStyle()} onClick={handleShare} title="Share this response">
        <i className="fa-solid fa-share-from-square" />
      </button>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */
export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { firebaseUser } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();

  const [course, setCourse] = useState<any>(null);
  const [activeMode, setActiveMode] = useState<StudyMode>('plain_explainer');
  const [activeSideTab, setActiveSideTab] = useState<SideTab>('past-questions');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* Inject Font Awesome */
  useEffect(() => {
    const id = 'fa-cdn';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (!firebaseUser || !courseId) return;
    getCourseById(courseId).then(data => { setCourse(data); setLoading(false); });
  }, [firebaseUser, courseId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, streamingMessage]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px';
    }
  }, [input]);

  /* ── Send / stream ── */
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
      let buffer = '', fullResponse = '';

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

  /* ── Regenerate: resend the last user message, replace last AI message ── */
  const regenerate = (aiMessageIndex: number) => {
    // Find the user message that preceded this AI response
    let lastUserMsg = '';
    for (let i = aiMessageIndex - 1; i >= 0; i--) {
      if (chatHistory[i].role === 'user') { lastUserMsg = chatHistory[i].content; break; }
    }
    if (!lastUserMsg) return;
    // Strip the AI message being replaced and everything after it
    setChatHistory(prev => prev.slice(0, aiMessageIndex));
    sendMessage(lastUserMsg);
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
    <div className="flex flex-col" style={{ height: '100vh', background: 'var(--navy)', color: 'var(--text-primary)' }}>

      {/* ── TOP BAR ── */}
      <div className="flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 px-3 py-2">
          <button onClick={() => router.back()} className="flex-shrink-0 text-sm px-2 py-1 rounded" style={{ color: 'var(--gold)' }}>
            ← Back
          </button>
          <h1 className="flex-1 text-sm font-bold truncate" style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif' }} title={course.name}>
            {course.name}
          </h1>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden md:block flex-shrink-0 text-xs px-2 py-1 rounded border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {sidebarOpen ? '▶' : '◀'} Panel
          </button>
        </div>
        <div className="flex gap-1.5 px-3 pb-2" style={{ overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          {MODES.map(mode => (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id)}
              title={mode.description}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: activeMode === mode.id ? 'var(--gold)' : 'var(--navy-card)',
                color: activeMode === mode.id ? 'var(--navy)' : 'var(--text-secondary)',
                border: '1px solid var(--border)', whiteSpace: 'nowrap',
              }}
            >
              <span>{mode.icon}</span><span>{mode.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex min-h-0" style={{ flex: 1 }}>

        {/* Chat area */}
        <div className="flex flex-col min-h-0 min-w-0" style={{ flex: 1 }}>

          {/* Messages — scrollable */}
          <div className="flex-1 overflow-y-auto px-3 md:px-5 py-3 space-y-3">

            {isEmpty && (
              <div style={{ height: '32vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="text-center max-w-sm px-4">
                  <p style={{ fontSize: '2.4rem', marginBottom: '8px' }}>{MODES.find(m => m.id === activeMode)?.icon}</p>
                  <p className="font-semibold mb-1" style={{ color: 'var(--gold)', fontSize: '1rem' }}>{MODES.find(m => m.id === activeMode)?.label}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{MODES.find(m => m.id === activeMode)?.description}</p>
                </div>
              </div>
            )}

            {chatHistory.map((msg, i) => (
              <div key={i}>
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="rounded-2xl px-4 py-2.5"
                    style={{
                      maxWidth: '85%',
                      fontSize: 'var(--ai-font-size, 18px)',
                      background: msg.role === 'user' ? 'var(--gold)' : 'var(--navy-card)',
                      color: msg.role === 'user' ? 'var(--navy)' : 'var(--text-primary)',
                      border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    {msg.role === 'assistant' ? <MarkdownRenderer content={msg.content} /> : msg.content}
                  </div>
                </div>

                {/* Action buttons — only on completed assistant messages */}
                {msg.role === 'assistant' && (
                  <div className="flex justify-start">
                    <MessageActions
                      message={msg}
                      messageIndex={i}
                      courseId={courseId}
                      userId={firebaseUser?.uid ?? ''}
                      onRegenerate={() => regenerate(i)}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Streaming bubble — no actions yet, still generating */}
            {streamingMessage && (
              <div className="flex justify-start">
                <div
                  className="rounded-2xl px-4 py-2.5"
                  style={{
                    maxWidth: '85%', fontSize: 'var(--ai-font-size, 18px)',
                    background: 'var(--navy-card)', color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <MarkdownRenderer content={streamingMessage} />
                  <span className="inline-block w-1.5 h-4 ml-1 animate-pulse" style={{ background: 'var(--gold)' }} />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── INPUT — position driven by settings ── */}
          <div
            className="flex-shrink-0 px-3 md:px-5 py-2 border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex md:hidden justify-end mb-1.5">
              <button
                onClick={() => setDrawerOpen(true)}
                className="text-xs px-3 py-1 rounded-lg flex items-center gap-1"
                style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', color: 'var(--gold)' }}
              >
                📚 Past Q · AOC · Memory
              </button>
            </div>
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={PLACEHOLDERS[activeMode]}
                rows={1}
                className="flex-1 rounded-xl p-2.5 resize-none"
                style={{
                  background: 'var(--navy-card)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', fontSize: 'var(--ui-font-size, 20px)',
                  minWidth: 0, minHeight: '48px', maxHeight: '140px',
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={isStreaming || !input.trim()}
                className="flex-shrink-0 px-4 py-2.5 rounded-xl font-medium"
                style={{
                  background: 'var(--gold)', color: 'var(--navy)',
                  fontSize: 'var(--ui-font-size, 20px)',
                  opacity: isStreaming || !input.trim() ? 0.5 : 1,
                }}
              >
                {isStreaming ? '…' : '↑'}
              </button>
            </div>
          </div>
        </div>

        {/* ── DESKTOP SIDE PANEL ── */}
        {sidebarOpen && (
          <div className="hidden md:flex flex-col flex-shrink-0 border-l" style={{ width: '272px', borderColor: 'var(--border)', background: 'var(--navy-card)' }}>
            <div className="flex border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              {sideTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSideTab(tab.id)}
                  className="flex-1 py-2 text-xs font-medium transition-colors"
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
              {activeSideTab === 'past-questions' && <PastQuestionsPanel courseId={courseId} onStudy={text => sendMessage(text)} />}
              {activeSideTab === 'aoc' && <AOCPanel courseId={courseId} onStudy={text => sendMessage(text)} />}
              {activeSideTab === 'memory' && <StudyMemoryPanel courseId={courseId} chatHistory={chatHistory} />}
            </div>
          </div>
        )}
      </div>

      {/* ── MOBILE BOTTOM DRAWER ── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => { if (e.target === e.currentTarget) setDrawerOpen(false); }}
        >
          <div className="flex flex-col rounded-t-2xl" style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', maxHeight: '75vh' }}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="flex gap-2">
                {sideTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSideTab(tab.id)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
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
            <div className="flex-1 overflow-y-auto p-4">
              {activeSideTab === 'past-questions' && <PastQuestionsPanel courseId={courseId} onStudy={text => sendMessage(text)} />}
              {activeSideTab === 'aoc' && <AOCPanel courseId={courseId} onStudy={text => sendMessage(text)} />}
              {activeSideTab === 'memory' && <StudyMemoryPanel courseId={courseId} chatHistory={chatHistory} />}
            </div>
          </div>
        </div>
      )}

      {/* ── DRAGGABLE FLOATING SETTINGS BUTTON ── */}
      <DraggableSettingsButton
        onClick={() => setSettingsOpen(true)}
        topOverride={settings.settingsBtnTop}
      />

      {/* ── SETTINGS MODAL — now wired to real SettingsPanel ── */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false); }}
        >
          <div style={{ position: 'relative' }}>
            <SettingsPanel />
          </div>
        </div>
      )}
    </div>
  );
}