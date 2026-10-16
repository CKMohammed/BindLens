// What you do with a whole document or its pages: copies, joins and splits, a watermark, a password, a smaller file,
// earlier versions, the pages taken out (to put them back), sending it. The same tools as the Windows app.
import { store, books, toast, addFileToBook, logChange, patchFile, panel } from "./state.js";
import { getDoc, call, fileFor, afterEdit, reopen, saveAll, pageOp, notifyChanged } from "./docs.js";
import { ask, confirm, choose } from "./ui/dialogs.jsx";
import { pickFiles } from "./actions.js";
import { baseName, uniqueName, download, fmtSize, isPaged } from "./util.js";
import { idb } from "./idb.js";

const ab = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const bookOf = (file) => books.value.find(b => b.files.some(f => f.id === file.id));

// a new PDF made here: into the book (next to the file it came from), or downloaded - the person chooses
async function keepNew(book, file, name, u8, what, { askWhere = true } = {}) {
  let where = "book";
  if (askWhere) {
    where = await choose(what, `"${name}" · ${fmtSize(u8.byteLength)}`, [
      { key: "download", label: "Download it", icon: "download" },
      { key: "book", label: `Save it in "${book.name}"`, icon: "book" },
    ]);
    if (!where) return null;
  }
  if (where === "download") { download(u8, name, "application/pdf"); return null; }
  const parent = file?.parent || book.id;
  const taken = book.files.filter(f => (f.parent || book.id) === parent).map(f => f.name);
  const nm = uniqueName(name, taken);
  const f = await store.value.create(parent, nm, ab(u8), "application/pdf");
  f.parent = parent;
  addFileToBook(book.id, f);
  logChange(what, nm, book.name);
  toast(`"${nm}" is in "${book.name}".`, "ok");
  return f;
}

// "1-3, 5, 8-" -> [0,1,2,4,7,...] (pages counted from 1 as people do)
export function parsePages(text, n) {
  const out = [];
  for (const part of String(text).split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part);
    if (m) {
      const a = m[1] ? Number(m[1]) : 1, b = m[2] ? Number(m[2]) : n;
      for (let i = Math.max(1, a); i <= Math.min(n, b); i++) out.push(i - 1);
    } else if (/^\d+$/.test(part)) {
      const i = Number(part);
      if (i >= 1 && i <= n) out.push(i - 1);
    } else return null;
  }
  return out.length ? out : null;
}

export async function addPagesFromPdf(file, at) {
  const [f] = await pickFiles({ accept: "application/pdf,.pdf", multiple: false });
  if (!f) return;
  const bytes = await f.arrayBuffer();
  await pageOp(file, "insertPages", at, bytes);
  logChange("Added pages from " + f.name + " to", file.name);
  toast(`The pages of "${f.name}" are in "${file.name}".`, "ok");
}

export async function savePagesAsPdf(file, from = 0) {
  const d = await getDoc(file);
  const n = d.pages.length;
  const t = await ask("Save pages as a new PDF", { label: `Which pages of "${file.name}" (${n} pages)? For example 1-3, 5`, value: String(from + 1), ok: "Make the PDF" });
  if (!t) return;
  const pages = parsePages(t, n);
  if (!pages) { toast("Write the pages like this: 1-3, 5"); return; }
  const u8 = await call("extractPages", d.key, pages);
  await keepNew(bookOf(file), file, `${baseName(file.name)} (pages ${t.replace(/\s+/g, "")}).pdf`, u8, "Saved pages as a new PDF");
}

export async function splitFile(file) {
  const d = await getDoc(file);
  const n = d.pages.length;
  if (n < 2) { toast("This document has one page."); return; }
  const book = bookOf(file);
  const where = await choose("Split into one PDF per page", `"${file.name}" becomes ${n} PDFs, one for each page. The file itself stays as it is.`, [
    { key: "download", label: "Download them", icon: "download" },
    { key: "book", label: `Save them in "${book.name}"`, icon: "book" },
  ]);
  if (!where) return;
  toast(`Making ${n} PDFs...`);
  for (let i = 0; i < n; i++) {
    const u8 = await call("extractPages", d.key, [i]);
    const name = `${baseName(file.name)} - page ${String(i + 1).padStart(String(n).length, "0")}.pdf`;
    if (where === "download") { download(u8, name, "application/pdf"); await new Promise(r => setTimeout(r, 250)); }
    else await keepNew(book, file, name, u8, "Split into pages", { askWhere: false });
  }
  toast(`${n} PDFs made.`, "ok");
}

export async function wholeBookAsPdf(book) {
  const list = book.files.filter(f => isPaged(f.kind));
  if (!list.length) { toast("This book has no pages to put together."); return; }
  toast(`Putting ${list.length} documents together...`);
  const keys = [];
  for (const f of list) {
    try { keys.push((await getDoc(f)).key); } catch (e) { /* a file that cannot be opened is left out */ }
  }
  const u8 = await call("joinOpen", keys);
  await keepNew(book, null, `${book.name} - the whole book.pdf`, u8, "Saved the whole book as one PDF");
}

export async function watermark(file) {
  const t = await ask("Watermark", { label: `Words written across every page of "${file.name}", light and see-through. Undo (Ctrl+Z) takes them off.`, value: "CONFIDENTIAL", ok: "Put the watermark" });
  if (!t) return;
  const d = await getDoc(file);
  await call("watermark", d.key, t.slice(0, 60));
  afterEdit(file.id, "pages");
  logChange("Put a watermark on", file.name);
}

export async function makeSmaller(file) {
  await saveAll();
  const d = await getDoc(file);
  toast("Making it smaller (pictures and scans)...");
  const { bytes, pictures } = await call("smallerCopy", d.key);
  const was = file.size || 0;
  if (!was || bytes.byteLength >= was * 0.95) { toast(`"${file.name}" cannot be made much smaller (it is ${fmtSize(was || bytes.byteLength)}).`); return; }
  const book = bookOf(file);
  const how = await choose("Make this file smaller", `From ${fmtSize(was)} to ${fmtSize(bytes.byteLength)}${pictures ? ` (${pictures} picture${pictures === 1 ? "" : "s"} made lighter)` : ""}. Google Drive keeps the version before, under Earlier versions.`, [
    { key: "copy", label: "Save a smaller copy", icon: "copy" },
    { key: "replace", label: "Make the file smaller", icon: "check" },
  ]);
  if (!how) return;
  if (how === "copy") { await keepNew(book, file, `${baseName(file.name)} (smaller).pdf`, bytes, "Made a smaller copy", { askWhere: false }); return; }
  const f = await store.value.write(file, ab(bytes));
  patchFile({ ...f, kind: file.kind });
  await reopen({ ...file, ...f });
  notifyChanged(file.id, "pages");
  logChange("Made smaller", file.name, book.name);
  toast(`"${file.name}" is ${fmtSize(bytes.byteLength)} now.`, "ok");
}

// ---- pages taken out: kept in this browser so they can be put back (as the Windows app does)
const delKey = (file) => "deleted:" + file.id;
export async function deletedPages(file) { return (await idb.get("kv", delKey(file))) || []; }

export async function takePageOut(file, page) {
  const d = await getDoc(file);
  try {
    const u8 = await call("extractPages", d.key, [page]);
    const list = await deletedPages(file);
    list.unshift({ at: Date.now(), page, bytes: ab(u8) });
    await idb.set("kv", delKey(file), list.slice(0, 40));
  } catch (e) { /* still taken out; Undo can put it back */ }
  await pageOp(file, "deletePage", page);
  logChange("Took out page " + (page + 1) + " of", file.name);
}

export async function putPageBack(file, item, index) {
  const d = await getDoc(file);
  const at = Math.min(item.page, d.pages.length);
  await pageOp(file, "insertPages", at, item.bytes.slice(0));
  const list = await deletedPages(file);
  list.splice(index, 1);
  await idb.set("kv", delKey(file), list);
  logChange("Put back page " + (at + 1) + " of", file.name);
  toast(`The page is back in "${file.name}" (page ${at + 1}).`, "ok");
  return at;
}

// ---- send: the phone's or computer's own "share" (email, WhatsApp...), or a download to attach
export async function sendFile(file) {
  await saveAll();
  const buf = await store.value.read(file);
  const f = new File([buf], file.name, { type: file.mime || "application/pdf" });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f], title: file.name }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const how = await choose("Send by email", `Your browser cannot attach files to an email by itself. Download "${file.name}" and attach it, or send a link to it in your Drive.`, [
    store.value.kind === "drive" && { key: "link", label: "Email a link", icon: "drive" },
    { key: "download", label: "Download it to attach", icon: "download" },
  ].filter(Boolean));
  if (how === "download") download(buf, file.name, file.mime);
  if (how === "link") {
    const link = store.value.webLink(file);
    toast("The person needs access to the file: share it in Drive first (Open in Google Drive, then Share).", "", 7000);
    location.href = `mailto:?subject=${encodeURIComponent(file.name)}&body=${encodeURIComponent(link)}`;
  }
}

export function openTool(type, file) { panel.value = { type, fileId: file.id }; }

export { fileFor, keepNew };
