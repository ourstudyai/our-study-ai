'use client';
import { useEffect, useState } from 'react';

// Shows a subtle banner when the user loses connection.
// Dismisses automatically when connection returns.
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
      // Keep banner visible briefly to confirm reconnection, then fade
      setTimeout(() => setVisible(false), 2500);
    }

    // Set initial state
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
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9998,
      background: offline ? 'rgba(30,15,5,0.97)' : 'rgba(5,30,15,0.97)',
      borderBottom: `1px solid ${offline ? 'rgba(196,100,50,0.4)' : 'rgba(50,196,100,0.4)'}`,
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      transition: 'background 0.4s, border-color 0.4s',
    }}>
      <span style={{ fontSize: '0.75rem' }}>{offline ? '📵' : '✅'}</span>
      <span style={{
        fontSize: '0.75rem',
        fontWeight: 500,
        color: offline ? '#d4804a' : '#4ac880',
        letterSpacing: '0.01em',
      }}>
        {offline
          ? 'You\'re offline — showing cached content'
          : 'Back online'}
      </span>
    </div>
  );
}
