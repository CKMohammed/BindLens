// Things people do with books and files - used by Home, the book view, menus and Find (Ctrl+K).
import { batch } from "@preact/signals";
import { store, books, settings, setSetting, setBookMeta, toast, openBook, bookId, fileId, pageNo, view, panel,
  addFileToBook, removeFile, reloadLibrary, currentBook, logChange } from "./state.js";
import { ask, confirm } from "./ui/dialogs.jsx";
import { cleanName, uniqueName, mimeOf, kindOf, colorFor } from "./util.js";
import { saveAll } from "./docs.js";

export function pickFiles({ accept = "", multiple = true, capture = null, folder = false } = {}) {
  return new Promise((resolve) => {
    const i = document.createElement("input");
    i.type = "file";
    if (accept) i.accept = accept;
    i.multiple = multiple;
    if (capture) i.capture = capture;
    if (folder) i.webkitdirectory = true;
    i.style.display = "none";
    i.onchange = () => { resolve([...i.files]); i.remove(); };
    i.oncancel = () => { resolve([]); i.remove(); };
    document.body.appendChild(i);
    i.click();
  });
}

export async function newBook(name) {
  if (!name) name = await ask("New book", { label: "A book is a folder in your Google Drive, inside the BindLens folder.", placeholder: "e.g. Clients", ok: "Make the book" });
  if (!name) return null;
  name = cleanName(name);
  const taken = books.value.map(b => b.name);
  name = uniqueName(name, taken);
  try {
    const b = await store.value.createBook(name);
    books.value = [...books.value, { id: b.id, name: b.name, color: colorFor(b.name), files: [], modified: b.modified }];
    setSetting("bookOrder", books.value.map(x => x.id));
    logChange("Made the book", name);
    toast(`"${name}" is ready. Add files to it.`, "ok");
    return books.value.find(x => x.id === b.id);
  } catch (e) {
    toast("Could not make the book: " + e.message, "bad");
    return null;
  }
}

export async function uploadFiles(book, files, { open = true } = {}) {
  if (!files || !files.length) return [];
  if (!book) {
    book = currentBook.value || books.value[0] || await newBook();
    if (!book) return [];
  }
  const made = [];
  const taken = [...book.files.map(f => f.name)];
  let n = 0;
  toast(files.length === 1 ? `Adding ${files[0].name}...` : `Adding ${files.length} files...`);
  for (const f of files) {
    try {
      const name = uniqueName(cleanName(f.name) || "file", taken);
      taken.push(name);
      const bytes = await f.arrayBuffer();
      const made1 = await store.value.create(book.id, name, bytes, f.type || mimeOf(name));
      addFileToBook(book.id, made1);
      logChange("Added", name, book.name);
      made.push(made1);
      n++;
    } catch (e) {
      toast(`Could not add ${f.name}: ${e.message}`, "bad", 6000);
    }
  }
  if (n) toast(n === 1 ? `Added to "${book.name}" in your Drive.` : `${n} files added to "${book.name}" in your Drive.`, "ok");
  if (open && made.length) openBook(book.id, made[0].id);
  return made;
}

export async function addFromDrive(book) {
  if (store.value.kind !== "drive") { toast("Sign in with Google to add files from your Drive."); return; }
  try {
    const picked = await store.value.pick(true);
    if (!picked.length) return;
    book = book || currentBook.value || books.value[0] || await newBook();
    if (!book) return;
    let n = 0;
    for (const p of picked) {
      if (p.mime === "application/vnd.google-apps.folder") continue;
      const meta = await store.value.meta(p.id);
      const f = await store.value.copy(meta, book.id, uniqueName(meta.name, book.files.map(x => x.name)));
      addFileToBook(book.id, f);
      logChange("Added from your Drive", f.name, book.name);
      n++;
    }
    if (n) toast(`${n} file${n > 1 ? "s" : ""} added to "${book.name}".`, "ok");
  } catch (e) {
    toast("Could not open your Drive: " + e.message, "bad", 6000);
  }
}

export async function renameBook(book) {
  const name = await ask("Rename the book", { value: book.name, ok: "Rename" });
  if (!name || name === book.name) return;
  await store.value.rename(book.id, cleanName(name));
  logChange("Renamed the book", `${book.name} → ${cleanName(name)}`);
  books.value = books.value.map(b => b.id === book.id ? { ...b, name: cleanName(name) } : b);
}

export async function deleteBook(book) {
  const ok = await confirm(`Move "${book.name}" to the bin?`,
    `The folder and its ${book.files.length} file${book.files.length === 1 ? "" : "s"} go to your Google Drive bin, where you can get them back for 30 days.`,
    { ok: "Move to the bin", danger: true });
  if (!ok) return;
  await saveAll();
  await store.value.trash(book.id);
  logChange("Moved the book to the bin", book.name);
  batch(() => {
    books.value = books.value.filter(b => b.id !== book.id);
    if (bookId.value === book.id) { view.value = "home"; bookId.value = null; }
  });
  toast(`"${book.name}" is in the bin.`);
}

export async function toggleBookLock(book) {
  const { bookMeta, setBookMeta, settings: st, panel: pnl } = await import("./state.js");
  if (!st.value.pin) { toast("Choose a PIN first (Settings), then lock the book with it."); pnl.value = { type: "pin" }; return; }
  const locked = !bookMeta(book.id).locked;
  setBookMeta(book.id, { locked });
  toast(locked ? `"${book.name}" opens only with your PIN now.` : `"${book.name}" opens without a PIN now.`, "ok");
}

export function setBookColor(book, color) {
  setBookMeta(book.id, { color });
  books.value = books.value.map(b => b.id === book.id ? { ...b, color } : b);
}

export function moveBook(book, by) {
  const list = [...books.value];
  const i = list.findIndex(b => b.id === book.id);
  const j = Math.max(0, Math.min(list.length - 1, i + by));
  const [x] = list.splice(i, 1);
  list.splice(j, 0, x);
  books.value = list;
  setSetting("bookOrder", list.map(b => b.id));
}

export async function renameFile(book, file) {
  const ext = /\.[^.]+$/.exec(file.name)?.[0] || "";
  let name = await ask("Rename the file", { value: file.name.replace(/\.[^.]+$/, ""), ok: "Rename" });
  if (!name) return;
  name = cleanName(name);
  if (ext && !name.toLowerCase().endsWith(ext.toLowerCase())) name += ext;
  await store.value.rename(file.id, name);
  logChange("Renamed", `${file.name} → ${name}`, book.name);
  books.value = books.value.map(b => b.id === book.id ? { ...b, files: b.files.map(f => f.id === file.id ? { ...f, name, kind: kindOf(name, f.mime) } : f) } : b);
}

export async function deleteFile(book, file) {
  const ok = await confirm(`Move "${file.name}" to the bin?`, "It goes to your Google Drive bin, where you can get it back for 30 days.",
    { ok: "Move to the bin", danger: true });
  if (!ok) return;
  await saveAll();
  await store.value.trash(file.id);
  logChange("Moved to the bin", file.name, book.name);
  removeFile(file.id);
  if (fileId.value === file.id) {
    const b = books.value.find(x => x.id === book.id);
    fileId.value = b?.files[0]?.id || null;
    pageNo.value = 0;
  }
  toast(`"${file.name}" is in the bin.`);
}

export async function moveFileTo(book, file, toBook) {
  await saveAll();
  const f = await store.value.move(file.id, book.id, toBook.id);
  removeFile(file.id);
  addFileToBook(toBook.id, f);
  logChange("Moved", `${file.name}: ${book.name} → ${toBook.name}`, toBook.name);
  toast(`Moved to "${toBook.name}".`, "ok");
}

export function moveFileInBook(book, file, by) {
  const files = [...book.files];
  const i = files.findIndex(f => f.id === file.id);
  const j = Math.max(0, Math.min(files.length - 1, i + by));
  const [x] = files.splice(i, 1);
  files.splice(j, 0, x);
  books.value = books.value.map(b => b.id === book.id ? { ...b, files } : b);
  setBookMeta(book.id, { fileOrder: files.map(f => f.id) });
}

export async function refresh() {
  await saveAll();
  await reloadLibrary();
  toast("Up to date with your Drive.");
}

export function openPanel(type, opts = {}) { panel.value = { type, ...opts }; }

export async function signOut() {
  await saveAll();
  store.value?.signOut();
  location.href = import.meta.env.BASE_URL;
}

export function continueReading() {
  const last = settings.value.last;
  if (!last) return false;
  const b = books.value.find(x => x.id === last.book);
  if (!b) return false;
  const f = b.files.find(x => x.id === last.file);
  openBook(b.id, f ? f.id : null, f ? last.page || 0 : 0);
  return true;
}
