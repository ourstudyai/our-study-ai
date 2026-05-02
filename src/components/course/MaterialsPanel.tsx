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
    if (
      trimmed.length > 3 && trimmed.length < 120 &&
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
  const [topicsOpen, setTopicsOpen] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState<string | null>(null);
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

  const getFileUrl = async (m: Material): Promise<string | null> => {
    if (fileUrls[m.id]) return fileUrls[m.id];
    const data = m as any;
    if (data.publicId) {
      setFetchingUrl(m.id);
      try {
        const params = new URLSearchParams({ publicId: data.publicId || '', fileUrl: m.fileUrl || '' });
        const res = await fetch('/api/material-url?' + params);
        const json = await res.json();
        if (json.url) {
          setFileUrls(prev => ({ ...prev, [m.id]: json.url }));
          return json.url;
        }
      } catch { } finally { setFetchingUrl(null); }
    } else if (m.fileUrl) {
      setFileUrls(prev => ({ ...prev, [m.id]: m.fileUrl }));
      return m.fileUrl;
    }
    return null;
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
        const topics = extractTopics(m.extractedText || '');
        const isTopicsOpen = topicsOpen === m.id;
        const isViewOpen = viewOpen === m.id;
        const isPDF = m.mimeType === 'application/pdf' || m.fileName?.toLowerCase().endsWith('.pdf');

        return (
          <div key={m.id} style={{
            background: isActive ? 'rgba(196,160,80,0.06)' : 'var(--navy)',
            border: '1px solid ' + (isActive ? 'var(--gold)' : 'var(--border)'),
            borderRadius: '10px', overflow: 'hidden',
          }}>
            {/* Header */}
            <div onClick={() => setExpanded(isOpen ? null : m.id)}
              style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 600, color: isActive ? 'var(--gold)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fileName}</p>
                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>{wordInfo}</p>
              </div>
              {isActive && <span style={{ fontSize: '0.6rem', color: 'var(--gold)', fontWeight: 700, flexShrink: 0, alignSelf: 'center' }}>ACTIVE</span>}
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>

                {/* Study Topics */}
                <button onClick={() => setTopicsOpen(isTopicsOpen ? null : m.id)}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: '7px',
                    background: 'rgba(196,160,80,0.1)', color: 'var(--gold)',
                    border: '1px solid rgba(196,160,80,0.3)', fontSize: '0.75rem', fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                  <span>📚 Study topics {topics.length > 0 ? '(' + topics.length + ')' : ''}</span>
                  <span style={{ fontSize: '0.65rem' }}>{isTopicsOpen ? '▲' : '▼'}</span>
                </button>

                {isTopicsOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '4px' }}>
                    {/* Activate for chat */}
                    <button onClick={() => onActivate({ fileName: m.fileName, extractedText: m.extractedText || '' })}
                      style={{ textAlign: 'left', padding: '5px 10px', borderRadius: '6px', background: isActive ? 'rgba(196,160,80,0.15)' : 'transparent', border: '1px solid rgba(196,160,80,0.3)', color: 'var(--gold)', fontSize: '0.7rem', cursor: 'pointer', marginBottom: '4px' }}>
                      {isActive ? '✅ Active in chat' : '➕ Activate for chat context'}
                    </button>
                    {topics.length === 0 ? (
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 0' }}>No topics detected. Ask the AI directly in chat.</p>
                    ) : topics.map((topic, i) => (
                      <button key={i} onClick={() => {
                        onActivate({ fileName: m.fileName, extractedText: m.extractedText || '' });
                        if (onSendMessage) onSendMessage('Explain this topic from the material: "' + topic + '"');
                      }}
                        style={{ textAlign: 'left', padding: '6px 10px', borderRadius: '6px', background: 'var(--navy-mid, rgba(255,255,255,0.03))', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer' }}>
                        {i + 1}. {topic}
                      </button>
                    ))}
                  </div>
                )}

                {/* View Document */}
                <button onClick={() => setViewOpen(isViewOpen ? null : m.id)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                  <span>View document</span>
                  <span style={{ fontSize: '0.65rem' }}>{isViewOpen ? '▲' : '▼'}</span>
                </button>

                {isViewOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', paddingLeft: '4px' }}>
                    {/* Extracted text view */}
                    {m.extractedText && (
                      <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', padding: '5px 8px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>📝 Extracted text</p>
                        <div style={{ padding: '8px', maxHeight: '280px', overflowY: 'auto', fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          {m.extractedText.substring(0, 3000)}{m.extractedText.length > 3000 ? '\n\n[...continues — activate for chat to read full text]' : ''}
                        </div>
                      </div>
                    )}
                    {/* Original file */}
                    {isPDF && (
                      <button onClick={async () => {
                        const url = await getFileUrl(m);
                        if (url) window.open(url, '_blank');
                      }} disabled={fetchingUrl === m.id}
                        style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer', textAlign: 'left' }}>
                        {fetchingUrl === m.id ? 'Loading...' : '📄 Open original PDF'}
                      </button>
                    )}
                    {!isPDF && m.fileUrl && (
                      <button onClick={async () => {
                        const url = await getFileUrl(m);
                        if (url) window.open(url, '_blank');
                      }} disabled={fetchingUrl === m.id}
                        style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer', textAlign: 'left' }}>
                        {fetchingUrl === m.id ? 'Loading...' : '📁 Open original file'}
                      </button>
                    )}
                    <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.4 }}>
                      To download, visit the Library
                    </p>
                  </div>
                )}

              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
