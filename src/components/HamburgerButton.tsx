'use client';
// The menu button for every mobile header: bright, breathing and hard to ignore, so students tap it
// and discover the rest of the site. Uses the theme gold, so it follows the active theme.

export default function HamburgerButton({ onClick, id }: { onClick: () => void; id?: string }) {
  return (
    <>
      <button id={id} onClick={onClick} aria-label="Open the menu" className="lux-burger">
        <span className="lux-burger-glow" aria-hidden="true" />
        <span className="lux-burger-ring" aria-hidden="true" />
        <span className="lux-burger-bars" aria-hidden="true"><i /><i /><i /></span>
        <span className="lux-burger-text">Menu</span>
        <span className="lux-burger-clip" aria-hidden="true"><span className="lux-burger-shine" /></span>
      </button>
      <style>{`
        .lux-burger{position:relative;display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 12px 0 10px;
          border:none;border-radius:999px;cursor:pointer;color:#0a1020;white-space:nowrap;
          font-family:'Playfair Display',serif;font-weight:800;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;
          background:linear-gradient(135deg,var(--gold-light) 0%,var(--gold) 100%);
          box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -2px 0 rgba(0,0,0,.18);
          animation:luxBreath 2.4s ease-in-out infinite;-webkit-tap-highlight-color:transparent;transition:transform .15s}
        .lux-burger:active{transform:scale(.92)}
        .lux-burger-glow{position:absolute;inset:-3px;border-radius:inherit;background:var(--gold-light);filter:blur(9px);
          opacity:.45;z-index:-1;animation:luxGlow 2.4s ease-in-out infinite;pointer-events:none}
        .lux-burger-ring{position:absolute;inset:0;border-radius:inherit;border:2px solid var(--gold-light);
          animation:luxPing 2.4s ease-out infinite;pointer-events:none}
        .lux-burger-bars{display:flex;flex-direction:column;gap:3.5px;width:16px}
        .lux-burger-bars i{display:block;height:2.5px;border-radius:2px;background:#0a1020;transform-origin:left center;
          animation:luxBar 1.8s ease-in-out infinite}
        .lux-burger-bars i:nth-child(2){animation-delay:.2s}
        .lux-burger-bars i:nth-child(3){animation-delay:.4s}
        .lux-burger-clip{position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none}
        .lux-burger-shine{position:absolute;top:0;bottom:0;width:40%;left:-60%;transform:skewX(-20deg);
          background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);animation:luxShine 3.4s ease-in-out infinite}
        @keyframes luxBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
        @keyframes luxGlow{0%,100%{opacity:.3}50%{opacity:.75}}
        @keyframes luxPing{0%{transform:scale(1);opacity:.85}100%{transform:scale(1.4,1.8);opacity:0}}
        @keyframes luxBar{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.55)}}
        @keyframes luxShine{0%,55%{left:-60%}100%{left:130%}}
        @media (max-width:370px){.lux-burger-text{display:none}.lux-burger{padding:0 10px}}
        @media (prefers-reduced-motion:reduce){.lux-burger,.lux-burger-glow,.lux-burger-ring,.lux-burger-bars i,.lux-burger-shine{animation:none}}
      `}</style>
    </>
  );
}
