// Response Toolbar — Action buttons for AI responses
'use client';

import { useState } from 'react';
import { ChatMessage, StudyMode, FeedbackType } from '@/lib/types';

interface ResponseToolbarProps {
  message: ChatMessage;
  isStreaming: boolean;
  isError: boolean;
  onRegenerate: () => Promise<void>;
  onRetry: () => Promise<void>;
  courseId: string;
  courseName: string;
  mode: StudyMode;
  userId: string;
  userEmail: string;
}

export default function ResponseToolbar({
  message,
  isStreaming,
  isError,
  onRegenerate,
  onRetry,
  courseId,
  courseName,
  mode,
  userId,
  userEmail,
}: ResponseToolbarProps) {
  const [feedback, setFeedback] = useState<FeedbackType>(message.feedback || null);
  const [copied, setCopied] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagDescription, setFlagDescription] = useState('');
  const [flagSubmitted, setFlagSubmitted] = useState(false);

  if (isStreaming) return null;

  const handleCopy = async () => {
    try {
      // Strip markdown formatting for clean copy
      const cleanText = message.content
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/📖|📐|✍️|⚠️|💡/g, '');

      await navigator.clipboard.writeText(cleanText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleFeedback = (type: FeedbackType) => {
    setFeedback(feedback === type ? null : type);
    // In production, save to Firestore
  };

  const handleFlagSubmit = async () => {
    if (!flagDescription.trim()) return;

    try {
      await fetch('/api/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          userEmail,
          courseId,
          courseName,
          mode,
          question: '', // Would be the preceding user message
          aiResponse: message.content.substring(0, 500),
          studentDescription: flagDescription,
        }),
      });
      setFlagSubmitted(true);
      setTimeout(() => {
        setShowFlagModal(false);
        setFlagSubmitted(false);
        setFlagDescription('');
      }, 2000);
    } catch (err) {
      console.error('Flag submission error:', err);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1 mt-3 pt-2 border-t flex-wrap"
        style={{ borderColor: 'var(--border)' }}>

        {/* Helpful */}
        <button
          onClick={() => handleFeedback('helpful')}
          className={`toolbar-btn ${feedback === 'helpful' ? 'active-helpful' : ''}`}
          title="Helpful"
        >
          👍
        </button>

        {/* Not helpful */}
        <button
          onClick={() => handleFeedback('not_helpful')}
          className={`toolbar-btn ${feedback === 'not_helpful' ? 'active-not-helpful' : ''}`}
          title="Not helpful"
        >
          👎
        </button>

        {/* Divider */}
        <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }} />

        {/* Copy */}
        <button
          onClick={handleCopy}
          className="toolbar-btn"
          title="Copy response"
        >
          {copied ? '✅' : '📋'} <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
        </button>

        {/* Flag */}
        <button
          onClick={() => setShowFlagModal(true)}
          className="toolbar-btn"
          title="Flag issue"
        >
          🚩 <span className="hidden sm:inline">Flag</span>
        </button>

        {/* Regenerate */}
        <button
          onClick={onRegenerate}
          className="toolbar-btn"
          title="Regenerate response"
        >
          🔄 <span className="hidden sm:inline">Regenerate</span>
        </button>

        {/* Retry (only on error) */}
        {isError && (
          <button
            onClick={onRetry}
            className="toolbar-btn"
            style={{ color: '#ef476f' }}
            title="Retry"
          >
            ⟳ Retry
          </button>
        )}
      </div>

      {/* Flag Modal */}
      {showFlagModal && (
        <div className="modal-overlay" onClick={() => setShowFlagModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">🚩 Flag This Response</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Describe what&apos;s incorrect, incomplete, or misleading.
            </p>

            {flagSubmitted ? (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-sm font-medium" style={{ color: '#60d394' }}>
                  Flag submitted. Thank you!
                </p>
              </div>
            ) : (
              <>
                <textarea
                  value={flagDescription}
                  onChange={(e) => setFlagDescription(e.target.value)}
                  placeholder="Describe the issue with this response..."
                  className="input-field resize-none mb-4"
                  rows={4}
                  id="flag-description"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowFlagModal(false)}
                    className="btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFlagSubmit}
                    disabled={!flagDescription.trim()}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    Submit Flag
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
