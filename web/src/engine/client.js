// The page's side of the document engine: call(fn, ...args) -> Promise, one call at a time in order.
let worker = null;
let ready = null;
let seq = 0;
const waiting = new Map();

function start() {
  if (worker) return ready;
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  ready = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("The document engine did not start")), 60000);
    worker.addEventListener("message", function first(e) {
      if (e.data && e.data.ready) { clearTimeout(t); worker.removeEventListener("message", first); resolve(); }
    });
    worker.addEventListener("error", (e) => { clearTimeout(t); reject(new Error(e.message || "The document engine failed")); });
  });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.ready) return;
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    if (m.ok) w.resolve(m.value);
    else w.reject(new Error(m.error));
  };
  return ready;
}

export async function call(fn, ...args) {
  await start();
  const id = ++seq;
  const transfer = [];
  for (const a of args) if (a instanceof ArrayBuffer) transfer.push(a);
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, fn, args }, transfer);
  });
}

export function engineStarted() { return start(); }

// for the automatic tests of the app
if (typeof window !== "undefined") window.__blCall = call;
