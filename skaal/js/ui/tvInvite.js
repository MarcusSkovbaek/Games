// Top right on both big screens (party and pub golf): the way in — QR code and event code — and
// a full-screen button.
import { html, Icon } from './kit.js';
import { formatCode } from '../core/ids.js';
import { QR } from './qr.js';
import { eventLink } from './router.js';

export function TvInvite({ code }) {
  return html`<div class="tv__invite">
    <${QR} text=${eventLink(code)} label="QR-kode til eventet" />
    <div class="tv__invite-text">
      <div class="code-label">Scan for at deltage</div>
      <div class="code-display tv__code">${formatCode(code)}</div>
      <button type="button" class="btn btn--ghost btn--sm tv__full" onClick=${() => document.documentElement.requestFullscreen?.()}>
        <${Icon} name="maximize-2" size=${15} /><span class="btn__label">Fuld skærm</span>
      </button>
    </div>
  </div>`;
}
