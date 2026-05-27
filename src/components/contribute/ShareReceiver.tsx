'use client';
import { useEffect } from 'react';

interface Props {
  onFilesReceived: (files: File[]) => void;
}

// launchQueue: fires when PWA is already open and Chrome handles the share natively.
// Set consumer at module level so it fires before React hydration.
let _pendingFiles: File[] | null = null;
if (typeof window !== 'undefined' && 'launchQueue' in window) {
  (window as any).launchQueue.setConsumer(async (launchParams: any) => {
    if (!launchParams.files?.length) return;
    const files: File[] = [];
    for (const handle of launchParams.files) {
      try { files.push(await handle.getFile()); } catch (e) { console.error(e); }
    }
    if (files.length) _pendingFiles = files;
  });
}

export default function ShareReceiver({ onFilesReceived }: Props) {
  useEffect(() => {
    // ── Path 1: launchQueue (PWA already open, Chrome Android native) ──
    if (_pendingFiles?.length) {
      onFilesReceived(_pendingFiles);
      _pendingFiles = null;
      return;
    }
    if ('launchQueue' in window) {
      (window as any).launchQueue.setConsumer(async (launchParams: any) => {
        if (!launchParams.files?.length) return;
        const files: File[] = [];
        for (const handle of launchParams.files) {
          try { files.push(await handle.getFile()); } catch (e) { console.error(e); }
        }
        if (files.length) onFilesReceived(files);
      });
    }

    // ── Path 2: share_token (app not open, share-handler POST route) ──
    // Fires for WhatsApp shares, Files app, any source that goes through the handler
    const params = new URLSearchParams(window.location.search);
    const token = params.get('share_token');
    const shareError = params.get('share_error');

    if (shareError) {
      console.warn('[ShareReceiver] Share handler reported error:', shareError);
      // Clean URL
      const clean = new URL(window.location.href);
      clean.searchParams.delete('share_error');
      window.history.replaceState({}, '', clean.toString());
      return;
    }

    if (!token) return;

    // Clean token from URL immediately so refresh doesn't re-fetch
    const clean = new URL(window.location.href);
    clean.searchParams.delete('share_token');
    window.history.replaceState({}, '', clean.toString());

    async function fetchSharedFiles() {
      try {
        const res = await fetch(`/api/share-temp?token=${token}`);
        if (!res.ok) {
          console.warn('[ShareReceiver] share-temp fetch failed:', res.status);
          return;
        }
        const { names, urls } = await res.json() as { names: string[]; urls: string[] };

        const files: File[] = [];
        for (let i = 0; i < urls.length; i++) {
          try {
            const fileRes = await fetch(urls[i]);
            const blob = await fileRes.blob();
            const file = new File([blob], names[i], { type: blob.type || 'application/octet-stream' });
            files.push(file);
          } catch (e) {
            console.warn('[ShareReceiver] Failed to fetch file:', names[i], e);
          }
        }

        if (files.length) onFilesReceived(files);

      } catch (e) {
        console.error('[ShareReceiver] fetchSharedFiles error:', e);
      } finally {
        // Always clean up R2 + Firestore regardless of success
        try {
          await fetch(`/api/share-temp?token=${token}`, { method: 'DELETE' });
        } catch (e) {
          console.warn('[ShareReceiver] Cleanup failed:', e);
        }
      }
    }

    fetchSharedFiles();
  }, [onFilesReceived]);

  return null;
}
