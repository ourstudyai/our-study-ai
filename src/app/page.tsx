'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';

export default function RootPage() {
  const { firebaseUser, userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.replace('/login');
    } else if (!userProfile?.onboardingComplete) {
      router.replace('/onboarding');
    } else {
      router.replace('/dashboard');
    }
  }, [firebaseUser, userProfile, loading, router]);

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

      {/* Deep ambient glow — warm, not harsh */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px', height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, var(--gold-glow) 0%, transparent 68%)',
        animation: 'lux-ambient 5s ease-in-out infinite',
        pointerEvents: 'none',
        opacity: 0.8,
      }} />

      {/* Secondary warm glow — offset bottom */}
      <div style={{
        position: 'absolute',
        bottom: '10%', left: '30%',
        width: '300px', height: '300px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, var(--gold-glow) 0%, transparent 70%)',
        pointerEvents: 'none',
        opacity: 0.4,
        animation: 'lux-ambient 7s ease-in-out infinite reverse',
      }} />

      {/* Manuscript card */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        maxWidth: '320px',
        margin: '0 20px',
        padding: '44px 32px 36px',
        background: 'var(--navy-card)',
        border: '1px solid var(--border)',
        borderRadius: '24px',
        boxShadow: '0 0 0 1px var(--border), 0 24px 64px rgba(0,0,0,0.45), 0 0 48px var(--gold-glow)',
        animation: 'lux-rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
      }}>

        {/* Corner ornaments */}
        <div style={{ position: 'absolute', top: '14px', left: '18px', color: 'var(--gold)', opacity: 0.18, fontSize: '0.7rem', lineHeight: 1 }}>✦</div>
        <div style={{ position: 'absolute', top: '14px', right: '18px', color: 'var(--gold)', opacity: 0.18, fontSize: '0.7rem', lineHeight: 1 }}>✦</div>
        <div style={{ position: 'absolute', bottom: '14px', left: '18px', color: 'var(--gold)', opacity: 0.18, fontSize: '0.7rem', lineHeight: 1 }}>✦</div>
        <div style={{ position: 'absolute', bottom: '14px', right: '18px', color: 'var(--gold)', opacity: 0.18, fontSize: '0.7rem', lineHeight: 1 }}>✦</div>

        {/* Logo */}
        <div style={{
          marginBottom: '24px',
          animation: 'lux-rise 1s cubic-bezier(0.22, 1, 0.36, 1) both',
          animationDelay: '80ms',
        }}>
          <img
            src="/icons/icon-192.png"
            alt="Lux Studiorum"
            style={{
              width: '80px',
              height: '80px',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 16px var(--gold-glow))',
              animation: 'lux-logo-glow 3.5s ease-in-out infinite',
              animationDelay: '1s',
              display: 'block',
            }}
          />
        </div>

        {/* Wordmark with flanking rules */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          width: '100%',
          justifyContent: 'center',
          animation: 'lux-rise 1s cubic-bezier(0.22, 1, 0.36, 1) both',
          animationDelay: '200ms',
          marginBottom: '8px',
        }}>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, var(--gold))', opacity: 0.3 }} />
          <h1 style={{
            fontFamily: 'Playfair Display, Georgia, serif',
            fontSize: '1.15rem',
            fontWeight: 700,
            color: 'var(--gold)',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            margin: 0,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}>
            Lux Studiorum
          </h1>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, var(--gold))', opacity: 0.3 }} />
        </div>

        {/* Latin tagline */}
        <p style={{
          fontFamily: 'IM Fell English, Georgia, serif',
          fontStyle: 'italic',
          fontSize: '0.72rem',
          color: 'var(--gold)',
          opacity: 0.5,
          letterSpacing: '0.12em',
          margin: '0 0 24px',
          animation: 'lux-rise 1s cubic-bezier(0.22, 1, 0.36, 1) both',
          animationDelay: '300ms',
        }}>
          Lux in Tenebris Lucet
        </p>

        {/* Ornament divider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '80%',
          marginBottom: '20px',
          animation: 'lux-rise 1s cubic-bezier(0.22, 1, 0.36, 1) both',
          animationDelay: '380ms',
        }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          <span style={{ color: 'var(--gold)', opacity: 0.3, fontSize: '0.55rem' }}>✦</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        </div>

        {/* English tagline */}
        <p style={{
          fontFamily: 'Lora, Georgia, serif',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          letterSpacing: '0.04em',
          margin: '0 0 28px',
          opacity: 0.75,
          textAlign: 'center',
          lineHeight: 1.65,
          animation: 'lux-rise 1s cubic-bezier(0.22, 1, 0.36, 1) both',
          animationDelay: '460ms',
        }}>
          Your study companion for seminary life
        </p>

        {/* Discrete spinner row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'lux-rise 1s cubic-bezier(0.22, 1, 0.36, 1) both',
          animationDelay: '560ms',
        }}>
          <div style={{ position: 'relative', width: '28px', height: '28px', flexShrink: 0 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '1.5px solid transparent',
              borderTopColor: 'var(--gold)', borderRightColor: 'var(--gold)',
              animation: 'lux-spin 1.4s linear infinite', opacity: 0.5,
            }} />
            <div style={{
              position: 'absolute', inset: '6px', borderRadius: '50%',
              border: '1px solid transparent',
              borderBottomColor: 'var(--gold)', borderLeftColor: 'var(--gold)',
              animation: 'lux-spin 0.9s linear infinite reverse', opacity: 0.3,
            }} />
          </div>
          <p style={{
            fontFamily: 'DM Sans, sans-serif',
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            margin: 0,
            opacity: 0.5,
            animation: 'lux-breathe 2.5s ease-in-out infinite',
          }}>
            Preparing your study space
          </p>
        </div>

      </div>

      {/* Footer */}
      <p style={{
        position: 'absolute',
        bottom: '20px',
        fontFamily: 'DM Sans, sans-serif',
        fontSize: '0.6rem',
        color: 'var(--text-muted)',
        opacity: 0.3,
        letterSpacing: '0.08em',
        margin: 0,
        animation: 'lux-rise 1s cubic-bezier(0.22, 1, 0.36, 1) both',
        animationDelay: '800ms',
      }}>
        © {new Date().getFullYear()} Lux Studiorum
      </p>

      <style>{`
        @keyframes lux-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes lux-rise {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes lux-ambient {
          0%,100% { opacity: 0.6; transform: translate(-50%,-50%) scale(1); }
          50%      { opacity: 1;   transform: translate(-50%,-50%) scale(1.14); }
        }
        @keyframes lux-logo-glow {
          0%,100% { filter: drop-shadow(0 0 8px var(--gold-glow)); }
          50%      { filter: drop-shadow(0 0 24px var(--gold-dim)); }
        }
        @keyframes lux-breathe {
          0%,100% { opacity: 0.4; }
          50%      { opacity: 0.75; }
        }
      `}</style>
    </div>
  );
}
