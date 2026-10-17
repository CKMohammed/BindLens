// The book view: a slim bar at the top, the library at the left, the pages in the middle (the tools are on the frame).
import { useEffect, useState } from "preact/hooks";
import { books, bookId, fileId, pageNo, tool, toolOpts, leftOpen, readMode, zoom, fitWidth, saving, sideTab, undoStack,
  redoStack, store, goHome, openBook, currentBook, settings, toast, narrow, bookMeta, panel, subView, visibleFiles,
  STATUSES, statusOf, statusColor, setStatus, setSetting, fitPage, commentsOpen, offline, aloud } from "../state.js";
import { Icon, fileIcon } from "./icons.jsx";
import { openMenu, ask } from "./dialogs.jsx";
import { Viewer, docState, scrollTo, selectedMark, searchHits, toolLock } from "./Viewer.jsx";
import { undo, redo, allMarks, fileFor, pageOp, getDoc, call, afterEdit } from "../docs.js";
import { uploadFiles, pickFiles, newBook, renameBook, deleteBook, renameFile, deleteFile, moveFileTo, moveFileInBook,
  openPanel, addFromDrive, addFolderFromDrive, refresh, setBookColor, toggleBookLock, newSubBook, renameSub, deleteSub, moveFileToSub,
  addFolder, releaseBook, releaseFile } from "../actions.js";
import * as FT from "../filetools.js";
import { initials, isPaged, fmtDate, rgbToHex, BOOK_COLORS, isPhone } from "../util.js";
import { AccountButton } from "./Home.jsx";
import { Logo } from "./Logo.jsx";
import { BookTile } from "./bookicons.jsx";
import { FullButton, frameBarOn } from "./FrameBar.jsx";
import { toolMenus, setTool, RowTools } from "./Tools.jsx";
import { Contents, ClockCal, DocSwitch, contentsOpen, BookMap } from "./Reading.jsx";
import { Checklist, checkProgress } from "./Checklist.jsx";
import { CommentsDrawer } from "./Comments.jsx";
import { Ribbon } from "./Ribbon.jsx";
import { AloudPlayer, toggleAloud } from "./Aloud.jsx";
import { addGooglePages, openBeside } from "./AddPages.jsx";

function T({ n, label, on, onClick, disabled, children, lock, onContextMenu }) {
  // a tool goes back to the arrow after one use; a double-click keeps it on (lock)
  return <button class={"ib" + (on ? " on" : "") + (on && lock && toolLock.value ? " locked" : "")} title={label + (lock ? " - double-click: keep it on" : "")} aria-label={label}
    onClick={onClick} disabled={disabled} onContextMenu={onContextMenu}
    onDblClick={lock ? () => { tool.value = lock; toolLock.value = true; toast("It stays on until you choose the arrow."); } : undefined}><Icon n={n} />{children}</button>;
}

// "Saved · 22:41" - always there, quiet; red when something did not save
function SaveState() {
  const s = saving.value;
  const demo = store.value.kind === "demo";
  const at = s.last ? new Date(s.last).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
  const where = store.value.kind === "onedrive" ? "OneDrive" : "Google Drive";
  if (offline.value.on || offline.value.waiting) return <span class="savestate off" title="No network: your changes are kept in this browser and go up to your Drive when the network is back"><Icon n="wifi" size={14} />{offline.value.waiting ? `Offline · ${offline.value.waiting} to save` : "Offline"}</span>;
  if (s.error) return <span class="savestate bad" title={s.error}><Icon n="x" size={14} />Not saved</span>;
  if (s.n) return <span class="savestate busy" title={"Saving in your " + where}><span class="sdot" />Saving</span>;
  if (demo) return <span class="savestate" title="The example library: nothing is saved">Example</span>;
  return <span class="savestate" title={s.last ? `Everything is saved in your ${where} (${at})` : `Saved in your ${where}`}><Icon n="check" size={14} />{s.last ? "Saved · " + at : "Saved"}</span>;
}

function TopBar({ book }) {
  const t = tool.value, o = toolOpts.value;
  const m = toolMenus(book);
  if (narrow.value) {
    // on a phone: the tools in one button, the rest under "more"
    const TOOLS = [["select", "select", "Select and move"], ["pen", "pen", "Pen"], ["highlight", "highlighter", "Highlighter"],
      ["text", "text", "Text"], ["note", "note", "Sticky note"], ["tick", "tick", "Tick"], ["cross", "cross", "Cross"],
      ["edit", "textedit", "Change the text"], ["eraser", "eraser", "Eraser"]];
    const cur = TOOLS.find(x => x[0] === t) || (t === "shape" ? ["shape", "shape", "Shapes"] : t === "stamp" ? ["stamp", "stamp", "Stamp"] : t === "sign" ? ["sign", "sign", "Signature"] : TOOLS[0]);
    return (
      <div class="topbar">
        <T n="sidebar" label="Library" on={leftOpen.value} onClick={() => { leftOpen.value = !leftOpen.value; }} />
        <T n="home" label="Home" onClick={goHome} />
        <button class="ib on" title="Tool" onClick={(e) => openMenu(e, [
          ...TOOLS.map(([k, icon, label]) => ({ label, icon, run: () => setTool(k) })),
          { label: "Shapes...", icon: "shape", run: () => m.shapeMenu({ currentTarget: e.currentTarget, preventDefault() {}, stopPropagation() {} }) },
          { label: "Stamps and signature...", icon: "stamp", run: () => m.stampMenu({ currentTarget: e.currentTarget, preventDefault() {}, stopPropagation() {} }) },
        ])}><Icon n={cur[1]} /></button>
        <button class="ib" title="Colours" onClick={m.colorMenu}><span class="swatch" style={{ background: t === "highlight" ? o.color : o.pen }} /></button>
        <T n="undo" label="Undo" onClick={undo} disabled={!undoStack.value.length} />
        <span class="grow" />
        <T n="search" label="Find" onClick={() => openPanel("find")} />
        <T n="addpage" label="Add pages, files, a scan" onClick={m.addMenu} />
        <button class="ib" title="More" onClick={(e) => openMenu(e, [
          { label: readMode.value ? "Leave reading mode" : "Reading mode", icon: "read", run: () => { readMode.value = !readMode.value; } },
          { label: "Redo", icon: "redo", run: redo },
          { label: "Reports", icon: "reports", run: () => openPanel("reports") },
          { label: "What needs you", icon: "clock", run: () => openPanel("dates") },
          { label: "Comments", icon: "comment", run: () => { commentsOpen.value = {}; } },
          { label: "Tasks", icon: "task", run: () => openPanel("tasks") },
          { label: "Share this book...", icon: "share", run: () => openPanel("share", { id: book.id }) },
          { label: "Photos as a gallery", icon: "image", run: () => openPanel("gallery") },
          { label: "Print", icon: "print", run: () => openPanel("print") },
          "-",
          { label: "Settings", icon: "settings", run: () => openPanel("settings") },
          { label: "Help", icon: "help", run: () => openPanel("help") },
          { label: "Send feedback...", icon: "feedback", run: () => openPanel("feedback") },
        ])}><Icon n="more" /></button>
      </div>
    );
  }
  // on a computer: a slim bar - where you are, Find, saved; the tools to mark are on the frame at the right
  const onFrame = frameBarOn();
  return (
    <div class={"topbar slim" + (onFrame ? "" : " withtools")}>
      <button class="brand" onClick={goHome} title="Home"><Logo size={36} still /></button>
      <T n="home" label="Home" onClick={goHome} />
      <T n="sidebar" label="Library (show / hide)" on={leftOpen.value} onClick={() => { leftOpen.value = !leftOpen.value; }} />
      <span class="crumb" title={book.name}><BookTile book={book} meta={{ ...bookMeta(book.id), tstyle: "flat" }} size={22} /><b class="ellipsis">{book.name}</b><Icon n="right" size={13} /></span>
      <DocSwitch book={book} />
      {!onFrame && <RowTools book={book} />}
      <span class="grow" />
      <div class="findbox" onClick={() => openPanel("find")} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openPanel("find"); }}><Icon n="search" size={16} /><span class="ellipsis">Find anything</span><kbd>Ctrl+K</kbd></div>
      <SaveState />
      <button class="btn ghost small" title="Add pages, files, a scan, a written page" onClick={m.addMenu}><Icon n="plus" size={16} />Add</button>
      <button class={"btn small " + (readMode.value ? "" : "ghost")} title="Reading mode: the page, the contents, calm" onClick={() => { readMode.value = !readMode.value; }}><Icon n="read" size={16} />Read</button>
      <T n="print" label="Print (Ctrl+P)" onClick={() => openPanel("print")} />
      <FullButton small />
      <AccountButton />
    </div>
  );
}

async function addBlankPage() {
  const f = fileFor(fileId.value);
  if (!f || f.kind !== "pdf") { openPanel("addpages", { book: currentBook.value?.id }); return; }
  const d = await getDoc(f);
  const p = d.pages[pageNo.value] || { w: 595, h: 842 };
  const at = pageNo.value + 1;
  await pageOp(f, "insertBlank", at, 1, Math.round(p.w), Math.round(p.h), "blank");
  pageNo.value = at; setTimeout(() => { scrollTo.value = { fileId: f.id, page: at }; }, 160);
  toast(`A blank page is after page ${at}. Ctrl+Z takes it out.`, "ok");
}

function Rail({ book }) {
  return (
    <div class="rail">
      {books.value.map(b => (
        <button key={b.id} class={"tab" + (b.id === book.id ? " on" : "")} title={b.name}
          onClick={() => openBook(b.id)} onContextMenu={(e) => { e.preventDefault(); openPanel("bookstyle", { id: b.id }); }}><BookTile book={b} meta={{ ...bookMeta(b.id), tstyle: "flat" }} size={34} /></button>
      ))}
      <button class="ib" title="New book" onClick={() => newBook().then(b => b && openBook(b.id))}><Icon n="plus" /></button>
    </div>
  );
}

function FileRow({ book, f, cur, indent }) {
  const st = docState.value[f.id];
  const tag = statusOf(f.id);
  return (
    <button class={"filerow" + (f.id === cur ? " on" : "")} style={indent ? { paddingLeft: 10 + indent * 14 } : null}
      onClick={() => { fileId.value = f.id; pageNo.value = 0; scrollTo.value = { fileId: f.id, page: 0 }; if (isPhone()) leftOpen.value = false; }}
      onContextMenu={(e) => { e.preventDefault(); fileMenu(e, book, f); }}>
      <span class="ico"><Icon n={/\.eml$/i.test(f.name) ? "mail" : fileIcon(f.kind)} size={18} /></span>
      <span class="grow ellipsis">{f.name}{tag && <span class="tag" style={{ color: statusColor(tag) }}> · {tag}</span>}</span>
      <span class="n">{st?.pages ? st.pages.length : ""}</span>
      <span class="ib" style={{ width: 26, height: 26 }} onClick={(e) => { e.stopPropagation(); fileMenu(e, book, f); }}><Icon n="more" size={16} /></span>
    </button>
  );
}

function subMenu(e, book, sub) {
  openMenu(e, [
    { title: sub.path },
    { label: "Open this sub-book", icon: "book", run: () => { subView.value = { book: book.id, path: sub.path }; const f = visibleFiles(book)[0]; if (f) { fileId.value = f.id; pageNo.value = 0; scrollTo.value = { fileId: f.id, page: 0 }; } } },
    { label: "Add files here...", icon: "upload", run: async () => uploadFiles(book, await pickFiles(), { open: false, parent: sub.id }) },
    { label: "New sub-book inside...", icon: "plus", run: () => newSubBook(book, sub) },
    { label: "Rename...", icon: "rename", run: () => renameSub(book, sub) },
    "-",
    { label: "Move to the bin", icon: "trash", danger: true, run: () => deleteSub(book, sub) },
  ]);
}

function FilesList({ book }) {
  const cur = fileId.value;
  const [shut, setShut] = useState({});
  const filter = settings.value.fileFilter || "";
  const files = visibleFiles(book).filter(f => !filter || statusOf(f.id) === filter);
  const sv = subView.value && subView.value.book === book.id ? subView.value.path : null;
  const subs = (book.subs || []).filter(sb => !sv || sb.path === sv || sb.path.startsWith(sv + "/"));
  const out = [];
  const top = files.filter(f => !f.sub || f.sub === sv);
  for (const f of top) out.push(<FileRow key={f.id} book={book} f={f} cur={cur} />);
  for (const sb of subs) {
    if (sb.path === sv) continue;
    const depth = sb.path.split("/").length - (sv ? sv.split("/").length : 0);
    const hidden = Object.keys(shut).some(p => shut[p] && sb.path.startsWith(p + "/"));
    if (hidden) continue;
    const mine = files.filter(f => f.sub === sb.path);
    const all = book.files.filter(f => f.sub === sb.path || f.sub.startsWith(sb.path + "/")).length;
    out.push(
      <button key={"s:" + sb.id} class="filerow subrow" style={{ paddingLeft: 4 + (depth - 1) * 14 }}
        onClick={() => setShut({ ...shut, [sb.path]: !shut[sb.path] })} onContextMenu={(e) => { e.preventDefault(); subMenu(e, book, sb); }}>
        <span class="ico"><Icon n={shut[sb.path] ? "right" : "down"} size={15} /></span>
        <Icon n="book" size={16} /><b class="grow ellipsis small">{sb.name}</b><span class="n">{all}</span>
        <span class="ib" style={{ width: 26, height: 26 }} onClick={(e) => { e.stopPropagation(); subMenu(e, book, sb); }}><Icon n="more" size={16} /></span>
      </button>
    );
    if (!shut[sb.path]) for (const f of mine) out.push(<FileRow key={f.id} book={book} f={f} cur={cur} indent={depth} />);
  }
  return (
    <div class="list">
      {sv && <div class="row small" style={{ padding: "2px 6px 6px" }}><Icon n="book" size={15} /><span class="grow ellipsis">Only <b>{sv}</b></span><button class="btn plain small" onClick={() => { subView.value = null; }}>Show all the book</button></div>}
      {filter && <div class="row small" style={{ padding: "2px 6px 6px" }}><span class="grow">Only files marked <b style={{ color: statusColor(filter) }}>{filter}</b></span><button class="btn plain small" onClick={() => setSetting("fileFilter", "")}>All files</button></div>}
      {!book.files.length && <p class="small muted" style={{ padding: 8 }}>No files yet.</p>}
      {book.files.length > 0 && !files.length && <p class="small muted" style={{ padding: 8 }}>No files here.</p>}
      {out}
    </div>
  );
}

function statusItems(f) {
  const cur = statusOf(f.id);
  return [
    ...STATUSES.map(([name, col]) => ({ label: (cur === name ? "✓ " : "") + name, color: col, run: () => setStatus(f.id, name) })),
    { label: "Your own...", icon: "rename", run: async () => { const t = await ask("Status", { label: `The status of "${f.name}"`, value: cur, ok: "Set it" }); if (t) setStatus(f.id, t.slice(0, 20)); } },
    "-",
    { label: "No status", run: () => setStatus(f.id, "") },
  ];
}

async function editWritten(f, page) {
  const d = await getDoc(f);
  const w = await call("writtenAt", d.key, page);
  if (!w) { toast("This page was not written in BindLens, so it has no words to open in Write. Use Change the text instead."); return; }
  openPanel("write", { edit: { fileId: f.id, start: w.start, n: w.n, html: w.html } });
}

function fileMenu(e, book, f) {
  const others = books.value.filter(b => b.id !== book.id);
  const pdf = f.kind === "pdf";
  openMenu(e, [
    { title: f.name },
    { label: "Status" + (statusOf(f.id) ? ": " + statusOf(f.id) : ""), icon: "check", sub: statusItems(f) },
    { label: "Rename", icon: "rename", run: () => renameFile(book, f) },
    { label: "Move up", icon: "up", run: () => moveFileInBook(book, f, -1) },
    { label: "Move down", icon: "down", run: () => moveFileInBook(book, f, 1) },
    (book.subs || []).length > 0 && { label: "Move to a sub-book", icon: "book", sub: [
      f.sub && { label: "The top of the book", run: () => moveFileToSub(book, f, null) },
      ...book.subs.filter(sb => sb.path !== f.sub).map(sb => ({ label: sb.path, icon: "book", run: () => moveFileToSub(book, f, sb) })),
    ] },
    others.length > 0 && { label: "Move to another book", icon: "right", sub: others.map(b => ({ label: b.name, swatch: b.color, run: () => moveFileTo(book, f, b) })) },
    "-",
    pdf && { label: "Edit this written page...", icon: "edit", run: () => editWritten(f, f.id === fileId.value ? pageNo.value : 0) },
    pdf && { label: "Pages and copies", icon: "grid", sub: [
      { label: "Save pages as a new PDF...", icon: "copy", run: () => FT.savePagesAsPdf(f, f.id === fileId.value ? pageNo.value : 0) },
      { label: "Split into one PDF per page...", icon: "grid", run: () => FT.splitFile(f) },
      { label: "Add pages from another PDF...", icon: "addpage", run: async () => FT.addPagesFromPdf(f, (await getDoc(f)).pages.length) },
      { label: "Watermark...", icon: "type", run: () => FT.watermark(f) },
      { label: "Make this file smaller... (pictures, scans)", icon: "download", run: () => FT.makeSmaller(f) },
      { label: "Deleted pages... (put a page back)", icon: "undo", run: () => openPanel("deleted", { fileId: f.id }) },
    ] },
    pdf && { label: "Copy with a password...", icon: "lock", run: () => openPanel("protect", { fileId: f.id }) },
    pdf && { label: "Read-only copy...", icon: "lock", run: () => openPanel("protect", { fileId: f.id, readOnly: true }) },
    { label: "Earlier versions...", icon: "clock", run: () => openPanel("versions", { fileId: f.id }) },
    isPaged(f.kind) && f.kind !== "image" && { label: "Compare with another document", icon: "copy", sub: [
      ...book.files.filter(x => x.id !== f.id && isPaged(x.kind) && x.kind !== "image").map(x => ({ label: x.name, icon: fileIcon(x.kind), run: () => openPanel("reports", { compare: { a: f.id, b: x.id } }) })),
      ...books.value.filter(b2 => b2.id !== book.id && b2.files.some(x => isPaged(x.kind) && x.kind !== "image")).map(b2 => ({ label: b2.name, swatch: b2.color, sub: b2.files.filter(x => isPaged(x.kind) && x.kind !== "image").map(x => ({ label: x.name, icon: fileIcon(x.kind), run: () => openPanel("reports", { compare: { a: f.id, b: x.id } }) })) })),
    ] },
    { label: "Print...", icon: "print", run: () => { fileId.value = f.id; openPanel("print"); } },
    { label: "Send by email...", icon: "mail", run: () => FT.sendFile(f) },
    { label: "Download a copy", icon: "download", run: async () => { const buf = await store.value.read(f); const { download } = await import("../util.js"); download(buf, f.name, f.mime); } },
    f.kind === "gdoc" && store.value.editLink && { label: "Edit it in Google", icon: "edit", run: () => openBeside(store.value.editLink(/spreadsheet/.test(f.mime) ? "sheet" : /presentation/.test(f.mime) ? "slides" : "doc", f.id)) },
    f.kind === "gdoc" && { label: "Show it as it is now", icon: "rotate", run: () => refreshGoogle(f, true) },
    store.value.cloud && { label: "Open in " + store.value.cloud, icon: "drive", run: () => window.open(store.value.webLink(f), "_blank") },
    f.kind === "image" && { label: "Open the photos as a gallery", icon: "image", run: () => openPanel("gallery", { fileId: f.id }) },
    pdf && { label: "Make scanned pages searchable (OCR)", icon: "type", run: async () => {
      const { readScannedDoc } = await import("../ocr.js");
      toast("Reading the scanned pages (it takes a moment)...");
      const n = await readScannedDoc(f);
      toast(n ? `${n} words read in "${f.name}".` : `"${f.name}" has no scanned pages without words.`, n ? "ok" : "");
    } },
    store.value.officePdf && ["word", "excel", "powerpoint"].includes(f.kind) && { label: (settings.value.googleLook || {})[f.id] ? "Show it BindLens's own way (quicker)" : `Show it as it looks (${store.value.kind === "drive" ? "Google" : "OneDrive"} converts it)`, icon: "eye", run: async () => {
      const g = { ...(settings.value.googleLook || {}) };
      if (g[f.id]) delete g[f.id]; else g[f.id] = true;
      setSetting("googleLook", g);
      const { reopen, notifyChanged } = await import("../docs.js");
      toast(g[f.id] ? `Asking ${store.value.cloud} to show it as it looks...` : "BindLens shows it its own way.");
      await reopen(f); notifyChanged(f.id, "pages");
    } },
    "-",
    store.value.kind !== "onedrive" && { label: "Take it out of this book (it stays in your Drive)", icon: "logout", run: () => releaseFile(book, f) },
    { label: "Move to the bin", icon: "trash", danger: true, run: () => deleteFile(book, f) },
  ]);
}

function MarksList({ book }) {
  const [list, setList] = useState(null);
  const vs = book.files.map(f => docState.value[f.id]?.v || 0).join();
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = [];
      for (const f of book.files) {
        if (f.kind !== "pdf") continue;
        try { for (const m of await allMarks(f)) out.push({ ...m, file: f }); } catch (e) {}
      }
      if (alive) setList(out);
    })();
    return () => { alive = false; };
  }, [book.id, vs]);
  if (!list) return <div class="list"><div class="spinner" /></div>;
  if (!list.length) return <div class="list"><p class="small muted" style={{ padding: 8 }}>No marks yet. Use the highlighter, the pen or a sticky note on any PDF page.</p></div>;
  const label = { Highlight: "Highlight", Underline: "Underline", StrikeOut: "Strike-out", Squiggly: "Wavy line", Ink: "Drawing", FreeText: "Text", Text: "Note", Square: "Box", Circle: "Circle", Line: "Line", Stamp: "Stamp" };
  return (
    <div class="list">
      <div class="row marks-export">
        <span class="tiny muted grow">{list.length} marks</span>
        <button class="btn plain small" title="Your highlights and notes as a Word file" onClick={async () => (await import("../exportMarks.js")).exportMarks(book, "word")}><Icon n="word" size={14} />Word</button>
        <button class="btn plain small" title="As a PDF" onClick={async () => (await import("../exportMarks.js")).exportMarks(book, "pdf")}><Icon n="pdf" size={14} />PDF</button>
        {store.value.createConverted && <button class="btn plain small" title="As a Google Doc, to keep writing" onClick={async () => (await import("../exportMarks.js")).exportMarks(book, "google").catch(e => toast("Google: " + e.message, "bad"))}><Icon n="drive" size={14} />Docs</button>}
      </div>
      {list.map((m, i) => (
        <button key={i} class="mark-row" onClick={() => { scrollTo.value = { fileId: m.file.id, page: m.page, y: m.rect[1] }; selectedMark.value = { fileId: m.file.id, ...m }; }}>
          <div class="row"><span class="k" style={{ background: m.color ? rgbToHex(m.color) : "#ccc" }} /><b class="small">{m.subject && m.type === "FreeText" ? m.subject : label[m.type] || m.type}</b><span class="tiny muted grow" style={{ textAlign: "right" }}>p. {m.page + 1}</span></div>
          <div class="small ellipsis" style={{ marginTop: 2 }}>{m.contents || m.text || m.file.name}</div>
          {book.files.length > 1 && <div class="tiny muted ellipsis">{m.file.name}</div>}
        </button>
      ))}
    </div>
  );
}

function SearchList({ book }) {
  const [q, setQ] = useState(searchHits.value?.query || "");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!q.trim()) { searchHits.value = null; return; }
    setBusy(true);
    const list = [];
    let n = 0;
    for (const f of book.files) {
      if (!isPaged(f.kind) || f.kind === "image") continue;
      try {
        const d = await getDoc(f);
        const res = await call("search", d.key, q.trim());
        for (const r of res) list.push({ fileId: f.id, file: f.name, page: r.page, quads: r.hits.flat(), count: r.hits.length, n: n++ });
      } catch (e) {}
    }
    for (const it of list) it.quads = it.quads.filter(x => Array.isArray(x) && x.length === 8);
    searchHits.value = { query: q.trim(), list, cur: list[0] || null };
    if (list[0]) scrollTo.value = { fileId: list[0].fileId, page: list[0].page, y: list[0].quads[0]?.[1] };
    setBusy(false);
  };
  const h = searchHits.value;
  return (
    <div class="list">
      <div class="row" style={{ padding: "4px 2px 8px" }}>
        <input class="field" placeholder="Find in this book" value={q} onInput={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") run(); }} />
        <button class="btn small" onClick={run}>Find</button>
      </div>
      {busy && <div class="spinner" />}
      {h && !busy && <p class="tiny muted" style={{ padding: "0 6px" }}>{h.list.length ? `${h.list.reduce((a, x) => a + x.count, 0)} found on ${h.list.length} page${h.list.length === 1 ? "" : "s"}` : "Not found in this book."}
        {h.list.length > 0 && <button class="btn plain small" onClick={() => { searchHits.value = null; setQ(""); }}>Clear</button>}</p>}
      {h && h.list.map((it, i) => (
        <button key={i} class={"filerow" + (h.cur === it ? " on" : "")} onClick={() => { searchHits.value = { ...h, cur: it }; scrollTo.value = { fileId: it.fileId, page: it.page, y: it.quads[0]?.[1] }; }}>
          <span class="grow ellipsis">{it.file}</span><span class="n">p. {it.page + 1} · {it.count}</span>
        </button>
      ))}
    </div>
  );
}

// reading mode: the contents card, with Read aloud (ui/Aloud.jsx reads the book, sentence by sentence)
function ReadingLayer({ book }) {
  // a big page (zoomed in): the contents step aside so the page has the room
  return <Contents book={book} aloud={aloud.value.on} onAloud={() => toggleAloud()} compact={zoom.value > 1.05} />;
}

function Side({ book }) {
  if (readMode.value) return null;
  const tab = sideTab.value;
  const bookMenu = (e, b) => openMenu(e, [
    { title: b.name },
    { label: "Rename", icon: "rename", run: () => renameBook(b) },
    { label: "Icon and colour...", icon: "palette", run: () => openPanel("bookstyle", { id: b.id }) },
    { label: "New sub-book...", icon: "plus", run: () => newSubBook(b) },
    { label: "Add a folder as a sub-book...", icon: "book", run: () => addFolder(b) },
    { label: "Save the whole book as one PDF...", icon: "download", run: () => FT.wholeBookAsPdf(b) },
    { label: bookMeta(b.id).locked ? "Open it without the PIN" : "Lock it with the PIN", icon: "lock", run: () => toggleBookLock(b) },
    { title: "Colour" },
    ...BOOK_COLORS.slice(0, 8).map(c => ({ label: "", swatch: c, run: () => setBookColor(b, c) })),
    "-",
    store.value.kind !== "onedrive" && { label: "Take it out of BindLens (it stays in your Drive)", icon: "logout", run: () => releaseBook(b) },
    { label: "Move to the bin", icon: "trash", danger: true, run: () => deleteBook(b) },
  ]);
  return (
    <div class={"side" + (leftOpen.value ? "" : " closed")}>
      <div class="head">
        <h3>Library</h3><span class="tiny muted">{books.value.length} books · {books.value.reduce((a, b) => a + b.files.length, 0)} files</span>
        <span class="grow" />
        <button class="ib" title="Up to date with my Drive" onClick={refresh}><Icon n="rotate" size={17} /></button>
        <button class="ib" title="New book" onClick={() => newBook().then(b => b && openBook(b.id))}><Icon n="plus" /></button>
        {isPhone() && <button class="ib" onClick={() => { leftOpen.value = false; }}><Icon n="close" /></button>}
      </div>
      <div class="books">
        {books.value.map(b => (
          <button key={b.id} class={"bookrow" + (b.id === book.id ? " on" : "")} onClick={() => openBook(b.id)}
            onContextMenu={(e) => { e.preventDefault(); bookMenu(e, b); }}>
            <span class="chip"><BookTile book={b} meta={bookMeta(b.id)} size={28} /></span>
            <span class="grow ellipsis">{b.name}</span><span class="n">{b.files.length}</span>
          </button>
        ))}
      </div>
      <div class="subtabs">
        <button class={tab === "files" ? "on" : ""} onClick={() => { sideTab.value = "files"; }}>Files</button>
        <button class={tab === "marks" ? "on" : ""} onClick={() => { sideTab.value = "marks"; }}>Marks</button>
        <button class={tab === "search" ? "on" : ""} onClick={() => { sideTab.value = "search"; }}>Search</button>
        <button class={tab === "check" ? "on" : ""} onClick={() => { sideTab.value = "check"; }} title="The documents this book needs">Checklist{checkProgress(book.id) ? <span class="tabn">{checkProgress(book.id).done}/{checkProgress(book.id).of}</span> : null}</button>
      </div>
      {tab === "files" && <div class="row" style={{ padding: "0 10px 4px" }}>
        <button class="btn plain small" style={{ padding: "2px 6px" }} onClick={(e) => openMenu(e, [
          { label: "All files", run: () => setSetting("fileFilter", "") },
          ...STATUSES.map(([n, c]) => ({ label: `Only "${n}"`, color: c, run: () => setSetting("fileFilter", n) })),
          ...[...new Set(Object.values(settings.value.tags || {}))].filter(t => !STATUSES.some(x => x[0] === t)).map(t => ({ label: `Only "${t}"`, run: () => setSetting("fileFilter", t) })),
        ])} title="Show only the files with a status"><Icon n="list" size={14} />{settings.value.fileFilter ? `Only "${settings.value.fileFilter}"` : "All files"}<Icon n="down" size={12} /></button>
        <span class="grow" />
        <button class="btn plain small" style={{ padding: "2px 6px" }} title="A folder inside this book" onClick={() => newSubBook(book)}><Icon n="plus" size={14} />Sub-book</button>
      </div>}
      {tab === "files" && <FilesList book={book} />}
      {tab === "marks" && <MarksList book={book} />}
      {tab === "search" && <SearchList book={book} />}
      {tab === "check" && <Checklist book={book} />}
      <div class="foot">
        <button class="btn ghost" onClick={async () => uploadFiles(book, await pickFiles(), { open: false })}><Icon n="plus" size={17} />Add files</button>
      </div>
    </div>
  );
}

function PageBar({ book }) {
  const files = visibleFiles(book);
  let total = 0, cur = 0;
  for (const f of files) {
    const n = docState.value[f.id]?.pages?.length || 1;
    if (f.id === fileId.value) cur = total + pageNo.value + 1;
    total += n;
  }
  const go = (by) => {
    let idx = cur - 1 + by;
    idx = Math.max(0, Math.min(total - 1, idx));
    let acc = 0;
    for (const f of files) {
      const n = docState.value[f.id]?.pages?.length || 1;
      if (idx < acc + n) { scrollTo.value = { fileId: f.id, page: idx - acc }; fileId.value = f.id; pageNo.value = idx - acc; return; }
      acc += n;
    }
  };
  useEffect(() => {
    const k = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return;
      if (panel.value || document.querySelector(".scrim, .gallery, .lock")) return;   // a dialog has the keys
      if (e.key === "PageDown" || (e.key === "ArrowRight" && !e.shiftKey)) { e.preventDefault(); go(1); }
      if (e.key === "PageUp" || (e.key === "ArrowLeft" && !e.shiftKey)) { e.preventDefault(); go(-1); }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const map = { v: "select", p: "pen", h: "highlight", t: "text", n: "note", e: "eraser", c: "comment" };
        if (map[e.key]) setTool(map[e.key]);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoom.value = Math.min(4, zoom.value * 1.15); }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") { e.preventDefault(); zoom.value = Math.max(0.08, zoom.value / 1.15); }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") { e.preventDefault(); zoom.value = 1; fitWidth.value = true; }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const curFile = fileFor(fileId.value);
  const pagesMenu = async (e0) => {
    const e = { currentTarget: e0.currentTarget, clientX: e0.clientX, clientY: e0.clientY, preventDefault() {}, stopPropagation() {} };
    const f = curFile;
    const pdf = f && f.kind === "pdf" && docState.value[f.id]?.status === "ready";
    let tg = null;
    if (pdf) try { tg = await call("taggedAt", (await getDoc(f)).key, pageNo.value); } catch (er) { tg = null; }
    const gname = tg && { doc: "Google Docs", sheet: "Google Sheets", slides: "Google Slides" }[tg.tag.kind];
    openMenu(e, [
      { title: `Page ${pageNo.value + 1} of ${f ? f.name : ""}` },
      tg && store.value.editLink && { label: `Open it in ${gname} again`, icon: "edit", run: () => openBeside(store.value.editLink(tg.tag.kind, tg.tag.id)) },
      tg && store.value.exportPdf && { label: `Bring its pages anew from ${gname}`, icon: "rotate", run: () => addGooglePages({ ...tg.tag, fileId: f.id, start: tg.start, n: tg.n }, { replace: true }).catch(er => toast("Google: " + er.message, "bad")) },
      tg && "-",
      { label: "Add pages here...", icon: "addpage", run: () => openPanel("addpages", { book: book.id }) },
      pdf && { label: "Turn it right", icon: "rotate", run: () => pageOp(f, "rotatePage", pageNo.value, 90) },
      pdf && { label: "Turn it left", icon: "rotate", run: () => pageOp(f, "rotatePage", pageNo.value, -90) },
      pdf && { label: "Move it up", icon: "up", disabled: pageNo.value === 0, run: () => pageOp(f, "movePage", pageNo.value, pageNo.value - 1).then(() => { pageNo.value--; }) },
      pdf && { label: "Move it down", icon: "down", run: () => pageOp(f, "movePage", pageNo.value, pageNo.value + 1).then(() => { pageNo.value++; }) },
      pdf && { label: "A blank page after it", icon: "addpage", run: addBlankPage },
      pdf && { label: "Write a page after it...", icon: "edit", run: () => openPanel("write", { book: book.id, into: f.id, at: pageNo.value + 1 }) },
      pdf && { label: "Scan pages after it...", icon: "camera", run: () => openPanel("scan", { book: book.id, into: f.id, at: pageNo.value + 1 }) },
      pdf && { label: "Add pages from another PDF...", icon: "addpage", run: () => FT.addPagesFromPdf(f, pageNo.value + 1) },
      pdf && { label: "Edit this written page...", icon: "edit", run: () => editWritten(f, pageNo.value) },
      pdf && { label: "Crop...", icon: "fit", run: () => { tool.value = "crop"; toast("Drag a box round the part of the page to keep."); } },
      pdf && { label: "Save pages as a new PDF...", icon: "copy", run: () => FT.savePagesAsPdf(f, pageNo.value) },
      f && { label: "Remind me about this page...", icon: "clock", run: () => remindPage(book, f, pageNo.value) },
      f && { label: "A task about this page...", icon: "task", run: () => openPanel("tasks", { about: true }) },
      pdf && { label: "Read the words of this page (a scan)", icon: "type", run: async () => {
        toast("Reading the words of the page...");
        const { readScannedPage } = await import("../ocr.js");
        const n = await readScannedPage(f, pageNo.value);
        toast(n ? `${n} words read: you can find, copy and change them now.` : "This page has its words already, or none were found.", n ? "ok" : "");
      } },
      pdf && "-",
      pdf && (docState.value[f.id]?.pages?.length || 1) > 1 && { label: "Take this page out", icon: "trash", danger: true, run: async () => {
        const { confirm } = await import("./dialogs.jsx");
        if (await confirm("Take this page out?", "You can put it back with Undo (Ctrl+Z), or later with Deleted pages.", { ok: "Take it out", danger: true })) await FT.takePageOut(f, pageNo.value);
      } },
      pdf && { label: "Deleted pages... (put a page back)", icon: "undo", run: () => openPanel("deleted", { fileId: f.id }) },
      { label: "All pages (grid)", icon: "grid", run: () => openPanel("pages", { fileId: f?.id }) },
    ]);
  };
  return (
    <div class="pagebar">
      <button class="ib" title="Previous page" onClick={() => go(-1)}><Icon n="left" /></button>
      <span class="pn">{cur || 1} / {total}</span>
      <button class="ib" title="Next page" onClick={() => go(1)}><Icon n="right" /></button>
      <span class="sep" />
      <button class="ib" title="Smaller (go on: the pages side by side, then the whole book)" onClick={() => { zoom.value = Math.max(0.08, zoom.value / 1.2); }}><Icon n="zoomout" /></button>
      <span class="small" style={{ minWidth: 42, textAlign: "center" }}>{Math.round(zoom.value * 100)}%</span>
      <button class="ib" title="Bigger" onClick={() => { zoom.value = Math.min(4, zoom.value * 1.15); }}><Icon n="zoomin" /></button>
      <button class={"ib" + (fitWidth.value && zoom.value === 1 && !fitPage.value ? " on" : "")} title="Fit the width" onClick={() => { fitWidth.value = true; fitPage.value = false; zoom.value = 1; }}><Icon n="fit" /></button>
      <button class={"ib hide-phone" + (fitPage.value ? " on" : "")} title="Fit the whole page" onClick={() => { fitWidth.value = true; fitPage.value = !fitPage.value; zoom.value = 1; }}><Icon n="expand" /></button>
      <button class="ib" title="Pages: turn, move, add, take out" onClick={pagesMenu}><Icon n="grid" /></button>
    </div>
  );
}

// "Remind me about this page": a reminder in What needs you, that opens the page
async function remindPage(book, f, page) {
  const { isoDate, uid, fmtDate } = await import("../util.js");
  const text = await ask("Remind me about this page", { label: `Page ${page + 1} of "${f.name}". What do you want to remember?`, placeholder: "e.g. Check the figures with Aoife", ok: "Next" });
  if (!text) return;
  const d = await ask("When?", { label: "The date, e.g. 2026-11-20", value: isoDate(new Date(Date.now() + 7 * 86400000)), ok: "Add the reminder" });
  if (!d || isNaN(new Date(d + "T00:00"))) { if (d) toast("Write the date like this: 2026-11-20"); return; }
  setSetting("reminders", [...(settings.value.reminders || []), { id: uid(), date: d, text, bookId: book.id, fileId: f.id, page, file: f.name, book: book.name }]);
  toast(`On ${fmtDate(new Date(d + "T00:00"))}, What needs you shows it.`, "ok");
}

function RRail() {
  if (settings.value.hideRail) return null;
  return (
    <div class="rrail" onContextMenu={(e) => { e.preventDefault(); openMenu(e, [{ label: "Hide the quick bar (Settings brings it back)", icon: "close", run: () => setSetting("hideRail", true) }]); }}>
      <button class="ib" title="Reading mode" onClick={() => { readMode.value = !readMode.value; }}><Icon n="read" /></button>
      <button class="ib" title="What needs you" onClick={() => openPanel("dates")}><Icon n="clock" /></button>
      <button class="ib" title="Reports" onClick={() => openPanel("reports")}><Icon n="table" /></button>
      <button class="ib" title="Photos as a gallery" onClick={() => openPanel("gallery")}><Icon n="image" /></button>
      <button class="ib" title="Scan" onClick={() => openPanel("scan")}><Icon n="camera" /></button>
      <button class="ib" title="Write" onClick={() => openPanel("write")}><Icon n="edit" /></button>
      <button class="ib" title="Study cards (your highlights)" onClick={() => openPanel("study")}><Icon n="star" /></button>
      <span class="grow" />
      <button class="ib" title="Lock with a PIN" onClick={() => openPanel("pin")}><Icon n="lock" /></button>
      <button class="ib" title="Help" onClick={() => openPanel("help")}><Icon n="help" /></button>
    </div>
  );
}

// a Google Doc of the book changed in its window: when you come back, BindLens shows it as it is now
async function refreshGoogle(f, loud = false) {
  const s = store.value;
  if (!s.meta) return;
  try {
    const m = await s.meta(f.id);
    if (!loud && m.modified === f.modified) return;
    const { patchFile } = await import("../state.js");
    const { reopen, notifyChanged } = await import("../docs.js");
    patchFile({ ...m, kind: f.kind });
    await reopen({ ...f, ...m });
    notifyChanged(f.id, "pages");
    if (loud) toast(`"${f.name}" is as it is now in Google.`, "ok");
  } catch (e) { if (loud) toast("Google: " + e.message, "bad"); }
}

function GoogleJobs({ book }) {
  const jobs = (settings.value.googleJobs || []).filter(j => j.book === book.id && !j.hide);
  const [busy, setBusy] = useState(false);
  if (!jobs.length) return null;
  const j = jobs[jobs.length - 1];
  const app = { doc: "Google Docs", sheet: "Google Sheets", slides: "Google Slides" }[j.kind];
  return (
    <div class="gjob">
      <Icon n={{ doc: "word", sheet: "excel", slides: "slides" }[j.kind]} size={18} />
      <span class="small"><b>{j.name}</b> is open in {app}. When it is ready:</span>
      <button class="btn small" disabled={busy} onClick={async () => { setBusy(true); try { await addGooglePages(j); } catch (e) { toast("Google: " + e.message, "bad"); } setBusy(false); }}><Icon n="addpage" size={15} />{j.replace ? "Put the page back" : "Add these pages"}</button>
      <button class="btn plain small" onClick={() => openBeside(store.value.editLink(j.kind, j.id))}>Open it</button>
      <button class="ib" title="Not now (it stays in Add pages)" onClick={() => setSetting("googleJobs", (settings.value.googleJobs || []).map(x => x === j ? { ...x, hide: true } : x))}><Icon n="close" size={15} /></button>
    </div>
  );
}

export function BookView() {
  const book = currentBook.value;
  useEffect(() => { if (!book) goHome(); }, [book]);
  useEffect(() => {
    const back = () => { const f = fileFor(fileId.value); if (f && f.kind === "gdoc") refreshGoogle(f); };
    window.addEventListener("focus", back);
    return () => window.removeEventListener("focus", back);
  }, []);
  useEffect(() => { if (isPhone()) leftOpen.value = false; }, []);
  if (!book) return null;
  return (
    <div class={"book-view" + (readMode.value ? " reading rbg-" + ((settings.value.reading || {}).bg || "calm") : "") + (settings.value.night ? " night" : "")} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {narrow.value || !frameBarOn() ? <TopBar book={book} /> : !readMode.value ? <Ribbon book={book} /> : null}
      <div class="main">
        {(!leftOpen.value || readMode.value) && <Rail book={book} />}
        {leftOpen.value && !readMode.value && <Side book={book} />}
        <div class={"vhost" + (readMode.value && contentsOpen.value && !narrow.value && zoom.value <= 1.05 ? " withcontents" : "")} style={{ flex: 1, display: "flex", minWidth: 0, position: "relative" }}>
          <Viewer book={book} />
          <GoogleJobs book={book} />
          <AloudPlayer />
          {book.files.length > 0 && <PageBar book={book} />}
          {readMode.value && <ClockCal compact={zoom.value > 1.05 || narrow.value} />}
          {readMode.value && !narrow.value && (settings.value.reading || {}).map !== false && <BookMap book={book} />}
        </div>
        {readMode.value && <ReadingLayer book={book} />}
        {commentsOpen.value && !readMode.value && <CommentsDrawer book={book} />}
      </div>
    </div>
  );
}

export { fmtDate };
