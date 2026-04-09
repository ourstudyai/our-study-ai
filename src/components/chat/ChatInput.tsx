// Chat Input — Message input with send button
'use client';

import { useState, useRef, useEffect } from 'react';
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  }, [input]);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await onSend(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-shrink-0 p-3 md:p-4 border-t"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-secondary)' }}>
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

        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isStreaming}
          className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 disabled:opacity-30"
          style={{
            background: input.trim() && !isStreaming
              ? 'linear-gradient(135deg, #7c6cf0, #5c4cd0)'
              : 'rgba(255,255,255,0.03)',
            border: '1px solid var(--color-border)',
          }}
          id="send-button"
        >
          {isStreaming ? (
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          )}
        </button>
      </div>

      <p className="text-center text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
        AI responses are grounded in course materials. Always verify critical information.
      </p>
    </div>
  );
}
