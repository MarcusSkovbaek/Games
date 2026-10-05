// Defensive localStorage wrapper: private mode, full quota or disabled storage must never break
// the app — everything also lives on the brokers.
import { APP } from '../config.js';

const P = APP.storagePrefix;

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(P + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(P + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(P + key);
  } catch {
    /* ignore */
  }
}

export function listKeys(prefix = '') {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(P + prefix)) out.push(k.slice(P.length));
    }
  } catch {
    /* ignore */
  }
  return out;
}
