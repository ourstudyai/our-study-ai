'use client';
import { useEffect } from 'react';

export default function ServiceWorkerManager() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(err =>
      console.warn('[SW] Registration failed', err)
    );
  }, []);

  return null;
}
