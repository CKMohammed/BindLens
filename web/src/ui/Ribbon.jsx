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

export const TABS = [["read", "Read"], ["mark", "Mark"], ["edit", "Edit"], ["sign", "Fill & Sign"], ["pages", "Pages"], ["review", "Review"]];
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
      onDblClick={lock ? () => { tool.value = lock; toolLock.value = true; toast("It stays on until you choose Select."); } : undefined}>
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
  if (!f) { toast("Open a PDF page first (a Word or Excel file: right-click it, Make a PDF copy)."); return; }
  await fn(f);
}
const toPage = (f, p) => { fileId.value = f.id; pageNo.value = p; setTimeout(() => { scrollTo.value = { fileId: f.id, page: p }; }, 120); };

export function Ribbon({ book }) {
  const tab = ribbonTab.value;
  const t = tool.value;
  const m = toolMenus(book);
  const tl = (x) => () => { setTool(x.t); if (x.t === "edit" && tool.value === "edit") toast("Click the line of text to change."); };
  const toolBtn = (x) => <RB key={x.t} icon={x.icon} label={x.label} tip={`${x.label} ${x.key ? x.key + " · " : ""}${x.lock ? "double-click: it stays on" : ""}`.trim()} on={t === x.t} onClick={tl(x)} lock={x.lock ? x.t : null} />;
  let tools = null;
  if (tab === "read") tools = <>
    <RB icon="read" label={readMode.value ? "Leave reading" : "Reading mode"} on={readMode.value} onClick={() => { readMode.value = !readMode.value; }} tip="A calm view: the page, the contents, the clock (F6)" />
    {canSpeak && <RB icon="speaker" label={aloud.value.on ? "Stop reading" : "Read aloud"} on={aloud.value.on} onClick={toggleAloud} tip="The computer reads the book to you, from this page (Ctrl+U)" />}
    <RB icon="list" label="Contents" on={readMode.value && contentsOpen.value} onClick={() => { if (!readMode.value) { readMode.value = true; contentsOpen.value = true; } else contentsOpen.value = !contentsOpen.value; }} tip="The contents of the book and its parts" />
    <span class="rsep" />
    <RB icon="fit" label="Fit width" on={fitWidth.value && zoom.value === 1 && !fitPage.value} onClick={() => { fitWidth.value = true; fitPage.value = false; zoom.value = 1; }} />
    <RB icon="expand" label="Whole page" on={fitPage.value} onClick={() => { fitWidth.value = true; fitPage.value = !fitPage.value; zoom.value = 1; }} />
    <RB icon="grid" label="All pages" onClick={() => openPanel("pages", { fileId: fileId.value })} tip="Every page as a small picture" />
    <span class="rsep" />
    <RB icon="search" label="Find in book" onClick={() => { leftOpen.value = true; sideTab.value = "search"; }} />
    <RB icon="star" label="Study cards" onClick={() => openPanel("study")} tip="Your highlights as cards to review, and a summary sheet (Ctrl+B)" />
    <RB icon="moon" label="Night pages" on={!!settings.value.night} onClick={() => setSetting("night", !settings.value.night)} tip="Dark pages for reading at night" />
  </>;
  if (tab === "mark") tools = <>
    {[T("select", "select", "Select", "V", false), T("highlight", "highlighter", "Highlight", "H"), T("pen", "pen", "Pen", "P"), T("text", "text", "Text box", "T"), T("note", "note", "Sticky note", "N")].map(toolBtn)}
    <RB icon={toolOpts.value.shape === "circle" ? "circle" : toolOpts.value.shape === "line" ? "line" : toolOpts.value.shape === "arrow" ? "arrow" : "shape"} label="Shapes" on={t === "shape"} onClick={() => { setTool("shape"); }} lock="shape" tip="A box, circle, line or arrow - choose on the right" />
    {[T("tick", "tick", "Tick", ""), T("cross", "cross", "Cross", "")].map(toolBtn)}
    <RB icon="stamp" label="Stamp" on={t === "stamp"} onClick={() => setTool("stamp")} lock="stamp" tip="APPROVED, PAID, today's date, your own words - choose on the right" />
    {toolBtn(T("eraser", "eraser", "Eraser", "E", false))}
    <span class="rsep" />
    <FavPens />
  </>;
  if (tab === "edit") tools = <>
    {toolBtn(T("edit", "textedit", "Change text", "Ctrl+E", false))}
    <RB icon="word" label="Edit like Word" onClick={(e) => editPageLikeWord(e, book)} tip="Edit this page as a document: in Google Docs, or in BindLens" menu />
    <span class="rsep" />
    {[T("whitebox", "rect", "White box", ""), T("whitebrush", "pen", "White brush", ""), T("redact", "eraser", "Erase for good", "")].map(toolBtn)}
    {toolBtn(T("crop", "fit", "Crop page", "", false))}
    <RB icon="image" label="Picture" on={t === "picture"} onClick={async () => {
      const [f] = await pickFiles({ accept: "image/png,image/jpeg", multiple: false });
      if (!f) return;
      const bytes = new Uint8Array(await f.arrayBuffer());
      const img = await createImageBitmap(f);
      setOpt("picture", { bytes, w: img.width, h: img.height });
      tool.value = "picture";
      toast("Click on the page to put the picture there.");
    }} tip="A picture or a logo on the page" />
    <span class="rsep" />
    <RB icon="edit" label="Write a page" onClick={() => { const f = curPdf(); openPanel("write", { book: book.id, into: f?.id, at: f ? pageNo.value + 1 : undefined }); }} tip="A new page written in BindLens, after this one" />
    <RB icon="type" label="Watermark" onClick={() => onPdf(FT.watermark)} />
    <RB icon="eye" label="Read scan (OCR)" onClick={() => onPdf(async (f) => { toast("Reading the words of the page..."); const { readScannedPage } = await import("../ocr.js"); const n = await readScannedPage(f, pageNo.value); toast(n ? `${n} words read: you can find, copy and change them now.` : "This page has its words already, or none were found.", n ? "ok" : ""); })} tip="A scanned page gets its words: find, copy and change them" />
  </>;
  if (tab === "sign") tools = <>
    <RB icon="form" label="Fill in" onClick={() => { tool.value = "select"; const f = fileFor(fileId.value); toast(f && docState.value[f.id]?.form ? "Click a box of the form and type. Ticks and lists work too." : "This document has no form boxes: use Text, Tick and Date to fill it in."); }} tip="Type in the boxes of a PDF form" />
    {toolBtn(T("sign", "sign", "Signature", ""))}
    <RB icon="rename" label="New signature" onClick={() => openPanel("signature")} />
    <span class="rsep" />
    {[T("text", "text", "Text", "T"), T("tick", "tick", "Tick", ""), T("cross", "cross", "Cross", ""), T("date", "calendar", "Date", ""), T("initials", "at", "Initials", "")].map(toolBtn)}
  </>;
  if (tab === "pages") tools = <>
    <RB icon="addpage" label="Add pages" onClick={() => openPanel("addpages", { book: book.id })} tip="Blank, lined or squared; from a file; a scan; Google Docs" />
    <RB icon="rotate" label="Turn right" onClick={() => onPdf(f => pageOp(f, "rotatePage", pageNo.value, 90))} />
    <RB icon="undo" label="Turn left" onClick={() => onPdf(f => pageOp(f, "rotatePage", pageNo.value, -90))} />
    <RB icon="up" label="Move up" onClick={() => onPdf(async f => { if (pageNo.value === 0) return; await pageOp(f, "movePage", pageNo.value, pageNo.value - 1); toPage(f, pageNo.value - 1); })} />
    <RB icon="down" label="Move down" onClick={() => onPdf(async f => { const n = docState.value[f.id]?.pages?.length || 1; if (pageNo.value >= n - 1) return; await pageOp(f, "movePage", pageNo.value, pageNo.value + 1); toPage(f, pageNo.value + 1); })} />
    <RB icon="trash" label="Take out" onClick={() => onPdf(async f => { if ((docState.value[f.id]?.pages?.length || 1) < 2) { toast("It is the only page."); return; } if (await confirm("Take this page out?", "Undo (Ctrl+Z) puts it back, and so does Deleted pages.", { ok: "Take it out", danger: true })) await FT.takePageOut(f, pageNo.value); })} />
    <span class="rsep" />
    <RB icon="grid" label="All pages" onClick={() => openPanel("pages", { fileId: fileId.value })} tip="Every page as a small picture: turn, move, take out" />
    <RB icon="copy" label="Pages as PDF" onClick={() => onPdf(f => FT.savePagesAsPdf(f, pageNo.value))} tip="Some pages as a new PDF" />
    <RB icon="grid" label="Split" onClick={() => onPdf(FT.splitFile)} tip="One PDF for each page" />
    <RB icon="download" label="Smaller" onClick={() => onPdf(FT.makeSmaller)} tip="Make the file smaller (pictures, scans)" />
    <RB icon="undo" label="Deleted pages" onClick={() => onPdf(f => openPanel("deleted", { fileId: f.id }))} tip="Put a page you took out back" />
    <RB icon="book" label="Book as PDF" onClick={() => FT.wholeBookAsPdf(book)} tip="The whole book as one PDF" />
  </>;
  if (tab === "review") tools = <>
    {toolBtn(T("comment", "comment", "Comment", "C"))}
    <RB icon="list" label="Comments" on={!!commentsOpen.value} onClick={() => { commentsOpen.value = commentsOpen.value ? null : {}; }} tip="Every comment of the book, with the replies" />
    <RB icon="task" label="Tasks" onClick={() => openPanel("tasks", { about: true })} tip="A task about this page, for you or a colleague" />
    <RB icon="check" label="Status" menu onClick={(e) => { const f = fileFor(fileId.value); if (!f) return; const cur = statusOf(f.id); openMenu(e, [{ title: "Status of " + f.name }, ...STATUSES.map(([n, c]) => ({ label: (cur === n ? "✓ " : "") + n, color: c, run: () => setStatus(f.id, n) })), "-", { label: "No status", run: () => setStatus(f.id, "") }]); }} tip="Pending, Checked, Signed, Done, Urgent, Waiting">
      {statusOf(fileId.value) ? <span class="rbdot" style={{ background: statusColor(statusOf(fileId.value)) }} /> : <Icon n="check" size={20} />}
    </RB>
    <span class="rsep" />
    <RB icon="share" label="Share" onClick={() => openPanel("share", { id: book.id })} tip="Share this book with a colleague" />
    <RB icon="mail" label="Email" onClick={() => { const f = fileFor(fileId.value); if (f) FT.sendFile(f); }} tip="Send this document by email" />
    <RB icon="copy" label="Compare" menu onClick={(e) => { const f = fileFor(fileId.value); if (!f) return; openMenu(e, [{ title: "Compare " + f.name + " with" }, ...book.files.filter(x => x.id !== f.id && x.kind !== "image").map(x => ({ label: x.name, run: () => openPanel("reports", { compare: { a: f.id, b: x.id } }) }))]); }} />
    <RB icon="clock" label="Versions" onClick={() => { const f = fileFor(fileId.value); if (f) openPanel("versions", { fileId: f.id }); }} tip="Earlier versions of this document" />
    <RB icon="print" label="Print" onClick={() => openPanel("print")} tip="Print (Ctrl+P)" />
  </>;
  return (
    <div class="ribbon" role="toolbar" aria-label="Tools">
      <div class="rtabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} class={tab === k ? "on" : ""} onClick={() => { setTab(k); if (!TAB_TOOLS[k].includes(tool.value)) { tool.value = "select"; toolLock.value = false; } }}>{l}</button>)}
      </div>
      <div class="rtools">{tools}</div>
      <Options book={book} m={m} />
      <div class="rundo">
        <button class="ib" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo} disabled={!undoStack.value.length}><Icon n="undo" /></button>
        <button class="ib" title="Redo (Ctrl+Y)" aria-label="Redo" onClick={redo} disabled={!redoStack.value.length}><Icon n="redo" /></button>
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
    <button key={i} class={"rb fav" + (isOn(f) ? " on" : "")} aria-label="A favourite pen"
      onClick={() => use(f)}
      onContextMenu={(e) => { e.preventDefault(); openMenu(e, [{ title: "Favourite " + (i + 1) }, { label: "Keep the pen or highlighter as it is now here", icon: "star", run: () => { const n = [...favs]; n[i] = t === "highlight" ? { tool: "highlight", color: o.color } : { tool: "pen", color: o.pen, width: o.width || 2 }; setSetting("favPens", n); toast("Kept as favourite " + (i + 1) + ".", "ok"); } }, { label: "Back to the first ones", icon: "undo", run: () => setSetting("favPens", FAV_DEFAULT) }]); }}>
      <Icon n={f.tool === "pen" ? "pen" : "highlighter"} size={20} style={{ color: f.color }} />
      <i class="favdot" style={{ background: f.color, height: f.tool === "pen" ? Math.max(2, (f.width || 2) * 1.2) + "px" : "5px" }} />
      <span class="rbtip"><b>Favourite {f.tool === "pen" ? "pen" : "highlighter"} {i + 1}</b><span>Right-click: keep the one in use here</span></span>
    </button>
  ));
}

// the options of the tool in use, in sight (no menus): colours, widths, kinds, sizes
function Options({ book, m }) {
  const t = tool.value, o = toolOpts.value;
  const Sw = ({ c, on, onClick, title }) => <button class={"rsw" + (on ? " on" : "")} style={{ background: c }} title={title || c} aria-label={title || c} onClick={onClick} />;
  const Seg = ({ items, cur, set }) => <div class="rseg">{items.map(([k, l, ic]) => <button key={k} class={cur === k ? "on" : ""} onClick={() => set(k)} title={l}>{ic ? <Icon n={ic} size={15} /> : l}</button>)}</div>;
  const widths = <div class="rseg widths">{[1, 2, 3, 5].map(w => <button key={w} class={(o.width || 2) === w ? "on" : ""} onClick={() => setOpt("width", w)} title={w + " pt"}><i style={{ height: Math.max(1.5, w * 1.1) + "px" }} /></button>)}</div>;
  const pens = <div class="rsws">{PEN_COLORS.slice(0, 7).map(c => <Sw key={c} c={c} on={o.pen === c} onClick={() => setOpt("pen", c)} />)}</div>;
  let body = null, label = "";
  if (t === "highlight") {
    label = "Highlighter";
    body = <><Seg items={[["Highlight", "Highlight", "highlighter"], ["Underline", "Underline", "line"], ["StrikeOut", "Strike out", "x"], ["Squiggly", "Wavy line", "sign"]]} cur={o.hlKind || "Highlight"} set={(k) => setOpt("hlKind", k)} />
      <div class="rsws">{HL_COLORS.map(c => <Sw key={c} c={c} on={o.color === c} onClick={() => setOpt("color", c)} />)}</div></>;
  } else if (t === "pen") { label = "Pen"; body = <>{pens}{widths}</>; }
  else if (t === "shape") {
    label = "Shape";
    body = <><Seg items={[["rect", "Box", "rect"], ["circle", "Circle", "circle"], ["line", "Line", "line"], ["arrow", "Arrow", "arrow"]]} cur={o.shape || "rect"} set={(k) => setOpt("shape", k)} />
      {pens}{widths}<button class={"rchip" + (o.fill ? " on" : "")} onClick={() => setOpt("fill", !o.fill)} title="Fill boxes and circles with a light colour">Fill</button></>;
  } else if (t === "text" || t === "date" || t === "initials") {
    label = t === "text" ? "Text box" : t === "date" ? "Date" : "Initials";
    body = <><div class="rsws">{TEXT_COLORS.map(c => <Sw key={c} c={c} on={(o.textColor || "#1E1C2B") === c} onClick={() => setOpt("textColor", c)} />)}</div>
      <select class="rsel" value={o.textSize || 12} onChange={(e) => setOpt("textSize", Number(e.target.value))} title="Size">{[8, 9, 10, 11, 12, 14, 16, 18, 24, 32].map(z => <option key={z} value={z}>{z} pt</option>)}</select>
      {t === "text" && <select class="rsel" value={o.textStyle || "plain"} onChange={(e) => setOpt("textStyle", e.target.value)} title="Style">{[["plain", "Plain"], ["outline", "Outline"], ["label", "Label"], ["solid", "Solid"], ["dashed", "Dashed"], ["marker", "Marker"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</>;
  } else if (t === "note") {
    label = "Sticky note paper";
    body = <div class="rsws">{PAPERS.map(([c, l]) => <Sw key={c} c={c} title={l} on={(o.paper || "#FFED8C") === c} onClick={() => setOpt("paper", c)} />)}</div>;
  } else if (t === "stamp") {
    const spec = stampSpec(o.stamp);
    label = "Stamp";
    body = <><button class="rchip on" onClick={m.stampMenu}><Icon n="stamp" size={14} />{spec.text || "Choose"}<Icon n="down" size={10} /></button>
      <span class="tiny muted">Click on the page to put it there</span></>;
  } else if (t === "tick" || t === "cross") {
    label = t === "tick" ? "Tick" : "Cross";
    body = <><Seg items={[[6, "Small"], [9, "Medium"], [14, "Big"]]} cur={o.quickSize || 9} set={(k) => setOpt("quickSize", k)} />
      <button class={"rchip" + (o.quickOwn !== false ? " on" : "")} onClick={() => setOpt("quickOwn", o.quickOwn === false)} title="Green ticks and red crosses, or the pen's colour">Own colours</button></>;
  } else if (t === "whitebrush") {
    label = "White brush";
    body = <Seg items={[[8, "8"], [14, "14"], [22, "22"], [32, "32"]]} cur={o.brush || 14} set={(k) => setOpt("brush", k)} />;
  } else if (t === "sign") {
    const sigs = settings.value.signatures || [];
    label = "Signature";
    body = sigs.length ? <span class="tiny muted">Click on the page where you sign</span> : <button class="rchip on" onClick={() => openPanel("signature")}>Make your signature</button>;
  } else if (t === "eraser") { label = "Eraser"; body = <span class="tiny muted">Click a mark to take it off</span>; }
  else if (t === "edit") { label = "Change text"; body = <span class="tiny muted">Click a line of the PDF, change it, press Enter</span>; }
  else if (t === "comment") { label = "Comment"; body = <span class="tiny muted">Click where the comment goes</span>; }
  else if (["whitebox", "redact", "crop"].includes(t)) { label = { whitebox: "White box", redact: "Erase for good", crop: "Crop" }[t]; body = <span class="tiny muted">Drag a box over the page</span>; }
  else { label = ""; body = <span class="tiny muted rhint">{selectedMark.value ? "A mark is chosen: change it in its bar" : "Click a mark to change it · Ctrl+K finds anything"}</span>; }
  void book;
  return <div class="ropts">{label && <span class="rolabel">{label}</span>}{body}</div>;
}

// "Edit like Word": this page as a document - in Google Docs (Drive turns the page into a Doc), or in BindLens Write
export async function editPageLikeWord(e, book) {
  const f = curPdf();
  if (!f) { toast("Open a PDF page first."); return; }
  const s = store.value;
  const ev = e && e.currentTarget ? { currentTarget: e.currentTarget, preventDefault() {}, stopPropagation() {} } : e;
  openMenu(ev, [
    { title: `Page ${pageNo.value + 1} of ${f.name}` },
    s.createConverted && { label: "In Google Docs (like Word)", icon: "word", run: async () => (await import("./EditPage.js")).editInGoogle(book, f, pageNo.value) },
    { label: "In BindLens (its words, as a document)", icon: "edit", run: async () => (await import("./EditPage.js")).editInWrite(book, f, pageNo.value) },
    !s.createConverted && { title: "With Google Drive, the page also opens in Google Docs" },
  ]);
}

