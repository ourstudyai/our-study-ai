// Chat Input — Message input with send button + STT
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { StudyMode } from '@/lib/types';

interface ChatInputProps {
  onSend: (content: string) => Promise<void>;
  isStreaming: boolean;
  mode: StudyMode;
}

const PLACEHOLDER_MAP: Record<StudyMode, string> = {
  plain_explainer: 'Ask about any concept or paste a confusing passage…',
  practice_questions: 'Ask for quiz questions on a topic…',
  exam_preparation: 'Ask an exam question or paste your draft for review…',
  progress_check: 'Explain a topic in your own words…',
  research: 'Ask a research question…',
  readiness_assessment: 'Type your answer or STOP for your readiness report…',
};

export default function ChatInput({ onSend, isStreaming, mode }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [autoSend, setAutoSend] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('stt_autosend') === 'true';
    return false;
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  }, [input]);

  const handleSubmit = useCallback(async (text?: string) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await onSend(trimmed);
  }, [input, isStreaming, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('Speech recognition is not supported in this browser. Try Chrome.'); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (autoSend) handleSubmit(transcript);
      else setInput((prev) => prev ? prev + ' ' + transcript : transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
  };

  const toggleAutoSend = () => {
    setAutoSend((prev) => {
      const next = !prev;
      localStorage.setItem('stt_autosend', String(next));
      return next;
    });
  };

  const canSend = input.trim() && !isStreaming;

  return (
    <div
      style={{
        flexShrink: 0,
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--navy-card)',
      }}
    >
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>

        {/* Input row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>

          {/* Textarea */}
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={PLACEHOLDER_MAP[mode]}
              disabled={isStreaming}
              rows={1}
              id="chat-input"
              style={{
                width: '100%',
                resize: 'none',
                minHeight: '48px',
                maxHeight: '160px',
                padding: '13px 16px',
                borderRadius: '14px',
                background: 'var(--navy-mid)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '0.88rem',
                fontFamily: 'Lora, Georgia, serif',
                lineHeight: 1.6,
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            />
          </div>

          {/* Mic button */}
          <button
            onClick={toggleListening}
            disabled={isStreaming}
            title={isListening ? 'Stop listening' : 'Speak your message'}
            style={{
              flexShrink: 0,
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isStreaming ? 'not-allowed' : 'pointer',
              opacity: isStreaming ? 0.4 : 1,
              transition: 'all 0.2s',
              background: isListening ? 'var(--red-dim)' : 'var(--navy-mid)',
              border: `1px solid ${isListening ? 'rgba(192,57,43,0.5)' : 'var(--border)'}`,
            }}
          >
            {isListening ? (
              <span style={{ fontSize: '1.1rem', animation: 'aiPulse 0.8s ease-in-out infinite' }}>🎙️</span>
            ) : (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                style={{ color: 'var(--text-muted)' }}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>

          {/* Send button */}
          <button
            onClick={() => handleSubmit()}
            disabled={!canSend}
            id="send-button"
            style={{
              flexShrink: 0,
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: canSend ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              background: canSend ? 'var(--gold)' : 'var(--navy-mid)',
              border: `1px solid ${canSend ? 'var(--border-strong)' : 'var(--border)'}`,
              opacity: canSend ? 1 : 0.4,
              boxShadow: canSend ? 'var(--shadow-gold)' : 'none',
            }}
          >
            {isStreaming ? (
              <div style={{
                width: '16px', height: '16px',
                border: '2px solid var(--gold)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'lux-spin 0.8s linear infinite',
              }} />
            ) : (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                style={{ color: canSend ? 'var(--ink)' : 'var(--text-muted)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
              </svg>
            )}
          </button>
        </div>

        {/* Bottom row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
          <p style={{
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
            fontFamily: 'IM Fell English, Georgia, serif',
            fontStyle: 'italic',
            opacity: 0.7,
          }}>
            AI responses are grounded in course materials. Always verify critical information.
          </p>
          <button
            onClick={toggleAutoSend}
            title="Auto-send after speech"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '0.68rem',
              padding: '3px 10px',
              borderRadius: '99px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: autoSend ? 'var(--gold-dim)' : 'transparent',
              border: `1px solid ${autoSend ? 'var(--border-strong)' : 'var(--border)'}`,
              color: autoSend ? 'var(--gold)' : 'var(--text-muted)',
            }}
          >
            ⚡ Auto-send
          </button>
        </div>
      </div>

      <style>{`@keyframes lux-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
