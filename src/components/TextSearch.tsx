'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

const MAX_MATCHES = 2000;

function getScroller(): HTMLElement | null {
  return document.querySelector('[data-tts-scroll]') as HTMLElement | null;
}

// Find every match across text-node boundaries (so "bold **word**" still matches)
function findRanges(root: HTMLElement, q: string): Range[] {
  const nodes: Text[] = [];
  const starts: number[] = [];
  let full = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (!t.data.length) continue;
    starts.push(full.length);
    nodes.push(t);
    full += t.data;
  }
  if (!nodes.length) return [];

  const pattern = q
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  const re = new RegExp(pattern, 'gi');

  // last node whose start <= off (strict: < off, for range ends)
  const locate = (off: number, strict: boolean) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (strict ? starts[mid] < off : starts[mid] <= off) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const out: Range[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(full)) && out.length < MAX_MATCHES) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    const s = m.index;
    const e = m.index + m[0].length;
    const si = locate(s, false);
    const ei = locate(e, true);
    try {
      const r = document.createRange();
      r.setStart(nodes[si], Math.min(s - starts[si], nodes[si].data.length));
      r.setEnd(nodes[ei], Math.min(e - starts[ei], nodes[ei].data.length));
      out.push(r);
    } catch {}
  }
  return out;
}

export default function TextSearch({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [total, setTotal] = useState(0);
  const [cur, setCur] = useState(0);
  const [top, setTop] = useState(52);
  const rangesRef = useRef<Range[]>([]);
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const clear = useCallback(() => {
    rangesRef.current = [];
    const hl = (CSS as any).highlights;
    if (hl) { hl.delete('tts-find'); hl.delete('tts-find-current'); }
    else { try { window.getSelection()?.removeAllRanges(); } catch {} }
  }, []);

  const show = useCallback((i: number) => {
    const r = rangesRef.current[i];
    if (!r) return;
    const hl = (CSS as any).highlights;
    if (hl && (window as any).Highlight) {
      hl.set('tts-find-current', new (window as any).Highlight(r));
    } else {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
    r.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  // Open → position under the header and focus the input
  useEffect(() => {
    if (!open) return;
    const p = btnRef.current?.parentElement;
    if (p) setTop(p.getBoundingClientRect().bottom);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // Recompute matches (debounced) when query / text / open changes
  useEffect(() => {
    if (!open) { clear(); setTotal(0); setCur(0); return; }
    const t = setTimeout(() => {
      const root = getScroller();
      const q = query.trim();
      if (!root || q.length < 2) { clear(); setTotal(0); setCur(0); return; }
      const ranges = findRanges(root, q);
      rangesRef.current = ranges;
      setTotal(ranges.length);
      setCur(0);
      const hl = (CSS as any).highlights;
      if (hl && (window as any).Highlight) {
        if (ranges.length) hl.set('tts-find', new (window as any).Highlight(...ranges));
        else { hl.delete('tts-find'); hl.delete('tts-find-current'); }
      }
      if (ranges.length) show(0);
    }, 180);
    return () => clearTimeout(t);
  }, [open, query, text, clear, show]);

  useEffect(() => clear, [clear]);

  const go = (dir: 1 | -1) => {
    if (!total) return;
    const n = (cur + dir + total) % total;
    setCur(n);
    show(n);
  };

  const closeBar = () => { setOpen(false); setQuery(''); };
  const icon = { width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0, fontSize: '0.8rem' } as React.CSSProperties;

  return (
    <>
      <style>{`::highlight(tts-find){background-color:rgba(196,160,80,0.38);color:inherit}::highlight(tts-find-current){background-color:#c4a050;color:#0b1220}`}</style>
      <button
        ref={btnRef}
        onClick={() => (open ? closeBar() : setOpen(true))}
        aria-label="Search in text" title="Search in text"
        style={{ background: 'transparent', border: '1px solid ' + (open ? 'var(--border-strong)' : 'var(--border)'), borderRadius: 8, color: open ? 'var(--gold)' : 'var(--text-muted)', padding: '6px 9px', cursor: 'pointer', lineHeight: 0, flexShrink: 0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M20 20l-3.5-3.5" />
        </svg>
      </button>

      {open && (
        <div style={{ position: 'fixed', left: 0, right: 0, top, zIndex: 400, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'var(--navy-card)', borderBottom: '1px solid var(--border-strong)', boxShadow: '0 6px 18px rgba(0,0,0,0.35)' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
              else if (e.key === 'Escape') closeBar();
            }}
            enterKeyHint="search"
            placeholder="Search this text…"
            style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, fontSize: '0.85rem', background: 'var(--navy-mid)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: 44, textAlign: 'center' }}>
            {total ? `${cur + 1}/${total}` : query.trim().length >= 2 ? '0' : ''}
          </span>
          <button onClick={() => go(-1)} aria-label="Previous match" style={icon}>▲</button>
          <button onClick={() => go(1)} aria-label="Next match" style={icon}>▼</button>
          <button onClick={closeBar} aria-label="Close search" style={icon}>✕</button>
        </div>
      )}
    </>
  );
}
