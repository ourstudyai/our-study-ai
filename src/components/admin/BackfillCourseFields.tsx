'use client';

import { useState, type CSSProperties } from 'react';
import InfoTip from '@/components/admin/InfoTip';
import { authFetch } from '@/lib/auth/authFetch';

type Preview = { total: number; courseMissing: number; samples: { name: string; fills: string[] }[] };

// Preview first, then apply: copies department / year / semester from a file's course onto the file when they are empty.
export default function BackfillCourseFields({ firebaseUser }: { firebaseUser: any }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [err, setErr] = useState('');

  async function call(apply: boolean) {
    setBusy(true); setErr('');
    try {
      await firebaseUser?.getIdToken(true);
      const r = await authFetch('/api/admin/backfill-course-fields', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apply }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(`Failed (HTTP ${r.status}): ${(d as any).error || 'no details'}`); return; }
      if (apply) { setDone((d as any).applied ?? 0); setPreview(null); } else { setPreview(d as Preview); setDone(null); }
    } catch (e: any) { setErr('Error: ' + (e?.message ?? e)); }
    finally { setBusy(false); }
  }

  const btn = (primary: boolean): CSSProperties => ({
    padding: '8px 14px', borderRadius: 9, border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? 'var(--gold)' : 'transparent', color: primary ? '#0a1020' : 'var(--text-secondary)',
    fontWeight: 700, fontSize: '0.76rem', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
  });

  return (
    <div style={{ marginTop: 14 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', padding: 0 }}>
        🏷️ Fill missing department / year / semester {open ? '▴' : '▾'}
      </button>
      {open && (
        <div style={{ marginTop: 10, fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <InfoTip
            todo="Tap Preview to see how many sorted files are missing these fields. If the number looks right, tap Apply."
            means="Files that were sorted into a course but never got the course's department, year and semester are why some show under 'Department not specified'. This copies them across. It never overwrites a value that is already set, and it never deletes anything." />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => call(false)} disabled={busy} style={btn(false)}>{busy ? 'Working…' : 'Preview'}</button>
            {preview && preview.total > 0 && <button onClick={() => call(true)} disabled={busy} style={btn(true)}>Apply to {preview.total} file{preview.total !== 1 ? 's' : ''}</button>}
          </div>
          {err && <p style={{ marginTop: 10, color: '#ef4444', fontWeight: 700 }}>{err}</p>}
          {preview && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontWeight: 700, color: preview.total ? 'var(--gold)' : '#22c55e' }}>
                {preview.total ? `${preview.total} file${preview.total !== 1 ? 's' : ''} need filling.` : 'Nothing to fill. All sorted files already have them.'}
              </p>
              {preview.samples.map((s, i) => (
                <p key={i} style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name} · fills {s.fills.join(', ')}</p>
              ))}
              {preview.total > preview.samples.length && <p style={{ color: 'var(--text-muted)' }}>…and {preview.total - preview.samples.length} more.</p>}
              {preview.courseMissing > 0 && <p style={{ color: '#eab308' }}>⚠ {preview.courseMissing} file{preview.courseMissing !== 1 ? 's' : ''} point to a course that no longer exists (skipped).</p>}
            </div>
          )}
          {done !== null && <p style={{ marginTop: 10, color: '#22c55e', fontWeight: 700 }}>Done. {done} file{done !== 1 ? 's' : ''} filled.</p>}
        </div>
      )}
    </div>
  );
}
