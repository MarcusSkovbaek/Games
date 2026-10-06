// End-to-end encryption for everything that leaves the device.
//
// The event code is the shared secret: both the broker topic and the AES-GCM key are derived from
// it. The code itself only ever travels in the URL fragment (#…), which browsers never send to a
// server, so brokers and hosting only see opaque bytes.
//
// Events use 12-character codes (about 59 bits). Topic and key come from one slow PBKDF2
// derivation (600 000 iterations), so anyone who collects the encrypted data from a public broker
// has to pay that cost for every guess — guessing a code would take around a million years of
// GPU time. Older events with 8-character codes keep their original derivation (a fast hash for
// the topic) so they still open, but they are only meant for drinks and scores, not photos.

import { LEGACY_CODE_LENGTH } from './ids.js';

const te = new TextEncoder();
const td = new TextDecoder();
const FORMAT_VERSION = 1; // sealed JSON
const BYTES_VERSION = 2; // sealed raw bytes (photos)
const IV_BYTES = 12;
export const KDF_ITERATIONS = 600_000;

export function hasWebCrypto() {
  return !!(globalThis.crypto && globalThis.crypto.subtle && typeof globalThis.crypto.getRandomValues === 'function');
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', te.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

// SHA-256 of some bytes, as hex (e.g. to name a picture after its content).
export async function digestHex(bytes) {
  return hex(await sha256(bytes));
}

const join = (label, bytes) => {
  const head = te.encode(label);
  const out = new Uint8Array(head.length + bytes.length);
  out.set(head);
  out.set(bytes, head.length);
  return out;
};

// `strong` is false for legacy 8-character codes.
export async function deriveRoom(code) {
  if (code.length === LEGACY_CODE_LENGTH) return deriveLegacy(code);
  const material = await crypto.subtle.importKey('raw', te.encode(code), 'PBKDF2', false, ['deriveBits']);
  const master = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: te.encode('skaal:v2'), iterations: KDF_ITERATIONS, hash: 'SHA-256' }, material, 256),
  );
  const roomId = hex((await sha256(join('skaal:v2:room', master))).slice(0, 12));
  const key = await crypto.subtle.importKey('raw', await sha256(join('skaal:v2:key', master)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  master.fill(0);
  return { roomId, key, strong: true };
}

async function deriveLegacy(code) {
  const roomId = (await sha256Hex(`skaal:room:${code}`)).slice(0, 24);
  const material = await crypto.subtle.importKey('raw', te.encode(code), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: te.encode('skaal:key:v1'), iterations: 60000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { roomId, key, strong: false };
}

// `context` (the relative topic) is bound as additional authenticated data so a ciphertext can
// never be replayed onto another player's topic.
export async function seal(key, value, context = '') {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plain = te.encode(JSON.stringify(value));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(context) }, key, plain),
  );
  const out = new Uint8Array(1 + IV_BYTES + cipher.length);
  out[0] = FORMAT_VERSION;
  out.set(iv, 1);
  out.set(cipher, 1 + IV_BYTES);
  return out;
}

export async function unseal(key, bytes, context = '') {
  try {
    if (!bytes || bytes.length < 1 + IV_BYTES + 16 || bytes[0] !== FORMAT_VERSION) return null;
    const iv = bytes.subarray(1, 1 + IV_BYTES);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: te.encode(context) },
      key,
      bytes.subarray(1 + IV_BYTES),
    );
    return JSON.parse(td.decode(plain));
  } catch {
    return null;
  }
}

// Raw bytes (a photo) instead of JSON: no base64 overhead, so a picture fits in fewer bytes.
export async function sealBytes(key, bytes, context = '') {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(context) }, key, bytes));
  const out = new Uint8Array(1 + IV_BYTES + cipher.length);
  out[0] = BYTES_VERSION;
  out.set(iv, 1);
  out.set(cipher, 1 + IV_BYTES);
  return out;
}

export async function unsealBytes(key, payload, context = '') {
  try {
    if (!payload || payload.length < 1 + IV_BYTES + 16 || payload[0] !== BYTES_VERSION) return null;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: payload.subarray(1, 1 + IV_BYTES), additionalData: te.encode(context) },
      key,
      payload.subarray(1 + IV_BYTES),
    );
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}
