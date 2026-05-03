'use client';
import { useEffect } from 'react';

interface Props {
  onFilesReceived: (files: File[]) => void;
}

export default function ShareReceiver({ onFilesReceived }: Props) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('shared')) return;

    async function readSharedFiles() {
      try {
        const cache = await caches.open('share-target-v1');
        const metaRes = await cache.match('/_share_files_meta');
        if (!metaRes) return;
        const meta = await metaRes.json();
        const files: File[] = [];
        for (let i = 0; i < meta.names.length; i++) {
          const res = await cache.match(`/_share_file_${i}`);
          if (!res) continue;
          const blob = await res.blob();
          files.push(new File([blob], meta.names[i], { type: meta.types[i] }));
        }
        if (files.length > 0) {
          onFilesReceived(files);
          await cache.delete('/_share_files_meta');
          for (let i = 0; i < meta.names.length; i++) {
            await cache.delete(`/_share_file_${i}`);
          }
        }
      } catch(e) {
        console.error('ShareReceiver error:', e);
      }
    }

    readSharedFiles();
  }, []);

  return null;
}
