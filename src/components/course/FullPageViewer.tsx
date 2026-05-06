'use client';
import { useState } from 'react';

type ViewerMode = 'past-questions' | 'aoc' | 'material-text' | 'note';

interface Props {
  mode: ViewerMode;
  data: any;
  relatedDocs?: any[];
  onClose: () => void;
  onSendMessage?: (text: string) => void;
  onSaveEdit?: (noteId: string, text: string) => Promise<void>;
  onDeleteNote?: (noteId: string) => Promise<void>;
}

export default function FullPageViewer({ mode, data, relatedDocs = [], onClose, onSendMessage, onSaveEdit, onDeleteNote }: Props) {
  const [variationsOpen, setVariationsOpen] = useState(false);
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState(data?.text ?? '');
  const [saving, setSaving] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);

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

  const collapsible = (label: string, open: boolean, toggle: () => void, count: number) => (
    <button onClick={toggle} style={{
      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600,
      background: 'var(--navy-card)', border: '1px solid var(--border)',
      color: 'var(--gold)', cursor: 'pointer', marginBottom: '6px',
    }}>
      <span>{label} ({count})</span>
      <span>{open ? '▲' : '▼'}</span>
    </button>
  );

  const actionBtn = (label: string, onClick: () => void, gold = false): React.CSSProperties => ({
    padding: '10px 16px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 700,
    background: gold ? 'var(--gold)' : 'transparent',
    color: gold ? 'var(--navy)' : 'var(--text-secondary)',
    border: gold ? 'none' : '1px solid var(--border)',
    cursor: 'pointer',
  });

  // ── PAST QUESTIONS ───────────────────────────────────────────────────────
  if (mode === 'past-questions') {
    const q = data;
    const years: number[] = q.years ?? (q.examYear ? [q.examYear] : []);
    const variations: string[] = q.variations ?? [];
    const related = relatedDocs ?? [];

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

          {variations.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              {collapsible('Variations', variationsOpen, () => setVariationsOpen(v => !v), variations.length)}
              {variationsOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px', marginBottom: '8px' }}>
                  {variations.map((v, i) => (
                    <button key={i} onClick={() => onSendMessage?.('Study this past question variation: "' + v + '"')}
                      style={{ textAlign: 'left', padding: '8px 12px', borderRadius: '8px', fontSize: '0.78rem', background: 'var(--navy-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer', lineHeight: 1.6 }}>
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {related.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              {collapsible('Related Questions', relatedOpen, () => setRelatedOpen(r => !r), related.length)}
              {relatedOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px', marginBottom: '8px' }}>
                  {related.map((r, i) => (
                    <button key={i} onClick={() => onSendMessage?.('Study this related past question: "' + r.questionText + '"')}
                      style={{ textAlign: 'left', padding: '8px 12px', borderRadius: '8px', fontSize: '0.78rem', background: 'var(--navy-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer', lineHeight: 1.6 }}>
                      {r.questionText}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => { onSendMessage?.('Study this past question: "' + q.questionText + '"'); onClose(); }}
            style={{ padding: '10px 16px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 700, background: 'var(--gold)', color: 'var(--navy)', border: 'none', cursor: 'pointer' }}>
            📖 Study this →
          </button>
        </div>
      </div>
    );
  }

  // ── AOC ──────────────────────────────────────────────────────────────────
  if (mode === 'aoc') {
    const item = data;
    const years: number[] = item.years ?? (item.year ? [item.year] : []);
    const variations: string[] = item.variations ?? [];
    const related = relatedDocs ?? [];
    const isTrending = item.reoccurrenceCount > 1;

    return (
      <div style={overlay}>
        <div style={header}>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
          <p style={{ flex: 1, fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '0.95rem' }}>Area of Concentration</p>
          {isTrending && <span style={{ fontSize: '0.72rem', color: '#f97316' }}>🔥 Trending</span>}
        </div>
        <div style={body}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {years.map(y => <span key={y} style={badge(String(y), true)}>{y}</span>)}
          </div>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.8, marginBottom: '20px', color: 'var(--text-primary)' }}>
            🎯 {item.topic}
          </p>

          {variations.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              {collapsible('Variations', variationsOpen, () => setVariationsOpen(v => !v), variations.length)}
              {variationsOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px', marginBottom: '8px' }}>
                  {variations.map((v, i) => (
                    <button key={i} onClick={() => { onSendMessage?.('Explain this AOC topic variation: "' + v + '"'); onClose(); }}
                      style={{ textAlign: 'left', padding: '8px 12px', borderRadius: '8px', fontSize: '0.78rem', background: 'var(--navy-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer', lineHeight: 1.6 }}>
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {related.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              {collapsible('Related Topics', relatedOpen, () => setRelatedOpen(r => !r), related.length)}
              {relatedOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px', marginBottom: '8px' }}>
                  {related.map((r, i) => (
                    <button key={i} onClick={() => { onSendMessage?.('Explain this AOC topic: "' + r.topic + '"'); onClose(); }}
                      style={{ textAlign: 'left', padding: '8px 12px', borderRadius: '8px', fontSize: '0.78rem', background: 'var(--navy-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer', lineHeight: 1.6 }}>
                      🎯 {r.topic}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => { onSendMessage?.('Explain this Area of Concentration: "' + item.topic + '"'); onClose(); }}
            style={{ padding: '10px 16px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 700, background: 'var(--gold)', color: 'var(--navy)', border: 'none', cursor: 'pointer' }}>
            💡 Explain this →
          </button>
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
            <p style={{ color: 'var(--text-muted)', marginTop: '16px', fontSize: '0.7rem' }}>[Showing first 80,000 characters — full document available in Library]</p>
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
