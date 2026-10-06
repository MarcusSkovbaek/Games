// Room = one event, synchronised between phones through any number of MQTT brokers.
//
// Data model (all retained, all end-to-end encrypted):
//   <root>/<roomId>/m            event meta (name, settings, host) — last-writer-wins on `v`
//   <root>/<roomId>/p/<pid>/i    player profile (name, photo)      — last-writer-wins on `v`
//   <root>/<roomId>/p/<pid>/l    player log: a grow-only set of entries, merged by id (CRDT)
//   <root>/<roomId>/p/<pid>/o    presence heartbeat (+ last will when the connection drops)
//   <root>/<roomId>/a/<name>     shared images (Tour faces and mask, photo thumbnails) — LWW on `v`
//   <root>/<roomId>-f/<name>     full-size photos (raw encrypted JPEG) — outside the room's `#`
//                                subscription, fetched one at a time when someone looks at them
//
// Every player only appends to their own log, so concurrent writes never conflict and every
// device converges on the same state regardless of message order. Any device can "heal" a broker
// that lost data (restart, purge) by republishing what it has cached locally; full-size photos are
// healed by the phone that took them.

import { SYNC } from '../config.js';
import { Emitter } from '../core/emitter.js';
import { seal, unseal, sealBytes, unsealBytes } from '../core/crypto.js';
import { randomId } from '../core/ids.js';
import { now } from '../core/clock.js';
import * as storage from '../core/storage.js';
import { MqttClient } from './mqtt.js';

const MAX_PHOTO_CHARS = 300_000;
// Pictures are only ever plain raster images (never SVG, which can carry scripts and links).
const IMAGE_DATA = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function validEntry(e) {
  return (
    e &&
    typeof e === 'object' &&
    typeof e.id === 'string' &&
    e.id.length > 0 &&
    e.id.length <= 32 &&
    typeof e.t === 'string' &&
    Number.isFinite(e.ts)
  );
}

export function cleanProfile(p) {
  if (!p || typeof p !== 'object') return null;
  return {
    v: Number(p.v) || 0,
    name: String(p.name || '').trim().slice(0, 32),
    photo:
      typeof p.photo === 'string' && p.photo.length < MAX_PHOTO_CHARS && IMAGE_DATA.test(p.photo)
        ? p.photo
        : null,
    color: typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : null,
    joinedAt: Number(p.joinedAt) || 0,
    // Timestamp of leaving (0 = still here). Older payloads used `true`.
    left: p.left === true ? 1 : Number(p.left) || 0,
  };
}

function cleanMeta(m) {
  if (!m || typeof m !== 'object') return null;
  return {
    ...m,
    v: Number(m.v) || 0,
    u: Number(m.u) || 0,
    name: String(m.name || '').trim().slice(0, 48),
    hostId: typeof m.hostId === 'string' ? m.hostId : '',
    createdAt: Number(m.createdAt) || 0,
    startedAt: Number(m.startedAt) || Number(m.createdAt) || 0,
    settings: m.settings && typeof m.settings === 'object' ? m.settings : {},
    removed: Array.isArray(m.removed) ? m.removed.filter((x) => typeof x === 'string') : [],
  };
}

const newer = (a, b) => (a.v || 0) > (b.v || 0) || ((a.v || 0) === (b.v || 0) && (a.u || 0) > (b.u || 0));

export const ASSET_NAME = /^[a-z0-9-]{1,32}$/;
const MAX_ASSET_CHARS = 300_000;

// An asset is an image (data URL) or null, meaning "use the built-in default".
export function cleanAsset(a) {
  if (!a || typeof a !== 'object') return null;
  const ok = typeof a.data === 'string' && a.data.length < MAX_ASSET_CHARS && IMAGE_DATA.test(a.data);
  return { v: Number(a.v) || 0, u: Number(a.u) || 0, data: ok ? a.data : null };
}

export class Room extends Emitter {
  constructor({ code, roomId, key, pid, brokers, WebSocketImpl, persist = true, strong = true }) {
    super();
    this.code = code;
    this.roomId = roomId;
    this.key = key;
    this.pid = pid;
    // False for old 8-character codes: fine for scores, too weak to protect photos.
    this.strong = strong;
    this.base = `${SYNC.topicRoot}/${roomId}`;
    this.fbase = `${SYNC.topicRoot}/${roomId}-f`;
    // Set by the photo store: (name) => sealed full-size photo this device took, or null.
    this.fullSource = null;
    this.persist = persist;
    this.WebSocketImpl = WebSocketImpl;
    this.state = { meta: null, players: {}, assets: {} };
    this.presence = {}; // pid -> brokerId -> { on, ts }
    this.version = 0;
    this.brokers = brokers.map((cfg) => ({ cfg, client: null, status: 'idle', seen: new Map(), settled: false }));
    this.metaSeen = false; // true once any broker delivered the meta (or we created it)
    this._timers = new Set();
    this._loadCache();
  }

  // ---------------------------------------------------------------------------------- lifecycle

  async start() {
    if (this.started) return;
    this.started = true;
    const will = await seal(this.key, { on: false, ts: now(), w: 1 }, this._rel('o', this.pid));
    for (const b of this.brokers) {
      const client = new MqttClient({
        url: b.cfg.url,
        username: b.cfg.username,
        password: b.cfg.password,
        clientId: `skaal_${this.pid.slice(0, 6)}_${randomId(8)}`,
        keepalive: SYNC.keepaliveSec,
        WebSocketImpl: this.WebSocketImpl,
        onStatus: (status) => {
          b.status = status;
          if (status !== 'online') b.settled = false;
          // The broker that answered quickest is asked first for full-size photos.
          if (status === 'online' && !b.firstOnline) b.firstOnline = Date.now();
          this.emit('status', this.status);
        },
        onConnect: () => this._onConnect(b),
        onMessage: (topic, payload) => this._onMessage(b, topic, payload),
      });
      client.setWill({ topic: this._topic('o', this.pid), payload: will, retain: true, qos: 0 });
      client.subscribe(`${this.base}/#`, 0);
      b.client = client;
      client.start();
    }
    if (typeof document !== 'undefined') {
      this._onVisibility = () => {
        const visible = document.visibilityState === 'visible';
        if (visible) this.brokers.forEach((b) => b.client?.wake());
        this._publishPresence(visible);
      };
      this._onOnline = () => this.brokers.forEach((b) => b.client?.wake());
      document.addEventListener('visibilitychange', this._onVisibility);
      globalThis.addEventListener?.('online', this._onOnline);
    }
    this._heartbeat = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') this._publishPresence(true);
    }, SYNC.heartbeatMs);
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this._publishPresence(false);
    clearInterval(this._heartbeat);
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    if (this._onVisibility) document.removeEventListener('visibilitychange', this._onVisibility);
    if (this._onOnline) globalThis.removeEventListener?.('online', this._onOnline);
    this._flushSave();
    // Give the offline presence a moment to leave before closing sockets.
    const clients = this.brokers.map((b) => b.client).filter(Boolean);
    setTimeout(() => clients.forEach((c) => c.stop()), 150);
  }

  get status() {
    const brokers = this.brokers.map((b) => ({ id: b.cfg.id, status: b.status }));
    const online = brokers.filter((b) => b.status === 'online').length;
    const pending = this.brokers.some((b) => b.client && !b.client.flushed);
    return { online, total: brokers.length, brokers, pending };
  }

  // ------------------------------------------------------------------------------- public API

  get me() {
    return this.state.players[this.pid] || null;
  }

  isHost() {
    return !!this.state.meta && this.state.meta.hostId === this.pid;
  }

  isOnline(pid) {
    if (pid === this.pid) return this.status.online > 0;
    const per = this.presence[pid];
    if (!per) return false;
    const t = now();
    return Object.values(per).some((p) => p.on && t - p.ts < SYNC.presenceTtlMs);
  }

  append(partial) {
    return this.appendMany([partial])[0];
  }

  appendMany(partials) {
    const me = this._player(this.pid);
    const t = now();
    const created = partials.map((p, i) => ({ ...p, id: p.id || randomId(10), ts: p.ts || t + i }));
    for (const e of created) me.entries.set(e.id, e);
    this._changed();
    this._schedule('pub-log', 120, () => this._publishAll(this._rel('l', this.pid), this._logPayload(this.pid)));
    return created;
  }

  setProfile(profile) {
    const me = this._player(this.pid);
    const prev = me.profile;
    me.profile = cleanProfile({ ...prev, ...profile, v: (prev?.v || 0) + 1 });
    this._changed();
    this._publishAll(this._rel('i', this.pid), me.profile);
    return me.profile;
  }

  setMeta(patch) {
    const prev = this.state.meta || {};
    this.state.meta = cleanMeta({ ...prev, ...patch, v: (prev.v || 0) + 1, u: now() });
    this.metaSeen = true;
    this._changed();
    this._publishAll('m', this.state.meta);
    return this.state.meta;
  }

  // Shared image (host action): `data` is a data URL, or null to fall back to the default.
  setAsset(name, data) {
    if (!ASSET_NAME.test(name)) throw new Error(`Invalid asset name: ${name}`);
    const prev = this.state.assets[name];
    const next = cleanAsset({ v: (prev?.v || 0) + 1, u: now(), data });
    this.state.assets[name] = next;
    this._changed();
    this._publishAll(`a/${name}`, next);
    return next;
  }

  asset(name) {
    return this.state.assets[name]?.data || null;
  }

  // Check every connected broker again (e.g. once this phone's own photos are back from storage).
  healNow() {
    for (const b of this.brokers) if (b.settled) this._heal(b);
  }

  // Put back an image this device kept itself (e.g. its own photo after a reload); brokers that
  // lost it get it again when healing.
  restoreAsset(name, asset) {
    const clean = ASSET_NAME.test(name) ? cleanAsset(asset) : null;
    const cur = this.state.assets[name];
    if (!clean || (cur && !newer(clean, cur))) return false;
    this.state.assets[name] = clean;
    this._changed();
    return true;
  }

  // ------------------------------------------------------------------------ full-size photos

  sealFull(name, bytes) {
    return sealBytes(this.key, bytes, `f/${name}`);
  }

  publishFull(name, payload) {
    this._publishRaw(`${this.fbase}/${name}`, payload);
  }

  clearFull(name) {
    this._publishRaw(`${this.fbase}/${name}`, new Uint8Array(0));
  }

  // True once a broker has the photo: it sent our thumbnail back and acknowledged the full size.
  photoSent(name) {
    const asset = this.state.assets[name];
    const topic = `${this.fbase}/${name}`;
    return this.brokers.some((b) => b.status === 'online' && b.client && (b.seen.get(`a/${name}`)?.v ?? -1) >= (asset?.v ?? 0) && !b.client.pending.has(`r:${topic}`));
  }

  // The JPEG bytes of a full-size photo, asking one broker at a time (quickest first).
  async fetchFull(name) {
    const order = this.brokers.filter((b) => b.status === 'online' && b.client).sort((a, b) => (a.firstOnline || 0) - (b.firstOnline || 0));
    for (const b of order) {
      const payload = await b.client.fetchRetained(`${this.fbase}/${name}`);
      const bytes = payload && (await unsealBytes(this.key, payload, `f/${name}`));
      if (bytes) return bytes;
    }
    return null;
  }

  // Wipes the event from the brokers (host action). Other devices see `deleted` and clean up.
  async destroy() {
    this.setMeta({ deleted: true });
    await new Promise((r) => setTimeout(r, 1200));
    for (const pid of Object.keys(this.state.players)) {
      for (const kind of ['i', 'l', 'o']) this._publishRaw(this._topic(kind, pid), new Uint8Array(0));
    }
    for (const name of Object.keys(this.state.assets)) {
      this._publishRaw(`${this.base}/a/${name}`, new Uint8Array(0));
      if (name.startsWith('ph-')) this.clearFull(name);
    }
    storage.remove(`room:${this.roomId}`);
  }

  // ------------------------------------------------------------------------------- internals

  _topic(kind, pid) {
    return `${this.base}/${this._rel(kind, pid)}`;
  }

  _rel(kind, pid) {
    return kind === 'm' ? 'm' : `p/${pid}/${kind}`;
  }

  _player(pid) {
    if (!this.state.players[pid]) this.state.players[pid] = { profile: null, entries: new Map() };
    return this.state.players[pid];
  }

  _logPayload(pid) {
    const entries = [...(this.state.players[pid]?.entries.values() || [])].sort((a, b) => a.ts - b.ts);
    return { e: entries };
  }

  _schedule(name, ms, fn) {
    if (this[`_t_${name}`]) return;
    const t = setTimeout(() => {
      this._timers.delete(t);
      this[`_t_${name}`] = null;
      fn();
    }, ms);
    this[`_t_${name}`] = t;
    this._timers.add(t);
  }

  _later(ms, fn) {
    const t = setTimeout(() => {
      this._timers.delete(t);
      fn();
    }, ms);
    this._timers.add(t);
  }

  _changed() {
    this.version++;
    this._schedule('emit', 16, () => this.emit('change', this.version));
    this._schedule('save', 400, () => this._flushSave());
  }

  async _publishAll(rel, data) {
    const payload = await seal(this.key, data, rel);
    for (const b of this.brokers) b.client?.publish(`${this.base}/${rel}`, payload, { qos: 1, retain: true });
  }

  async _publishTo(b, rel, data) {
    const payload = await seal(this.key, data, rel);
    b.client?.publish(`${this.base}/${rel}`, payload, { qos: 1, retain: true });
  }



  _publishRaw(topic, payload) {
    for (const b of this.brokers) b.client?.publish(topic, payload, { qos: 1, retain: true });
  }

  async _publishPresence(on) {
    if (!this.started && on) return;
    const rel = this._rel('o', this.pid);
    const payload = await seal(this.key, { on, ts: now() }, rel);
    for (const b of this.brokers) b.client?.publish(`${this.base}/${rel}`, payload, { qos: 0, retain: true });
  }

  _onConnect(b) {
    b.settled = false;
    b.seen.clear();
    this._publishPresence(typeof document === 'undefined' || document.visibilityState === 'visible');
    this._later(SYNC.settleMs, () => {
      if (b.status !== 'online') return;
      b.settled = true;
      this._heal(b);
      this.emit('status', this.status);
    });
  }

  // Republish anything this broker is missing compared to our local view. Our own topics go out
  // immediately; other players' topics after a random delay (and a re-check), so a crowd of
  // devices does not all heal the same topic at once.
  _heal(b) {
    if (b.status !== 'online') return;
    const meta = this.state.meta;
    const tasks = [];
    if (meta) tasks.push({ rel: 'm', own: this.isHost(), stale: () => !b.seen.get('m') || newer(meta, b.seen.get('m')), data: () => this.state.meta });
    // A deleted event must stay deleted: only the tombstone meta is kept alive.
    const players = meta?.deleted ? [] : Object.entries(this.state.players);
    const assets = meta?.deleted ? [] : Object.entries(this.state.assets);
    for (const [name, a] of assets) {
      const rel = `a/${name}`;
      const stale = () => !b.seen.get(rel) || newer(a, b.seen.get(rel));
      const mine = name.startsWith(`ph-${this.pid.slice(0, 16)}-`);
      if (name.startsWith('ph-') && this.strong) {
        // A photo's thumbnail travels with its full-size version, which only the phone that took
        // it has — so only that phone puts them back, together, on a broker that lost them. (If
        // anyone else brought back the thumbnail alone, the missing photo would go unnoticed.)
        if (mine) tasks.push({ rel, own: true, stale, data: () => this.state.assets[name], full: name });
        continue;
      }
      // Older photos ("ph-<owner>-…", thumbnail only) belong to whoever took them; other shared
      // images to the host.
      tasks.push({ rel, own: name.startsWith('ph-') ? mine : this.isHost(), stale, data: () => this.state.assets[name] });
    }
    for (const [pid, p] of players) {
      const own = pid === this.pid;
      if (p.profile) {
        const rel = this._rel('i', pid);
        tasks.push({ rel, own, stale: () => !b.seen.get(rel) || (b.seen.get(rel).v || 0) < (p.profile.v || 0), data: () => p.profile });
      }
      if (p.entries.size) {
        const rel = this._rel('l', pid);
        tasks.push({ rel, own, stale: () => this._logStale(b, rel, p), data: () => this._logPayload(pid) });
      }
    }
    for (const task of tasks) {
      if (!task.stale()) continue;
      const run = async () => {
        if (b.status !== 'online' || !task.stale()) return;
        if (task.full && task.data()?.data) {
          // No copy here (another phone of ours took it)? Then leave it to that phone.
          const full = await this.fullSource?.(task.full);
          if (!full || b.status !== 'online') return;
          b.client?.publish(`${this.fbase}/${task.full}`, full, { qos: 1, retain: true });
        }
        this._publishTo(b, task.rel, task.data());
      };
      if (task.own) run();
      else this._later(400 + Math.random() * 2600, run);
    }
  }

  _logStale(b, rel, p) {
    const seen = b.seen.get(rel);
    if (!seen) return true;
    for (const id of p.entries.keys()) if (!seen.ids.has(id)) return true;
    return false;
  }

  async _onMessage(b, topic, payload) {
    if (!topic.startsWith(`${this.base}/`)) return;
    const rel = topic.slice(this.base.length + 1);
    const parts = rel.split('/');
    if (!payload.length) {
      b.seen.delete(rel);
      return;
    }
    const data = await unseal(this.key, payload, rel);
    if (!data || typeof data !== 'object') return;
    if (rel === 'm') {
      this._mergeMeta(b, data);
    } else if (parts.length === 2 && parts[0] === 'a' && ASSET_NAME.test(parts[1])) {
      this._mergeAsset(b, rel, parts[1], data);
    } else if (parts.length === 3 && parts[0] === 'p' && /^[a-z0-9]{4,32}$/.test(parts[1])) {
      const [, pid, kind] = parts;
      if (kind === 'i') this._mergeProfile(b, rel, pid, data);
      else if (kind === 'l') this._mergeLog(b, rel, pid, data);
      else if (kind === 'o') this._mergePresence(b, pid, data);
    }
  }

  _mergeAsset(b, rel, name, data) {
    const asset = cleanAsset(data);
    if (!asset) return;
    b.seen.set(rel, { v: asset.v, u: asset.u });
    const cur = this.state.assets[name];
    if (!cur || newer(asset, cur)) {
      this.state.assets[name] = asset;
      this._changed();
    }
  }

  _mergeMeta(b, data) {
    const meta = cleanMeta(data);
    if (!meta) return;
    b.seen.set('m', { v: meta.v, u: meta.u });
    const cur = this.state.meta;
    const firstSeen = !this.metaSeen;
    this.metaSeen = true;
    if (!cur || newer(meta, cur)) {
      this.state.meta = meta;
      this._changed();
    } else if (firstSeen) {
      this._changed();
    }
  }

  _mergeProfile(b, rel, pid, data) {
    const profile = cleanProfile(data);
    if (!profile) return;
    b.seen.set(rel, { v: profile.v });
    const p = this._player(pid);
    if (!p.profile || profile.v > (p.profile.v || 0)) {
      p.profile = profile;
      this._changed();
    } else if (pid === this.pid && profile.v < (p.profile.v || 0)) {
      this._schedule('own-check', 1500, () => this._checkOwn());
    }
  }

  _mergeLog(b, rel, pid, data) {
    const list = Array.isArray(data.e) ? data.e : [];
    const ids = new Set();
    const p = this._player(pid);
    let added = 0;
    for (const e of list) {
      if (!validEntry(e)) continue;
      ids.add(e.id);
      if (!p.entries.has(e.id)) {
        p.entries.set(e.id, e);
        added++;
      }
    }
    b.seen.set(rel, { ids });
    if (added) this._changed();
    if (pid === this.pid && ids.size < p.entries.size) this._schedule('own-check', 1500, () => this._checkOwn());
  }

  // Our own topics on a broker are behind (another device of ours, or a stale healer wrote last).
  _checkOwn() {
    const me = this.state.players[this.pid];
    if (!me || this.state.meta?.deleted) return;
    const logRel = this._rel('l', this.pid);
    const profRel = this._rel('i', this.pid);
    for (const b of this.brokers) {
      if (b.status !== 'online') continue;
      if (me.entries.size && this._logStale(b, logRel, me)) this._publishTo(b, logRel, this._logPayload(this.pid));
      const seenProfile = b.seen.get(profRel);
      if (me.profile && (!seenProfile || seenProfile.v < me.profile.v)) this._publishTo(b, profRel, me.profile);
    }
  }

  _mergePresence(b, pid, data) {
    if (typeof data.on !== 'boolean' || !Number.isFinite(data.ts)) return;
    const per = this.presence[pid] || (this.presence[pid] = {});
    per[b.cfg.id] = { on: data.on, ts: data.ts };
    this._schedule('emit', 16, () => this.emit('change', this.version));
  }

  // ------------------------------------------------------------------------------ persistence

  _loadCache() {
    if (!this.persist) return;
    const cached = storage.load(`room:${this.roomId}`);
    if (!cached || typeof cached !== 'object') return;
    this.state.meta = cleanMeta(cached.meta);
    // A cached event can be shown straight away (offline-first); brokers fill in the rest.
    if (this.state.meta) this.metaSeen = true;
    for (const [pid, p] of Object.entries(cached.players || {})) {
      const player = this._player(pid);
      player.profile = cleanProfile(p.profile);
      for (const e of p.entries || []) if (validEntry(e)) player.entries.set(e.id, e);
    }
    for (const [name, a] of Object.entries(cached.assets || {})) {
      const asset = cleanAsset(a);
      if (asset && ASSET_NAME.test(name)) this.state.assets[name] = asset;
    }
    this.version++;
  }

  _flushSave() {
    if (!this.persist) return;
    const players = {};
    for (const [pid, p] of Object.entries(this.state.players)) {
      players[pid] = { profile: p.profile, entries: [...p.entries.values()] };
    }
    // Photos are too big for localStorage; they live on the brokers (and with their owner).
    const assets = Object.fromEntries(Object.entries(this.state.assets).filter(([name]) => !name.startsWith('ph-')));
    const snapshot = { meta: this.state.meta, players, assets, savedAt: Date.now() };
    if (this.state.meta?.deleted) {
      storage.remove(`room:${this.roomId}`);
      return;
    }
    if (!storage.save(`room:${this.roomId}`, snapshot)) {
      // Out of quota: drop the caches of other (older) events and try again.
      const others = storage
        .listKeys('room:')
        .filter((k) => k !== `room:${this.roomId}`)
        .map((k) => ({ k, at: storage.load(k)?.savedAt || 0 }))
        .sort((a, b) => a.at - b.at);
      for (const o of others) {
        storage.remove(o.k);
        if (storage.save(`room:${this.roomId}`, snapshot)) break;
      }
    }
  }
}
