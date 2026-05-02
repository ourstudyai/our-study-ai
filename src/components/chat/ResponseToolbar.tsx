// Response Toolbar — Action buttons for AI responses
'use client';

import { useState, useEffect, useRef } from 'react';
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
  const [showLikeNote, setShowLikeNote] = useState(false);
  const [showDislikeNote, setShowDislikeNote] = useState(false);
  const [likeNote, setLikeNote] = useState('');
  const [dislikeNote, setDislikeNote] = useState('');
  const [noteSent, setNoteSent] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showTTSSettings, setShowTTSSettings] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [speechRate, setSpeechRate] = useState(1);
  const ttsSettingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('tts_voice');
    const savedRate = localStorage.getItem('tts_rate');
    if (saved) setSelectedVoice(saved);
    if (savedRate) setSpeechRate(parseFloat(savedRate));

    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length) setVoices(v);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Close TTS settings when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ttsSettingsRef.current && !ttsSettingsRef.current.contains(e.target as Node)) {
        setShowTTSSettings(false);
      }
    };
    if (showTTSSettings) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showTTSSettings]);

  if (isStreaming) return null;

  const stripMarkdown = (text: string) =>
    text.replace(/#{1,6}\s/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/📖|📐|✍️|⚠️|💡/g, '');

  const handleTTS = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(stripMarkdown(message.content));
    utterance.rate = speechRate;
    if (selectedVoice) {
      const voice = voices.find(v => v.name === selectedVoice);
      if (voice) utterance.voice = voice;
    }
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(stripMarkdown(message.content));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const saveFeedback = async (type: FeedbackType, note?: string) => {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId, userEmail, courseId, courseName, mode,
          messageId: message.id,
          type,
          note: note || '',
          aiResponse: message.content.substring(0, 1000),
        }),
      });
    } catch (err) {
      console.error('Feedback error:', err);
    }
  };

  const handleLike = () => {
    const next = feedback === 'helpful' ? null : 'helpful';
    setFeedback(next);
    if (next === 'helpful') { setShowDislikeNote(false); setShowLikeNote(true); }
    else setShowLikeNote(false);
    if (next) saveFeedback(next);
  };

  const handleDislike = () => {
    const next = feedback === 'not_helpful' ? null : 'not_helpful';
    setFeedback(next);
    if (next === 'not_helpful') { setShowLikeNote(false); setShowDislikeNote(true); }
    else setShowDislikeNote(false);
    if (next) saveFeedback(next);
  };

  const handleSendNote = async (note: string, type: FeedbackType) => {
    if (!note.trim()) { setShowLikeNote(false); setShowDislikeNote(false); return; }
    await saveFeedback(type, note);
    setNoteSent(true);
    setTimeout(() => {
      setShowLikeNote(false); setShowDislikeNote(false);
      setNoteSent(false); setLikeNote(''); setDislikeNote('');
    }, 1800);
  };

  const handleFlagSubmit = async () => {
    if (!flagDescription.trim()) return;
    try {
      await fetch('/api/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId, userEmail, courseId, courseName, mode,
          question: '',
          aiResponse: message.content.substring(0, 1000),
          studentDescription: flagDescription,
        }),
      });
      setFlagSubmitted(true);
      setTimeout(() => {
        setShowFlagModal(false); setFlagSubmitted(false); setFlagDescription('');
      }, 2500);
    } catch (err) {
      console.error('Flag error:', err);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1 mt-3 pt-2 border-t flex-wrap"
        style={{ borderColor: 'var(--border)' }}>

        {/* Like */}
        <button onClick={handleLike}
          className={`toolbar-btn ${feedback === 'helpful' ? 'active-helpful' : ''}`}
          title="Helpful">👍</button>

        {/* Dislike */}
        <button onClick={handleDislike}
          className={`toolbar-btn ${feedback === 'not_helpful' ? 'active-not-helpful' : ''}`}
          title="Not helpful">👎</button>

        <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }} />

        {/* Copy */}
        <button onClick={handleCopy} className="toolbar-btn" title="Copy response">
          {copied ? '✅' : '📋'} <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
        </button>

        {/* TTS Speaker */}
        <button onClick={handleTTS} className="toolbar-btn" title={isSpeaking ? 'Stop reading' : 'Read aloud'}>
          {isSpeaking ? '⏹️' : '🔊'}
        </button>

        {/* TTS Gear */}
        <div className="relative" ref={ttsSettingsRef}>
          <button
            onClick={() => setShowTTSSettings(v => !v)}
            className="toolbar-btn"
            title="TTS settings"
            style={{ fontSize: '12px', opacity: 0.7 }}
          >
            ⚙️
          </button>

          {showTTSSettings && (
            <div className="absolute bottom-10 left-0 z-50 rounded-xl p-3 shadow-xl"
              style={{
                background: 'var(--navy-dark, #0f172a)',
                border: '1px solid var(--border)',
                minWidth: '220px',
              }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                🔊 TTS Settings
              </p>

              {/* Voice selector */}
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>Voice</label>
              <select
                value={selectedVoice}
                onChange={(e) => {
                  setSelectedVoice(e.target.value);
                  localStorage.setItem('tts_voice', e.target.value);
                }}
                className="input-field text-xs mb-3 w-full"
                style={{ padding: '4px 8px', height: 'auto' }}
              >
                <option value="">Default</option>
                {voices.map(v => (
                  <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                ))}
              </select>

              {/* Speed slider */}
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
                Speed: {speechRate.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.5" max="2" step="0.1"
                value={speechRate}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setSpeechRate(val);
                  localStorage.setItem('tts_rate', String(val));
                }}
                className="w-full mb-1"
                style={{ accentColor: '#7c6cf0' }}
              />
              <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>0.5x</span><span>1x</span><span>2x</span>
              </div>
            </div>
          )}
        </div>

        {/* Regenerate */}
        <button onClick={onRegenerate} className="toolbar-btn" title="Regenerate response">
          🔄 <span className="hidden sm:inline">Retry</span>
        </button>

        {/* Flag */}
        <button onClick={() => setShowFlagModal(true)} className="toolbar-btn" title="Flag issue">
          🚩 <span className="hidden sm:inline">Flag</span>
        </button>

        {isError && (
          <button onClick={onRetry} className="toolbar-btn" style={{ color: '#ef476f' }}>⟳ Retry</button>
        )}
      </div>

      {/* Like note */}
      {showLikeNote && (
        <div className="mt-2 rounded-xl p-3" style={{ background: 'rgba(96,211,148,0.07)', border: '1px solid rgba(96,211,148,0.2)' }}>
          {noteSent ? (
            <p className="text-xs text-center" style={{ color: '#60d394' }}>✅ Thanks for your feedback!</p>
          ) : (
            <>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>What did you love? (optional)</p>
              <textarea value={likeNote} onChange={(e) => setLikeNote(e.target.value)}
                placeholder="Tell us what was helpful..." className="input-field resize-none text-xs mb-2" rows={2} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowLikeNote(false)} className="btn-secondary text-xs">Skip</button>
                <button onClick={() => handleSendNote(likeNote, 'helpful')} className="btn-primary text-xs">Send</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Dislike note */}
      {showDislikeNote && (
        <div className="mt-2 rounded-xl p-3" style={{ background: 'rgba(239,71,111,0.07)', border: '1px solid rgba(239,71,111,0.2)' }}>
          {noteSent ? (
            <p className="text-xs text-center" style={{ color: '#ef476f' }}>✅ Thanks — we'll use this to improve.</p>
          ) : (
            <>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>What was wrong? (optional)</p>
              <textarea value={dislikeNote} onChange={(e) => setDislikeNote(e.target.value)}
                placeholder="Tell us what was unhelpful..." className="input-field resize-none text-xs mb-2" rows={2} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowDislikeNote(false)} className="btn-secondary text-xs">Skip</button>
                <button onClick={() => handleSendNote(dislikeNote, 'not_helpful')} className="btn-primary text-xs">Send</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Flag Modal */}
      {showFlagModal && (
        <div className="modal-overlay" onClick={() => setShowFlagModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">🚩 Flag This Response</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Describe what&apos;s incorrect, incomplete, or misleading. An admin will review it.
            </p>
            {flagSubmitted ? (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-sm font-medium" style={{ color: '#60d394' }}>Your flag has been sent to the admin.</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>We'll review it and get back to you.</p>
              </div>
            ) : (
              <>
                <textarea value={flagDescription} onChange={(e) => setFlagDescription(e.target.value)}
                  placeholder="Describe the issue with this response..."
                  className="input-field resize-none mb-4" rows={4} />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowFlagModal(false)} className="btn-secondary text-sm">Cancel</button>
                  <button onClick={handleFlagSubmit} disabled={!flagDescription.trim()}
                    className="btn-primary text-sm disabled:opacity-50">Submit Flag</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
