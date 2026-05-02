// src/components/SettingsPanel.tsx
'use client';
import { useState } from 'react';
import { useSettings } from '@/components/AppShell';
import { Theme, UIFont, AIFont } from '@/lib/hooks/useAppSettings';

const THEMES: { id: Theme; label: string; description: string; preview: string }[] = [
    { id: 'sacred_academia', label: '⛪ Sacred Academia', description: 'Deep navy & warm gold — the original', preview: '#0d1b2a' },
    { id: 'royal_crimson', label: '👑 Royal Crimson', description: 'Crimson & shadow — power and blood', preview: '#1a0a0f' },
    { id: 'imperial_purple', label: '🟣 Imperial Purple', description: 'Tyrian purple & gold leaf — emperors wore this', preview: '#130818' },
    { id: 'baroque_gold', label: '✦ Baroque Gold', description: "Rich darkness dripping in gold — Caravaggio's studio", preview: '#1c1408' },
    { id: 'roman_senate', label: '🏛️ Roman Senate', description: 'Dark marble & toga-white gold — classical authority', preview: '#14100c' },
    { id: 'leather_library', label: '📚 Leather Library', description: 'Mahogany shelves, copper bindings, candlelight', preview: '#1e1208' },
    { id: 'cabinet_oak', label: '🪵 Cabinet Dark Oak', description: "Wainscot panelling, scholar's midnight", preview: '#100c08' },
    { id: 'cathedral_slate', label: '🔷 Cathedral Slate', description: 'Stone nave, cerulean windows, cold light', preview: '#0e1218' },
    { id: 'vespers_rose', label: '🌹 Vespers Rose', description: 'Rose window, compline hour — violet and blush', preview: '#1a0d14' },
    { id: 'monastic_green', label: '🌿 Monastic Green', description: 'Scriptorium herb garden, illuminated margins', preview: '#0a1a0f' },
    { id: 'midnight_indigo', label: '🌙 Midnight Indigo', description: 'Night office, wax and silver', preview: '#0d0a1e' },
    { id: 'parchment_scroll', label: '📜 Parchment Scroll', description: 'Vellum, sepia ink, daylight reading', preview: '#f2e8d5' },
    { id: 'light', label: '☀️ Light', description: 'Clean parchment & ink', preview: '#f5efe6' },
    { id: 'dark', label: '🌑 Dark', description: 'Pure black, high contrast', preview: '#000000' },
    { id: 'high_contrast', label: '⚡ High Contrast', description: 'Pure black & white, accessibility', preview: '#000000' },
    { id: 'system', label: '💻 System', description: 'Follows your device setting', preview: '#888888' },
];

const UI_FONTS: { id: UIFont; label: string; sample: string }[] = [
    { id: 'dm_sans', label: 'DM Sans', sample: 'Clean & modern' },
    { id: 'inter', label: 'Inter', sample: 'Crisp interface' },
    { id: 'cormorant', label: 'Cormorant Garamond', sample: 'Court & chancery' },
    { id: 'eb_garamond', label: 'EB Garamond', sample: 'Renaissance humanist' },
    { id: 'crimson_pro', label: 'Crimson Pro', sample: 'Bookish & editorial' },
    { id: 'spectral', label: 'Spectral', sample: 'Long-form scholarly' },
    { id: 'lora', label: 'Lora', sample: 'Elegant serif' },
    { id: 'system', label: 'System', sample: 'Native device font' },
];

const AI_FONTS: { id: AIFont; label: string; sample: string; family: string }[] = [
    { id: 'lora', label: 'Lora', sample: 'Warm, readable serif', family: 'Lora, Georgia, serif' },
    { id: 'cormorant', label: 'Cormorant Garamond', sample: 'Regal old-style cursive', family: "'Cormorant Garamond', Georgia, serif" },
    { id: 'eb_garamond', label: 'EB Garamond', sample: 'Aldine Renaissance press', family: "'EB Garamond', Georgia, serif" },
    { id: 'im_fell', label: 'IM Fell English', sample: 'Imperfect 17c letterpress', family: "'IM Fell English', Georgia, serif" },
    { id: 'crimson_pro', label: 'Crimson Pro', sample: 'Bookish & editorial', family: "'Crimson Pro', Georgia, serif" },
    { id: 'spectral', label: 'Spectral', sample: 'Long-form scholarly', family: "'Spectral', Georgia, serif" },
    { id: 'cardo', label: 'Cardo', sample: 'Classical & biblical scholarship', family: "Cardo, Georgia, serif" },
    { id: 'playfair', label: 'Playfair Display', sample: 'Elegant academic', family: 'Playfair Display, Georgia, serif' },
    { id: 'merriweather', label: 'Merriweather', sample: 'Optimised for screens', family: 'Merriweather, Georgia, serif' },
    { id: 'source_serif', label: 'Source Serif 4', sample: 'Scholarly & precise', family: 'Source Serif 4, Georgia, serif' },
    { id: 'literata', label: 'Literata', sample: 'Built for comprehension', family: 'Literata, Georgia, serif' },
    { id: 'georgia', label: 'Georgia', sample: 'Classic study serif', family: 'Georgia, serif' },
];

type Section = null | 'theme' | 'uiFont' | 'aiFont' | 'sizes';

export default function SettingsPanel({ externalOpen = false, onClose }: { externalOpen?: boolean; onClose?: () => void }) {
    const { settings, update } = useSettings();
    const [open, setOpen] = useState(false);
    const [section, setSection] = useState<Section>(null);
    const isOpen = open || externalOpen;
    const handleClose = () => { setOpen(false); setSection(null); if (onClose) onClose(); };
    const goBack = () => setSection(null);

    const currentTheme = THEMES.find(t => t.id === settings.theme);
    const currentUIFont = UI_FONTS.find(f => f.id === settings.uiFont);
    const currentAIFont = AI_FONTS.find(f => f.id === settings.aiFont);

    return (
        <>


            {isOpen && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 200,
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
                        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                        padding: '16px',
                    }}
                    onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
                >
                    <div style={{
                        background: 'var(--navy-card)', border: '1px solid var(--border)',
                        borderRadius: '20px', width: '100%', maxWidth: '380px',
                        boxShadow: 'var(--shadow-float)',
                        animation: 'slide-up 0.25s ease forwards',
                        overflow: 'hidden',
                        display: 'flex', flexDirection: 'column',
                    }}>

                        {/* ── Header ── */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '18px 20px 16px',
                            borderBottom: '1px solid var(--border)',
                            flexShrink: 0,
                        }}>
                            {section && (
                                <button onClick={goBack} style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'var(--gold)', fontSize: '1.1rem', padding: '2px 6px 2px 0',
                                    display: 'flex', alignItems: 'center',
                                }}>‹</button>
                            )}
                            <h2 style={{
                                fontFamily: 'Playfair Display, serif', color: 'var(--gold)',
                                fontSize: '1rem', fontWeight: 700, flex: 1, margin: 0,
                            }}>
                                {section === null && 'Appearance'}
                                {section === 'theme' && 'Theme'}
                                {section === 'uiFont' && 'Interface Font'}
                                {section === 'aiFont' && 'AI Response Font'}
                                {section === 'sizes' && 'Font Sizes'}
                            </h2>
                            <button onClick={handleClose} style={{
                                color: 'var(--text-muted)', fontSize: '1rem',
                                background: 'none', border: 'none', cursor: 'pointer',
                                width: '28px', height: '28px', borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.15s',
                            }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-hover)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            >✕</button>
                        </div>

                        {/* ── Level 1: Menu ── */}
                        {section === null && (
                            <div style={{ padding: '10px 12px 16px' }}>
                                {(() => {
                            const rows = [
                                    {
                                        key: 'theme' as Section,
                                        icon: '🎨',
                                        label: 'Theme',
                                        value: currentTheme?.label ?? settings.theme,
                                        preview: <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: currentTheme?.preview ?? '#888', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />,
                                    },
                                    {
                                        key: 'uiFont' as Section,
                                        icon: '🔤',
                                        label: 'Interface Font',
                                        value: currentUIFont?.label ?? settings.uiFont,
                                        preview: null,
                                    },
                                    {
                                        key: 'aiFont' as Section,
                                        icon: '✍️',
                                        label: 'AI Response Font',
                                        value: currentAIFont?.label ?? settings.aiFont,
                                        preview: null,
                                    },
                                    {
                                        key: 'sizes' as Section,
                                        icon: 'Aa',
                                        label: 'Font Sizes',
                                        value: `UI ${settings.uiFontSize}px · AI ${settings.aiFontSize}px`,
                                        preview: null,
                                    },
                                ];
                            return (
                            <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '4px' }}>
                            {rows.map((row, idx) => (
                                    <button key={row.key} onClick={() => setSection(row.key)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            width: '100%', padding: '13px 12px', borderRadius: 0,
                                            background: 'transparent', border: 'none',
                                            borderBottom: idx < rows.length - 1 ? '1px solid var(--border)' : 'none',
                                            cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-hover)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <span style={{
                                            width: '36px', height: '36px', borderRadius: '10px',
                                            background: 'var(--navy-soft)', border: '1px solid var(--border)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: row.icon === 'Aa' ? '0.75rem' : '1rem',
                                            fontWeight: row.icon === 'Aa' ? 700 : 400,
                                            color: 'var(--gold)', flexShrink: 0,
                                        }}>{row.icon}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{row.label}</div>
                                            <div style={{
                                                fontSize: '0.72rem', color: 'var(--text-muted)',
                                                marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px',
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            }}>
                                                {row.preview}
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.value}</span>
                                            </div>
                                        </div>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>›</span>
                                    </button>
                                ))}
                            </div>
                            );
                        })()}
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.68rem', textAlign: 'center', marginTop: '12px', marginBottom: 0 }}>
                                    Settings saved automatically
                                </p>
                            </div>
                        )}

                        {/* ── Level 2: Theme ── */}
                        {section === 'theme' && (
                            <div style={{ overflowY: 'auto', maxHeight: '65vh', padding: '10px 12px 16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    {THEMES.map(t => (
                                        <button key={t.id} onClick={() => update({ theme: t.id })}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '10px',
                                                padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                                                border: `1px solid ${settings.theme === t.id ? 'var(--gold)' : 'var(--border)'}`,
                                                background: settings.theme === t.id ? 'var(--gold-dim)' : 'transparent',
                                                color: 'var(--text-primary)', textAlign: 'left', width: '100%',
                                                transition: 'all 0.15s ease',
                                            }}>
                                            <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: t.preview, border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0 }} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: settings.theme === t.id ? 'var(--gold-light)' : 'var(--text-primary)' }}>{t.label}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px' }}>{t.description}</div>
                                            </div>
                                            {settings.theme === t.id && <span style={{ color: 'var(--gold)', fontSize: '0.9rem' }}>✓</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Level 2: Interface Font ── */}
                        {section === 'uiFont' && (
                            <div style={{ overflowY: 'auto', maxHeight: '65vh', padding: '10px 12px 16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    {UI_FONTS.map(f => (
                                        <button key={f.id} onClick={() => update({ uiFont: f.id })}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                                                border: `1px solid ${settings.uiFont === f.id ? 'var(--gold)' : 'var(--border)'}`,
                                                background: settings.uiFont === f.id ? 'var(--gold-dim)' : 'transparent',
                                                color: 'var(--text-primary)', textAlign: 'left', width: '100%',
                                                transition: 'all 0.15s ease',
                                            }}>
                                            <div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: settings.uiFont === f.id ? 'var(--gold-light)' : 'var(--text-primary)' }}>{f.label}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px' }}>{f.sample}</div>
                                            </div>
                                            {settings.uiFont === f.id && <span style={{ color: 'var(--gold)' }}>✓</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Level 2: AI Font ── */}
                        {section === 'aiFont' && (
                            <div style={{ overflowY: 'auto', maxHeight: '65vh', padding: '10px 12px 16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    {AI_FONTS.map(f => (
                                        <button key={f.id} onClick={() => update({ aiFont: f.id })}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                                                border: `1px solid ${settings.aiFont === f.id ? 'var(--gold)' : 'var(--border)'}`,
                                                background: settings.aiFont === f.id ? 'var(--gold-dim)' : 'transparent',
                                                color: 'var(--text-primary)', textAlign: 'left', width: '100%',
                                                transition: 'all 0.15s ease',
                                            }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: f.family, color: settings.aiFont === f.id ? 'var(--gold-light)' : 'var(--text-primary)' }}>{f.label}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px', fontFamily: f.family }}>{f.sample}</div>
                                            </div>
                                            {settings.aiFont === f.id && <span style={{ color: 'var(--gold)' }}>✓</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Level 2: Font Sizes ── */}
                        {section === 'sizes' && (
                            <div style={{ padding: '16px 20px 20px' }}>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '10px', marginTop: 0 }}>Interface</p>
                                <FontSizeControl value={settings.uiFontSize} onChange={v => update({ uiFontSize: v })} />
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '10px', marginTop: '20px' }}>AI Response</p>
                                <FontSizeControl value={settings.aiFontSize} onChange={v => update({ aiFontSize: v })} />
                            </div>
                        )}

                    </div>
                </div>
            )}
        </>
    );
}

function FontSizeControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const sizes = [12, 13, 14, 15, 16, 17, 18, 20];
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            <button onClick={() => { const i = sizes.indexOf(value); if (i > 0) onChange(sizes[i - 1]); }}
                disabled={value <= sizes[0]}
                style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--navy)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: value <= sizes[0] ? 0.4 : 1 }}>−</button>
            {sizes.map(s => (
                <button key={s} onClick={() => onChange(s)}
                    style={{ minWidth: '30px', height: '28px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600, border: `1px solid ${value === s ? 'var(--gold)' : 'var(--border)'}`, background: value === s ? 'var(--gold-dim)' : 'var(--navy)', color: value === s ? 'var(--gold-light)' : 'var(--text-muted)', cursor: 'pointer' }}>{s}</button>
            ))}
            <button onClick={() => { const i = sizes.indexOf(value); if (i < sizes.length - 1) onChange(sizes[i + 1]); }}
                disabled={value >= sizes[sizes.length - 1]}
                style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--navy)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: value >= sizes[sizes.length - 1] ? 0.4 : 1 }}>+</button>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '2px' }}>{value}px</span>
        </div>
    );
}
