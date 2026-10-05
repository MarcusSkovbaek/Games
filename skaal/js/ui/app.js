// Root component: routing, toasts, confirm dialogs and a crash screen.
import { html, useStore, useErrorBoundary, ConfirmView, Button } from './kit.js';
import { route } from './router.js';
import { ui, dismissToast, answerDialog } from './ui-store.js';
import { normalizeCode } from '../core/ids.js';
import { Landing } from './screens/landing.js';
import { Create } from './screens/create.js';
import { JoinCode } from './screens/join.js';
import { EventRoute } from './screens/event.js';
import { TvRoute } from './screens/tv.js';

export function App() {
  const [error, reset] = useErrorBoundary((err) => console.error('[app] render error', err));
  const r = useStore(route);
  if (error) {
    return html`<main class="fatal">
      <div class="stack" style=${{ alignItems: 'center', maxWidth: '340px' }}>
        <span style=${{ fontSize: '54px' }}>🫗</span>
        <h1 style=${{ fontSize: '26px' }}>Ups — noget gik galt</h1>
        <p class="muted">Dine data er gemt. Genindlæs appen for at fortsætte.</p>
        <${Button} icon="refresh-cw" onClick=${() => location.reload()}>Genindlæs<//>
        <${Button} variant="ghost" onClick=${reset}>Prøv uden at genindlæse<//>
      </div>
    </main>`;
  }
  let screen;
  switch (r.name) {
    case 'ny':
      screen = html`<${Create} />`;
      break;
    case 'deltag':
      screen = html`<${JoinCode} initial=${r.param} />`;
      break;
    case 'e':
    case 'join':
      screen = html`<${EventRoute} key=${r.param} code=${normalizeCode(r.param)} />`;
      break;
    case 'tv':
      screen = html`<${TvRoute} key=${r.param} code=${normalizeCode(r.param)} />`;
      break;
    default:
      screen = html`<${Landing} />`;
  }
  return html`${screen}<${Toasts} /><${Confirm} />`;
}

function Toasts() {
  const toasts = useStore(ui, (s) => s.toasts);
  return html`<div class="toasts" aria-live="polite" role="status">
    ${toasts.map(
      (t) => html`<div class=${`toast toast--${t.tone}`} key=${t.id}>
        ${t.icon ? html`<span class="toast__icon" aria-hidden="true">${t.icon}</span>` : null}
        <span>${t.text}</span>
        ${t.action
          ? html`<button
              type="button"
              class="toast__action"
              onClick=${() => {
                dismissToast(t.id);
                t.action.onClick();
              }}
            >
              ${t.action.label}
            </button>`
          : null}
      </div>`,
    )}
  </div>`;
}

function Confirm() {
  const dialog = useStore(ui, (s) => s.dialog);
  return html`<${ConfirmView} dialog=${dialog} onAnswer=${answerDialog} />`;
}

