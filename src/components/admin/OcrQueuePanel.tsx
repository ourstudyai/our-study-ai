'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMaterialsByStatus, Material } from '@/lib/firestore/materials';

interface Props { firebaseUser: any; }

const STUCK_MS = 10 * 60 * 1000;
const SEND_CHUNK = 100;

function formatBytes(b?: number) {
  if (!b) return '';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

function isStuck(m: Material) {
  const t = Date.parse((m as any).ocrQueuedAt ?? '');
  return !isNaN(t) && Date.now() - t > STUCK_MS;
}

// Every word typed must appear somewhere in the file's searchable text.
function matches(m: Material, q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [m.fileName, m.confirmedCourseName, m.uploaderEmail, m.category]
    .filter(Boolean).join(' ').toLowerCase().replace(/_/g, ' ');
  return words.every(w => hay.includes(w));
}

export default function OcrQueuePanel({ firebaseUser }: Props) {
  const [sorted, setSorted] = useState<Material[]>([]);
  const [processing, setProcessing] = useState<Material[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([getMaterialsByStatus('sorted'), getMaterialsByStatus('processing')]);
    setSorted(s); setProcessing(p); setLoaded(true);
  }, []);

  useEffect(() => { load().catch(() => setLoaded(true)); }, [load]);

  // While anything is processing, refresh so finished files drop off the list.
  useEffect(() => {
    if (processing.length === 0) return;
    const t = setInterval(() => { load().catch(() => {}); }, 15000);
    return () => clearInterval(t);
  }, [processing.length, load]);

  const shown = useMemo(() => sorted.filter(m => matches(m, q)), [sorted, q]);
  const shownProcessing = useMemo(() => processing.filter(m => matches(m, q)), [processing, q]);

  const groups = useMemo(() => {
    const map = new Map<string, Material[]>();
    for (const m of shown) {
      const k = m.confirmedCourseName || 'No course';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);

  // Only files visible right now can be selected for sending.
  const selIds = shown.filter(m => sel.has(m.id)).map(m => m.id);
  const allSelected = shown.length > 0 && selIds.length === shown.length;

  const toggle = (id: string) => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (items: Material[]) => setSel(p => {
    const n = new Set(p);
    const all = items.every(m => n.has(m.id));
    items.forEach(m => (all ? n.delete(m.id) : n.add(m.id)));
    return n;
  });
  const toggleAll = () => setSel(p => {
    const n = new Set(p);
    shown.forEach(m => (allSelected ? n.delete(m.id) : n.add(m.id)));
    return n;
  });

  async function send(ids: string[], force = false) {
    setBusy(true); setNote('');
    let queued = 0, skipped = 0;
    try {
      await firebaseUser?.getIdToken(true);
      for (let i = 0; i < ids.length; i += SEND_CHUNK) {
        const res = await fetch('/api/admin/send-to-ocr', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ materialIds: ids.slice(i, i + SEND_CHUNK), force }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { alert('Failed: ' + ((d as any).error || res.status)); break; }
        queued += d.queued ?? 0; skipped += (d.skipped ?? []).length;
      }
      setSel(new Set());
      setNote(`${queued} queued for OCR${skipped ? `, ${skipped} skipped` : ''}. Results appear in the Pending tab for review.`);
      await load();
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? e));
    } finally { setBusy(false); setConfirm(false); }
  }

  if (!loaded) return <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading…</p>;

  const searching = q.trim().length > 0;

  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search file name, course, uploader, type…"
        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: 10 }} />
      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
        {searching
          ? `${shown.length} of ${sorted.length} files match.`
          : 'Sorted files waiting for OCR. Tick the ones to send. Files are processed a few at a time, so sending many is safe.'}
      </p>

      {note && <p style={{ fontSize: '0.78rem', color: 'var(--gold)', marginBottom: 12 }}>{note}</p>}

      {shown.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Select all ({shown.length})
          </label>
          <span style={{ flex: 1 }} />
          <button onClick={() => setConfirm(true)} disabled={busy || selIds.length === 0}
            style={{ padding: '9px 16px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: '0.8rem',
              background: selIds.length ? 'var(--gold)' : 'var(--border)', color: selIds.length ? '#0a1020' : 'var(--text-muted)', cursor: selIds.length ? 'pointer' : 'not-allowed' }}>
            {busy ? 'Sending…' : `Send ${selIds.length} to OCR`}
          </button>
        </div>
      )}

      {groups.map(([name, items]) => (
        <div key={name} style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 10, padding: '10px 12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={items.every(m => sel.has(m.id))} onChange={() => toggleGroup(items)} />
            <span style={{ flex: 1, fontFamily: 'Playfair Display, serif', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{name}</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{items.length}</span>
          </label>
          {items.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
              <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} />
              <span style={{ flex: 1, minWidth: 0, fontSize: '0.76rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.fileName} <span style={{ color: 'var(--text-muted)' }}>{formatBytes(m.fileSize)}</span>
              </span>
              <a href={m.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: 'var(--gold)', textDecoration: 'none' }}>Open</a>
            </div>
          ))}
        </div>
      ))}

      {sorted.length === 0 && processing.length === 0 && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nothing in the queue. Sort files in the Uploads tab first.</p>
      )}
      {searching && shown.length === 0 && shownProcessing.length === 0 && (sorted.length > 0 || processing.length > 0) && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No files match "{q}".</p>
      )}

      {shownProcessing.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              In progress ({shownProcessing.length})
            </p>
            {shownProcessing.some(isStuck) && (
              <button onClick={() => send(shownProcessing.filter(isStuck).map(m => m.id), true)} disabled={busy}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(234,179,8,0.4)', background: 'transparent', color: '#eab308', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                Re-send stuck ({shownProcessing.filter(isStuck).length})
              </button>
            )}
          </div>
          {shownProcessing.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
              <span>{isStuck(m) ? '⚠' : '⏳'}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fileName}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>{m.confirmedCourseName}</span>
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(5,10,24,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px 20px', maxWidth: 340, width: '100%' }}>
            <p style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 8 }}>Send {selIds.length} file{selIds.length !== 1 ? 's' : ''} to OCR?</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5, marginBottom: 18 }}>
              They are processed a few at a time and land in the Pending tab for review.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirm(false)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => send(selIds)} disabled={busy} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: 'var(--gold)', color: '#0a1020', fontWeight: 700, cursor: 'pointer' }}>Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
