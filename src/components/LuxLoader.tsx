'use client';

export default function LuxLoader({ label }: { label?: string }) {
  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--navy)', gap:'28px' }}>
      <div style={{ position:'relative', width:'56px', height:'56px' }}>
        <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'1.5px solid transparent', borderTopColor:'var(--gold)', borderRightColor:'var(--gold)', animation:'lux-spin 1.2s linear infinite', opacity:0.6 }} />
        <div style={{ position:'absolute', inset:'10px', borderRadius:'50%', border:'1px solid transparent', borderBottomColor:'var(--gold)', borderLeftColor:'var(--gold)', animation:'lux-spin 0.8s linear infinite reverse', opacity:0.4 }} />
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', animation:'lux-pulse 2s ease-in-out infinite' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="8" y="1" width="2" height="16" rx="1" fill="var(--gold)" opacity="0.9"/>
            <rect x="1" y="6" width="16" height="2" rx="1" fill="var(--gold)" opacity="0.9"/>
          </svg>
        </div>
      </div>
      <div style={{ textAlign:'center' }}>
        <p style={{ fontFamily:'Playfair Display, Georgia, serif', fontSize:'0.78rem', letterSpacing:'0.25em', textTransform:'uppercase', color:'var(--gold)', opacity:0.5, margin:0, animation:'lux-breathe 2s ease-in-out infinite' }}>Lux Studiorum</p>
        {label && <p style={{ fontFamily:'Georgia, serif', fontSize:'0.72rem', color:'var(--text-muted)', margin:'6px 0 0', letterSpacing:'0.05em', opacity:0.6 }}>{label}</p>}
      </div>
      <style>{`
        @keyframes lux-spin { to { transform: rotate(360deg); } }
        @keyframes lux-pulse { 0%,100%{opacity:0.7;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }
        @keyframes lux-breathe { 0%,100%{opacity:0.4} 50%{opacity:0.75} }
      `}</style>
    </div>
  );
}
