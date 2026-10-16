// The book view: the tools at the top, the library at the left, the pages in the middle.
import { useEffect, useState } from "preact/hooks";
import { books, bookId, fileId, pageNo, tool, toolOpts, leftOpen, readMode, zoom, fitWidth, saving, sideTab, undoStack,
  redoStack, store, goHome, openBook, currentBook, settings, toast, narrow, bookMeta, panel } from "../state.js";
import { Icon, fileIcon } from "./icons.jsx";
import { openMenu, ask } from "./dialogs.jsx";
import { Viewer, docState, scrollTo, selectedMark, searchHits, textSel } from "./Viewer.jsx";
import { STAMPS, PEN_COLORS, HL_COLORS, stampSpec } from "./marks.js";
import { undo, redo, allMarks, fileFor, pageOp, getDoc, call, afterEdit } from "../docs.js";
import { uploadFiles, pickFiles, newBook, renameBook, deleteBook, renameFile, deleteFile, moveFileTo, moveFileInBook,
  openPanel, addFromDrive, refresh, setBookColor, toggleBookLock } from "../actions.js";
import { initials, isPaged, fmtDate, rgbToHex, BOOK_COLORS, isPhone } from "../util.js";
import { AccountButton } from "./Home.jsx";

function T({ n, label, on, onClick, disabled, children }) {
  return <button class={"ib" + (on ? " on" : "")} title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon n={n} />{children}</button>;
}

function setTool(t) {
  tool.value = tool.value === t && t !== "select" ? "select" : t;
  selectedMark.value = null;
  textSel.value = null;
}

function TopBar({ book }) {
  const t = tool.value, o = toolOpts.value;
  const s = saving.value;
  const setOpt = (k, v) => { toolOpts.value = { ...toolOpts.value, [k]: v }; };
  const colorMenu = (e) => openMenu(e, [
    { title: "Highlighter" },
    ...HL_COLORS.map(c => ({ label: c === o.color ? "Highlighter (now)" : "Highlighter", swatch: c, run: () => { setOpt("color", c); tool.value = "highlight"; } })),
    { title: "Pen, shapes and lines" },
    ...PEN_COLORS.map(c => ({ label: c === o.pen ? "Pen (now)" : "Pen", swatch: c, run: () => setOpt("pen", c) })),
    { title: "Line width" },
    ...[1, 2, 3, 5].map(w => ({ label: `${w} pt${o.width === w ? " (now)" : ""}`, run: () => setOpt("width", w) })),
  ]);
  const shapeMenu = (e) => openMenu(e, [
    { label: "Box", icon: "rect", run: () => { setOpt("shape", "rect"); tool.value = "shape"; } },
    { label: "Circle", icon: "circle", run: () => { setOpt("shape", "circle"); tool.value = "shape"; } },
    { label: "Line", icon: "line", run: () => { setOpt("shape", "line"); tool.value = "shape"; } },
    { label: "Arrow", icon: "arrow", run: () => { setOpt("shape", "arrow"); tool.value = "shape"; } },
    "-",
    { label: "Tick", icon: "tick", run: () => { tool.value = "tick"; } },
    { label: "Cross", icon: "cross", run: () => { tool.value = "cross"; } },
  ]);
  const stampMenu = (e) => openMenu(e, [
    { title: "Stamp" },
    ...STAMPS.map(st => ({ label: st.date ? "Today's date" : st.text, icon: "stamp", run: () => { setOpt("stamp", st.key); tool.value = "stamp"; } })),
    ...((settings.value.myStamps || []).map(w => ({ label: w, icon: "stamp", run: () => { setOpt("stamp", "custom:" + w); tool.value = "stamp"; } }))),
    { label: "My own words...", icon: "plus", run: async () => {
      const w = await ask("Your stamp", { label: "The words on the stamp", placeholder: "e.g. CHECKED BY AOIFE", ok: "Make the stamp" });
      if (!w) return;
      const { setSetting } = await import("../state.js");
      setSetting("myStamps", [w, ...(settings.value.myStamps || []).filter(x => x !== w)].slice(0, 8));
      setOpt("stamp", "custom:" + w); tool.value = "stamp";
    } },
    "-",
    { label: "Signature", icon: "sign", run: () => { tool.value = "sign"; if (!(settings.value.signatures || []).length) openPanel("signature"); } },
    { label: "New signature...", icon: "rename", run: () => openPanel("signature") },
    { label: "A picture...", icon: "image", run: async () => {
      const [f] = await pickFiles({ accept: "image/png,image/jpeg", multiple: false });
      if (!f) return;
      const bytes = new Uint8Array(await f.arrayBuffer());
      const img = await createImageBitmap(f);
      setOpt("picture", { bytes, w: img.width, h: img.height });
      tool.value = "picture";
      toast("Click on the page to put the picture there.");
    } },
  ]);
  const hlMenu = (e) => { e.preventDefault(); openMenu(e, [
    { label: "Highlight", icon: "highlighter", run: () => { setOpt("hlKind", "Highlight"); tool.value = "highlight"; } },
    { label: "Underline", icon: "line", run: () => { setOpt("hlKind", "Underline"); tool.value = "highlight"; } },
    { label: "Strike out", icon: "x", run: () => { setOpt("hlKind", "StrikeOut"); tool.value = "highlight"; } },
    { label: "Wavy line", icon: "sign", run: () => { setOpt("hlKind", "Squiggly"); tool.value = "highlight"; } },
  ]); };
  const addMenu = (e) => openMenu(e, [
    { label: "Add files...", icon: "upload", run: async () => uploadFiles(book, await pickFiles()) },
    store.value.kind === "drive" && { label: "Add from my Google Drive...", icon: "drive", run: () => addFromDrive(book) },
    "-",
    { label: "Write a new page or document...", icon: "edit", run: () => openPanel("write", { book: book.id }) },
    { label: "Scan pages (camera or photos)...", icon: "camera", run: () => openPanel("scan", { book: book.id }) },
    { label: "A blank page after this one", icon: "addpage", run: () => addBlankPage() },
  ]);
  const curFile = fileFor(fileId.value);
  const saveText = s.error ? "Not saved" : s.n ? "Saving..." : store.value.kind === "demo" ? "Example" : s.last ? "Saved" : "";
  if (narrow.value) {
    // on a phone: the tools in one button, the rest under "more"
    const TOOLS = [["select", "select", "Select and move"], ["pen", "pen", "Pen"], ["highlight", "highlighter", "Highlighter"],
      ["text", "text", "Text"], ["note", "note", "Sticky note"], ["tick", "tick", "Tick"], ["cross", "cross", "Cross"],
      ["edit", "edit", "Change the text"], ["eraser", "eraser", "Eraser"]];
    const cur = TOOLS.find(x => x[0] === t) || (t === "shape" ? ["shape", "shape", "Shapes"] : t === "stamp" ? ["stamp", "stamp", "Stamp"] : t === "sign" ? ["sign", "sign", "Signature"] : TOOLS[0]);
    return (
      <div class="topbar">
        <T n="sidebar" label="Library" on={leftOpen.value} onClick={() => { leftOpen.value = !leftOpen.value; }} />
        <T n="home" label="Home" onClick={goHome} />
        <button class="ib on" title="Tool" onClick={(e) => openMenu(e, [
          ...TOOLS.map(([k, icon, label]) => ({ label, icon, run: () => setTool(k) })),
          { label: "Shapes...", icon: "shape", run: () => shapeMenu({ currentTarget: e.currentTarget, preventDefault() {}, stopPropagation() {} }) },
          { label: "Stamps and signature...", icon: "stamp", run: () => stampMenu({ currentTarget: e.currentTarget, preventDefault() {}, stopPropagation() {} }) },
        ])}><Icon n={cur[1]} /></button>
        <button class="ib" title="Colours" onClick={colorMenu}><span class="swatch" style={{ background: t === "highlight" ? o.color : o.pen }} /></button>
        <T n="undo" label="Undo" onClick={undo} disabled={!undoStack.value.length} />
        <span class="grow" />
        <T n="search" label="Find" onClick={() => openPanel("find")} />
        <T n="reports" label="Reports" onClick={() => openPanel("reports")} />
        <button class="ib" title="More" onClick={(e) => openMenu(e, [
          { label: readMode.value ? "Leave reading mode" : "Reading mode", icon: "read", run: () => { readMode.value = !readMode.value; } },
          { label: "Redo", icon: "redo", run: redo },
          { label: "Add files, write, scan...", icon: "addpage", run: () => addMenu(e) },
          { label: "What needs you", icon: "clock", run: () => openPanel("dates") },
          { label: "Photos as a gallery", icon: "image", run: () => openPanel("gallery") },
          { label: "Print", icon: "print", run: () => openPanel("print") },
          "-",
          { label: "Settings", icon: "settings", run: () => openPanel("settings") },
          { label: "Help", icon: "help", run: () => openPanel("help") },
        ])}><Icon n="more" /></button>
      </div>
    );
  }
  return (
    <div class="topbar">
      <button class="brand" onClick={goHome} title="Home"><img src={import.meta.env.BASE_URL + "icon.png"} alt="" /><b>Bind<span>Lens</span></b></button>
      <T n="sidebar" label="Library (show / hide)" on={leftOpen.value} onClick={() => { leftOpen.value = !leftOpen.value; }} />
      <T n="home" label="Home" onClick={goHome} />
      <div class="tools">
        <T n="select" label="Select and move (V)" on={t === "select"} onClick={() => setTool("select")} />
        <T n="pen" label="Pen (P)" on={t === "pen"} onClick={() => setTool("pen")} />
        <button class={"ib" + (t === "highlight" ? " on" : "")} title="Highlighter (H) - right-click: underline, strike out" onClick={() => setTool("highlight")} onContextMenu={hlMenu}><Icon n="highlighter" /></button>
        <T n="text" label="Text (T)" on={t === "text"} onClick={() => setTool("text")} />
        <T n="note" label="Sticky note (N)" on={t === "note"} onClick={() => setTool("note")} />
        <button class={"ib" + (["shape", "tick", "cross"].includes(t) ? " on" : "")} title="Shapes, tick and cross" onClick={shapeMenu}><Icon n={t === "tick" ? "tick" : t === "cross" ? "cross" : o.shape === "circle" ? "circle" : o.shape === "line" ? "line" : o.shape === "arrow" ? "arrow" : "shape"} /></button>
        <button class={"ib" + (["stamp", "sign", "picture"].includes(t) ? " on" : "")} title="Stamps, signature, picture" onClick={stampMenu}><Icon n={t === "sign" ? "sign" : "stamp"} /></button>
        <T n="edit" label="Change the text of the PDF" on={t === "edit"} onClick={() => setTool("edit")} />
        <T n="eraser" label="Eraser: click a mark to take it off (E)" on={t === "eraser"} onClick={() => setTool("eraser")} />
        <button class="ib" title="Colours" onClick={colorMenu}><span class="swatch" style={{ background: t === "highlight" ? o.color : o.pen }} /></button>
        <span class="sep" />
        <T n="undo" label="Undo (Ctrl+Z)" onClick={undo} disabled={!undoStack.value.length} />
        <T n="redo" label="Redo (Ctrl+Y)" onClick={redo} disabled={!redoStack.value.length} />
        <button class="ib" title="Add: files, a written page, a scan" onClick={addMenu}><Icon n="addpage" /></button>
      </div>
      <div class="findbox" onClick={() => openPanel("find")} role="button" tabIndex={0}><Icon n="search" size={17} /><span class="ellipsis">Find a document or a word</span><kbd>Ctrl+K</kbd></div>
      <button class={"btn " + (readMode.value ? "" : "ghost") + " small hide-phone"} onClick={() => { readMode.value = !readMode.value; }}><Icon n="read" size={17} />Read</button>
      <button class="btn small" onClick={() => openPanel("reports")}><Icon n="reports" size={17} /><span class="hide-phone">Reports</span></button>
      <span class={"savestate" + (s.error ? " bad" : "")} title={s.error || (store.value.kind === "demo" ? "The example library: nothing is saved" : "Saved in your Google Drive")}>{saveText}</span>
      <T n="print" label="Print (Ctrl+P)" onClick={() => openPanel("print")} />
      <T n="full" label="Full screen" onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }} />
      <AccountButton />
      {void curFile}
    </div>
  );
}

async function addBlankPage() {
  const f = fileFor(fileId.value);
  if (!f || f.kind !== "pdf") { toast("Open a PDF page first."); return; }
  const u8 = await call("htmlToPdf", "<p>&nbsp;</p>", "");
  await pageOp(f, "insertPages", pageNo.value + 1, u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
  toast("A blank page was added.");
}

function Rail({ book }) {
  return (
    <div class="rail">
      {books.value.map(b => (
        <button key={b.id} class={"tab" + (b.id === book.id ? " on" : "")} style={{ background: b.color }} title={b.name}
          onClick={() => openBook(b.id)}>{initials(b.name)}</button>
      ))}
      <button class="ib" title="New book" onClick={() => newBook().then(b => b && openBook(b.id))}><Icon n="plus" /></button>
    </div>
  );
}

function FilesList({ book }) {
  const cur = fileId.value;
  return (
    <div class="list">
      {!book.files.length && <p class="small muted" style={{ padding: 8 }}>No files yet.</p>}
      {book.files.map(f => {
        const st = docState.value[f.id];
        return (
          <button key={f.id} class={"filerow" + (f.id === cur ? " on" : "")}
            onClick={() => { fileId.value = f.id; pageNo.value = 0; scrollTo.value = { fileId: f.id, page: 0 }; if (isPhone()) leftOpen.value = false; }}
            onContextMenu={(e) => { e.preventDefault(); fileMenu(e, book, f); }}>
            <span class="ico"><Icon n={fileIcon(f.kind)} size={18} /></span>
            <span class="grow ellipsis">{f.name}</span>
            <span class="n">{st?.pages ? st.pages.length : ""}</span>
            <span class="ib" style={{ width: 26, height: 26 }} onClick={(e) => { e.stopPropagation(); fileMenu(e, book, f); }}><Icon n="more" size={16} /></span>
          </button>
        );
      })}
    </div>
  );
}

function fileMenu(e, book, f) {
  const others = books.value.filter(b => b.id !== book.id);
  openMenu(e, [
    { title: f.name },
    { label: "Rename", icon: "rename", run: () => renameFile(book, f) },
    { label: "Move up", icon: "up", run: () => moveFileInBook(book, f, -1) },
    { label: "Move down", icon: "down", run: () => moveFileInBook(book, f, 1) },
    others.length && { title: "Move to another book" },
    ...others.slice(0, 12).map(b => ({ label: b.name, swatch: b.color, run: () => moveFileTo(book, f, b) })),
    "-",
    { label: "Download a copy", icon: "download", run: async () => { const buf = await store.value.read(f); const { download } = await import("../util.js"); download(buf, f.name, f.mime); } },
    store.value.kind === "drive" && { label: "Open in Google Drive", icon: "drive", run: () => window.open(store.value.webLink(f), "_blank") },
    f.kind === "image" && { label: "Open the photos as a gallery", icon: "image", run: () => openPanel("gallery", { fileId: f.id }) },
    f.kind === "pdf" && { label: "Read the words of its scanned pages", icon: "type", run: async () => {
      const { readScannedDoc } = await import("../ocr.js");
      toast("Reading the scanned pages (it takes a moment)...");
      const n = await readScannedDoc(f);
      toast(n ? `${n} words read in "${f.name}".` : `"${f.name}" has no scanned pages without words.`, n ? "ok" : "");
    } },
    "-",
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

// read aloud: the browser's own voice reads the page, then goes on to the next one
let speaking = null;
function stopReading() { speaking = null; try { speechSynthesis.cancel(); } catch (e) {} }
async function readAloud(book, setOn) {
  if (speaking) { stopReading(); setOn(false); return; }
  if (!("speechSynthesis" in window)) { toast("This browser cannot read aloud."); return; }
  const token = {};
  speaking = token;
  setOn(true);
  const { wordsOf } = await import("../docs.js");
  while (speaking === token) {
    const f = fileFor(fileId.value);
    if (!f) break;
    let text = "";
    try { text = ((await wordsOf(f)).pages[pageNo.value] || "").replace(/\s+/g, " ").trim(); } catch (e) {}
    if (text) {
      await new Promise((res) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = document.documentElement.lang || "en";
        u.onend = res; u.onerror = res;
        speechSynthesis.speak(u);
      });
    }
    if (speaking !== token) break;
    // the next page of the book
    const files = book.files.filter(x => isPaged(x.kind));
    const n = docState.value[f.id]?.pages?.length || 1;
    if (pageNo.value + 1 < n) pageNo.value = pageNo.value + 1;
    else {
      const i = files.findIndex(x => x.id === f.id);
      if (i < 0 || i + 1 >= files.length) break;
      fileId.value = files[i + 1].id; pageNo.value = 0;
    }
    scrollTo.value = { fileId: fileId.value, page: pageNo.value };
  }
  if (speaking === token) speaking = null;
  setOn(false);
}

function ReadingSide({ book }) {
  const [aloud, setAloud] = useState(false);
  useEffect(() => () => stopReading(), []);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  const total = book.files.reduce((a, f) => a + (docState.value[f.id]?.pages?.length || (isPaged(f.kind) ? 1 : 0)), 0);
  let before = 0;
  for (const f of book.files) { if (f.id === fileId.value) { before += pageNo.value + 1; break; } before += docState.value[f.id]?.pages?.length || 1; }
  const pct = total ? Math.round(before / total * 100) : 0;
  return (
    <div class="side">
      <div class="contents">
        <div class="tiny muted" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>Contents</div>
        <h3 style={{ font: "italic 400 26px Georgia,serif", margin: "4px 0 10px" }}>{book.name}</h3>
        <div class="row"><span class="big">{book.files.length}</span><span class="small muted">documents · {total} pages</span></div>
        <div class="bar"><i style={{ width: pct + "%" }} /></div>
        <div class="tiny muted">Page {before} of {total} · {pct}% of the book</div>
        <button class={"btn small " + (aloud ? "" : "soft")} style={{ marginTop: 10 }} onClick={() => readAloud(book, setAloud)}>
          <Icon n={aloud ? "pause" : "play"} size={16} />{aloud ? "Stop reading" : "Read aloud"}</button>
      </div>
      <FilesList book={book} />
      <div style={{ padding: 14 }}>
        <div class="clockcard">
          <div class="m">{now.toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toUpperCase()}</div>
          <div class="d">{now.getDate()}</div>
          <div class="small muted">{now.toLocaleDateString("en-GB", { weekday: "long" })}</div>
          <div class="t">{now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
      </div>
    </div>
  );
}

function Side({ book }) {
  if (readMode.value) return <ReadingSide book={book} />;
  const tab = sideTab.value;
  const bookMenu = (e, b) => openMenu(e, [
    { title: b.name },
    { label: "Rename", icon: "rename", run: () => renameBook(b) },
    { label: bookMeta(b.id).locked ? "Open it without the PIN" : "Lock it with the PIN", icon: "lock", run: () => toggleBookLock(b) },
    { title: "Colour" },
    ...BOOK_COLORS.slice(0, 8).map(c => ({ label: "", swatch: c, run: () => setBookColor(b, c) })),
    "-",
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
            <span class="chip" style={{ background: b.color }}>{initials(b.name)}</span>
            <span class="grow ellipsis">{b.name}</span><span class="n">{b.files.length}</span>
          </button>
        ))}
      </div>
      <div class="subtabs">
        <button class={tab === "files" ? "on" : ""} onClick={() => { sideTab.value = "files"; }}>Files</button>
        <button class={tab === "marks" ? "on" : ""} onClick={() => { sideTab.value = "marks"; }}>Marks</button>
        <button class={tab === "search" ? "on" : ""} onClick={() => { sideTab.value = "search"; }}>Search</button>
      </div>
      {tab === "files" && <FilesList book={book} />}
      {tab === "marks" && <MarksList book={book} />}
      {tab === "search" && <SearchList book={book} />}
      <div class="foot">
        <button class="btn" onClick={async () => uploadFiles(book, await pickFiles(), { open: false })}><Icon n="plus" size={17} />Add files</button>
      </div>
    </div>
  );
}

function PageBar({ book }) {
  const files = book.files;
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
        const map = { v: "select", p: "pen", h: "highlight", t: "text", n: "note", e: "eraser" };
        if (map[e.key]) setTool(map[e.key]);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoom.value = Math.min(4, zoom.value * 1.15); }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") { e.preventDefault(); zoom.value = Math.max(0.3, zoom.value / 1.15); }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") { e.preventDefault(); zoom.value = 1; fitWidth.value = true; }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const curFile = fileFor(fileId.value);
  const pagesMenu = (e) => {
    const f = curFile;
    const pdf = f && f.kind === "pdf" && docState.value[f.id]?.status === "ready";
    openMenu(e, [
      { title: `Page ${pageNo.value + 1} of ${f ? f.name : ""}` },
      pdf && { label: "Turn it right", icon: "rotate", run: () => pageOp(f, "rotatePage", pageNo.value, 90) },
      pdf && { label: "Turn it left", icon: "rotate", run: () => pageOp(f, "rotatePage", pageNo.value, -90) },
      pdf && { label: "Move it up", icon: "up", disabled: pageNo.value === 0, run: () => pageOp(f, "movePage", pageNo.value, pageNo.value - 1).then(() => { pageNo.value--; }) },
      pdf && { label: "Move it down", icon: "down", run: () => pageOp(f, "movePage", pageNo.value, pageNo.value + 1).then(() => { pageNo.value++; }) },
      pdf && { label: "A blank page after it", icon: "addpage", run: addBlankPage },
      pdf && { label: "Write a page after it...", icon: "edit", run: () => openPanel("write", { book: book.id, into: f.id, at: pageNo.value + 1 }) },
      pdf && { label: "Scan pages after it...", icon: "camera", run: () => openPanel("scan", { book: book.id, into: f.id, at: pageNo.value + 1 }) },
      pdf && { label: "Read the words of this page (a scan)", icon: "type", run: async () => {
        toast("Reading the words of the page...");
        const { readScannedPage } = await import("../ocr.js");
        const n = await readScannedPage(f, pageNo.value);
        toast(n ? `${n} words read: you can find, copy and change them now.` : "This page has its words already, or none were found.", n ? "ok" : "");
      } },
      pdf && "-",
      pdf && (docState.value[f.id]?.pages?.length || 1) > 1 && { label: "Take this page out", icon: "trash", danger: true, run: async () => {
        const { confirm } = await import("./dialogs.jsx");
        if (await confirm("Take this page out?", "You can put it back with Undo (Ctrl+Z).", { ok: "Take it out", danger: true })) await pageOp(f, "deletePage", pageNo.value);
      } },
      { label: "All pages (grid)", icon: "grid", run: () => openPanel("pages", { fileId: f?.id }) },
    ]);
  };
  return (
    <div class="pagebar">
      <button class="ib" title="Previous page" onClick={() => go(-1)}><Icon n="left" /></button>
      <span class="pn">{cur || 1} / {total}</span>
      <button class="ib" title="Next page" onClick={() => go(1)}><Icon n="right" /></button>
      <span class="sep" />
      <button class="ib" title="Smaller" onClick={() => { zoom.value = Math.max(0.3, zoom.value / 1.15); }}><Icon n="zoomout" /></button>
      <span class="small" style={{ minWidth: 42, textAlign: "center" }}>{Math.round(zoom.value * 100)}%</span>
      <button class="ib" title="Bigger" onClick={() => { zoom.value = Math.min(4, zoom.value * 1.15); }}><Icon n="zoomin" /></button>
      <button class={"ib" + (fitWidth.value && zoom.value === 1 ? " on" : "")} title="Fit the width" onClick={() => { fitWidth.value = true; zoom.value = 1; }}><Icon n="fit" /></button>
      <button class="ib" title="Pages: turn, move, add, take out" onClick={pagesMenu}><Icon n="grid" /></button>
    </div>
  );
}

function RRail() {
  return (
    <div class="rrail">
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

export function BookView() {
  const book = currentBook.value;
  useEffect(() => { if (!book) goHome(); }, [book]);
  useEffect(() => { if (isPhone()) leftOpen.value = false; }, []);
  if (!book) return null;
  return (
    <div class={"book-view" + (readMode.value ? " reading" : "")} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <TopBar book={book} />
      <div class="main">
        <Rail book={book} />
        {(leftOpen.value || readMode.value) && <Side book={book} />}
        <div style={{ flex: 1, display: "flex", minWidth: 0, position: "relative" }}>
          <Viewer book={book} />
          {book.files.length > 0 && <PageBar book={book} />}
        </div>
        <RRail />
      </div>
    </div>
  );
}

export { fmtDate };
