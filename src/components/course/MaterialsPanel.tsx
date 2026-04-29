// src/components/course/MaterialsPanel.tsx
'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Material } from '@/lib/firestore/materials';

interface Props {
  courseId: string;
  onActivate: (context: { fileName: string; extractedText: string } | null) => void;
  activeFileName: string | null;
}

export default function MaterialsPanel({ courseId, onActivate, activeFileName }: Props) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fetchingUrl, setFetchingUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    getDocs(query(
      collection(db, 'materials'),
      where('confirmedCourseId', '==', courseId),
      where('status', '==', 'approved'),
    )).then(snap => {
      setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as Material)));
    }).catch(console.error).finally(() => setLoading(false));
  }, [courseId]);

  const handleViewFile = async (m: Material) => {
    const data = m as any;
    if (data.publicId) {
      setFetchingUrl(m.id);
      try {
        const res = await fetch('/api/material-url?publicId=' + encodeURIComponent(data.publicId));
        const json = await res.json();
        if (json.url) window.open(json.url, '_blank');
      } catch { alert('Could not load file URL. Try again.'); }
      finally { setFetchingUrl(null); }
    } else if (m.fileUrl) {
      window.open(m.fileUrl, '_blank');
    }
  };

  if (loading) return (
    <div style={{ padding: '24px 16px', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading materials...</p>
    </div>
  );

  if (materials.length === 0) return (
    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
      <p style={{ fontSize: '1.6rem', marginBottom: '8px' }}>📂</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'Lora, serif' }}>
        No approved materials yet for this course.
      </p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {materials.map(m => {
        const icon = m.category === 'past_questions' ? '📋' : m.category === 'textbook' ? '📖' : '📄';
        const pageInfo = m.pageCount ? ' · ' + m.pageCount + ' pages' : '';
        const wordInfo = (m.wordCount ? m.wordCount.toLocaleString() : '0') + ' words' + pageInfo;
        const isOpen = expanded === m.id;
        const isActive = activeFileName === m.fileName;
        return (
          <div key={m.id} style={{
            background: isActive ? 'rgba(196,160,80,0.08)' : 'var(--navy)',
            border: '1px solid ' + (isActive ? 'var(--gold)' : 'var(--border)'),
            borderRadius: '10px', overflow: 'hidden',
          }}>
            <div onClick={() => setExpanded(isOpen ? null : m.id)}
              style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'flex-start' }}
            >
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: '0.78rem', fontWeight: 600, color: isActive ? 'var(--gold)' : 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{m.fileName}</p>
                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>{wordInfo}</p>
              </div>
              {isActive && <span style={{ fontSize: '0.6rem', color: 'var(--gold)', fontWeight: 700, flexShrink: 0, alignSelf: 'center' }}>ACTIVE</span>}
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                {isOpen ? '▲' : '▼'}
              </span>
            </div>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button onClick={() => onActivate({ fileName: m.fileName, extractedText: m.extractedText || '' })} style={{
                  width: '100%', padding: '8px 10px', borderRadius: '7px',
                  background: isActive ? 'rgba(196,160,80,0.15)' : 'var(--gold)',
                  color: isActive ? 'var(--gold)' : 'var(--navy)',
                  border: isActive ? '1px solid var(--gold)' : 'none',
                  fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                }}>
                  {isActive ? '📖 Studying this' : '📖 Study this'}
                </button>
                <button onClick={() => handleViewFile(m)} disabled={fetchingUrl === m.id} style={{
                  width: '100%', padding: '6px 10px', borderRadius: '7px',
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer',
                }}>
                  {fetchingUrl === m.id ? 'Loading...' : 'View document'}
                </button>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '2px' }}>
                  To download, visit the Library
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
