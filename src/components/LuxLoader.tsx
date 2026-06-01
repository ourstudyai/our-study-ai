'use client';

export default function LuxLoader({ label }: { label?: string }) {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--navy)',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Ambient glow */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '480px', height: '480px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, var(--gold-glow) 0%, transparent 68%)',
        animation: 'luxl-ambient 5s ease-in-out infinite',
        pointerEvents: 'none',
        opacity: 0.7,
      }} />

      {/* Card */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '36px 28px 28px',
        background: 'var(--navy-card)',
        border: '1px solid var(--border)',
        borderRadius: '20px',
        boxShadow: '0 0 0 1px var(--border), 0 20px 48px rgba(0,0,0,0.4), 0 0 36px var(--gold-glow)',
        minWidth: '220px',
        animation: 'luxl-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
      }}>

        {/* Corner ornaments */}
        <div style={{ position: 'absolute', top: '12px', left: '14px', color: 'var(--gold)', opacity: 0.15, fontSize: '0.6rem' }}>✦</div>
        <div style={{ position: 'absolute', top: '12px', right: '14px', color: 'var(--gold)', opacity: 0.15, fontSize: '0.6rem' }}>✦</div>

        {/* Logo */}
        <img
          src="/icons/icon-192.png"
          alt="Lux Studiorum"
          style={{
            width: '52px',
            height: '52px',
            objectFit: 'contain',
            marginBottom: '16px',
            animation: 'luxl-glow 3s ease-in-out infinite',
          }}
        />

        {/* Wordmark */}
        <p style={{
          fontFamily: 'Playfair Display, Georgia, serif',
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--gold)',
          margin: '0 0 4px',
          animation: 'luxl-breathe 2.5s ease-in-out infinite',
        }}>
          Lux Studiorum
        </p>

        {/* Latin */}
        <p style={{
          fontFamily: 'IM Fell English, Georgia, serif',
          fontStyle: 'italic',
          fontSize: '0.62rem',
          color: 'var(--gold)',
          opacity: 0.4,
          letterSpacing: '0.1em',
          margin: '0 0 20px',
        }}>
          Lux in Tenebris Lucet
        </p>

        {/* Spinner */}
        <div style={{ position: 'relative', width: '32px', height: '32px', marginBottom: label ? '14px' : '0' }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '1.5px solid transparent',
            borderTopColor: 'var(--gold)', borderRightColor: 'var(--gold)',
            animation: 'luxl-spin 1.3s linear infinite', opacity: 0.55,
          }} />
          <div style={{
            position: 'absolute', inset: '7px', borderRadius: '50%',
            border: '1px solid transparent',
            borderBottomColor: 'var(--gold)', borderLeftColor: 'var(--gold)',
            animation: 'luxl-spin 0.85s linear infinite reverse', opacity: 0.35,
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="10" height="10" viewBox="0 0 18 18" fill="none">
              <rect x="8" y="1" width="2" height="16" rx="1" fill="var(--gold)" opacity="0.8"/>
              <rect x="1" y="8" width="16" height="2" rx="1" fill="var(--gold)" opacity="0.8"/>
            </svg>
          </div>
        </div>

        {/* Label */}
        {label && (
          <p style={{
            fontFamily: 'DM Sans, sans-serif',
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            margin: 0,
            opacity: 0.5,
            animation: 'luxl-breathe 2s ease-in-out infinite',
          }}>
            {label}
          </p>
        )}
      </div>

      <style>{`
        @keyframes luxl-spin    { to { transform: rotate(360deg); } }
        @keyframes luxl-rise    { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes luxl-ambient { 0%,100%{opacity:0.5;transform:translate(-50%,-50%) scale(1)} 50%{opacity:0.9;transform:translate(-50%,-50%) scale(1.12)} }
        @keyframes luxl-glow    { 0%,100%{filter:drop-shadow(0 0 6px var(--gold-glow));opacity:0.85} 50%{filter:drop-shadow(0 0 18px var(--gold-dim));opacity:1} }
        @keyframes luxl-breathe { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
      `}</style>
    </div>
  );
}
