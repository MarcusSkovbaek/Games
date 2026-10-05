import { html, cx } from '../ui/kit.js';
import { pickFresh, shuffle } from '../core/rng.js';
import { QUIZ } from '../game/content/quiz.js';
import { AnsweredCount, PenaltyList, Spectating } from './common.js';

const LETTERS = ['A', 'B', 'C', 'D'];

export default {
  id: 'quiz',
  name: 'Quiz',
  emoji: '🧠',
  color: '#5B8CFF',
  tagline: 'Forkert svar = 2 slurke. Hurtigst rigtige får et bonuspoint',
  minPlayers: 2,
  weight: 1,
  duration: 20000,
  respond: 'first',

  setup({ rng, history }) {
    const q = pickFresh(rng, QUIZ.length, history.map((p) => p.q));
    return { q, order: shuffle(rng, QUIZ[q].a.map((_, i) => i)) };
  },

  // Displayed option index of the correct answer.
  correctIndex(p) {
    return p.order.indexOf(0);
  },

  resolve({ p, responses, eligible, settings }) {
    const correct = p.order.indexOf(0);
    const right = [];
    const wrong = [];
    for (const pid of eligible) {
      const r = responses.get(pid);
      if (!r || typeof r.v?.a !== 'number') continue;
      if (r.v.a === correct) right.push({ pid, ms: Number(r.v.ms) || 0 });
      else wrong.push(pid);
    }
    right.sort((a, b) => a.ms - b.ms);
    const fastest = right[0]?.pid || null;
    return {
      penalties: wrong.map((pid) => ({ pid, n: 2, unit: 'sip' })),
      bonus: fastest && settings.bonus && eligible.length > 1 ? [{ pid: fastest, n: 1 }] : [],
      summary: { correct, right, wrong, fastest },
    };
  },

  Play({ inst, responses, mine, respond, canRespond, shownAt }) {
    const item = QUIZ[inst.p.q];
    const answered = typeof mine?.v?.a === 'number';
    return html`<div class="mg">
      <div class="mg-card">
        <div class="mg-kicker">Quiz</div>
        <div class="mg-q mg-q--md">${item.q}</div>
      </div>
      ${canRespond
        ? html`<div class="mg-options">
            ${inst.p.order.map(
              (orig, i) => html`<button
                type="button"
                class=${cx('mg-option', answered && mine.v.a === i && 'is-mine')}
                disabled=${answered}
                onClick=${() => respond({ a: i, ms: Math.max(0, Math.round(performance.now() - shownAt)) })}
              >
                <span class="mg-option__letter">${LETTERS[i]}</span>
                <span class="mg-option__text">${item.a[orig]}</span>
              </button>`,
            )}
          </div>`
        : html`<${Spectating} />`}
      ${answered ? html`<p class="mg-note">Svar låst 🔒 — venter på de andre…</p>` : null}
      <${AnsweredCount} inst=${inst} responses=${responses} />
    </div>`;
  },

  Result({ inst, d, me, result, mine }) {
    const item = QUIZ[inst.p.q];
    const { correct, fastest } = result.summary;
    return html`<div class="mg">
      <div class="mg-card mg-card--compact">
        <div class="mg-kicker">Quiz</div>
        <div class="mg-q mg-q--sm">${item.q}</div>
      </div>
      <div class="mg-options mg-options--result">
        ${inst.p.order.map(
          (orig, i) => html`<div class=${cx('mg-option', i === correct && 'is-correct', mine?.v?.a === i && i !== correct && 'is-wrong')}>
            <span class="mg-option__letter">${LETTERS[i]}</span>
            <span class="mg-option__text">${item.a[orig]}</span>
          </div>`,
        )}
      </div>
      ${fastest ? html`<p class="mg-note">⚡ Hurtigst med det rigtige svar: <strong>${fastest === me ? 'dig' : d.players.get(fastest)?.name}</strong></p>` : null}
      <${PenaltyList} d=${d} result=${result} me=${me} emptyText="Ingen svarede forkert. Kloge hoveder! 🧠" />
    </div>`;
  },
};
