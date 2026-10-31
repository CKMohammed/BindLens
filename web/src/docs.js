import { consult } from "./consult.js";
// Documents: opening a file in the engine, saving marks back to the Drive, and reading the words in it.
import { call } from "./engine/client.js";
import { toHtml, OFFICE_CSS } from "./engine/office.js";
import { idb } from "./idb.js";
import { store, saving, patchFile, toast, undoStack, redoStack, addFileToBook, books, bookId, logChange, settings } from "./state.js";
import { baseName, debounce, isPaged, uniqueName } from "./util.js";
import { _t } from "./i18n.js";
import { need } from "./license.js";

const open = new Map();     // file id -> Promise<{key, pages, isPDF, converted}>
const lru = [];             // file ids, most recent last
const MAX_OPEN = 14;
const listeners = new Set();

export function onDocChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function notifyChanged(fileId, what = "pages") { changed(fileId, what); }
function changed(fileId, what) { for (const fn of listeners) try { fn(fileId, what); } catch (e) { console.warn(e); } }

function touch(id) {
  const i = lru.indexOf(id);
  if (i >= 0) lru.splice(i, 1);
  lru.push(id);
  // close the documents not used for a while - never one of the book that is open, nor one not saved yet
  const book = books.value.find(b => b.id === bookId.value);
  const keep = new Set(book ? book.files.map(f => f.id) : []);
  let tries = lru.length;
  while (lru.length > MAX_OPEN && tries-- > 0) {
    const old = lru.shift();
    if (pendingSave.has(old) || keep.has(old)) { lru.push(old); continue; }
    const p = open.get(old);
    open.delete(old);
    if (p) p.then(d => call("close", d.key)).catch(() => {});
  }
}

export function fileFor(id) {
  for (const b of books.value) for (const f of b.files) if (f.id === id) return f;
  return null;
}

async function bytesFor(file) {
  return store.value.read(file);
}

async function convertedPdf(file, buf) {
  // "Show it as it looks": Google converts it (Word, Excel, PowerPoint), when the person chose that for this file
  const old = /\.(doc|ppt|pps|dot|wps)$/i.test(file.name);   // old Office files: only Google can show them here
  if (store.value.officePdf && ((settings.value.googleLook || {})[file.id] || old)) {
    const gk = "gconv:" + file.id + ":" + (file.md5 || file.modified || "");
    const ghit = await idb.get("files", gk);
    if (ghit) return ghit.slice(0);
    try {
      const pdf = await store.value.officePdf(file);
      idb.set("files", gk, pdf.slice(0));
      return pdf;
    } catch (e) { toast(_t("{0} could not show it as it looks ({1}): BindLens shows it its own way.", store.value.cloud, e.message), "", 6000); }
  }
  const key = "conv:" + file.id + ":" + (file.md5 || file.modified || "");
  const hit = await idb.get("files", key);
  if (hit) return hit.slice(0);
  const html = await toHtml(file.kind, file.name, buf);
  if (html == null) return null;
  const pdf = await call("htmlToPdf", html, OFFICE_CSS);
  const ab = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);
  idb.set("files", key, ab.slice(0));
  return ab;
}

// any file the person brings (a PDF, pictures, Word, Excel, PowerPoint, text) as the bytes of a PDF, or null
export async function anyToPdf(name, mime, buf, kind) {
  if (kind === "pdf" || /\.pdf$/i.test(name) || mime === "application/pdf") return buf;
  if (kind === "image" || (mime || "").startsWith("image/")) {
    const u8 = await call("imagesToPdf", [buf]);
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  }
  const html = await toHtml(kind, name, buf);
  if (html == null) return null;
  const pdf = await call("htmlToPdf", html, OFFICE_CSS);
  return pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);
}

// -> {key, pages:[{w,h}], isPDF, converted, outline}
export function getDoc(file) {
  if (!file) return Promise.reject(new Error(_t("No file")));
  if (!isPaged(file.kind)) return Promise.reject(new Error(_t("Not a paged file")));
  touch(file.id);
  if (open.has(file.id)) return open.get(file.id);
  const p = openInEngine(file, file.id);
  open.set(file.id, p);
  p.catch(() => open.delete(file.id));
  return p;
}

async function openInEngine(file, key) {
  const buf = await bytesFor(file);
  let r, converted = false;
  if (["word", "excel", "powerpoint", "text"].includes(file.kind)) {
    const pdf = await convertedPdf(file, buf);
    if (pdf) { r = await call("open", key, pdf, "application/pdf", "x.pdf"); converted = true; }
    else r = await call("open", key, buf, file.mime, file.name);
  } else if (file.kind === "gdoc") {
    r = await call("open", key, buf, "application/pdf", "x.pdf");
    converted = true;
  } else {
    const mime = file.kind === "pdf" ? "application/pdf" : (file.mime || file.name);
    r = await call("open", key, buf, mime, file.name);
  }
  if (r.password) { await call("close", key); throw new Error(_t("This PDF has a password. Open it once in another program to take the password off.")); }
  return { key, ...r, converted, readOnly: converted || !r.isPDF || consult.value };
}

// read something from a document without keeping it open (Find, Reports, dates): the open one when it is
// open (it has the latest marks), otherwise a copy opened just for this, and closed straight after
export async function readOnce(file, fn) {
  if (open.has(file.id)) { const d = await open.get(file.id); return fn(d.key, d); }
  const key = "once:" + file.id + ":" + Math.random().toString(36).slice(2);
  const d = await openInEngine(file, key);
  try { return await fn(key, d); } finally { call("close", key).catch(() => {}); }
}

export async function reopen(file) {
  const p = open.get(file.id);
  open.delete(file.id);
  if (p) { try { const d = await p; await call("close", d.key); } catch (e) {} }
  return getDoc(file);
}

export function isOpen(id) { return open.has(id); }

// ---- saving: a moment after the last mark, the PDF goes back to the Drive
const pendingSave = new Set();
const savers = new Map();

function saverFor(fileId) {
  if (!savers.has(fileId)) savers.set(fileId, debounce(() => saveNow(fileId), 1200));
  return savers.get(fileId);
}

export function markDirty(fileId) {
  pendingSave.add(fileId);
  saving.value = { ...saving.value, n: pendingSave.size, error: "" };
  saverFor(fileId)();
}

export async function saveNow(fileId) {
  const file = fileFor(fileId);
  if (!file || !open.has(fileId)) { pendingSave.delete(fileId); return; }
  try {
    const d = await open.get(fileId);
    const bytes = await call("save", d.key);
    const f = await store.value.write(file, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    pendingSave.delete(fileId);
    patchFile({ ...f, kind: file.kind });
    const last = (settings.value.log || [])[0];
    if (!last || last.name !== file.name || last.what !== _t("Saved your marks in") || Date.now() - last.at > 60000) {
      const b = books.value.find(x => x.files.some(y => y.id === fileId));
      logChange(_t("Saved your marks in"), file.name, b ? b.name : "");
    }
    saving.value = { n: pendingSave.size, last: Date.now(), error: "" };
    textCacheDrop(fileId);
  } catch (e) {
    console.error(e);
    saving.value = { ...saving.value, error: String(e.message || e) };
    toast(_t("Could not save ") + file.name + ": " + e.message, "bad", 6000);
  }
}

export async function saveAll() {
  for (const id of [...pendingSave]) await saveNow(id);
}

export function hasUnsaved() { return pendingSave.size > 0; }

window.addEventListener("beforeunload", (e) => {
  if (pendingSave.size) { saveAll(); e.preventDefault(); e.returnValue = ""; }
});

// ---- marks
export async function addMark(file, page, spec) {
  const d = await getDoc(file);
  const i = await call("addAnnot", d.key, page, spec);
  afterEdit(file.id);
  return i;
}

export async function editMark(file, page, i, change) {
  const d = await getDoc(file);
  await call("updateAnnot", d.key, page, i, change);
  afterEdit(file.id);
}

export async function copyMark(file, page, i) {
  const d = await getDoc(file);
  const n = await call("copyAnnot", d.key, page, i);
  afterEdit(file.id);
  return n;
}

export async function deleteMark(file, page, i) {
  const d = await getDoc(file);
  await call("deleteAnnot", d.key, page, i);
  afterEdit(file.id);
}

export async function marksOn(file, page) {
  const d = await getDoc(file);
  if (!d.isPDF) return [];
  return call("annots", d.key, page);
}

export async function allMarks(file) {
  return readOnce(file, (key, d) => d.isPDF ? call("allAnnots", key) : []);
}

export function afterEdit(fileId, what = "marks") {
  undoStack.value = [fileId, ...undoStack.value.filter(x => x !== fileId)].slice(0, 50);
  redoStack.value = [];
  markDirty(fileId);
  changed(fileId, what);
}

export async function undo() {
  const id = undoStack.value[0];
  if (!id) return;
  const file = fileFor(id);
  if (!file) { undoStack.value = undoStack.value.slice(1); return; }
  const d = await getDoc(file);
  const info = await call("undo", d.key);
  if (!info.canUndo) undoStack.value = undoStack.value.slice(1);
  redoStack.value = [id, ...redoStack.value.filter(x => x !== id)];
  markDirty(id);
  changed(id, "pages");
}

export async function redo() {
  const id = redoStack.value[0];
  if (!id) return;
  const file = fileFor(id);
  const d = await getDoc(file);
  const info = await call("redo", d.key);
  if (!info.canRedo) redoStack.value = redoStack.value.slice(1);
  undoStack.value = [id, ...undoStack.value.filter(x => x !== id)];
  markDirty(id);
  changed(id, "pages");
}

// pages of a document changed (turned, taken out, added)
export async function pageOp(file, fn, ...args) {
  if (!need("pages")) throw new Error(_t("This is part of BindLens Pro."));
  const d = await getDoc(file);
  const pages = await call(fn, d.key, ...args);
  d.pages = pages;
  afterEdit(file.id, "pages");
  return pages;
}

// ---- a PDF copy of a picture or an Office file, so it can be marked
export async function pdfCopyOf(file, book) {
  const buf = await bytesFor(file);
  let pdf;
  if (file.kind === "image") {
    const u8 = await call("imagesToPdf", [buf]);
    pdf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  } else {
    pdf = await convertedPdf(file, buf);
  }
  if (!pdf) throw new Error(_t("This file cannot be turned into a PDF here"));
  const name = uniqueName(baseName(file.name) + ".pdf", book.files.map(f => f.name));
  const parent = file.parent || book.id;   // next to the original, in its sub-book too
  const f = await store.value.create(parent, name, pdf, "application/pdf");
  f.parent = parent;
  addFileToBook(book.id, f);
  logChange(_t("Made a PDF copy to mark"), name, book.name);
  toast(_t("Made \"{0}\" so you can mark it. The original is unchanged.", name), "ok", 5000);
  return f;
}

// ---- the words in a document (for Find and Reports), kept in this browser
const textMem = new Map();

function textKey(file) { return "t2:" + file.id + ":" + (file.md5 || file.modified || ""); }

function textCacheDrop(id) {
  for (const k of [...textMem.keys()]) if (k.startsWith("t2:" + id + ":")) textMem.delete(k);
}

export async function wordsOf(file, { cachedOnly = false } = {}) {
  if (!isPaged(file.kind) || file.kind === "image") return { pages: [], words: [] };
  const k = textKey(file);
  if (textMem.has(k)) return textMem.get(k);
  const hit = await idb.get("text", k);
  if (hit) { textMem.set(k, hit); return hit; }
  if (cachedOnly) return null;
  const v = await readOnce(file, async (key) => ({ pages: await call("plainText", key), words: await call("words", key) }));
  textMem.set(k, v);
  idb.set("text", k, v);
  return v;
}

export async function setScannedWords(file, page, text) {
  const k = textKey(file);
  const v = await wordsOf(file);
  v.pages = [...v.pages];
  v.pages[page] = (v.pages[page] || "") + "\n" + text;
  v.ocr = { ...(v.ocr || {}), [page]: true };
  textMem.set(k, v);
  idb.set("text", k, v);
}

// read the words of the library slowly in the background (a file at a time, small ones first), so Home's
// "dates need you", Find and Reports are ready without waiting - and without downloading big files at once
export const indexed = { n: 0, of: 0, running: false, listeners: new Set() };
export async function indexLibrary() {
  if (indexed.running) return;
  indexed.running = true;
  try {
    const list = books.value.flatMap(b => b.files).filter(f => isPaged(f.kind) && f.kind !== "image" && (!f.size || f.size < 15e6))
      .sort((a, b) => (a.size || 0) - (b.size || 0));
    indexed.of = list.length; indexed.n = 0;
    for (const f of list) {
      const was = await wordsOf(f, { cachedOnly: true });
      if (!was) {
        try { await wordsOf(f); } catch (e) {}
        await new Promise(r => setTimeout(r, 400));
      }
      indexed.n++;
      if (indexed.n % 4 === 0 || indexed.n === list.length) for (const fn of indexed.listeners) try { fn(); } catch (e) {}
    }
  } finally { indexed.running = false; }
}

export { call };
