'use client';
import { useEffect } from 'react';

interface Props {
  onFilesReceived: (files: File[]) => void;
}

export default function ShareReceiver({ onFilesReceived }: Props) {
  useEffect(() => {
    // Method 1: launchQueue (Chrome's native share target API)
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

    // Method 2: Read files posted to our handler via sessionStorage
    // The share-handler API route stores file info in the URL
    const params = new URLSearchParams(window.location.search);
    const shared = params.get('shared');
    const count = params.get('count');
    if (shared && count && Number(count) > 0) {
      // Files came through but we lost them — show the file picker highlighted
      // so user knows to pick the files they just shared
      const event = new CustomEvent('share-target-hint', { detail: { count: Number(count) } });
      window.dispatchEvent(event);
    }
  }, []);

  return null;
}
