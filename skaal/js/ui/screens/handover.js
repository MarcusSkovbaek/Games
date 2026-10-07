// The host hands the role over — say, on going home early. The new host gets the host's rights;
// what the host did until now keeps counting (see game/hosts.js).
import { html, useEffect, useRef, Sheet, Avatar, Icon } from '../kit.js';
import { handOverHost } from '../../app/actions.js';
import { confirmDialog, toast } from '../ui-store.js';

export function HandOverSheet({ room, d, open, onClose }) {
  const others = d.ranking.filter((p) => !p.left && !p.isMe);
  const pick = async (p) => {
    const ok = await confirmDialog({
      title: `Gør ${p.name} til vært?`,
      text: `${p.name} får værtens rettigheder — indstillinger, afslutte eventet, fjerne spillere og skjule billeder${d.pg ? ' og vælge dommer' : ''}. Du er ikke længere vært, men det, du har gjort som vært, gælder stadig.`,
      confirm: 'Gør til vært',
    });
    if (!ok) return;
    handOverHost(room, p.pid);
    toast(`👑 ${p.name} er nu vært`, { tone: 'good' });
    onClose();
  };
  return html`<${Sheet} open=${open} onClose=${onClose} title="Overdrag værtsrollen" subtitle="Fx hvis du går tidligt — så kan du forlade eventet bagefter.">
    ${others.length
      ? html`<div class="list">
          ${others.map(
            (p) => html`<button type="button" class="list-item" onClick=${() => pick(p)}>
              <${Avatar} player=${p} size=${40} online=${p.online} />
              <span class="list-item__text">
                <span class="list-item__title">${p.name}</span>
                <span class="list-item__sub">${p.online ? 'Online nu' : 'Ikke online lige nu'}</span>
              </span>
              <${Icon} name="chevron-right" size=${18} />
            </button>`,
          )}
        </div>`
      : html`<p class="muted">Der er ingen andre i eventet endnu.</p>`}
  <//>`;
}

// In the host's list in "Mig".
export function HandOverItem({ onClick }) {
  return html`<button type="button" class="list-item" onClick=${onClick}>
    <span class="list-item__icon"><${Icon} name="crown" size=${18} /></span>
    <span class="list-item__text"><div class="list-item__title">Overdrag værtsrollen</div><div class="list-item__sub">Giv en anden værtens rettigheder</div></span>
    <${Icon} name="chevron-right" size=${18} />
  </button>`;
}

// The one who just became host hears about it.
export function useBecameHost(d, where) {
  const was = useRef(d.isHost);
  useEffect(() => {
    if (d.isHost && !was.current) toast(`👑 Du er nu vært — værtens muligheder ligger under ${where}`, { tone: 'good', duration: 6000 });
    was.current = d.isHost;
  }, [d.isHost]);
}
