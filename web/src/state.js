// The app's state: what is open, the library, the settings that are saved in the user's Drive.
import { signal, computed, batch, effect } from "@preact/signals";
import { idb } from "./idb.js";
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
export const fitPage = signal(false);       // the whole page in the window (instead of its width)
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
    if (byBook.has(f.book)) byBook.get(f.book).push({ ...f, sub: f.sub || "", parent: f.parent || f.book, kind: kindOf(f.name, f.mime) });
  }
  const subsOf = new Map();
  for (const sb of list.subs || []) {
    if (!subsOf.has(sb.book)) subsOf.set(sb.book, []);
    subsOf.get(sb.book).push({ id: sb.id, name: sb.name, path: sb.path });
  }
  const out = list.books.map(b => {
    const m = metas[b.id] || {};
    const files = byBook.get(b.id) || [];
    sortFiles(files, m.fileOrder || []);
    const subs = (subsOf.get(b.id) || []).sort((a, c) => natCompare(a.path, c.path));
    return { id: b.id, name: b.name, color: m.color || colorFor(b.name), files, subs, modified: b.modified, shared: !!b.shared };
  });
  out.sort((a, b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    return natCompare(a.name, b.name);
  });
  return out;
}

// the files of a book: the ones at its top first, then each sub-book (folder inside it) in order
export function sortFiles(files, fo) {
  files.sort((a, c) => {
    if ((a.sub || "") !== (c.sub || "")) {
      if (!a.sub) return -1;
      if (!c.sub) return 1;
      return natCompare(a.sub, c.sub);
    }
    const ia = fo.indexOf(a.id), ic = fo.indexOf(c.id);
    if (ia >= 0 || ic >= 0) return (ia < 0 ? 1e9 : ia) - (ic < 0 ? 1e9 : ic);
    return natCompare(a.name, c.name);
  });
  return files;
}

// the sub-book shown on its own ("Open this sub-book"): {book, path} or null
export const subView = signal(null);
export const offline = signal({ on: false, waiting: 0 });
// the ribbon's tab in a book (Read, Mark, Edit, Fill & Sign, Pages, Review) - remembered in this browser
export const ribbonTab = signal((() => { try { return localStorage.getItem("bl-tab") || "mark"; } catch (e) { return "mark"; } })());
export function setTab(t) { ribbonTab.value = t; try { localStorage.setItem("bl-tab", t); } catch (e) {} }
// reading aloud: {on, paused, fileId, page, i (sentence), n} and the lines being read, lit on the page
export const aloud = signal({ on: false });
// the frame lights up once when something new comes in (files added, new rows in a report)
export const framePulse = signal(false);
export function pulseFrame() { framePulse.value = false; setTimeout(() => { framePulse.value = true; setTimeout(() => { framePulse.value = false; }, 1300); }, 20); }
export const aloudMark = signal(null);          // {fileId, page, rects:[[x0,y0,x1,y1]], word:[x0,y0,x1,y1]?}   // no network: what waits to go up to the Drive
export const commentsOpen = signal(null);      // the comments beside the page: null, or {focus, fileId, draft}
export function visibleFiles(book) {
  const sv = subView.value;
  if (!book) return [];
  if (!sv || sv.book !== book.id) return book.files;
  return book.files.filter(f => f.sub === sv.path || (f.sub || "").startsWith(sv.path + "/"));
}

// the status of a file (Pending, Checked, Signed, Done, Urgent, Waiting or your own), as in the Windows app
export const STATUSES = [["Pending", "#E8772E"], ["Checked", "#2F80ED"], ["Signed", "#8E5CE6"], ["Done", "#1E8E3E"],
  ["Urgent", "#B3261E"], ["Waiting", "#9AA0A6"]];
export function statusOf(fileIdv) { return (settings.value.tags || {})[fileIdv] || ""; }
export function statusColor(tag) { return (STATUSES.find(s => s[0] === tag) || [0, "#7A7690"])[1]; }
export function setStatus(fileIdv, tag) {
  const t = { ...(settings.value.tags || {}) };
  if (tag) t[fileIdv] = tag; else delete t[fileIdv];
  setSetting("tags", t);
}

export async function reloadLibrary() {
  const s = store.value;
  s.linked = (settings.value.linkedBooks || []).map(x => x.id);    // books colleagues shared with you
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
  books.value = books.value.map(b => {
    if (b.id !== bookIdv) return b;
    const sub = (b.subs || []).find(x => x.id === f.parent);
    const nf = { ...f, book: b.id, parent: f.parent && (sub || f.parent === b.id) ? f.parent : b.id, sub: sub ? sub.path : "", kind: kindOf(f.name, f.mime) };
    return { ...b, files: sortFiles([...b.files, nf], (settings.value.books || {})[b.id]?.fileOrder || []) };
  });
}

export function removeFile(id) {
  books.value = books.value.map(b => ({ ...b, files: b.files.filter(x => x.id !== id) }));
}

export const unlockedBooks = signal(new Set());  // books with their own PIN, opened in this visit
export function bookHidden(b) { const id = b && (b.id || b); return !!((settings.value.books || {})[id]?.locked && settings.value.pin && !unlockedBooks.value.has(id)); }
export function openBooks() { return books.value.filter(b => !bookHidden(b)); }

export function openBook(id, fid = null, page = 0) {
  if ((settings.value.books || {})[id]?.locked && settings.value.pin && !unlockedBooks.value.has(id)) {
    panel.value = { type: "bookpin", id, fid, page };
    return;
  }
  batch(() => {
    bookId.value = id;
    view.value = "book";
    const b = books.value.find(x => x.id === id);
    // a book opens where you left it (each book remembers its own page)
    const was = !fid && b ? (settings.value.books || {})[id]?.last : null;
    const wasOk = was && b.files.some(x => x.id === was.file);
    const f = fid || (wasOk ? was.file : null) || (b && b.files[0] && b.files[0].id) || null;
    fileId.value = f;
    pageNo.value = fid ? page : wasOk ? (was.page || 0) : page;
    panel.value = null;
  });
  const recent = [id, ...(settings.value.recent || []).filter(x => x !== id)].slice(0, 12);
  setSetting("recent", recent);
}

export function goHome() {
  batch(() => { view.value = "home"; panel.value = null; readMode.value = false; });
}

// what BindLens changed in the Drive, newest first (Settings shows it): the same idea as the Windows app's list
export function logChange(what, name, book = "") {
  const log = [{ at: Date.now(), what, name, book }, ...(settings.value.log || [])].slice(0, 300);
  setSetting("log", log);
}

export function rememberPlace() {
  if (!bookId.value) return;
  const last = { book: bookId.value, file: fileId.value, page: pageNo.value, at: Date.now() };
  const prev = settings.value.last || {};
  if (prev.book === last.book && prev.file === last.file && prev.page === last.page) return;
  const all = { ...(settings.value.books || {}) };
  all[last.book] = { ...(all[last.book] || {}), last: { file: last.file, page: last.page } };
  settings.value = { ...settings.value, books: all };
  setSetting("last", last);
  // the documents opened lately (Home shows them)
  const rec = settings.value.recentDocs || [];
  if (last.file && (!rec[0] || rec[0].file !== last.file)) setSetting("recentDocs", [{ book: last.book, file: last.file, at: last.at }, ...rec.filter(r => r.file !== last.file)].slice(0, 8));
}

// the library as it is now, kept in this browser: BindLens opens it without a network (Drive and OneDrive)
const snapLibrary = debounce(() => {
  const s = store.value;
  if (!s || !s.cloud || s.offline || !s.user || phase.value !== "ready") return;
  const list = {
    books: books.value.map(b => ({ id: b.id, name: b.name, modified: b.modified, shared: !!b.shared })),
    files: books.value.flatMap(b => b.files.map(f => { const { kind, ...rest } = f; void kind; return { ...rest, book: b.id }; })),
    subs: books.value.flatMap(b => (b.subs || []).map(x => ({ ...x, book: b.id }))),
    loose: looseFiles.value,
  };
  idb.set("kv", "list:" + (s.user.email || ""), list);
}, 2500);
effect(() => { void books.value; snapLibrary(); });

// a phone-size screen (the layout changes)
export const narrow = signal(typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
if (typeof window !== "undefined") {
  window.matchMedia("(max-width: 760px)").addEventListener("change", (e) => { narrow.value = e.matches; });
}
