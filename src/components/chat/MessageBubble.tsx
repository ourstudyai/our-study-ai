// Message Bubble — Renders a single chat message with 4-section formatting
'use client';

import { useState } from 'react';
import { ChatMessage, StudyMode } from '@/lib/types';
import ResponseToolbar from './ResponseToolbar';

interface MessageBubbleProps {
  message: ChatMessage;
  isLast: boolean;
  isStreaming: boolean;
  onRegenerate: () => Promise<void>;
  onRetry: () => Promise<void>;
  courseId: string;
  courseName: string;
  mode: StudyMode;
  userId: string;
  userEmail: string;
}

export default function MessageBubble({
  message,
  isLast,
  isStreaming,
  onRegenerate,
  onRetry,
  courseId,
  courseName,
  mode,
  userId,
  userEmail,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';

  return (
    <div className={`mb-4 flex ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}>
      <div
        className={`max-w-[88%] md:max-w-[75%] rounded-2xl px-4 py-3 ${isUser ? 'rounded-br-md' : 'rounded-bl-md'}`}
        style={{
          background: isUser
            ? 'var(--gold-dim)'
            : isError
              ? 'var(--red-dim)'
              : 'var(--navy-card)',
          border: `1px solid ${
            isUser
              ? 'var(--border-strong)'
              : isError
                ? 'rgba(192,57,43,0.3)'
                : 'var(--border)'
          }`,
          boxShadow: isUser ? 'var(--shadow-gold)' : 'var(--shadow-card)',
          // AI messages get a subtle left accent
          borderLeft: !isUser && !isError
            ? '3px solid var(--border-strong)'
            : undefined,
        }}
      >
        <div
          className={`text-sm leading-relaxed chat-markdown ${isStreaming ? 'streaming-cursor' : ''}`}
          style={{ color: isError ? 'var(--gold)' : 'var(--text-primary)' }}
        >
          <FormattedContent content={message.content} isStreaming={isStreaming} />
        </div>

        {!isUser && message.status !== 'sending' && (
          <ResponseToolbar
            message={message}
            isStreaming={isStreaming}
            isError={isError}
            onRegenerate={onRegenerate}
            onRetry={onRetry}
            courseId={courseId}
            courseName={courseName}
            mode={mode}
            userId={userId}
            userEmail={userEmail}
          />
        )}
      </div>
    </div>
  );
}

// Formats AI response with colored section headings
function FormattedContent({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  if (!content) {
    return (
      <div className="flex items-center gap-2">
        <div className="pulse-dot" />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Thinking...</span>
      </div>
    );
  }

  const sections = content.split(/(?=##\s)/);

  return (
    <div>
      {sections.map((section, i) => {
        let sectionClass = '';
        if (section.includes('Plain Explanation') || section.includes('📖')) sectionClass = 'chat-section-plain';
        else if (section.includes('Precise Definition') || section.includes('📐')) sectionClass = 'chat-section-precise';
        else if (section.includes('How to Write') || section.includes('✍️')) sectionClass = 'chat-section-write';
        else if (section.includes('What to Watch') || section.includes('⚠️')) sectionClass = 'chat-section-watch';

        const lines = section.split('\n');

        return (
          <div key={i}>
            {lines.map((line, j) => {
              if (line.startsWith('## ')) {
                return (
                  <h2 key={j} className={`chat-section-heading ${sectionClass}`}>
                    {line.replace('## ', '')}
                  </h2>
                );
              }
              if (line.startsWith('### ')) {
                return (
                  <h3 key={j} className="text-sm font-bold mt-3 mb-1.5"
                    style={{ color: 'var(--gold)', fontFamily: 'Playfair Display, Georgia, serif' }}>
                    {line.replace('### ', '')}
                  </h3>
                );
              }
              if (line.match(/^[-*]\s/)) {
                return (
                  <li key={j} className="ml-4 mb-1 list-disc text-sm leading-relaxed">
                    <InlineFormat text={line.replace(/^[-*]\s/, '')} />
                  </li>
                );
              }
              if (line.match(/^\d+\.\s/)) {
                return (
                  <li key={j} className="ml-4 mb-1 list-decimal text-sm leading-relaxed">
                    <InlineFormat text={line.replace(/^\d+\.\s/, '')} />
                  </li>
                );
              }
              if (line.startsWith('> ')) {
                return (
                  <blockquote key={j} className="pl-4 my-2 italic border-l-2"
                    style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)', fontFamily: 'Lora, Georgia, serif' }}>
                    <InlineFormat text={line.replace('> ', '')} />
                  </blockquote>
                );
              }
              if (line.trim() === '') return <div key={j} className="h-2" />;
              return (
                <p key={j} className="mb-2 text-sm leading-relaxed">
                  <InlineFormat text={line} />
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function InlineFormat({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`|\[.*?\])/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} style={{ color: 'var(--gold)', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
          return <em key={i} style={{ fontFamily: 'Lora, Georgia, serif' }}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="px-1.5 py-0.5 rounded text-xs"
              style={{ background: 'var(--gold-dim)', color: 'var(--gold)', border: '1px solid var(--border)' }}>
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith('[') && part.endsWith(']')) {
          return (
            <span key={i} className="px-1 rounded text-xs"
              style={{ background: 'var(--gold-dim)', color: 'var(--gold)', border: '1px solid var(--border)' }}>
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
