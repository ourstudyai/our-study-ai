// Chat Interface – Main chat component with messages and input
'use client';

import { useRef, useEffect, useState } from 'react';
import { ChatMessage, StudyMode } from '@/lib/types';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  isAiLoading: boolean;
  aiStageLabel: string;
  error: string | null;
  onSendMessage: (content: string) => Promise<void>;
  onRegenerate: () => Promise<void>;
  onRetry: () => Promise<void>;
  courseName: string;
  mode: StudyMode;
  courseId: string;
  userId: string;
  userEmail: string;
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

function LoadingCard() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIndex(prev => (prev + 1) % LOADING_MESSAGES.length); setVisible(true); }, 300);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const current = LOADING_MESSAGES[index];

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%', marginBottom: '12px' }}>
      <div style={{
        maxWidth: '82%',
        borderRadius: '16px',
        borderBottomLeftRadius: '4px',
        padding: '16px 20px',
        background: 'var(--navy-card)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--border-strong)',
        boxShadow: 'var(--shadow-card)',
        minWidth: '220px',
      }}>
        <div style={{
          fontSize: '0.6rem',
          fontWeight: 700,
          letterSpacing: '0.18em',
          color: 'var(--gold)',
          marginBottom: '8px',
          fontFamily: 'DM Sans, sans-serif',
          textTransform: 'uppercase',
          opacity: 0.8,
        }}>
          {current.phase}
        </div>
        <div style={{
          fontSize: '0.88rem',
          color: 'var(--text-secondary)',
          fontStyle: 'italic',
          lineHeight: 1.6,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.3s ease',
          minHeight: '1.4em',
          fontFamily: 'Lora, Georgia, serif',
        }}>
          {current.text}
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 12 }}>
          {[0, 1, 2, 3].map(i => (
            <span key={i} style={{
              width: 5, height: 5, borderRadius: '50%',
              background: 'var(--gold)',
              display: 'inline-block',
              opacity: 0.6,
              animation: 'aiPulse 0.8s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

const MODE_DESCRIPTIONS: Record<string, string> = {
  plain_explainer: 'Ask about any concept or paste a confusing passage. I\'ll explain it clearly.',
  practice_questions: 'Ask me to generate quiz questions on any topic from this course.',
  exam_preparation: 'Ask an exam-style question and I\'ll write a complete formal answer.',
  progress_check: 'Explain a topic in your own words and I\'ll assess your understanding.',
  research: 'Ask any question — I\'ll search course materials and suggest academic sources.',
  readiness_assessment: 'I\'ll test your knowledge across all topics. Type STOP for your report.',
};

const MODE_PROMPTS: Record<string, { label: string; prompt: string }[]> = {
  plain_explainer: [{ label: '📖 Introduce this course', prompt: 'Introduce me to this course' }],
  practice_questions: [
    { label: '📖 Introduce this course', prompt: 'Introduce me to this course' },
    { label: '❓ 3 practice questions', prompt: 'Give me 3 practice questions on the main topics' },
  ],
  exam_preparation: [{ label: '📖 Introduce this course', prompt: 'Introduce me to this course' }],
  progress_check: [{ label: '📖 Introduce this course', prompt: 'Introduce me to this course' }],
  research: [{ label: '📖 Introduce this course', prompt: 'Introduce me to this course' }],
  readiness_assessment: [
    { label: '📖 Introduce this course', prompt: 'Introduce me to this course' },
    { label: '🎯 Start assessment', prompt: 'Start the readiness assessment' },
  ],
};

export default function ChatInterface({
  messages, isStreaming, isAiLoading, aiStageLabel, error,
  onSendMessage, onRegenerate, onRetry,
  courseName, mode, courseId, userId, userEmail,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiLoading]);

  const handleSend = async (content: string) => { await onSendMessage(content); };
  const isEmpty = messages.length === 0;

  return (
    <div className="h-full flex flex-col">
      <div
        ref={containerRef}
        className="overflow-y-auto px-4 py-4 md:px-6"
        style={{ flex: isEmpty ? '0 1 auto' : '1 1 auto', minHeight: 0 }}
      >
        {/* ── Branded empty state ── */}
        {isEmpty && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '36vh',
          }}>
            <div style={{ textAlign: 'center', maxWidth: '340px', padding: '0 16px' }}
              className="animate-fade-in">

              {/* Logo */}
              <img
                src="/icons/icon-192.png"
                alt="Lux Studiorum"
                style={{
                  width: '52px',
                  height: '52px',
                  objectFit: 'contain',
                  marginBottom: '16px',
                  filter: 'drop-shadow(0 0 12px var(--gold-glow))',
                  opacity: 0.85,
                }}
              />

              {/* Course name */}
              <h3 style={{
                fontFamily: 'Playfair Display, Georgia, serif',
                fontSize: '1.15rem',
                fontWeight: 700,
                color: 'var(--gold)',
                marginBottom: '6px',
                lineHeight: 1.3,
              }}>
                {courseName}
              </h3>

              {/* Latin divider */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
                <div style={{ width: '24px', height: '1px', background: 'var(--border-strong)', opacity: 0.5 }} />
                <span style={{
                  fontFamily: 'IM Fell English, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: '0.68rem',
                  color: 'var(--gold)',
                  opacity: 0.55,
                  letterSpacing: '0.1em',
                }}>
                  Lux in Tenebris Lucet
                </span>
                <div style={{ width: '24px', height: '1px', background: 'var(--border-strong)', opacity: 0.5 }} />
              </div>

              {/* Mode description */}
              <p style={{
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.65,
                marginBottom: '20px',
                fontFamily: 'Lora, Georgia, serif',
              }}>
                {MODE_DESCRIPTIONS[mode]}
              </p>

              {/* Prompt chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px' }}>
                {(MODE_PROMPTS[mode] ?? []).map(({ label, prompt }) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '99px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: 'var(--gold-dim)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--border-strong)';
                      e.currentTarget.style.color = 'var(--gold)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <MessageBubble
            key={message.id || index}
            message={message}
            isLast={index === messages.length - 1}
            isStreaming={isStreaming && index === messages.length - 1 && message.role === 'assistant'}
            onRegenerate={onRegenerate}
            onRetry={onRetry}
            courseId={courseId}
            courseName={courseName}
            mode={mode}
            userId={userId}
            userEmail={userEmail}
          />
        ))}

        {isAiLoading && !isStreaming && <LoadingCard />}
        <div ref={messagesEndRef} />
      </div>

      {isEmpty && <div style={{ flex: '1 1 auto' }} />}

      {error && (
        <div className="mx-4 mb-2 p-3 rounded-xl text-sm flex items-center justify-between"
          style={{ background: 'var(--red-dim)', border: '1px solid rgba(192,57,43,0.3)', color: 'var(--gold)' }}>
          <span>⚠️ {error}</span>
          <button onClick={onRetry} className="btn-ghost text-xs" style={{ color: 'var(--gold)' }}>Retry</button>
        </div>
      )}

      <ChatInput onSend={handleSend} isStreaming={isStreaming} mode={mode} />
    </div>
  );
}
