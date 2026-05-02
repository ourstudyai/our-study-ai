// src/lib/hooks/useAppSettings.ts
import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth } from '@/lib/firebase/config';
import { db } from '@/lib/firebase/config';
import { onAuthStateChanged } from 'firebase/auth';

export type Theme = 'sacred_academia' | 'dark' | 'light' | 'system' | 'monastic_green' | 'midnight_indigo' | 'parchment_scroll' | 'high_contrast' | 'royal_crimson' | 'imperial_purple' | 'baroque_gold' | 'cathedral_slate' | 'leather_library' | 'roman_senate' | 'vespers_rose' | 'cabinet_oak';
export type UIFont = 'dm_sans' | 'inter' | 'lora' | 'system' | 'cormorant' | 'eb_garamond' | 'crimson_pro' | 'spectral';
export type AIFont = 'lora' | 'playfair' | 'georgia' | 'merriweather' | 'source_serif' | 'literata' | 'cormorant' | 'eb_garamond' | 'crimson_pro' | 'spectral' | 'im_fell' | 'cardo';

export interface AppSettings {
    theme: Theme;
    uiFontSize: number;
    aiFontSize: number;
    settingsBtnTop: number;
    uiFont: UIFont;
    aiFont: AIFont;
}

const DEFAULTS: AppSettings = {
    theme: 'sacred_academia',
    uiFontSize: 20,
    aiFontSize: 18,
    settingsBtnTop: 167,
    uiFont: 'dm_sans',
    aiFont: 'lora',
};

const KEY = 'luxstudiorum_settings';

export function useAppSettings() {
    const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
    const [mounted, setMounted] = useState(false);
    const [uid, setUid] = useState<string | null>(null);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
        } catch { /* ignore */ }
        setMounted(true);
    }, []);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { setUid(null); return; }
            setUid(user.uid);
            try {
                const ref = doc(db, 'users', user.uid);
                const snap = await getDoc(ref);
                if (snap.exists() && snap.data().settings) {
                    const cloudSettings = { ...DEFAULTS, ...snap.data().settings };
                    setSettings(cloudSettings);
                    try { localStorage.setItem(KEY, JSON.stringify(cloudSettings)); } catch { /* ignore */ }
                }
            } catch { /* ignore */ }
        });
        return unsub;
    }, []);

    const update = useCallback((patch: Partial<AppSettings>) => {
        setSettings(prev => {
            const next = { ...prev, ...patch };
            try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
            if (uid) {
                const ref = doc(db, 'users', uid);
                updateDoc(ref, { settings: next }).catch(() => {});
            }
            return next;
        });
    }, [uid]);

    return { settings, update, mounted };
}
