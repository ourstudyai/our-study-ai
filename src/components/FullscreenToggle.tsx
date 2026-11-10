'use client';
import { useState, useEffect, useCallback } from 'react';

const KEY = 'ourstudyai_fs';

function fsElement(): Element | null {
  const d: any = document;
  return document.fullscreenElement || d.webkitFullscreenElement || null;
}

async function enterFs() {
  const el: any = document.documentElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch {}
}

async function exitFs() {
  const d: any = document;
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
  } catch {}
}

export function useFullscreen() {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el: any = document.documentElement;
    const can = !!(el.requestFullscreen || el.webkitRequestFullscreen) && (document as any).fullscreenEnabled !== false;
    // Installed app already running fullscreen → nothing to toggle
    const alreadyFull = window.matchMedia('(display-mode: fullscreen)').matches;
    setSupported(can && !alreadyFull);
    setActive(!!fsElement());
    const sync = () => {
      const on = !!fsElement();
      setActive(on);
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggle = useCallback(() => { if (fsElement()) exitFs(); else enterFs(); }, []);
  return { supported, active, toggle };
}

// Mounted once in the root layout: after a full page reload the browser drops
// fullscreen, so re-enter on the user's first tap if they were in fullscreen.
export function FullscreenRestore() {
  useEffect(() => {
    let want = false;
    try { want = localStorage.getItem(KEY) === '1'; } catch {}
    if (!want || fsElement()) return;
    const el: any = document.documentElement;
    if (!(el.requestFullscreen || el.webkitRequestFullscreen)) return;
    const go = () => {
      document.removeEventListener('pointerup', go, true);
      document.removeEventListener('click', go, true);
      if (!fsElement()) enterFs();
    };
    document.addEventListener('pointerup', go, true);
    document.addEventListener('click', go, true);
    return () => {
      document.removeEventListener('pointerup', go, true);
      document.removeEventListener('click', go, true);
    };
  }, []);
  return null;
}

const ICON_ENTER = 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5';
const ICON_EXIT = 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5';

export default function FullscreenButton({ variant = 'icon', onAfter }: { variant?: 'icon' | 'row'; onAfter?: () => void }) {
  const { supported, active, toggle } = useFullscreen();
  if (!supported) return null;

  const icon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={active ? ICON_EXIT : ICON_ENTER} />
    </svg>
  );
  const click = () => { toggle(); onAfter?.(); };

  if (variant === 'row') {
    return (
      <button onClick={click}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px', width: '100%', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent' }}>
        <span style={{ display: 'inline-flex', width: 16, justifyContent: 'center' }}>{icon}</span>
        {active ? 'Exit full screen' : 'Full screen'}
      </button>
    );
  }
  return (
    <button onClick={click}
      aria-label={active ? 'Exit full screen' : 'Full screen'} title={active ? 'Exit full screen' : 'Full screen'}
      style={{ background: 'transparent', border: '1px solid ' + (active ? 'var(--border-strong)' : 'var(--border)'), borderRadius: 8, color: active ? 'var(--gold)' : 'var(--text-secondary)', padding: '6px 9px', cursor: 'pointer', lineHeight: 0, flexShrink: 0 }}>
      {icon}
    </button>
  );
}
