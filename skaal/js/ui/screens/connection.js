// "Forbindelse": a self-check panel showing each sync server, so players can see at a glance
// whether their phone is connected (and why not, if a network blocks a broker).
import { html, useStore, Sheet, Icon, cx } from '../kit.js';
import { session } from '../../app/session.js';

const LABEL = { online: 'Forbundet', connecting: 'Forbinder…', offline: 'Ingen forbindelse', idle: 'Venter', stopped: 'Stoppet' };

export function ConnectionSheet({ room, d, open, onClose }) {
  const sync = useStore(session, (s) => s.sync) || room.status;
  const online = sync.online || 0;
  const players = d.ranking.filter((p) => !p.left);
  const onlinePlayers = players.filter((p) => p.online).length;
  return html`<${Sheet} open=${open} onClose=${onClose} title="Forbindelse" subtitle=${online ? 'Alt kører — ændringer deles med det samme.' : 'Offline — alt gemmes på telefonen og sendes, når nettet er tilbage.'}>
    <div class="stack">
      <div class="list">
        ${sync.brokers.map(
          (b, i) => html`<div class="list-item">
            <span class=${cx('sync-dot', `is-${b.status === 'online' ? 'online' : b.status === 'connecting' ? 'connecting' : 'offline'}`)} aria-hidden="true"></span>
            <span class="list-item__text">
              <span class="list-item__title">Server ${i + 1}</span>
              <span class="list-item__sub">${room.brokers[i]?.cfg.url.replace(/^wss?:\/\//, '').split('/')[0]}</span>
            </span>
            <span class="faint" style=${{ fontSize: '13px', fontWeight: 600 }}>${LABEL[b.status] || b.status}</span>
          </div>`,
        )}
      </div>
      <div class="list">
        <div class="list-item">
          <span class="list-item__icon"><${Icon} name="lock" size=${18} /></span>
          <span class="list-item__text">
            <span class="list-item__title">End-to-end krypteret</span>
            <span class="list-item__sub">AES-256 med en nøgle afledt af eventkoden</span>
          </span>
        </div>
        <div class="list-item">
          <span class="list-item__icon"><${Icon} name="users" size=${18} /></span>
          <span class="list-item__text">
            <span class="list-item__title">${onlinePlayers} af ${players.length} deltagere har appen åben</span>
            <span class="list-item__sub">Grøn prik ved navnet = online lige nu</span>
          </span>
        </div>
        <div class="list-item">
          <span class="list-item__icon"><${Icon} name=${sync.pending ? 'refresh-cw' : 'circle-check'} size=${18} /></span>
          <span class="list-item__text">
            <span class="list-item__title">${sync.pending ? 'Sender ændringer…' : 'Alle dine ændringer er sendt'}</span>
            <span class="list-item__sub">Dine data gemmes også lokalt på telefonen</span>
          </span>
        </div>
      </div>
      <p class="faint" style=${{ fontSize: '13px' }}>
        Appen bruger flere servere på én gang, så festen kører videre, selv hvis én er nede eller blokeret på netværket.
      </p>
    </div>
  <//>`;
}
