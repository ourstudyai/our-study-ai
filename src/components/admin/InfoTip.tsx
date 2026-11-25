'use client';

import { useState } from 'react';

// Small "i" that opens a plain-language note: what to do here, and what it means.
export default function InfoTip({ todo, means }: { todo: string; means: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: '4px 0 12px' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--gold)', fontSize: '0.72rem', fontWeight: 700 }}>
        <span style={{ width: 19, height: 19, borderRadius: '50%', border: '1px solid var(--gold)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontFamily: 'Playfair Display, serif', fontStyle: 'italic', background: open ? 'rgba(196,160,80,0.2)' : 'transparent' }}>i</span>
        {open ? 'Hide help' : 'What do I do here?'}
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(196,160,80,0.3)', background: 'rgba(196,160,80,0.06)', fontSize: '0.76rem', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
          <p style={{ margin: 0 }}><b style={{ color: 'var(--gold)' }}>What to do:</b> {todo}</p>
          <p style={{ margin: '6px 0 0' }}><b style={{ color: 'var(--gold)' }}>What it means:</b> {means}</p>
        </div>
      )}
    </div>
  );
}
