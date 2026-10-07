// Pub golf's photo competition: every player enters one photo, uploaded from the phone's photo
// album. The entries are seen by everyone at once — also when the disposable camera is on — and the
// judge picks the podium among them.
import { html, useState, useEffect, useStore, Sheet, Button, Icon, Spinner } from '../kit.js';
import { bitmapFromFile, preparePhoto, enterCompetition, removePhoto, PHOTO } from '../../app/photos.js';
import { canTakePhotos } from '../photos/layer.js';
import { PhotoFrame, PhotoGrid } from '../photos/photo.js';
import { eventUi } from '../screens/event.js';
import { confirmDialog, toast } from '../ui-store.js';
import { sfx } from '../feedback.js';
import { MEDALS } from './common.js';

// Whether this phone's player can enter the competition (or change their entry) now: photos are
// on, the round isn't over, and the competition is in view and not decided yet.
export function canEnter(room, d, comp) {
  const pg = d.pg;
  return (
    comp?.kind === 'photo' &&
    canTakePhotos(room, d) &&
    !d.ended &&
    pg.comps.some((c) => c.id === comp.id) &&
    !pg.results.get(comp.id)?.places.some(Boolean)
  );
}

// This phone's player's entry, if any.
export const entryOf = (d, comp) => d.pg.entries.get(comp.id)?.find((ph) => ph.pid === d.me) || null;

// The photo album opens from a file input that is always there (see EntrySheet), so a button can
// open it even from a pop-up that closes at once.
let album = null;
let albumFor = null;
export function pickEntry(compId) {
  albumFor = compId;
  album?.click();
}

// In the photo competition's card: the entries so far, and this player's own.
export function PhotoEntries({ room, d, comp }) {
  const pg = d.pg;
  const entries = pg.entries.get(comp.id) || [];
  const mine = entryOf(d, comp);
  const places = pg.results.get(comp.id)?.places || [];
  const badge = (ph) => {
    const i = places.findIndex((pl) => pl?.photo === ph.key);
    return i >= 0 ? html`<span class="photo-tile__medal" aria-hidden="true">${MEDALS[i]}</span>` : null;
  };
  const withdraw = async () => {
    const ok = await confirmDialog({
      title: 'Træk dit billede tilbage?',
      text: 'Det forsvinder fra konkurrencen og fra rundens billeder.',
      confirm: 'Træk tilbage',
      danger: true,
    });
    if (!ok) return;
    removePhoto(room, mine);
    toast('Dit billede er trukket tilbage', { icon: '↩️' });
  };
  return html`<div class="pg-entries">
    ${entries.length
      ? html`<p class="pg-entries__count">${entries.length} bidrag</p>
          <${PhotoGrid} room=${room} d=${d} photos=${entries} badge=${badge} scope=${`comp:${comp.id}`} />`
      : null}
    ${canEnter(room, d, comp)
      ? mine
        ? html`<div class="pg-entries__mine">
            <span class="pg-entries__ok"><${Icon} name="circle-check" size=${18} />Dit billede er med</span>
            <div class="pg-entries__actions">
              <${Button} variant="secondary" size="sm" icon="refresh-cw" onClick=${() => pickEntry(comp.id)}>Skift billede<//>
              <${Button} variant="ghost" size="sm" onClick=${withdraw}>Træk tilbage<//>
            </div>
          </div>`
        : html`<${Button} block icon="upload" onClick=${() => pickEntry(comp.id)}>Upload dit billede<//>`
      : null}
  </div>`;
}

// At the top of the photos: the way into the photo competition, while it is open.
export function EntryCard({ room, d, comp }) {
  if (!comp || !canEnter(room, d, comp)) return null;
  const mine = entryOf(d, comp);
  return html`<div class="card card--pad entry-card">
    <span class="entry-card__icon" aria-hidden="true">${comp.emoji}</span>
    <span class="entry-card__text">
      <strong>${comp.name}</strong>
      <small>${mine ? 'Dit billede er med — du kan skifte det, til dommeren har valgt.' : 'Upload dit bedste billede fra fotoalbummet. Alle kan se bidragene.'}</small>
    </span>
    ${mine
      ? html`<${Button} size="sm" variant="secondary" onClick=${() => eventUi.set({ tab: 'comps' })}>Se bidragene<//>`
      : html`<${Button} size="sm" icon="upload" onClick=${() => pickEntry(comp.id)}>Upload<//>`}
  </div>`;
}

// The picked photo, looked over (with a caption, if you like) before it goes in. Also holds the
// file input the album opens from.
export function EntrySheet({ room, d }) {
  const pick = useStore(eventUi, (s) => s.entry);
  const comp = pick ? d.pg.cfg.comps.find((c) => c.id === pick.comp && c.kind === 'photo') : null;
  const [ready, setReady] = useState(null); // { prepared, url } | 'failed' | null while preparing
  const [cap, setCap] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pick?.file) return undefined;
    let cancelled = false;
    let url = null;
    setReady(null);
    (async () => {
      try {
        const picture = await bitmapFromFile(pick.file);
        try {
          const prepared = await preparePhoto(picture);
          if (cancelled) return;
          url = URL.createObjectURL(new Blob([prepared.full], { type: 'image/jpeg' }));
          setReady({ prepared, url });
        } finally {
          picture.close?.();
        }
      } catch {
        if (!cancelled) setReady('failed');
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pick?.file]);

  const onFile = (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file || !albumFor) return;
    if (!file.type.startsWith('image/')) {
      toast('Vælg venligst et billede', { icon: '🖼️', tone: 'bad' });
      return;
    }
    eventUi.set({ entry: { comp: albumFor, file } });
  };
  const close = () => {
    eventUi.set({ entry: null });
    setCap('');
  };
  const send = async () => {
    if (!comp || !ready?.prepared || busy) return;
    if (!canEnter(room, d, comp)) {
      toast('Konkurrencen tager ikke imod flere billeder', { icon: '📸', tone: 'bad' });
      close();
      return;
    }
    setBusy(true);
    try {
      await enterCompetition(room, comp.id, ready.prepared, cap, entryOf(d, comp));
      sfx.whoosh();
      toast('📸 Dit billede er med i konkurrencen', { tone: 'good' });
      close();
      eventUi.set({ tab: 'comps' });
    } catch {
      toast('Billedet kunne ikke sendes — prøv igen', { icon: '📸', tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  const input = html`<input type="file" accept="image/*" class="sr-only" tabindex="-1" aria-hidden="true" ref=${(el) => (album = el)} onChange=${onFile} />`;
  if (!comp) return html`${input}<${Sheet} open=${false} onClose=${close} />`;
  return html`${input}<${Sheet}
    open=${true}
    onClose=${close}
    dismissible=${!busy}
    title=${`${comp.emoji} ${comp.name}`}
    subtitle=${entryOf(d, comp) ? 'Det nye billede tager pladsen fra dit gamle.' : 'Dit bidrag — alle i eventet kan se det.'}
    footer=${html`<div class="btn-row">
      <${Button} variant="secondary" icon="image" disabled=${busy} onClick=${() => pickEntry(comp.id)}>Vælg andet<//>
      <${Button} icon="check" loading=${busy} disabled=${!ready?.prepared} onClick=${send}>Send ind<//>
    </div>`}
  >
    <div class="stack">
      ${ready === 'failed'
        ? html`<p class="entry-sheet__wait">Billedet kunne ikke åbnes — prøv et andet.</p>`
        : ready
          ? html`<${PhotoFrame} src=${ready.url} fit="contain" label="Det billede, du har valgt" class="entry-sheet__photo" />`
          : html`<div class="entry-sheet__wait"><${Spinner} size=${28} /><span>Gør billedet klar …</span></div>`}
      <input class="input" maxlength=${PHOTO.captionMax} placeholder="Skriv en tekst (valgfri)" aria-label="Tekst til billedet" value=${cap} onInput=${(e) => setCap(e.currentTarget.value)} />
    </div>
  <//>`;
}
