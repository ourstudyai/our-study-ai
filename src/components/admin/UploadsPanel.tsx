'use client';

import { useState } from 'react';
import { Material } from '@/lib/firestore/materials';

interface Props {
  uploads: Material[];
  onRefresh: () => void;
  firebaseUser: any;
}

function fileIcon(mimeType?: string) {
  if (!mimeType) return '📎';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.startsWith('image/')) return '🖼';
  return '📎';
}

function isPreviewable(mimeType?: string) {
  if (!mimeType) return false;
  return mimeType === 'application/pdf' || mimeType.startsWith('image/');
}

export default function UploadsPanel({ uploads, onRefresh, firebaseUser }: Props) {
  const [previewMaterial, setPreviewMaterial] = useState<Material | null>(null);
  const [ocrLoading, setOcrLoading] = useState<string | null>(null);

  async function triggerOcr(materialId: string) {
    setOcrLoading(materialId);
    try {
      const idToken = await firebaseUser?.getIdToken(true);
      const res = await fetch('/api/admin/trigger-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ materialId }),
      });
      const d = await res.json();
      if (res.ok) {
        setPreviewMaterial(null);
        onRefresh();
      } else {
        alert('Failed to queue OCR: ' + (d.error || res.status));
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setOcrLoading(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Preview overlay */}
      {previewMaterial && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(5,10,24,0.97)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            background: 'var(--navy)',
          }}>
            <button
              onClick={() => setPreviewMaterial(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}
            >✕</button>
            <p style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fileIcon(previewMaterial.mimeType)} {previewMaterial.fileName}
            </p>
            <button
              onClick={() => triggerOcr(previewMaterial.id!)}
              disabled={ocrLoading === previewMaterial.id}
              style={{
                background: 'var(--gold)', color: '#0a0f1e', border: 'none',
                borderRadius: 8, padding: '7px 16px', fontSize: '0.8rem',
                fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                opacity: ocrLoading === previewMaterial.id ? 0.6 : 1,
              }}
            >
              {ocrLoading === previewMaterial.id ? 'Queuing…' : 'Send to OCR →'}
            </button>
          </div>
          {/* Preview body */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {previewMaterial.mimeType === 'application/pdf' ? (
              <iframe
                src={previewMaterial.fileUrl}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title={previewMaterial.fileName}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 16 }}>
                <img
                  src={previewMaterial.fileUrl}
                  alt={previewMaterial.fileName}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {uploads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>📥</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No uploads waiting for review.</p>
        </div>
      ) : uploads.map(m => (
        <div key={m.id} style={{
          background: 'var(--navy-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: '1.4rem', lineHeight: 1, marginTop: 2 }}>{fileIcon(m.mimeType)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                {m.fileName}
              </p>
              <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 3 }}>{m.uploaderEmail}</p>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const, marginBottom: 3 }}>
                {m.category && (
                  <span style={{ fontSize: '0.62rem', background: 'rgba(196,160,80,0.08)', color: 'var(--gold)', borderRadius: 99, padding: '1px 7px' }}>
                    {m.category.replace('_', ' ')}
                  </span>
                )}
                {m.suggestedCourseName && (
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>📖 {m.suggestedCourseName}</span>
                )}
              </div>
              <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                {m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' as const }}>
            {isPreviewable(m.mimeType) && (
              <button
                onClick={() => setPreviewMaterial(m)}
                style={{
                  background: 'rgba(196,160,80,0.08)', border: '1px solid rgba(196,160,80,0.2)',
                  color: 'var(--gold)', borderRadius: 7, padding: '5px 12px',
                  fontSize: '0.75rem', cursor: 'pointer',
                }}
              >
                👁 Preview
              </button>
            )}
            <a
              href={m.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', borderRadius: 7, padding: '5px 12px',
                fontSize: '0.75rem', textDecoration: 'none', display: 'inline-block',
              }}
            >
              ↗ Open
            </a>
            <button
              onClick={() => triggerOcr(m.id!)}
              disabled={ocrLoading === m.id}
              style={{
                background: 'var(--gold)', border: 'none',
                color: '#0a0f1e', borderRadius: 7, padding: '5px 12px',
                fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                opacity: ocrLoading === m.id ? 0.6 : 1,
                marginLeft: 'auto',
              }}
            >
              {ocrLoading === m.id ? 'Queuing…' : 'Send to OCR'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
