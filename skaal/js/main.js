// Entry point.
import { html, render } from './ui/kit.js';
import { App } from './ui/app.js';
import { hasWebCrypto } from './core/crypto.js';
import { installAudioUnlock } from './ui/feedback.js';
import { isDevMode } from './config.js';
import { setClockOffset, getClockOffset, now } from './core/clock.js';
import { session, getDerived, invalidateDerived } from './app/session.js';
import { song } from './ui/tourSong.js';
import { eventUi } from './ui/screens/event.js';

const root = document.getElementById('app');

if (!hasWebCrypto()) {
  render(
    html`<main class="fatal">
      <div class="stack" style=${{ alignItems: 'center', maxWidth: '340px' }}>
        <span style=${{ fontSize: '54px' }}>🔒</span>
        <h1 style=${{ fontSize: '24px' }}>Åbn SKÅL via https</h1>
        <p class="muted">Appen krypterer alt med eventets kode, og det kræver en sikker forbindelse (https). Åbn linket i en almindelig browser.</p>
      </div>
    </main>`,
    root,
  );
} else {
  installAudioUnlock();
  render(html`<${App} />`, root);

  const params = new URLSearchParams(location.search);
  const canSw = 'serviceWorker' in navigator && (location.protocol === 'https:' || params.has('sw')) && !params.has('nosw');
  if (canSw) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[sw]', err)));
  }

  if (isDevMode()) {
    // Debug hooks used by the automated tests (only on localhost / ?dev).
    window.__skaal = {
      setClockOffset: (ms) => {
        setClockOffset(ms);
        invalidateDerived();
      },
      getClockOffset,
      now,
      session,
      derived: () => (session.get().room ? getDerived(session.get().room) : null),
      song,
      ui: eventUi,
    };
  }
}
