// src/app/layout.tsx
import type { Metadata } from 'next';
import { AuthProvider } from '@/components/auth/AuthProvider';
import AppShell from '@/components/AppShell';
import SettingsPanel from '@/components/SettingsPanel';
import './globals.css';

export const metadata: Metadata = {
  title: 'Our Study AI',
  description:
    'AI-powered academic study platform for Bigard seminary students. Grounded in course materials, with structured responses and mastery tracking.',
  keywords: ['seminary', 'theology', 'philosophy', 'AI tutor', 'Catholic education'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <AppShell>
            {children}
            <SettingsPanel />
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}