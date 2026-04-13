// src/components/AppShell.tsx
'use client';
import React, { createContext, useContext, useEffect } from 'react';
import { useAppSettings, AppSettings, Theme } from '@/lib/hooks/useAppSettings';

interface SettingsContextType {
    settings: AppSettings;
    update: (patch: Partial<AppSettings>) => void;
}

const SettingsContext = createContext<SettingsContextType>({
    settings: { theme: 'sacred_academia', uiFontSize: 15, aiFontSize: 15 },
    update: () => { },
});

export function useSettings() {
    return useContext(SettingsContext);
}

function getSystemTheme(): 'dark' | 'light' {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): 'sacred_academia' | 'dark' | 'light' {
    if (theme === 'system') return getSystemTheme() === 'dark' ? 'dark' : 'light';
    return theme;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
    const { settings, update, mounted } = useAppSettings();
    const resolved = resolveTheme(settings.theme);

    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-theme', resolved);
        root.style.setProperty('--ui-font-size', `${settings.uiFontSize}px`);
        root.style.setProperty('--ai-font-size', `${settings.aiFontSize}px`);
        root.style.fontSize = `${settings.uiFontSize}px`;
    }, [resolved, settings.uiFontSize, settings.aiFontSize]);

    // Listen for system theme changes when in system mode
    useEffect(() => {
        if (settings.theme !== 'system') return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => {
            document.documentElement.setAttribute('data-theme', getSystemTheme() === 'dark' ? 'dark' : 'light');
        };
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [settings.theme]);

    if (!mounted) return null;

    return (
        <SettingsContext.Provider value={{ settings, update }}>
            {children}
        </SettingsContext.Provider>
    );
}