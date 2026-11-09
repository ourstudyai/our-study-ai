'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface Props {
  text: string;
  title?: string;
  storageKey?: string;
}

// Same key as the AI-output readout, so voice/speed/volume are shared everywhere
const PREFS_KEY = 'ourstudyai_tts_prefs';
const KEEP_KEY = 'ourstudyai_audio_keepawake';
const POS_PREFIX = 'ourstudyai_audio_pos:';
const CHARS_PER_SEC = 15; // ~170 wpm at 1x, used for time-left estimate
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const BLOCK_SEL = 'p, li, h1, h2, h3, h4, blockquote, td';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u00C0-\uFFFF]+/g, ' ').trim();

function collectBlocks(sc: HTMLElement) {
  const out: { el: HTMLElement; key: string }[] = [];
  sc.querySelectorAll<HTMLElement>(BLOCK_SEL).forEach((el) => {
    if (el.querySelector('p, li, blockquote')) return;
    const key = norm(el.textContent || '');
    if (key.length >= 3) out.push({ el, key });
  });
  return out;
}

function blockMatches(blockKey: string, chunkKey: string) {
  const c = chunkKey.slice(0, 40);
  const b = blockKey.slice(0, 40);
  return (c.length >= 3 && blockKey.includes(c)) || (b.length >= 3 && chunkKey.startsWith(b));
}

// ── Markdown / extracted text → clean speakable text ─────────────────────────
export function cleanForSpeech(md: string): string {
  let t = (md || '').replace(/\r\n?/g, '\n');
  t = t.replace(/```[\s\S]*?```/g, '\n\n');
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  t = t.replace(/https?:\/\/\S+/g, '');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/^[ \t]*([-*_][ \t]*){3,}$/gm, '');
  t = t.replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, '');

  const lines = t.split('\n').map((line) => {
    let l = line;
    const h = l.match(/^\s{0,3}#{1,6}\s*(.+?)\s*#*\s*$/);
    if (h) return '\n' + h[1].replace(/[.!?:;,]+$/, '') + '.\n';
    if (/^\s*\|/.test(l) || (l.match(/\|/g) || []).length >= 2) {
      l = l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()).filter(Boolean).join(', ');
      return '\n' + l + (/[.!?]$/.test(l) ? '' : '.') + '\n';
    }
    l = l.replace(/^\s*>\s?/, '');
    const b = l.match(/^\s*(?:([-*+•])|(\d+)[.)])\s+(.*)$/);
    if (b) {
      const body = b[3].trim();
      return '\n' + (b[2] ? b[2] + '. ' : '') + body + (/[.!?:;,]$/.test(body) ? '' : '.') + '\n';
    }
    return l;
  });

  t = lines.join('\n');
  t = t.replace(/`([^`]*)`/g, '$1');
  t = t.replace(/\*+/g, '').replace(/~~/g, '');
  t = t.replace(/[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF\uFE0F\u200D]/g, '');
  t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

function splitLong(s: string, max: number): string[] {
  const out: string[] = [];
  let rest = s.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf(', ', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) out.push(rest.trim());
  return out;
}

// Paragraph-aware chunks (≤ max chars). Short enough to dodge the browser
// speechSynthesis cut-off bug, and each paragraph gets a natural pause.
export function chunkForSpeech(clean: string, max = 240): string[] {
  const out: string[] = [];
  clean.split(/\n\s*\n/).forEach((par) => {
    const p = par.replace(/\s*\n\s*/g, ' ').trim();
    if (!p) return;
    const sentences = p.match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)\s*/g) || [p];
    let cur = '';
    const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
    for (const s of sentences) {
      if (s.length > max) { flush(); splitLong(s, max).forEach((x) => out.push(x)); continue; }
      if ((cur + s).length > max) flush();
      cur += s;
    }
    flush();
  });
  return out.filter((c) => /[A-Za-z0-9\u00C0-\uFFFF]/.test(c));
}

function timeLeft(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 1) return '<1 min left';
  if (m < 60) return `~${m} min left`;
  return `~${Math.floor(m / 60)} h ${m % 60} min left`;
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
};
const ghostBtn: React.CSSProperties = {
  width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
};

export default function AudiobookPlayer({ text, title, storageKey }: Props) {
  const chunks = useMemo(() => chunkForSpeech(cleanForSpeech(text)), [text]);
  const chunkKeys = useMemo(() => chunks.map(norm), [chunks]);
  const cum = useMemo(() => {
    const c = [0];
    chunks.forEach((x, i) => c.push(c[i] + x.length));
    return c;
  }, [chunks]);
  const total = cum[cum.length - 1] || 1;

  const [status, setStatus] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [idx, setIdx] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState('');
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [sleepMin, setSleepMin] = useState(0);
  const [supported, setSupported] = useState(true);
  const [keepAwake, setKeepAwake] = useState(true);

  const idxRef = useRef(0);
  const playingRef = useRef(false);
  const genRef = useRef(0);
  const uttRef = useRef<SpeechSynthesisUtterance | null>(null); // keep ref: stops Chrome GC-ing the utterance
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef(0);
  const userScrollAt = useRef(0);
  const prefsRef = useRef({ voice, rate, volume });
  prefsRef.current = { voice, rate, volume };
  const statusRef = useRef(status);
  statusRef.current = status;
  const posKey = POS_PREFIX + (storageKey || title || 'default');

  const getScroller = () =>
    (rootRef.current?.parentElement?.querySelector('[data-tts-scroll]') as HTMLElement | null) ?? null;

  // Support check, saved prefs, voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) { setSupported(false); return; }
    try {
      const s = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (s.voice) setVoice(s.voice);
      if (typeof s.rate === 'number') setRate(s.rate);
      if (typeof s.volume === 'number') setVolume(s.volume);
    } catch {}
    try { if (localStorage.getItem(KEEP_KEY) === '0') setKeepAwake(false); } catch {}
    const load = () => { const v = window.speechSynthesis.getVoices(); if (v.length) setVoices(v); };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  // Stop everything on unmount
  useEffect(() => () => {
    playingRef.current = false;
    genRef.current++;
    if (seekTimer.current) clearTimeout(seekTimer.current);
    try { window.speechSynthesis.cancel(); } catch {}
  }, []);

  // New text → reset, restore saved position
  useEffect(() => {
    playingRef.current = false;
    genRef.current++;
    try { window.speechSynthesis?.cancel(); } catch {}
    setStatus('idle');
    cursorRef.current = 0;
    let start = 0;
    try {
      const p = JSON.parse(localStorage.getItem(posKey) || 'null');
      if (p && p.total === chunks.length && p.idx > 0 && p.idx < chunks.length) start = p.idx;
    } catch {}
    idxRef.current = start;
    setIdx(start);
  }, [chunks, posKey]);

  // Remember where the listener stopped
  useEffect(() => {
    if (!chunks.length || idx <= 0) return;
    try { localStorage.setItem(posKey, JSON.stringify({ idx, total: chunks.length })); } catch {}
  }, [idx, chunks.length, posKey]);

  const finish = useCallback(() => {
    playingRef.current = false;
    setStatus('idle');
    idxRef.current = 0;
    setIdx(0);
    try { localStorage.removeItem(posKey); } catch {}
  }, [posKey]);

  const speakFrom = useCallback((i: number) => {
    const synth = window.speechSynthesis;
    const gen = ++genRef.current;
    synth.cancel();
    if (i >= chunks.length) { finish(); return; }
    idxRef.current = i;
    setIdx(i);

    const utt = new SpeechSynthesisUtterance(chunks[i]);
    const { voice: v, rate: r, volume: vol } = prefsRef.current;
    utt.rate = r;
    utt.volume = vol;
    if (v) {
      const f = synth.getVoices().find((x) => x.name === v);
      if (f) { utt.voice = f; utt.lang = f.lang; }
    }
    utt.onend = () => {
      if (gen !== genRef.current || !playingRef.current) return;
      speakFrom(i + 1);
    };
    utt.onerror = (e) => {
      if (gen !== genRef.current) return;
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      playingRef.current = false;
      setStatus('paused');
    };
    uttRef.current = utt;

    setTimeout(() => {
      if (gen !== genRef.current) return;
      synth.speak(utt);
      // Watchdog: some mobile engines never fire onend. Never skip ahead while
      // the screen is off / tab hidden — just wait and resume on return.
      const check = () => {
        if (gen !== genRef.current || !playingRef.current) return;
        if (document.visibilityState === 'hidden') { setTimeout(check, 3000); return; }
        if (!synth.speaking && !synth.pending) speakFrom(i + 1);
        else setTimeout(check, 3000);
      };
      setTimeout(check, (chunks[i].length / (CHARS_PER_SEC * r)) * 1500 + 3000);
    }, 60);
  }, [chunks, finish]);

  const play = useCallback(() => {
    if (!chunks.length) return;
    playingRef.current = true;
    setStatus('playing');
    speakFrom(idxRef.current);
  }, [chunks, speakFrom]);

  const pause = useCallback(() => {
    playingRef.current = false;
    genRef.current++;
    try { window.speechSynthesis.cancel(); } catch {}
    setStatus('paused');
  }, []);

  const jump = useCallback((i: number, debounce = false) => {
    const n = Math.max(0, Math.min(chunks.length - 1, i));
    idxRef.current = n;
    setIdx(n);
    if (!playingRef.current) return;
    if (seekTimer.current) clearTimeout(seekTimer.current);
    if (debounce) seekTimer.current = setTimeout(() => { if (playingRef.current) speakFrom(n); }, 300);
    else speakFrom(n);
  }, [chunks, speakFrom]);

  const startOver = () => {
    pause();
    setStatus('idle');
    idxRef.current = 0;
    setIdx(0);
    try { localStorage.removeItem(posKey); } catch {}
  };

  // Voice / speed / volume changed mid-playback → re-speak current paragraph
  const firstPrefs = useRef(true);
  useEffect(() => {
    if (firstPrefs.current) { firstPrefs.current = false; return; }
    if (!playingRef.current) return;
    const t = setTimeout(() => { if (playingRef.current) speakFrom(idxRef.current); }, 350);
    return () => clearTimeout(t);
  }, [voice, rate, volume, speakFrom]);

  // Sleep timer
  useEffect(() => {
    if (!sleepMin) return;
    const t = setTimeout(() => { pause(); setSleepMin(0); }, sleepMin * 60000);
    return () => clearTimeout(t);
  }, [sleepMin, pause]);

  // Screen wake lock — only while playing AND the user has "Keep screen awake" on
  const wakeRef = useRef<any>(null);
  useEffect(() => {
    const wl = typeof navigator !== 'undefined' ? (navigator as any).wakeLock : null;
    if (status !== 'playing' || !keepAwake || !wl) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await wl.request('screen');
        if (cancelled) { s.release(); return; }
        wakeRef.current = s;
      } catch {}
    };
    acquire();
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      try { wakeRef.current?.release(); } catch {}
      wakeRef.current = null;
    };
  }, [status, keepAwake]);

  // Screen turned back on after the browser silenced speech → pick up where we were
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible' || !playingRef.current) return;
      if (!window.speechSynthesis.speaking) speakFrom(idxRef.current);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [speakFrom]);

  // Track manual scrolling so auto-scroll doesn't fight the reader
  useEffect(() => {
    const sc = getScroller();
    if (!sc) return;
    const mark = () => { userScrollAt.current = Date.now(); };
    sc.addEventListener('touchmove', mark, { passive: true });
    sc.addEventListener('wheel', mark, { passive: true });
    return () => { sc.removeEventListener('touchmove', mark); sc.removeEventListener('wheel', mark); };
  }, [chunks]);

  // Highlight the paragraph being read + auto-scroll to it
  useEffect(() => {
    const sc = getScroller();
    if (!sc) return;
    sc.querySelectorAll('[data-tts-active]').forEach((e) => e.removeAttribute('data-tts-active'));
    if (status === 'idle' && idx === 0) { cursorRef.current = 0; return; }
    const key = chunkKeys[idx];
    if (!key) return;
    const blocks = collectBlocks(sc);
    let found = -1;
    for (let i = cursorRef.current; i < blocks.length; i++) {
      if (blockMatches(blocks[i].key, key)) { found = i; break; }
    }
    if (found < 0) {
      for (let i = 0; i < Math.min(cursorRef.current, blocks.length); i++) {
        if (blockMatches(blocks[i].key, key)) { found = i; break; }
      }
    }
    if (found < 0) return;
    cursorRef.current = found;
    const el = blocks[found].el;
    el.setAttribute('data-tts-active', '1');
    if (status === 'playing' && Date.now() - userScrollAt.current > 4000) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [idx, status, chunkKeys]);

  // Tap a paragraph (once a session has started) → continue reading from there
  useEffect(() => {
    const sc = getScroller();
    if (!sc) return;
    const onClick = (e: MouseEvent) => {
      if (statusRef.current === 'idle') return;
      if ((window.getSelection()?.toString() || '').length > 0) return;
      const el = (e.target as HTMLElement).closest?.(BLOCK_SEL) as HTMLElement | null;
      if (!el || !sc.contains(el)) return;
      const bk = norm(el.textContent || '').slice(0, 40);
      if (bk.length < 3) return;
      let best = -1;
      chunkKeys.forEach((ck, i) => {
        if (ck.startsWith(bk) && (best < 0 || Math.abs(i - idxRef.current) < Math.abs(best - idxRef.current))) best = i;
      });
      if (best < 0) return;
      playingRef.current = true;
      setStatus('playing');
      speakFrom(best);
    };
    sc.addEventListener('click', onClick);
    return () => sc.removeEventListener('click', onClick);
  }, [chunkKeys, speakFrom]);

  // Close settings on outside click
  useEffect(() => {
    if (!showSettings) return;
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setShowSettings(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showSettings]);

  const savePrefs = (v: string, r: number, vol: number) => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ voice: v, rate: r, volume: vol })); } catch {}
  };

  if (!supported || !chunks.length) return null;

  const playing = status === 'playing';
  const pct = Math.min(100, Math.round((cum[idx] / total) * 100));
  const secsLeft = (total - cum[idx]) / (CHARS_PER_SEC * rate);
  const cycleSpeed = () => {
    const next = SPEEDS.find((s) => s > rate + 0.01) ?? SPEEDS[0];
    setRate(next);
    savePrefs(voice, next, volume);
  };

  return (
    <div ref={rootRef} style={{
      flexShrink: 0, position: 'relative', borderTop: '1px solid var(--border-strong)',
      background: 'var(--navy-card)', padding: '10px 14px max(10px, env(safe-area-inset-bottom))',
    }}>
      <style>{`[data-tts-active="1"]{background:rgba(196,160,80,0.16);box-shadow:-4px 0 0 var(--gold);border-radius:4px;transition:background .2s ease}`}</style>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        {/* Progress */}
        <input
          type="range" min={0} max={Math.max(0, chunks.length - 1)} step={1} value={idx}
          aria-label="Seek"
          onChange={(e) => jump(parseInt(e.target.value, 10), true)}
          style={{ width: '100%', accentColor: 'var(--gold)', cursor: 'pointer', display: 'block' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
          <span>🎧 {pct}%{!playing && idx > 0 ? ' · resume' : ''}</span>
          <span>{timeLeft(secsLeft)}</span>
        </div>
        <p style={{
          fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--text-secondary)', margin: '6px 0 8px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minHeight: '1em',
        }}>
          {playing ? chunks[idx] : (title || 'Listen to this material')}
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div ref={panelRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setShowSettings((s) => !s)} aria-label="Voice settings" title="Voice settings"
              style={{ ...ghostBtn, color: showSettings ? 'var(--gold)' : 'var(--text-secondary)', borderColor: showSettings ? 'var(--border-strong)' : 'var(--border)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {showSettings && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 12px)', left: 0, zIndex: 400,
                width: 'min(300px, calc(100vw - 28px))', background: 'var(--navy-card)',
                border: '1px solid var(--border-strong)', borderRadius: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.45)', overflow: 'hidden',
              }}>
                <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border)', background: 'var(--navy-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: '0.78rem', color: 'var(--gold)', letterSpacing: '0.02em' }}>Voice Settings</span>
                  <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1, padding: '0 2px' }}>✕</button>
                </div>
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ ...labelStyle, display: 'block', marginBottom: 5 }}>Voice</label>
                    <select value={voice}
                      onChange={(e) => { setVoice(e.target.value); savePrefs(e.target.value, rate, volume); }}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 8, fontSize: '0.72rem', background: 'var(--navy-mid)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}>
                      <option value="">Default</option>
                      {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <label style={labelStyle}>Speed</label>
                      <span style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 700 }}>{rate.toFixed(2).replace(/0$/, '')}×</span>
                    </div>
                    <input type="range" min="0.5" max="2" step="0.05" value={rate}
                      onChange={(e) => { const r = parseFloat(e.target.value); setRate(r); savePrefs(voice, r, volume); }}
                      style={{ width: '100%', accentColor: 'var(--gold)', cursor: 'pointer' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 2, opacity: 0.6 }}>
                      <span>0.5×</span><span>1×</span><span>2×</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <label style={labelStyle}>Volume</label>
                      <span style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 700 }}>{Math.round(volume * 100)}%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05" value={volume}
                      onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); savePrefs(voice, rate, v); }}
                      style={{ width: '100%', accentColor: 'var(--gold)', cursor: 'pointer' }} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Sleep timer</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[0, 15, 30, 60].map((m) => (
                        <button key={m} onClick={() => setSleepMin(m)}
                          style={{
                            flex: 1, padding: '6px 0', borderRadius: 8, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                            background: sleepMin === m ? 'var(--gold-dim)' : 'transparent',
                            border: '1px solid ' + (sleepMin === m ? 'var(--border-strong)' : 'var(--border)'),
                            color: sleepMin === m ? 'var(--gold)' : 'var(--text-muted)',
                          }}>
                          {m === 0 ? 'Off' : m + 'm'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <button
                      onClick={() => {
                        const n = !keepAwake;
                        setKeepAwake(n);
                        try { localStorage.setItem(KEEP_KEY, n ? '1' : '0'); } catch {}
                      }}
                      style={{
                        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
                        background: keepAwake ? 'var(--gold-dim)' : 'transparent',
                        border: '1px solid ' + (keepAwake ? 'var(--border-strong)' : 'var(--border)'),
                        color: keepAwake ? 'var(--gold)' : 'var(--text-secondary)',
                      }}>
                      <span>Keep screen awake</span><span>{keepAwake ? 'On' : 'Off'}</span>
                    </button>
                    <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.5 }}>
                      Off lets the screen sleep. Some phones pause the voice when the screen is off; it resumes when you return.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={startOver}
                      style={{ flex: 1, padding: 7, borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                      Start over
                    </button>
                    <button onClick={() => setShowSettings(false)}
                      style={{ flex: 1, padding: 7, borderRadius: 8, background: 'var(--gold-dim)', border: '1px solid var(--border-strong)', color: 'var(--gold)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em' }}>
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => jump(idx - 1)} aria-label="Previous paragraph" title="Previous" style={ghostBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zM9.5 12l8.5 6V6z" /></svg>
            </button>
            <button onClick={playing ? pause : play} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}
              style={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gold)', color: 'var(--navy)', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              {playing
                ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
                : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
            </button>
            <button onClick={() => jump(idx + 1)} aria-label="Next paragraph" title="Next" style={ghostBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" /></svg>
            </button>
          </div>

          <button onClick={cycleSpeed} aria-label="Change speed" title="Tap to change speed"
            style={{ ...ghostBtn, width: 'auto', minWidth: 46, borderRadius: 19, padding: '0 10px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)' }}>
            {rate.toFixed(2).replace(/0$/, '').replace(/\.$/, '')}×
          </button>
        </div>
      </div>
    </div>
  );
}
