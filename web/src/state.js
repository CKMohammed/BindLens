// The app's state: what is open, the library, the settings that are saved in the user's Drive.
import { signal, computed, batch } from "@preact/signals";
import { colorFor, debounce, natCompare, kindOf } from "./util.js";

export const store = signal(null);          // DriveStore or DemoStore
export const phase = signal("start");       // start | loading | ready | error
export const errorText = signal("");
export const books = signal([]);            // [{id, name, color, files:[...]}]
export const looseFiles = signal([]);
export const settings = signal({});
export const view = signal("home");         // home | book
export const bookId = signal(null);
export const fileId = signal(null);         // the document at the top of the screen
export const pageNo = signal(0);            // page within that document
export const readMode = signal(false);
export const leftOpen = signal(true);
export const tool = signal("select");
export const toolOpts = signal({ color: "#FFD43B", pen: "#E03131", width: 2, shape: "rect", stamp: "APPROVED",
  hlKind: "Highlight", textSize: 12 });
export const zoom = signal(1);
export const fitWidth = signal(true);
export const saving = signal({ n: 0, last: null, error: "" });
export const locked = signal(false);
export const sideTab = signal("files");     // files | marks | search
export const needsTap = signal(null);       // a function to call from a click when Google wants a new sign-in
export const panel = signal(null);          // the open panel/dialog: {type, ...}
export const toasts = signal([]);
export const undoStack = signal([]);        // keys of documents changed, last first
export const redoStack = signal([]);

export const currentBook = computed(() => books.value.find(b => b.id === bookId.value) || null);
export const currentFile = computed(() => {
  const b = currentBook.value;
  return b ? b.files.find(f => f.id === fileId.value) || null : null;
});

export function toast(text, kind = "", ms = 3200) {
  const id = Math.random();
  toasts.value = [...toasts.value, { id, text, kind }];
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, ms);
}

// ---- settings: kept in the Drive, saved a moment after a change
const saveSettingsSoon = debounce(async () => {
  const s = store.value;
  if (!s) return;
  try { await s.saveSettings(settings.value); } catch (e) { console.warn("settings", e); }
}, 1500);

export function setSetting(key, value) {
  settings.value = { ...settings.value, [key]: value };
  saveSettingsSoon();
}

export function bookMeta(id) {
  return (settings.value.books || {})[id] || {};
}

export function setBookMeta(id, change) {
  const all = { ...(settings.value.books || {}) };
  all[id] = { ...(all[id] || {}), ...change };
  setSetting("books", all);
}

// ---- the library from the store
export function buildLibrary(list) {
  const metas = settings.value.books || {};
  const order = settings.value.bookOrder || [];
  const byBook = new Map(list.books.map(b => [b.id, []]));
  for (const f of list.files) {
    if (f.name.startsWith(".") || f.name === "BindLens library.json") continue;
    if (byBook.has(f.book)) byBook.get(f.book).push({ ...f, kind: kindOf(f.name, f.mime) });
  }
  const out = list.books.map(b => {
    const m = metas[b.id] || {};
    const files = byBook.get(b.id) || [];
    const fo = m.fileOrder || [];
    files.sort((a, c) => {
      const ia = fo.indexOf(a.id), ic = fo.indexOf(c.id);
      if (ia >= 0 || ic >= 0) return (ia < 0 ? 1e9 : ia) - (ic < 0 ? 1e9 : ic);
      return natCompare(a.name, c.name);
    });
    return { id: b.id, name: b.name, color: m.color || colorFor(b.name), files, modified: b.modified };
  });
  out.sort((a, b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    return natCompare(a.name, b.name);
  });
  return out;
}

export async function reloadLibrary() {
  const s = store.value;
  const list = await s.listAll();
  batch(() => {
    books.value = buildLibrary(list);
    looseFiles.value = list.loose || [];
  });
}

export function patchFile(f) {
  books.value = books.value.map(b => ({
    ...b, files: b.files.map(x => x.id === f.id ? { ...x, ...f, kind: x.kind } : x),
  }));
}

export function addFileToBook(bookIdv, f) {
  books.value = books.value.map(b => b.id === bookIdv ? { ...b, files: [...b.files, { ...f, kind: kindOf(f.name, f.mime) }] } : b);
}

export function removeFile(id) {
  books.value = books.value.map(b => ({ ...b, files: b.files.filter(x => x.id !== id) }));
}

export function openBook(id, fid = null, page = 0) {
  batch(() => {
    bookId.value = id;
    view.value = "book";
    const b = books.value.find(x => x.id === id);
    const f = fid || (b && b.files[0] && b.files[0].id) || null;
    fileId.value = f;
    pageNo.value = page;
    panel.value = null;
  });
  const recent = [id, ...(settings.value.recent || []).filter(x => x !== id)].slice(0, 12);
  setSetting("recent", recent);
}

export function goHome() {
  batch(() => { view.value = "home"; panel.value = null; readMode.value = false; });
}

export function rememberPlace() {
  if (!bookId.value) return;
  const last = { book: bookId.value, file: fileId.value, page: pageNo.value, at: Date.now() };
  const prev = settings.value.last || {};
  if (prev.book === last.book && prev.file === last.file && prev.page === last.page) return;
  setSetting("last", last);
}

// a phone-size screen (the layout changes)
export const narrow = signal(typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
if (typeof window !== "undefined") {
  window.matchMedia("(max-width: 760px)").addEventListener("change", (e) => { narrow.value = e.matches; });
}
