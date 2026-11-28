'use client';
import { useState } from 'react';
// Bold button to the Somascan Fathers Digital Library, an external site. Burgundy and cream (their colours)
// so it clearly reads as "another place", with a slow shine so it is noticed. Opens in a new tab.

export default function ExternalLibraryButton() {
  // If the logo file is missing, a small drawn crest is shown instead.
  const [noLogo, setNoLogo] = useState(false);
  return (
    <>
      <a
        href="https://library.somascanfathersnigeria.com"
        target="_blank"
        rel="noopener noreferrer"
        className="lux-ext"
        title="Opens the Somascan Fathers Digital Library in a new tab"
        aria-label="External source: Somascan Fathers Digital Library (opens in a new tab)"
      >
        <span className="lux-ext-logo">
          {noLogo ? (
            <svg width="26" height="30" viewBox="0 0 26 30" aria-hidden="true">
              <path d="M8 4l2.5 2.5L13 2l2.5 4.5L18 4l-1 4H9z" fill="#c9963a" />
              <path d="M3 9h20v9c0 5-4.5 8.5-10 11C7.5 26.500 3 23 3 18z" fill="#6b2437" stroke="#c9963a" strokeWidth="1.6" />
              <path d="M11.600 12h2.800v4h3.600v2.800h-3.600V25h-2.800v-6.200H8V16h3.600z" fill="#fbf6ea" />
            </svg>
          ) : (
            <img src="/icons/somascan-logo.jpg" alt="" width={34} height={34} onError={() => setNoLogo(true)} />
          )}
        </span>
        <span className="lux-ext-text">
          <span className="lux-ext-top">External source</span>
          <span className="lux-ext-main">Somascan Library ↗</span>
        </span>
        <span className="lux-ext-clip" aria-hidden="true"><span className="lux-ext-shine" /></span>
      </a>
      <style>{`
        .lux-ext{position:relative;flex-shrink:0;display:inline-flex;align-items:center;gap:7px;padding:5px 11px 5px 5px;
          border-radius:999px;text-decoration:none;color:#fbf6ea;border:2px solid #d9b25f;
          background:linear-gradient(135deg,#6b2437 0%,#4a1626 100%);
          box-shadow:0 4px 16px rgba(107,36,55,.55),inset 0 1px 0 rgba(255,255,255,.18);
          animation:luxExtPulse 3s ease-in-out infinite;-webkit-tap-highlight-color:transparent;transition:transform .15s}
        .lux-ext:hover{transform:translateY(-1px)}
        .lux-ext:active{transform:scale(.96)}
        .lux-ext-logo{width:32px;height:32px;border-radius:50%;overflow:hidden;background:#fff;border:2px solid #d9b25f;
          display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .lux-ext-logo img{width:100%;height:100%;object-fit:cover;display:block}
        .lux-ext-text{display:flex;flex-direction:column;line-height:1.15;text-align:left}
        .lux-ext-top{font-size:.5rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#e8c878}
        .lux-ext-main{font-family:'Playfair Display',serif;font-size:.74rem;font-weight:800;white-space:nowrap}
        .lux-ext-clip{position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none}
        .lux-ext-shine{position:absolute;top:0;bottom:0;width:35%;left:-60%;transform:skewX(-20deg);
          background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);animation:luxExtShine 4.5s ease-in-out infinite}
        @keyframes luxExtPulse{0%,100%{box-shadow:0 4px 16px rgba(107,36,55,.55),0 0 0 0 rgba(217,178,95,.0)}50%{box-shadow:0 4px 16px rgba(107,36,55,.55),0 0 0 6px rgba(217,178,95,.22)}}
        @keyframes luxExtShine{0%,60%{left:-60%}100%{left:130%}}
        @media (prefers-reduced-motion:reduce){.lux-ext,.lux-ext-shine{animation:none}}
      `}</style>
    </>
  );
}
