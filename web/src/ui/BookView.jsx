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
import { _t, loc, _tv } from "../i18n.js";
import { bookHidden } from "../state.js";
import { picked, pick, BulkBar, docLine } from "./DocData.jsx";
import { consult, scratch } from "../consult.js";

function T({ n, label, on, onClick, disabled, children, lock, onContextMenu }) {
  // a tool goes back to the arrow after one use; a double-click keeps it on (lock)
  return <button class={"ib" + (on ? " on" : "") + (on && lock && toolLock.value ? " locked" : "")} title={label + (lock ? _t(" - double-click: keep it on") : "")} aria-label={label}
    onClick={onClick} disabled={disabled} onContextMenu={onContextMenu}
    onDblClick={lock ? () => { tool.value = lock; toolLock.value = true; toast(_t("It stays on until you choose the arrow.")); } : undefined}><Icon n={n} />{children}</button>;
}

// "Saved · 22:41" - always there, quiet; red when something did not save
function SaveState() {
  const s = saving.value;
  const demo = store.value.kind === "demo";
  const at = s.last ? new Date(s.last).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }) : "";
  const where = store.value.kind === "onedrive" ? "OneDrive" : "Google Drive";
  if (offline.value.on || offline.value.waiting) return <span class="savestate off" title={_t("No network: your changes are kept in this browser and go up to your Drive when the network is back")}><Icon n="wifi" size={14} />{offline.value.waiting ? _t("Offline · {0} to save", offline.value.waiting) : _t("Offline")}</span>;
  if (s.error) return <span class="savestate bad" title={s.error}><Icon n="x" size={14} />{_t("Not saved")}</span>;
  if (s.n) return <span class="savestate busy" title={_t("Saving in your ") + where}><span class="sdot" />{_t("Saving")}</span>;
  if (demo) return <span class="savestate" title={_t("The example library: nothing is saved")}>{_t("Example")}</span>;
  return <span class="savestate" title={s.last ? _t("Everything is saved in your {0} ({1})", where, at) : _t("Saved in your {0}", where)}><Icon n="check" size={14} />{s.last ? _t("Saved · ") + at : _t("Saved")}</span>;
}

function TopBar({ book }) {
  const t = tool.value, o = toolOpts.value;
  const m = toolMenus(book);
  if (narrow.value && readMode.value) {
    const rb = (n, label, run, on) => <button class={"bb" + (on ? " on" : "")} onClick={run}><Icon n={n} size={20} /><span>{label}</span></button>;
    return (
      <>
      <div class="topbar">
        <span class="crumb grow ellipsis small"><b class="ellipsis">{book.name}</b></span>
        <DocSwitch book={book} />
        {!consult.value && <button class="ib" title={_t("Lock reading with your PIN (optional)")} onClick={() => openPanel("consult")}><Icon n="lock" size={16} /></button>}
      </div>
      <nav class="bottombar" aria-label={_t("Reading")}>
        {rb("book", _t("Books"), (e) => openMenu(e, books.value.filter(b => !bookHidden(b)).map(b => ({ label: b.name, swatch: b.color, run: () => openBook(b.id) }))))}
        {rb("reports", _t("Reports"), () => openPanel("reports"))}
        {rb("print", _t("Print"), () => openPanel("print"))}
        {rb("pen", _t("Pencil"), () => { scratch.value = !scratch.value; }, scratch.value)}
        {consult.value ? rb("lock", _t("Unlock"), () => openPanel("consult")) : rb("close", _t("Leave"), () => { readMode.value = false; scratch.value = false; })}
      </nav>
      </>
    );
  }
  if (narrow.value) {
    // on a phone: the tools in one button, the rest under "more"
    const TOOLS = [["select", "select", _t("Select and move")], ["pen", "pen", _t("Pen")], ["highlight", "highlighter", _t("Highlighter")],
      ["text", "text", _t("Text")], ["note", "note", _t("Sticky note")], ["tick", "tick", _t("Tick")], ["cross", "cross", _t("Cross")],
      ["edit", "textedit", _t("Change the text")], ["eraser", "eraser", _t("Eraser")]];
    const cur = TOOLS.find(x => x[0] === t) || (t === "shape" ? ["shape", "shape", _t("Shapes")] : t === "stamp" ? ["stamp", "stamp", _t("Stamp")] : t === "sign" ? ["sign", "sign", _t("Signature")] : TOOLS[0]);
    const mk = (n, label, run, on) => <button class={"bb" + (on ? " on" : "")} onClick={run}><Icon n={n} size={20} /><span>{label}</span></button>;
    const marking = !["select", null].includes(t);
    return (
      <>
      <div class="topbar">
        <T n="sidebar" label={_t("Library")} on={leftOpen.value} onClick={() => { leftOpen.value = !leftOpen.value; }} />
        <T n="home" label={_t("Home")} onClick={goHome} />
        <span class="crumb grow ellipsis small"><b class="ellipsis">{book.name}</b></span>
        {marking && <button class="ib" title={_t("Colours")} onClick={m.colorMenu}><span class="swatch" style={{ background: t === "highlight" ? o.color : o.pen }} /></button>}
        <T n="undo" label={_t("Undo")} onClick={undo} disabled={!undoStack.value.length} />
        <T n="addpage" label={_t("Add pages, files, a scan")} onClick={m.addMenu} />
      </div>
      <nav class="bottombar" aria-label={_t("Tools")}>
        <button class={"bb" + (readMode.value ? " on" : "")} onClick={() => { readMode.value = !readMode.value; }}><span class="rbwrap"><Icon n="read" size={20} /><i class="rblock"><Icon n="lock" size={8} /></i></span><span>{_t("Read")}</span></button>
        <button class={"bb" + (marking && t !== "sign" ? " on" : "")} onClick={(e) => openMenu(e, [
          ...TOOLS.map(([k, icon, label]) => ({ label, icon, run: () => setTool(k) })),
          { label: _t("Shapes..."), icon: "shape", run: () => m.shapeMenu({ currentTarget: e.currentTarget, preventDefault() {}, stopPropagation() {} }) },
          { label: _t("Stamps and signature..."), icon: "stamp", run: () => m.stampMenu({ currentTarget: e.currentTarget, preventDefault() {}, stopPropagation() {} }) },
        ])}><Icon n={marking && t !== "sign" ? cur[1] : "highlighter"} size={20} /><span>{_t("Mark@@tab")}</span></button>
        {mk("sign", _t("Sign"), (e) => openMenu(e, [
          { label: _t("Fill in"), icon: "form", run: () => { setTool("select"); toast(_t("Tap a box of the form and type.")); } },
          { label: _t("Signature"), icon: "sign", run: () => { setTool("sign"); if (!(settings.value.signatures || []).length) openPanel("signature"); } },
          { label: _t("New signature"), icon: "rename", run: () => openPanel("signature") },
          { label: _t("Date"), icon: "calendar", run: () => setTool("date") },
          { label: _t("Tick"), icon: "tick", run: () => setTool("tick") },
        ]), t === "sign")}
        {mk("search", _t("Find"), () => openPanel("find"))}
        <button class="bb" onClick={(e) => openMenu(e, [
          { label: readMode.value ? _t("Leave reading mode") : _t("Reading mode"), icon: "read", run: () => { readMode.value = !readMode.value; } },
          { label: _t("Redo"), icon: "redo", run: redo },
          { label: _t("Reports"), icon: "reports", run: () => openPanel("reports") },
          { label: _t("What needs you"), icon: "clock", run: () => openPanel("dates") },
          { label: _t("Comments"), icon: "comment", run: () => { commentsOpen.value = {}; } },
          { label: _t("Tasks"), icon: "task", run: () => openPanel("tasks") },
          { label: _t("Share this book..."), icon: "share", run: () => openPanel("share", { id: book.id }) },
          { label: _t("Photos as a gallery"), icon: "image", run: () => openPanel("gallery") },
          { label: _t("Print"), icon: "print", run: () => openPanel("print") },
          "-",
          { label: _t("Settings"), icon: "settings", run: () => openPanel("settings") },
          { label: _t("Help"), icon: "help", run: () => openPanel("help") },
          { label: _t("Send feedback..."), icon: "feedback", run: () => openPanel("feedback") },
        ])}><Icon n="more" size={20} /><span>{_t("More")}</span></button>
      </nav>
      </>
    );
  }
  // on a computer: a slim bar - where you are, Find, Add, your account (what you do with the page is in the ribbon)
  const onFrame = frameBarOn();
  return (
    <div class={"topbar slim" + (onFrame ? "" : " withtools")}>
      <button class="brand" onClick={goHome} title={_t("Home")}><Logo size={36} still /></button>
      <T n="home" label={_t("Home")} onClick={goHome} />
      <T n="sidebar" label={_t("Library (show / hide)")} on={leftOpen.value} onClick={() => { leftOpen.value = !leftOpen.value; }} />
      <span class="crumb" title={_t("Another book")} role="button" tabIndex={0} style={{ cursor: "pointer" }} onClick={(e) => openMenu(e, [{ title: _t("Go to a book") }, ...books.value.filter(b => !bookHidden(b)).map(b => ({ label: b.name, swatch: b.color, hint: b.id === book.id ? "\u2713" : "", run: () => openBook(b.id) }))])}><BookTile book={book} meta={{ ...bookMeta(book.id), tstyle: "flat" }} size={22} /><b class="ellipsis">{book.name}</b><Icon n="right" size={13} /></span>
      <DocSwitch book={book} />
      {!onFrame && <RowTools book={book} />}
      <span class="grow" />
      <div class="findbox" onClick={() => openPanel("find")} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openPanel("find"); }}><Icon n="search" size={16} /><span class="ellipsis">{_t("Find anything")}</span><kbd>{_t("Ctrl+K")}</kbd></div>
      <SaveState />
      <button class="btn ghost small" title={_t("Add pages, files, a scan, a written page")} onClick={m.addMenu}><Icon n="plus" size={16} />{_t("Add")}</button>
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
  toast(_t("A blank page is after page {0}. Ctrl+Z takes it out.", at), "ok");
}

function Rail({ book }) {
  return (
    <div class="rail">
      {books.value.map(b => (
        <button key={b.id} class={"tab" + (b.id === book.id ? " on" : "")} title={b.name}
          onClick={() => openBook(b.id)} onContextMenu={(e) => { e.preventDefault(); openPanel("bookstyle", { id: b.id }); }}><BookTile book={b} meta={{ ...bookMeta(b.id), tstyle: "flat" }} size={34} /></button>
      ))}
      <button class="ib" title={_t("New book")} onClick={() => newBook().then(b => b && openBook(b.id))}><Icon n="plus" /></button>
    </div>
  );
}

function FileRow({ book, f, cur, indent }) {
  const st = docState.value[f.id];
  const tag = statusOf(f.id);
  const picking = picked.value.size > 0, on = picked.value.has(f.id);
  const line = docLine(f.id);
  return (
    <button class={"filerow" + (f.id === cur ? " on" : "") + (on ? " picked" : "")} style={indent ? { paddingLeft: 10 + indent * 14 } : null}
      onClick={(e) => {
        // Ctrl / Shift + click, or once choosing has started: choose several documents for one action
        if (e.ctrlKey || e.metaKey || e.shiftKey || picking) { pick(f.id); return; }
        fileId.value = f.id; pageNo.value = 0; scrollTo.value = { fileId: f.id, page: 0 }; if (isPhone()) leftOpen.value = false;
      }}
      onContextMenu={(e) => { e.preventDefault(); fileMenu(e, book, f); }}>
      {picking ? <input type="checkbox" class="pickbox" checked={on} tabIndex={-1} aria-label={f.name} /> :
      <span class="ico"><Icon n={/\.eml$/i.test(f.name) ? "mail" : fileIcon(f.kind)} size={18} /></span>}
      <span class="grow ellipsis">{f.name}{tag && <span class="tag" style={{ color: statusColor(tag) }}>{_tv(tag)}</span>}{line && <span class="dline">{line}</span>}</span>
      <span class="n">{st?.pages ? st.pages.length : ""}</span>
      <span class="ib" style={{ width: 26, height: 26 }} onClick={(e) => { e.stopPropagation(); fileMenu(e, book, f); }}><Icon n="more" size={16} /></span>
    </button>
  );
}

function subMenu(e, book, sub) {
  openMenu(e, [
    { title: sub.path },
    { label: _t("Open this sub-book"), icon: "book", run: () => { subView.value = { book: book.id, path: sub.path }; const f = visibleFiles(book)[0]; if (f) { fileId.value = f.id; pageNo.value = 0; scrollTo.value = { fileId: f.id, page: 0 }; } } },
    { label: _t("Add files here..."), icon: "upload", run: async () => uploadFiles(book, await pickFiles(), { open: false, parent: sub.id }) },
    { label: _t("New sub-book inside..."), icon: "plus", run: () => newSubBook(book, sub) },
    { label: _t("Rename..."), icon: "rename", run: () => renameSub(book, sub) },
    "-",
    { label: _t("Move to the bin"), icon: "trash", danger: true, run: () => deleteSub(book, sub) },
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
      {sv && <div class="row small" style={{ padding: "2px 6px 6px" }}><Icon n="book" size={15} /><span class="grow ellipsis">{_t("Only")} <b>{sv}</b></span><button class="btn plain small" onClick={() => { subView.value = null; }}>{_t("Show all the book")}</button></div>}
      {filter && <div class="row small" style={{ padding: "2px 6px 6px" }}><span class="grow">{_t("Only files marked")} <b style={{ color: statusColor(filter) }}>{_tv(filter)}</b></span><button class="btn plain small" onClick={() => setSetting("fileFilter", "")}>{_t("All files")}</button></div>}
      <BulkBar items={book.files.filter(f => picked.value.has(f.id)).map(f => [book, f])} />
      {!book.files.length && <p class="small muted" style={{ padding: 8 }}>{_t("No files yet.")}</p>}
      {book.files.length > 0 && !files.length && <p class="small muted" style={{ padding: 8 }}>{_t("No files here.")}</p>}
      {out}
    </div>
  );
}

function statusItems(f) {
  const cur = statusOf(f.id);
  return [
    ...STATUSES.map(([name, col]) => ({ label: (cur === name ? "✓ " : "") + _tv(name), color: col, run: () => setStatus(f.id, name) })),
    { label: _t("Your own..."), icon: "rename", run: async () => { const t = await ask(_t("Status"), { label: _t("The status of \"{0}\"", f.name), value: cur, ok: _t("Set it") }); if (t) setStatus(f.id, t.slice(0, 20)); } },
    "-",
    { label: _t("No status"), run: () => setStatus(f.id, "") },
  ];
}

async function editWritten(f, page) {
  const d = await getDoc(f);
  const w = await call("writtenAt", d.key, page);
  if (!w) { toast(_t("This page was not written in BindLens, so it has no words to open in Write. Use Change the text instead.")); return; }
  openPanel("write", { edit: { fileId: f.id, start: w.start, n: w.n, html: w.html } });
}

function fileMenu(e, book, f) {
  const others = books.value.filter(b => b.id !== book.id);
  const pdf = f.kind === "pdf";
  openMenu(e, [
    { title: f.name },
    { label: _t("Status") + (statusOf(f.id) ? ": " + _tv(statusOf(f.id)) : ""), icon: "check", sub: statusItems(f) },
    { label: _t("Data (kind, date, reference, owner, expiry)..."), icon: "form", run: () => openPanel("docdata", { ids: [f.id] }) },
    { label: _t("Choose several (Ctrl+click)"), icon: "tick", run: () => pick(f.id) },
    { label: _t("Rename"), icon: "rename", run: () => renameFile(book, f) },
    { label: _t("Move up"), icon: "up", run: () => moveFileInBook(book, f, -1) },
    { label: _t("Move down"), icon: "down", run: () => moveFileInBook(book, f, 1) },
    (book.subs || []).length > 0 && { label: _t("Move to a sub-book"), icon: "book", sub: [
      f.sub && { label: _t("The top of the book"), run: () => moveFileToSub(book, f, null) },
      ...book.subs.filter(sb => sb.path !== f.sub).map(sb => ({ label: sb.path, icon: "book", run: () => moveFileToSub(book, f, sb) })),
    ] },
    others.length > 0 && { label: _t("Move to another book"), icon: "right", sub: others.map(b => ({ label: b.name, swatch: b.color, run: () => moveFileTo(book, f, b) })) },
    "-",
    pdf && { label: _t("Edit this written page..."), icon: "edit", run: () => editWritten(f, f.id === fileId.value ? pageNo.value : 0) },
    pdf && { label: _t("Pages and copies"), icon: "grid", sub: [
      { label: _t("Save pages as a new PDF..."), icon: "copy", run: () => FT.savePagesAsPdf(f, f.id === fileId.value ? pageNo.value : 0) },
      { label: _t("Split into one PDF per page..."), icon: "grid", run: () => FT.splitFile(f) },
      { label: _t("Add pages from another PDF..."), icon: "addpage", run: async () => FT.addPagesFromPdf(f, (await getDoc(f)).pages.length) },
      { label: _t("Watermark..."), icon: "type", run: () => FT.watermark(f) },
      { label: _t("Make this file smaller... (pictures, scans)"), icon: "download", run: () => FT.makeSmaller(f) },
      { label: _t("Deleted pages... (put a page back)"), icon: "undo", run: () => openPanel("deleted", { fileId: f.id }) },
    ] },
    pdf && { label: _t("Copy with a password..."), icon: "lock", run: () => openPanel("protect", { fileId: f.id }) },
    pdf && { label: _t("Read-only copy..."), icon: "lock", run: () => openPanel("protect", { fileId: f.id, readOnly: true }) },
    { label: _t("Earlier versions..."), icon: "clock", run: () => openPanel("versions", { fileId: f.id }) },
    isPaged(f.kind) && f.kind !== "image" && { label: _t("Compare with another document"), icon: "copy", sub: [
      ...book.files.filter(x => x.id !== f.id && isPaged(x.kind) && x.kind !== "image").map(x => ({ label: x.name, icon: fileIcon(x.kind), run: () => openPanel("reports", { compare: { a: f.id, b: x.id } }) })),
      ...books.value.filter(b2 => b2.id !== book.id && b2.files.some(x => isPaged(x.kind) && x.kind !== "image")).map(b2 => ({ label: b2.name, swatch: b2.color, sub: b2.files.filter(x => isPaged(x.kind) && x.kind !== "image").map(x => ({ label: x.name, icon: fileIcon(x.kind), run: () => openPanel("reports", { compare: { a: f.id, b: x.id } }) })) })),
    ] },
    { label: _t("Print..."), icon: "print", run: () => { fileId.value = f.id; openPanel("print"); } },
    { label: _t("Send by email..."), icon: "mail", run: () => FT.sendFile(f) },
    { label: _t("Download a copy"), icon: "download", run: async () => { const buf = await store.value.read(f); const { download } = await import("../util.js"); download(buf, f.name, f.mime); } },
    f.kind === "gdoc" && store.value.editLink && { label: _t("Edit it in Google"), icon: "edit", run: () => openBeside(store.value.editLink(/spreadsheet/.test(f.mime) ? "sheet" : /presentation/.test(f.mime) ? "slides" : "doc", f.id)) },
    f.kind === "gdoc" && { label: _t("Show it as it is now"), icon: "rotate", run: () => refreshGoogle(f, true) },
    store.value.cloud && { label: _t("Open in ") + store.value.cloud, icon: "drive", run: () => window.open(store.value.webLink(f), "_blank") },
    f.kind === "image" && { label: _t("Open the photos as a gallery"), icon: "image", run: () => openPanel("gallery", { fileId: f.id }) },
    pdf && { label: _t("Make scanned pages searchable (OCR)"), icon: "type", run: async () => {
      const { readScannedDoc } = await import("../ocr.js");
      toast(_t("Reading the scanned pages (it takes a moment)..."));
      const n = await readScannedDoc(f);
      toast(n ? _t("{0} words read in \"{1}\".", n, f.name) : _t("\"{0}\" has no scanned pages without words.", f.name), n ? "ok" : "");
    } },
    store.value.officePdf && ["word", "excel", "powerpoint"].includes(f.kind) && { label: (settings.value.googleLook || {})[f.id] ? _t("Show it BindLens's own way (quicker)") : _t("Show it as it looks ({0} converts it)", store.value.kind === "drive" ? _t("Google") : _t("OneDrive")), icon: "eye", run: async () => {
      const g = { ...(settings.value.googleLook || {}) };
      if (g[f.id]) delete g[f.id]; else g[f.id] = true;
      setSetting("googleLook", g);
      const { reopen, notifyChanged } = await import("../docs.js");
      toast(g[f.id] ? _t("Asking {0} to show it as it looks...", store.value.cloud) : _t("BindLens shows it its own way."));
      await reopen(f); notifyChanged(f.id, "pages");
    } },
    "-",
    store.value.kind !== "onedrive" && { label: _t("Take it out of this book (it stays in your Drive)"), icon: "logout", run: () => releaseFile(book, f) },
    { label: _t("Move to the bin"), icon: "trash", danger: true, run: () => deleteFile(book, f) },
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
  if (!list.length) return <div class="list"><p class="small muted" style={{ padding: 8 }}>{_t("No marks yet. Use the highlighter, the pen or a sticky note on any PDF page.")}</p></div>;
  const label = { Highlight: _t("Highlight"), Underline: _t("Underline"), StrikeOut: _t("Strike-out"), Squiggly: _t("Wavy line"), Ink: _t("Drawing"), FreeText: _t("Text"), Text: _t("Note"), Square: _t("Box"), Circle: _t("Circle"), Line: _t("Line"), Stamp: _t("Stamp") };
  return (
    <div class="list">
      <div class="row marks-export">
        <span class="tiny muted grow">{list.length} {_t("marks")}</span>
        <button class="btn plain small" title={_t("Your highlights and notes as a Word file")} onClick={async () => (await import("../exportMarks.js")).exportMarks(book, "word")}><Icon n="word" size={14} />{_t("Word")}</button>
        <button class="btn plain small" title={_t("As a PDF")} onClick={async () => (await import("../exportMarks.js")).exportMarks(book, "pdf")}><Icon n="pdf" size={14} />{_t("PDF")}</button>
        {store.value.createConverted && <button class="btn plain small" title={_t("As a Google Doc, to keep writing")} onClick={async () => (await import("../exportMarks.js")).exportMarks(book, "google").catch(e => toast(_t("Google: ") + e.message, "bad"))}><Icon n="drive" size={14} />{_t("Docs")}</button>}
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
        <input class="field" placeholder={_t("Find in this book")} value={q} onInput={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") run(); }} />
        <button class="btn small" onClick={run}>{_t("Find")}</button>
      </div>
      {busy && <div class="spinner" />}
      {h && !busy && <p class="tiny muted" style={{ padding: "0 6px" }}>{h.list.length ? _t("{0} found on {1} page{2}", h.list.reduce((a, x) => a + x.count, 0), h.list.length, h.list.length === 1 ? "" : "s") : _t("Not found in this book.")}
        {h.list.length > 0 && <button class="btn plain small" onClick={() => { searchHits.value = null; setQ(""); }}>{_t("Clear")}</button>}</p>}
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
    { label: _t("Rename"), icon: "rename", run: () => renameBook(b) },
    { label: _t("Icon and colour..."), icon: "palette", run: () => openPanel("bookstyle", { id: b.id }) },
    { label: _t("New sub-book..."), icon: "plus", run: () => newSubBook(b) },
    { label: _t("Add a folder as a sub-book..."), icon: "book", run: () => addFolder(b) },
    { label: _t("Save the whole book as one PDF..."), icon: "download", run: () => FT.wholeBookAsPdf(b) },
    { label: bookMeta(b.id).locked ? _t("Open it without the PIN") : _t("Lock it with the PIN"), icon: "lock", run: () => toggleBookLock(b) },
    { title: _t("Colour") },
    ...BOOK_COLORS.slice(0, 8).map(c => ({ label: "", swatch: c, run: () => setBookColor(b, c) })),
    "-",
    store.value.kind !== "onedrive" && { label: _t("Take it out of BindLens (it stays in your Drive)"), icon: "logout", run: () => releaseBook(b) },
    { label: _t("Move to the bin"), icon: "trash", danger: true, run: () => deleteBook(b) },
  ]);
  return (
    <div class={"side" + (leftOpen.value ? "" : " closed")}>
      <div class="head">
        <h3>{_t("Library")}</h3><span class="tiny muted">{books.value.length} {_t("books ·")} {books.value.reduce((a, b) => a + b.files.length, 0)} {_t("files")}</span>
        <span class="grow" />
        <button class="ib" title={_t("Up to date with my Drive")} onClick={refresh}><Icon n="rotate" size={17} /></button>
        <button class="ib" title={_t("New book")} onClick={() => newBook().then(b => b && openBook(b.id))}><Icon n="plus" /></button>
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
        <button class={tab === "files" ? "on" : ""} onClick={() => { sideTab.value = "files"; }}>{_t("Files")}</button>
        <button class={tab === "marks" ? "on" : ""} onClick={() => { sideTab.value = "marks"; }}>{_t("Marks")}</button>
        <button class={tab === "search" ? "on" : ""} onClick={() => { sideTab.value = "search"; }}>{_t("Search")}</button>
        <button class={tab === "check" ? "on" : ""} onClick={() => { sideTab.value = "check"; }} title={_t("The documents this book needs")}>{_t("Checklist")}{checkProgress(book.id) ? <span class="tabn">{checkProgress(book.id).done}/{checkProgress(book.id).of}</span> : null}</button>
      </div>
      {tab === "files" && <div class="row" style={{ padding: "0 10px 4px" }}>
        <button class="btn plain small" style={{ padding: "2px 6px" }} onClick={(e) => openMenu(e, [
          { label: _t("All files"), run: () => setSetting("fileFilter", "") },
          ...STATUSES.map(([n, c]) => ({ label: _t("Only \"{0}\"", _tv(n)), color: c, run: () => setSetting("fileFilter", n) })),
          ...[...new Set(Object.values(settings.value.tags || {}))].filter(t => !STATUSES.some(x => x[0] === t)).map(t => ({ label: _t("Only \"{0}\"", t), run: () => setSetting("fileFilter", t) })),
        ])} title={_t("Show only the files with a status")}><Icon n="list" size={14} />{settings.value.fileFilter ? _t("Only \"{0}\"", _tv(settings.value.fileFilter)) : _t("All files")}<Icon n="down" size={12} /></button>
        <span class="grow" />
        <button class="btn plain small" style={{ padding: "2px 6px" }} title={_t("A folder inside this book")} onClick={() => newSubBook(book)}><Icon n="plus" size={14} />{_t("Sub-book")}</button>
      </div>}
      {tab === "files" && <FilesList book={book} />}
      {tab === "marks" && <MarksList book={book} />}
      {tab === "search" && <SearchList book={book} />}
      {tab === "check" && <Checklist book={book} />}
      <div class="foot">
        <button class="btn ghost" onClick={async () => uploadFiles(book, await pickFiles(), { open: false })}><Icon n="plus" size={17} />{_t("Add files")}</button>
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
      { title: _t("Page {0} of {1}", pageNo.value + 1, f ? f.name : "") },
      tg && store.value.editLink && { label: _t("Open it in {0} again", gname), icon: "edit", run: () => openBeside(store.value.editLink(tg.tag.kind, tg.tag.id)) },
      tg && store.value.exportPdf && { label: _t("Bring its pages anew from {0}", gname), icon: "rotate", run: () => addGooglePages({ ...tg.tag, fileId: f.id, start: tg.start, n: tg.n }, { replace: true }).catch(er => toast(_t("Google: ") + er.message, "bad")) },
      tg && "-",
      { label: _t("Add pages here..."), icon: "addpage", run: () => openPanel("addpages", { book: book.id }) },
      pdf && { label: _t("Turn it right"), icon: "rotate", run: () => pageOp(f, "rotatePage", pageNo.value, 90) },
      pdf && { label: _t("Turn it left"), icon: "rotate", run: () => pageOp(f, "rotatePage", pageNo.value, -90) },
      pdf && { label: _t("Move it up"), icon: "up", disabled: pageNo.value === 0, run: () => pageOp(f, "movePage", pageNo.value, pageNo.value - 1).then(() => { pageNo.value--; }) },
      pdf && { label: _t("Move it down"), icon: "down", run: () => pageOp(f, "movePage", pageNo.value, pageNo.value + 1).then(() => { pageNo.value++; }) },
      pdf && { label: _t("A blank page after it"), icon: "addpage", run: addBlankPage },
      pdf && { label: _t("Write a page after it..."), icon: "edit", run: () => openPanel("write", { book: book.id, into: f.id, at: pageNo.value + 1 }) },
      pdf && { label: _t("Scan pages after it..."), icon: "camera", run: () => openPanel("scan", { book: book.id, into: f.id, at: pageNo.value + 1 }) },
      pdf && { label: _t("Add pages from another PDF..."), icon: "addpage", run: () => FT.addPagesFromPdf(f, pageNo.value + 1) },
      pdf && { label: _t("Edit this written page..."), icon: "edit", run: () => editWritten(f, pageNo.value) },
      pdf && { label: _t("Crop..."), icon: "fit", run: () => { tool.value = "crop"; toast(_t("Drag a box round the part of the page to keep.")); } },
      pdf && { label: _t("Save pages as a new PDF..."), icon: "copy", run: () => FT.savePagesAsPdf(f, pageNo.value) },
      f && { label: _t("Remind me about this page..."), icon: "clock", run: () => remindPage(book, f, pageNo.value) },
      f && { label: _t("A task about this page..."), icon: "task", run: () => openPanel("tasks", { about: true }) },
      pdf && { label: _t("Read the words of this page (a scan)"), icon: "type", run: async () => {
        toast(_t("Reading the words of the page..."));
        const { readScannedPage } = await import("../ocr.js");
        const n = await readScannedPage(f, pageNo.value);
        toast(n ? _t("{0} words read: you can find, copy and change them now.", n) : _t("This page has its words already, or none were found."), n ? "ok" : "");
      } },
      pdf && "-",
      pdf && (docState.value[f.id]?.pages?.length || 1) > 1 && { label: _t("Take this page out"), icon: "trash", danger: true, run: async () => {
        const { confirm } = await import("./dialogs.jsx");
        if (await confirm(_t("Take this page out?"), _t("You can put it back with Undo (Ctrl+Z), or later with Deleted pages."), { ok: _t("Take it out"), danger: true })) await FT.takePageOut(f, pageNo.value);
      } },
      pdf && { label: _t("Deleted pages... (put a page back)"), icon: "undo", run: () => openPanel("deleted", { fileId: f.id }) },
      { label: _t("All pages (grid)"), icon: "grid", run: () => openPanel("pages", { fileId: f?.id }) },
    ]);
  };
  return (
    <div class="pagebar">
      <button class="ib" title={_t("Previous page")} onClick={() => go(-1)}><Icon n="left" /></button>
      <span class="pn">{cur || 1} / {total}</span>
      <button class="ib" title={_t("Next page")} onClick={() => go(1)}><Icon n="right" /></button>
      <span class="sep" />
      <button class="ib" title={_t("Smaller (go on: the pages side by side, then the whole book)")} onClick={() => { zoom.value = Math.max(0.08, zoom.value / 1.2); }}><Icon n="zoomout" /></button>
      <span class="small" style={{ minWidth: 42, textAlign: "center" }}>{Math.round(zoom.value * 100)}%</span>
      <button class="ib" title={_t("Bigger")} onClick={() => { zoom.value = Math.min(4, zoom.value * 1.15); }}><Icon n="zoomin" /></button>
      <button class={"ib" + (fitWidth.value && zoom.value === 1 && !fitPage.value ? " on" : "")} title={_t("Fit the width")} onClick={() => { fitWidth.value = true; fitPage.value = false; zoom.value = 1; }}><Icon n="fit" /></button>
      <button class={"ib hide-phone" + (fitPage.value ? " on" : "")} title={_t("Fit the whole page")} onClick={() => { fitWidth.value = true; fitPage.value = !fitPage.value; zoom.value = 1; }}><Icon n="expand" /></button>
      <button class="ib" title={_t("Pages: turn, move, add, take out")} onClick={pagesMenu}><Icon n="grid" /></button>
    </div>
  );
}

// "Remind me about this page": a reminder in What needs you, that opens the page
async function remindPage(book, f, page) {
  const { isoDate, uid, fmtDate } = await import("../util.js");
  const text = await ask(_t("Remind me about this page"), { label: _t("Page {0} of \"{1}\". What do you want to remember?", page + 1, f.name), placeholder: _t("e.g. Check the figures with Aoife"), ok: _t("Next") });
  if (!text) return;
  const d = await ask(_t("When?"), { label: _t("The date, e.g. 2026-11-20"), value: isoDate(new Date(Date.now() + 7 * 86400000)), ok: _t("Add the reminder") });
  if (!d || isNaN(new Date(d + "T00:00"))) { if (d) toast(_t("Write the date like this: 2026-11-20")); return; }
  setSetting("reminders", [...(settings.value.reminders || []), { id: uid(), date: d, text, bookId: book.id, fileId: f.id, page, file: f.name, book: book.name }]);
  toast(_t("On {0}, What needs you shows it.", fmtDate(new Date(d + "T00:00"))), "ok");
}

function RRail() {
  if (settings.value.hideRail) return null;
  return (
    <div class="rrail" onContextMenu={(e) => { e.preventDefault(); openMenu(e, [{ label: _t("Hide the quick bar (Settings brings it back)"), icon: "close", run: () => setSetting("hideRail", true) }]); }}>
      <button class="ib" title={_t("Reading mode")} onClick={() => { readMode.value = !readMode.value; }}><Icon n="read" /></button>
      <button class="ib" title={_t("What needs you")} onClick={() => openPanel("dates")}><Icon n="clock" /></button>
      <button class="ib" title={_t("Reports")} onClick={() => openPanel("reports")}><Icon n="table" /></button>
      <button class="ib" title={_t("Photos as a gallery")} onClick={() => openPanel("gallery")}><Icon n="image" /></button>
      <button class="ib" title={_t("Scan")} onClick={() => openPanel("scan")}><Icon n="camera" /></button>
      <button class="ib" title={_t("Write")} onClick={() => openPanel("write")}><Icon n="edit" /></button>
      <button class="ib" title={_t("Study cards (your highlights)")} onClick={() => openPanel("study")}><Icon n="star" /></button>
      <span class="grow" />
      <button class="ib" title={_t("Lock with a PIN")} onClick={() => openPanel("pin")}><Icon n="lock" /></button>
      <button class="ib" title={_t("Help")} onClick={() => openPanel("help")}><Icon n="help" /></button>
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
    if (loud) toast(_t("\"{0}\" is as it is now in Google.", f.name), "ok");
  } catch (e) { if (loud) toast(_t("Google: ") + e.message, "bad"); }
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
      <span class="small"><b>{j.name}</b> {_t("is open in")} {app}{_t(". When it is ready:")}</span>
      <button class="btn small" disabled={busy} onClick={async () => { setBusy(true); try { await addGooglePages(j); } catch (e) { toast(_t("Google: ") + e.message, "bad"); } setBusy(false); }}><Icon n="addpage" size={15} />{j.replace ? _t("Put the page back") : _t("Add these pages")}</button>
      <button class="btn plain small" onClick={() => openBeside(store.value.editLink(j.kind, j.id))}>{_t("Open it")}</button>
      <button class="ib" title={_t("Not now (it stays in Add pages)")} onClick={() => setSetting("googleJobs", (settings.value.googleJobs || []).map(x => x === j ? { ...x, hide: true } : x))}><Icon n="close" size={15} /></button>
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
