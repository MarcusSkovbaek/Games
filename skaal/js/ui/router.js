// Hash router: #/ (start), #/ny (create), #/deltag (join), #/e/<code> (event), #/tv/<code> (big screen).
// Hash routing keeps the app working on any static host, and the event code (which is also the
// encryption secret) never leaves the browser because fragments are not sent to servers.
import { createStore } from './kit.js';

function parse() {
  const raw = (globalThis.location?.hash || '').replace(/^#/, '') || '/';
  const parts = raw.split('/').filter(Boolean);
  return { path: raw, name: parts[0] || 'home', param: parts[1] ? decodeURIComponent(parts[1]) : null };
}

export const route = createStore(parse());

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => route.set(parse()));
}

export function navigate(path, { replace = false } = {}) {
  const url = `#${path}`;
  if (replace) {
    history.replaceState(history.state, '', url);
    route.set(parse());
  } else if (location.hash !== url) {
    location.hash = path;
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function eventLink(code) {
  return `${location.origin}${location.pathname}#/e/${code}`;
}

export function tvLink(code) {
  return `${location.origin}${location.pathname}#/tv/${code}`;
}
