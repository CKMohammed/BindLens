// Adding files from the computer: three go up at a time, each with how far it is; the panel in the corner says
// "Adding 3 of 8 · 45%", ticks each file, says plainly what failed (Try again), and Cancel stops the rest.
// The first new document opens as soon as it is in; the words of the others are read later, when they are opened.
import { signal } from "@preact/signals";
import { store, books, addFileToBook, logChange, openBook, toast, view, bookId } from "./state.js";
import { uniqueName, cleanName, mimeOf, uid } from "./util.js";

export const upq = signal({ items: [], at: 0 });
const PAR = 3;
let ctl = new AbortController();
let running = 0;
const waiters = new Map();     // item key -> resolve
let tick = 0;

function set(key, ch) {
  const items = upq.value.items.map(it => it.key === key ? { ...it, ...ch } : it);
  upq.value = { ...upq.value, items };
}
// progress comes very often: the panel is told at most every 120 ms
function setSoon(key, ch) {
  const it = upq.value.items.find(x => x.key === key);
  if (it) Object.assign(it, ch);
  const now = Date.now();
  if (now - tick > 120) { tick = now; upq.value = { ...upq.value, items: [...upq.value.items] }; }
}

async function one(it) {
  set(it.key, { state: "up", sent: 0, error: "" });
  try {
    const bytes = await it.file.arrayBuffer();
    const made = await store.value.create(it.where, it.name, bytes, it.file.type || mimeOf(it.name), {
      signal: ctl.signal, keep: it.first || bytes.byteLength < 20 * 1024 * 1024,
      onProgress: (sent, total) => setSoon(it.key, { sent, size: total || it.size }),
    });
    made.parent = it.where;
    addFileToBook(it.bookId, made);
    const b = books.value.find(x => x.id === it.bookId);
    logChange("Added", it.name, b ? b.name : "");
    set(it.key, { state: "ok", sent: it.size, fileId: made.id });
    if (it.openFirst && !upq.value.opened?.[it.batch]) {
      upq.value = { ...upq.value, opened: { ...(upq.value.opened || {}), [it.batch]: true } };
      // open the first new document - unless you have gone into another book meanwhile
      if (view.value !== "book" || bookId.value === it.bookId) openBook(it.bookId, made.id);
    }
    return made;
  } catch (e) {
    const stopped = e && e.name === "AbortError";
    set(it.key, { state: stopped ? "stop" : "bad", error: stopped ? "Stopped" : plain(e) });
    return null;
  }
}

function plain(e) {
  const m = String(e && e.message || e || "");
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "The network stopped. Try again when it is back.";
  if (/quota|storage/i.test(m)) return "Your Drive is full: free some space in Google Drive, then try again.";
  if (/offline/i.test(m)) return "You are offline: add it when the network is back.";
  return m.replace(/^Google Drive: /, "Google Drive says: ");
}

async function pump() {
  while (running < PAR) {
    const it = upq.value.items.find(x => x.state === "wait");
    if (!it) break;
    running++;
    set(it.key, { state: "up" });
    one(it).then((made) => {
      running--;
      const w = waiters.get(it.key);
      if (w) { waiters.delete(it.key); w(made); }
      pump();
    });
  }
}

// files: [{file, bookId, where}] - every name is made unique in its folder before anything goes up
export function queueUploads(files, { open = true } = {}) {
  const batch = uid();
  const taken = new Map();
  const items = files.map((x, i) => {
    const b = books.value.find(bb => bb.id === x.bookId);
    if (!taken.has(x.where)) taken.set(x.where, [...(b ? b.files.filter(f => (f.parent || b.id) === x.where).map(f => f.name) : []), ...upq.value.items.filter(y => y.where === x.where && y.state !== "bad").map(y => y.name)]);
    const t = taken.get(x.where);
    const name = uniqueName(cleanName(x.file.name) || "file", t);
    t.push(name);
    return { key: uid(), batch, file: x.file, name, size: x.file.size || 0, sent: 0, state: "wait", bookId: x.bookId, where: x.where, openFirst: open, first: i === 0, error: "" };
  });
  if (ctl.signal.aborted) ctl = new AbortController();
  // what finished earlier and went well leaves the panel; the rest stays
  const keep = upq.value.items.filter(it => it.state !== "ok" || Date.now() - (upq.value.at || 0) < 4000);
  upq.value = { ...upq.value, items: [...keep, ...items], at: Date.now(), hidden: false };
  const done = items.map(it => new Promise(res => waiters.set(it.key, res)));
  pump();
  return Promise.all(done).then(list => list.filter(Boolean));
}

export function cancelUploads() {
  ctl.abort();
  upq.value = { ...upq.value, items: upq.value.items.map(it => it.state === "wait" ? { ...it, state: "stop", error: "Stopped" } : it) };
  for (const it of upq.value.items) if (it.state === "stop") { const w = waiters.get(it.key); if (w) { waiters.delete(it.key); w(null); } }
  ctl = new AbortController();
}

export function retryUpload(key) {
  const it = upq.value.items.find(x => x.key === key);
  if (!it) return;
  set(key, { state: "wait", error: "", sent: 0 });
  new Promise(res => waiters.set(key, res));
  pump();
}

export function retryAll() { for (const it of upq.value.items) if (it.state === "bad" || it.state === "stop") retryUpload(it.key); }
export function clearUploads() { upq.value = { items: upq.value.items.filter(it => it.state === "up" || it.state === "wait"), at: Date.now() }; }
export function uploadsBusy() { return upq.value.items.some(it => it.state === "up" || it.state === "wait"); }

// leaving the page while files go up: the browser asks first
if (typeof window !== "undefined") window.addEventListener("beforeunload", (e) => { if (uploadsBusy()) { e.preventDefault(); e.returnValue = ""; } });
void toast;
