'use client';
import { useState } from 'react';

type ViewerMode = 'past-questions' | 'aoc' | 'material-text' | 'note';

interface Props {
  mode: ViewerMode;
  data: any;
  relatedDocs?: any[];
  onClose: () => void;
  onSendMessage?: (text: string, mode?: string) => void;
  onSaveEdit?: (noteId: string, text: string) => Promise<void>;
  onDeleteNote?: (noteId: string) => Promise<void>;
}

export default function FullPageViewer({ mode, data, relatedDocs = [], onClose, onSendMessage, onSaveEdit, onDeleteNote }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState(data?.text ?? '');
  const [saving, setSaving] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'var(--navy)', color: 'var(--text-primary)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };

  const header: React.CSSProperties = {
    flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px 16px', borderBottom: '1px solid var(--border)',
    background: 'var(--navy-card)',
  };

  const body: React.CSSProperties = {
    flex: 1, overflowY: 'auto', padding: '16px',
  };

  const badge = (text: string, gold = false): React.CSSProperties => ({
    fontSize: '0.65rem', padding: '2px 8px', borderRadius: '20px', fontWeight: 700,
    background: gold ? 'rgba(196,160,80,0.15)' : 'rgba(255,255,255,0.07)',
    color: gold ? 'var(--gold)' : 'var(--text-muted)',
    border: '1px solid ' + (gold ? 'rgba(196,160,80,0.3)' : 'var(--border)'),
    display: 'inline-block',
  });

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const CopyBlock = ({ text, label, id }: { text: string; label: string; id: string }) => (
    <div
      onClick={() => copyText(text, id)}
      style={{
        padding: '10px 12px', borderRadius: '8px', fontSize: '0.78rem',
        background: copied === id ? 'rgba(196,160,80,0.1)' : 'var(--surface)',
        border: '1px solid ' + (copied === id ? 'var(--gold)' : 'var(--border)'),
        color: 'var(--text-primary)', cursor: 'pointer', lineHeight: 1.6,
        position: 'relative', userSelect: 'text',
      }}
    >
      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginRight: '6px' }}>{label}</span>
      {text}
      <span style={{ position: 'absolute', top: '6px', right: '8px', fontSize: '0.62rem', color: copied === id ? 'var(--gold)' : 'var(--text-muted)' }}>
        {copied === id ? '✓ Copied' : '⎘'}
      </span>
    </div>
  );

  // ── PAST QUESTIONS ───────────────────────────────────────────────────────
  if (mode === 'past-questions') {
    const q = data;
    const years: number[] = (q.years ?? (q.examYear ? [q.examYear] : [])).filter((y: number) => y > 1900 && isFinite(y));
    const variationTexts: string[] = (q.variations ?? [])
      .map((v: any) => typeof v === 'string' ? v : v?.text)
      .filter((v: any) => v && v.length > 5 && v !== q.questionText);
    const related = (relatedDocs ?? []).filter((r: any) => r?.questionText && r.questionText.length < 300 && !/bigard|seminary|time allow|answer \w+ question/i.test(r.questionText));
    const hasExtra = variationTexts.length > 0 || related.length > 0;

    return (
      <div style={overlay}>
        <div style={header}>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
          <p style={{ flex: 1, fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '0.95rem' }}>Past Question</p>
        </div>
        <div style={body}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {years.map(y => <span key={y} style={badge(String(y), true)}>{y}</span>)}
            {q.reoccurrenceCount > 1 && (
              <span style={badge('×' + q.reoccurrenceCount, true)}>×{q.reoccurrenceCount}</span>
            )}
          </div>

          <p style={{ fontSize: '0.9rem', lineHeight: 1.8, marginBottom: '20px', color: 'var(--text-primary)' }}>
            {q.questionText}
          </p>

          <button
            onClick={() => { onSendMessage?.('Explain: ' + q.questionText, 'plain_explainer'); onClose(); }}
            style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700, background: 'var(--gold)', color: 'var(--navy)', border: 'none', cursor: 'pointer', marginBottom: '24px' }}
          >
            📖 Study this →
          </button>

          {hasExtra && (
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                Related & Variations — tap to copy
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {variationTexts.map((v, i) => <CopyBlock key={'v'+i} text={v} label="Variation" id={'v'+i} />)}
                {related.map((r: any, i: number) => <CopyBlock key={'r'+i} text={r.questionText} label="Related" id={'r'+i} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── AOC ──────────────────────────────────────────────────────────────────
  if (mode === 'aoc') {
    const item = data;
    const years: number[] = (item.years ?? (item.year ? [item.year] : [])).filter((y: number) => y > 1900 && isFinite(y));
    const variationTexts: string[] = (item.variations ?? [])
      .map((v: any) => typeof v === 'string' ? v : v?.text)
      .filter((v: any) => v && v.length > 5 && v !== item.topic);
    const related = (relatedDocs ?? []).filter((r: any) => r?.topic && r.topic.length < 300);
    const hasExtra = variationTexts.length > 0 || related.length > 0;

    return (
      <div style={overlay}>
        <div style={header}>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
          <p style={{ flex: 1, fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '0.95rem' }}>Area of Concentration</p>
        </div>
        <div style={body}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {years.map(y => <span key={y} style={badge(String(y), true)}>{y}</span>)}
            {item.reoccurrenceCount > 1 && <span style={badge('×' + item.reoccurrenceCount, true)}>×{item.reoccurrenceCount}</span>}
          </div>

          <p style={{ fontSize: '0.9rem', lineHeight: 1.8, marginBottom: '20px', color: 'var(--text-primary)' }}>
            🎯 {item.topic}
          </p>

          <button
            onClick={() => { onSendMessage?.('Explain: ' + item.topic, 'plain_explainer'); onClose(); }}
            style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700, background: 'var(--gold)', color: 'var(--navy)', border: 'none', cursor: 'pointer', marginBottom: '24px' }}
          >
            📖 Study this →
          </button>

          {hasExtra && (
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                Related & Variations — tap to copy
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {variationTexts.map((v, i) => <CopyBlock key={'v'+i} text={v} label="Variation" id={'av'+i} />)}
                {related.map((r: any, i: number) => <CopyBlock key={'r'+i} text={r.topic} label="Related" id={'ar'+i} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── MATERIAL TEXT ────────────────────────────────────────────────────────
  if (mode === 'material-text') {
    return (
      <div style={overlay}>
        <div style={header}>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
          <p style={{ flex: 1, fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data?.fileName ?? 'Material'}</p>
        </div>
        <div style={{ ...body, fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.8, whiteSpace: 'pre-wrap', userSelect: 'text', WebkitUserSelect: 'text' } as any}>
          {data?.extractedText
            ? data.extractedText.substring(0, 80000)
            : <p style={{ color: 'var(--text-muted)' }}>No extracted text available.</p>}
          {data?.extractedText?.length > 80000 && (
            <p style={{ color: 'var(--text-muted)', marginTop: '16px', fontSize: '0.7rem' }}>[Showing first 80,000 characters]</p>
          )}
        </div>
      </div>
    );
  }

  // ── NOTE ─────────────────────────────────────────────────────────────────
  if (mode === 'note') {
    const note = data;
    const charCount = editText.length;
    const charColor = charCount >= 950 ? '#ef4444' : charCount >= 800 ? '#f59e0b' : 'var(--text-muted)';

    const handleSave = async () => {
      if (!editText.trim() || !onSaveEdit) return;
      setSaving(true);
      try { await onSaveEdit(note.id, editText.trim()); setEditMode(false); }
      catch { } finally { setSaving(false); }
    };

    const handleDelete = async () => {
      if (!onDeleteNote) return;
      try { await onDeleteNote(note.id); onClose(); }
      catch { }
    };

    return (
      <div style={overlay}>
        <div style={header}>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
          <p style={{ flex: 1, fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '0.95rem' }}>Note</p>
          {!editMode && (
            <button onClick={() => { setEditText(note.text); setEditMode(true); }}
              style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '7px', padding: '4px 10px', color: 'var(--gold)', fontSize: '0.72rem', cursor: 'pointer' }}>
              ✏️ Edit
            </button>
          )}
        </div>
        <div style={body}>
          {editMode ? (
            <>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                maxLength={1000}
                rows={6}
                style={{
                  width: '100%', borderRadius: '10px', padding: '12px',
                  background: 'var(--navy-card)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', fontSize: '0.85rem', lineHeight: 1.7,
                  resize: 'none', boxSizing: 'border-box', outline: 'none',
                }}
                autoFocus
              />
              <p style={{ fontSize: '0.68rem', color: charColor, textAlign: 'right', marginTop: '4px', marginBottom: '12px' }}>
                {charCount}/1000
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleSave} disabled={saving || !editText.trim()}
                  style={{ flex: 2, padding: '10px', borderRadius: '10px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setEditMode(false)}
                  style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.88rem', lineHeight: 1.8, color: 'var(--text-primary)', marginBottom: '24px', whiteSpace: 'pre-wrap' }}>{note.text}</p>
              <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                {note.createdAt ? new Date(note.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
              </p>
              {!delConfirm ? (
                <button onClick={() => setDelConfirm(true)}
                  style={{ padding: '8px 16px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '0.78rem', cursor: 'pointer' }}>
                  🗑️ Delete note
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flex: 1 }}>Delete this note?</p>
                  <button onClick={handleDelete}
                    style={{ padding: '7px 14px', borderRadius: '8px', background: '#ef4444', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                    Confirm
                  </button>
                  <button onClick={() => setDelConfirm(false)}
                    style={{ padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}
