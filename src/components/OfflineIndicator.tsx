'use client';
import { useEffect, useState } from 'react';

export default function OfflineIndicator() {
  const [offline, setOffline] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleOffline() {
      setOffline(true);
      setVisible(true);
    }
    function handleOnline() {
      setOffline(false);
      setTimeout(() => setVisible(false), 2500);
    }

    if (!navigator.onLine) {
      setOffline(true);
      setVisible(true);
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      // Sits flush below the mobile nav (52px) — on md+ there's no top nav so 0 is fine
      top: '52px',
      left: 0,
      right: 0,
      zIndex: 39, // just below nav's z-40
      background: offline ? 'rgba(40,10,0,0.96)' : 'rgba(0,30,10,0.96)',
      borderBottom: `1px solid ${offline ? 'rgba(196,80,40,0.4)' : 'rgba(40,180,80,0.4)'}`,
      padding: '6px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      transition: 'background 0.4s, border-color 0.4s',
    }}>
      <span style={{ fontSize: '0.72rem' }}>{offline ? '📵' : '✅'}</span>
      <span style={{
        fontSize: '0.72rem',
        fontWeight: 500,
        color: offline ? '#d4804a' : '#4ac880',
        letterSpacing: '0.01em',
      }}>
        {offline ? "You're offline — showing cached content" : 'Back online'}
      </span>
    </div>
  );
}
