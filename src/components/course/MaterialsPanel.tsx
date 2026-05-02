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
  onSendMessage?: (text: string) => void;
}

function extractTopics(text: string): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  const topics: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Match lines that look like headings: short, no period at end, possibly numbered
    if (
      trimmed.length > 3 &&
      trimmed.length < 120 &&
      !trimmed.endsWith('.') &&
      (
        /^(chapter|unit|topic|section|part|lesson|\d+[.):])/i.test(trimmed) ||
        /^#{1,4}\s/.test(trimmed) ||
        (/^[A-Z]/.test(trimmed) && trimmed === trimmed.toUpperCase() && trimmed.length > 4 && trimmed.length < 80)
      )
    ) {
      const clean = trimmed.replace(/^#+\s*/, '').replace(/^\d+[.):]\s*/, '').trim();
      if (clean.length > 3 && !topics.includes(clean)) topics.push(clean);
      if (topics.length >= 20) break;
    }
  }
  return topics;
}

export default function MaterialsPanel({ courseId, onActivate, activeFileName, onSendMessage }: Props) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fetchingUrl, setFetchingUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<{ id: string; type: 'pdf' | 'text' } | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [topicsOpen, setTopicsOpen] = useState<string | null>(null);

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
    const isPDF = m.mimeType === 'application/pdf' || m.fileName?.toLowerCase().endsWith('.pdf');
    setFetchingUrl(m.id);
    try {
      let url = m.fileUrl;
      if (data.publicId) {
        const params = new URLSearchParams({ publicId: data.publicId || '', fileUrl: m.fileUrl || '' });
        const res = await fetch('/api/material-url?' + params);
        const json = await res.json();
        if (json.url) url = json.url;
      }
      if (url) {
        setViewUrl(url);
        setViewMode({ id: m.id, type: isPDF ? 'pdf' : 'text' });
      }
    } catch { alert('Could not load file. Try again.'); }
    finally { setFetchingUrl(null); }
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
      {/* Inline viewer */}
      {viewMode && viewUrl && (
        <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--navy)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {viewMode.type === 'pdf' ? '📄 PDF Viewer' : '📝 Document Text'}
            </p>
            <button onClick={() => { setViewMode(null); setViewUrl(null); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>✕ Close</button>
          </div>
          {viewMode.type === 'pdf' ? (
            <iframe src={viewUrl} style={{ width: '100%', height: '480px', border: 'none' }} title="Document viewer" />
          ) : (
            <div style={{ padding: '12px', maxHeight: '400px', overflowY: 'auto', fontSize: '0.78rem', color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {materials.find(m => m.id === viewMode.id)?.extractedText || 'No text available.'}
            </div>
          )}
          <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', padding: '6px' }}>
            To download this file, visit the Library
          </p>
        </div>
      )}

      {materials.map(m => {
        const icon = m.category === 'past_questions' ? '📋' : m.category === 'textbook' ? '📖' : '📄';
        const pageInfo = m.pageCount ? ' · ' + m.pageCount + ' pages' : '';
        const wordInfo = (m.wordCount ? m.wordCount.toLocaleString() : '0') + ' words' + pageInfo;
        const isOpen = expanded === m.id;
        const isActive = activeFileName === m.fileName;
        const topics = extractTopics(m.extractedText || '');
        const isTopicsOpen = topicsOpen === m.id;

        return (
          <div key={m.id} style={{
            background: isActive ? 'rgba(196,160,80,0.08)' : 'var(--navy)',
            border: '1px solid ' + (isActive ? 'var(--gold)' : 'var(--border)'),
            borderRadius: '10px', overflow: 'hidden',
          }}>
            {/* Header row */}
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

                {/* Study Topics — expandable */}
                <button
                  onClick={() => {
                    onActivate({ fileName: m.fileName, extractedText: m.extractedText || '' });
                    setTopicsOpen(isTopicsOpen ? null : m.id);
                  }}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: '7px',
                    background: isActive ? 'rgba(196,160,80,0.15)' : 'rgba(196,160,80,0.1)',
                    color: 'var(--gold)',
                    border: '1px solid rgba(196,160,80,0.3)',
                    fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                  <span>📚 Study topics {topics.length > 0 ? '(' + topics.length + ')' : ''}</span>
                  <span style={{ fontSize: '0.65rem' }}>{isTopicsOpen ? '▲' : '▼'}</span>
                </button>

                {/* Topics list */}
                {isTopicsOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '4px' }}>
                    {topics.length === 0 ? (
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 0' }}>
                        No topics detected. Ask the AI directly in chat.
                      </p>
                    ) : topics.map((topic, i) => (
                      <button key={i} onClick={() => {
                        if (onSendMessage) onSendMessage('Explain this topic from the material: "' + topic + '"');
                      }}
                        style={{
                          textAlign: 'left', padding: '6px 10px', borderRadius: '6px',
                          background: 'var(--navy-mid, rgba(255,255,255,0.03))',
                          border: '1px solid var(--border)',
                          color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}>
                        {i + 1}. {topic}
                      </button>
                    ))}
                  </div>
                )}

                {/* View document */}
                <button onClick={() => handleViewFile(m)} disabled={fetchingUrl === m.id} style={{
                  width: '100%', padding: '6px 10px', borderRadius: '7px',
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer',
                }}>
                  {fetchingUrl === m.id ? 'Loading...' : '👁 View document'}
                </button>

                <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '2px', lineHeight: 1.4 }}>
                  View only · To download, visit the Library
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
