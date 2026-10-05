// Drawn Tour de France faces (120×120). Hosts can replace each face with a picture in the event
// settings; these cartoons are the defaults.
import { html } from './kit.js';

let uid = 0;

const INK = '#1d1a24';

function Shoulders({ color, collar = '#fff' }) {
  return html`
    <path d="M10 124c3-21 22-33 50-33s47 12 50 33z" fill=${color} />
    <path d="M45 92c3 8 9 12 15 12s12-4 15-12" fill="none" stroke=${collar} stroke-width="4" stroke-linecap="round" />
  `;
}

function Head({ skin, shade, id }) {
  return html`
    <defs>
      <radialGradient id=${`${id}sk`} cx="0.42" cy="0.35" r="0.75">
        <stop offset="0" stop-color=${skin} />
        <stop offset="1" stop-color=${shade} />
      </radialGradient>
    </defs>
    <path d="M51 78h18v16c0 4-4 7-9 7s-9-3-9-7z" fill=${shade} />
    <ellipse cx="33.5" cy="61" rx="6" ry="8.5" fill=${shade} />
    <ellipse cx="86.5" cy="61" rx="6" ry="8.5" fill=${shade} />
    <ellipse cx="60" cy="58" rx="27" ry="31" fill=${`url(#${id}sk)`} />
  `;
}

// Sports director: grey mustache, glasses, team cap and a stopwatch.
function Henning(id) {
  const skin = '#f3cba6';
  const shade = '#d9a27c';
  return html`
    <${Shoulders} color="#c62828" />
    <path d="M52 94l8 14 8-14" fill="none" stroke="#f5f5f5" stroke-width="2.4" />
    <circle cx="60" cy="112" r="6.5" fill="#f5f5f5" stroke=${INK} stroke-width="1.6" />
    <path d="M60 108.5v4l2.5 1.5" stroke=${INK} stroke-width="1.4" fill="none" stroke-linecap="round" />
    <${Head} skin=${skin} shade=${shade} id=${id} />
    <path d="M33 56c-1-10 2-17 6-21M87 56c1-10-2-17-6-21" stroke="#cfcfd4" stroke-width="7" stroke-linecap="round" fill="none" />
    <path d="M31 40c2-16 14-25 29-25s27 9 29 25c-8-3-17-4-29-4s-21 1-29 4z" fill="#b71c1c" />
    <path d="M28 41c10-4 21-5.5 32-5.5S82 37 92 41c1 2 0 3.5-2 3.6-9-2.4-19-3.4-30-3.4S39 42.2 30 44.6c-2-.1-3-1.6-2-3.6z" fill="#7f1414" />
    <circle cx="60" cy="24" r="2.2" fill="#ffcdd2" />
    <path d="M40 49.5c4-2.6 9-3 13-1.2M67 48.3c4-1.8 9-1.4 13 1.2" stroke="#9e9ea6" stroke-width="3.4" stroke-linecap="round" fill="none" />
    <rect x="40.5" y="52" width="16" height="12" rx="4" fill="rgba(255,255,255,0.28)" stroke=${INK} stroke-width="2.4" />
    <rect x="63.5" y="52" width="16" height="12" rx="4" fill="rgba(255,255,255,0.28)" stroke=${INK} stroke-width="2.4" />
    <path d="M56.5 57h7" stroke=${INK} stroke-width="2.2" />
    <circle cx="48.5" cy="58" r="2.4" fill=${INK} />
    <circle cx="71.5" cy="58" r="2.4" fill=${INK} />
    <path d="M60 61c-2 5-3 8-1 9.5 1.2.8 3.2.6 4.4-.2" stroke=${shade} stroke-width="2.4" fill="none" stroke-linecap="round" />
    <path d="M42 78c5-7 12-8 18-4.5 6-3.5 13-2.5 18 4.5-5 3.5-11 3-18 .5-7 2.5-13 3-18-.5z" fill="#c4c4cc" />
    <path d="M52 82.5c5 2.8 11 2.8 16 0" stroke="#8b3a3a" stroke-width="2.6" stroke-linecap="round" fill="none" />
  `;
}

// Young rider: classic cycling cap with the brim flipped up, sideburns and a big grin.
function Bobby(id) {
  const skin = '#eebc93';
  const shade = '#cf9468';
  return html`
    <${Shoulders} color="#1e5bd8" />
    <path d="M16 112c14-8 28-11 44-11s30 3 44 11" stroke="#fff" stroke-width="5" fill="none" opacity="0.85" />
    <${Head} skin=${skin} shade=${shade} id=${id} />
    <path d="M34 60c-2-9 0-15 3-19M86 60c2-9 0-15-3-19" stroke="#5b3a24" stroke-width="5" stroke-linecap="round" fill="none" />
    <path d="M32 44c0-17 12-27 28-27s28 10 28 27z" fill="#fafafa" />
    <path d="M45 19.5c-3 7-4.5 15-4.5 24.5M60 17v27M75 19.5c3 7 4.5 15 4.5 24.5" stroke="#1e5bd8" stroke-width="4.2" fill="none" />
    <path d="M52 18.2v25.8M68 18.2v25.8" stroke="#e53935" stroke-width="2.2" fill="none" />
    <path d="M30 44.5h60" stroke="#dadada" stroke-width="3" stroke-linecap="round" />
    <path d="M44 43l3-14c8-3 18-3 26 0l3 14c-10-2-22-2-32 0z" fill="#1e5bd8" />
    <path d="M49 37c7-1.4 15-1.4 22 0" stroke="#fff" stroke-width="2" stroke-linecap="round" />
    <path d="M41 50c4-3.4 9-4 13-2M66 48c4-2 9-1.4 13 2" stroke="#5b3a24" stroke-width="3.2" stroke-linecap="round" fill="none" />
    <ellipse cx="48" cy="57" rx="3.2" ry="3.8" fill=${INK} />
    <ellipse cx="72" cy="57" rx="3.2" ry="3.8" fill=${INK} />
    <circle cx="49.2" cy="55.6" r="1.1" fill="#fff" />
    <circle cx="73.2" cy="55.6" r="1.1" fill="#fff" />
    <path d="M60 60c-1.6 4.6-2.4 7.4-.6 8.6 1.2.8 3 .6 4.2-.2" stroke=${shade} stroke-width="2.4" fill="none" stroke-linecap="round" />
    <g fill=${shade} opacity="0.7">
      <circle cx="42" cy="66" r="1.2" /><circle cx="46" cy="68" r="1" /><circle cx="78" cy="66" r="1.2" /><circle cx="74" cy="68" r="1" />
    </g>
    <path d="M45 73c4 9 9.5 12.5 15 12.5S71 82 75 73c-9 2-21 2-30 0z" fill="#5a1e1e" />
    <path d="M47 73.6c8.5 1.6 17.5 1.6 26 0l-1 3.2c-8 1.2-16 1.2-24 0z" fill="#fff" />
  `;
}

// Breakaway rider: blond hair, shades pushed up on the head, stubble and a smirk.
function Pimm(id) {
  const skin = '#f5d2b3';
  const shade = '#dba985';
  return html`
    <defs>
      <linearGradient id=${`${id}gl`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#7c3aed" />
        <stop offset="0.5" stop-color="#0ea5e9" />
        <stop offset="1" stop-color="#f59e0b" />
      </linearGradient>
    </defs>
    <${Shoulders} color="#15a34a" />
    <path d="M60 92v32" stroke="#0b6b30" stroke-width="2.4" />
    <${Head} skin=${skin} shade=${shade} id=${id} />
    <path d="M31 50c-3-20 10-35 29-35 20 0 33 14 29 35-3-7-8-12-14-14 1 4 0 7-3 9-2-6-7-10-13-11 1 4 0 7-3 9-3-5-8-8-12-8-6 3-10 8-13 15z" fill="#f2c24f" />
    <path d="M40 22c5-4 11-6 18-6M66 18c6 1 12 5 16 10" stroke="#fff3c4" stroke-width="2.2" stroke-linecap="round" fill="none" opacity="0.7" />
    <path d="M33 36c8-5 17-7 27-7s19 2 27 7l-1.6 6.5c-5 2.4-12 2.2-17-1L60 38l-8.4 3.5c-5 3.2-12 3.4-17 1z" fill=${`url(#${id}gl)`} stroke=${INK} stroke-width="2" />
    <path d="M38 37.5c4-1.8 9-2.4 13-1.8" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.75" />
    <path d="M41 50.5c4-2.4 9-2.6 13-.6M66 47c4.6-2.6 9.6-2.4 13.4.6" stroke="#c99a2e" stroke-width="3.2" stroke-linecap="round" fill="none" />
    <path d="M42.5 57.5c2.4-2 6.6-2.2 9.4 0M67.6 57.5c2.4-2 6.6-2.2 9.4 0" stroke=${INK} stroke-width="3" stroke-linecap="round" fill="none" />
    <path d="M60 60c-1.6 4.6-2.4 7.4-.6 8.6 1.2.8 3 .6 4.2-.2" stroke=${shade} stroke-width="2.4" fill="none" stroke-linecap="round" />
    <path d="M48 77c6 3.4 14 3.6 22-1.6" stroke="#8b3a3a" stroke-width="3" stroke-linecap="round" fill="none" />
    <g fill="#b98b6a" opacity="0.75">
      <circle cx="47" cy="83" r="0.9" /><circle cx="51" cy="85.5" r="0.9" /><circle cx="55" cy="87" r="0.9" /><circle cx="60" cy="87.6" r="0.9" />
      <circle cx="65" cy="87" r="0.9" /><circle cx="69" cy="85.5" r="0.9" /><circle cx="73" cy="83" r="0.9" /><circle cx="57" cy="84" r="0.9" />
      <circle cx="63" cy="84" r="0.9" /><circle cx="44" cy="79" r="0.9" /><circle cx="76" cy="79" r="0.9" />
    </g>
  `;
}

const ART = { henning: Henning, bobby: Bobby, pimm: Pimm };

export function FaceArt({ id, size = 120 }) {
  const draw = ART[id];
  if (!draw) return null;
  const key = `tf${++uid}`;
  return html`<svg class="face-art" width=${size} height=${size} viewBox="0 0 120 120" aria-hidden="true">${draw(key)}</svg>`;
}

// A face as shown in the app: the host's picture if one was uploaded, otherwise the drawing.
export function TourFace({ d, id, size }) {
  const src = d.tour.faces[id];
  return src
    ? html`<img class="face-photo" src=${src} alt="" width=${size} height=${size} draggable="false" />`
    : html`<${FaceArt} id=${id} size=${size} />`;
}
