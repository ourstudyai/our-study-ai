'use client';
import { useEffect } from 'react';

interface Props {
  onFilesReceived: (files: File[]) => void;
}

// Set consumer immediately at module level so it fires before React hydration
let _pendingFiles: File[] | null = null;
if (typeof window !== 'undefined' && 'launchQueue' in window) {
  (window as any).launchQueue.setConsumer(async (launchParams: any) => {
    if (!launchParams.files?.length) return;
    const files: File[] = [];
    for (const handle of launchParams.files) {
      try { files.push(await handle.getFile()); } catch(e) { console.error(e); }
    }
    if (files.length) _pendingFiles = files;
  });
}

export default function ShareReceiver({ onFilesReceived }: Props) {
  useEffect(() => {
    // Deliver any files that arrived before component mounted
    if (_pendingFiles?.length) {
      onFilesReceived(_pendingFiles);
      _pendingFiles = null;
      return;
    }

    // Re-set consumer for files that arrive after mount
    if ('launchQueue' in window) {
      (window as any).launchQueue.setConsumer(async (launchParams: any) => {
        if (!launchParams.files?.length) return;
        const files: File[] = [];
        for (const handle of launchParams.files) {
          try { files.push(await handle.getFile()); } catch(e) { console.error(e); }
        }
        if (files.length) onFilesReceived(files);
      });
    }

    // URL hint fallback (count only, no actual files)
    const params = new URLSearchParams(window.location.search);
    if (params.get('shared') && params.get('count')) {
      const count = Number(params.get('count'));
      if (count > 0) {
        const event = new CustomEvent('share-target-hint', { detail: { count } });
        window.dispatchEvent(event);
      }
    }
  }, [onFilesReceived]);

  return null;
}
