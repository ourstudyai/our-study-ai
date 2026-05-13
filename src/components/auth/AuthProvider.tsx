// Auth Context Provider — Wraps the entire app
'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onIdTokenChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { UserProfile } from '@/lib/types';
import { getUserProfile } from '@/lib/firestore/users';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface AuthContextType {
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  userProfile: null,
  loading: true,
  refreshProfile: async () => {},
});

async function fetchProfileWithRetry(uid: string, attempts = 3): Promise<UserProfile | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const profile = await Promise.race([
        getUserProfile(uid),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 8000)),
      ]);
      if (profile !== null) return profile;
      // null means timeout — wait briefly before retry
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.warn('[AuthProvider] profile fetch attempt', i + 1, 'failed:', e);
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (firebaseUser) {
      const profile = await fetchProfileWithRetry(firebaseUser.uid);
      if (profile) setUserProfile(profile);
    }
  };

  useEffect(() => {
    const safetyTimer = setTimeout(() => setLoading(false), 12000);

    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        try {
          // Refresh session cookie — retry up to 3 times on failure
          const refreshSession = async (retries = 3) => {
            for (let i = 0; i < retries; i++) {
              try {
                const idToken = await user.getIdToken();
                const res = await fetch('/api/auth/session', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ idToken }),
                });
                if (res.ok) return;
              } catch (e) {
                console.warn('[AuthProvider] session refresh attempt', i + 1, 'failed:', e);
              }
              if (i < retries - 1) await new Promise(r => setTimeout(r, 1500));
            }
          };
          refreshSession();

          const profile = await fetchProfileWithRetry(user.uid);
          setUserProfile(profile);

          // Register FCM token for admins
          if (profile?.role === 'admin' || profile?.role === 'chief_admin') {
            try {
              const { requestNotificationPermission } = await import('@/lib/firebase/messaging');
              const token = await requestNotificationPermission();
              if (token) {
                await updateDoc(doc(db, 'users', user.uid), { fcmToken: token });
              }
            } catch (e) {
              console.warn('[AuthProvider] FCM registration failed:', e);
            }
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }

      clearTimeout(safetyTimer);
      setLoading(false);
    });

    return () => { unsubscribe(); clearTimeout(safetyTimer); };
  }, []);

  return (
    <AuthContext.Provider value={{ firebaseUser, userProfile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

export default AuthContext;
