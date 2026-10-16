// A tiny key-value store in the browser (IndexedDB): keeps copies of files and the words read from them, so a
// book opens fast the second time. Everything here can be thrown away; the real files are in the user's Drive.
const DB = "bindlens-web";
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ["files", "text", "kv"]) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const r = fn(s);
      t.oncomplete = () => resolve(r && "result" in r ? r.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } catch (e) {
    return undefined;
  }
}

export const idb = {
  get: (store, key) => tx(store, "readonly", s => s.get(key)),
  set: (store, key, val) => tx(store, "readwrite", s => s.put(val, key)),
  del: (store, key) => tx(store, "readwrite", s => s.delete(key)),
  clear: (store) => tx(store, "readwrite", s => s.clear()),
};
