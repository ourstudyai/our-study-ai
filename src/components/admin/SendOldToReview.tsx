// src/components/admin/SendOldToReview.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth/authFetch';

// One-time backlog button. Shows only while old files are still waiting; disappears once they are all sent.
export default function SendOldToReview({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState<{ unsorted: number; sorted: number; noFile: number } | null>(null);
  const [state, setState] = useState<'idle' | 'confirm' | 'running'>('idle');
  const [msg, setMsg] = useState('');

  const count = useCallback(async () => {
    try {
      const r = await authFetch('/api/admin/send-old-to-review');
      if (r.ok) setN(await r.json());
    } catch { /* the box stays hidden */ }
  }, []);
  useEffect(() => { count(); }, [count]);

  async function run() {
    setState('running');
    let sent = 0;
    let guard = 0;
    try {
      while (guard++ < 20) {
        const r = await authFetch('/api/admin/send-old-to-review', { method: 'POST' });
        if (!r.ok) { setMsg('Stopped after ' + sent + ' files. Try again.'); break; }
        const d = await r.json();
        sent += Number(d.queued) || 0;
        setMsg('Sent ' + sent + ' files…' + (d.remaining ? ' ' + d.remaining + ' to go.' : ''));
        if (!d.queued || !d.remaining) break;
      }
      if (guard < 20) setMsg('Sent ' + sent + ' files. They appear in Review as they finish.');
    } catch { setMsg('Stopped after ' + sent + ' files. Try again.'); }
    setState('idle');
    await count();
    onDone();
  }

  const total = n ? n.unsorted + n.sorted : 0;
  if (!n || (total === 0 && !msg)) return null;
  const btn = (primary: boolean): React.CSSProperties => ({
    padding: '8px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', minHeight: 36,
    border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--gold)' : 'transparent',
    color: primary ? 'var(--navy)' : 'var(--text-secondary)',
  });

  return (
    <div style={{ background: 'var(--navy-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
      <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '0.9rem', fontWeight: 700, color: 'var(--gold)', marginBottom: 4 }}>
        Old files waiting{total ? ' (' + total + ')' : ''}
      </p>
      {total > 0 && (
        <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
          {n.unsorted} unsorted · {n.sorted} sorted but never read. One tap sends them through OCR, AI reading and cleaning, and they arrive in Review.
          {n.noFile > 0 ? ' ' + n.noFile + ' have no file attached and are skipped.' : ''}
        </p>
      )}
      {msg && <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 8 }}>{msg}</p>}
      {total > 0 && state === 'idle' && <button onClick={() => setState('confirm')} style={btn(true)}>Send all to review</button>}
      {state === 'confirm' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Send {total} files? This uses Mistral credit and takes a while.</span>
          <button onClick={run} style={btn(true)}>Yes, send</button>
          <button onClick={() => setState('idle')} style={btn(false)}>Cancel</button>
        </div>
      )}
      {state === 'running' && <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Working… keep this page open.</p>}
    </div>
  );
}
