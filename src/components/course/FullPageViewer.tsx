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

// ── Inline renderer: **bold**, *italic*, ***both*** ──────────────────────────
function Inline({ text }: { text: string }) {
  const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  const parts: React.ReactNode[] = [];
  let last = 0; let match; let idx = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) parts.push(<strong key={idx}><em>{match[2]}</em></strong>);
    else if (match[3]) parts.push(<strong key={idx}>{match[3]}</strong>);
    else if (match[4]) parts.push(<em key={idx}>{match[4]}</em>);
    last = match.index + match[0].length; idx++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// ── Full markdown renderer ───────────────────────────────────────────────────
function MarkdownBody({ text }: { text: string }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  const font = "'Noto Serif', 'Noto Serif Hebrew', 'Noto Serif Thai', Georgia, serif";

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i++; continue; }

    if (line.startsWith('# ')) {
      nodes.push(<h1 key={i} style={{ fontFamily: font, fontSize: '1.15rem', fontWeight: 700, color: 'var(--gold)', marginTop: '24px', marginBottom: '8px', lineHeight: 1.4, borderBottom: '1px solid rgba(196,160,80,0.25)', paddingBottom: '6px' }}><Inline text={line.slice(2)} /></h1>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      nodes.push(<h2 key={i} style={{ fontFamily: font, fontSize: '1rem', fontWeight: 700, color: 'var(--gold)', marginTop: '20px', marginBottom: '6px', lineHeight: 1.4, opacity: 0.9 }}><Inline text={line.slice(3)} /></h2>);
      i++; continue;
    }
    if (line.startsWith('### ')) {
      nodes.push(<h3 key={i} style={{ fontFamily: font, fontSize: '0.93rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '16px', marginBottom: '4px', lineHeight: 1.4 }}><Inline text={line.slice(4)} /></h3>);
      i++; continue;
    }
    if (line.startsWith('#### ')) {
      nodes.push(<h4 key={i} style={{ fontFamily: font, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '12px', marginBottom: '4px', fontStyle: 'italic' }}><Inline text={line.slice(5)} /></h4>);
      i++; continue;
    }

    if (/^[-*_]{3,}$/.test(line.trim())) {
      nodes.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid rgba(196,160,80,0.2)', margin: '16px 0' }} />);
      i++; continue;
    }

    if (line.trimStart().startsWith('- ') || line.trimStart().startsWith('* ')) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && (lines[i].trimStart().startsWith('- ') || lines[i].trimStart().startsWith('* '))) {
        const indent = lines[i].search(/\S/);
        const content = lines[i].trimStart().slice(2);
        items.push(<li key={i} style={{ paddingLeft: indent > 0 ? '12px' : '0', marginBottom: '3px' }}><Inline text={content} /></li>);
        i++;
      }
      nodes.push(<ul key={`ul${i}`} style={{ paddingLeft: '20px', margin: '6px 0 10px', listStyleType: 'disc', fontSize: '0.85rem', lineHeight: 1.85, color: 'var(--text-primary)', fontFamily: font }}>{items}</ul>);
      continue;
    }

    if (/^\d+\.\s/.test(line.trimStart())) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trimStart())) {
        const content = lines[i].trimStart().replace(/^\d+\.\s/, '');
        items.push(<li key={i} style={{ marginBottom: '3px' }}><Inline text={content} /></li>);
        i++;
      }
      nodes.push(<ol key={`ol${i}`} style={{ paddingLeft: '24px', margin: '6px 0 10px', fontSize: '0.85rem', lineHeight: 1.85, color: 'var(--text-primary)', fontFamily: font }}>{items}</ol>);
      continue;
    }

    // paragraph — collect consecutive plain lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].trimStart().startsWith('- ') &&
      !lines[i].trimStart().startsWith('* ') &&
      !/^\d+\.\s/.test(lines[i].trimStart()) &&
      !/^[-*_]{3,}$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      nodes.push(
        <p key={`p${i}`} style={{ fontFamily: font, fontSize: '0.85rem', lineHeight: 1.9, color: 'var(--text-primary)', marginBottom: '10px' }}>
          <Inline text={paraLines.join(' ')} />
        </p>
      );
    }
  }

  return <>{nodes}</>;
}

// ── Component ────────────────────────────────────────────────────────────────
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
  const body: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: '16px 20px' };

  const badge = (gold = false): React.CSSProperties => ({
    fontSize: '0.65rem', padding: '2px 8px', borderRadius: '20px', fontWeight: 700,
    background: gold ? 'rgba(196,160,80,0.15)' : 'rgba(255,255,255,0.07)',
    color: gold ? 'var(--gold)' : 'var(--text-muted)',
    border: '1px solid ' + (gold ? 'rgba(196,160,80,0.3)' : 'var(--border)'),
    display: 'inline-block',
  });

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key); setTimeout(() => setCopied(null), 1500);
    });
  };

  const CopyBlock = ({ text, label, id }: { text: string; label: string; id: string }) => (
    <div onClick={() => copyText(text, id)} style={{ padding: '10px 12px', borderRadius: '8px', fontSize: '0.78rem', background: copied === id ? 'rgba(196,160,80,0.1)' : 'var(--surface)', border: '1px solid ' + (copied === id ? 'var(--gold)' : 'var(--border)'), color: 'var(--text-primary)', cursor: 'pointer', lineHeight: 1.6, position: 'relative', userSelect: 'text' }}>
      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginRight: '6px' }}>{label}</span>
      {text}
      <span style={{ position: 'absolute', top: '6px', right: '8px', fontSize: '0.62rem', color: copied === id ? 'var(--gold)' : 'var(--text-muted)' }}>{copied === id ? '✓ Copied' : '⎘'}</span>
    </div>
  );

  // ── PAST QUESTIONS ────────────────────────────────────────────────────────
  if (mode === 'past-questions') {
    const q = data;
    const years: number[] = (q.years ?? (q.examYear ? [q.examYear] : [])).filter((y: number) => y > 1900 && isFinite(y));
    const variationTexts: string[] = (q.variations ?? []).map((v: any) => typeof v === 'string' ? v : v?.text).filter((v: any) => v && v.length > 5 && v !== q.questionText);
    const related = (relatedDocs ?? []).filter((r: any) => r?.questionText && r.questionText.length < 300 && !/bigard|seminary|time allow|answer \w+ question/i.test(r.questionText));
    return (
      <div style={overlay}>
        <div style={header}>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
          <p style={{ flex: 1, fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '0.95rem' }}>Past Question</p>
        </div>
        <div style={body}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {years.map(y => <span key={y} style={badge(true)}>{y}</span>)}
            {q.reoccurrenceCount > 1 && <span style={badge(true)}>×{q.reoccurrenceCount}</span>}
          </div>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.8, marginBottom: '20px', color: 'var(--text-primary)' }}>{q.questionText}</p>
          <button onClick={() => { onSendMessage?.('Explain: ' + q.questionText, 'plain_explainer'); onClose(); }} style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700, background: 'var(--gold)', color: 'var(--navy)', border: 'none', cursor: 'pointer', marginBottom: '24px' }}>📖 Study this →</button>
          {(variationTexts.length > 0 || related.length > 0) && (
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Related & Variations — tap to copy</p>
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

  // ── AOC ───────────────────────────────────────────────────────────────────
  if (mode === 'aoc') {
    const item = data;
    const years: number[] = (item.years ?? (item.year ? [item.year] : [])).filter((y: number) => y > 1900 && isFinite(y));
    const variationTexts: string[] = (item.variations ?? []).map((v: any) => typeof v === 'string' ? v : v?.text).filter((v: any) => v && v.length > 5 && v !== item.topic);
    const related = (relatedDocs ?? []).filter((r: any) => r?.topic && r.topic.length < 300);
    return (
      <div style={overlay}>
        <div style={header}>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
          <p style={{ flex: 1, fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '0.95rem' }}>Area of Concentration</p>
        </div>
        <div style={body}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {years.map(y => <span key={y} style={badge(true)}>{y}</span>)}
            {item.reoccurrenceCount > 1 && <span style={badge(true)}>×{item.reoccurrenceCount}</span>}
          </div>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.8, marginBottom: '20px', color: 'var(--text-primary)' }}>🎯 {item.topic}</p>
          <button onClick={() => { onSendMessage?.('Explain: ' + item.topic, 'plain_explainer'); onClose(); }} style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700, background: 'var(--gold)', color: 'var(--navy)', border: 'none', cursor: 'pointer', marginBottom: '24px' }}>📖 Study this →</button>
          {(variationTexts.length > 0 || related.length > 0) && (
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Related & Variations — tap to copy</p>
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

  // ── MATERIAL TEXT ─────────────────────────────────────────────────────────
  if (mode === 'material-text') {
    return (
      <div style={overlay}>
        <div style={header}>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
          <p style={{ flex: 1, fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data?.fileName ?? 'Material'}</p>
        </div>
        <div style={{ ...body, maxWidth: '720px', margin: '0 auto', width: '100%' }}>
          {data?.extractedText
            ? <MarkdownBody text={data.extractedText} />
            : <p style={{ color: 'var(--text-muted)' }}>No extracted text available.</p>}
        </div>
      </div>
    );
  }

  // ── NOTE ──────────────────────────────────────────────────────────────────
  if (mode === 'note') {
    const note = data;
    const charCount = editText.length;
    const charColor = charCount >= 950 ? '#ef4444' : charCount >= 800 ? '#f59e0b' : 'var(--text-muted)';
    const handleSave = async () => {
      if (!editText.trim() || !onSaveEdit) return;
      setSaving(true);
      try { await onSaveEdit(note.id, editText.trim()); setEditMode(false); } catch { } finally { setSaving(false); }
    };
    const handleDelete = async () => {
      if (!onDeleteNote) return;
      try { await onDeleteNote(note.id); onClose(); } catch { }
    };
    return (
      <div style={overlay}>
        <div style={header}>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
          <p style={{ flex: 1, fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--gold)', fontSize: '0.95rem' }}>Note</p>
          {!editMode && (
            <button onClick={() => { setEditText(note.text); setEditMode(true); }} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '7px', padding: '4px 10px', color: 'var(--gold)', fontSize: '0.72rem', cursor: 'pointer' }}>✏️ Edit</button>
          )}
        </div>
        <div style={body}>
          {editMode ? (
            <>
              <textarea value={editText} onChange={e => setEditText(e.target.value)} maxLength={1000} rows={6}
                style={{ width: '100%', borderRadius: '10px', padding: '12px', background: 'var(--navy-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '0.85rem', lineHeight: 1.7, resize: 'none', boxSizing: 'border-box', outline: 'none' }} autoFocus />
              <p style={{ fontSize: '0.68rem', color: charColor, textAlign: 'right', marginTop: '4px', marginBottom: '12px' }}>{charCount}/1000</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleSave} disabled={saving || !editText.trim()} style={{ flex: 2, padding: '10px', borderRadius: '10px', background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
                <button onClick={() => setEditMode(false)} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.88rem', lineHeight: 1.8, color: 'var(--text-primary)', marginBottom: '24px', whiteSpace: 'pre-wrap' }}>{note.text}</p>
              <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '20px' }}>{note.createdAt ? new Date(note.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
              {!delConfirm ? (
                <button onClick={() => setDelConfirm(true)} style={{ padding: '8px 16px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '0.78rem', cursor: 'pointer' }}>🗑️ Delete note</button>
              ) : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flex: 1 }}>Delete this note?</p>
                  <button onClick={handleDelete} style={{ padding: '7px 14px', borderRadius: '8px', background: '#ef4444', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>Confirm</button>
                  <button onClick={() => setDelConfirm(false)} style={{ padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}>Cancel</button>
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
