'use client';
import { useEffect, useState } from 'react';

// Handles SW registration, update detection, and the update banner.
// Rendered once in root layout — no UI unless an update is waiting.
export default function ServiceWorkerManager() {
  const [updateWaiting, setUpdateWaiting] = useState(false);
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      setReg(registration);

      // A new SW installed while page was open
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version waiting — show banner
            setUpdateWaiting(true);
          }
        });
      });

      // Check for waiting SW on load (e.g. user opened tab while update was ready)
      if (registration.waiting && navigator.serviceWorker.controller) {
        setUpdateWaiting(true);
      }
    }).catch(err => console.warn('[SW] Registration failed', err));

    // When SW activates after skip, reload to get fresh pages
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  function applyUpdate() {
    if (!reg?.waiting) return;
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  if (!updateWaiting) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '72px', // above bottom nav
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      background: 'rgba(13,27,42,0.97)',
      border: '1px solid rgba(196,160,80,0.4)',
      borderRadius: '12px',
      padding: '12px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      maxWidth: '320px',
      width: 'calc(100vw - 32px)',
    }}>
      <span style={{ fontSize: '0.8rem', color: '#c4a050', flex: 1, lineHeight: 1.4 }}>
        Update available
      </span>
      <button
        onClick={applyUpdate}
        style={{
          background: 'rgba(196,160,80,0.2)',
          border: '1px solid rgba(196,160,80,0.5)',
          color: '#c4a050',
          borderRadius: '8px',
          padding: '6px 14px',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Tap to update
      </button>
      <button
        onClick={() => setUpdateWaiting(false)}
        style={{
          background: 'none',
          border: 'none',
          color: '#a89060',
          cursor: 'pointer',
          fontSize: '1rem',
          padding: '0 2px',
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
