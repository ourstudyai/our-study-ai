'use client';
import { useState, useEffect } from 'react';
import MiniLoader from '@/components/MiniLoader';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Material } from '@/lib/firestore/materials';

interface Props {
  courseId: string;
  onOpenViewer: (mode: 'material-text', data: any, relatedDocs?: any[]) => void;
}

export default function MaterialsPanel({ courseId, onOpenViewer }: Props) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fetchingUrl, setFetchingUrl] = useState<string | null>(null);
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});

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

  const getGeneratedPdfUrl = async (m: Material): Promise<string | null> => {
    const data = m as any;
    const direct = data.generatedPdfUrl || data.generatedFileUrl || data.pdfUrl || data.generatedPdf || null;
    if (direct) return direct;
    if (data.generatedPublicId) {
      if (fileUrls[m.id + '_gen']) return fileUrls[m.id + '_gen'];
      setFetchingUrl(m.id + '_gen');
      try {
        const params = new URLSearchParams({ publicId: data.generatedPublicId, fileUrl: '' });
        const res = await fetch('/api/material-url?' + params);
        const json = await res.json();
        if (json.url) { setFileUrls(prev => ({ ...prev, [m.id + '_gen']: json.url })); return json.url; }
      } catch { } finally { setFetchingUrl(null); }
    }
    return null;
  };

  if (loading) return <div style={{ padding: '24px 16px', textAlign: 'center' }}><MiniLoader label="Loading materials..." /></div>;
  if (materials.length === 0) return (
    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
      <p style={{ fontSize: '1.6rem', marginBottom: '8px' }}>📂</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'Lora, serif' }}>No approved materials yet for this course.</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {materials.map(m => {
        const icon = m.category === 'past_questions' ? '📋' : m.category === 'textbook' ? '📖' : '📄';
        const pageInfo = m.pageCount ? ' · ' + m.pageCount + ' pages' : '';
        const wordInfo = (m.wordCount ? m.wordCount.toLocaleString() : '0') + ' words' + pageInfo;
        const isOpen = expanded === m.id;
        const data = m as any;
        const hasGeneratedPdf = !!(data.generatedPdfUrl || data.generatedFileUrl || data.pdfUrl || data.generatedPdf || data.generatedPublicId);

        return (
          <div key={m.id} style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
            <div onClick={() => setExpanded(isOpen ? null : m.id)} style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fileName}</p>
                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>{wordInfo}</p>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
            </div>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {m.extractedText ? (
                  <button
                    onClick={() => onOpenViewer('material-text', { fileName: m.fileName, extractedText: m.extractedText })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>📝 View full text</span>
                    <span style={{ fontSize: '0.65rem' }}>↗</span>
                  </button>
                ) : (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '4px' }}>No extracted text available.</p>
                )}
                {hasGeneratedPdf && (
                  <button
                    onClick={async () => { const url = await getGeneratedPdfUrl(m); if (url) window.open(url, '_blank'); }}
                    disabled={fetchingUrl === m.id + '_gen'}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid rgba(196,160,80,0.35)', background: 'rgba(196,160,80,0.07)', color: 'var(--gold)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📄</span>
                    <span>{fetchingUrl === m.id + '_gen' ? 'Loading...' : 'Open generated PDF'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
