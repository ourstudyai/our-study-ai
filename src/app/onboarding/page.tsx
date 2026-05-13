// Onboarding Page — Department, Year & Semester Selection
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { completeOnboarding } from '@/lib/firestore/users';
import { Department } from '@/lib/types';

const departments: { id: Department; name: string; description: string }[] = [
  {
    id: 'philosophy',
    name: 'Philosophy',
    description: 'Logic · Metaphysics · Ethics · Ancient & Modern Philosophy',
  },
  {
    id: 'theology',
    name: 'Theology',
    description: 'Systematic · Moral · Liturgical · Biblical Theology',
  },
];

const years = [1, 2, 3, 4];
const semesters = [1, 2];

type Step = 'department' | 'year' | 'semester';

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('department');
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { firebaseUser, userProfile, loading, refreshProfile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) { router.replace('/login'); return; }
    if (userProfile?.onboardingComplete) { router.replace('/dashboard'); return; }
  }, [firebaseUser, userProfile, loading, router]);

  const handleDeptSelect = (dept: Department) => {
    setSelectedDept(dept);
    setStep('year');
  };

  const handleYearSelect = (year: number) => {
    setSelectedYear(year);
    setStep('semester');
  };

  const handleSemesterSelect = async (semester: number) => {
    if (!firebaseUser || !selectedDept || !selectedYear) return;
    setSelectedSemester(semester);
    setIsSubmitting(true);
    try {
      await completeOnboarding(firebaseUser.uid, selectedDept, selectedYear, semester);
      await refreshProfile();
      router.replace('/dashboard');
    } catch (error) {
      console.error('Onboarding error:', error);
      setIsSubmitting(false);
    }
  };

  const stepIndex = step === 'department' ? 0 : step === 'year' ? 1 : 2;
  const stepLabels = ['Department', 'Year', 'Semester'];

  if (loading || !firebaseUser) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <img src="https://i.imgur.com/MPk1vBA.png" alt="" style={{ width: '48px', height: '48px', objectFit: 'contain', opacity: 0.7, animation: 'lux-breathe 2s ease-in-out infinite' }} />
          <style>{`@keyframes lux-breathe { 0%,100%{opacity:0.4} 50%{opacity:0.9} }`}</style>
        </div>
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
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '480px', height: '480px', borderRadius: '50%',
        background: 'radial-gradient(circle, var(--gold-glow) 0%, transparent 65%)',
        pointerEvents: 'none', opacity: 0.7,
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '480px' }}>

        {/* Logo + wordmark */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <img
            src="https://i.imgur.com/MPk1vBA.png"
            alt="Lux Studiorum"
            style={{ width: '64px', height: '64px', objectFit: 'contain', marginBottom: '14px', filter: 'drop-shadow(0 0 12px var(--gold-glow))' }}
          />
          <h1 style={{
            fontFamily: 'Playfair Display, Georgia, serif',
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--gold)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            margin: '0 0 6px',
          }}>
            Lux Studiorum
          </h1>
          <p style={{
            fontFamily: 'IM Fell English, Georgia, serif',
            fontStyle: 'italic',
            fontSize: '0.75rem',
            color: 'var(--gold)',
            opacity: 0.45,
            letterSpacing: '0.1em',
            margin: '0 0 20px',
          }}>
            Lux in Tenebris Lucet
          </p>

          {/* Welcome line */}
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Welcome, <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{firebaseUser.displayName?.split(' ')[0]}</span>
          </p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
            {step === 'department' && 'Which department are you enrolled in?'}
            {step === 'year' && 'Which year are you in?'}
            {step === 'semester' && 'Which semester are you currently in?'}
          </p>

          {/* Step dots */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {stepLabels.map((label, i) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={{
                  width: i <= stepIndex ? '28px' : '20px',
                  height: '3px',
                  borderRadius: '99px',
                  background: i <= stepIndex ? 'var(--gold)' : 'var(--border)',
                  transition: 'all 0.3s ease',
                  opacity: i === stepIndex ? 1 : i < stepIndex ? 0.6 : 0.3,
                }} />
                <span style={{ fontSize: '0.55rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: i === stepIndex ? 'var(--gold)' : 'var(--text-muted)', opacity: i === stepIndex ? 0.8 : 0.4 }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Step: Department ── */}
        {step === 'department' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {departments.map((dept) => (
              <button
                key={dept.id}
                onClick={() => handleDeptSelect(dept.id)}
                style={{
                  width: '100%',
                  padding: '20px 24px',
                  background: 'var(--navy-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 0.2s, background 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(196,160,80,0.4)';
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--navy-hover)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--navy-card)';
                }}
              >
                <div>
                  <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.05rem', fontWeight: 700, color: 'var(--gold)', margin: '0 0 4px' }}>
                    {dept.name}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                    {dept.description}
                  </p>
                </div>
                <span style={{ color: 'var(--gold)', opacity: 0.5, fontSize: '1.1rem', flexShrink: 0 }}>›</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Step: Year ── */}
        {step === 'year' && (
          <>
            <button onClick={() => setStep('department')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', marginBottom: '16px', padding: '0', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ← Back
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {years.map((yr) => (
                <button
                  key={yr}
                  onClick={() => handleYearSelect(yr)}
                  style={{
                    padding: '24px 16px',
                    background: 'var(--navy-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '14px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(196,160,80,0.4)';
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--navy-hover)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--navy-card)';
                  }}
                >
                  <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '2rem', fontWeight: 700, color: 'var(--gold)', margin: '0 0 4px', lineHeight: 1 }}>{yr}</p>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {yr === 1 ? 'First' : yr === 2 ? 'Second' : yr === 3 ? 'Third' : 'Fourth'} Year
                  </p>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Step: Semester ── */}
        {step === 'semester' && (
          <>
            <button onClick={() => setStep('year')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', marginBottom: '16px', padding: '0', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ← Back
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {semesters.map((sem) => (
                <button
                  key={sem}
                  onClick={() => handleSemesterSelect(sem)}
                  disabled={isSubmitting}
                  style={{
                    padding: '32px 16px',
                    background: 'var(--navy-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '14px',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    textAlign: 'center',
                    opacity: isSubmitting && selectedSemester !== sem ? 0.5 : 1,
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                  onMouseEnter={e => {
                    if (!isSubmitting) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(196,160,80,0.4)';
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--navy-hover)';
                    }
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--navy-card)';
                  }}
                >
                  {isSubmitting && selectedSemester === sem ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '48px' }}>
                      <div style={{ width: '20px', height: '20px', border: '2px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'lux-spin 0.8s linear infinite' }} />
                    </div>
                  ) : (
                    <>
                      <p style={{ fontFamily: 'Playfair Display, serif', fontSize: '2rem', fontWeight: 700, color: 'var(--gold)', margin: '0 0 4px', lineHeight: 1 }}>{sem}</p>
                      <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        {sem === 1 ? 'First' : 'Second'} Semester
                      </p>
                    </>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

      </div>

      <style>{`
        @keyframes lux-breathe { 0%,100%{opacity:0.4} 50%{opacity:0.9} }
        @keyframes lux-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
