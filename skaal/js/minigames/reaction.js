import { html, cx, useState, useRef, useEffect } from '../ui/kit.js';
import { sfx, haptic } from '../ui/feedback.js';
import { AnsweredCount, PenaltyList, Spectating, nameOf } from './common.js';

const FALSE_START = -1;

export default {
  id: 'reaction',
  name: 'Hurtigste finger',
  emoji: '⚡',
  color: '#2DD4BF',
  tagline: 'Tryk når skærmen bliver grøn. Langsomste drikker',
  minPlayers: 2,
  weight: 1,
  duration: 30000,
  respond: 'first',

  setup() {
    return {};
  },

  resolve({ responses, eligible, settings }) {
    const results = eligible
      .filter((pid) => responses.has(pid))
      .map((pid) => {
        const v = Number(responses.get(pid).v);
        return { pid, ms: Number.isFinite(v) && v >= 60 ? Math.min(v, 9999) : FALSE_START };
      });
    const valid = results.filter((r) => r.ms !== FALSE_START).sort((a, b) => a.ms - b.ms);
    const falseStarts = results.filter((r) => r.ms === FALSE_START).map((r) => r.pid);
    const penalties = falseStarts.map((pid) => ({ pid, n: 2, unit: 'sip' }));
    if (valid.length >= 2) penalties.push({ pid: valid[valid.length - 1].pid, n: 2, unit: 'sip' });
    return {
      penalties,
      bonus: valid.length >= 2 && settings.bonus ? [{ pid: valid[0].pid, n: 1 }] : [],
      summary: { valid, falseStarts },
    };
  },

  Play({ inst, responses, mine, respond, canRespond }) {
    const [state, setState] = useState(mine ? 'done' : 'idle');
    const goAt = useRef(0);
    const timer = useRef(null);
    useEffect(() => () => clearTimeout(timer.current), []);
    useEffect(() => {
      if (mine && state !== 'done' && state !== 'false') setState(mine.v === FALSE_START ? 'false' : 'done');
    }, [mine]);

    if (!canRespond) {
      return html`<div class="mg"><${Spectating} /><${AnsweredCount} inst=${inst} responses=${responses} /></div>`;
    }

    const onDown = (e) => {
      e.preventDefault();
      if (state === 'idle') {
        setState('wait');
        timer.current = setTimeout(() => {
          goAt.current = performance.now();
          setState('go');
          sfx.go();
          haptic(30);
        }, 1400 + Math.random() * 2600);
      } else if (state === 'wait') {
        clearTimeout(timer.current);
        setState('false');
        sfx.fail();
        respond(FALSE_START);
      } else if (state === 'go') {
        const ms = Math.round(performance.now() - goAt.current);
        setState('done');
        respond(ms < 60 ? FALSE_START : ms);
      }
    };

    const label = {
      idle: html`<strong>Tryk for at starte</strong><span>Vent derefter på grønt</span>`,
      wait: html`<strong>Vent…</strong><span>Ikke endnu!</span>`,
      go: html`<strong>TRYK NU!</strong>`,
      done: html`<strong>${mine?.v > 0 ? `${mine.v} ms` : '…'}</strong><span>Din reaktionstid</span>`,
      false: html`<strong>Tyvstart! 😬</strong><span>Det koster 2 slurke</span>`,
    }[state];

    return html`<div class="mg">
      <button type="button" class=${cx('mg-reaction', `is-${state}`)} onPointerDown=${onDown} disabled=${state === 'done' || state === 'false'}>
        ${label}
      </button>
      <${AnsweredCount} inst=${inst} responses=${responses} />
    </div>`;
  },

  Result({ d, me, result }) {
    const { valid, falseStarts } = result.summary;
    return html`<div class="mg">
      <div class="mg-times">
        ${valid.map(
          (r, i) => html`<div class=${cx('mg-time', r.pid === me && 'is-me')}>
            <span class="mg-time__rank">${i === 0 ? '🥇' : `${i + 1}.`}</span>
            <span class="mg-time__name">${r.pid === me ? 'Dig' : nameOf(d, r.pid)}</span>
            <span class="mg-time__ms">${r.ms} ms</span>
          </div>`,
        )}
        ${falseStarts.map(
          (pid) => html`<div class=${cx('mg-time is-false', pid === me && 'is-me')}>
            <span class="mg-time__rank">✋</span>
            <span class="mg-time__name">${pid === me ? 'Dig' : nameOf(d, pid)}</span>
            <span class="mg-time__ms">Tyvstart</span>
          </div>`,
        )}
      </div>
      <${PenaltyList} d=${d} result=${result} me=${me} emptyText="For få deltog til en vinder — prøv igen næste gang!" />
    </div>`;
  },
};
