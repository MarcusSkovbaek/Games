// The Tour song, played in the background at a Tour moment. Sources, in order:
//   1. a song file picked on this device (kept locally, never uploaded) — this device always plays it
//   2. the host's link to an audio file — on the rider's phone and big screens, or on every phone
//   3. otherwise a short synthesised fanfare
// Links to Spotify, YouTube etc. cannot play in the background; they get a "play" button instead.
import { createStore } from './kit.js';
import { prefs } from './ui-store.js';
import { audioContext, onAudioUnlock, sfx } from './feedback.js';
import { isAudioUrl } from '../game/tour.js';
import { getFile, putFile, deleteFile } from '../core/files.js';

const LOCAL_KEY = 'tour-song';
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const song = createStore({ playing: false, source: null, local: null, last: null });

let current = null;
const decoded = new Map(); // url or 'local' → AudioBuffer
const handled = new Set(); // moments this device already played something for
let element = null;

// --------------------------------------------------------------------------- local file

let localLoaded = null;

export function loadLocalSong() {
  if (!localLoaded) {
    localLoaded = getFile(LOCAL_KEY)
      .then((f) => {
        const info = f?.data ? { name: f.name, size: f.data.byteLength } : null;
        song.set({ local: info });
        return f || null;
      })
      .catch(() => null);
  }
  return localLoaded;
}

export async function setLocalSong(file) {
  if (!file) return false;
  if (file.size > MAX_FILE_BYTES) throw new Error('too-big');
  const data = await file.arrayBuffer();
  // Check that the browser can actually play it before keeping it.
  const ctx = audioContext();
  if (ctx) await ctx.decodeAudioData(data.slice(0));
  await putFile(LOCAL_KEY, { name: file.name, type: file.type, data });
  decoded.delete('local');
  localLoaded = Promise.resolve({ name: file.name, data });
  song.set({ local: { name: file.name, size: data.byteLength } });
  return true;
}

export async function removeLocalSong() {
  await deleteFile(LOCAL_KEY).catch(() => {});
  decoded.delete('local');
  localLoaded = Promise.resolve(null);
  song.set({ local: null });
}

// ------------------------------------------------------------------------------- policy

// Should this device play the song for this moment? Big screens and the rider's phone do; every
// phone does if the host chose so; a device with its own song file always does.
export function playsSong(d, moment, { tv = false } = {}) {
  if (song.get().local) return true;
  if (!isAudioUrl(d.settings.tourSong)) return false;
  return tv || d.settings.tourSongAll || moment.pid === d.me;
}

// A link that has to be opened (Spotify, YouTube …), or null.
export function songPageLink(d) {
  const url = d.settings.tourSong;
  return url && !isAudioUrl(url) ? url : null;
}

// ----------------------------------------------------------------------------- playback

async function bufferFor(source, url) {
  if (decoded.has(source)) return decoded.get(source);
  const ctx = audioContext();
  if (!ctx) return null;
  let data;
  if (source === 'local') {
    const f = await loadLocalSong();
    if (!f?.data) return null;
    data = f.data.slice(0);
  } else {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.arrayBuffer();
  }
  const buf = await ctx.decodeAudioData(data);
  decoded.set(source, buf);
  return buf;
}

function playBuffer(buf, source, key) {
  const ctx = audioContext();
  if (!ctx || !buf) return false;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  gain.gain.value = 0.9;
  src.connect(gain).connect(ctx.destination);
  src.start();
  const me = {
    key,
    stop() {
      try {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
        src.stop(ctx.currentTime + 0.5);
      } catch {
        /* already stopped */
      }
    },
  };
  src.onended = () => current === me && finish();
  current = me;
  song.set({ playing: true, source, last: { key, at: Date.now() } });
  return true;
}

// Cross-origin links without CORS cannot be decoded; an <audio> element can still play them.
function playElement(url, key) {
  const el = audioElement();
  if (!el) return Promise.resolve(false);
  el.src = url;
  el.currentTime = 0;
  el.volume = 0.9;
  return el
    .play()
    .then(() => {
      const me = {
        key,
        stop() {
          el.pause();
        },
      };
      el.onended = () => current === me && finish();
      current = me;
      song.set({ playing: true, source: 'url', last: { key, at: Date.now() } });
      return true;
    })
    .catch(() => false);
}

function finish() {
  current = null;
  song.set({ playing: false, source: null });
}

// Play the song for a Tour moment (once per moment). Returns what played: 'local' | 'url' |
// 'fanfare' | null (sound off).
export async function playTourSong(d, moment, { tv = false } = {}) {
  if (!prefs.get().sound || handled.has(moment.key)) return null;
  handled.add(moment.key);
  stopTourSong();
  await loadLocalSong();
  if (playsSong(d, moment, { tv })) {
    const local = !!song.get().local;
    const url = d.settings.tourSong;
    try {
      const buf = await bufferFor(local ? 'local' : url, url);
      if (playBuffer(buf, local ? 'local' : 'url', moment.key)) return local ? 'local' : 'url';
    } catch (err) {
      console.warn('[tour] song could not be decoded, trying <audio>', err);
      if (!local && (await playElement(url, moment.key))) return 'url';
    }
  }
  sfx.tour();
  song.set({ last: { key: moment.key, at: Date.now(), source: 'fanfare' } });
  return 'fanfare';
}

export function stopTourSong(key) {
  if (!current || (key && current.key !== key)) return;
  current.stop();
  finish();
}

// The moment was undone (its 21st drink was a mistake): stop its song.
export function stopIfGone(d) {
  if (current && !d.tour.moments.some((m) => m.key === current.key)) stopTourSong();
}

// Host settings: try the song on this device — the local file, the link being edited, or the
// fanfare. Tapping again stops it.
export async function previewSong(url) {
  if (song.get().playing) {
    stopTourSong();
    return 'stopped';
  }
  if (!prefs.get().sound) return 'muted';
  await loadLocalSong();
  const key = `preview:${Date.now()}`;
  const local = !!song.get().local;
  if (local || isAudioUrl(url)) {
    try {
      const buf = await bufferFor(local ? 'local' : url, url);
      if (playBuffer(buf, local ? 'local' : 'url', key)) return local ? 'local' : 'url';
    } catch (err) {
      console.warn('[tour] preview', err);
      if (!local && (await playElement(url, key))) return 'url';
      return 'error';
    }
  }
  if (url) return 'page';
  sfx.tour();
  return 'fanfare';
}

// Muting the app stops the song as well.
prefs.subscribe((s) => {
  if (!s.sound) stopTourSong();
});

function audioElement() {
  if (element || typeof Audio === 'undefined') return element;
  element = new Audio();
  element.preload = 'auto';
  element.setAttribute('playsinline', '');
  return element;
}

// iOS: an <audio> element may only start without a tap if it was played during one before.
onAudioUnlock(() => {
  const el = audioElement();
  if (!el) return;
  el.src = silentWav();
  el.play().then(() => el.pause()).catch(() => {});
});

function silentWav() {
  const rate = 8000;
  const samples = 400;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
