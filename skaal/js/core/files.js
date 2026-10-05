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
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((err) => {
      opening = null;
      throw err;
    });
  }
  return opening;
}

async function run(mode, fn) {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// `value` is stored as-is; ArrayBuffers are the most portable choice across browsers.
export const putFile = (key, value) => run('readwrite', (s) => s.put(value, key));
export const getFile = (key) => run('readonly', (s) => s.get(key));
export const deleteFile = (key) => run('readwrite', (s) => s.delete(key));
