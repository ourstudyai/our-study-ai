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

// Premium SVG icons — all use currentColor, all theme-safe
const Icons = {
  thumbUp: (filled: boolean) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.25M6.633 10.5H5.25a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25h1.383" />
    </svg>
  ),
  thumbDown: (filled: boolean) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.367 13.5c-.806 0-1.533.446-2.031 1.08a9.041 9.041 0 01-2.861 2.4c-.723.384-1.35.956-1.653 1.715a4.498 4.498 0 00-.322 1.672V21a.75.75 0 01-.75.75 2.25 2.25 0 01-2.25-2.25c0-1.152.26-2.243.723-3.218.266-.558-.107-1.282-.725-1.282H4.372c-1.026 0-1.945-.694-2.054-1.715A12.134 12.134 0 012.25 12c0-2.848.992-5.464 2.649-7.521.388-.482.987-.729 1.605-.729h6.377c.483 0 .964.078 1.423.23l3.114 1.04a4.501 4.501 0 001.423.23h1.383M17.367 13.5H18.75a2.25 2.25 0 002.25-2.25V4.5a2.25 2.25 0 00-2.25-2.25h-1.383" />
    </svg>
  ),
  copy: (done: boolean) => done ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
    </svg>
  ),
  speaker: (active: boolean) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      {active ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V19.94a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.395C2.806 8.757 3.63 8.25 4.51 8.25H6.75z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53L6.75 15.75H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.395C2.806 8.757 3.63 8.25 4.51 8.25H6.75z" />
      )}
    </svg>
  ),
  gear: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  regenerate: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  ),
};

// Shared button style factory
function toolBtn(active = false, danger = false): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '5px 9px',
    borderRadius: '8px',
    border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
    background: active ? 'var(--gold-dim)' : 'transparent',
    color: active ? 'var(--gold)' : danger ? 'var(--text-muted)' : 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '0.7rem',
    fontFamily: 'DM Sans, sans-serif',
    fontWeight: 500,
    letterSpacing: '0.02em',
    transition: 'all 0.15s ease',
  };
}

export default function ResponseToolbar({
  message, isStreaming, isError,
  onRegenerate, onRetry,
  courseId, courseName, mode, userId, userEmail,
}: ResponseToolbarProps) {
  const [feedback, setFeedback] = useState<FeedbackType>(message.feedback || null);
  const [copied, setCopied] = useState(false);
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
    const loadVoices = () => { const v = window.speechSynthesis.getVoices(); if (v.length) setVoices(v); };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ttsSettingsRef.current && !ttsSettingsRef.current.contains(e.target as Node)) setShowTTSSettings(false);
    };
    if (showTTSSettings) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showTTSSettings]);

  if (isStreaming) return null;

  const stripMarkdown = (text: string) =>
    text.replace(/#{1,6}\s/g, '').replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1').replace(/`(.*?)`/g, '$1')
      .replace(/📖|📐|✍️|⚠️|💡/g, '');

  const handleTTS = () => {
    if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(stripMarkdown(message.content));
    utterance.rate = speechRate;
    if (selectedVoice) { const voice = voices.find(v => v.name === selectedVoice); if (voice) utterance.voice = voice; }
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
    } catch (err) { console.error('Copy failed:', err); }
  };

  const saveFeedback = async (type: FeedbackType, note?: string) => {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userEmail, courseId, courseName, mode, messageId: message.id, type, note: note || '', aiResponse: message.content.substring(0, 1000) }),
      });
    } catch (err) { console.error('Feedback error:', err); }
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
    setTimeout(() => { setShowLikeNote(false); setShowDislikeNote(false); setNoteSent(false); setLikeNote(''); setDislikeNote(''); }, 1800);
  };

  return (
    <>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        marginTop: '12px',
        paddingTop: '10px',
        borderTop: '1px solid var(--border)',
        flexWrap: 'wrap',
      }}>

        {/* Like */}
        <button
          onClick={handleLike}
          title="Helpful"
          style={toolBtn(feedback === 'helpful')}
          onMouseEnter={e => { if (feedback !== 'helpful') { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--gold)'; } }}
          onMouseLeave={e => { if (feedback !== 'helpful') { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
        >
          {Icons.thumbUp(feedback === 'helpful')}
        </button>

        {/* Dislike */}
        <button
          onClick={handleDislike}
          title="Not helpful"
          style={toolBtn(feedback === 'not_helpful')}
          onMouseEnter={e => { if (feedback !== 'not_helpful') { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--gold)'; } }}
          onMouseLeave={e => { if (feedback !== 'not_helpful') { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
        >
          {Icons.thumbDown(feedback === 'not_helpful')}
        </button>

        {/* Divider */}
        <div style={{ width: '1px', height: '16px', background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

        {/* Copy */}
        <button
          onClick={handleCopy}
          title={copied ? 'Copied' : 'Copy response'}
          style={toolBtn(copied)}
          onMouseEnter={e => { if (!copied) { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--gold)'; } }}
          onMouseLeave={e => { if (!copied) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
        >
          {Icons.copy(copied)}
          <span className="hidden sm:inline" style={{ fontSize: '0.68rem' }}>{copied ? 'Copied' : 'Copy'}</span>
        </button>

        {/* TTS */}
        <button
          onClick={handleTTS}
          title={isSpeaking ? 'Stop reading' : 'Read aloud'}
          style={toolBtn(isSpeaking)}
          onMouseEnter={e => { if (!isSpeaking) { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--gold)'; } }}
          onMouseLeave={e => { if (!isSpeaking) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
        >
          {Icons.speaker(isSpeaking)}
        </button>

        {/* TTS Settings */}
        <div style={{ position: 'relative' }} ref={ttsSettingsRef}>
          <button
            onClick={() => setShowTTSSettings(v => !v)}
            title="Voice settings"
            style={{ ...toolBtn(showTTSSettings), opacity: 0.6 }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = 'var(--border-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = showTTSSettings ? '1' : '0.6'; e.currentTarget.style.borderColor = showTTSSettings ? 'var(--border-strong)' : 'var(--border)'; }}
          >
            {Icons.gear()}
          </button>

          {showTTSSettings && (
            <div style={{
              position: 'absolute',
              bottom: '36px',
              left: 0,
              zIndex: 50,
              borderRadius: '12px',
              padding: '14px',
              background: 'var(--navy-card)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-float)',
              minWidth: '220px',
            }}>
              <p style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7, marginBottom: '10px', fontFamily: 'DM Sans, sans-serif' }}>
                Voice Settings
              </p>
              <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Voice</label>
              <select
                value={selectedVoice}
                onChange={(e) => { setSelectedVoice(e.target.value); localStorage.setItem('tts_voice', e.target.value); }}
                className="input-field text-xs mb-3 w-full"
                style={{ padding: '5px 8px', height: 'auto', fontSize: '0.72rem', marginBottom: '10px' }}
              >
                <option value="">Default</option>
                {voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
              </select>
              <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Speed — {speechRate.toFixed(1)}×
              </label>
              <input
                type="range" min="0.5" max="2" step="0.1"
                value={speechRate}
                onChange={(e) => { const val = parseFloat(e.target.value); setSpeechRate(val); localStorage.setItem('tts_rate', String(val)); }}
                style={{ width: '100%', accentColor: 'var(--gold)', marginBottom: '4px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                <span>0.5×</span><span>1×</span><span>2×</span>
              </div>
            </div>
          )}
        </div>

        {/* Regenerate */}
        <button
          onClick={onRegenerate}
          title="Regenerate response"
          style={toolBtn()}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--gold)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          {Icons.regenerate()}
          <span className="hidden sm:inline" style={{ fontSize: '0.68rem' }}>Retry</span>
        </button>

        {isError && (
          <button onClick={onRetry} style={{ ...toolBtn(), color: 'var(--gold)' }}>
            {Icons.regenerate()} Retry
          </button>
        )}
      </div>

      {/* Like note */}
      {showLikeNote && (
        <div style={{ marginTop: '8px', borderRadius: '10px', padding: '10px 12px', background: 'var(--gold-dim)', border: '1px solid var(--border)' }}>
          {noteSent ? (
            <p style={{ fontSize: '0.75rem', textAlign: 'center', color: 'var(--gold)' }}>Thank you for your feedback.</p>
          ) : (
            <>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '6px', fontFamily: 'Lora, serif', fontStyle: 'italic' }}>What was most helpful? (optional)</p>
              <textarea value={likeNote} onChange={(e) => setLikeNote(e.target.value)}
                placeholder="Tell us what worked well…"
                className="input-field resize-none text-xs mb-2" rows={2}
                style={{ fontSize: '0.78rem', fontFamily: 'Lora, Georgia, serif' }} />
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowLikeNote(false)} className="btn-secondary text-xs">Skip</button>
                <button onClick={() => handleSendNote(likeNote, 'helpful')} className="btn-primary text-xs">Send</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Dislike note */}
      {showDislikeNote && (
        <div style={{ marginTop: '8px', borderRadius: '10px', padding: '10px 12px', background: 'var(--navy-mid)', border: '1px solid var(--border)' }}>
          {noteSent ? (
            <p style={{ fontSize: '0.75rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Noted — we'll use this to improve.</p>
          ) : (
            <>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '6px', fontFamily: 'Lora, serif', fontStyle: 'italic' }}>What could be improved? (optional)</p>
              <textarea value={dislikeNote} onChange={(e) => setDislikeNote(e.target.value)}
                placeholder="Tell us what fell short…"
                className="input-field resize-none text-xs mb-2" rows={2}
                style={{ fontSize: '0.78rem', fontFamily: 'Lora, Georgia, serif' }} />
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowDislikeNote(false)} className="btn-secondary text-xs">Skip</button>
                <button onClick={() => handleSendNote(dislikeNote, 'not_helpful')} className="btn-primary text-xs">Send</button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
