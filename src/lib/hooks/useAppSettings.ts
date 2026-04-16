// src/lib/hooks/useAppSettings.ts
import { useState, useEffect } from 'react';
export type Theme = 'sacred_academia' | 'dark' | 'light' | 'system';
export interface AppSettings {
    theme: Theme;
    uiFontSize: number;
    aiFontSize: number;
}
const DEFAULTS: AppSettings = {
    theme: 'sacred_academia',
    uiFontSize: 20,
    aiFontSize: 18,
};
const KEY = 'ourstudyai_settings';
export function useAppSettings() {
    const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
        } catch { /* ignore */ }
        setMounted(true);
    }, []);
    const update = (patch: Partial<AppSettings>) => {
        setSettings(prev => {
            const next = { ...prev, ...patch };
            try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });
    };
    return { settings, update, mounted };
}
