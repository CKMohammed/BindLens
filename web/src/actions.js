// Things people do with books and files - used by Home, the book view, menus and Find (Ctrl+K).
import { batch } from "@preact/signals";
import { store, books, settings, setSetting, setBookMeta, toast, openBook, bookId, fileId, pageNo, view, panel,
  addFileToBook, removeFile, reloadLibrary, currentBook, logChange } from "./state.js";
import { ask, confirm, choose } from "./ui/dialogs.jsx";
import { cleanName, uniqueName, mimeOf, kindOf, colorFor } from "./util.js";
import { saveAll } from "./docs.js";
import { _t, loc } from "./i18n.js";

export function pickFiles({ accept = "", multiple = true, capture = null, folder = false } = {}) {
  return new Promise((resolve) => {
    const i = document.createElement("input");
    i.type = "file";
    if (accept) i.accept = accept;
    i.multiple = multiple;
    if (capture) i.capture = capture;
    if (folder) i.webkitdirectory = true;
    i.style.display = "none";
    i.onchange = async () => { const fs = [...i.files]; i.remove(); resolve(await import("./heic.js").then(m => m.fixHeic(fs)).catch(() => fs)); };
    i.oncancel = () => { resolve([]); i.remove(); };
    document.body.appendChild(i);
    i.click();
  });
}

export async function newBook(name, { quiet = false, suggest = "" } = {}) {
  if (!name) name = await ask(_t("New book"), { label: _t("A book is a folder of your Google Drive, in My Drive."), value: suggest, placeholder: _t("e.g. Clients"), ok: _t("Make the book") });
  if (!name) return null;
  name = cleanName(name);
  const taken = books.value.map(b => b.name);
  name = uniqueName(name, taken);
  try {
    const b = await store.value.createBook(name);
    if (b.own) linkBook({ id: b.id, name: b.name }, true);
    books.value = [...books.value, { id: b.id, name: b.name, color: colorFor(b.name), files: [], modified: b.modified }];
    setSetting("bookOrder", books.value.map(x => x.id));
    logChange(_t("Made the book"), name);
    if (!quiet) toast(_t("\"{0}\" is ready. Add files to it.", name), "ok");
    return books.value.find(x => x.id === b.id);
  } catch (e) {
    toast(_t("Could not make the book: ") + e.message, "bad");
    return null;
  }
}

export async function uploadFiles(book, files, { open = true, parent = null, quiet = false, root = false } = {}) {
  if (!files || !files.length) return [];
  if (root) {
    // 1.0: documents from this computer go into a folder of your Drive that you name now (you can rename it later)
    const first = (files[0].name || "").replace(/\.[^.]+$/, "");
    const b = await newBook(null, { suggest: files.length === 1 ? first : _t("Documents {0}", new Date().toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" })) });
    if (!b) return [];
    book = b;
  }
  if (!book) {
    book = currentBook.value || books.value[0] || await newBook();
    if (!book) return [];
  }
  if (store.value.offline) { toast(_t("You are offline: new files can be added when the network is back."), "bad"); return []; }
  const where = parent || book.id;
  // the panel in the corner shows them going up (three at a time); the first opens as soon as it is in
  const { queueUploads } = await import("./uploads.js");
  void quiet;
  files = await import("./heic.js").then(m => m.fixHeic(files)).catch(() => files);
  return queueUploads(files.filter(f => !f.name.startsWith(".")).map(file => ({ file, bookId: book.id, where })), { open });
}

// 1.0: a folder of your Drive as a book, as it is - BindLens remembers it; nothing is copied or moved
export function linkBook(fo, own = true) {
  const linked = settings.value.linkedBooks || [];
  if (!linked.some(x => x.id === fo.id)) setSetting("linkedBooks", [...linked, { id: fo.id, name: fo.name, at: Date.now(), own }]);
  store.value.linked = [...new Set([...(store.value.linked || []), fo.id])];
  if (own) store.value.own = [...new Set([...(store.value.own || []), fo.id])];
}

export async function addFromDrive(book) {
  if (!store.value.canPick) { toast(store.value.kind === "onedrive" ? _t("With OneDrive, add the files from your computer (Add files).") : _t("Sign in with Google to add files from your Drive.")); return; }
  try {
    const picked = await store.value.pick(true, { both: true });
    if (!picked.length) return;
    if (picked.every(x => x.mime === "application/vnd.google-apps.folder")) { for (const p of picked) await importDriveFolder(p); return; }
    // files (a Google Sheet, PDFs...): into a book you choose, a new book with them, or each one as its own book
    let each = false;
    if (!book) {
      const files = picked.filter(x => x.mime !== "application/vnd.google-apps.folder");
      const cur = currentBook.value;
      const where = await choose(_t("Where do they go?"), files.length === 1 ? files[0].name : _t("{0} files", files.length), [
        cur && { key: cur.id, label: _t("Into \"{0}\"", cur.name), icon: "book" },
        { key: "__each", label: files.length === 1 ? _t("As its own book") : _t("Each one as its own book"), icon: "book" },
        files.length > 1 && { key: "__new", label: _t("A new book with them"), icon: "plus" },
        ...books.value.filter(b => !cur || b.id !== cur.id).slice(0, 8).map(b => ({ key: b.id, label: _t("Into \"{0}\"", b.name), icon: "book" })),
      ].filter(Boolean));
      if (!where) return;
      if (where === "__each") each = true;
      else if (where === "__new") book = await newBook();
      else book = books.value.find(b => b.id === where);
      if (!each && !book) return;
    }
    // 1.0: nothing is copied. A folder becomes a book as it is; a file stays where it is - if it is not in the book's
    // folder, the book shows it through a shortcut (the original is the one you read and mark)
    let n = 0;
    for (const p of picked.filter(x => x.mime === "application/vnd.google-apps.folder")) await importDriveFolder(p);
    for (const p of picked) {
      if (p.mime === "application/vnd.google-apps.folder") continue;
      const meta = await store.value.meta(p.id);
      if (each) { book = await newBook(meta.name.replace(/\.[^.]+$/, ""), { quiet: true }); if (!book) continue; }
      const inBook = (meta.parents || []).some(x => x === book.id || (book.subs || []).some(sb => sb.id === x));
      if (!inBook) await store.value.createShortcut(p.id, book.id, meta.name);
      logChange(_t("Added from your Drive (the original, not a copy)"), meta.name, book.name);
      n++;
    }
    if (n) await reloadLibrary();
    if (n) toast(_t("{0} file{1} added to \"{2}\".", n, n > 1 ? "s" : "", book.name), "ok");
  } catch (e) {
    toast(_t("Could not open your Drive: ") + e.message, "bad", 6000);
  }
}

// "A whole folder from my Drive": the folder becomes a book with all its files (its folders become sub-books).
// Google lets BindLens open only what you choose: if it cannot see inside the folder, the folder opens in the
// picker and you choose its files (select them all).
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SKIP_MIME = new Set(["application/vnd.google-apps.shortcut", "application/vnd.google-apps.form", "application/vnd.google-apps.site", "application/vnd.google-apps.map"]);
export async function addFolderFromDrive() {
  if (!store.value.canPick) { toast(store.value.kind === "onedrive" ? _t("With OneDrive, add a folder from your computer (Add a folder).") : _t("Sign in with Google to add folders from your Drive.")); return; }
  try {
    const folders = (await store.value.pick(true, { folders: true, title: _t("Choose a folder from your Google Drive - it becomes a book") })).filter(p => p.mime === FOLDER_MIME);
    for (const fo of folders) await importDriveFolder(fo);
  } catch (e) {
    toast(_t("Could not open your Drive: ") + e.message, "bad", 6000);
  }
}

async function walkDrive(id, path, depth, out) {
  const items = await store.value.inside(id);
  for (const it of items) {
    if (it.mime === FOLDER_MIME) { if (depth < 8) await walkDrive(it.id, path ? path + "/" + it.name : it.name, depth + 1, out); }
    else if (!SKIP_MIME.has(it.mime)) out.push({ file: it, path });
    if (out.length > 2000) break;
  }
  return out;
}

async function importDriveFolder(fo) {
  // 1.0: the folder itself is the book - the original, where it is in your Drive (nothing copied, no other folder)
  linkBook({ id: fo.id, name: fo.name }, true);
  await reloadLibrary();
  let b = books.value.find(x => x.id === fo.id);
  if (!b || !b.files.length) {
    const ok = await confirm(_t("Choose the files of \"{0}\"", fo.name),
      _t("Google lets BindLens open only the files you choose (that keeps the rest of your Drive private). In the next window \"{0}\" is open: select all its files (Ctrl+A, or Cmd+A on a Mac) and press Select. Nothing is copied: BindLens works on the originals.", fo.name),
      { ok: _t("Choose the files") });
    if (ok) { await store.value.pick(true, { parent: fo.id, title: _t("\"{0}\": select all the files (Ctrl+A), then Select", fo.name) }); await reloadLibrary(); }
    b = books.value.find(x => x.id === fo.id);
  }
  logChange(_t("Added a folder from your Drive (the original, not a copy)"), fo.name);
  if (b) { toast(_t("\"{0}\" is in your library: it is your folder in Drive, as it is. What you change is saved in it.", fo.name), "ok", 6000); openBook(b.id); }
}

export async function renameBook(book) {
  if (book.root) { toast(_t("This is My Drive itself.")); return; }
  const name = await ask(_t("Rename the book"), { value: book.name, ok: _t("Rename") });
  if (!name || name === book.name) return;
  await store.value.rename(book.id, cleanName(name));
  logChange(_t("Renamed the book"), `${book.name} → ${cleanName(name)}`);
  books.value = books.value.map(b => b.id === book.id ? { ...b, name: cleanName(name) } : b);
}

export async function deleteBook(book) {
  if (book.root) { toast(_t("This is My Drive itself.")); return; }
  if (book.shared) { unlinkBook(book); return; }
  const ok = await confirm(_t("Move \"{0}\" to the bin?", book.name),
    _t("The folder and its {0} file{1} go to your Google Drive bin, where you can get them back for 30 days.", book.files.length, book.files.length === 1 ? "" : "s"),
    { ok: _t("Move to the bin"), danger: true });
  if (!ok) return;
  await saveAll();
  await store.value.trash(book.id);
  logChange(_t("Moved the book to the bin"), book.name);
  batch(() => {
    books.value = books.value.filter(b => b.id !== book.id);
    if (bookId.value === book.id) { view.value = "home"; bookId.value = null; }
  });
  toast(_t("\"{0}\" is in the bin.", book.name));
}

export async function toggleBookLock(book) {
  const { bookMeta, setBookMeta, settings: st, panel: pnl } = await import("./state.js");
  if (!st.value.pin) { toast(_t("Choose a PIN first (Settings), then lock the book with it.")); pnl.value = { type: "pin" }; return; }
  const locked = !bookMeta(book.id).locked;
  setBookMeta(book.id, { locked });
  toast(locked ? _t("\"{0}\" opens only with your PIN now.", book.name) : _t("\"{0}\" opens without a PIN now.", book.name), "ok");
}

export function setBookColor(book, color) {
  setBookMeta(book.id, { color });
  books.value = books.value.map(b => b.id === book.id ? { ...b, color } : b);
}

// drag a book (on the shelf, in the Library list or the rail) onto another one to put it there - mouse or pen;
// on a phone, a long press opens the menu with Move left / Move right
let bookDragged = null;
export const bookWasDragged = () => !!(bookDragged && bookDragged.moved);
export function moveBookTo(id, targetId) {
  const list = [...books.value];
  const i = list.findIndex(b => b.id === id), j = list.findIndex(b => b.id === targetId);
  if (i < 0 || j < 0 || i === j) return;
  const [x] = list.splice(i, 1);
  list.splice(j, 0, x);
  books.value = list;
  setSetting("bookOrder", list.map(b => b.id));
}
export function bookDragStart(e, id) {
  if (e.button !== 0 || e.pointerType === "touch") return;
  const st = { id, x: e.clientX, y: e.clientY, moved: false };
  bookDragged = st;
  const el = e.currentTarget;
  const move = (ev) => {
    if (!st.moved && Math.hypot(ev.clientX - st.x, ev.clientY - st.y) < 8) return;
    if (!st.moved) { st.moved = true; document.body.classList.add("bkdrag"); }
    ev.preventDefault();
    document.querySelectorAll("[data-bk].bkdragging").forEach(x => x.classList.remove("bkdragging"));
    document.querySelectorAll(`[data-bk="${CSS.escape(id)}"]`).forEach(x => x.classList.add("bkdragging"));
    const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-bk]");
    const t = over && over.dataset.bk;
    if (t && t !== id) moveBookTo(id, t);
  };
  const up = () => {
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    document.body.classList.remove("bkdrag");
    document.querySelectorAll("[data-bk].bkdragging").forEach(x => x.classList.remove("bkdragging"));
    setTimeout(() => { if (bookDragged === st) bookDragged = null; }, 250);
  };
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", up);
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
  let name = await ask(_t("Rename the file"), { value: file.name.replace(/\.[^.]+$/, ""), ok: _t("Rename") });
  if (!name) return;
  name = cleanName(name);
  if (ext && !name.toLowerCase().endsWith(ext.toLowerCase())) name += ext;
  await store.value.rename(file.id, name);
  logChange(_t("Renamed"), `${file.name} → ${name}`, book.name);
  books.value = books.value.map(b => b.id === book.id ? { ...b, files: b.files.map(f => f.id === file.id ? { ...f, name, kind: kindOf(name, f.mime) } : f) } : b);
}

export async function deleteFile(book, file) {
  const ok = await confirm(_t("Move \"{0}\" to the bin?", file.name), _t("It goes to your Google Drive bin, where you can get it back for 30 days."),
    { ok: _t("Move to the bin"), danger: true });
  if (!ok) return;
  await saveAll();
  await store.value.trash(file.shortcut || file.id);         // a file shown through a shortcut: only the shortcut goes
  logChange(_t("Moved to the bin"), file.name, book.name);
  removeFile(file.id);
  if (fileId.value === file.id) {
    const b = books.value.find(x => x.id === book.id);
    fileId.value = b?.files[0]?.id || null;
    pageNo.value = 0;
  }
  toast(_t("\"{0}\" is in the bin.", file.name));
}

export async function moveFileTo(book, file, toBook) {
  await saveAll();
  const f = file.shortcut ? (await store.value.move(file.shortcut, file.parent || book.id, toBook.id), { ...file })
    : await store.value.move(file.id, file.parent || book.id, toBook.id);
  f.parent = toBook.id;
  removeFile(file.id);
  addFileToBook(toBook.id, f);
  logChange(_t("Moved"), `${file.name}: ${book.name} → ${toBook.name}`, toBook.name);
  toast(_t("Moved to \"{0}\".", toBook.name), "ok");
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
  toast(_t("Up to date with your Drive."));
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

// ---- sub-books: folders inside a book (as in the Windows app)
export async function newSubBook(book, parentSub = null) {
  let name = await ask(parentSub ? _t("New sub-book inside \"{0}\"", parentSub.name) : _t("New sub-book in \"{0}\"", book.name),
    { label: _t("A sub-book is a folder inside the book's folder in your Drive. Its files are part of the book."), placeholder: "e.g. 2026", ok: _t("Make it") });
  if (!name) return null;
  name = cleanName(name);
  const path = (parentSub ? parentSub.path + "/" : "") + name;
  if ((book.subs || []).some(x => x.path.toLowerCase() === path.toLowerCase())) { toast(_t("There is a sub-book with that name already.")); return null; }
  const made = await store.value.createSub(name, parentSub ? parentSub.id : book.id);
  const sub = { id: made.id, name, path };
  books.value = books.value.map(b => b.id === book.id ? { ...b, subs: [...(b.subs || []), sub].sort((a, c) => a.path.localeCompare(c.path, undefined, { numeric: true })) } : b);
  logChange(_t("Made the sub-book"), path, book.name);
  toast(_t("\"{0}\" is ready inside \"{1}\".", name, book.name), "ok");
  return sub;
}

export async function renameSub(book, sub) {
  let name = await ask(_t("Rename the sub-book"), { value: sub.name, ok: _t("Rename") });
  if (!name || name === sub.name) return;
  name = cleanName(name);
  await store.value.rename(sub.id, name);
  logChange(_t("Renamed the sub-book"), `${sub.path} → ${name}`, book.name);
  await reloadLibrary();
}

export async function deleteSub(book, sub) {
  const n = book.files.filter(f => f.sub === sub.path || f.sub.startsWith(sub.path + "/")).length;
  const ok = await confirm(_t("Move \"{0}\" to the bin?", sub.name), _t("The folder and its {0} file{1} go to your Google Drive bin, where you can get them back for 30 days.", n, n === 1 ? "" : "s"), { ok: _t("Move to the bin"), danger: true });
  if (!ok) return;
  await saveAll();
  await store.value.trash(sub.id);
  logChange(_t("Moved the sub-book to the bin"), sub.path, book.name);
  await reloadLibrary();
}

export async function moveFileToSub(book, file, sub) {
  const to = sub ? sub.id : book.id;
  if ((file.parent || book.id) === to) return;
  await saveAll();
  await store.value.move(file.shortcut || file.id, file.parent || book.id, to);
  books.value = books.value.map(b => b.id === book.id ? { ...b, files: b.files.map(f => f.id === file.id ? { ...f, parent: to, sub: sub ? sub.path : "" } : f) } : b);
  const { sortFiles } = await import("./state.js");
  books.value = books.value.map(b => b.id === book.id ? { ...b, files: sortFiles([...b.files], settings.value.books?.[b.id]?.fileOrder || []) } : b);
  logChange(_t("Moved"), `${file.name} → ${sub ? sub.path : _t("the top of the book")}`, book.name);
  toast(sub ? _t("Moved into \"{0}\".", sub.name) : _t("Moved to the top of the book."), "ok");
}

// a folder from the computer: a new book with all its files (its folders become sub-books)
export async function addFolder(book = null) {
  const files = await pickFiles({ folder: true });
  if (!files.length) return;
  const top = (files[0].webkitRelativePath || "").split("/")[0] || _t("New book");
  if (!book) book = await newBook(null, { suggest: top });      // 1.0: you name the folder from the start
  if (!book) return;
  const subIds = new Map((book.subs || []).map(x => [x.path, x]));
  const jobs = [];
  for (const f of files) {
    if (f.name.startsWith(".")) continue;
    const parts = (f.webkitRelativePath || f.name).split("/").slice(1, -1);   // the folders inside the chosen one
    let parent = null, path = "";
    for (const part of parts) {
      path = path ? path + "/" + part : part;
      if (!subIds.has(path)) {
        const cur = books.value.find(b => b.id === book.id);
        const made = await store.value.createSub(cleanName(part), parent ? parent.id : book.id);
        const sub = { id: made.id, name: cleanName(part), path };
        subIds.set(path, sub);
        books.value = books.value.map(b => b.id === book.id ? { ...b, subs: [...(cur.subs || []), sub] } : b);
      }
      parent = subIds.get(path);
    }
    jobs.push({ file: f, bookId: book.id, where: parent ? parent.id : book.id });
  }
  // the folders are made first; then every file goes up, three at a time, with the panel in the corner
  openBook(book.id);
  const { queueUploads } = await import("./uploads.js");
  await queueUploads(jobs, { open: false });
}

// documents from the computer, each one its own book
export async function addDocsAsBooks() {
  const files = await pickFiles();
  const jobs = [];
  for (const f of files) {
    const b = await newBook(f.name.replace(/\.[^.]+$/, ""));
    if (b) jobs.push({ file: f, bookId: b.id, where: b.id });
  }
  if (!jobs.length) return;
  const { queueUploads } = await import("./uploads.js");
  await queueUploads(jobs, { open: false });
}

// out of BindLens, but kept in the Drive ("My Drive"): a book (its folder) or a file
export async function releaseBook(book) {
  if (book.root) { toast(_t("This is My Drive itself.")); return; }
  if (book.shared || book.linked) { unlinkBook(book); return; }
  const ok = await confirm(_t("Take \"{0}\" out of BindLens?", book.name), store.value.kind === "drive"
    ? _t("The folder and its files go to My Drive, outside the BindLens folder. Nothing is deleted.") : _t("In the example library it just goes away."), { ok: _t("Take it out") });
  if (!ok) return;
  await saveAll();
  try { await store.value.release(book.id, store.value.rootId); }
  catch (e) { toast(_t("Google Drive did not let BindLens move it ({0}). Move the folder out of the BindLens folder in Google Drive itself.", e.message), "bad", 8000); return; }
  logChange(_t("Took the book out of BindLens (it is in My Drive)"), book.name);
  batch(() => {
    books.value = books.value.filter(b => b.id !== book.id);
    if (bookId.value === book.id) { view.value = "home"; bookId.value = null; }
  });
  toast(_t("\"{0}\" is in My Drive now.", book.name), "ok");
}

export async function releaseFile(book, file) {
  const ok = await confirm(_t("Take \"{0}\" out of this book?", file.name), store.value.kind === "drive"
    ? _t("It goes to My Drive, outside the BindLens folder. Nothing is deleted.") : _t("In the example library it just goes away."), { ok: _t("Take it out") });
  if (!ok) return;
  await saveAll();
  try { await store.value.release(file.id, file.parent || book.id); }
  catch (e) { toast(_t("Google Drive did not let BindLens move it ({0}). Move the file out of the BindLens folder in Google Drive itself.", e.message), "bad", 8000); return; }
  logChange(_t("Took out of the book (it is in My Drive)"), file.name, book.name);
  removeFile(file.id);
  if (fileId.value === file.id) { const b = books.value.find(x => x.id === book.id); fileId.value = b?.files[0]?.id || null; pageNo.value = 0; }
  toast(_t("\"{0}\" is in My Drive now.", file.name), "ok");
}

// ---- books colleagues shared with you: they stay in their Drive; BindLens only remembers them
export async function addSharedBook() {
  if (store.value.kind !== "drive") { toast(_t("Sign in with Google to open a book a colleague shared with you.")); return; }
  let folders = [];
  try { folders = (await store.value.pick(false, { shared: true, title: _t("A book (folder) a colleague shared with you") })).filter(p => p.mime === FOLDER_MIME); }
  catch (e) { toast(_t("Could not open your Drive: ") + e.message, "bad", 6000); return; }
  const fo = folders[0];
  if (!fo) return;
  const linked = settings.value.linkedBooks || [];
  if (!linked.some(x => x.id === fo.id)) setSetting("linkedBooks", [...linked, { id: fo.id, name: fo.name, at: Date.now() }]);
  await reloadLibrary();
  let b = books.value.find(x => x.id === fo.id);
  if (!b || !b.files.length) {
    // Google lets BindLens see only the files you choose: choose them once
    const ok = await confirm(_t("Choose the files of \"{0}\"", fo.name), _t("Google lets BindLens open only the files you choose. In the next window \"{0}\" is open: select all its files (Ctrl+A, or Cmd+A on a Mac) and press Select. Later, \"Bring in new files\" in the book's menu adds the ones your colleague puts in.", fo.name), { ok: _t("Choose the files") });
    if (ok) { await store.value.pick(true, { parent: fo.id, title: _t("\"{0}\": select all the files (Ctrl+A), then Select", fo.name) }); await reloadLibrary(); }
    b = books.value.find(x => x.id === fo.id);
  }
  if (b) { logChange(_t("Opened a book shared with you"), b.name); toast(_t("\"{0}\" is in your library. It stays in your colleague's Drive: what you mark, they see.", b.name), "ok", 6000); openBook(b.id); }
  else toast(_t("Google did not let BindLens open \"{0}\". Ask your colleague to share it with your Google account.", fo.name), "bad", 7000);
}

export async function bringNewFiles(book) {
  await store.value.pick(true, { parent: book.id, title: _t("\"{0}\": select the new files, then Select", book.name) });
  await reloadLibrary();
  toast(_t("\"{0}\" is up to date.", book.name), "ok");
}

export async function unlinkBook(book) {
  const ok = await confirm(_t("Take \"{0}\" out of your library?", book.name), book.shared ? _t("It is a book a colleague shared with you: it stays in their Drive, as it is. You can open it again with Add > A book shared with me.") : _t("The folder stays in your Drive, as it is, with all its files. You can add it again from your Drive."), { ok: _t("Take it out") });
  if (!ok) return;
  setSetting("linkedBooks", (settings.value.linkedBooks || []).filter(x => x.id !== book.id));
  batch(() => {
    books.value = books.value.filter(b => b.id !== book.id);
    if (bookId.value === book.id) { view.value = "home"; bookId.value = null; }
  });
  logChange(_t("Took out of the library the shared book"), book.name);
}
