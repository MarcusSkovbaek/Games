// Shared UI building blocks. Preact + htm, no build step.
import { h, render, Fragment } from '../vendor/preact.mjs';
import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect, useReducer, useErrorBoundary } from '../vendor/hooks.mjs';
import htm from '../vendor/htm.mjs';
import { ICONS } from './icons.js';
import { now } from '../core/clock.js';

export const html = htm.bind(h);
export { h, render, Fragment, useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect, useReducer, useErrorBoundary };

export const cx = (...parts) => parts.filter(Boolean).join(' ');

// ------------------------------------------------------------------------------------- store

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      for (const fn of [...subs]) fn(state);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function useStore(store, selector = (s) => s) {
  const [, force] = useReducer((x) => x + 1, 0);
  const selRef = useRef(selector);
  selRef.current = selector;
  const valueRef = useRef();
  valueRef.current = selector(store.get());
  useEffect(
    () =>
      store.subscribe((s) => {
        const next = selRef.current(s);
        if (!Object.is(next, valueRef.current)) force();
      }),
    [store],
  );
  return valueRef.current;
}

// Re-render every `ms` (aligned to the shared clock) while mounted.
export function useNow(ms = 1000) {
  const [t, setT] = useState(now);
  useEffect(() => {
    let timer;
    const tick = () => {
      setT(now());
      timer = setTimeout(tick, ms - (now() % ms) + 5);
    };
    timer = setTimeout(tick, ms - (now() % ms) + 5);
    return () => clearTimeout(timer);
  }, [ms]);
  return t;
}

// ------------------------------------------------------------------------------------ atoms

export function Icon({ name, size = 20, stroke = 2, class: className, style }) {
  const inner = ICONS[name];
  if (!inner) return null;
  return html`<svg
    class=${cx('icon', className)}
    width=${size}
    height=${size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width=${stroke}
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    style=${style}
    dangerouslySetInnerHTML=${{ __html: inner }}
  ></svg>`;
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = [...parts[0]][0] || '';
  const second = parts.length > 1 ? [...parts[parts.length - 1]][0] || '' : '';
  return (first + second).toUpperCase();
}

export function Avatar({ player, size = 44, online, ring, class: className, badge }) {
  const style = { '--av': `${size}px`, '--av-color': player?.color || '#8B5CF6' };
  return html`<span class=${cx('avatar', ring && 'avatar--ring', className)} style=${style}>
    ${player?.photo
      ? html`<img src=${player.photo} alt="" loading="lazy" decoding="async" draggable="false" />`
      : html`<span class="avatar__initials">${initials(player?.name)}</span>`}
    ${online ? html`<span class="avatar__dot" aria-label="Online"></span>` : null}
    ${badge ? html`<span class="avatar__badge">${badge}</span>` : null}
  </span>`;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  block,
  class: className,
  children,
  type = 'button',
  ...rest
}) {
  return html`<button
    type=${type}
    class=${cx('btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', loading && 'is-loading', className)}
    disabled=${disabled || loading}
    ...${rest}
  >
    ${loading ? html`<span class="spinner" aria-hidden="true"></span>` : icon ? html`<${Icon} name=${icon} size=${size === 'lg' ? 22 : 18} />` : null}
    ${children != null ? html`<span class="btn__label">${children}</span>` : null}
    ${iconRight ? html`<${Icon} name=${iconRight} size=${18} />` : null}
  </button>`;
}

export function IconButton({ icon, label, class: className, size = 22, ...rest }) {
  return html`<button type="button" class=${cx('icon-btn', className)} aria-label=${label} title=${label} ...${rest}>
    <${Icon} name=${icon} size=${size} />
  </button>`;
}

export function Spinner({ size = 22 }) {
  return html`<span class="spinner" style=${{ width: `${size}px`, height: `${size}px` }} aria-label="Indlæser"></span>`;
}

export function Switch({ checked, onChange, label, hint, disabled }) {
  return html`<label class=${cx('switch-row', disabled && 'is-disabled')}>
    <span class="switch-row__text">
      <span class="switch-row__label">${label}</span>
      ${hint ? html`<span class="switch-row__hint">${hint}</span>` : null}
    </span>
    <input type="checkbox" role="switch" checked=${checked} disabled=${disabled} onChange=${(e) => onChange(e.currentTarget.checked)} />
    <span class="switch" aria-hidden="true"><span class="switch__knob"></span></span>
  </label>`;
}

export function Segmented({ options, value, onChange, class: className, size }) {
  return html`<div class=${cx('segmented', size && `segmented--${size}`, className)} role="tablist">
    ${options.map(
      (o) => html`<button
        type="button"
        role="tab"
        aria-selected=${o.value === value}
        class=${cx('segmented__opt', o.value === value && 'is-active')}
        onClick=${() => onChange(o.value)}
      >
        ${o.icon ? html`<span class="segmented__icon">${o.icon}</span>` : null}${o.label}
      </button>`,
    )}
  </div>`;
}

export function Chips({ options, value, onChange }) {
  return html`<div class="chips">
    ${options.map(
      (o) => html`<button type="button" class=${cx('chip', o.value === value && 'is-active')} aria-pressed=${o.value === value} onClick=${() => onChange(o.value)}>
        ${o.label}
      </button>`,
    )}
  </div>`;
}

export function Stepper({ value, onChange, steps, format = String }) {
  const i = Math.max(0, steps.indexOf(value));
  return html`<div class="stepper">
    <button type="button" class="stepper__btn" aria-label="Mindre" disabled=${i <= 0} onClick=${() => onChange(steps[i - 1])}>
      <${Icon} name="minus" size=${16} />
    </button>
    <span class="stepper__value">${format(value)}</span>
    <button type="button" class="stepper__btn" aria-label="Mere" disabled=${i >= steps.length - 1} onClick=${() => onChange(steps[i + 1])}>
      <${Icon} name="plus" size=${16} />
    </button>
  </div>`;
}

export function Ring({ progress = 0, size = 44, stroke = 4, color = 'var(--gold)', track = 'rgba(255,255,255,.12)', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return html`<span class="ring" style=${{ width: `${size}px`, height: `${size}px` }}>
    <svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${track} stroke-width=${stroke} />
      <circle
        cx=${size / 2}
        cy=${size / 2}
        r=${r}
        fill="none"
        stroke=${color}
        stroke-width=${stroke}
        stroke-linecap="round"
        stroke-dasharray=${c}
        stroke-dashoffset=${c * (1 - p)}
        transform=${`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
    <span class="ring__content">${children}</span>
  </span>`;
}

export function Empty({ icon = 'sparkles', title, text, children }) {
  return html`<div class="empty">
    <span class="empty__icon"><${Icon} name=${icon} size=${26} /></span>
    <div class="empty__title">${title}</div>
    ${text ? html`<p class="empty__text">${text}</p>` : null}
    ${children}
  </div>`;
}

// Animated number that counts towards its value.
export function CountUp({ value, format = (n) => String(n), duration = 700 }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    let raf;
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - k) ** 3;
      const v = from + (value - from) * eased;
      setShown(k >= 1 ? value : Math.round(v * 2) / 2);
      if (k < 1) raf = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = value;
    };
  }, [value]);
  return html`<span class="tabular">${format(shown)}</span>`;
}

// ----------------------------------------------------------------------------------- sheets

let sheetDepth = 0;

function lockScroll(on) {
  sheetDepth += on ? 1 : -1;
  document.documentElement.classList.toggle('scroll-locked', sheetDepth > 0);
}

// Bottom sheet. Closes on backdrop tap, Escape or a downward swipe on the handle.
export function Sheet({ open, onClose, title, subtitle, children, footer, size = 'auto', class: className, dismissible = true }) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef(null);
  const drag = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      lockScroll(true);
      let cancelled = false;
      requestAnimationFrame(() => requestAnimationFrame(() => !cancelled && setVisible(true)));
      return () => {
        cancelled = true;
        lockScroll(false);
      };
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 320);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissible]);

  useEffect(() => {
    if (visible && panelRef.current) {
      const focusable = panelRef.current.querySelector('[autofocus]');
      (focusable || panelRef.current).focus({ preventScroll: true });
    }
  }, [visible]);

  if (!mounted) return null;

  const onPointerDown = (e) => {
    if (!dismissible) return;
    drag.current = { y: e.clientY, dy: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current || !panelRef.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    panelRef.current.style.transform = `translateY(${drag.current.dy}px)`;
    panelRef.current.style.transition = 'none';
  };
  const onPointerUp = () => {
    if (!drag.current || !panelRef.current) return;
    const { dy } = drag.current;
    drag.current = null;
    panelRef.current.style.transition = '';
    panelRef.current.style.transform = '';
    if (dy > 90) onClose?.();
  };

  return html`<div class=${cx('sheet', visible && 'is-open', `sheet--${size}`, className)} role="dialog" aria-modal="true" aria-label=${title || 'Dialog'}>
    <div class="sheet__backdrop" onClick=${() => dismissible && onClose?.()}></div>
    <div class="sheet__panel" ref=${panelRef} tabindex="-1">
      <div class="sheet__grab" onPointerDown=${onPointerDown} onPointerMove=${onPointerMove} onPointerUp=${onPointerUp} onPointerCancel=${onPointerUp}>
        <span class="sheet__handle"></span>
      </div>
      ${title || dismissible
        ? html`<div class="sheet__head">
            <div class="sheet__titles">
              ${title ? html`<h2 class="sheet__title">${title}</h2>` : null}
              ${subtitle ? html`<p class="sheet__subtitle">${subtitle}</p>` : null}
            </div>
            ${dismissible ? html`<${IconButton} icon="x" label="Luk" class="sheet__close" onClick=${onClose} />` : null}
          </div>`
        : null}
      <div class="sheet__body">${children}</div>
      ${footer ? html`<div class="sheet__footer">${footer}</div>` : null}
    </div>
  </div>`;
}

// Promise-based confirm dialog rendered through the global UI store (see ui/app-ui.js).
export function ConfirmView({ dialog, onAnswer }) {
  return html`<${Sheet}
    open=${!!dialog}
    onClose=${() => onAnswer(false)}
    title=${dialog?.title}
    footer=${html`<div class="btn-row">
      <${Button} variant="secondary" block onClick=${() => onAnswer(false)}>${dialog?.cancel || 'Annullér'}<//>
      <${Button} variant=${dialog?.danger ? 'danger' : 'primary'} block onClick=${() => onAnswer(true)}>${dialog?.confirm || 'OK'}<//>
    </div>`}
  >
    ${dialog?.text ? html`<p class="muted">${dialog.text}</p>` : null}
  <//>`;
}
