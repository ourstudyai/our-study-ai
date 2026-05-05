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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (firebaseUser) {
      const profile = await getUserProfile(firebaseUser.uid);
      setUserProfile(profile);
    }
  };

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        try {
          const idToken = await user.getIdToken().then(idToken =>
            fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ idToken }),
            })
          ).catch(e => console.warn('[AuthProvider] session refresh failed:', e));

          const profile = await Promise.race([
            getUserProfile(user.uid),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 5000))
          ]);
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

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ firebaseUser, userProfile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
