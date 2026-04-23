// src/components/SettingsPanel.tsx
'use client';
import { useState } from 'react';
import { useSettings } from '@/components/AppShell';
import { Theme } from '@/lib/hooks/useAppSettings';

const THEMES: { id: Theme; label: string; description: string }[] = [
    { id: 'sacred_academia', label: '⛪ Sacred Academia', description: 'Deep navy & warm gold — the original' },
    { id: 'dark', label: '🌑 Dark', description: 'Pure black, high contrast' },
    { id: 'light', label: '☀️ Light', description: 'Clean parchment & ink' },
    { id: 'system', label: '💻 System', description: 'Follows your device setting' },
];

export default function SettingsPanel({ hideTrigger = false }: { hideTrigger?: boolean }) {
    const { settings, update } = useSettings();
    const [open, setOpen] = useState(false);

    return (
        <>
            {/* Trigger button */}
            <button
                onClick={() => setOpen(true)}
                title="Appearance settings"
                style={{
                    position: 'fixed', bottom: '80px', right: '12px', zIndex: 90,
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

            {/* Panel overlay */}
            {open && (
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
                        borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '360px',
                        boxShadow: 'var(--shadow-float)',
                        animation: 'slide-up 0.25s ease forwards',
                        maxHeight: '90vh', overflowY: 'auto',
                    }}>

                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontFamily: 'Playfair Display, serif', color: 'var(--gold)', fontSize: '1.1rem', fontWeight: 700 }}>
                                Appearance
                            </h2>
                            <button
                                onClick={() => setOpen(false)}
                                style={{ color: 'var(--text-muted)', fontSize: '1.2rem', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                            >✕</button>
                        </div>

                        {/* ── Theme ── */}
                        <SectionLabel>Theme</SectionLabel>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                            {THEMES.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => update({ theme: t.id })}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
                                        border: `1px solid ${settings.theme === t.id ? 'var(--gold)' : 'var(--border)'}`,
                                        background: settings.theme === t.id ? 'var(--gold-dim)' : 'transparent',
                                        color: 'var(--text-primary)', textAlign: 'left', width: '100%',
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    <div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: settings.theme === t.id ? 'var(--gold-light)' : 'var(--text-primary)' }}>
                                            {t.label}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            {t.description}
                                        </div>
                                    </div>
                                    {settings.theme === t.id && <span style={{ color: 'var(--gold)', fontSize: '1rem' }}>✓</span>}
                                </button>
                            ))}
                        </div>

                        {/* ── Interface Font Size ── */}
                        <SectionLabel>Interface Font Size</SectionLabel>
                        <FontSizeControl value={settings.uiFontSize} onChange={v => update({ uiFontSize: v })} label="UI" />

                        {/* ── AI Font Size ── */}
                        <SectionLabel top={20}>AI Response Font Size</SectionLabel>
                        <FontSizeControl value={settings.aiFontSize} onChange={v => update({ aiFontSize: v })} label="AI" />

                        {/* ── Chat Input Position ── */}
                        <SectionLabel top={20}>Chat Input Position</SectionLabel>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: '8px' }}>
                            Distance from bottom of screen — drag up to raise the input box
                        </p>
                        <PositionSlider
                            value={settings.chatInputBottom}
                            min={16}
                            max={420}
                            onChange={v => update({ chatInputBottom: v })}
                            unit="px from bottom"
                        />

                        {/* ── Settings Button Position ── */}
                        <SectionLabel top={20}>Settings Button Position</SectionLabel>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: '8px' }}>
                            Distance from top of screen
                        </p>
                        <PositionSlider
                            value={settings.settingsBtnTop}
                            min={60}
                            max={600}
                            onChange={v => update({ settingsBtnTop: v })}
                            unit="px from top"
                        />

                        <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'center', marginTop: '20px' }}>
                            Settings saved automatically
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}

/* ── Shared sub-components ── */

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
            <button
                onClick={() => { const i = sizes.indexOf(value); if (i > 0) onChange(sizes[i - 1]); }}
                disabled={value <= sizes[0]}
                style={{
                    width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border)',
                    background: 'var(--navy)', color: 'var(--text-primary)', cursor: 'pointer',
                    fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: value <= sizes[0] ? 0.4 : 1,
                }}
            >−</button>
            {sizes.map(s => (
                <button
                    key={s}
                    onClick={() => onChange(s)}
                    style={{
                        minWidth: '32px', height: '28px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600,
                        border: `1px solid ${value === s ? 'var(--gold)' : 'var(--border)'}`,
                        background: value === s ? 'var(--gold-dim)' : 'var(--navy)',
                        color: value === s ? 'var(--gold-light)' : 'var(--text-muted)',
                        cursor: 'pointer',
                    }}
                >{s}</button>
            ))}
            <button
                onClick={() => { const i = sizes.indexOf(value); if (i < sizes.length - 1) onChange(sizes[i + 1]); }}
                disabled={value >= sizes[sizes.length - 1]}
                style={{
                    width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border)',
                    background: 'var(--navy)', color: 'var(--text-primary)', cursor: 'pointer',
                    fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: value >= sizes[sizes.length - 1] ? 0.4 : 1,
                }}
            >+</button>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '4px' }}>{value}px</span>
        </div>
    );
}

function PositionSlider({ value, min, max, onChange, unit }: {
    value: number; min: number; max: number;
    onChange: (v: number) => void; unit: string;
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                style={{
                    flex: 1, accentColor: 'var(--gold)', cursor: 'pointer', height: '4px',
                }}
            />
            <span style={{
                fontSize: '0.72rem', color: 'var(--gold)', fontWeight: 600,
                minWidth: '72px', textAlign: 'right',
            }}>
                {value}px
            </span>
        </div>
    );
}