// The "Fotos" tab: everyone shares photos (end-to-end encrypted like everything else), everyone
// sees them, likes them — and the judge picks the podium of the photo competition.
import { html, useState, Sheet, Button, Avatar, Empty, Spinner, cx } from '../kit.js';
import { sharePhoto, removePhoto, setPodium, toggleReaction } from '../../app/actions.js';
import { toast, confirmDialog } from '../ui-store.js';
import { sfx, haptic } from '../feedback.js';
import { fmtAgo } from '../format.js';
import { MEDALS } from './common.js';

const MAX_CHARS = 190_000;
const LIKE = '❤️';

// Shrinks a picture until it fits in one synced message (about 140 KB).
export async function prepareImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.decoding = 'async';
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    for (const max of [1280, 1080, 900, 720, 560]) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.82, 0.72, 0.62, 0.52]) {
        const data = canvas.toDataURL('image/jpeg', q);
        if (data.length <= MAX_CHARS) return data;
      }
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const photoComp = (pg) => pg.comps.find((c) => c.kind === 'photo');
const placeOfPhoto = (pg, key) => (pg.results.get(photoComp(pg)?.id)?.places || []).findIndex((pl) => pl?.photo === key);
const likesOf = (d, key) => d.reactions.get(key)?.get(LIKE)?.size || 0;

export function PhotosTab({ room, d }) {
  const pg = d.pg;
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);
  const comp = photoComp(pg);
  const winners = (pg.results.get(comp?.id)?.places || []).map((pl) => (pl ? pg.photoByKey.get(pl.photo) : null));

  const onFile = async (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Vælg venligst et billede', { icon: '🖼️', tone: 'bad' });
      return;
    }
    setBusy(true);
    try {
      const data = await prepareImage(file);
      if (data) setDraft({ data });
      else toast('Billedet kunne ikke bruges — prøv et andet', { icon: '🖼️', tone: 'bad' });
    } catch {
      toast('Billedet kunne ikke åbnes', { icon: '🖼️', tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  return html`<div class="stack stack--l">
    <div class="section__head" style=${{ paddingTop: '6px' }}>
      <h1 class="section__title" style=${{ fontSize: '26px' }}>Fotos</h1>
      <span class="faint" style=${{ fontSize: '13px' }}>${pg.photos.length} ${pg.photos.length === 1 ? 'billede' : 'billeder'}</span>
    </div>

    ${winners.some(Boolean)
      ? html`<section class="pg-winners" aria-label=${comp.name}>
          <div class="pg-winners__title">${comp.emoji} ${comp.name}</div>
          <div class="pg-winners__row">
            ${winners.map((ph, i) =>
              ph
                ? html`<button type="button" class=${cx('pg-winner', `pg-winner--${i + 1}`)} onClick=${() => setView(ph.key)}>
                    ${ph.data ? html`<img src=${ph.data} alt="" />` : html`<${Spinner} />`}
                    <span class="pg-winner__medal">${MEDALS[i]}</span>
                    <span class="pg-winner__who">${d.players.get(ph.pid)?.name}</span>
                  </button>`
                : null,
            )}
          </div>
        </section>`
      : null}

    ${!d.ended
      ? html`<label class=${cx('pg-upload', busy && 'is-busy')}>
          <input type="file" accept="image/*" class="sr-only" aria-label="Del et billede" onChange=${onFile} disabled=${busy} />
          <span class="pg-upload__icon" aria-hidden="true">${busy ? html`<${Spinner} size=${26} />` : '📸'}</span>
          <span class="pg-upload__text">
            <strong>${busy ? 'Gør billedet klar …' : 'Del et billede'}</strong>
            <small>Tag et nyt eller vælg fra kamerarullen — alle kan se det</small>
          </span>
        </label>`
      : null}

    ${pg.photos.length
      ? html`<div class="pg-gallery">
          ${pg.photos.map((ph) => {
            const p = d.players.get(ph.pid);
            const team = pg.teamById.get(pg.players.get(ph.pid)?.team);
            const place = placeOfPhoto(pg, ph.key);
            const likes = likesOf(d, ph.key);
            return html`<button type="button" class="pg-tile" key=${ph.key} style=${{ '--tc': team?.color || 'transparent' }} onClick=${() => setView(ph.key)} aria-label=${`Billede fra ${p?.name}${ph.cap ? `: ${ph.cap}` : ''}`}>
              ${ph.data ? html`<img src=${ph.data} alt="" loading="lazy" decoding="async" />` : html`<span class="pg-tile__loading"><${Spinner} /></span>`}
              ${place >= 0 ? html`<span class="pg-tile__medal" aria-hidden="true">${MEDALS[place]}</span>` : null}
              <span class="pg-tile__foot">
                <${Avatar} player=${p} size=${22} />
                <span class="pg-tile__name">${p?.name}</span>
                ${likes ? html`<span class="pg-tile__likes">${LIKE} ${likes}</span>` : null}
              </span>
            </button>`;
          })}
        </div>`
      : html`<${Empty} icon="camera" title="Ingen billeder endnu" text="Del det første billede — de bedste kan vinde fotokonkurrencen." />`}

    <${ShareSheet} room=${room} draft=${draft} onClose=${() => setDraft(null)} />
    <${PhotoViewer} room=${room} d=${d} photoKey=${view} onClose=${() => setView(null)} />
  </div>`;
}

function ShareSheet({ room, draft, onClose }) {
  const [cap, setCap] = useState('');
  const share = () => {
    sharePhoto(room, draft.data, cap);
    sfx.pop();
    haptic(15);
    toast('📸 Billedet er delt med alle', { tone: 'good' });
    setCap('');
    onClose();
  };
  return html`<${Sheet}
    open=${!!draft}
    onClose=${onClose}
    title="Del billede"
    subtitle="Alle i eventet kan se det."
    footer=${html`<${Button} block icon="upload" onClick=${share}>Del med alle<//>`}
  >
    ${draft
      ? html`<div class="stack">
          <img class="pg-share__img" src=${draft.data} alt="Billedet du deler" />
          <input class="input" maxlength="140" placeholder="Skriv en tekst (valgfri)" value=${cap} onInput=${(e) => setCap(e.currentTarget.value)} />
        </div>`
      : null}
  <//>`;
}

function PhotoViewer({ room, d, photoKey, onClose }) {
  const pg = d.pg;
  const ph = photoKey ? pg.photoByKey.get(photoKey) : null;
  const p = ph ? d.players.get(ph.pid) : null;
  const team = ph ? pg.teamById.get(pg.players.get(ph.pid)?.team) : null;
  const comp = photoComp(pg);
  const place = ph ? placeOfPhoto(pg, ph.key) : -1;
  const likes = ph ? likesOf(d, ph.key) : 0;
  const liked = ph ? !!d.reactions.get(ph.key)?.get(LIKE)?.has(room.pid) : false;
  const mine = ph?.pid === room.pid;

  const like = () => {
    toggleReaction(room, d, ph.key, LIKE);
    haptic(8);
    if (!liked) sfx.pop();
  };
  const place3 = (i) => {
    const current = [0, 1, 2].map((j) => pg.results.get(comp.id)?.places[j]?.photo || null);
    const next = current.map((key, j) => (j === i ? (key === ph.key ? null : ph.key) : key === ph.key ? null : key));
    setPodium(room, comp, next);
    sfx.win();
    toast(next[i] ? `${MEDALS[i]} ${comp.name}: ${i + 1}.-plads til ${p?.name}` : `${comp.name}: pladsen er fjernet`, { tone: 'good' });
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: mine ? 'Slet billedet?' : 'Skjul billedet for alle?',
      text: mine ? 'Det forsvinder fra alles telefoner.' : `Billedet fra ${p?.name} skjules for alle.`,
      confirm: mine ? 'Slet' : 'Skjul',
      danger: true,
    });
    if (!ok) return;
    removePhoto(room, ph);
    toast(mine ? 'Billedet er slettet' : 'Billedet er skjult', { icon: '🗑️' });
    onClose();
  };

  return html`<${Sheet} open=${!!ph} onClose=${onClose} size="tall" title=${p?.name || 'Billede'} subtitle=${ph ? `${team ? `${team.name} · ` : ''}${fmtAgo(ph.ts, d.t)}` : ''}>
    ${ph
      ? html`<div class="stack">
          <div class="pg-viewer">
            ${ph.data ? html`<img class="pg-viewer__img" src=${ph.data} alt=${ph.cap || `Billede fra ${p?.name}`} />` : html`<${Spinner} size=${32} />`}
            ${place >= 0 ? html`<span class="pg-viewer__medal">${MEDALS[place]} ${place + 1}.-plads</span>` : null}
          </div>
          ${ph.cap ? html`<p class="pg-viewer__cap">${ph.cap}</p>` : null}
          <div class="pg-viewer__bar">
            <button type="button" class=${cx('pg-like', liked && 'is-on')} aria-pressed=${liked} onClick=${like}>
              <span aria-hidden="true">${LIKE}</span> ${likes || ''} <span class="sr-only">${liked ? 'Fjern like' : 'Like'}</span>
            </button>
            <span class="spacer"></span>
            ${mine || pg.isOfficial ? html`<${Button} variant="ghost" size="sm" icon="trash" onClick=${remove}>${mine ? 'Slet' : 'Skjul'}<//>` : null}
          </div>
          ${pg.isJudge && comp && !d.ended
            ? html`<div class="pg-viewer__judge">
                <span class="mg-label">${comp.name}</span>
                <div class="pg-viewer__places">
                  ${MEDALS.map(
                    (m, i) => html`<button type="button" class=${cx('chip', place === i && 'is-active')} aria-pressed=${place === i} onClick=${() => place3(i)}>${m} ${i + 1}.-plads</button>`,
                  )}
                </div>
              </div>`
            : null}
        </div>`
      : null}
  <//>`;
}
