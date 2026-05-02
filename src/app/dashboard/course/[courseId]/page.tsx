// src/app/dashboard/course/[courseId]/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { getCourseById } from '@/lib/firestore/courses';
import PastQuestionsPanel from '@/components/course/PastQuestionsPanel';
import AOCPanel from '@/components/course/AOCPanel';
import StudyMemoryPanel from '@/components/course/StudyMemoryPanel';
import MaterialsPanel from '@/components/course/MaterialsPanel';
import NotesPanel from '@/components/course/NotesPanel';
import SettingsPanel from '@/components/SettingsPanel';
import ReactMarkdown from 'react-markdown';
import { useSettings } from '@/components/AppShell';
import {
  collection, addDoc, serverTimestamp, getDocs, query, where,
  doc, setDoc, getDoc, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

type StudyMode = 'plain_explainer' | 'practice_questions' | 'exam_preparation' | 'research';
type SideTab = 'materials' | 'past-questions' | 'aoc' | 'memory' | 'notes';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatSession {
  messages: ChatMessage[];
  updatedAt: string;
  year: number;
  semester: number;
  mode: string;
  archived: boolean;
}

interface ArchivedSession {
  id: string;
  messages: ChatMessage[];
  archivedAt: string;
  mode: string;
  messageCount: number;
}

const MODES: { id: StudyMode; label: string; icon: string; description: string }[] = [
  { id: 'plain_explainer', label: 'Plain Explainer', icon: '💡', description: 'Understand any concept in plain language' },
  { id: 'practice_questions', label: 'Practice Q', icon: '❓', description: 'Test yourself with course-based questions' },
  { id: 'exam_preparation', label: 'Exam Prep', icon: '📝', description: 'Write and review full exam answers' },
  { id: 'research', label: 'Research', icon: '🔬', description: 'Deep answers with full citations' },
];

const PLACEHOLDERS: Record<string, string> = {
  plain_explainer: 'Ask about any concept or paste a confusing passage...',
  practice_questions: 'Ask for practice questions...',
  exam_preparation: 'Ask an exam question or paste your draft...',
  research: 'Ask any question for a sourced answer...',
};

const MarkdownRenderer = ({ content }: { content: string }) => (
  <ReactMarkdown components={{
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
  }}>
    {content}
  </ReactMarkdown>
);

interface MessageActionsProps {
  message: ChatMessage;
  messageIndex: number;
  courseId: string;
  userId: string;
  userEmail: string;
  courseName: string;
  onRegenerate: () => void;
  lastUserMsg: string;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{2,}/g, '. ')
    .trim();
}

function MessageActions({ message, messageIndex, courseId, userId, userEmail, courseName, onRegenerate, lastUserMsg }: MessageActionsProps) {
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showDislikeNote, setShowDislikeNote] = useState(false);
  const [dislikeNote, setDislikeNote] = useState('');
  const [showFlagBox, setShowFlagBox] = useState(false);
  const [flagNote, setFlagNote] = useState('');
  const [flagSent, setFlagSent] = useState(false);
  const [flagSending, setFlagSending] = useState(false);

  const btnStyle = (active = false, danger = false): React.CSSProperties => ({
    background: 'none',
    border: '1px solid ' + (danger ? 'rgba(239,68,68,0.4)' : active ? 'var(--gold)' : 'var(--border)'),
    borderRadius: '6px', padding: '4px 8px', cursor: 'pointer',
    color: danger ? '#ef4444' : active ? 'var(--gold)' : 'var(--text-muted)', fontSize: '0.78rem',
    display: 'inline-flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s ease',
  });

  const sendFeedback = async (type: 'like' | 'dislike', note?: string) => {
    try {
      await addDoc(collection(db, 'feedback'), {
        type, messageContent: message.content, courseId, userId, userEmail,
        note: note || '', timestamp: serverTimestamp(),
      });
    } catch { }
  };

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(message.content); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { }
  };

  const handleTTS = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utt = new SpeechSynthesisUtterance(stripMarkdown(message.content));
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
    setSpeaking(true);
  };

  const handleDislike = () => {
    if (!disliked) {
      setDisliked(true);
      setLiked(false);
      setShowDislikeNote(true);
    }
  };

  const submitDislike = async () => {
    await sendFeedback('dislike', dislikeNote);
    setShowDislikeNote(false);
  };

  const submitFlag = async () => {
    if (!flagNote.trim()) return;
    setFlagSending(true);
    try {
      await addDoc(collection(db, 'flags'), {
        userId, userEmail, courseId, courseName,
        question: lastUserMsg.substring(0, 500),
        aiResponse: message.content.substring(0, 500),
        studentDescription: flagNote,
        status: 'open',
        createdAt: serverTimestamp(),
      });
      setFlagSent(true);
      setFlagNote('');
      setTimeout(() => { setShowFlagBox(false); setFlagSent(false); }, 2000);
    } catch { }
    finally { setFlagSending(false); }
  };

  return (
    <div style={{ paddingLeft: '4px', marginTop: '6px' }}>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button style={btnStyle(liked)} onClick={() => { if (!liked) { setLiked(true); setDisliked(false); setShowDislikeNote(false); sendFeedback('like'); } }} title='Helpful'>
          <i className='fa-regular fa-thumbs-up' />
        </button>
        <button style={btnStyle(disliked)} onClick={handleDislike} title='Not helpful'>
          <i className='fa-regular fa-thumbs-down' />
        </button>
        <button style={btnStyle(copied)} onClick={handleCopy} title='Copy'>
          <i className={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'} />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
        <button onClick={handleTTS} title={speaking ? 'Stop reading' : 'Read aloud'}
          style={{ ...btnStyle(speaking), color: speaking ? 'var(--gold)' : 'var(--text-muted)', border: '1px solid ' + (speaking ? 'var(--gold)' : 'var(--border)') }}>
          <i className={speaking ? 'fa-solid fa-stop' : 'fa-solid fa-volume-high'} />
        </button>
        <button style={btnStyle()} onClick={onRegenerate} title='Retry'>
          <i className='fa-solid fa-rotate-right' /><span>Retry</span>
        </button>
        <button style={btnStyle()} onClick={async () => { if (navigator.share) { try { await navigator.share({ text: message.content }); } catch { } } else handleCopy(); }} title='Share'>
          <i className='fa-solid fa-share-from-square' />
        </button>
        <button style={btnStyle(showFlagBox, true)} onClick={() => setShowFlagBox(f => !f)} title='Flag this response'>
          <i className='fa-solid fa-flag' />
        </button>
      </div>

      {showDislikeNote && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'flex-end', maxWidth: '360px' }}>
          <textarea
            value={dislikeNote}
            onChange={e => setDislikeNote(e.target.value)}
            placeholder='What was wrong? (optional)'
            rows={2}
            style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', fontSize: '0.75rem', resize: 'none',
              background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          <button onClick={submitDislike}
            style={{ padding: '6px 12px', borderRadius: '8px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
            Send
          </button>
        </div>
      )}

      {showFlagBox && (
        <div style={{ marginTop: '8px', maxWidth: '360px', padding: '10px', borderRadius: '10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 700, marginBottom: '6px' }}>🚩 Flag this response</p>
          {flagSent ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--gold)' }}>✅ Flagged — thank you!</p>
          ) : (
            <>
              <textarea
                value={flagNote}
                onChange={e => setFlagNote(e.target.value)}
                placeholder='Describe the issue (required)...'
                rows={3}
                style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', fontSize: '0.75rem', resize: 'none', boxSizing: 'border-box',
                  background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                <button onClick={() => setShowFlagBox(false)}
                  style={{ flex: 1, padding: '5px', borderRadius: '7px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={submitFlag} disabled={!flagNote.trim() || flagSending}
                  style={{ flex: 1, padding: '5px', borderRadius: '7px', background: '#ef4444', color: '#fff', border: 'none', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', opacity: (!flagNote.trim() || flagSending) ? 0.5 : 1 }}>
                  {flagSending ? 'Sending...' : 'Submit Flag'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { firebaseUser, userProfile } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();

  const [course, setCourse] = useState<any>(null);
  const [activeMode, setActiveMode] = useState<StudyMode>('plain_explainer');
  const [activeSideTab, setActiveSideTab] = useState<SideTab>('materials');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [topics, setTopics] = useState<{ materialName: string; items: string[] }[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [archivedSessions, setArchivedSessions] = useState<ArchivedSession[]>([]);
  const [viewingArchive, setViewingArchive] = useState<ArchivedSession | null>(null);

  const [modeHistories, setModeHistories] = useState<Record<string, ChatMessage[]>>({});
  const [streamingMessage, setStreamingMessage] = useState('')
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState('');
  const [sessionSaving, setSessionSaving] = useState(false);
  const [activeContext, setActiveContext] = useState<{ fileName: string; extractedText: string } | null>(null);

  // Scroll state
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showScrollUp, setShowScrollUp] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const userMsgRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevHistoryLenRef = useRef(0);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const handleSTT = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('Speech recognition not supported in this browser. Try Chrome.'); return; }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => prev ? prev + ' ' + transcript : transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const chatHistory = modeHistories[activeMode] ?? [];
  const year = userProfile?.year ?? 1;
  const semester = userProfile?.currentSemester ?? 1;
  const uid = firebaseUser?.uid ?? '';

  const sessionKey = (mode: string) => courseId + '__' + mode + '__' + year + '__' + semester;

  const loadSession = async (mode: string) => {
    if (!uid || !courseId) return;
    try {
      const ref = doc(db, 'users', uid, 'chatSessions', sessionKey(mode));
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as ChatSession;
        setModeHistories(prev => ({ ...prev, [mode]: data.messages ?? [] }));
      }
    } catch { }
  };

  const saveSession = useCallback(async (mode: string, messages: ChatMessage[]) => {
    if (!uid || !courseId) return;
    try {
      const ref = doc(db, 'users', uid, 'chatSessions', sessionKey(mode));
      await setDoc(ref, { messages, updatedAt: new Date().toISOString(), year, semester, mode, archived: false });
    } catch { }
  }, [uid, courseId, year, semester]);

  const handleNewChat = async () => {
    if (chatHistory.length === 0) return;
    setSessionSaving(true);
    try {
      const archiveRef = doc(db, 'users', uid, 'chatArchive', sessionKey(activeMode) + '__' + Date.now());
      await setDoc(archiveRef, { messages: chatHistory, archivedAt: new Date().toISOString(), mode: activeMode, year, semester, messageCount: chatHistory.length });
      const sessionRef = doc(db, 'users', uid, 'chatSessions', sessionKey(activeMode));
      await setDoc(sessionRef, { messages: [], updatedAt: new Date().toISOString(), year, semester, mode: activeMode, archived: false });
      setModeHistories(prev => ({ ...prev, [activeMode]: [] }));
    } catch { }
    finally { setSessionSaving(false); }
  };

  const loadArchives = async () => {
    if (!uid || !courseId) return;
    try {
      const prefix = courseId + '__' + activeMode + '__';
      const snap = await getDocs(query(collection(db, 'users', uid, 'chatArchive'), orderBy('archivedAt', 'desc')));
      const sessions = snap.docs.filter(d => d.id.startsWith(prefix)).map(d => ({ id: d.id, ...d.data() } as ArchivedSession));
      setArchivedSessions(sessions);
    } catch { }
  };

  const loadTopics = async () => {
    if (!courseId) return;
    setTopicsLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'materials'), where('confirmedCourseId', '==', courseId), where('status', '==', 'approved')));
      const result: { materialName: string; items: string[] }[] = [];
      snap.docs.forEach(d => {
        const data = d.data();
        const text: string = data.extractedText ?? '';
        const name: string = data.indexDisplayName ?? data.fileName ?? 'Material';
        const items: string[] = [];
        text.split('\n').forEach(line => {
          const t = line.trim();
          if ((t.startsWith('## ') || t.startsWith('### ') || t.startsWith('# ') || t.startsWith('#### ')) && t.length < 120) {
            const c = t.replace(/^#{1,4}\s+/, '').trim();
            if (c.length > 2) items.push(c);
          } else if (t.startsWith('**') && t.endsWith('**') && t.length > 4 && t.length < 120) {
            const c = t.replace(/\*\*/g, '').trim();
            if (c.length > 2) items.push(c);
          }
        });
        if (items.length > 0) result.push({ materialName: name, items });
      });
      setTopics(result);
    } catch { }
    finally { setTopicsLoading(false); }
  };

  // Font Awesome
  useEffect(() => {
    const id = 'fa-cdn';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    document.head.appendChild(link);
  }, []);

  // Load course
  useEffect(() => {
    if (!firebaseUser || !courseId) return;
    getCourseById(courseId).then(data => { setCourse(data); setLoading(false); });
  }, [firebaseUser, courseId]);

  // Load session when mode or user changes
  useEffect(() => {
    if (!uid || !courseId || !userProfile) return;
    loadSession(activeMode);
  }, [uid, courseId, activeMode, userProfile]);

  // Scroll to user message when a new user message is added
  useEffect(() => {
    const currentLen = chatHistory.length;
    const prevLen = prevHistoryLenRef.current;
    // A new user message was just added (history grew and last message is user)
    if (currentLen > prevLen && chatHistory[currentLen - 1]?.role === 'user') {
      const idx = currentLen - 1;
      setTimeout(() => {
        userMsgRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
    // A new AI message was just added (history grew and last message is assistant)
    if (currentLen > prevLen && chatHistory[currentLen - 1]?.role === 'assistant') {
      const idx = currentLen - 1;
      setTimeout(() => {
        userMsgRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
    prevHistoryLenRef.current = currentLen;
  }, [chatHistory]);

  // Track scroll position to show/hide floating buttons
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const distFromBottom = scrollHeight - scrollTop - clientHeight;
      setShowScrollDown(distFromBottom > 120);
      setShowScrollUp(scrollTop > 80);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    // Check on mount too
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [chatHistory]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px';
    }
  }, [input]);

  const scrollToBottom = () => {
    const el = chatContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const scrollToTop = () => {
    const el = chatContainerRef.current;
    if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const sendMessage = async (text?: string) => {
    const message = text || input;
    if (!message.trim() || isStreaming) return;
    setInput('');
    if (drawerOpen) setDrawerOpen(false);
    const userMsg: ChatMessage = { role: 'user', content: message, timestamp: new Date().toISOString() };
    const newHistory = [...chatHistory, userMsg];
    setModeHistories(prev => ({ ...prev, [activeMode]: newHistory }));
    setIsStreaming(true);
    setIsAiLoading(true);
    setStreamingMessage('');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message, courseId, mode: activeMode,
          courseName: course?.name,
          courseDescription: course?.description,
          conversationHistory: chatHistory.map(m => ({ role: m.role, content: m.content })),
          materialContext: activeContext?.extractedText ?? null,
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
      if (!fullResponse.trim()) { fullResponse = "I'm sorry, I wasn't able to generate a response. This may be because course materials aren't indexed yet. Please try rephrasing, or use the flag button to report this."; }
    const aiMsg: ChatMessage = { role: 'assistant', content: fullResponse, timestamp: new Date().toISOString() };
      const finalHistory = [...newHistory, aiMsg];
      setModeHistories(prev => ({ ...prev, [activeMode]: finalHistory }));
      setStreamingMessage('');
      await saveSession(activeMode, finalHistory);
    } catch { }
    finally { setIsStreaming(false); setIsAiLoading(false); }
  };

  const regenerate = (aiMessageIndex: number) => {
    let lastUserMsg = '';
    for (let i = aiMessageIndex - 1; i >= 0; i--) {
      if (chatHistory[i].role === 'user') { lastUserMsg = chatHistory[i].content; break; }
    }
    if (!lastUserMsg) return;
    setModeHistories(prev => ({ ...prev, [activeMode]: prev[activeMode].slice(0, aiMessageIndex) }));
    sendMessage(lastUserMsg);
  };

  if (loading) return (
    <div className='min-h-screen flex items-center justify-center' style={{ background: 'var(--navy)' }}>
      <p style={{ color: 'var(--gold)' }}>Loading course...</p>
    </div>
  );
  if (!course) return (
    <div className='min-h-screen flex items-center justify-center' style={{ background: 'var(--navy)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Course not found.</p>
    </div>
  );

  const sideTabs: { id: SideTab; label: string; icon: string }[] = [
    { id: 'materials', label: 'Materials', icon: '📂' },
    { id: 'notes', label: 'Notes', icon: '📝' },
    { id: 'past-questions', label: 'Past Q', icon: '🗒' },
    { id: 'aoc', label: 'AOC', icon: '🎯' },
    { id: 'memory', label: 'Memory', icon: '🧠' },
  ];

  const isEmpty = chatHistory.length === 0 && !streamingMessage;

  const floatBtnStyle: React.CSSProperties = {
    width: '40px', height: '40px',
    background: 'transparent',
    border: 'none',
    color: 'var(--gold)',
    fontSize: '1.6rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: 0.6,
    transition: 'opacity 0.2s',
  };

  return (
    <div className='flex flex-col w-full' style={{ height: '100dvh', background: 'var(--navy)', color: 'var(--text-primary)', overflow: 'hidden', maxWidth: '100vw' }}>

      {/* TOP BAR */}
      <div className='flex-shrink-0 border-b' style={{ borderColor: 'var(--border)' }}>
        <div className='flex items-center gap-2 px-3 py-2' style={{ minWidth: 0 }}>
          <button onClick={() => router.back()} className='flex-shrink-0 text-sm px-2 py-1 rounded' style={{ color: 'var(--gold)' }}>
            Back
          </button>
          <h1 className='flex-1 text-sm font-bold truncate min-w-0' style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, serif' }} title={course.name}>
            {course.name}
          </h1>
          {chatHistory.length > 0 && (
            <button onClick={handleNewChat} disabled={sessionSaving}
              className='flex-shrink-0 text-xs px-2 py-1 rounded border'
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              title='Start new chat (archives current)'>
              {sessionSaving ? '...' : '+ New'}
            </button>
          )}
          <button onClick={() => { loadArchives(); setHistoryOpen(true); }}
            className='flex-shrink-0 text-xs px-2 py-1 rounded border'
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            title='View chat history'>
            🕐
          </button>
          <button onClick={() => { loadTopics(); setTopicsOpen(true); }}
            className='flex-shrink-0 text-xs px-2 py-1 rounded border'
            style={{ borderColor: 'var(--border)', color: 'var(--gold)' }}
            title='Course topics'>
            🗂
          </button>
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className='hidden md:block flex-shrink-0 text-xs px-2 py-1 rounded border'
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            {sidebarOpen ? '▶' : '◀'} Panel
          </button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: '6px', padding: '0 12px 8px', overflowX: 'auto', flexWrap: 'nowrap', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as any}>
          {MODES.map(mode => (
            <button key={mode.id} onClick={() => setActiveMode(mode.id)} title={mode.description}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px',
                padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 500,
                background: activeMode === mode.id ? 'var(--gold)' : 'var(--navy-card)',
                color: activeMode === mode.id ? 'var(--navy)' : 'var(--text-secondary)',
                border: '1px solid var(--border)', whiteSpace: 'nowrap', cursor: 'pointer',
              }}
            >
              <span>{mode.icon}</span>
              <span>{mode.label}</span>
              {modeHistories[mode.id]?.length > 0 && (
                <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                  {modeHistories[mode.id].length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Active context banner */}
        {activeContext && (
          <div style={{ padding: '4px 12px 6px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(196,160,80,0.08)', borderTop: '1px solid rgba(196,160,80,0.2)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--gold)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📂 {activeContext.fileName} · active in chat
            </span>
            <button onClick={() => setActiveContext(null)} style={{ flexShrink: 0, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
          </div>
        )}
      </div>

      {/* MAIN CONTENT */}
      <div className='flex min-h-0' style={{ flex: 1, overflow: 'hidden' }}>

        {/* Chat area */}
        <div className='flex flex-col min-h-0' style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' }}>

          {/* Messages */}
          <div
            ref={chatContainerRef}
            className='flex-1 overflow-y-auto'
            style={{ padding: '12px 16px', overflowX: 'hidden' }}
          >
            {isEmpty && (
              <div style={{ height: '32vh', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                <div style={{ textAlign: 'center', width: '100%', maxWidth: '320px', padding: '0 24px', boxSizing: 'border-box' }}>
                  <p style={{ fontSize: '2.4rem', marginBottom: '8px' }}>{MODES.find(m => m.id === activeMode)?.icon}</p>
                  <p style={{ fontWeight: 600, color: 'var(--gold)', fontSize: '1rem', marginBottom: '4px' }}>{MODES.find(m => m.id === activeMode)?.label}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{MODES.find(m => m.id === activeMode)?.description}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '8px' }}>Sem {semester} · Year {year}</p>
                </div>
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} ref={el => { userMsgRefs.current[i] = el; }} style={{ width: '100%', overflowX: 'hidden', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '82%', wordBreak: 'break-word',
                    borderRadius: '16px', padding: '10px 16px',
                    fontSize: 'var(--ai-font-size, 18px)',
                    background: msg.role === 'user' ? 'var(--gold)' : 'var(--navy-card)',
                    color: msg.role === 'user' ? 'var(--navy)' : 'var(--text-primary)',
                    border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  }}>
                    {msg.role === 'assistant' ? <MarkdownRenderer content={msg.content} /> : msg.content}
                  </div>
                </div>
                {msg.role === 'assistant' && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <MessageActions
                      message={msg}
                      messageIndex={i}
                      courseId={courseId}
                      userId={uid}
                      userEmail={firebaseUser?.email ?? ''}
                      courseName={course?.name ?? ''}
                      onRegenerate={() => regenerate(i)}
                      lastUserMsg={(() => { for (let j = i - 1; j >= 0; j--) { if (chatHistory[j].role === 'user') return chatHistory[j].content; } return ''; })()}
                    />
                  </div>
                )}
              </div>
            ))}
            
              {/* AI Reading indicator */}
              {isAiLoading && !streamingMessage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[0,1,2].map(i => (
                      <span key={i} style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: 'var(--gold)', opacity: 0.7,
                        animation: 'aiPulse 1.2s ease-in-out infinite',
                        animationDelay: `${i * 0.2}s`,
                        display: 'inline-block'
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Reading...</span>
                </div>
              )}
              {streamingMessage && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%', overflowX: 'hidden', marginBottom: '12px' }}>
                <div style={{ maxWidth: '82%', wordBreak: 'break-word', borderRadius: '16px', padding: '10px 16px', fontSize: 'var(--ai-font-size, 18px)', background: 'var(--navy-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                  <MarkdownRenderer content={streamingMessage} />
                  <span style={{ display: 'inline-block', width: '6px', height: '16px', marginLeft: '4px', background: 'var(--gold)', animation: 'pulse 1s infinite' }} />
                </div>
              </div>
            )}
          </div>

          {/* Floating scroll buttons */}
          {(showScrollUp || showScrollDown) && (
            <div style={{ position: 'fixed', right: 14, top: '50vh', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 14, zIndex: 999 }}>
              {showScrollUp && (
                <button onClick={scrollToTop} style={{ ...floatBtnStyle, position: 'static' }} title='Scroll to top'>↑</button>
              )}
              {showScrollDown && (
                <button onClick={scrollToBottom} style={{ ...floatBtnStyle, position: 'static' }} title='Scroll to bottom'>↓</button>
              )}
            </div>
          )}

          {/* INPUT */}
          <div className='flex-shrink-0 border-t' style={{ borderColor: 'var(--border)', padding: '8px 12px', paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))' }}>
            <div className='md:hidden' style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
              <button onClick={() => setDrawerOpen(true)}
                style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: '8px', background: 'var(--navy-card)', border: '1px solid var(--border)', color: 'var(--gold)', cursor: 'pointer' }}>
                📚 Study Panel
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <textarea ref={textareaRef} value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={PLACEHOLDERS[activeMode]}
                rows={1}
                style={{
                  flex: 1, borderRadius: '12px', padding: '10px 12px', resize: 'none',
                  background: 'var(--navy-card)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', fontSize: 'var(--ui-font-size, 16px)',
                  minWidth: 0, minHeight: '44px', maxHeight: '140px', boxSizing: 'border-box',
                }}
              />
              <button onClick={handleSTT} title={isListening ? 'Stop listening' : 'Speak'}
                style={{
                  flexShrink: 0, padding: '10px 12px', borderRadius: '12px',
                  background: isListening ? '#ef4444' : 'var(--navy-card)',
                  color: isListening ? '#fff' : 'var(--text-muted)',
                  border: '1px solid ' + (isListening ? '#ef4444' : 'var(--border)'),
                  fontSize: '1rem', cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                <i className={isListening ? 'fa-solid fa-stop' : 'fa-solid fa-microphone'} />
              </button>
              <button onClick={() => sendMessage()} disabled={isStreaming || !input.trim()}
                style={{
                  flexShrink: 0, padding: '10px 16px', borderRadius: '12px',
                  background: 'var(--gold)', color: 'var(--navy)',
                  border: 'none', fontSize: '1rem', fontWeight: 700,
                  opacity: isStreaming || !input.trim() ? 0.5 : 1, cursor: 'pointer',
                }}
              >
                {isStreaming ? '…' : '↑'}
              </button>
            </div>
          </div>
        </div>

        {/* DESKTOP SIDE PANEL */}
        {sidebarOpen && (
          <div className='hidden md:flex flex-col flex-shrink-0 border-l' style={{ width: '272px', borderColor: 'var(--border)', background: 'var(--navy-card)' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto', flexShrink: 0, scrollbarWidth: 'none' } as any}>
              {sideTabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveSideTab(tab.id)}
                  style={{
                    flex: 1, padding: '8px 4px', fontSize: '0.65rem', fontWeight: 500,
                    background: activeSideTab === tab.id ? 'var(--navy)' : 'transparent',
                    color: activeSideTab === tab.id ? 'var(--gold)' : 'var(--text-secondary)',
                    borderBottom: activeSideTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent',
                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {activeSideTab === 'materials' && <MaterialsPanel courseId={courseId} onActivate={setActiveContext} activeFileName={activeContext?.fileName ?? null} />}
              {activeSideTab === 'notes' && <NotesPanel courseId={courseId} userId={uid} />}
              {activeSideTab === 'past-questions' && <PastQuestionsPanel courseId={courseId} onStudy={text => sendMessage(text)} />}
              {activeSideTab === 'aoc' && <AOCPanel courseId={courseId} onStudy={text => sendMessage(text)} />}
              {activeSideTab === 'memory' && <StudyMemoryPanel courseId={courseId} chatHistory={chatHistory} />}
            </div>
          </div>
        )}
      </div>

      {/* MOBILE BOTTOM DRAWER */}
      {drawerOpen && (
        <div className='md:hidden' style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setDrawerOpen(false); }}>
          <div style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: '20px 20px 0 0', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none' } as any}>
                {sideTabs.map(tab => (
                  <button key={tab.id} onClick={() => setActiveSideTab(tab.id)}
                    style={{
                      padding: '4px 8px', borderRadius: '8px', fontSize: '0.68rem', fontWeight: 500,
                      background: activeSideTab === tab.id ? 'var(--gold)' : 'transparent',
                      color: activeSideTab === tab.id ? 'var(--navy)' : 'var(--text-secondary)',
                      border: '1px solid var(--border)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setDrawerOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer', flexShrink: 0, marginLeft: '8px' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {activeSideTab === 'materials' && <MaterialsPanel courseId={courseId} onActivate={ctx => { setActiveContext(ctx); if (ctx) setDrawerOpen(false); }} activeFileName={activeContext?.fileName ?? null} />}
              {activeSideTab === 'notes' && <NotesPanel courseId={courseId} userId={uid} />}
              {activeSideTab === 'past-questions' && <PastQuestionsPanel courseId={courseId} onStudy={text => { sendMessage(text); setDrawerOpen(false); }} />}
              {activeSideTab === 'aoc' && <AOCPanel courseId={courseId} onStudy={text => { sendMessage(text); setDrawerOpen(false); }} />}
              {activeSideTab === 'memory' && <StudyMemoryPanel courseId={courseId} chatHistory={chatHistory} />}
            </div>
          </div>
        </div>
      )}

      {/* TOPICS DRAWER */}
      {topicsOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)' }} onClick={() => setTopicsOpen(false)}>
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '300px', background: 'var(--navy-card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '0.95rem' }}>Course Topics</span>
              <button onClick={() => setTopicsOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {topicsLoading && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '32px 0' }}>Loading...</p>}
              {!topicsLoading && topics.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <p style={{ fontSize: '1.6rem', marginBottom: '8px' }}>📭</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No topics extracted yet.</p>
                </div>
              )}
              {!topicsLoading && topics.map((mat, i) => (
                <div key={i} style={{ marginBottom: '20px' }}>
                  <p style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.6, marginBottom: '8px' }}>{mat.materialName}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {mat.items.map((item, j) => (
                      <button key={j} onClick={() => { sendMessage('[TOPIC:' + item + '] Explain this topic: "' + item + '"'); setTopicsOpen(false); }}
                        style={{ textAlign: 'left', padding: '7px 10px', borderRadius: '8px', background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer' }}>
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HISTORY DRAWER */}
      {historyOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)' }} onClick={() => { setHistoryOpen(false); setViewingArchive(null); }}>
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '300px', background: 'var(--navy-card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '0.95rem' }}>
                {viewingArchive ? 'Archived Session' : 'Chat History — ' + MODES.find(m => m.id === activeMode)?.label}
              </span>
              <button onClick={() => { if (viewingArchive) setViewingArchive(null); else setHistoryOpen(false); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer' }}>
                {viewingArchive ? '←' : '✕'}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {viewingArchive ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {viewingArchive.messages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '85%', borderRadius: '12px', padding: '8px 12px', fontSize: '0.78rem',
                        background: msg.role === 'user' ? 'var(--gold)' : 'var(--navy)',
                        color: msg.role === 'user' ? 'var(--navy)' : 'var(--text-primary)',
                        border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none' }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              ) : archivedSessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <p style={{ fontSize: '1.6rem', marginBottom: '8px' }}>🕐</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No archived sessions yet for this mode.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {archivedSessions.map(session => (
                    <button key={session.id} onClick={() => setViewingArchive(session)}
                      style={{ textAlign: 'left', padding: '10px 12px', borderRadius: '10px', background: 'var(--navy)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '2px' }}>
                        {new Date(session.archivedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{session.messageCount ?? session.messages?.length ?? 0} messages · Sem {semester}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <SettingsPanel />
    </div>
  );
}
