// Minimal MQTT 3.1.1 client over WebSocket — no dependencies, ~300 lines.
//
// Supports what the game needs: QoS 0/1 publish (with an offline outbox where a newer retained
// message replaces an older one for the same topic), subscriptions, retained messages, one-off
// fetches of a single retained message, a last will, keepalive pings and automatic reconnect with
// jittered exponential backoff.

const te = new TextEncoder();
const td = new TextDecoder();

const T = {
  CONNECT: 1,
  CONNACK: 2,
  PUBLISH: 3,
  PUBACK: 4,
  PUBREC: 5,
  PUBREL: 6,
  PUBCOMP: 7,
  SUBSCRIBE: 8,
  SUBACK: 9,
  UNSUBSCRIBE: 10,
  UNSUBACK: 11,
  PINGREQ: 12,
  PINGRESP: 13,
  DISCONNECT: 14,
};

function concat(parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const u16 = (n) => Uint8Array.of((n >> 8) & 0xff, n & 0xff);
const str = (s) => {
  const b = te.encode(s);
  return concat([u16(b.length), b]);
};
const bin = (b) => concat([u16(b.length), b]);

function remainingLength(n) {
  const out = [];
  do {
    let digit = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) digit |= 0x80;
    out.push(digit);
  } while (n > 0);
  return Uint8Array.from(out);
}

function packet(first, parts) {
  const body = concat(parts);
  return concat([Uint8Array.of(first), remainingLength(body.length), body]);
}

export function encodeConnect({ clientId, keepalive = 30, username, password, will, clean = true }) {
  let flags = clean ? 0x02 : 0;
  const payload = [str(clientId)];
  if (will) {
    flags |= 0x04 | ((will.qos || 0) << 3) | (will.retain ? 0x20 : 0);
    payload.push(str(will.topic), bin(will.payload));
  }
  if (username != null) {
    flags |= 0x80;
    payload.push(str(username));
  }
  if (password != null) {
    flags |= 0x40;
    payload.push(bin(te.encode(password)));
  }
  return packet(T.CONNECT << 4, [str('MQTT'), Uint8Array.of(4, flags), u16(keepalive), ...payload]);
}

export function encodePublish({ topic, payload, qos = 0, retain = false, dup = false, id = 0 }) {
  const first = (T.PUBLISH << 4) | (dup ? 0x08 : 0) | (qos << 1) | (retain ? 0x01 : 0);
  const parts = [str(topic)];
  if (qos > 0) parts.push(u16(id));
  parts.push(payload);
  return packet(first, parts);
}

export function encodeSubscribe(id, topics) {
  const parts = [u16(id)];
  for (const t of topics) parts.push(str(t.topic), Uint8Array.of(t.qos || 0));
  return packet((T.SUBSCRIBE << 4) | 0x02, parts);
}

export function encodeUnsubscribe(id, topics) {
  return packet((T.UNSUBSCRIBE << 4) | 0x02, [u16(id), ...topics.map(str)]);
}

const ack = (type, flags, id) => packet((type << 4) | flags, [u16(id)]);
const PINGREQ_BYTES = Uint8Array.of(T.PINGREQ << 4, 0);
const DISCONNECT_BYTES = Uint8Array.of(T.DISCONNECT << 4, 0);

function decodePacket(first, body) {
  const type = first >> 4;
  const id16 = (at) => (body[at] << 8) | body[at + 1];
  switch (type) {
    case T.CONNACK:
      return { type: 'connack', sessionPresent: !!(body[0] & 1), returnCode: body[1] };
    case T.PUBLISH: {
      const qos = (first >> 1) & 3;
      const tlen = id16(0);
      const topic = td.decode(body.subarray(2, 2 + tlen));
      let p = 2 + tlen;
      let id = 0;
      if (qos > 0) {
        id = id16(p);
        p += 2;
      }
      return { type: 'publish', topic, payload: body.slice(p), qos, retain: !!(first & 1), dup: !!(first & 8), id };
    }
    case T.PUBACK:
      return { type: 'puback', id: id16(0) };
    case T.PUBREC:
      return { type: 'pubrec', id: id16(0) };
    case T.PUBREL:
      return { type: 'pubrel', id: id16(0) };
    case T.PUBCOMP:
      return { type: 'pubcomp', id: id16(0) };
    case T.SUBACK:
      return { type: 'suback', id: id16(0), codes: [...body.subarray(2)] };
    case T.UNSUBACK:
      return { type: 'unsuback', id: id16(0) };
    case T.PINGRESP:
      return { type: 'pingresp' };
    default:
      return { type: 'unknown', code: type };
  }
}

// Splits a byte stream into packets. Returns the parsed packets, the unconsumed tail, and — when a
// packet is bigger than `max` — how many bytes of it are still to come and must be thrown away
// (`skip`). Anyone can publish to a public broker, so a huge message on one of our topics must not
// be buffered (or bring the connection down).
export function parsePackets(buf, max = Infinity) {
  const packets = [];
  let off = 0;
  while (buf.length - off >= 2) {
    let len = 0;
    let mult = 1;
    let i = off + 1;
    let incomplete = false;
    for (let n = 0; ; n++) {
      if (n >= 4) throw new Error('MQTT: malformed remaining length');
      if (i >= buf.length) {
        incomplete = true;
        break;
      }
      const byte = buf[i++];
      len += (byte & 0x7f) * mult;
      mult *= 128;
      if (!(byte & 0x80)) break;
    }
    if (incomplete) break;
    if (len > max) {
      if (i + len <= buf.length) {
        off = i + len;
        continue;
      }
      return { packets, rest: new Uint8Array(0), skip: i + len - buf.length };
    }
    if (i + len > buf.length) break;
    packets.push(decodePacket(buf[off], buf.subarray(i, i + len)));
    off = i + len;
  }
  return { packets, rest: buf.slice(off), skip: 0 };
}

export class MqttClient {
  constructor({
    url,
    clientId,
    keepalive = 30,
    username,
    password,
    onMessage = () => {},
    onStatus = () => {},
    onConnect = () => {},
    WebSocketImpl = globalThis.WebSocket,
    // Bigger messages are skipped. Ours stay well below (a full-size photo is ~230 KB).
    maxPacket = 2 * 1024 * 1024,
  }) {
    Object.assign(this, { url, clientId, keepalive, username, password, onMessage, onStatus, onConnect, WebSocketImpl, maxPacket });
    this.skip = 0; // bytes of an oversized packet still to throw away
    this.skipped = 0; // how many oversized packets were thrown away
    this.status = 'idle';
    this.will = null;
    this.subs = new Map(); // topic -> qos
    this.pending = new Map(); // key -> { topic, payload, qos, retain, id }
    this.byId = new Map(); // packet id -> pending key
    this.fetches = new Map(); // topic -> one-off fetch of a retained message
    this.nextId = 1;
    this.attempt = 0;
    this.ws = null;
    this.buf = new Uint8Array(0);
    this.lastRx = 0;
    this.seq = 0;
    this.stopped = true;
  }

  get online() {
    return this.status === 'online';
  }

  setWill(will) {
    this.will = will; // applied on the next (re)connect
  }

  start() {
    this.stopped = false;
    this._connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this._retryTimer);
    for (const f of [...this.fetches.values()]) this._finishFetch(f, null);
    if (this.ws && this.status === 'online') this._send(DISCONNECT_BYTES);
    this._teardown();
    this._setStatus('stopped');
  }

  // Called when the page becomes visible or the network comes back: verify the socket quickly.
  wake() {
    if (this.stopped) return;
    if (this.status === 'online') {
      const sentAt = Date.now();
      this._send(PINGREQ_BYTES);
      clearTimeout(this._wakeTimer);
      this._wakeTimer = setTimeout(() => {
        if (this.status === 'online' && this.lastRx < sentAt) this._drop('wake-timeout');
      }, 5000);
    } else if (this.status !== 'connecting') {
      this.attempt = 0;
      this._connect();
    }
  }

  subscribe(topic, qos = 0) {
    this.subs.set(topic, qos);
    if (this.online) this._send(encodeSubscribe(this._allocId(), [{ topic, qos }]));
  }

  unsubscribe(topic) {
    this.subs.delete(topic);
    if (this.online) this._send(encodeUnsubscribe(this._allocId(), [topic]));
  }

  // The retained message on one topic, without keeping the subscription — for big things (a
  // full-size photo) that are only needed when someone looks at them. Resolves with the payload,
  // or null when the broker has none, the connection drops or it takes too long. A broker sends a
  // retained message right after acknowledging the subscription, so "nothing within graceMs of the
  // SUBACK, and nothing still arriving" means there is none.
  fetchRetained(topic, { graceMs = 1200, timeoutMs = 25000 } = {}) {
    if (!this.online) return Promise.resolve(null);
    const running = this.fetches.get(topic);
    if (running) return running.promise;
    const f = { topic, id: this._allocId(), timers: [] };
    f.promise = new Promise((resolve) => (f.resolve = resolve));
    f.graceMs = graceMs;
    this.fetches.set(topic, f);
    f.timers.push(setTimeout(() => this._finishFetch(f, null), timeoutMs));
    this._send(encodeSubscribe(f.id, [{ topic, qos: 0 }]));
    return f.promise;
  }

  _finishFetch(f, payload) {
    if (this.fetches.get(f.topic) !== f) return;
    this.fetches.delete(f.topic);
    f.timers.forEach(clearTimeout);
    if (this.online) this._send(encodeUnsubscribe(this._allocId(), [f.topic]));
    f.resolve(payload);
  }

  _fetchAcked(f, ok) {
    if (!ok) {
      this._finishFetch(f, null);
      return;
    }
    const check = () => {
      if (this.fetches.get(f.topic) !== f) return;
      // A big message may still be on its way: wait while bytes keep arriving.
      if (this.buf.length || Date.now() - this.lastRx < 300) f.timers.push(setTimeout(check, 300));
      else this._finishFetch(f, null);
    };
    f.timers.push(setTimeout(check, f.graceMs));
  }

  publish(topic, payload, { qos = 1, retain = false } = {}) {
    if (qos === 0) {
      if (this.online) this._send(encodePublish({ topic, payload, qos: 0, retain }));
      return;
    }
    const key = retain ? `r:${topic}` : `n:${++this.seq}`;
    const prev = this.pending.get(key);
    if (prev?.id) this.byId.delete(prev.id);
    this.pending.delete(key); // re-insert to keep publish order
    const msg = { topic, payload, qos, retain, id: 0 };
    this.pending.set(key, msg);
    if (this.online) this._sendPending(key, msg);
  }

  // True when every QoS 1 message has been acknowledged by the broker.
  get flushed() {
    return this.pending.size === 0;
  }

  // ----------------------------------------------------------------------------------------------

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.onStatus(status);
  }

  _allocId() {
    const fetching = new Set([...this.fetches.values()].map((f) => f.id));
    for (let i = 0; i < 65535; i++) {
      const id = this.nextId;
      this.nextId = this.nextId >= 65535 ? 1 : this.nextId + 1;
      if (!this.byId.has(id) && !fetching.has(id)) return id;
    }
    return 1;
  }

  _sendPending(key, msg) {
    msg.id = this._allocId();
    this.byId.set(msg.id, key);
    this._send(encodePublish(msg));
  }

  _send(bytes) {
    try {
      if (this.ws && this.ws.readyState === 1) this.ws.send(bytes);
    } catch {
      /* socket died; the close handler reconnects */
    }
  }

  _connect() {
    if (this.stopped) return;
    clearTimeout(this._retryTimer);
    this._teardown();
    this._setStatus('connecting');
    let ws;
    try {
      ws = new this.WebSocketImpl(this.url, ['mqtt']);
    } catch {
      this._scheduleReconnect();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.buf = new Uint8Array(0);
    this.skip = 0;
    this._connectTimer = setTimeout(() => {
      if (this.ws === ws && this.status !== 'online') this._drop('connect-timeout');
    }, 10000);
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this._send(
        encodeConnect({
          clientId: this.clientId,
          keepalive: this.keepalive,
          username: this.username,
          password: this.password,
          will: this.will,
        }),
      );
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      const chunk = new Uint8Array(ev.data);
      this._feed(chunk);
    };
    ws.onclose = () => {
      if (this.ws === ws) this._drop('closed');
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  _feed(chunk) {
    this.lastRx = Date.now();
    if (this.skip) {
      if (chunk.length <= this.skip) {
        this.skip -= chunk.length;
        return;
      }
      chunk = chunk.subarray(this.skip);
      this.skip = 0;
    }
    const data = this.buf.length ? concat([this.buf, chunk]) : chunk;
    let parsed;
    try {
      parsed = parsePackets(data, this.maxPacket);
    } catch {
      this._drop('protocol-error');
      return;
    }
    this.buf = parsed.rest;
    if (parsed.skip) {
      this.skip = parsed.skip;
      this.skipped++;
    }
    for (const p of parsed.packets) this._handle(p);
  }

  _handle(p) {
    switch (p.type) {
      case 'connack':
        if (p.returnCode !== 0) {
          this.lastError = `connack-${p.returnCode}`;
          this._drop('refused');
          return;
        }
        clearTimeout(this._connectTimer);
        this.attempt = 0;
        this._setStatus('online');
        if (this.subs.size) {
          this._send(encodeSubscribe(this._allocId(), [...this.subs].map(([topic, qos]) => ({ topic, qos }))));
        }
        this.byId.clear();
        for (const [key, msg] of this.pending) this._sendPending(key, msg);
        this._startPing();
        this.onConnect();
        break;
      case 'publish': {
        if (p.qos === 1) this._send(ack(T.PUBACK, 0, p.id));
        if (p.qos === 2) this._send(ack(T.PUBREC, 0, p.id));
        const f = this.fetches.get(p.topic);
        if (f) this._finishFetch(f, p.payload.length ? p.payload : null);
        else this.onMessage(p.topic, p.payload, { retain: p.retain });
        break;
      }
      case 'suback': {
        const f = [...this.fetches.values()].find((x) => x.id === p.id);
        if (f) this._fetchAcked(f, p.codes.every((c) => c < 0x80));
        break;
      }
      case 'puback': {
        const key = this.byId.get(p.id);
        this.byId.delete(p.id);
        if (key && this.pending.get(key)?.id === p.id) this.pending.delete(key);
        break;
      }
      case 'pubrel':
        this._send(ack(T.PUBCOMP, 0, p.id));
        break;
      default:
        break;
    }
  }

  _startPing() {
    clearInterval(this._pingTimer);
    const every = Math.max(5, this.keepalive / 2) * 1000;
    this._pingTimer = setInterval(() => {
      if (this.status !== 'online') return;
      if (Date.now() - this.lastRx > this.keepalive * 1600) {
        this._drop('keepalive-timeout');
        return;
      }
      this._send(PINGREQ_BYTES);
    }, every);
  }

  _teardown() {
    clearTimeout(this._connectTimer);
    clearTimeout(this._wakeTimer);
    clearInterval(this._pingTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  _drop(reason) {
    if (reason !== 'refused') this.lastError = reason;
    this._teardown();
    for (const f of [...this.fetches.values()]) this._finishFetch(f, null);
    if (this.stopped) {
      this._setStatus('stopped');
      return;
    }
    this._setStatus('offline');
    this._scheduleReconnect();
  }

  _scheduleReconnect() {
    clearTimeout(this._retryTimer);
    const base = Math.min(15000, 600 * 2 ** this.attempt);
    this.attempt = Math.min(this.attempt + 1, 10);
    this._retryTimer = setTimeout(() => this._connect(), base * (0.6 + Math.random() * 0.8));
  }
}
