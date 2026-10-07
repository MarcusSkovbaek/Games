// Larger files kept only on this device (IndexedDB), e.g. the Tour song a host picks from their
// phone. Nothing stored here is ever synced.
const DB = 'skaal-files';
const STORE = 'files';

let opening = null;

function db() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = globalThis.indexedDB?.open(DB, 1);
      if (!req) return reject(new Error('IndexedDB unavailable'));
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const conn = req.result;
        // The browser may close the connection (iOS does after a while in the background, and
        // when the site's data is cleared): open a new one next time.
        conn.onclose = () => forget(conn);
        conn.onversionchange = () => {
          conn.close();
          forget(conn);
        };
        resolve(conn);
      };
      req.onerror = () => reject(req.error);
    }).catch((err) => {
      opening = null;
      throw err;
    });
  }
  return opening;
}

async function forget(conn) {
  const current = opening;
  if (current && (await current.catch(() => null)) === conn && opening === current) opening = null;
}

async function run(mode, fn, retry = true) {
  const conn = await db();
  try {
    return await new Promise((resolve, reject) => {
      const tx = conn.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    // A connection closed under us (InvalidStateError — or Safari's "connection to Indexed
    // Database server lost", an UnknownError): once more, on a new one.
    if (!retry || (err?.name !== 'InvalidStateError' && err?.name !== 'UnknownError')) throw err;
    await forget(conn);
    return run(mode, fn, false);
  }
}

// `value` is stored as-is; ArrayBuffers are the most portable choice across browsers.
export const putFile = (key, value) => run('readwrite', (s) => s.put(value, key));
export const getFile = (key) => run('readonly', (s) => s.get(key));
export const deleteFile = (key) => run('readwrite', (s) => s.delete(key));

// Reads and rewrites `key` in one go: `change` gets what is stored (undefined if nothing) and
// returns what to store. Two changes at the same time (say, of a list) can't undo each other.
export const updateFile = (key, change) =>
  run('readwrite', (s) => {
    const req = s.get(key);
    req.onsuccess = () => s.put(change(req.result), key);
  });
