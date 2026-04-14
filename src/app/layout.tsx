import type { Metadata } from 'next';
import { AuthProvider } from '@/components/auth/AuthProvider';
import AppShell from '@/components/AppShell';
import SettingsPanel from '@/components/SettingsPanel';
import './globals.css';

export const metadata: Metadata = {
  title: 'OurStudyAI',
  description:
    'AI-powered academic study platform for Bigard seminary students. Grounded in course materials, with structured responses and mastery tracking.',
  keywords: ['seminary', 'theology', 'philosophy', 'AI tutor', 'Catholic education'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'OurStudyAI',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content="#0f2859" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="OurStudyAI" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />
        <link rel="manifest" href="/manifest.json" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
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
