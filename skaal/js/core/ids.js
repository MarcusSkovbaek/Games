// Event codes and random identifiers.
//
// Codes use 31 unambiguous characters (no 0/O, 1/I/L) so they are easy to read aloud and type.
// 12 characters ≈ 7.9·10^17 combinations — the code is also the secret the encryption key is
// derived from, so it must not be guessable (see core/crypto.js). Events created before photos
// existed have 8-character codes; they still open.

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 12;
export const LEGACY_CODE_LENGTH = 8;

function randomIndex(max) {
  // Rejection sampling keeps the distribution uniform.
  const limit = 256 - (256 % max);
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export function randomCode() {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomIndex(CODE_ALPHABET.length)];
  return out;
}

export function normalizeCode(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
}

export function isValidCode(code) {
  return typeof code === 'string' && (code.length === CODE_LENGTH || code.length === LEGACY_CODE_LENGTH) && [...code].every((c) => CODE_ALPHABET.includes(c));
}

// Old 8-character codes protect drinks and scores, but are too short to guard photos.
export const isStrongCode = (code) => typeof code === 'string' && code.length === CODE_LENGTH;

// Groups of four: "K7F2-QXRM-8HJP" (or "K7F2-QXRM" for an old code). Also used while typing.
export function formatCode(code) {
  return String(code || '').match(/.{1,4}/g)?.join('-') || '';
}

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function randomId(len = 10) {
  let out = '';
  for (let i = 0; i < len; i++) out += ID_ALPHABET[randomIndex(ID_ALPHABET.length)];
  return out;
}

// Cryptographically random float in [0, 1) for game decisions made on this device.
export function randomFloat() {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return (buf[0] * 2 ** 21 + (buf[1] >>> 11)) / 2 ** 53;
}
