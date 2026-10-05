// Hand-made SVG drink illustrations (64×64). Drinks without an illustration fall back to their
// emoji, so new drinks work immediately and can get art later.
import { html, useRef } from './kit.js';
import { drinkById } from '../game/drinks.js';

let uid = 0;

const GLASS = 'rgba(255,255,255,0.55)';
const GLASS_FILL = 'rgba(255,255,255,0.08)';

function Beer(id) {
  return html`
    <defs>
      <linearGradient id=${`${id}b`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFD978" />
        <stop offset="0.55" stop-color="#F6A623" />
        <stop offset="1" stop-color="#C96A07" />
      </linearGradient>
    </defs>
    <path d="M44 25h4.5a7.5 7.5 0 0 1 7.5 7.5v7a7.5 7.5 0 0 1-7.5 7.5H44" fill="none" stroke=${GLASS} stroke-width="4" />
    <rect x="12" y="19" width="33" height="38" rx="6" fill=${`url(#${id}b)`} />
    <rect x="12" y="19" width="33" height="38" rx="6" fill="none" stroke=${GLASS} stroke-width="1.6" />
    <rect x="16.5" y="26" width="3.6" height="25" rx="1.8" fill="#fff" opacity="0.28" />
    <circle cx="28" cy="44" r="1.4" fill="#FFF3D1" opacity="0.7" />
    <circle cx="35" cy="37" r="1.1" fill="#FFF3D1" opacity="0.6" />
    <circle cx="31" cy="50" r="1.7" fill="#FFF3D1" opacity="0.55" />
    <circle cx="39" cy="47" r="1" fill="#FFF3D1" opacity="0.6" />
    <g fill="#FFF8EC">
      <circle cx="16" cy="20" r="6" />
      <circle cx="24" cy="15.5" r="7.2" />
      <circle cx="33.5" cy="15" r="7" />
      <circle cx="41.5" cy="19.5" r="5.8" />
      <rect x="12" y="18" width="33" height="7" rx="3.5" />
    </g>
    <circle cx="22" cy="13" r="2" fill="#fff" />
  `;
}

function Shot(id) {
  return html`
    <defs>
      <linearGradient id=${`${id}s`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFB15C" />
        <stop offset="1" stop-color="#E2365B" />
      </linearGradient>
    </defs>
    <path d="M15 14h34l-4.6 40.5a4 4 0 0 1-4 3.5H23.6a4 4 0 0 1-4-3.5z" fill=${GLASS_FILL} />
    <path d="M18.6 27h26.8l-3 25.5a3 3 0 0 1-3 2.6H24.6a3 3 0 0 1-3-2.6z" fill=${`url(#${id}s)`} />
    <ellipse cx="32" cy="27" rx="13.4" ry="2.2" fill="#FFD29A" opacity="0.65" />
    <path d="M15 14h34l-4.6 40.5a4 4 0 0 1-4 3.5H23.6a4 4 0 0 1-4-3.5z" fill="none" stroke=${GLASS} stroke-width="1.6" stroke-linejoin="round" />
    <path d="M20 47.5h24" stroke=${GLASS} stroke-width="1.2" opacity="0.6" />
    <rect x="19.5" y="18" width="3.2" height="24" rx="1.6" fill="#fff" opacity="0.3" transform="rotate(-6 21 30)" />
    <path d="M51 9l1.2 2.6L55 13l-2.8 1.2L51 17l-1.2-2.8L47 13l2.8-1.4z" fill="#FFE9B0" />
  `;
}

function Cocktail(id) {
  return html`
    <defs>
      <linearGradient id=${`${id}c`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FF8CC6" />
        <stop offset="1" stop-color="#9B5CF6" />
      </linearGradient>
    </defs>
    <circle cx="47" cy="15" r="7.5" fill="#B5E655" />
    <circle cx="47" cy="15" r="5.6" fill="#E3F8A8" />
    <g stroke="#B5E655" stroke-width="1.1">
      <path d="M47 9.6v10.8M41.6 15h10.8M43.2 11.2l7.6 7.6M50.8 11.2l-7.6 7.6" />
    </g>
    <path d="M9 17h46L32 40z" fill=${GLASS_FILL} />
    <path d="M14 21h36L32 38z" fill=${`url(#${id}c)`} />
    <path d="M9 17h46L32 40z" fill="none" stroke=${GLASS} stroke-width="1.6" stroke-linejoin="round" />
    <path d="M32 40v14" stroke=${GLASS} stroke-width="2.4" stroke-linecap="round" />
    <ellipse cx="32" cy="55.5" rx="11" ry="2.8" fill=${GLASS} />
    <path d="M20 23l7 7" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.35" />
    <path d="M24 9l12 22" stroke="#FFDF8A" stroke-width="1.6" stroke-linecap="round" />
    <circle cx="35" cy="29" r="3.4" fill="#E11D48" />
    <circle cx="34" cy="28" r="1" fill="#fff" opacity="0.7" />
  `;
}

function Jager(id) {
  return html`
    <defs>
      <linearGradient id=${`${id}j`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FCD34D" />
        <stop offset="1" stop-color="#C2410C" />
      </linearGradient>
      <clipPath id=${`${id}k`}>
        <rect x="14" y="18" width="36" height="40" rx="5" />
      </clipPath>
    </defs>
    <rect x="14" y="18" width="36" height="40" rx="5" fill=${GLASS_FILL} />
    <g clip-path=${`url(#${id}k)`}>
      <rect x="10" y="34" width="44" height="26" fill=${`url(#${id}j)`} />
      <path d="M14 34c4-2 8 2 12 0s8-2 12 0 8 2 12 0v3H14z" fill="#FFE28A" opacity="0.8" />
    </g>
    <g transform="rotate(-14 32 24)">
      <path d="M24 10h16l-2.2 20a2.5 2.5 0 0 1-2.5 2.2h-6.6a2.5 2.5 0 0 1-2.5-2.2z" fill="rgba(255,255,255,0.12)" stroke=${GLASS} stroke-width="1.4" />
      <path d="M25.4 16h13.2l-1.6 13.8a2 2 0 0 1-2 1.8h-6a2 2 0 0 1-2-1.8z" fill="#4A2A12" />
      <rect x="26.6" y="20" width="10.8" height="4" rx="1" fill="#3DDC97" />
    </g>
    <g fill="#FFE9A8">
      <circle cx="19" cy="31" r="1.6" />
      <circle cx="46" cy="30" r="1.9" />
      <circle cx="16" cy="26" r="1.1" />
      <circle cx="49" cy="25" r="1.2" />
    </g>
    <rect x="14" y="18" width="36" height="40" rx="5" fill="none" stroke=${GLASS} stroke-width="1.6" />
    <rect x="18" y="38" width="3.2" height="15" rx="1.6" fill="#fff" opacity="0.3" />
  `;
}

function Water(id) {
  return html`
    <defs>
      <linearGradient id=${`${id}w`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#9BE3FF" />
        <stop offset="1" stop-color="#1E9BE0" />
      </linearGradient>
      <clipPath id=${`${id}v`}>
        <path d="M15 12h34l-3.4 41.5a4.5 4.5 0 0 1-4.5 4.1H22.9a4.5 4.5 0 0 1-4.5-4.1z" />
      </clipPath>
    </defs>
    <path d="M15 12h34l-3.4 41.5a4.5 4.5 0 0 1-4.5 4.1H22.9a4.5 4.5 0 0 1-4.5-4.1z" fill=${GLASS_FILL} />
    <g clip-path=${`url(#${id}v)`}>
      <rect x="10" y="26" width="44" height="34" fill=${`url(#${id}w)`} opacity="0.92" />
      <rect x="20" y="22" width="11" height="11" rx="2.5" fill="#fff" opacity="0.75" transform="rotate(-12 25 27)" />
      <rect x="32" y="25" width="10" height="10" rx="2.5" fill="#fff" opacity="0.6" transform="rotate(14 37 30)" />
    </g>
    <path d="M15 12h34l-3.4 41.5a4.5 4.5 0 0 1-4.5 4.1H22.9a4.5 4.5 0 0 1-4.5-4.1z" fill="none" stroke=${GLASS} stroke-width="1.6" stroke-linejoin="round" />
    <rect x="19" y="18" width="3" height="30" rx="1.5" fill="#fff" opacity="0.28" transform="rotate(-4 20 33)" />
    <path d="M53 22c0 2.4-1.6 4-3.5 4S46 24.4 46 22c0-2.6 3.5-6.5 3.5-6.5S53 19.4 53 22z" fill="#9BE3FF" />
  `;
}

function Wine(id) {
  return html`
    <defs>
      <linearGradient id=${`${id}r`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#F43F5E" />
        <stop offset="1" stop-color="#7F1D3A" />
      </linearGradient>
    </defs>
    <path d="M19 8h26c1 13-2.5 27-13 27S18 21 19 8z" fill=${GLASS_FILL} />
    <path d="M19.6 20h24.8c-1 8.6-5 15-12.4 15s-11.4-6.4-12.4-15z" fill=${`url(#${id}r)`} />
    <path d="M19 8h26c1 13-2.5 27-13 27S18 21 19 8z" fill="none" stroke=${GLASS} stroke-width="1.6" />
    <path d="M32 35v17" stroke=${GLASS} stroke-width="2.4" stroke-linecap="round" />
    <ellipse cx="32" cy="54" rx="11" ry="2.8" fill=${GLASS} />
    <path d="M23 12c-.4 4 0 8 1.4 11" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.3" fill="none" />
  `;
}

function Cider(id) {
  return html`
    <defs>
      <linearGradient id=${`${id}a`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#E9F99D" />
        <stop offset="1" stop-color="#A3B818" />
      </linearGradient>
    </defs>
    <path d="M14 14h36l-4 40a4 4 0 0 1-4 3.6H22a4 4 0 0 1-4-3.6z" fill=${GLASS_FILL} />
    <path d="M16.6 24h30.8l-3.3 29.5a3 3 0 0 1-3 2.6H22.9a3 3 0 0 1-3-2.6z" fill=${`url(#${id}a)`} />
    <path d="M14 14h36l-4 40a4 4 0 0 1-4 3.6H22a4 4 0 0 1-4-3.6z" fill="none" stroke=${GLASS} stroke-width="1.6" stroke-linejoin="round" />
    <path d="M42 8a9 9 0 0 1 9 9H33a9 9 0 0 1 9-9z" fill="#EF4444" transform="rotate(18 42 13)" />
    <path d="M42 10a6.6 6.6 0 0 1 6.6 6.6H35.4A6.6 6.6 0 0 1 42 10z" fill="#FEF3C7" transform="rotate(18 42 13)" />
    <circle cx="27" cy="40" r="1.4" fill="#fff" opacity="0.6" />
    <circle cx="35" cy="47" r="1.2" fill="#fff" opacity="0.55" />
    <rect x="18.5" y="20" width="3" height="28" rx="1.5" fill="#fff" opacity="0.28" transform="rotate(-5 20 34)" />
  `;
}

function Svg({ draw, size, className }) {
  // Gradient ids must be unique per instance and stable across re-renders.
  const key = useRef(null);
  if (!key.current) key.current = `da${++uid}`;
  return html`<svg class=${className} width=${size} height=${size} viewBox="0 0 64 64" aria-hidden="true">${draw(key.current)}</svg>`;
}

const ART = { beer: Beer, shot: Shot, drink: Cocktail, jager: Jager, water: Water, wine: Wine, cider: Cider };

export function hasArt(id) {
  return !!ART[id];
}

export function DrinkArt({ id, size = 64, class: className }) {
  const draw = ART[id];
  if (!draw) {
    const d = drinkById(id);
    return html`<span class=${`drink-emoji ${className || ''}`} style=${{ fontSize: `${size * 0.7}px`, width: `${size}px`, height: `${size}px` }} aria-hidden="true">${d?.emoji || '🥤'}</span>`;
  }
  return html`<${Svg} draw=${draw} size=${size} className=${className} />`;
}
