// src/components/AppShell.tsx
'use client';
import React, { createContext, useContext, useEffect } from 'react';
import { useAppSettings, AppSettings, Theme, UIFont, AIFont } from '@/lib/hooks/useAppSettings';
interface SettingsContextType {
    settings: AppSettings;
    update: (patch: Partial<AppSettings>) => void;
}
const SettingsContext = createContext<SettingsContextType>({
    settings: {
        theme: 'sacred_academia',
        uiFontSize: 20,
        aiFontSize: 18,
        chatInputBottom: 24,
        settingsBtnTop: 167,
        uiFont: 'dm_sans',
        aiFont: 'lora',
    },
    update: () => { },
});
export function useSettings() {
    return useContext(SettingsContext);
}
function getSystemTheme(): 'dark' | 'light' {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function resolveTheme(theme: Theme): string {
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

        // Apply fonts
        const UI_FONTS: Record<string, string> = {
            dm_sans: "'DM Sans', system-ui, sans-serif",
            inter: "'Inter', system-ui, sans-serif",
            lora: "'Lora', Georgia, serif",
            system: "system-ui, sans-serif",
        };
        const AI_FONTS: Record<string, string> = {
            lora: "'Lora', Georgia, serif",
            playfair: "'Playfair Display', Georgia, serif",
            georgia: "Georgia, serif",
            merriweather: "'Merriweather', Georgia, serif",
            source_serif: "'Source Serif 4', Georgia, serif",
            literata: "'Literata', Georgia, serif",
        };
        root.style.setProperty('--ui-font', UI_FONTS[settings.uiFont] ?? UI_FONTS.dm_sans);
        root.style.setProperty('--ai-font', AI_FONTS[settings.aiFont] ?? AI_FONTS.lora);
        root.style.setProperty('--chat-input-bottom', settings.chatInputBottom + 'px');
        root.style.setProperty('--settings-btn-top', settings.settingsBtnTop + 'px');
        root.style.setProperty('--chat-input-bottom', settings.chatInputBottom + 'px');
        root.style.setProperty('--settings-btn-top', settings.settingsBtnTop + 'px');
    }, [resolved, settings.uiFontSize, settings.aiFontSize, settings.uiFont, settings.aiFont, settings.chatInputBottom, settings.settingsBtnTop]);
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
