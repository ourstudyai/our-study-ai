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
import FullPageViewer from '@/components/course/FullPageViewer';
import SettingsPanel from '@/components/SettingsPanel';
import ReactMarkdown from 'react-markdown';
import LuxLoader from '@/components/LuxLoader';
import { useSettings } from '@/components/AppShell';
import {
  collection, addDoc, serverTimestamp, getDocs, query, where,
  doc, setDoc, getDoc, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

type StudyMode = 'plain_explainer' | 'practice_questions' | 'exam_preparation' | 'research';
type SideTab = 'materials' | 'past-questions' | 'aoc' | 'notes' | 'history';

interface TopicNode {
  title: string;
  level: number;
  subtopics: TopicNode[];
}
function ClickableTopicTree({
  nodes,
  depth = 0,
  onSelect,
}: {
  nodes: TopicNode[];
  depth?: number;
  onSelect: (title: string) => void;
}): React.ReactNode {
  const [collapsed, setCollapsed] = useState<Set<number>>(
    () => new Set(nodes.map((_, i) => i).filter(() => depth > 0))
  );
  const toggle = (i: number) =>
    setCollapsed(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <div>
      {nodes.map((node, i) => {
        const hasChildren = Array.isArray(node.subtopics) && node.subtopics.length > 0;
        const isCollapsed = collapsed.has(i);
        return (
          <div key={i} style={{ paddingLeft: depth * 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
              {hasChildren ? (
                <button onClick={() => toggle(i)} style={{ flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-muted)', fontSize: '0.55rem', lineHeight: 1, display: 'inline-flex', alignItems: 'center', transition: 'transform 0.15s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</button>
              ) : (
                <span style={{ width: '14px', flexShrink: 0 }} />
              )}
              <button
                onClick={() => onSelect(node.title)}
                style={{ flex: 1, textAlign: 'left', padding: '5px 9px', borderRadius: '7px', background: 'var(--navy)', border: depth === 0 ? '1px solid rgba(196,160,80,0.25)' : '1px solid var(--border)', color: depth === 0 ? 'var(--text-primary)' : depth === 1 ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: depth === 0 ? '0.78rem' : depth === 1 ? '0.74rem' : '0.7rem', fontWeight: depth === 0 ? 600 : depth === 1 ? 500 : 400, cursor: 'pointer', lineHeight: 1.4 }}
              >
                {node.title}
              </button>
            </div>
            {hasChildren && !isCollapsed && (
              <ClickableTopicTree nodes={node.subtopics} depth={depth + 1} onSelect={onSelect} />
            )}
          </div>
        );
      })}
    </div>
  );
}
function flattenTree(nodes: TopicNode[]): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (node.title?.trim()) result.push(node.title.trim());
    if (node.subtopics?.length > 0) result.push(...flattenTree(node.subtopics));
  }
  return result;
}

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
  autoSpeak?: boolean;
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

function MessageActions({ message, messageIndex, courseId, userId, userEmail, courseName, onRegenerate, lastUserMsg, autoSpeak }: MessageActionsProps) {
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showLikeNote, setShowLikeNote] = useState(false);
  const [likeNote, setLikeNote] = useState('');
  const [showDislikeNote, setShowDislikeNote] = useState(false);
  const [dislikeNote, setDislikeNote] = useState('');
  const [showTTSSettings, setShowTTSSettings] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [ttsVoice, setTtsVoice] = useState('');
  const [ttsRate, setTtsRate] = useState(1);
  const [ttsVolume, setTtsVolume] = useState(1);
  const ttsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ourstudyai_tts_prefs') || '{}');
      if (saved.voice) setTtsVoice(saved.voice);
      if (saved.rate) setTtsRate(saved.rate);
      if (saved.volume !== undefined) setTtsVolume(saved.volume);
    } catch {}
    const loadVoices = () => { const v = window.speechSynthesis.getVoices(); if (v.length) setVoices(v); };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ttsRef.current && !ttsRef.current.contains(e.target as Node)) setShowTTSSettings(false);
    };
    if (showTTSSettings) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showTTSSettings]);

  const saveTTSPrefs = (voice: string, rate: number, volume: number) => {
    try { localStorage.setItem('ourstudyai_tts_prefs', JSON.stringify({ voice, rate, volume })); } catch {}
  };

  useEffect(() => {
    if (!autoSpeak || !message.content) return;
    const utt = new SpeechSynthesisUtterance(stripMarkdown(message.content));
    utt.rate = ttsRate;
    utt.volume = ttsVolume;
    if (ttsVoice) {
      const found = window.speechSynthesis.getVoices().find(v => v.name === ttsVoice);
      if (found) utt.voice = found;
    }
    utt.onend = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    setTimeout(() => { window.speechSynthesis.speak(utt); setSpeaking(true); }, 100);
  }, [autoSpeak, message.content]);

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
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(stripMarkdown(message.content));
    utt.rate = ttsRate;
    utt.volume = ttsVolume;
    if (ttsVoice) {
      const found = window.speechSynthesis.getVoices().find(v => v.name === ttsVoice);
      if (found) utt.voice = found;
    }
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    setTimeout(() => {
      window.speechSynthesis.speak(utt);
      setSpeaking(true);
    }, 50);
  };

  const handleLike = () => {
    if (!liked) { setLiked(true); setDisliked(false); setShowDislikeNote(false); setShowLikeNote(true); }
    else { setLiked(false); setShowLikeNote(false); }
  };
  const submitLike = async () => { await sendFeedback('like', likeNote); setShowLikeNote(false); };

  const handleDislike = () => {
    if (!disliked) { setDisliked(true); setLiked(false); setShowLikeNote(false); setShowDislikeNote(true); }
    else { setDisliked(false); setShowDislikeNote(false); }
  };
  const submitDislike = async () => { await sendFeedback('dislike', dislikeNote); setShowDislikeNote(false); };

  // SVG icons — theme-safe, currentColor
  const ThumbUp = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.25M6.633 10.5H5.25a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25h1.383" />
    </svg>
  );
  const ThumbDown = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={disliked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.367 13.5c-.806 0-1.533.446-2.031 1.08a9.041 9.041 0 01-2.861 2.4c-.723.384-1.35.956-1.653 1.715a4.498 4.498 0 00-.322 1.672V21a.75.75 0 01-.75.75 2.25 2.25 0 01-2.25-2.25c0-1.152.26-2.243.723-3.218.266-.558-.107-1.282-.725-1.282H4.372c-1.026 0-1.945-.694-2.054-1.715A12.134 12.134 0 012.25 12c0-2.848.992-5.464 2.649-7.521.388-.482.987-.729 1.605-.729h6.377c.483 0 .964.078 1.423.23l3.114 1.04a4.501 4.501 0 001.423.23h1.383M17.367 13.5H18.75a2.25 2.25 0 002.25-2.25V4.5a2.25 2.25 0 00-2.25-2.25h-1.383" />
    </svg>
  );
  const Copy = () => copied ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
    </svg>
  );
  const Speaker = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      {speaking
        ? <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V19.94a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.395C2.806 8.757 3.63 8.25 4.51 8.25H6.75z" />
        : <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53L6.75 15.75H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.395C2.806 8.757 3.63 8.25 4.51 8.25H6.75z" />
      }
    </svg>
  );
  const Gear = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
  const Regenerate = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
  const Share = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
    </svg>
  );

  const btn = (active = false): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: '4px', padding: '5px 9px', borderRadius: '8px', cursor: 'pointer',
    border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
    background: active ? 'var(--gold-dim)' : 'transparent',
    color: active ? 'var(--gold)' : 'var(--text-muted)',
    fontSize: '0.68rem', fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
    transition: 'all 0.15s ease',
    flexShrink: 0,
  });

  return (
    <div style={{ paddingLeft: '4px', marginTop: '8px', maxWidth: '100%' }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', gap: '4px', flexWrap: 'nowrap',
        overflowX: 'auto', scrollbarWidth: 'none',
        paddingBottom: '2px',
        borderTop: '1px solid var(--border)',
        paddingTop: '8px',
      }}>

        {/* Like */}
        <button style={btn(liked)} onClick={handleLike} title="Helpful"
          onMouseEnter={e => { if (!liked) { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--border-hover)'; }}}
          onMouseLeave={e => { if (!liked) { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}}>
          <ThumbUp />
        </button>

        {/* Dislike */}
        <button style={btn(disliked)} onClick={handleDislike} title="Not helpful"
          onMouseEnter={e => { if (!disliked) { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--border-hover)'; }}}
          onMouseLeave={e => { if (!disliked) { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}}>
          <ThumbDown />
        </button>

        {/* Divider */}
        <div style={{ width: '1px', background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

        {/* Copy */}
        <button style={btn(copied)} onClick={handleCopy} title={copied ? 'Copied' : 'Copy'}
          onMouseEnter={e => { if (!copied) { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--border-hover)'; }}}
          onMouseLeave={e => { if (!copied) { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}}>
          <Copy />
          <span style={{ fontSize: '0.65rem' }}>{copied ? 'Copied' : 'Copy'}</span>
        </button>

        {/* Speaker */}
        <button style={btn(speaking)} onClick={handleTTS} title={speaking ? 'Stop' : 'Read aloud'}
          onMouseEnter={e => { if (!speaking) { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--border-hover)'; }}}
          onMouseLeave={e => { if (!speaking) { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}}>
          <Speaker />
        </button>

        {/* Gear — TTS settings */}
        <div style={{ position: 'relative', flexShrink: 0 }} ref={ttsRef}>
          <button style={{ ...btn(showTTSSettings), opacity: 0.7 }}
            onClick={() => setShowTTSSettings(s => !s)} title="Voice settings"
            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--border-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = showTTSSettings ? '1' : '0.7'; e.currentTarget.style.color = showTTSSettings ? 'var(--gold)' : 'var(--text-muted)'; e.currentTarget.style.borderColor = showTTSSettings ? 'var(--border-strong)' : 'var(--border)'; }}>
            <Gear />
          </button>

          {showTTSSettings && (
            <div style={{
              position: 'fixed',
              bottom: '100px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 300,
              width: 'min(280px, 90vw)',
              background: 'var(--navy-card)',
              border: '1px solid var(--border-strong)',
              borderRadius: '16px',
              boxShadow: '0 0 0 1px var(--border), 0 24px 64px rgba(0,0,0,0.6), 0 0 32px var(--gold-glow)',
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                padding: '10px 14px 8px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--navy-soft)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: '0.78rem', color: 'var(--gold)', letterSpacing: '0.02em' }}>
                  Voice Settings
                </span>
                <button onClick={() => setShowTTSSettings(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1, padding: '0 2px' }}>
                  ✕
                </button>
              </div>

              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {/* Voice selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '5px' }}>
                    Voice
                  </label>
                  <select value={ttsVoice}
                    onChange={e => { setTtsVoice(e.target.value); saveTTSPrefs(e.target.value, ttsRate, ttsVolume); }}
                    style={{
                      width: '100%', padding: '6px 8px', borderRadius: '8px',
                      fontSize: '0.72rem', background: 'var(--navy-mid)',
                      border: '1px solid var(--border)', color: 'var(--text-primary)',
                      outline: 'none', cursor: 'pointer',
                    }}>
                    <option value="">Default</option>
                    {voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
                  </select>
                </div>

                {/* Speed */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Speed</label>
                    <span style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 700 }}>{ttsRate.toFixed(1)}×</span>
                  </div>
                  <input type="range" min="0.5" max="2" step="0.1" value={ttsRate}
                    onChange={e => { const r = parseFloat(e.target.value); setTtsRate(r); saveTTSPrefs(ttsVoice, r, ttsVolume); }}
                    style={{ width: '100%', accentColor: 'var(--gold)', cursor: 'pointer' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: '2px', opacity: 0.6 }}>
                    <span>0.5×</span><span>1×</span><span>2×</span>
                  </div>
                </div>

                {/* Volume */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Volume</label>
                    <span style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 700 }}>{Math.round(ttsVolume * 100)}%</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" value={ttsVolume}
                    onChange={e => { const v = parseFloat(e.target.value); setTtsVolume(v); saveTTSPrefs(ttsVoice, ttsRate, v); }}
                    style={{ width: '100%', accentColor: 'var(--gold)', cursor: 'pointer' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: '2px', opacity: 0.6 }}>
                    <span>0%</span><span>50%</span><span>100%</span>
                  </div>
                </div>

                {/* Done */}
                <button onClick={() => setShowTTSSettings(false)}
                  style={{
                    width: '100%', padding: '7px', borderRadius: '8px',
                    background: 'var(--gold-dim)', border: '1px solid var(--border-strong)',
                    color: 'var(--gold)', fontSize: '0.72rem', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                    letterSpacing: '0.05em',
                  }}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Regenerate */}
        <button style={btn()} onClick={onRegenerate} title="Regenerate"
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--border-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
          <Regenerate />
        </button>

        {/* Share */}
        <button style={btn()} title="Share"
          onClick={async () => { if (navigator.share) { try { await navigator.share({ text: message.content }); } catch { } } else handleCopy(); }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--border-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
          <Share />
        </button>

      </div>

      {/* Like note */}
      {showLikeNote && (
        <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '10px', background: 'var(--gold-dim)', border: '1px solid var(--border)', maxWidth: '360px' }}>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px', fontFamily: 'Lora, serif', fontStyle: 'italic' }}>What was most helpful? (optional)</p>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
            <textarea value={likeNote} onChange={e => setLikeNote(e.target.value)}
              placeholder="Tell us what worked well…" rows={2}
              style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', fontSize: '0.75rem', resize: 'none', background: 'var(--navy-mid)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'Lora, Georgia, serif' }} />
            <button onClick={submitLike}
              style={{ padding: '6px 12px', borderRadius: '8px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Send</button>
          </div>
        </div>
      )}

      {/* Dislike note */}
      {showDislikeNote && (
        <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '10px', background: 'var(--navy-mid)', border: '1px solid var(--border)', maxWidth: '360px' }}>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px', fontFamily: 'Lora, serif', fontStyle: 'italic' }}>What could be improved? (optional)</p>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
            <textarea value={dislikeNote} onChange={e => setDislikeNote(e.target.value)}
              placeholder="Tell us what fell short…" rows={2}
              style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', fontSize: '0.75rem', resize: 'none', background: 'var(--navy-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'Lora, Georgia, serif' }} />
            <button onClick={submitDislike}
              style={{ padding: '6px 12px', borderRadius: '8px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Send</button>
          </div>
        </div>
      )}

    </div>
  );
}
      

const LOADING_MESSAGES = [
  { phase: 'SEARCHING', text: 'Searching your course materials…' },
  { phase: 'SEARCHING', text: 'Consulting the lecture notes…' },
  { phase: 'SEARCHING', text: 'Cross-referencing sources…' },
  { phase: 'SEARCHING', text: 'Scanning indexed knowledge…' },
  { phase: 'SEARCHING', text: 'Tracing the argument through the texts…' },
  { phase: 'SEARCHING', text: 'Retrieving what the scholars say…' },
  { phase: 'THINKING',  text: 'Drawing connections across disciplines…' },
  { phase: 'THINKING',  text: 'Examining the question from all angles…' },
  { phase: 'THINKING',  text: 'Weighing the evidence carefully…' },
  { phase: 'THINKING',  text: 'Sifting through the material…' },
  { phase: 'THINKING',  text: 'The mind works best when unhurried…' },
  { phase: 'THINKING',  text: 'Something worth saying takes a moment…' },
  { phase: 'COMPOSING', text: 'Formulating a precise response…' },
  { phase: 'COMPOSING', text: 'The answer is taking shape…' },
  { phase: 'COMPOSING', text: 'Almost at the lectern…' },
  { phase: 'COMPOSING', text: 'One moment more…' },
];

const PHASE_COLORS: Record<string, string> = {
  SEARCHING: 'var(--gold)',
  THINKING:  '#a78bfa',
  COMPOSING: '#34d399',
};

function LoadingCard() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
        setVisible(true);
      }, 300);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const current = LOADING_MESSAGES[index];
  const phaseColor = PHASE_COLORS[current.phase];

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%', marginBottom: '12px' }}>
      <div style={{
        maxWidth: '82%', borderRadius: '16px', padding: '16px 20px',
        background: 'var(--navy-card)',
        border: `1px solid ${phaseColor}`,
        boxShadow: `0 0 12px ${phaseColor}33`,
        transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
        minWidth: '220px',
      }}>
        <div style={{
          fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.15em',
          color: phaseColor, marginBottom: '8px',
          transition: 'color 0.4s ease',
        }}>
          {current.phase}
        </div>
        <div style={{
          fontSize: '0.88rem', color: 'var(--text-primary)', fontStyle: 'italic',
          lineHeight: 1.5, opacity: visible ? 1 : 0,
          transition: 'opacity 0.3s ease', minHeight: '1.4em',
          fontFamily: 'var(--font-serif, Georgia, serif)',
        }}>
          {current.text}
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 12 }}>
          {[0, 1, 2, 3].map(i => (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: phaseColor, display: 'inline-block',
              animation: 'aiPulse 0.8s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
              transition: 'background 0.4s ease',
            }} />
          ))}
        </div>
      </div>
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

  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [historyOverlayOpen, setHistoryOverlayOpen] = useState(false);
  const [topics, setTopics] = useState<{ materialName: string; tree: TopicNode[]; items: string[] }[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  const [modeHistories, setModeHistories] = useState<Record<string, ChatMessage[]>>({});
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [aiStageLabel, setAiStageLabel] = useState('');
  const [input, setInput] = useState('');
  const [sessionSaving, setSessionSaving] = useState(false);
  const [viewerContent, setViewerContent] = useState<{ mode: any; data: any; relatedDocs?: any[] } | null>(null);

  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showScrollUp, setShowScrollUp] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const userMsgRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevHistoryLenRef = useRef(0);

  const [isListening, setIsListening] = useState(false);
  const [micPopoverOpen, setMicPopoverOpen] = useState(false);
  const [autoSend, setAutoSend] = useState(() => {
    try { return localStorage.getItem('ourstudyai_stt_autosend') === '1'; } catch { return false; }
  });
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try { return localStorage.getItem('ourstudyai_autospeak') === '1'; } catch { return false; }
  });
  const toggleAutoSpeak = () => {
    setAutoSpeak(prev => {
      const next = !prev;
      try { localStorage.setItem('ourstudyai_autospeak', next ? '1' : '0'); } catch {}
      return next;
    });
  };
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');
  const micPressTimer = useRef<any>(null);
  const micLongPressed = useRef(false);

  const handleSTT = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('Speech recognition not supported in this browser. Try Chrome.'); return; }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    finalTranscriptRef.current = '';
    recognition.onresult = (e: any) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          final += e.results[i][0].transcript + ' ';
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      finalTranscriptRef.current = final;
      setInput((final + interim).trim());
    };
    recognition.onspeechend = () => {
      if (autoSend && finalTranscriptRef.current.trim()) {
        recognitionRef.current?.stop();
      }
    };
    recognition.onend = () => {
      setIsListening(false);
      const finalText = finalTranscriptRef.current.trim();
      finalTranscriptRef.current = '';
      if (autoSend && finalText) {
        setInput('');
        sendMessage(finalText);
      }
    };
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const toggleAutoSend = () => {
    setAutoSend(prev => {
      const next = !prev;
      try { localStorage.setItem('ourstudyai_stt_autosend', next ? '1' : '0'); } catch {}
      return next;
    });
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

  const loadTopics = async () => {
    if (!courseId) return;
    setTopicsLoading(true);
    try {
      const [ownSnap, sharedSnap] = await Promise.all([
        getDocs(query(collection(db, 'materials'), where('confirmedCourseId', '==', courseId), where('indexed', '==', true))),
        getDocs(query(collection(db, 'materials'), where('sharedCourseIds', 'array-contains', courseId), where('indexed', '==', true))),
      ]);
      const seen = new Set<string>();
      const allDocs = [...ownSnap.docs, ...sharedSnap.docs].filter(d => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });
      const result: { materialName: string; tree: TopicNode[]; items: string[] }[] = [];
      allDocs.forEach(d => {
        const data = d.data();
        if (['past_questions', 'aoc'].includes(data.category)) return;
        const name: string = data.indexDisplayName ?? data.fileName ?? 'Material';
        const tree: TopicNode[] = Array.isArray(data.topicTree) ? data.topicTree : [];
        const items: string[] = tree.length > 0
          ? flattenTree(tree)
          : Array.isArray(data.contentList)
            ? data.contentList.filter((t: any) => typeof t === 'string' && t.trim().length > 2)
            : [];
        if (items.length > 0) result.push({ materialName: name, tree, items });
      });
      setTopics(result);
    } catch (err) {
      console.error('[loadTopics]', err);
    } finally {
      setTopicsLoading(false);
    }
  };

  useEffect(() => {
    const id = 'fa-cdn';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (!firebaseUser || !courseId) return;
    getCourseById(courseId).then(data => { setCourse(data); setLoading(false); });
  }, [firebaseUser, courseId]);

  useEffect(() => {
    if (!uid || !courseId || !userProfile) return;
    loadSession(activeMode);
  }, [uid, courseId, activeMode, userProfile]);

  useEffect(() => {
    const currentLen = chatHistory.length;
    const prevLen = prevHistoryLenRef.current;
    if (currentLen > prevLen && chatHistory[currentLen - 1]?.role === 'user') {
      const idx = currentLen - 1;
      setTimeout(() => {
        userMsgRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
    if (currentLen > prevLen && chatHistory[currentLen - 1]?.role === 'assistant') {
      const idx = currentLen - 1;
      setTimeout(() => {
        userMsgRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
    prevHistoryLenRef.current = currentLen;
  }, [chatHistory]);

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
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [chatHistory]);

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
    setAiStageLabel('');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message, courseId, mode: activeMode,
          courseName: course?.name,
          courseDescription: course?.description,
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
              if (json.type === 'status') {
                setAiStageLabel(json.label ?? '');
              } else if (json.type === 'text' && json.content) {
                fullResponse += json.content;
                setStreamingMessage(fullResponse);
              }
            } catch { }
          }
        }
      }
      if (!fullResponse.trim()) { fullResponse = "I didn't catch that — something interrupted the response. Try asking again."; }
      const aiMsg: ChatMessage = { role: 'assistant', content: fullResponse, timestamp: new Date().toISOString() };
      const finalHistory = [...newHistory, aiMsg];
      setModeHistories(prev => ({ ...prev, [activeMode]: finalHistory }));
      setStreamingMessage('');
      await saveSession(activeMode, finalHistory);
    } catch (err) { console.error('[sendMessage error]', err); }
    finally { setIsStreaming(false); setIsAiLoading(false); setAiStageLabel(''); }
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

  if (loading) return <LuxLoader label="Loading course..." />;
  if (!course) return (
    <div className='min-h-screen flex items-center justify-center' style={{ background: 'var(--navy)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Course not found.</p>
    </div>
  );

  const sideTabs: { id: SideTab; label: string; icon: string }[] = [
    { id: 'materials', label: 'Materials', icon: '📂' },
    { id: 'past-questions', label: 'Past Q', icon: '🗒' },
    { id: 'aoc', label: 'AOC', icon: '🎯' },
    { id: 'notes', label: 'Notes', icon: '📝' },
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
          <button onClick={() => { loadTopics(); setTopicsOpen(true); }}
            className='flex-shrink-0 text-xs px-2 py-1 rounded border'
            style={{ borderColor: 'var(--border)', color: 'var(--gold)' }}
            title='Course topics'>
            📋
          </button>
          <button onClick={() => setHistoryOverlayOpen(true)}
            className='flex-shrink-0 text-xs px-2 py-1 rounded border'
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            title='Chat history'>
            🕐
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
              <div style={{ height: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                <div style={{ textAlign: 'center', maxWidth: '280px', padding: '0 24px' }}>
                  <img
                    src="https://i.imgur.com/MPk1vBA.png"
                    alt="Lux Studiorum"
                    style={{
                      width: '52px', height: '52px', objectFit: 'contain',
                      marginBottom: '16px', display: 'block', margin: '0 auto 16px',
                      filter: 'drop-shadow(0 0 10px var(--gold-glow))',
                      animation: 'lux-logo-glow 3s ease-in-out infinite',
                    }}
                  />
                  <p style={{
                    fontFamily: 'Playfair Display, Georgia, serif',
                    fontWeight: 700, fontSize: '1rem',
                    color: 'var(--gold)', marginBottom: '6px', lineHeight: 1.3,
                  }}>
                    {course.name}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ width: '18px', height: '1px', background: 'var(--border-strong)', opacity: 0.5 }} />
                    <span style={{ fontFamily: 'IM Fell English, Georgia, serif', fontStyle: 'italic', fontSize: '0.65rem', color: 'var(--gold)', opacity: 0.5, letterSpacing: '0.1em' }}>
                      {MODES.find(m => m.id === activeMode)?.label}
                    </span>
                    <div style={{ width: '18px', height: '1px', background: 'var(--border-strong)', opacity: 0.5 }} />
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.76rem', lineHeight: 1.65, fontFamily: 'Lora, Georgia, serif', marginBottom: '10px' }}>
                    {MODES.find(m => m.id === activeMode)?.description}
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.62rem', opacity: 0.45, letterSpacing: '0.06em' }}>
                    Sem {semester} · Year {year}
                  </p>
                </div>
                <style>{`
                  @keyframes lux-logo-glow {
                    0%,100% { filter: drop-shadow(0 0 6px var(--gold-glow)); opacity: 0.85; }
                    50%      { filter: drop-shadow(0 0 18px var(--gold-dim)); opacity: 1; }
                  }
                `}</style>
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} ref={el => { userMsgRefs.current[i] = el; }} style={{ width: '100%', overflowX: 'hidden', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '82%', wordBreak: 'break-word',
                    borderRadius: '16px', padding: '10px 16px',
                    fontSize: 'var(--ai-font-size, 18px)',
                    background: msg.role === 'user' ? 'var(--gold-dim)' : 'var(--navy-card)',
color: 'var(--text-primary)',
border: msg.role === 'user' ? '1px solid var(--border-strong)' : '1px solid var(--border)',
boxShadow: msg.role === 'user' ? 'var(--shadow-gold)' : 'var(--shadow-card)',
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
                      autoSpeak={autoSpeak && i === chatHistory.length - 1 && !isStreaming}
                    />
                  </div>
                )}
              </div>
            ))}

            {isAiLoading && !streamingMessage && <LoadingCard />}
            {streamingMessage && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%', overflowX: 'hidden', marginBottom: '12px' }}>
                <div style={{ maxWidth: '82%', wordBreak: 'break-word', borderRadius: '16px', padding: '10px 16px', fontSize: 'var(--ai-font-size, 18px)', background: 'var(--navy-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                  <MarkdownRenderer content={streamingMessage} />
                </div>
              </div>
            )}
          </div>

          {/* Floating scroll buttons */}
          {(showScrollUp || showScrollDown) && (
            <div style={{ position: 'fixed', right: 14, top: '42vh', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 14, zIndex: 999 }}>
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
                  fontFamily: 'Lora, Georgia, serif',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                <div style={{ position: 'relative' }}>
                  {micPopoverOpen && (
                    <div style={{
                      position: 'absolute', bottom: '54px', right: 0,
                      background: 'var(--navy-card)', border: '1px solid var(--border)',
                      borderRadius: '10px', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px',
                      zIndex: 50, minWidth: '130px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                    }}>
                      <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Voice options</p>
                      <button onClick={() => toggleAutoSend()}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: autoSend ? 'rgba(196,160,80,0.12)' : 'transparent', color: autoSend ? 'var(--gold)' : 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer' }}>
                        <span>Auto-send</span>
                        <span style={{ fontWeight: 700 }}>{autoSend ? 'ON' : 'off'}</span>
                      </button>
                      <button onClick={() => toggleAutoSpeak()}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: autoSpeak ? 'rgba(196,160,80,0.12)' : 'transparent', color: autoSpeak ? 'var(--gold)' : 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer' }}>
                        <span>Auto-read</span>
                        <span>{autoSpeak ? '🔊' : '🔇'}</span>
                      </button>
                    </div>
                  )}
                  <button
                    onMouseDown={() => { micPressTimer.current = setTimeout(() => { setMicPopoverOpen(prev => !prev); }, 400); }}
                    onMouseUp={() => { clearTimeout(micPressTimer.current); }}
                    onMouseLeave={() => { clearTimeout(micPressTimer.current); }}
                    onTouchStart={() => { micLongPressed.current = false; micPressTimer.current = setTimeout(() => { micLongPressed.current = true; setMicPopoverOpen(prev => !prev); }, 400); }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      if (micPressTimer.current) { clearTimeout(micPressTimer.current); micPressTimer.current = null; }
                      if (!micLongPressed.current && !micPopoverOpen) { handleSTT(); }
                      micLongPressed.current = false;
                    }}
                    onClick={() => {}}
                    title={isListening ? 'Stop · Hold for options' : 'Speak · Hold for options'}
                    style={{
                      padding: '10px 12px', borderRadius: '12px',
                      background: isListening ? '#ef4444' : micPopoverOpen ? 'rgba(196,160,80,0.2)' : 'var(--navy-card)',
                      color: isListening ? '#fff' : micPopoverOpen ? 'var(--gold)' : 'var(--text-muted)',
                      border: '1px solid ' + (isListening ? '#ef4444' : micPopoverOpen ? 'var(--gold)' : 'var(--border)'),
                      fontSize: '1rem', cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none',
                    }}
                  >
                    <i className={isListening ? 'fa-solid fa-stop' : 'fa-solid fa-microphone'} />
                  </button>
                </div>
              </div>
              <button onClick={() => sendMessage()} disabled={isStreaming || !input.trim()}
                style={{
                  flexShrink: 0, padding: '10px 16px', borderRadius: '12px',
                  background: isStreaming || !input.trim() ? 'var(--navy-card)' : 'var(--gold)',
                  color: isStreaming || !input.trim() ? 'var(--text-muted)' : 'var(--ink)',
                  border: '1px solid var(--border-strong)',
                  boxShadow: isStreaming || !input.trim() ? 'none' : 'var(--shadow-gold)',
                  fontSize: '1rem', fontWeight: 700,
                  opacity: 1, cursor: isStreaming || !input.trim() ? 'not-allowed' : 'pointer',
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
                    background: activeSideTab === tab.id ? 'var(--gold-dim)' : 'transparent',
                    color: activeSideTab === tab.id ? 'var(--gold)' : 'var(--text-muted)',
                    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                    borderBottom: activeSideTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {activeSideTab === 'materials' && <MaterialsPanel courseId={courseId} onOpenViewer={(mode, data, related) => setViewerContent({ mode, data, relatedDocs: related })} />}
              {activeSideTab === 'past-questions' && <PastQuestionsPanel courseId={courseId} onOpenViewer={(mode, data, related) => setViewerContent({ mode, data, relatedDocs: related })} />}
              {activeSideTab === 'aoc' && <AOCPanel courseId={courseId} onOpenViewer={(mode, data, related) => setViewerContent({ mode, data, relatedDocs: related })} />}
              {activeSideTab === 'notes' && <StudyMemoryPanel courseId={courseId} chatHistory={chatHistory} defaultSection="notes" onOpenViewer={(mode, data, related) => setViewerContent({ mode, data, relatedDocs: related })} />}
              {activeSideTab === 'history' && <StudyMemoryPanel courseId={courseId} chatHistory={chatHistory} defaultSection="history" />}
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
              {activeSideTab === 'materials' && <MaterialsPanel courseId={courseId} onOpenViewer={(mode, data, related) => { setViewerContent({ mode, data, relatedDocs: related }); setDrawerOpen(false); }} />}
              {activeSideTab === 'past-questions' && <PastQuestionsPanel courseId={courseId} onOpenViewer={(mode, data, related) => { setViewerContent({ mode, data, relatedDocs: related }); setDrawerOpen(false); }} />}
              {activeSideTab === 'aoc' && <AOCPanel courseId={courseId} onOpenViewer={(mode, data, related) => { setViewerContent({ mode, data, relatedDocs: related }); setDrawerOpen(false); }} />}
              {activeSideTab === 'notes' && <StudyMemoryPanel courseId={courseId} chatHistory={chatHistory} defaultSection="notes" onOpenViewer={(mode, data, related) => { setViewerContent({ mode, data, relatedDocs: related }); setDrawerOpen(false); }} />}
              {activeSideTab === 'history' && <StudyMemoryPanel courseId={courseId} chatHistory={chatHistory} defaultSection="history" />}
            </div>
          </div>
        </div>
      )}

      {/* TOPICS DRAWER */}
      {topicsOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setTopicsOpen(false)}
        >
          <div
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0,
              width: 'min(320px, 92vw)',
              background: 'var(--navy-card)',
              borderLeft: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexShrink: 0,
                background: 'var(--navy-soft)',
              }}
            >
              <span
                style={{
                  fontFamily: 'Playfair Display, serif',
                  fontWeight: 700, color: 'var(--gold)', fontSize: '0.95rem',
                }}
              >
                📋 Course Topics
              </span>
              <button
                onClick={() => setTopicsOpen(false)}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* Helper hint */}
            <div
              style={{
                padding: '7px 16px 6px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
                background: 'rgba(196,160,80,0.03)',
              }}
            >
              <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Tap any topic to ask the AI about it
              </p>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
              {topicsLoading && (
                <p
                  style={{
                    color: 'var(--text-muted)', fontSize: '0.8rem',
                    textAlign: 'center', padding: '32px 0',
                  }}
                >
                  Loading…
                </p>
              )}
              {!topicsLoading && topics.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <p style={{ fontSize: '1.6rem', marginBottom: '8px' }}>📭</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No topics extracted yet.
                  </p>
                </div>
              )}
              {!topicsLoading &&
                topics.map((mat, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: '20px',
                      background: 'rgba(196,160,80,0.02)',
                      border: '1px solid rgba(196,160,80,0.08)',
                      borderRadius: '10px',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Material label */}
                    <div
                      style={{
                        padding: '6px 10px',
                        borderBottom: '1px solid rgba(196,160,80,0.1)',
                        background: 'rgba(196,160,80,0.05)',
                      }}
                    >
                      <p
                        style={{
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: 'var(--gold)',
                          opacity: 0.7,
                        }}
                      >
                        {mat.materialName}
                      </p>
                    </div>

                    {/* Tree or flat list */}
                    <div style={{ padding: '8px 10px' }}>
                      {mat.tree.length > 0 ? (
                        <ClickableTopicTree
                          nodes={mat.tree}
                          depth={0}
                          onSelect={(title) => {
                            sendMessage(`[TOPIC:${title}] Explain this topic: "${title}"`);
                            setTopicsOpen(false);
                          }}
                        />
                      ) : (
                        mat.items.map((item, j) => (
                          <button
                            key={j}
                            onClick={() => {
                              sendMessage(
                                '[TOPIC:' + item + '] Explain this topic: "' + item + '"'
                              );
                              setTopicsOpen(false);
                            }}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '6px 10px',
                              borderRadius: '7px',
                              background: 'var(--navy)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-secondary)',
                              fontSize: '0.76rem',
                              cursor: 'pointer',
                              marginBottom: '3px',
                            }}
                          >
                            {item}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {viewerContent && (
        <FullPageViewer
          mode={viewerContent.mode}
          data={viewerContent.data}
          relatedDocs={viewerContent.relatedDocs}
          onClose={() => setViewerContent(null)}
          onSendMessage={(text, mode?) => { if (mode) setActiveMode(mode as any); sendMessage(text); setViewerContent(null); }}
        />
      )}
      <SettingsPanel externalOpen={settingsPanelOpen} onClose={() => setSettingsPanelOpen(false)} />

      {/* HISTORY OVERLAY */}
      {historyOverlayOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column' }}
          onClick={() => setHistoryOverlayOpen(false)}
        >
          <div
            style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '300px', maxWidth: '90vw', background: 'var(--navy-card)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--navy-soft)' }}>
              <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '0.95rem' }}>🕐 Session History</span>
              <button
                onClick={() => setHistoryOverlayOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}
              >✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              <StudyMemoryPanel courseId={courseId} chatHistory={chatHistory} defaultSection="history" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
