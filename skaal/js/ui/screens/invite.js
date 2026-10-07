import { html, Sheet, Button, Avatar } from '../kit.js';
import { QR } from '../qr.js';
import { formatCode } from '../../core/ids.js';
import { eventLink, tvLink } from '../router.js';
import { toast } from '../ui-store.js';

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

// Text for a group chat: the phone's share sheet where there is one, otherwise the clipboard.
export async function shareText(title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  if (await copyText(text)) toast('Kopieret — sæt det ind i jeres gruppechat 📋', { tone: 'good' });
}

export function InviteSheet({ room, d, open, onClose }) {
  const link = eventLink(room.code);
  const players = d.ranking.filter((p) => !p.left);

  const share = async () => {
    const data = { title: `SKÅL · ${d.meta.name}`, text: `Kom med i "${d.meta.name}" på SKÅL 🍻 Kode: ${formatCode(room.code)}`, url: link };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    if (await copyText(link)) toast('Link kopieret 📋', { tone: 'good' });
  };

  return html`<${Sheet} open=${open} onClose=${onClose} title="Invitér til festen" subtitle=${d.meta.name}>
    <div class="invite">
      <${QR} text=${link} label="QR-kode til eventet" />
      <div>
        <div class="code-label">Eventkode</div>
        <div class="code-display" aria-label=${`Kode ${room.code.split('').join(' ')}`}>${formatCode(room.code)}</div>
      </div>
      <p class="muted" style=${{ fontSize: '14px', maxWidth: '320px' }}>
        Scan QR-koden med kameraet, eller åbn appen og tast koden under "Deltag".
      </p>
      <div class="stack stack--s" style=${{ width: '100%' }}>
        <${Button} block icon="share-2" onClick=${share}>Del invitation<//>
        <div class="btn-row">
          <${Button}
            variant="secondary"
            icon="link"
            onClick=${async () => (await copyText(link)) && toast('Link kopieret 📋', { tone: 'good' })}
          >Kopiér link<//>
          <${Button}
            variant="secondary"
            icon="copy"
            onClick=${async () => (await copyText(formatCode(room.code))) && toast('Kode kopieret 📋', { tone: 'good' })}
          >Kopiér kode<//>
        </div>
        <a class="btn btn--ghost btn--md" href=${tvLink(room.code)} target="_blank" rel="noopener">
          <span class="btn__label">📺 Vis stillingen på storskærm</span>
        </a>
      </div>
      ${players.length
        ? html`<div class="row" style=${{ justifyContent: 'center' }}>
            <span class="avatar-stack">${players.slice(0, 8).map((p) => html`<${Avatar} player=${p} size=${30} />`)}</span>
            <span class="faint" style=${{ fontSize: '13px' }}>${players.length} med i festen</span>
          </div>`
        : null}
    </div>
  <//>`;
}
