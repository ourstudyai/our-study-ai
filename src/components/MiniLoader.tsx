// src/components/MiniLoader.tsx
'use client';
import React from 'react';
export default function MiniLoader({ label }: { label?: string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 0', gap:'12px' }}>
      <div style={{ position:'relative', width:'32px', height:'32px' }}>
        <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'1.5px solid transparent', borderTopColor:'var(--gold)', borderRightColor:'var(--gold)', animation:'lux-spin 1.2s linear infinite', opacity:0.6 }} />
        <div style={{ position:'absolute', inset:'7px', borderRadius:'50%', border:'1px solid transparent', borderBottomColor:'var(--gold)', animation:'lux-spin 0.8s linear infinite reverse', opacity:0.4 }} />
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', animation:'lux-pulse 2s ease-in-out infinite' }}>
          <svg width="10" height="10" viewBox="0 0 18 18" fill="none">
            <rect x="8" y="1" width="2" height="16" rx="1" fill="var(--gold)" opacity="0.9"/>
            <rect x="1" y="6" width="16" height="2" rx="1" fill="var(--gold)" opacity="0.9"/>
          </svg>
        </div>
      </div>
      {label && <p style={{ fontFamily:'Georgia, serif', fontSize:'0.7rem', color:'var(--text-muted)', margin:0, letterSpacing:'0.05em', opacity:0.6 }}>{label}</p>}
      <style>{\`
        @keyframes lux-spin { to { transform: rotate(360deg); } }
        @keyframes lux-pulse { 0%,100%{opacity:0.7;transform:scale(1)} 50%{opacity:1;transform:scale(1.1)} }
      \`}</style>
    </div>
  );
}
