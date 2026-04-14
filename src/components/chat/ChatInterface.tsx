// Chat Interface – Main chat component with messages and input
'use client';

import { useRef, useEffect, useState } from 'react';
import { ChatMessage, StudyMode } from '@/lib/types';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isStreaming: boolean;
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

export default function ChatInterface({
  messages,
  isStreaming,
  error,
  onSendMessage,
  onRegenerate,
  onRetry,
  courseName,
  mode,
  courseId,
  userId,
  userEmail,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (content: string) => {
    await onSendMessage(content);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="h-full flex flex-col">
      {/* Messages area — capped so input never sinks to very bottom */}
      <div
        ref={containerRef}
        className="overflow-y-auto px-4 py-4 md:px-6"
        style={{ flex: isEmpty ? '0 1 auto' : '1 1 auto', minHeight: 0 }}
      >
        {isEmpty && (
          <div className="flex items-center justify-center" style={{ minHeight: '30vh' }}>
            <div className="text-center max-w-md animate-fade-in">
              <div className="text-5xl mb-4">
                {mode === 'plain_explainer' && '💡'}
                {mode === 'practice_questions' && '❓'}
                {mode === 'exam_preparation' && '📝'}
                {mode === 'progress_check' && '📊'}
                {mode === 'research' && '🔬'}
                {mode === 'readiness_assessment' && '🎯'}
              </div>
              <h3 className="text-lg font-semibold mb-2">{courseName}</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                {mode === 'plain_explainer' && "Ask about any concept or paste a confusing passage. I'll explain it in plain language."}
                {mode === 'practice_questions' && 'Ask me to generate quiz questions on any topic from this course.'}
                {mode === 'exam_preparation' && "Ask an exam-style question and I'll write a complete formal answer, or submit your draft for review."}
                {mode === 'progress_check' && "Explain a topic in your own words and I'll assess your understanding."}
                {mode === 'research' && 'Ask any question – I\'ll answer from course materials and suggest additional academic sources.'}
                {mode === 'readiness_assessment' && 'I\'ll test your knowledge across all course topics. Type STOP at any time for your readiness report.'}
              </p>

              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => handleSend('Introduce me to this course')}
                  className="px-4 py-2 rounded-xl text-xs transition-all duration-200"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                >
                  📖 Introduce me to this course
                </button>
                {mode === 'practice_questions' && (
                  <button
                    onClick={() => handleSend('Give me 3 practice questions on the main topics')}
                    className="px-4 py-2 rounded-xl text-xs transition-all duration-200"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                  >
                    ❓ 3 practice questions
                  </button>
                )}
                {mode === 'readiness_assessment' && (
                  <button
                    onClick={() => handleSend('Start the readiness assessment')}
                    className="px-4 py-2 rounded-xl text-xs transition-all duration-200"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                  >
                    🎯 Start assessment
                  </button>
                )}
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

        <div ref={messagesEndRef} />
      </div>

      {/* Spacer when empty — pushes input to ~45% from top */}
      {isEmpty && <div style={{ flex: '1 1 auto' }} />}

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mb-2 p-3 rounded-xl text-sm flex items-center justify-between"
          style={{ background: 'rgba(239, 71, 111, 0.1)', border: '1px solid rgba(239, 71, 111, 0.3)', color: '#ef476f' }}>
          <span>⚠️ {error}</span>
          <button onClick={onRetry} className="btn-ghost text-xs" style={{ color: '#ef476f' }}>
            Retry
          </button>
        </div>
      )}

      {/* Input area */}
      <ChatInput onSend={handleSend} isStreaming={isStreaming} mode={mode} />
    </div>
  );
}
