// The ribbon of a book, as in Word: tabs (Read, Mark, Edit, Fill & Sign, Pages, Review), each with its tools as a
// picture over a word; on the right the options of the tool in use (colours, widths, kinds) and Undo / Redo.
import { tool, toolOpts, ribbonTab, setTab, readMode, fileId, pageNo, fitWidth, fitPage, zoom, undoStack, redoStack,
  settings, setSetting, toast, store, commentsOpen, leftOpen, sideTab, aloud, currentBook, statusOf, STATUSES, setStatus, statusColor } from "../state.js";
import { Icon } from "./icons.jsx";
import { openMenu, ask, confirm } from "./dialogs.jsx";
import { toolLock, selectedMark, docState, scrollTo, PAPERS } from "./Viewer.jsx";
import { STAMPS, PEN_COLORS, HL_COLORS, stampSpec } from "./marks.js";
import { undo, redo, fileFor, pageOp, getDoc } from "../docs.js";
import { openPanel, pickFiles } from "../actions.js";
import { setTool, toolMenus } from "./Tools.jsx";
import { contentsOpen } from "./Reading.jsx";
import { toggleAloud, canSpeak } from "./Aloud.jsx";
import * as FT from "../filetools.js";
import { _t, _tv } from "../i18n.js";

export const TABS = [["read", _t("Read")], ["mark", _t("Mark@@tab")], ["edit", _t("Edit")], ["sign", _t("Fill & Sign")], ["pages", _t("Pages")], ["review", _t("Review")]];
// the tools of each tab: going to another tab leaves a tool that is not there (back to Select)
const TAB_TOOLS = { read: [], mark: ["select", "highlight", "pen", "text", "note", "shape", "tick", "cross", "stamp", "eraser"],
  edit: ["edit", "whitebox", "whitebrush", "redact", "crop", "picture"], sign: ["sign", "text", "tick", "cross", "date", "initials"], pages: [], review: ["comment"] };
const TEXT_COLORS = ["#1E1C2B", "#C2337A", "#1C7ED6", "#2B8A3E", "#E03131", "#E8772E"];
const setOpt = (k, v) => { toolOpts.value = { ...toolOpts.value, [k]: v }; };

// one tool: its picture; pointing at it says its name at once (with its key and what it does)
function RB({ icon, label, tip, on, onClick, lock, disabled, menu, wide, children }) {
  const more = tip && tip !== label ? tip.replace(label, "").replace(/^\s*[-·(]?\s*/, "") : "";
  return (
    <button class={"rb" + (on ? " on" : "") + (on && lock && toolLock.value ? " locked" : "") + (wide ? " wide" : "") + (menu ? " hasmenu" : "")} disabled={disabled}
      aria-label={tip || label} aria-pressed={on ? "true" : undefined}
      onClick={onClick}
      onDblClick={lock ? () => { tool.value = lock; toolLock.value = true; toast(_t("It stays on until you choose Select.")); } : undefined}>
      {children || <Icon n={icon} size={20} />}
      {menu && <Icon n="down" size={9} />}
      <span class="rbtip"><b>{label}</b>{more ? <span>{more.replace(/\)$/, "").replace(/^\(/, "")}</span> : null}</span>
    </button>
  );
}

const T = (t, icon, label, key, lock = true) => ({ t, icon, label, key, lock });

function curPdf() {
  const f = fileFor(fileId.value);
  return f && f.kind === "pdf" && !docState.value[f.id]?.readOnly ? f : null;
}
async function onPdf(fn) {
  const f = curPdf();
  if (!f) { toast(_t("Open a PDF page first (a Word or Excel file: right-click it, Make a PDF copy).")); return; }
  await fn(f);
}
const toPage = (f, p) => { fileId.value = f.id; pageNo.value = p; setTimeout(() => { scrollTo.value = { fileId: f.id, page: p }; }, 120); };

export function Ribbon({ book }) {
  const tab = ribbonTab.value;
  const t = tool.value;
  const m = toolMenus(book);
  const tl = (x) => () => { setTool(x.t); if (x.t === "edit" && tool.value === "edit") toast(_t("Click the line of text to change.")); };
  const toolBtn = (x) => <RB key={x.t} icon={x.icon} label={x.label} tip={`${x.label} ${x.key ? x.key + " · " : ""}${x.lock ? _t("double-click: it stays on") : ""}`.trim()} on={t === x.t} onClick={tl(x)} lock={x.lock ? x.t : null} />;
  let tools = null;
  if (tab === "read") tools = <>
    <RB icon="read" label={readMode.value ? _t("Leave reading") : _t("Reading mode")} on={readMode.value} onClick={() => { readMode.value = !readMode.value; }} tip={_t("A calm view: the page, the contents, the clock (F6)")} />
    {canSpeak && <RB icon="speaker" label={aloud.value.on ? _t("Stop reading") : _t("Read aloud")} on={aloud.value.on} onClick={toggleAloud} tip={_t("The computer reads the book to you, from this page (Ctrl+U)")} />}
    <RB icon="list" label={_t("Contents")} on={readMode.value && contentsOpen.value} onClick={() => { if (!readMode.value) { readMode.value = true; contentsOpen.value = true; } else contentsOpen.value = !contentsOpen.value; }} tip={_t("The contents of the book and its parts")} />
    <span class="rsep" />
    <RB icon="fit" label={_t("Fit width")} on={fitWidth.value && zoom.value === 1 && !fitPage.value} onClick={() => { fitWidth.value = true; fitPage.value = false; zoom.value = 1; }} />
    <RB icon="expand" label={_t("Whole page")} on={fitPage.value} onClick={() => { fitWidth.value = true; fitPage.value = !fitPage.value; zoom.value = 1; }} />
    <RB icon="grid" label={_t("All pages")} onClick={() => openPanel("pages", { fileId: fileId.value })} tip={_t("Every page as a small picture")} />
    <span class="rsep" />
    <RB icon="search" label={_t("Find in book")} onClick={() => { leftOpen.value = true; sideTab.value = "search"; }} />
    <RB icon="star" label={_t("Study cards")} onClick={() => openPanel("study")} tip={_t("Your highlights as cards to review, and a summary sheet (Ctrl+B)")} />
    <RB icon="moon" label={_t("Night pages")} on={!!settings.value.night} onClick={() => setSetting("night", !settings.value.night)} tip={_t("Dark pages for reading at night")} />
  </>;
  if (tab === "mark") tools = <>
    {[T("select", "select", _t("Select"), "V", false), T("highlight", "highlighter", _t("Highlight"), "H"), T("pen", "pen", _t("Pen"), "P"), T("text", "text", _t("Text box"), "T"), T("note", "note", _t("Sticky note"), "N")].map(toolBtn)}
    <RB icon={toolOpts.value.shape === "circle" ? "circle" : toolOpts.value.shape === "line" ? "line" : toolOpts.value.shape === "arrow" ? "arrow" : "shape"} label={_t("Shapes")} on={t === "shape"} onClick={() => { setTool("shape"); }} lock="shape" tip={_t("A box, circle, line or arrow - choose on the right")} />
    {[T("tick", "tick", _t("Tick"), ""), T("cross", "cross", _t("Cross"), "")].map(toolBtn)}
    <RB icon="stamp" label={_t("Stamp")} on={t === "stamp"} onClick={() => setTool("stamp")} lock="stamp" tip={_t("APPROVED, PAID, today's date, your own words - choose on the right")} />
    {toolBtn(T("eraser", "eraser", _t("Eraser"), "E", false))}
    <span class="rsep" />
    <FavPens />
  </>;
  if (tab === "edit") tools = <>
    {toolBtn(T("edit", "textedit", _t("Change text"), "Ctrl+E", false))}
    <RB icon="word" label={_t("Edit like Word")} onClick={(e) => editPageLikeWord(e, book)} tip={_t("Edit this page as a document: in Google Docs, or in BindLens")} menu />
    <span class="rsep" />
    {[T("whitebox", "rect", _t("White box"), ""), T("whitebrush", "pen", _t("White brush"), ""), T("redact", "eraser", _t("Erase for good"), "")].map(toolBtn)}
    {toolBtn(T("crop", "fit", _t("Crop page"), "", false))}
    <RB icon="image" label={_t("Picture")} on={t === "picture"} onClick={async () => {
      const [f] = await pickFiles({ accept: "image/png,image/jpeg", multiple: false });
      if (!f) return;
      const bytes = new Uint8Array(await f.arrayBuffer());
      const img = await createImageBitmap(f);
      setOpt("picture", { bytes, w: img.width, h: img.height });
      tool.value = "picture";
      toast(_t("Click on the page to put the picture there."));
    }} tip={_t("A picture or a logo on the page")} />
    <span class="rsep" />
    <RB icon="edit" label={_t("Write a page")} onClick={() => { const f = curPdf(); openPanel("write", { book: book.id, into: f?.id, at: f ? pageNo.value + 1 : undefined }); }} tip={_t("A new page written in BindLens, after this one")} />
    <RB icon="type" label={_t("Watermark")} onClick={() => onPdf(FT.watermark)} />
    <RB icon="eye" label={_t("Read scan (OCR)")} onClick={() => onPdf(async (f) => { toast(_t("Reading the words of the page...")); const { readScannedPage } = await import("../ocr.js"); const n = await readScannedPage(f, pageNo.value); toast(n ? _t("{0} words read: you can find, copy and change them now.", n) : _t("This page has its words already, or none were found."), n ? "ok" : ""); })} tip={_t("A scanned page gets its words: find, copy and change them")} />
  </>;
  if (tab === "sign") tools = <>
    <RB icon="form" label={_t("Fill in")} onClick={() => { tool.value = "select"; const f = fileFor(fileId.value); toast(f && docState.value[f.id]?.form ? _t("Click a box of the form and type. Ticks and lists work too.") : _t("This document has no form boxes: use Text, Tick and Date to fill it in.")); }} tip={_t("Type in the boxes of a PDF form")} />
    {toolBtn(T("sign", "sign", _t("Signature"), ""))}
    <RB icon="rename" label={_t("New signature")} onClick={() => openPanel("signature")} />
    <span class="rsep" />
    {[T("text", "text", _t("Text"), "T"), T("tick", "tick", _t("Tick"), ""), T("cross", "cross", _t("Cross"), ""), T("date", "calendar", _t("Date"), ""), T("initials", "at", _t("Initials"), "")].map(toolBtn)}
  </>;
  if (tab === "pages") tools = <>
    <RB icon="addpage" label={_t("Add pages")} onClick={() => openPanel("addpages", { book: book.id })} tip={_t("Blank, lined or squared; from a file; a scan; Google Docs")} />
    <RB icon="rotate" label={_t("Turn right")} onClick={() => onPdf(f => pageOp(f, "rotatePage", pageNo.value, 90))} />
    <RB icon="undo" label={_t("Turn left")} onClick={() => onPdf(f => pageOp(f, "rotatePage", pageNo.value, -90))} />
    <RB icon="up" label={_t("Move up")} onClick={() => onPdf(async f => { if (pageNo.value === 0) return; await pageOp(f, "movePage", pageNo.value, pageNo.value - 1); toPage(f, pageNo.value - 1); })} />
    <RB icon="down" label={_t("Move down")} onClick={() => onPdf(async f => { const n = docState.value[f.id]?.pages?.length || 1; if (pageNo.value >= n - 1) return; await pageOp(f, "movePage", pageNo.value, pageNo.value + 1); toPage(f, pageNo.value + 1); })} />
    <RB icon="trash" label={_t("Take out")} onClick={() => onPdf(async f => { if ((docState.value[f.id]?.pages?.length || 1) < 2) { toast(_t("It is the only page.")); return; } if (await confirm(_t("Take this page out?"), _t("Undo (Ctrl+Z) puts it back, and so does Deleted pages."), { ok: _t("Take it out"), danger: true })) await FT.takePageOut(f, pageNo.value); })} />
    <span class="rsep" />
    <RB icon="grid" label={_t("All pages")} onClick={() => openPanel("pages", { fileId: fileId.value })} tip={_t("Every page as a small picture: turn, move, take out")} />
    <RB icon="copy" label={_t("Pages as PDF")} onClick={() => onPdf(f => FT.savePagesAsPdf(f, pageNo.value))} tip={_t("Some pages as a new PDF")} />
    <RB icon="grid" label={_t("Split")} onClick={() => onPdf(FT.splitFile)} tip={_t("One PDF for each page")} />
    <RB icon="download" label={_t("Smaller")} onClick={() => onPdf(FT.makeSmaller)} tip={_t("Make the file smaller (pictures, scans)")} />
    <RB icon="undo" label={_t("Deleted pages")} onClick={() => onPdf(f => openPanel("deleted", { fileId: f.id }))} tip={_t("Put a page you took out back")} />
    <RB icon="book" label={_t("Book as PDF")} onClick={() => FT.wholeBookAsPdf(book)} tip={_t("The whole book as one PDF")} />
  </>;
  if (tab === "review") tools = <>
    {toolBtn(T("comment", "comment", _t("Comment"), "C"))}
    <RB icon="list" label={_t("Comments")} on={!!commentsOpen.value} onClick={() => { commentsOpen.value = commentsOpen.value ? null : {}; }} tip={_t("Every comment of the book, with the replies")} />
    <RB icon="task" label={_t("Tasks")} onClick={() => openPanel("tasks", { about: true })} tip={_t("A task about this page, for you or a colleague")} />
    <RB icon="check" label={_t("Status")} menu onClick={(e) => { const f = fileFor(fileId.value); if (!f) return; const cur = statusOf(f.id); openMenu(e, [{ title: _t("Status of ") + f.name }, ...STATUSES.map(([n, c]) => ({ label: (cur === n ? "✓ " : "") + _tv(n), color: c, run: () => setStatus(f.id, n) })), "-", { label: _t("No status"), run: () => setStatus(f.id, "") }]); }} tip={_t("Pending, Checked, Signed, Done, Urgent, Waiting")}>
      {statusOf(fileId.value) ? <span class="rbdot" style={{ background: statusColor(statusOf(fileId.value)) }} /> : <Icon n="check" size={20} />}
    </RB>
    <span class="rsep" />
    <RB icon="share" label={_t("Share")} onClick={() => openPanel("share", { id: book.id })} tip={_t("Share this book with a colleague")} />
    <RB icon="mail" label={_t("Email")} onClick={() => { const f = fileFor(fileId.value); if (f) FT.sendFile(f); }} tip={_t("Send this document by email")} />
    <RB icon="copy" label={_t("Compare")} menu onClick={(e) => { const f = fileFor(fileId.value); if (!f) return; openMenu(e, [{ title: _t("Compare {0} with", f.name) }, ...book.files.filter(x => x.id !== f.id && x.kind !== "image").map(x => ({ label: x.name, run: () => openPanel("reports", { compare: { a: f.id, b: x.id } }) }))]); }} />
    <RB icon="clock" label={_t("Versions")} onClick={() => { const f = fileFor(fileId.value); if (f) openPanel("versions", { fileId: f.id }); }} tip={_t("Earlier versions of this document")} />
    <RB icon="print" label={_t("Print")} onClick={() => openPanel("print")} tip={_t("Print (Ctrl+P)")} />
  </>;
  return (
    <div class="ribbon" role="toolbar" aria-label={_t("Tools")}>
      <div class="rtabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} class={tab === k ? "on" : ""} onClick={() => { setTab(k); if (!TAB_TOOLS[k].includes(tool.value)) { tool.value = "select"; toolLock.value = false; } }}>{l}</button>)}
      </div>
      <div class="rtools">{tools}</div>
      <Options book={book} m={m} />
      <div class="rundo">
        <button class="ib" title={_t("Undo (Ctrl+Z)")} aria-label={_t("Undo")} onClick={undo} disabled={!undoStack.value.length}><Icon n="undo" /></button>
        <button class="ib" title={_t("Redo (Ctrl+Y)")} aria-label={_t("Redo")} onClick={redo} disabled={!redoStack.value.length}><Icon n="redo" /></button>
      </div>
    </div>
  );
}

// three favourite pens, one click each (right-click one: keep the pen as it is now there)
const FAV_DEFAULT = [{ tool: "pen", color: "#E03131", width: 1 }, { tool: "pen", color: "#1C7ED6", width: 2 }, { tool: "highlight", color: "#FFD43B" }];
function FavPens() {
  const favs = settings.value.favPens || FAV_DEFAULT;
  const o = toolOpts.value, t = tool.value;
  const use = (f) => {
    if (f.tool === "pen") toolOpts.value = { ...toolOpts.value, pen: f.color, width: f.width || 2 };
    else toolOpts.value = { ...toolOpts.value, color: f.color, hlKind: "Highlight" };
    tool.value = f.tool; toolLock.value = true;
  };
  const isOn = (f) => t === f.tool && (f.tool === "pen" ? o.pen === f.color && (o.width || 2) === (f.width || 2) : o.color === f.color);
  return favs.map((f, i) => (
    <button key={i} class={"rb fav" + (isOn(f) ? " on" : "")} aria-label={_t("A favourite pen")}
      onClick={() => use(f)}
      onContextMenu={(e) => { e.preventDefault(); openMenu(e, [{ title: _t("Favourite {0}", i + 1) }, { label: _t("Keep the pen or highlighter as it is now here"), icon: "star", run: () => { const n = [...favs]; n[i] = t === "highlight" ? { tool: "highlight", color: o.color } : { tool: "pen", color: o.pen, width: o.width || 2 }; setSetting("favPens", n); toast(_t("Kept as favourite {0}.", i + 1), "ok"); } }, { label: _t("Back to the first ones"), icon: "undo", run: () => setSetting("favPens", FAV_DEFAULT) }]); }}>
      <Icon n={f.tool === "pen" ? "pen" : "highlighter"} size={20} style={{ color: f.color }} />
      <i class="favdot" style={{ background: f.color, height: f.tool === "pen" ? Math.max(2, (f.width || 2) * 1.2) + "px" : "5px" }} />
      <span class="rbtip"><b>{f.tool === "pen" ? _t("Favourite pen {0}", i + 1) : _t("Favourite highlighter {0}", i + 1)}</b><span>{_t("Right-click: keep the one in use here")}</span></span>
    </button>
  ));
}

// the options of the tool in use, in sight (no menus): colours, widths, kinds, sizes
function Options({ book, m }) {
  const t = tool.value, o = toolOpts.value;
  const Sw = ({ c, on, onClick, title }) => <button class={"rsw" + (on ? " on" : "")} style={{ background: c }} title={title || c} aria-label={title || c} onClick={onClick} />;
  const Seg = ({ items, cur, set }) => <div class="rseg">{items.map(([k, l, ic]) => <button key={k} class={cur === k ? "on" : ""} onClick={() => set(k)} title={l}>{ic ? <Icon n={ic} size={15} /> : l}</button>)}</div>;
  const widths = <div class="rseg widths">{[1, 2, 3, 5].map(w => <button key={w} class={(o.width || 2) === w ? "on" : ""} onClick={() => setOpt("width", w)} title={w + _t(" pt")}><i style={{ height: Math.max(1.5, w * 1.1) + "px" }} /></button>)}</div>;
  const pens = <div class="rsws">{PEN_COLORS.slice(0, 7).map(c => <Sw key={c} c={c} on={o.pen === c} onClick={() => setOpt("pen", c)} />)}</div>;
  let body = null, label = "";
  if (t === "highlight") {
    label = _t("Highlighter");
    body = <><Seg items={[["Highlight", _t("Highlight"), "highlighter"], ["Underline", _t("Underline"), "line"], ["StrikeOut", _t("Strike out"), "x"], ["Squiggly", _t("Wavy line"), "sign"]]} cur={o.hlKind || "Highlight"} set={(k) => setOpt("hlKind", k)} />
      <div class="rsws">{HL_COLORS.map(c => <Sw key={c} c={c} on={o.color === c} onClick={() => setOpt("color", c)} />)}</div></>;
  } else if (t === "pen") { label = _t("Pen"); body = <>{pens}{widths}</>; }
  else if (t === "shape") {
    label = _t("Shape");
    body = <><Seg items={[["rect", _t("Box"), "rect"], ["circle", _t("Circle"), "circle"], ["line", _t("Line"), "line"], ["arrow", _t("Arrow"), "arrow"]]} cur={o.shape || "rect"} set={(k) => setOpt("shape", k)} />
      {pens}{widths}<button class={"rchip" + (o.fill ? " on" : "")} onClick={() => setOpt("fill", !o.fill)} title={_t("Fill boxes and circles with a light colour")}>{_t("Fill")}</button></>;
  } else if (t === "text" || t === "date" || t === "initials") {
    label = t === "text" ? _t("Text box") : t === "date" ? _t("Date") : _t("Initials");
    body = <><div class="rsws">{TEXT_COLORS.map(c => <Sw key={c} c={c} on={(o.textColor || "#1E1C2B") === c} onClick={() => setOpt("textColor", c)} />)}</div>
      <select class="rsel" value={o.textSize || 12} onChange={(e) => setOpt("textSize", Number(e.target.value))} title={_t("Size")}>{[8, 9, 10, 11, 12, 14, 16, 18, 24, 32].map(z => <option key={z} value={z}>{z} {_t("pt")}</option>)}</select>
      {t === "text" && <select class="rsel" value={o.textStyle || "plain"} onChange={(e) => setOpt("textStyle", e.target.value)} title={_t("Style")}>{[["plain", _t("Plain")], ["outline", _t("Outline")], ["label", _t("Label")], ["solid", _t("Solid")], ["dashed", _t("Dashed")], ["marker", _t("Marker")]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</>;
  } else if (t === "note") {
    label = _t("Sticky note paper");
    body = <div class="rsws">{PAPERS.map(([c, l]) => <Sw key={c} c={c} title={l} on={(o.paper || "#FFED8C") === c} onClick={() => setOpt("paper", c)} />)}</div>;
  } else if (t === "stamp") {
    const spec = stampSpec(o.stamp);
    label = _t("Stamp");
    body = <><button class="rchip on" onClick={m.stampMenu}><Icon n="stamp" size={14} />{spec.text || _t("Choose")}<Icon n="down" size={10} /></button>
      <span class="tiny muted">{_t("Click on the page to put it there")}</span></>;
  } else if (t === "tick" || t === "cross") {
    label = t === "tick" ? _t("Tick") : _t("Cross");
    body = <><Seg items={[[6, _t("Small")], [9, _t("Medium")], [14, _t("Big")]]} cur={o.quickSize || 9} set={(k) => setOpt("quickSize", k)} />
      <button class={"rchip" + (o.quickOwn !== false ? " on" : "")} onClick={() => setOpt("quickOwn", o.quickOwn === false)} title={_t("Green ticks and red crosses, or the pen's colour")}>{_t("Own colours")}</button></>;
  } else if (t === "whitebrush") {
    label = _t("White brush");
    body = <Seg items={[[8, "8"], [14, "14"], [22, "22"], [32, "32"]]} cur={o.brush || 14} set={(k) => setOpt("brush", k)} />;
  } else if (t === "sign") {
    const sigs = settings.value.signatures || [];
    label = _t("Signature");
    body = sigs.length ? <span class="tiny muted">{_t("Click on the page where you sign")}</span> : <button class="rchip on" onClick={() => openPanel("signature")}>{_t("Make your signature")}</button>;
  } else if (t === "eraser") { label = _t("Eraser"); body = <span class="tiny muted">{_t("Click a mark to take it off")}</span>; }
  else if (t === "edit") { label = _t("Change text"); body = <span class="tiny muted">{_t("Click a line of the PDF, change it, press Enter")}</span>; }
  else if (t === "comment") { label = _t("Comment"); body = <span class="tiny muted">{_t("Click where the comment goes")}</span>; }
  else if (["whitebox", "redact", "crop"].includes(t)) { label = { whitebox: _t("White box"), redact: _t("Erase for good"), crop: _t("Crop") }[t]; body = <span class="tiny muted">{_t("Drag a box over the page")}</span>; }
  else { label = ""; body = <span class="tiny muted rhint">{selectedMark.value ? _t("A mark is chosen: change it in its bar") : _t("Click a mark to change it · Ctrl+K finds anything")}</span>; }
  void book;
  return <div class="ropts">{label && <span class="rolabel">{label}</span>}{body}</div>;
}

// "Edit like Word": this page as a document - in Google Docs (Drive turns the page into a Doc), or in BindLens Write
export async function editPageLikeWord(e, book) {
  const f = curPdf();
  if (!f) { toast(_t("Open a PDF page first.")); return; }
  const s = store.value;
  const ev = e && e.currentTarget ? { currentTarget: e.currentTarget, preventDefault() {}, stopPropagation() {} } : e;
  openMenu(ev, [
    { title: _t("Page {0} of {1}", pageNo.value + 1, f.name) },
    s.createConverted && { label: _t("In Google Docs (like Word)"), icon: "word", run: async () => (await import("./EditPage.js")).editInGoogle(book, f, pageNo.value) },
    { label: _t("In BindLens (its words, as a document)"), icon: "edit", run: async () => (await import("./EditPage.js")).editInWrite(book, f, pageNo.value) },
    !s.createConverted && { title: _t("With Google Drive, the page also opens in Google Docs") },
  ]);
}

