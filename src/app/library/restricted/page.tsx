'use client';

export default function LibraryRestrictedPage() {
  return (
    <>
      <meta name="robots" content="noindex" />
      <div style={{
        minHeight: '100dvh',
        background: 'var(--navy)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '380px' }}>
          <h1 style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: '1.8rem',
            fontWeight: 700,
            color: 'var(--gold)',
            marginBottom: '12px',
          }}>
            Access Restricted
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            This page is available to authorised members only.
          </p>
        </div>
      </div>
    </>
  );
}
