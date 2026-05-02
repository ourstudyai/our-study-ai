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
  plain_explainer: 'Ask about any concept or paste a confusing passage...',
  practice_questions: 'Ask for quiz questions on a topic...',
  exam_preparation: 'Ask an exam question or paste your draft for review...',
  progress_check: 'Explain a topic in your own words...',
  research: 'Ask a research question...',
  readiness_assessment: 'Type your answer or STOP for your readiness report...',
};

export default function ChatInput({ onSend, isStreaming, mode }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [autoSend, setAutoSend] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('stt_autosend') === 'true';
    }
    return false;
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-resize textarea
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Try Chrome.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (autoSend) {
        handleSubmit(transcript);
      } else {
        setInput((prev) => prev ? prev + ' ' + transcript : transcript);
      }
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

  return (
    <div className="flex-shrink-0 p-3 md:p-4 border-t"
      style={{ borderColor: 'var(--border)', background: 'var(--navy-mid)' }}>
      <div className="max-w-3xl mx-auto flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDER_MAP[mode]}
            disabled={isStreaming}
            rows={1}
            className="input-field resize-none pr-12"
            style={{ minHeight: '48px', maxHeight: '160px' }}
            id="chat-input"
          />
        </div>

        {/* Mic button */}
        <button
          onClick={toggleListening}
          disabled={isStreaming}
          title={isListening ? 'Stop listening' : 'Speak your message'}
          className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 disabled:opacity-30"
          style={{
            background: isListening
              ? 'rgba(239,71,111,0.15)'
              : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isListening ? 'rgba(239,71,111,0.5)' : 'var(--border)'}`,
          }}
        >
          {isListening ? (
            <span className="text-lg animate-pulse">🎙️</span>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
              style={{ color: 'var(--text-muted)' }}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>

        {/* Send button */}
        <button
          onClick={() => handleSubmit()}
          disabled={!input.trim() || isStreaming}
          className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 disabled:opacity-30"
          style={{
            background: input.trim() && !isStreaming
              ? 'linear-gradient(135deg, #7c6cf0, #5c4cd0)'
              : 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
          }}
          id="send-button"
        >
          {isStreaming ? (
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }} />
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          )}
        </button>
      </div>

      {/* Bottom row: disclaimer + auto-send toggle */}
      <div className="max-w-3xl mx-auto flex items-center justify-between mt-2">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          AI responses are grounded in course materials. Always verify critical information.
        </p>
        <button
          onClick={toggleAutoSend}
          title="Auto-send after speech"
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
          style={{
            background: autoSend ? 'rgba(124,108,240,0.15)' : 'transparent',
            border: `1px solid ${autoSend ? 'rgba(124,108,240,0.4)' : 'var(--border)'}`,
            color: autoSend ? '#7c6cf0' : 'var(--text-muted)',
          }}
        >
          ⚡ Auto-send
        </button>
      </div>
    </div>
  );
}
