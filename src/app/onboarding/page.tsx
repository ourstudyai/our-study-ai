// Onboarding Page — Department & Year Selection
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { completeOnboarding } from '@/lib/firestore/users';
import { Department } from '@/lib/types';

const departments: { id: Department; name: string; icon: string; description: string; color: string }[] = [
  {
    id: 'philosophy',
    name: 'Philosophy',
    icon: '🏛️',
    description: 'Logic, Metaphysics, Ethics, Ancient & Modern Philosophy',
    color: '#7c6cf0',
  },
  {
    id: 'theology',
    name: 'Theology',
    icon: '✝️',
    description: 'Systematic, Moral, Liturgical, Biblical Theology',
    color: '#c9a84c',
  },
];

const years = [
  { value: 1, label: 'Year 1', subtitle: 'First Year' },
  { value: 2, label: 'Year 2', subtitle: 'Second Year' },
  { value: 3, label: 'Year 3', subtitle: 'Third Year' },
  { value: 4, label: 'Year 4', subtitle: 'Fourth Year' },
];

export default function OnboardingPage() {
  const [step, setStep] = useState<'department' | 'year'>('department');
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { firebaseUser, userProfile, loading, refreshProfile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.replace('/login');
    } else if (userProfile?.onboardingComplete) {
      router.replace('/dashboard');
    }
  }, [firebaseUser, userProfile, loading, router]);

  const handleDeptSelect = (dept: Department) => {
    setSelectedDept(dept);
    setStep('year');
  };

  const handleYearSelect = async (year: number) => {
    if (!firebaseUser || !selectedDept) return;

    setSelectedYear(year);
    setIsSubmitting(true);

    try {
      await completeOnboarding(firebaseUser.uid, selectedDept, year);
      await refreshProfile();
      router.replace('/dashboard');
    } catch (error) {
      console.error('Onboarding error:', error);
      setIsSubmitting(false);
    }
  };

  if (loading || !firebaseUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-primary)' }}>
        <div className="pulse-dot" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'var(--color-bg-primary)' }}>

      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 -right-20 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, rgba(124, 108, 240, 0.4), transparent 70%)' }} />
      </div>

      <div className="relative z-10 w-full max-w-lg animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-sm mb-3" style={{ color: 'var(--color-gold)' }}>
            Welcome, {firebaseUser.displayName}
          </p>
          <h1 className="text-2xl font-bold font-display mb-2">
            {step === 'department' ? 'Select Your Department' : 'Select Your Year'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {step === 'department'
              ? 'Choose the department you are enrolled in'
              : `${departments.find((d) => d.id === selectedDept)?.name} Department`}
          </p>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className="w-8 h-1 rounded-full"
              style={{ background: 'var(--color-accent)' }} />
            <div className="w-8 h-1 rounded-full"
              style={{ background: step === 'year' ? 'var(--color-accent)' : 'var(--color-border)' }} />
          </div>
        </div>

        {step === 'department' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {departments.map((dept) => (
              <button
                key={dept.id}
                onClick={() => handleDeptSelect(dept.id)}
                className="glass-card p-6 text-left transition-all duration-300 hover:scale-[1.02] group"
                id={`dept-${dept.id}`}
              >
                <div className="text-4xl mb-4">{dept.icon}</div>
                <h3 className="text-lg font-semibold mb-1 group-hover:text-white transition-colors"
                  style={{ color: dept.color }}>
                  {dept.name}
                </h3>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {dept.description}
                </p>
              </button>
            ))}
          </div>
        )}

        {step === 'year' && (
          <>
            <button
              onClick={() => setStep('department')}
              className="btn-ghost mb-4 text-sm flex items-center gap-1"
            >
              ← Back to departments
            </button>

            <div className="grid grid-cols-2 gap-4">
              {years.map((yr) => (
                <button
                  key={yr.value}
                  onClick={() => handleYearSelect(yr.value)}
                  disabled={isSubmitting}
                  className="glass-card p-6 text-center transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                  id={`year-${yr.value}`}
                >
                  <div className="text-3xl font-bold font-display mb-1"
                    style={{ color: selectedYear === yr.value ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>
                    {yr.value}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {yr.subtitle}
                  </p>
                  {isSubmitting && selectedYear === yr.value && (
                    <div className="mt-3 flex justify-center">
                      <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                        style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
