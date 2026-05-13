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

      {/* Ambient radial glow behind everything */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '520px',
        height: '520px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, var(--gold-glow) 0%, transparent 70%)',
        animation: 'lux-ambient 4s ease-in-out infinite',
        pointerEvents: 'none',
      }} />

      {/* Content stack */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0',
        zIndex: 1,
      }}>

        {/* Logo */}
        <div style={{
          animation: 'lux-rise 1s cubic-bezier(0.22, 1, 0.36, 1) both',
          animationDelay: '0ms',
          marginBottom: '28px',
        }}>
          <img
            src="https://i.imgur.com/MPk1vBA.png"
            alt="Lux Studiorum"
            style={{
              width: '88px',
              height: '88px',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 18px var(--gold-glow))',
              animation: 'lux-logo-glow 3s ease-in-out infinite',
              animationDelay: '1.2s',
            }}
          />
        </div>

        {/* Spinner rings — same as LuxLoader but tighter here */}
        <div style={{
          position: 'relative',
          width: '52px',
          height: '52px',
          animation: 'lux-rise 1s cubic-bezier(0.22, 1, 0.36, 1) both',
          animationDelay: '200ms',
          marginBottom: '36px',
        }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '1.5px solid transparent',
            borderTopColor: 'var(--gold)', borderRightColor: 'var(--gold)',
            animation: 'lux-spin 1.4s linear infinite', opacity: 0.55,
          }} />
          <div style={{
            position: 'absolute', inset: '9px', borderRadius: '50%',
            border: '1px solid transparent',
            borderBottomColor: 'var(--gold)', borderLeftColor: 'var(--gold)',
            animation: 'lux-spin 0.9s linear infinite reverse', opacity: 0.35,
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'lux-pulse 2s ease-in-out infinite',
          }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <rect x="8" y="1" width="2" height="16" rx="1" fill="var(--gold)" opacity="0.85"/>
              <rect x="1" y="8" width="16" height="2" rx="1" fill="var(--gold)" opacity="0.85"/>
            </svg>
          </div>
        </div>

        {/* Wordmark */}
        <h1 style={{
          fontFamily: 'Playfair Display, Georgia, serif',
          fontSize: '2rem',
          fontWeight: 700,
          color: 'var(--gold)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          margin: 0,
          lineHeight: 1,
          animation: 'lux-rise 1s cubic-bezier(0.22, 1, 0.36, 1) both',
          animationDelay: '350ms',
        }}>
          Lux Studiorum
        </h1>

        {/* Latin subtitle */}
        <p style={{
          fontFamily: 'IM Fell English, Georgia, serif',
          fontSize: '0.78rem',
          fontStyle: 'italic',
          color: 'var(--gold)',
          opacity: 0.45,
          letterSpacing: '0.12em',
          margin: '10px 0 0',
          animation: 'lux-rise 1s cubic-bezier(0.22, 1, 0.36, 1) both',
          animationDelay: '520ms',
        }}>
          Lux in Tenebris Lucet
        </p>

        {/* Divider */}
        <div style={{
          width: '48px',
          height: '1px',
          background: 'linear-gradient(to right, transparent, var(--gold), transparent)',
          opacity: 0.3,
          margin: '18px 0',
          animation: 'lux-rise 1s cubic-bezier(0.22, 1, 0.36, 1) both',
          animationDelay: '650ms',
        }} />

        {/* Tagline */}
        <p style={{
          fontFamily: 'Lora, Georgia, serif',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.06em',
          margin: 0,
          opacity: 0.7,
          textAlign: 'center',
          animation: 'lux-rise 1s cubic-bezier(0.22, 1, 0.36, 1) both',
          animationDelay: '750ms',
        }}>
          Your study companion for seminary life
        </p>

      </div>

      <style>{`
        @keyframes lux-spin   { to { transform: rotate(360deg); } }
        @keyframes lux-pulse  { 0%,100%{opacity:0.65;transform:scale(1)} 50%{opacity:1;transform:scale(1.1)} }
        @keyframes lux-rise   { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes lux-ambient {
          0%,100% { opacity: 0.6; transform: translate(-50%,-50%) scale(1); }
          50%      { opacity: 1;   transform: translate(-50%,-50%) scale(1.12); }
        }
        @keyframes lux-logo-glow {
          0%,100% { filter: drop-shadow(0 0 10px var(--gold-glow)); }
          50%      { filter: drop-shadow(0 0 28px var(--gold-dim)); }
        }
      `}</style>
    </div>
  );
}
