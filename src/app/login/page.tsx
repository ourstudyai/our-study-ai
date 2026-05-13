// Login Page
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { signInWithGoogle } from '@/lib/firebase/auth';
import { getOrCreateUserProfile } from '@/lib/firestore/users';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { firebaseUser, userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (firebaseUser && userProfile?.onboardingComplete) {
      router.replace('/dashboard');
    } else if (firebaseUser && !userProfile?.onboardingComplete) {
      router.replace('/onboarding');
    }
  }, [firebaseUser, userProfile, loading, router]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await signInWithGoogle();
      await getOrCreateUserProfile(user.uid, user.email || '', user.displayName || '', user.photoURL || undefined);
    } catch (err: any) {
      console.error('Sign-in error:', err);
      setError(err.message || 'Failed to sign in. Please try again.');
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
        <img src="https://i.imgur.com/MPk1vBA.png" alt="" style={{ width: '48px', height: '48px', objectFit: 'contain', opacity: 0.6, animation: 'lux-breathe 2s ease-in-out infinite' }} />
        <style>{`@keyframes lux-breathe { 0%,100%{opacity:0.3} 50%{opacity:0.8} }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--navy)',
      padding: '24px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '40%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, var(--gold-glow) 0%, transparent 65%)',
        pointerEvents: 'none',
        animation: 'lux-ambient 5s ease-in-out infinite',
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '400px' }}>

        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            animation: 'lux-rise 0.8s cubic-bezier(0.22,1,0.36,1) both',
            marginBottom: '20px',
          }}>
            <img
              src="https://i.imgur.com/MPk1vBA.png"
              alt="Lux Studiorum"
              style={{
                width: '96px',
                height: '96px',
                objectFit: 'contain',
                filter: 'drop-shadow(0 0 20px var(--gold-glow))',
                animation: 'lux-logo-glow 3s ease-in-out infinite',
                animationDelay: '0.8s',
              }}
            />
          </div>

          <h1 style={{
            fontFamily: 'Playfair Display, Georgia, serif',
            fontSize: '1.9rem',
            fontWeight: 700,
            color: 'var(--gold)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            margin: '0 0 8px',
            animation: 'lux-rise 0.8s cubic-bezier(0.22,1,0.36,1) both',
            animationDelay: '150ms',
          }}>
            Lux Studiorum
          </h1>

          <p style={{
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            margin: '0 0 10px',
            letterSpacing: '0.03em',
            animation: 'lux-rise 0.8s cubic-bezier(0.22,1,0.36,1) both',
            animationDelay: '260ms',
          }}>
            Your study companion for seminary life
          </p>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            animation: 'lux-rise 0.8s cubic-bezier(0.22,1,0.36,1) both',
            animationDelay: '360ms',
          }}>
            <div style={{ width: '28px', height: '1px', background: 'var(--gold)', opacity: 0.35 }} />
            <span style={{
              fontFamily: 'IM Fell English, Georgia, serif',
              fontStyle: 'italic',
              fontSize: '0.72rem',
              letterSpacing: '0.14em',
              color: 'var(--gold)',
              opacity: 0.5,
            }}>
              Lux in Tenebris Lucet
            </span>
            <div style={{ width: '28px', height: '1px', background: 'var(--gold)', opacity: 0.35 }} />
          </div>
        </div>

        {/* Sign-in card */}
        <div style={{
          background: 'var(--navy-card)',
          border: '1px solid var(--border)',
          borderRadius: '18px',
          padding: '28px 24px',
          animation: 'lux-rise 0.8s cubic-bezier(0.22,1,0.36,1) both',
          animationDelay: '450ms',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>
          <h2 style={{
            fontFamily: 'Playfair Display, Georgia, serif',
            fontSize: '1.15rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: '0 0 6px',
          }}>
            Welcome Back
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6 }}>
            Sign in with your seminary Google account to continue
          </p>

          {error && (
            <div style={{ marginBottom: '16px', padding: '12px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px' }}>
              <p style={{ fontSize: '0.78rem', color: '#fca5a5', margin: 0 }}>{error}</p>
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              padding: '14px 20px',
              background: isLoading ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
              transition: 'background 0.2s, border-color 0.2s',
            }}
            onMouseEnter={e => { if (!isLoading) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(196,160,80,0.35)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
          >
            {isLoading ? (
              <>
                <div style={{ width: '18px', height: '18px', border: '2px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'lux-spin 0.8s linear infinite', flexShrink: 0 }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Signing in…</span>
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 500 }}>Continue with Google</span>
              </>
            )}
          </button>

          <p style={{ marginTop: '18px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.7, opacity: 0.7 }}>
            Your study data is private and secure.<br />
            AI does not train on your conversations.
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '24px', opacity: 0.45, letterSpacing: '0.04em' }}>
          © {new Date().getFullYear()} Lux Studiorum · A Catholic seminary learning tool
        </p>
      </div>

      <style>{`
        @keyframes lux-rise     { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes lux-spin     { to { transform: rotate(360deg); } }
        @keyframes lux-ambient  { 0%,100%{opacity:0.6;transform:translate(-50%,-50%) scale(1)} 50%{opacity:1;transform:translate(-50%,-50%) scale(1.1)} }
        @keyframes lux-logo-glow { 0%,100%{filter:drop-shadow(0 0 10px var(--gold-glow))} 50%{filter:drop-shadow(0 0 24px var(--gold-dim))} }
      `}</style>
    </div>
  );
}
