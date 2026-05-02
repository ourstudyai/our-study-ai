// src/components/SettingsPanel.tsx
'use client';
import { useState } from 'react';
import { useSettings } from '@/components/AppShell';
import { Theme, UIFont, AIFont } from '@/lib/hooks/useAppSettings';

const THEMES: { id: Theme; label: string; description: string; preview: string }[] = [
    { id: 'sacred_academia', label: '⛪ Sacred Academia', description: 'Deep navy & warm gold — the original', preview: '#0d1b2a' },
    { id: 'dark', label: '🌑 Dark', description: 'Pure black, high contrast', preview: '#000000' },
    { id: 'light', label: '☀️ Light', description: 'Clean parchment & ink', preview: '#f5efe6' },
    { id: 'monastic_green', label: '🌿 Monastic Green', description: 'Forest deep, earthy calm', preview: '#0a1a0f' },
    { id: 'midnight_indigo', label: '🌙 Midnight Indigo', description: 'Deep purple, silver glow', preview: '#0d0a1e' },
    { id: 'parchment_scroll', label: '📜 Parchment Scroll', description: 'Aged paper, warm ink', preview: '#f2e8d5' },
    { id: 'high_contrast', label: '⚡ High Contrast', description: 'Pure black & white, accessibility', preview: '#000000' },
    { id: 'system', label: '💻 System', description: 'Follows your device setting', preview: '#888888' },
];

const UI_FONTS: { id: UIFont; label: string; sample: string }[] = [
    { id: 'dm_sans', label: 'DM Sans', sample: 'Clean & modern' },
    { id: 'inter', label: 'Inter', sample: 'Crisp interface' },
    { id: 'lora', label: 'Lora', sample: 'Elegant serif' },
    { id: 'system', label: 'System', sample: 'Native device font' },
];

const AI_FONTS: { id: AIFont; label: string; sample: string; family: string }[] = [
    { id: 'lora', label: 'Lora', sample: 'Warm, readable serif', family: 'Lora, Georgia, serif' },
    { id: 'playfair', label: 'Playfair Display', sample: 'Elegant academic', family: 'Playfair Display, Georgia, serif' },
    { id: 'georgia', label: 'Georgia', sample: 'Classic study serif', family: 'Georgia, serif' },
    { id: 'merriweather', label: 'Merriweather', sample: 'Optimised for screens', family: 'Merriweather, Georgia, serif' },
    { id: 'source_serif', label: 'Source Serif 4', sample: 'Scholarly & precise', family: 'Source Serif 4, Georgia, serif' },
    { id: 'literata', label: 'Literata', sample: 'Built for comprehension', family: 'Literata, Georgia, serif' },
];

export default function SettingsPanel({ hideTrigger = false, externalOpen = false, onClose }: { hideTrigger?: boolean; externalOpen?: boolean; onClose?: () => void }) {
    const { settings, update } = useSettings();
    const [open, setOpen] = useState(false);
    const isOpen = open || externalOpen;
    const handleClose = () => { setOpen(false); if (onClose) onClose(); };

    return (
        <>
            {!hideTrigger && (
                <button
                    onClick={() => setOpen(true)}
                    title="Appearance settings"
                    style={{
                        position: 'fixed', bottom: 'var(--settings-btn-top, 80px)', right: '12px', zIndex: 90,
                        width: '40px', height: '40px', borderRadius: '50%',
                        background: 'var(--navy-card)', border: '1px solid var(--border)',
                        color: 'var(--gold)', fontSize: '1.1rem', cursor: 'pointer',
                        boxShadow: 'var(--shadow-float)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                    ⚙️
                </button>
            )}

            {isOpen && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 200,
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
                        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                        padding: '16px',
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
                >
                    <div style={{
                        background: 'var(--navy-card)', border: '1px solid var(--border)',
                        borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '380px',
                        boxShadow: 'var(--shadow-float)',
                        animation: 'slide-up 0.25s ease forwards',
                        maxHeight: '90vh', overflowY: 'auto',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--gold)', fontSize: '1.1rem', fontWeight: 700 }}>
                                Appearance
                            </h2>
                            <button onClick={handleClose}
                                style={{ color: 'var(--text-muted)', fontSize: '1.2rem', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>✕</button>
                        </div>

                        <SectionLabel>Theme</SectionLabel>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                            {THEMES.map(t => (
                                <button key={t.id} onClick={() => update({ theme: t.id })}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
                                        border: `1px solid ${settings.theme === t.id ? 'var(--gold)' : 'var(--border)'}`,
                                        background: settings.theme === t.id ? 'var(--gold-dim)' : 'transparent',
                                        color: 'var(--text-primary)', textAlign: 'left', width: '100%',
                                        transition: 'all 0.15s ease',
                                    }}>
                                    <div style={{ width: '20px', height: '20px', borderRadius: '6px', background: t.preview, border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0 }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: settings.theme === t.id ? 'var(--gold-light)' : 'var(--text-primary)' }}>{t.label}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{t.description}</div>
                                    </div>
                                    {settings.theme === t.id && <span style={{ color: 'var(--gold)', fontSize: '1rem' }}>✓</span>}
                                </button>
                            ))}
                        </div>

                        <SectionLabel>Interface Font</SectionLabel>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                            {UI_FONTS.map(f => (
                                <button key={f.id} onClick={() => update({ uiFont: f.id })}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
                                        border: `1px solid ${settings.uiFont === f.id ? 'var(--gold)' : 'var(--border)'}`,
                                        background: settings.uiFont === f.id ? 'var(--gold-dim)' : 'transparent',
                                        color: 'var(--text-primary)', textAlign: 'left', width: '100%',
                                        transition: 'all 0.15s ease',
                                    }}>
                                    <div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: settings.uiFont === f.id ? 'var(--gold-light)' : 'var(--text-primary)' }}>{f.label}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{f.sample}</div>
                                    </div>
                                    {settings.uiFont === f.id && <span style={{ color: 'var(--gold)' }}>✓</span>}
                                </button>
                            ))}
                        </div>

                        <SectionLabel>AI Response Font</SectionLabel>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                            {AI_FONTS.map(f => (
                                <button key={f.id} onClick={() => update({ aiFont: f.id })}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
                                        border: `1px solid ${settings.aiFont === f.id ? 'var(--gold)' : 'var(--border)'}`,
                                        background: settings.aiFont === f.id ? 'var(--gold-dim)' : 'transparent',
                                        color: 'var(--text-primary)', textAlign: 'left', width: '100%',
                                        transition: 'all 0.15s ease',
                                    }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: f.family, color: settings.aiFont === f.id ? 'var(--gold-light)' : 'var(--text-primary)' }}>{f.label}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', fontFamily: f.family }}>{f.sample}</div>
                                    </div>
                                    {settings.aiFont === f.id && <span style={{ color: 'var(--gold)' }}>✓</span>}
                                </button>
                            ))}
                        </div>

                        <SectionLabel>Interface Font Size</SectionLabel>
                        <FontSizeControl value={settings.uiFontSize} onChange={v => update({ uiFontSize: v })} label="UI" />

                        <SectionLabel top={20}>AI Response Font Size</SectionLabel>
                        <FontSizeControl value={settings.aiFontSize} onChange={v => update({ aiFontSize: v })} label="AI" />


                        <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'center', marginTop: '20px' }}>
                            Settings saved automatically
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}

function SectionLabel({ children, top = 0 }: { children: React.ReactNode; top?: number }) {
    return (
        <p style={{
            color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            marginTop: top, marginBottom: '8px',
        }}>
            {children}
        </p>
    );
}

function FontSizeControl({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
    const sizes = [12, 13, 14, 15, 16, 17, 18, 20];
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={() => { const i = sizes.indexOf(value); if (i > 0) onChange(sizes[i - 1]); }}
                disabled={value <= sizes[0]}
                style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--navy)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: value <= sizes[0] ? 0.4 : 1 }}>−</button>
            {sizes.map(s => (
                <button key={s} onClick={() => onChange(s)}
                    style={{ minWidth: '32px', height: '28px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, border: `1px solid ${value === s ? 'var(--gold)' : 'var(--border)'}`, background: value === s ? 'var(--gold-dim)' : 'var(--navy)', color: value === s ? 'var(--gold-light)' : 'var(--text-muted)', cursor: 'pointer' }}>{s}</button>
            ))}
            <button onClick={() => { const i = sizes.indexOf(value); if (i < sizes.length - 1) onChange(sizes[i + 1]); }}
                disabled={value >= sizes[sizes.length - 1]}
                style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--navy)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: value >= sizes[sizes.length - 1] ? 0.4 : 1 }}>+</button>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '4px' }}>{value}px</span>
        </div>
    );
}

function PositionSlider({ value, min, max, onChange, unit }: { value: number; min: number; max: number; onChange: (v: number) => void; unit: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--gold)', cursor: 'pointer', height: '4px' }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--gold)', fontWeight: 600, minWidth: '72px', textAlign: 'right' }}>{value}px</span>
        </div>
    );
}
