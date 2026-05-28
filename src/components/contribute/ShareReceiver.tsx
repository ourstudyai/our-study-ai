'use client';
import { useEffect } from 'react';

interface Props {
  onFilesReceived: (files: File[]) => void;
}

// Module-level launchQueue consumer — must be set before React hydration
// so files shared to a closed PWA are captured when Chrome opens the app.
// Chrome guarantees launchQueue fires once the page is interactive.
let _pendingFiles: File[] | null = null;
if (typeof window !== 'undefined' && 'launchQueue' in window) {
  (window as any).launchQueue.setConsumer(async (launchParams: any) => {
    if (!launchParams.files?.length) return;
    const files: File[] = [];
    for (const handle of launchParams.files) {
      try { files.push(await handle.getFile()); } catch (e) { console.error('[ShareReceiver] handle.getFile failed', e); }
    }
    if (files.length) _pendingFiles = files;
  });
}

export default function ShareReceiver({ onFilesReceived }: Props) {
  useEffect(() => {
    // Clean share_incoming param from URL — it's just a signal, nothing to fetch
    const params = new URLSearchParams(window.location.search);
    if (params.get('share_incoming') || params.get('share_error')) {
      const clean = new URL(window.location.href);
      clean.searchParams.delete('share_incoming');
      clean.searchParams.delete('share_error');
      window.history.replaceState({}, '', clean.toString());
    }

    // ── Path 1: files captured before hydration ──
    if (_pendingFiles?.length) {
      onFilesReceived(_pendingFiles);
      _pendingFiles = null;
      return;
    }

    // ── Path 2: PWA already open, launchQueue fires after mount ──
    if ('launchQueue' in window) {
      (window as any).launchQueue.setConsumer(async (launchParams: any) => {
        if (!launchParams.files?.length) return;
        const files: File[] = [];
        for (const handle of launchParams.files) {
          try { files.push(await handle.getFile()); } catch (e) { console.error('[ShareReceiver] handle.getFile failed', e); }
        }
        if (files.length) onFilesReceived(files);
      });
    }
  }, [onFilesReceived]);

  return null;
}
