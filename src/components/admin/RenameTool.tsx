'use client';

import { authFetch } from '@/lib/auth/authFetch';

import { useState } from 'react';

interface Result { applied: boolean; total: number; renamed: number; restyled?: number; keptCurated: number; categoryFixed: number; examples: { from: string; to: string }[]; }

// One-off tool: give already-approved materials the same naming as new ones.
export default function RenameTool({ firebaseUser }: { firebaseUser: any }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restyle, setRestyle] = useState(true);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState('');

  async function run(apply: boolean) {
    if (apply && !window.confirm('Rename approved materials now? Curated names are kept; old names are saved for rollback.')) return;
    setBusy(true); setErr('');
    try {
      await firebaseUser?.getIdToken(true);
      const r = await authFetch('/api/admin/rename-materials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ apply, restyle }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(`Failed (HTTP ${r.status}): ${(d as any).error || 'no details'}`); return; }
      setRes(d as Result);
    } catch (e: any) { setErr('Error: ' + (e?.message ?? e)); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 28, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', padding: 0 }}>
        🛠 Rename old materials {open ? '▴' : '▾'}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>
            Gives approved materials with generic names (file names or "Course — type") the same format as new ones, e.g. "PHL 201 · Handout 3", oldest first. Names you wrote yourself are left alone. Preview first.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={restyle} onChange={e => setRestyle(e.target.checked)} />
            Also switch names that start with a course code to the course name
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={() => run(false)} disabled={busy}
              style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.76rem', cursor: 'pointer' }}>
              {busy ? 'Working…' : 'Preview'}
            </button>
            {res && !res.applied && (res.renamed + res.categoryFixed + (res.restyled ?? 0)) > 0 && (
              <button onClick={() => run(true)} disabled={busy}
                style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--gold)', color: '#0a1020', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>
                Apply
              </button>
            )}
          </div>
          {err && <p style={{ fontSize: '0.74rem', color: '#ef4444', fontWeight: 700, marginBottom: 8 }}>{err}</p>}
          {res && (
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <p style={{ color: res.applied ? '#22c55e' : 'var(--gold)', fontWeight: 700 }}>{res.applied ? 'Applied.' : 'Preview only. Nothing changed yet.'}</p>
              <p>{res.total} approved · {res.renamed} renamed · {res.restyled ? `${res.restyled} switched to course names · ` : ''}{res.keptCurated} kept as written · {res.categoryFixed} category fixed (notes → handout)</p>
              {res.examples.map((e, i) => (
                <p key={i} style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.from} → <span style={{ color: 'var(--text-primary)' }}>{e.to}</span></p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
