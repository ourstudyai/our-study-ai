'use client';
import { useEffect } from 'react';

interface Props {
  onFilesReceived: (files: File[]) => void;
}

export default function ShareReceiver({ onFilesReceived }: Props) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('shared')) return;

    // Method 1: launchQueue (Chrome Android native share target)
    if ('launchQueue' in window && 'LaunchParams' in window) {
      (window as any).launchQueue.setConsumer(async (launchParams: any) => {
        if (!launchParams.files?.length) return;
        const files: File[] = [];
        for (const handle of launchParams.files) {
          try { files.push(await handle.getFile()); } catch {}
        }
        if (files.length) onFilesReceived(files);
      });
      return;
    }

    // Method 2: SW cache fallback
    async function readFromCache() {
      try {
        const cache = await caches.open('share-target-v1');
        const metaRes = await cache.match('/_share_files_meta');
        if (!metaRes) return;
        const meta = await metaRes.json();
        // Check not stale (older than 2 min)
        if (Date.now() - meta.timestamp > 120000) return;
        const files: File[] = [];
        for (let i = 0; i < meta.names.length; i++) {
          const res = await cache.match(`/_share_file_${i}`);
          if (!res) continue;
          const blob = await res.blob();
          files.push(new File([blob], meta.names[i], { type: meta.types[i] }));
        }
        if (files.length) {
          onFilesReceived(files);
          await cache.delete('/_share_files_meta');
          for (let i = 0; i < meta.names.length; i++) cache.delete(`/_share_file_${i}`);
        }
      } catch (e) { console.error('ShareReceiver cache error:', e); }
    }

    readFromCache();
  }, []);

  // Show nothing — files are injected silently into parent state
  return null;
}

