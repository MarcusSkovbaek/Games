// Central configuration. Everything meant to be tweaked without touching game logic lives here.

export const APP = {
  name: 'SKÅL',
  version: '1.0.0',
  storagePrefix: 'skaal:',
};

export const SYNC = {
  // Public MQTT-over-WebSocket brokers. The app connects to all of them at the same time and
  // merges whatever it receives, so a game keeps running even if one broker is down or blocked
  // on the local Wi-Fi. All payloads are end-to-end encrypted with a key derived from the event
  // code, so the brokers only ever see ciphertext.
  //
  // Want full control? Create a free private broker (e.g. HiveMQ Cloud) and list it here:
  //   { id: 'mine', url: 'wss://<cluster>.hivemq.cloud:8884/mqtt', username: '…', password: '…' }
  brokers: [
    { id: 'hivemq', url: 'wss://broker.hivemq.com:8884/mqtt' },
    { id: 'emqx', url: 'wss://broker.emqx.io:8084/mqtt' },
    { id: 'eclipse', url: 'wss://mqtt.eclipseprojects.io/mqtt' },
  ],
  topicRoot: 'skaal/v1',
  keepaliveSec: 30,
  // How long to wait for retained messages after (re)connecting before healing a broker.
  settleMs: 2500,
  // Presence counts as "online" while heartbeats are younger than this.
  presenceTtlMs: 4 * 60 * 1000,
  heartbeatMs: 60 * 1000,
};

export const GAMEPLAY = {
  // "Get ready" countdown (3-2-1) before a minigame starts accepting answers.
  introMs: 3000,
  // How long a finished minigame result stays on screen before it moves to the feed.
  resultMs: 12000,
  // Minimum players before automatic breakers kick in.
  minPlayersForBreakers: 2,
  // Cooldowns for personal wheel spins (ms).
  leadCooldownMs: 10 * 60 * 1000,
  comebackCooldownMs: 20 * 60 * 1000,
  milestoneEvery: 5,
  // Inbox items (sips to drink etc.) older than this are hidden.
  inboxTtlMs: 3 * 60 * 60 * 1000,
  // Unspun wheel offers expire after this long.
  offerTtlMs: 2 * 60 * 60 * 1000,
};

// Local development / automated tests can point the app at their own broker with
// ?broker=ws://127.0.0.1:1883 — only honoured when served from localhost so a shared
// link can never redirect real players to a foreign broker.
export function resolveBrokers(loc = globalThis.location) {
  try {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname);
    const params = new URLSearchParams(loc.search);
    const custom = params.getAll('broker').filter(Boolean);
    if (local && custom.length) return custom.map((url, i) => ({ id: 'dev' + i, url }));
  } catch {
    /* fall through to defaults */
  }
  return SYNC.brokers;
}

export function isDevMode(loc = globalThis.location) {
  try {
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname) || new URLSearchParams(loc.search).has('dev');
  } catch {
    return false;
  }
}
