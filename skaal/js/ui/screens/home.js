import { html, Avatar, Button, Icon, CountUp, cx } from '../kit.js';
import { DrinkArt } from '../drinkArt.js';
import { enabledDrinks, pointsFor } from '../../game/settings.js';
import { drinkById } from '../../game/drinks.js';
import { wheelById } from '../../game/wheels.js';
import { logDrink, undo, acknowledge, setPaused } from '../../app/actions.js';
import { fmtPoints, fmtDecimal, fmtDuration } from '../format.js';
import { sfx, haptic, confetti } from '../feedback.js';
import { toast } from '../ui-store.js';
import { obligationTitle, obligationEmoji } from '../feedText.js';
import { eventUi } from './event.js';
import { FeedRow } from './feed.js';

export function HomeTab({ room, d }) {
  const me = d.mePlayer;
  if (!me) return null;
  return html`<div class="stack stack--l">
    <h1 class="sr-only">Drik — ${d.meta.name}</h1>
    ${d.ended ? html`<div class="offline-note"><${Icon} name="flag" size=${16} />Eventet er afsluttet — drinks kan ikke længere registreres.</div>` : null}
    <${Hero} d=${d} me=${me} />
    <${ActionItems} room=${room} d=${d} />
    <${Boosts} d=${d} />
    <section class="section">
      <div class="section__head">
        <h2 class="section__title">Hvad drikker du?</h2>
        <span class="faint hide-narrow" style=${{ fontSize: '13px' }}>Tryk for at registrere</span>
      </div>
      <${DrinkGrid} room=${room} d=${d} me=${me} />
    </section>
    <${NextUp} room=${room} d=${d} me=${me} />
    <${RecentActivity} room=${room} d=${d} />
  </div>`;
}

function Hero({ d, me }) {
  const ranked = d.ranking.filter((p) => !p.left);
  const total = ranked.length;
  const above = d.ranking[me.rank - 2];
  const below = d.ranking[me.rank];
  let gap = null;
  if (total > 1 && me.points > 0) {
    if (me.rank === 1) {
      const lead = me.points - (below?.points || 0);
      gap = lead > 0 ? html`👑 Du fører med <strong>${fmtPoints(lead)} point</strong>` : html`👑 Du fører — men det er tæt!`;
    } else if (above) {
      const diff = above.points - me.points;
      gap = html`<strong>${fmtPoints(diff)} point</strong> op til ${above.name} på ${me.rank - 1}.-pladsen`;
    }
  } else if (total > 1) {
    gap = html`Registrér din første drink og kom på tavlen`;
  }
  return html`<section class="hero" aria-label="Din status">
    <div class="hero__top">
      <${Avatar} player=${me} size=${58} ring />
      <div class="hero__who">
        <div class="hero__hello">${me.paused ? 'Holder pause ⏸️' : 'Skål,'}</div>
        <div class="hero__name">${me.name}</div>
      </div>
      <div class="hero__rank" aria-label=${me.points > 0 ? `Placering ${me.rank} af ${total}` : 'Ingen placering endnu'}>
        <span class="hero__rank-num">${me.points > 0 ? html`#${me.rank}<small> /${total}</small>` : html`–<small> /${total}</small>`}</span>
        <span class="hero__rank-label">placering</span>
      </div>
    </div>
    <div class="hero__stats">
      <div class="stat"><div class="stat__value"><${CountUp} value=${me.points} format=${fmtPoints} /></div><div class="stat__label">Point</div></div>
      <div class="stat"><div class="stat__value"><${CountUp} value=${me.alcoholic} /></div><div class="stat__label">Drinks</div></div>
      <div class="stat"><div class="stat__value">${me.pace ? fmtDecimal(me.pace) : '–'}</div><div class="stat__label">pr. time</div></div>
    </div>
    ${gap ? html`<div class="hero__gap">${gap}</div>` : null}
  </section>`;
}

function ActionItems({ room, d }) {
  const offers = d.offers;
  const inbox = d.inbox;
  if (!offers.length && !inbox.length) return null;
  const me = d.mePlayer;
  return html`<section class="section" aria-label="Venter på dig">
    ${offers.map((o) => {
      const wheel = wheelById(o.w);
      return html`<button type="button" class="offer-card" onClick=${() => eventUi.set({ spin: o.id })}>
        <span class="offer-card__emoji">${wheel?.emoji || '🎡'}</span>
        <span class="spacer" style=${{ textAlign: 'left' }}>
          <span class="offer-card__title">Du har et spin klar!</span>
          <span class="offer-card__sub" style=${{ display: 'block' }}>${wheel?.name} · ${wheel?.why}</span>
        </span>
        <${Icon} name="chevron-right" size=${20} />
      </button>`;
    })}
    ${inbox.slice(0, 5).map((ob) => html`<${InboxCard} room=${room} d=${d} ob=${ob} shields=${me.shields} />`)}
    ${inbox.length > 5 ? html`<p class="faint" style=${{ textAlign: 'center', fontSize: '13px' }}>+ ${inbox.length - 5} mere</p>` : null}
  </section>`;
}

export function InboxCard({ room, d, ob, shields }) {
  const owe = ob.kind === 'owe';
  const canShield = !owe && !ob.self && shields > 0;
  // Game penalties already name the game in the title.
  const why = ob.why ? wheelById(ob.why.wheel)?.name : null;
  const ack = (how) => {
    acknowledge(room, ob.key, how);
    if (how === 'shield') {
      sfx.pop();
      toast('Skjold brugt — du slap! 🛡️', { tone: 'good' });
    } else {
      sfx.clink();
      haptic(15);
      toast(owe ? 'Godt gået — gælden er betalt 🎁' : 'Skål! 🍻', { tone: 'good' });
    }
  };
  return html`<div class=${cx('inbox-card', owe && 'inbox-card--owe')}>
    <span style=${{ fontSize: '26px' }} aria-hidden="true">${obligationEmoji(ob)}</span>
    <div class="inbox-card__text">
      <div>${obligationTitle(d, ob)}</div>
      ${why ? html`<div class="inbox-card__sub">${why}</div>` : null}
    </div>
    ${canShield ? html`<button type="button" class="btn btn--secondary btn--sm" aria-label="Brug skjold" title="Brug skjold" onClick=${() => ack('shield')}>🛡️</button>` : null}
    <${Button} size="sm" variant=${owe ? 'secondary' : 'primary'} onClick=${() => ack('ok')}>${owe ? 'Givet ✓' : 'Skål ✓'}<//>
  </div>`;
}

function Boosts({ d }) {
  const items = [];
  for (const m of d.modifiers) {
    const drink = drinkById(m.k);
    items.push(html`<div class="banner banner--pulse" style=${{ '--c': 'var(--green)' }}>
      <span class="banner__icon">⏰</span>
      <span class="banner__text">
        <div class="banner__title">Happy Hour: ${drink?.name || 'drinks'} ×${m.mult}</div>
        <div class="banner__sub">Dobbelt point lige nu</div>
      </span>
      <span class="banner__aside">${fmtDuration(m.to - d.t)}</span>
    </div>`);
  }
  for (const r of d.rules) {
    items.push(html`<div class="banner" style=${{ '--c': 'var(--violet)' }}>
      <span class="banner__icon">📜</span>
      <span class="banner__text">
        <div class="banner__title">Regel</div>
        <div class="banner__sub">${r.text}</div>
      </span>
      <span class="banner__aside">${fmtDuration(r.to - d.t)}</span>
    </div>`);
  }
  return items.length ? html`<section class="section" aria-label="Aktive effekter">${items}</section>` : null;
}

const lastTap = new Map();

function spawnFloat(x, y, text) {
  const el = document.createElement('div');
  el.className = 'float-plus';
  el.setAttribute('aria-hidden', 'true');
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y - 30}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 7; i++) {
    const b = document.createElement('div');
    b.setAttribute('aria-hidden', 'true');
    const size = 6 + Math.random() * 10;
    b.className = 'bubble';
    b.style.width = b.style.height = `${size}px`;
    b.style.left = `${x - size / 2 + (Math.random() - 0.5) * 50}px`;
    b.style.top = `${y - size / 2}px`;
    b.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}px`);
    b.style.animationDelay = `${Math.random() * 0.15}s`;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 1400);
  }
}

function DrinkGrid({ room, d, me }) {
  const drinks = enabledDrinks(d.settings);
  const disabled = !!d.ended;
  const onDrink = (drink, ev) => {
    if (disabled) return;
    const t = Date.now();
    if (t - (lastTap.get(drink.id) || 0) < 450) return; // swallow accidental double taps
    lastTap.set(drink.id, t);
    const tile = ev.currentTarget;
    const rect = tile.getBoundingClientRect();
    const x = ev.clientX || rect.left + rect.width / 2;
    const y = ev.clientY || rect.top + rect.height / 2;
    const mult = d.modifiers.filter((m) => m.k === drink.id).reduce((a, m) => a * m.mult, 1);
    const pts = pointsFor(d.settings, drink.id) * mult;
    const { entry, offer } = logDrink(room, drink.id);
    tile.classList.remove('is-pop');
    void tile.offsetWidth;
    tile.classList.add('is-pop');
    spawnFloat(x, y, pts ? `+${fmtPoints(pts)}` : drink.emoji);
    sfx.clink();
    haptic(18);
    toast(`${drink.emoji} ${drink.name} registreret${pts ? ` · +${fmtPoints(pts)}` : ''}`, {
      key: 'drink',
      duration: 6000,
      action: {
        label: 'Fortryd',
        onClick: () => {
          undo(room, entry.id);
          toast('Fortrudt', { icon: '↩️' });
        },
      },
    });
    if (offer) {
      setTimeout(() => {
        sfx.fanfare();
        haptic([30, 50, 30]);
        confetti({ count: 70 });
        eventUi.set({ spin: offer.id });
      }, 650);
    }
  };

  const tiles = drinks.filter((dr) => dr.alcoholic);
  const extras = drinks.filter((dr) => !dr.alcoholic);
  const tile = (drink, wide) => {
    const mult = d.modifiers.filter((m) => m.k === drink.id).reduce((a, m) => a * m.mult, 1);
    const pts = pointsFor(d.settings, drink.id) * mult;
    const count = me.counts[drink.id] || 0;
    return html`<button
      type="button"
      class=${cx('drink-tile', wide && 'drink-tile--wide')}
      style=${{ '--c': drink.color }}
      disabled=${disabled}
      aria-label=${`Registrér ${drink.phrase}. Du har ${count}.`}
      onClick=${(ev) => onDrink(drink, ev)}
    >
      <span class="drink-tile__art"><${DrinkArt} id=${drink.id} size=${wide ? 52 : 78} /></span>
      ${wide
        ? html`<span class="drink-tile__wide-text">
              <span class="drink-tile__name">${drink.name}</span>
              <span class="drink-tile__pts">${drink.alcoholic ? `+${fmtPoints(pts)} point` : 'Hold dig hydreret · 0 point'}</span>
            </span>
            <span class="drink-tile__count" style=${{ marginLeft: 'auto' }}>${count}</span>`
        : html`<span class="drink-tile__count">${count}</span>
            <span class="drink-tile__name">${drink.name}</span>
            <span class=${cx('drink-tile__pts', mult > 1 && 'is-boost')}>+${fmtPoints(pts)} point${mult > 1 ? ` · ×${mult}` : ''}</span>`}
      <span class="drink-tile__plus" aria-hidden="true"><${Icon} name="plus" size=${20} stroke=${2.6} /></span>
    </button>`;
  };
  return html`<div class="drink-grid">${tiles.map((dr) => tile(dr, false))}${extras.map((dr) => tile(dr, true))}</div>`;
}

function NextUp({ room, d, me }) {
  if (d.ended) return null;
  if (me.paused) {
    return html`<div class="banner" style=${{ '--c': 'var(--blue)' }}>
      <span class="banner__icon">⏸️</span>
      <span class="banner__text">
        <div class="banner__title">Du holder pause</div>
        <div class="banner__sub">Du er ude af minigames og straffe, indtil du er tilbage.</div>
      </span>
      <${Button} size="sm" variant="secondary" onClick=${() => setPaused(room, false)}>Tilbage<//>
    </div>`;
  }
  const next = d.nextAuto;
  if (!next || d.activeGame) return null;
  const left = next.start - d.t;
  return html`<button type="button" class="banner" style=${{ '--c': 'var(--teal)' }} onClick=${() => eventUi.set({ tab: 'games' })}>
    <span class="banner__icon">🎲</span>
    <span class="banner__text">
      <div class="banner__title">Næste breaker</div>
      <div class="banner__sub">Et overraskelses-minigame for alle</div>
    </span>
    <span class="banner__aside">${fmtDuration(left)}</span>
  </button>`;
}

function RecentActivity({ room, d }) {
  const items = d.feed.filter((f) => f.kind !== 'join').slice(0, 4);
  if (!items.length) return null;
  return html`<section class="section">
    <div class="section__head">
      <h2 class="section__title">Seneste</h2>
      <button type="button" class="section__link" onClick=${() => eventUi.set({ tab: 'feed' })}>Se alle</button>
    </div>
    <div class="card" style=${{ padding: '2px 14px' }}>
      <div class="feed">${items.map((item) => html`<${FeedRow} key=${item.key} room=${room} d=${d} item=${item} compact />`)}</div>
    </div>
  </section>`;
}
