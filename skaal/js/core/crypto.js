// End-to-end encryption for everything that leaves the device.
//
// The event code is the shared secret: the broker topic is a hash of it and the AES-GCM key is
// derived from it with PBKDF2. The code itself only ever travels in the URL fragment (#…), which
// browsers never send to a server, so brokers and hosting only see opaque bytes.

const te = new TextEncoder();
const td = new TextDecoder();
const FORMAT_VERSION = 1;
const IV_BYTES = 12;

export function hasWebCrypto() {
  return !!(globalThis.crypto && globalThis.crypto.subtle && typeof globalThis.crypto.getRandomValues === 'function');
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', te.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function deriveRoom(code) {
  const roomId = (await sha256Hex(`skaal:room:${code}`)).slice(0, 24);
  const material = await crypto.subtle.importKey('raw', te.encode(code), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: te.encode('skaal:key:v1'), iterations: 60000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { roomId, key };
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
