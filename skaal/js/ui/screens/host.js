import { html, useState, useEffect, useStore, Sheet, Button, Switch, Chips, Icon, Avatar } from '../kit.js';
import { GAMES } from '../../minigames/index.js';
import { normalizeSettings, BREAKER_OPTIONS } from '../../game/settings.js';
import { TOUR_FACES, TOUR_ASSETS, TOUR_HINT, isAudioUrl } from '../../game/tour.js';
import { updateSettings, renameEvent, setSharedImage } from '../../app/actions.js';
import { toast } from '../ui-store.js';
import { TourFace } from '../tourArt.js';
import { song, loadLocalSong, setLocalSong, removeLocalSong, previewSong } from '../tourSong.js';
import { DrinkSettings, breakerLabel } from './create.js';
import { CropSheet } from './profile.js';

export function HostSheet({ room, d, open, onClose }) {
  const [name, setName] = useState(d.meta.name);
  const [settings, setSettings] = useState(d.settings);
  useEffect(() => {
    if (open) {
      setName(d.meta.name);
      setSettings(d.settings);
    }
  }, [open]);
  const update = (patch) => setSettings((s) => normalizeSettings({ ...s, ...patch }));

  const save = () => {
    const clean = name.trim();
    if (clean && clean !== d.meta.name) renameEvent(room, clean);
    updateSettings(room, settings);
    toast('Indstillinger gemt ✓', { tone: 'good' });
    onClose();
  };

  return html`<${Sheet}
    open=${open}
    onClose=${onClose}
    title="Event-indstillinger"
    subtitle="Ændringer gælder med det samme for alle."
    size="tall"
    footer=${html`<${Button} block icon="check" onClick=${save}>Gem ændringer<//>`}
  >
    <div class="stack stack--l">
      <label class="field">
        <span class="field__label">Navn</span>
        <input class="input" type="text" maxlength="48" value=${name} onInput=${(e) => setName(e.currentTarget.value)} />
      </label>

      <div class="field">
        <span class="field__label">Automatiske breakers</span>
        <${Chips} options=${BREAKER_OPTIONS.map((m) => ({ value: m, label: breakerLabel(m) }))} value=${settings.breakerMin} onChange=${(breakerMin) => update({ breakerMin })} />
        <span class="field__hint">Et nyt interval starter nedtællingen forfra.</span>
      </div>

      <div class="field">
        <span class="field__label">Tour de France</span>
        <div class="card option-card">
          <${Switch} label="🚴 Tour de France-tilstand" hint=${TOUR_HINT} checked=${settings.tour} onChange=${(tour) => update({ tour })} />
        </div>
      </div>
      ${settings.tour ? html`<${TourSettings} room=${room} d=${d} settings=${settings} update=${update} />` : null}

      <div class="field">
        <span class="field__label">Minigames i rotationen</span>
        <div class="list">
          ${GAMES.map(
            (g) => html`<${Switch}
              label=${`${g.emoji} ${g.name}`}
              hint=${g.tagline}
              checked=${settings.games[g.id]}
              onChange=${(on) => update({ games: { ...settings.games, [g.id]: on } })}
            />`,
          )}
        </div>
      </div>

      <div class="field">
        <span class="field__label">Drikke & point</span>
        <div class="card option-card"><${DrinkSettings} settings=${settings} onChange=${update} /></div>
        <span class="field__hint">Point gælder også for drinks, der allerede er registreret.</span>
      </div>

      <div class="list">
        <${Switch} label="Lykkehjul" hint="Ved føring, comeback og hver 5. drink" checked=${settings.triggers} onChange=${(triggers) => update({ triggers })} />
        <${Switch} label="Bonuspoint" hint="Hjul og minigames kan give ekstra point" checked=${settings.bonus} onChange=${(bonus) => update({ bonus })} />
        <${Switch} label="Alle kan starte minigames" hint="Ellers kun dig som vært" checked=${settings.anyoneCanStart} onChange=${(anyoneCanStart) => update({ anyoneCanStart })} />
      </div>
    </div>
  <//>`;
}

// Pictures are shared straight away (they don't wait for "Gem ændringer").
function TourSettings({ room, d, settings, update }) {
  const local = useStore(song, (s) => s.local);
  const playing = useStore(song, (s) => s.playing);
  // What the host types; the setting itself only keeps a valid link.
  const [songText, setSongText] = useState(settings.tourSong);
  useEffect(() => {
    loadLocalSong();
  }, []);
  const share = (name, url, what) => {
    setSharedImage(room, name, url);
    toast(url ? `${what} er delt med alle ✓` : `${what} er nulstillet`, { tone: 'good' });
  };
  const leader = d.tour.leader ? d.players.get(d.tour.leader) : d.mePlayer;
  const preview = leader ? { ...leader, jersey: true, mask: d.tour.mask } : null;
  const link = settings.tourSong;

  const test = async () => {
    const r = await previewSong(link);
    if (r === 'muted') toast('Lyden er slået fra i appen', { icon: '🔇' });
    else if (r === 'page') toast('Spotify/YouTube-links åbnes med en knap ved Tour-øjeblikket', { icon: '🎵' });
    else if (r === 'error') toast('Sangen kunne ikke afspilles — tjek linket', { icon: '⚠️', tone: 'bad' });
  };

  return html`<div class="stack stack--l tour-settings">
    <div class="field">
      <span class="field__label">Ansigterne ved 21 drinks</span>
      <div class="card tour-faces">
        ${TOUR_FACES.map(
          (f) => html`<div class="tour-row" key=${f.id}>
            <span class="tour-row__pic" style=${{ '--fc': f.color }}><${TourFace} d=${d} id=${f.id} size=${56} /></span>
            <span class="tour-row__text">
              <span class="tour-row__name">${f.name} <span class="tour-row__tag" style=${{ color: f.color }}>${f.title}</span></span>
              <span class="tour-row__desc">${f.text({ bonus: settings.bonus })}</span>
              <span class="tour-row__actions">
                <${ImageUpload} label=${d.tour.faces[f.id] ? 'Skift billede' : 'Upload billede'} title=${`Billede af ${f.name}`} onImage=${(url) => share(TOUR_ASSETS.face(f.id), url, `Billedet af ${f.name}`)} />
                ${d.tour.faces[f.id]
                  ? html`<button type="button" class="btn btn--ghost btn--sm" onClick=${() => share(TOUR_ASSETS.face(f.id), null, `Billedet af ${f.name}`)}>Brug tegningen</button>`
                  : null}
              </span>
            </span>
          </div>`,
        )}
      </div>
      <span class="field__hint">Upload jeres egne billeder af Henning, Bobby og Pimm — de vises på alles telefoner.</span>
    </div>

    <div class="field">
      <span class="field__label">Førerens maske</span>
      <div class="card tour-row tour-row--single">
        <span class="tour-row__pic tour-row__pic--avatar">${preview ? html`<${Avatar} player=${preview} size=${52} />` : null}</span>
        <span class="tour-row__text">
          <span class="tour-row__name">${d.tour.mask ? 'Jeres eget billede' : 'Gul hjelm og racerbriller'}</span>
          <span class="tour-row__desc">Lægges over billedet af den, der fører, så alle kan se, hvem der har den gule trøje.</span>
          <span class="tour-row__actions">
            <${ImageUpload} label=${d.tour.mask ? 'Skift maske' : 'Upload maske'} alpha title="Førerens maske" onImage=${(url) => share(TOUR_ASSETS.mask, url, 'Masken')} />
            ${d.tour.mask
              ? html`<button type="button" class="btn btn--ghost btn--sm" onClick=${() => share(TOUR_ASSETS.mask, null, 'Masken')}>Brug hjelm og briller</button>`
              : null}
          </span>
        </span>
      </div>
      <span class="field__hint">Tip: Et PNG-billede med gennemsigtig baggrund (fx en Vingegaard-maske) ligger pænest oven på billedet.</span>
    </div>

    <div class="field">
      <span class="field__label">Tour-sangen</span>
      <input
        class="input"
        type="url"
        inputmode="url"
        autocomplete="off"
        placeholder="Link til mp3, Spotify eller YouTube"
        value=${songText}
        onInput=${(e) => {
          setSongText(e.currentTarget.value);
          update({ tourSong: e.currentTarget.value });
        }}
      />
      <span class="field__hint">
        Fx “De skal have baghjul” med Drengene fra Angora. Et link direkte til en lydfil (.mp3) spiller automatisk i baggrunden;
        links til Spotify eller YouTube får en “Spil Tour-sangen”-knap.
        ${songText.trim() && !link ? html`<br /><strong>Det ligner ikke et link — start med https://</strong>` : null}
        ${link && !isAudioUrl(link) ? html`<br /><strong>Linket er ikke en lydfil — det åbnes med en knap.</strong>` : null}
      </span>
      <div class="card option-card">
        <${Switch}
          label="Spil sangen på alle telefoner"
          hint="Ellers spiller den på rytterens telefon og på storskærmen"
          checked=${settings.tourSongAll}
          onChange=${(tourSongAll) => update({ tourSongAll })}
        />
      </div>
      <div class="card tour-row tour-row--single">
        <span class="tour-row__icon" aria-hidden="true"><${Icon} name="music" size=${22} /></span>
        <span class="tour-row__text">
          <span class="tour-row__name">${local ? local.name : 'Lydfil på denne enhed'}</span>
          <span class="tour-row__desc">
            ${local
              ? 'Spiller her ved hvert Tour-øjeblik. Filen bliver på enheden og deles ikke.'
              : 'Har du sangen som fil? Vælg den, så spiller denne telefon den — fx koblet til højttaleren.'}
          </span>
          <span class="tour-row__actions">
            <${SongFilePick} label=${local ? 'Skift lydfil' : 'Vælg lydfil'} />
            ${local ? html`<button type="button" class="btn btn--ghost btn--sm" onClick=${() => removeLocalSong()}>Fjern</button>` : null}
          </span>
        </span>
      </div>
      <${Button} variant="secondary" icon=${playing ? 'square' : 'play'} onClick=${test}>${playing ? 'Stop' : 'Afprøv lyden her'}<//>
    </div>
  </div>`;
}

function ImageUpload({ label, title, alpha = false, onImage }) {
  const [file, setFile] = useState(null);
  return html`<label class="btn btn--secondary btn--sm upload-btn">
      <${Icon} name="upload" size=${16} />
      <span class="btn__label">${label}</span>
      <input
        type="file"
        accept="image/*"
        class="sr-only"
        aria-label=${title}
        onChange=${(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (!f) return;
          if (!f.type.startsWith('image/')) toast('Vælg venligst et billede', { icon: '🖼️', tone: 'bad' });
          else setFile(f);
        }}
      />
    </label>
    <${CropSheet}
      file=${file}
      title=${title}
      alpha=${alpha}
      out=${alpha ? 256 : 320}
      maxChars=${alpha ? 170_000 : 140_000}
      onCancel=${() => setFile(null)}
      onDone=${(url) => {
        setFile(null);
        onImage(url);
      }}
    />`;
}

function SongFilePick({ label }) {
  const [busy, setBusy] = useState(false);
  return html`<label class=${`btn btn--secondary btn--sm upload-btn ${busy ? 'is-loading' : ''}`}>
    ${busy ? html`<span class="spinner" aria-hidden="true"></span>` : html`<${Icon} name="upload" size=${16} />`}
    <span class="btn__label">${label}</span>
    <input
      type="file"
      accept="audio/*"
      class="sr-only"
      aria-label="Vælg lydfil til Tour-sangen"
      onChange=${async (e) => {
        const f = e.currentTarget.files?.[0];
        e.currentTarget.value = '';
        if (!f) return;
        setBusy(true);
        try {
          await setLocalSong(f);
          toast('Sangen er klar på denne enhed 🎵', { tone: 'good' });
        } catch (err) {
          console.warn('[tour] song file', err);
          toast(err?.message === 'too-big' ? 'Filen er for stor (max 25 MB)' : 'Filen kunne ikke afspilles', { icon: '⚠️', tone: 'bad' });
        } finally {
          setBusy(false);
        }
      }}
    />
  </label>`;
}
