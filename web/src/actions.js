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

export async function newBook(name, { quiet = false } = {}) {
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
    if (!quiet) toast(`"${name}" is ready. Add files to it.`, "ok");
    return books.value.find(x => x.id === b.id);
  } catch (e) {
    toast("Could not make the book: " + e.message, "bad");
    return null;
  }
}

export async function uploadFiles(book, files, { open = true, parent = null, quiet = false } = {}) {
  if (!files || !files.length) return [];
  if (!book) {
    book = currentBook.value || books.value[0] || await newBook();
    if (!book) return [];
  }
  const made = [];
  const where = parent || book.id;
  const taken = [...book.files.filter(f => (f.parent || book.id) === where).map(f => f.name)];
  let n = 0;
  if (!quiet) toast(files.length === 1 ? `Adding ${files[0].name}...` : `Adding ${files.length} files...`);
  for (const f of files) {
    try {
      const name = uniqueName(cleanName(f.name) || "file", taken);
      taken.push(name);
      const bytes = await f.arrayBuffer();
      const made1 = await store.value.create(where, name, bytes, f.type || mimeOf(name));
      made1.parent = where;
      addFileToBook(book.id, made1);
      logChange("Added", name, book.name);
      made.push(made1);
      n++;
    } catch (e) {
      toast(`Could not add ${f.name}: ${e.message}`, "bad", 6000);
    }
  }
  if (n && !quiet) toast(n === 1 ? `Added to "${book.name}" in your Drive.` : `${n} files added to "${book.name}" in your Drive.`, "ok");
  if (open && made.length) openBook(book.id, made[0].id);
  return made;
}

export async function addFromDrive(book) {
  if (!store.value.canPick) { toast(store.value.kind === "onedrive" ? "With OneDrive, add the files from your computer (Add files)." : "Sign in with Google to add files from your Drive."); return; }
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

// "A whole folder from my Drive": the folder becomes a book with all its files (its folders become sub-books).
// Google lets BindLens open only what you choose: if it cannot see inside the folder, the folder opens in the
// picker and you choose its files (select them all).
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SKIP_MIME = new Set(["application/vnd.google-apps.shortcut", "application/vnd.google-apps.form", "application/vnd.google-apps.site", "application/vnd.google-apps.map"]);
export async function addFolderFromDrive() {
  if (!store.value.canPick) { toast(store.value.kind === "onedrive" ? "With OneDrive, add a folder from your computer (Add a folder)." : "Sign in with Google to add folders from your Drive."); return; }
  try {
    const folders = (await store.value.pick(true, { folders: true, title: "Choose a folder from your Google Drive - it becomes a book" })).filter(p => p.mime === FOLDER_MIME);
    for (const fo of folders) await importDriveFolder(fo);
  } catch (e) {
    toast("Could not open your Drive: " + e.message, "bad", 6000);
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
  let tree = [];
  try { tree = await walkDrive(fo.id, "", 0, []); } catch (e) { tree = []; }
  if (!tree.length) {
    const ok = await confirm(`Choose the files of "${fo.name}"`,
      `Google lets BindLens open only the files you choose (that keeps the rest of your Drive private). In the next window "${fo.name}" is open: select all its files (Ctrl+A, or Cmd+A on a Mac) and press Select.`,
      { ok: "Choose the files" });
    if (!ok) return;
    const picked = (await store.value.pick(true, { parent: fo.id, title: `"${fo.name}": select all the files (Ctrl+A), then Select` })).filter(p => p.mime !== FOLDER_MIME && !SKIP_MIME.has(p.mime));
    if (!picked.length) return;
    for (const p of picked) tree.push({ file: await store.value.meta(p.id), path: "" });
  }
  const made = await newBook(fo.name);
  if (!made) return;
  const subs = new Map();
  let n = 0;
  toast(`Adding ${tree.length} file${tree.length === 1 ? "" : "s"} from "${fo.name}"...`);
  for (const { file, path } of tree) {
    let parent = made.id;
    try {
      if (path) {
        // the folders inside become sub-books
        let acc = "";
        for (const part of path.split("/")) {
          acc = acc ? acc + "/" + part : part;
          if (!subs.has(acc)) {
            const s = await store.value.createSub(cleanName(part), parent);
            const sub = { id: s.id, name: cleanName(part), path: acc };
            subs.set(acc, sub);
            books.value = books.value.map(b => b.id === made.id ? { ...b, subs: [...(b.subs || []), sub] } : b);
          }
          parent = subs.get(acc).id;
        }
      }
      const cur = books.value.find(b => b.id === made.id);
      const taken = cur.files.filter(x => (x.parent || made.id) === parent).map(x => x.name);
      const f = await store.value.copy(file, parent, uniqueName(file.name, taken));
      f.parent = parent;
      addFileToBook(made.id, f);
      n++;
      if (n % 5 === 0 && n < tree.length) toast(`"${fo.name}": ${n} of ${tree.length} files added...`);
    } catch (e) {
      toast(`Could not add ${file.name}: ${e.message}`, "bad", 5000);
    }
  }
  logChange("Added a folder from your Drive", `${fo.name} (${n} files)`, made.name);
  toast(`"${made.name}" is ready: ${n} file${n === 1 ? "" : "s"} from your Drive.`, "ok");
  openBook(made.id);
}

export async function renameBook(book) {
  const name = await ask("Rename the book", { value: book.name, ok: "Rename" });
  if (!name || name === book.name) return;
  await store.value.rename(book.id, cleanName(name));
  logChange("Renamed the book", `${book.name} → ${cleanName(name)}`);
  books.value = books.value.map(b => b.id === book.id ? { ...b, name: cleanName(name) } : b);
}

export async function deleteBook(book) {
  if (book.shared) { unlinkBook(book); return; }
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
  const f = await store.value.move(file.id, file.parent || book.id, toBook.id);
  f.parent = toBook.id;
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

// ---- sub-books: folders inside a book (as in the Windows app)
export async function newSubBook(book, parentSub = null) {
  let name = await ask(parentSub ? `New sub-book inside "${parentSub.name}"` : `New sub-book in "${book.name}"`,
    { label: "A sub-book is a folder inside the book's folder in your Drive. Its files are part of the book.", placeholder: "e.g. 2026", ok: "Make it" });
  if (!name) return null;
  name = cleanName(name);
  const path = (parentSub ? parentSub.path + "/" : "") + name;
  if ((book.subs || []).some(x => x.path.toLowerCase() === path.toLowerCase())) { toast("There is a sub-book with that name already."); return null; }
  const made = await store.value.createSub(name, parentSub ? parentSub.id : book.id);
  const sub = { id: made.id, name, path };
  books.value = books.value.map(b => b.id === book.id ? { ...b, subs: [...(b.subs || []), sub].sort((a, c) => a.path.localeCompare(c.path, undefined, { numeric: true })) } : b);
  logChange("Made the sub-book", path, book.name);
  toast(`"${name}" is ready inside "${book.name}".`, "ok");
  return sub;
}

export async function renameSub(book, sub) {
  let name = await ask("Rename the sub-book", { value: sub.name, ok: "Rename" });
  if (!name || name === sub.name) return;
  name = cleanName(name);
  await store.value.rename(sub.id, name);
  logChange("Renamed the sub-book", `${sub.path} → ${name}`, book.name);
  await reloadLibrary();
}

export async function deleteSub(book, sub) {
  const n = book.files.filter(f => f.sub === sub.path || f.sub.startsWith(sub.path + "/")).length;
  const ok = await confirm(`Move "${sub.name}" to the bin?`, `The folder and its ${n} file${n === 1 ? "" : "s"} go to your Google Drive bin, where you can get them back for 30 days.`, { ok: "Move to the bin", danger: true });
  if (!ok) return;
  await saveAll();
  await store.value.trash(sub.id);
  logChange("Moved the sub-book to the bin", sub.path, book.name);
  await reloadLibrary();
}

export async function moveFileToSub(book, file, sub) {
  const to = sub ? sub.id : book.id;
  if ((file.parent || book.id) === to) return;
  await saveAll();
  await store.value.move(file.id, file.parent || book.id, to);
  books.value = books.value.map(b => b.id === book.id ? { ...b, files: b.files.map(f => f.id === file.id ? { ...f, parent: to, sub: sub ? sub.path : "" } : f) } : b);
  const { sortFiles } = await import("./state.js");
  books.value = books.value.map(b => b.id === book.id ? { ...b, files: sortFiles([...b.files], settings.value.books?.[b.id]?.fileOrder || []) } : b);
  logChange("Moved", `${file.name} → ${sub ? sub.path : "the top of the book"}`, book.name);
  toast(sub ? `Moved into "${sub.name}".` : "Moved to the top of the book.", "ok");
}

// a folder from the computer: a new book with all its files (its folders become sub-books)
export async function addFolder(book = null) {
  const files = await pickFiles({ folder: true });
  if (!files.length) return;
  const top = (files[0].webkitRelativePath || "").split("/")[0] || "New book";
  if (!book) book = await newBook(top);
  if (!book) return;
  const subIds = new Map((book.subs || []).map(x => [x.path, x]));
  let n = 0;
  toast(`Adding ${files.length} files...`);
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
    const cur = books.value.find(b => b.id === book.id);
    await uploadFiles(cur, [f], { open: false, quiet: true, parent: parent ? parent.id : null }).then(m => { n += m.length; });
  }
  toast(`${n} files added to "${book.name}".`, "ok");
  openBook(book.id);
}

// documents from the computer, each one its own book
export async function addDocsAsBooks() {
  const files = await pickFiles();
  for (const f of files) {
    const b = await newBook(f.name.replace(/\.[^.]+$/, ""));
    if (b) await uploadFiles(books.value.find(x => x.id === b.id), [f], { open: false, quiet: true });
  }
  if (files.length) toast(`${files.length} new book${files.length === 1 ? "" : "s"}.`, "ok");
}

// out of BindLens, but kept in the Drive ("My Drive"): a book (its folder) or a file
export async function releaseBook(book) {
  if (book.shared) { unlinkBook(book); return; }
  const ok = await confirm(`Take "${book.name}" out of BindLens?`, store.value.kind === "drive"
    ? "The folder and its files go to My Drive, outside the BindLens folder. Nothing is deleted." : "In the example library it just goes away.", { ok: "Take it out" });
  if (!ok) return;
  await saveAll();
  try { await store.value.release(book.id, store.value.rootId); }
  catch (e) { toast("Google Drive did not let BindLens move it (" + e.message + "). Move the folder out of the BindLens folder in Google Drive itself.", "bad", 8000); return; }
  logChange("Took the book out of BindLens (it is in My Drive)", book.name);
  batch(() => {
    books.value = books.value.filter(b => b.id !== book.id);
    if (bookId.value === book.id) { view.value = "home"; bookId.value = null; }
  });
  toast(`"${book.name}" is in My Drive now.`, "ok");
}

export async function releaseFile(book, file) {
  const ok = await confirm(`Take "${file.name}" out of this book?`, store.value.kind === "drive"
    ? "It goes to My Drive, outside the BindLens folder. Nothing is deleted." : "In the example library it just goes away.", { ok: "Take it out" });
  if (!ok) return;
  await saveAll();
  try { await store.value.release(file.id, file.parent || book.id); }
  catch (e) { toast("Google Drive did not let BindLens move it (" + e.message + "). Move the file out of the BindLens folder in Google Drive itself.", "bad", 8000); return; }
  logChange("Took out of the book (it is in My Drive)", file.name, book.name);
  removeFile(file.id);
  if (fileId.value === file.id) { const b = books.value.find(x => x.id === book.id); fileId.value = b?.files[0]?.id || null; pageNo.value = 0; }
  toast(`"${file.name}" is in My Drive now.`, "ok");
}

// ---- books colleagues shared with you: they stay in their Drive; BindLens only remembers them
export async function addSharedBook() {
  if (store.value.kind !== "drive") { toast("Sign in with Google to open a book a colleague shared with you."); return; }
  let folders = [];
  try { folders = (await store.value.pick(false, { shared: true, title: "A book (folder) a colleague shared with you" })).filter(p => p.mime === FOLDER_MIME); }
  catch (e) { toast("Could not open your Drive: " + e.message, "bad", 6000); return; }
  const fo = folders[0];
  if (!fo) return;
  const linked = settings.value.linkedBooks || [];
  if (!linked.some(x => x.id === fo.id)) setSetting("linkedBooks", [...linked, { id: fo.id, name: fo.name, at: Date.now() }]);
  await reloadLibrary();
  let b = books.value.find(x => x.id === fo.id);
  if (!b || !b.files.length) {
    // Google lets BindLens see only the files you choose: choose them once
    const ok = await confirm(`Choose the files of "${fo.name}"`, `Google lets BindLens open only the files you choose. In the next window "${fo.name}" is open: select all its files (Ctrl+A, or Cmd+A on a Mac) and press Select. Later, "Bring in new files" in the book's menu adds the ones your colleague puts in.`, { ok: "Choose the files" });
    if (ok) { await store.value.pick(true, { parent: fo.id, title: `"${fo.name}": select all the files (Ctrl+A), then Select` }); await reloadLibrary(); }
    b = books.value.find(x => x.id === fo.id);
  }
  if (b) { logChange("Opened a book shared with you", b.name); toast(`"${b.name}" is in your library. It stays in your colleague's Drive: what you mark, they see.`, "ok", 6000); openBook(b.id); }
  else toast(`Google did not let BindLens open "${fo.name}". Ask your colleague to share it with your Google account.`, "bad", 7000);
}

export async function bringNewFiles(book) {
  await store.value.pick(true, { parent: book.id, title: `"${book.name}": select the new files, then Select` });
  await reloadLibrary();
  toast(`"${book.name}" is up to date.`, "ok");
}

export async function unlinkBook(book) {
  const ok = await confirm(`Take "${book.name}" out of your library?`, "It is a book a colleague shared with you: it stays in their Drive, as it is. You can open it again with Add > A book shared with me.", { ok: "Take it out" });
  if (!ok) return;
  setSetting("linkedBooks", (settings.value.linkedBooks || []).filter(x => x.id !== book.id));
  batch(() => {
    books.value = books.value.filter(b => b.id !== book.id);
    if (bookId.value === book.id) { view.value = "home"; bookId.value = null; }
  });
  logChange("Took out of the library the shared book", book.name);
}
