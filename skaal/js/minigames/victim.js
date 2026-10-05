import { html, useEffect, useRef, useState, Avatar, cx } from '../ui/kit.js';
import { pick, shuffle, seededRandom } from '../core/rng.js';
import { now } from '../core/clock.js';
import { sfx } from '../ui/feedback.js';
import { playerOf } from './common.js';
import { unitText } from '../ui/format.js';

const ITEM_H = 84;

export default {
  id: 'victim',
  name: 'Hvem drikker?',
  emoji: '🎯',
  color: '#FF5C7A',
  tagline: 'Skæbnehjulet vælger et offer',
  minPlayers: 2,
  weight: 0.8,
  duration: 8000,
  respond: null,

  setup({ rng, players }) {
    const roll = rng();
    const punishment = roll < 0.2 ? { n: 1, unit: 'shot' } : { n: 2 + Math.floor(rng() * 3), unit: 'sip' };
    return { pid: pick(rng, players), ...punishment };
  },

  resolve({ p, eligible }) {
    return {
      penalties: eligible.includes(p.pid) ? [{ pid: p.pid, n: p.n, unit: p.unit }] : [],
      bonus: [],
      summary: {},
    };
  },

  Play({ inst, d }) {
    const reel = useRef(null);
    const items = useRef(null);
    if (!items.current) {
      const rand = seededRandom(inst.gid);
      const seq = [];
      while (seq.length < 26) seq.push(...shuffle(rand, inst.eligible));
      seq.length = 26;
      seq.push(inst.p.pid);
      items.current = seq;
    }
    const [, setFrame] = useState(0);
    useEffect(() => {
      let raf;
      let last = -1;
      const total = items.current.length - 1;
      const step = () => {
        const k = Math.min(1, Math.max(0, (now() - inst.playStart) / (inst.dur - 600)));
        const eased = 1 - (1 - k) ** 4;
        const pos = eased * total;
        if (reel.current) reel.current.style.transform = `translateY(${-pos * ITEM_H}px)`;
        const idx = Math.round(pos);
        if (idx !== last) {
          if (last !== -1 && k < 1) sfx.tick();
          last = idx;
          setFrame(idx);
        }
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }, []);
    return html`<div class="mg">
      <div class="mg-reel">
        <div class="mg-reel__window">
          <div class="mg-reel__strip" ref=${reel}>
            ${items.current.map(
              (pid) => html`<div class="mg-reel__item">
                <${Avatar} player=${playerOf(d, pid)} size=${56} />
                <span>${playerOf(d, pid).name}</span>
              </div>`,
            )}
          </div>
        </div>
        <div class="mg-reel__marker" aria-hidden="true"></div>
      </div>
      <p class="mg-note">Hvem bliver det…?</p>
    </div>`;
  },

  Result({ inst, d, me }) {
    const p = playerOf(d, inst.p.pid);
    return html`<div class="mg">
      <div class=${cx('mg-victim', inst.p.pid === me && 'is-me')}>
        <${Avatar} player=${p} size=${108} ring />
        <div class="mg-victim__name">${inst.p.pid === me ? 'DIG!' : p.name}</div>
        <div class="mg-victim__what">drikker ${unitText(inst.p.n, inst.p.unit)}</div>
      </div>
    </div>`;
  },
};
