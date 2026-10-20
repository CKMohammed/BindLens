import { consult, refused } from "../consult.js";
// The tools to mark a page and their menus: on a computer they live on the frame (right), on a phone in the top bar.
import { tool, toolOpts, settings, toast, store, undoStack, redoStack } from "../state.js";
import { Icon } from "./icons.jsx";
import { openMenu, ask } from "./dialogs.jsx";
import { toolLock, selectedMark, textSel, PAPERS } from "./Viewer.jsx";
import { STAMPS, PEN_COLORS, HL_COLORS } from "./marks.js";
import { undo, redo } from "../docs.js";
import { uploadFiles, pickFiles, openPanel, addFromDrive, addFolderFromDrive, addFolder } from "../actions.js";
import { _t } from "../i18n.js";

export function setTool(t) {
  if (consult.value && t !== "select") { toast(refused()); return; }
  tool.value = tool.value === t && t !== "select" ? "select" : t;
  toolLock.value = false;
  selectedMark.value = null;
  textSel.value = null;
}

const setOpt = (k, v) => { toolOpts.value = { ...toolOpts.value, [k]: v }; };

// the menus of the tools; side "left" opens them beside the frame
export function toolMenus(book, side) {
  const om = (e, items) => openMenu(e, items, side ? { side } : undefined);
  const o = toolOpts.value;
  const colorMenu = (e) => om(e, [
    { title: _t("Highlighter") },
    ...HL_COLORS.map(c => ({ label: c === o.color ? _t("Highlighter (now)") : _t("Highlighter"), swatch: c, run: () => { setOpt("color", c); tool.value = "highlight"; } })),
    { title: _t("Pen, shapes and lines") },
    ...PEN_COLORS.map(c => ({ label: c === o.pen ? _t("Pen (now)") : _t("Pen"), swatch: c, run: () => setOpt("pen", c) })),
    { title: _t("Line width") },
    ...[1, 2, 3, 5].map(w => ({ label: _t("{0} pt{1}", w, o.width === w ? _t(" (now)") : ""), run: () => setOpt("width", w) })),
    { title: _t("Text boxes") },
    { label: _t("Colour of the words"), sub: ["#1E1C2B", "#E03131", "#1C7ED6", "#2B8A3E", "#8E6CF0", "#E8772E"].map(c => ({ label: c === (o.textColor || "#1E1C2B") ? "(now)" : "", swatch: c, run: () => { setOpt("textColor", c); tool.value = "text"; } })) },
    { label: _t("Style: ") + ({ plain: _t("Plain"), outline: _t("Outline"), label: _t("Label"), solid: _t("Solid"), dashed: _t("Dashed"), marker: _t("Marker") })[o.textStyle || "plain"], sub: [["plain", _t("Plain")], ["outline", _t("Outline")], ["label", _t("Label")], ["solid", _t("Solid")], ["dashed", _t("Dashed")], ["marker", _t("Marker")]].map(([k, l]) => ({ label: ((o.textStyle || "plain") === k ? "✓ " : "") + l, run: () => { setOpt("textStyle", k); tool.value = "text"; } })) },
    { label: _t("Size: ") + (o.textSize || 12) + _t(" pt"), sub: [9, 11, 12, 14, 18, 24].map(z => ({ label: z + _t(" pt"), run: () => { setOpt("textSize", z); tool.value = "text"; } })) },
  ]);
  const shapeMenu = (e) => om(e, [
    { label: _t("Box"), icon: "rect", run: () => { setOpt("shape", "rect"); tool.value = "shape"; } },
    { label: _t("Circle"), icon: "circle", run: () => { setOpt("shape", "circle"); tool.value = "shape"; } },
    { label: _t("Line"), icon: "line", run: () => { setOpt("shape", "line"); tool.value = "shape"; } },
    { label: _t("Arrow"), icon: "arrow", run: () => { setOpt("shape", "arrow"); tool.value = "shape"; } },
    { label: o.fill ? _t("Fill boxes and circles: on") : _t("Fill boxes and circles: off"), icon: "palette", run: () => setOpt("fill", !o.fill) },
    "-",
    { label: _t("Tick"), icon: "tick", run: () => { tool.value = "tick"; } },
    { label: _t("Cross"), icon: "cross", run: () => { tool.value = "cross"; } },
    { label: _t("Size and colour of ticks and crosses"), icon: "palette", sub: [
      ...[[_t("Small"), 6], [_t("Medium"), 9], [_t("Big"), 14]].map(([l, z]) => ({ label: l + ((o.quickSize || 9) === z ? _t(" (now)") : ""), run: () => setOpt("quickSize", z) })),
      "-",
      { label: (o.quickOwn !== false ? "✓ " : "") + _t("Their own colours (green tick, red cross)"), run: () => setOpt("quickOwn", true) },
      { label: (o.quickOwn === false ? "✓ " : "") + _t("The colour chosen in Colours and sizes"), run: () => setOpt("quickOwn", false) },
    ] },
    { title: _t("Hide or erase the PDF's own text") },
    { label: _t("White box: drag over the text"), icon: "rect", run: () => { tool.value = "whitebox"; toast(_t("Drag a box over the text to hide. Later you can erase what is under it for good.")); } },
    { label: _t("White brush: paint over the text"), icon: "pen", run: () => { tool.value = "whitebrush"; toast(_t("Paint over the text to hide it.")); } },
    tool.value === "whitebrush" && { label: _t("Brush size"), sub: [8, 14, 22, 32].map(z => ({ label: z + _t(" pt") + ((o.brush || 14) === z ? _t(" (now)") : ""), run: () => { setOpt("brush", z); tool.value = "whitebrush"; } })) },
    { label: _t("Erase the text for good (private data)"), icon: "eraser", run: () => { tool.value = "redact"; toast(_t("Drag a box over what has to go. It is taken out of the PDF and cannot come back.")); } },
    { label: _t("Crop the page..."), icon: "fit", run: () => { tool.value = "crop"; toast(_t("Drag a box round the part of the page to keep.")); } },
  ]);
  const stampMenu = (e) => om(e, [
    { title: _t("Stamp") },
    ...STAMPS.map(st => ({ label: st.date ? _t("Today's date") : st.text, icon: "stamp", run: () => { setOpt("stamp", st.key); tool.value = "stamp"; } })),
    ...((settings.value.myStamps || []).map(w => ({ label: w, icon: "stamp", run: () => { setOpt("stamp", "custom:" + w); tool.value = "stamp"; } }))),
    { label: _t("My own words..."), icon: "plus", run: async () => {
      const w = await ask(_t("Your stamp"), { label: _t("The words on the stamp"), placeholder: _t("e.g. CHECKED BY AOIFE"), ok: _t("Make the stamp") });
      if (!w) return;
      const { setSetting } = await import("../state.js");
      setSetting("myStamps", [w, ...(settings.value.myStamps || []).filter(x => x !== w)].slice(0, 8));
      setOpt("stamp", "custom:" + w); tool.value = "stamp";
    } },
    (settings.value.myStamps || []).length > 0 && { label: _t("Delete one of my stamps"), icon: "trash", sub: (settings.value.myStamps || []).map(w => ({ label: w, run: async () => { const { setSetting: ss } = await import("../state.js"); ss("myStamps", (settings.value.myStamps || []).filter(x => x !== w)); toast(_t("\"{0}\" is no longer in My stamps.", w)); } })) },
    "-",
    { label: _t("Signature"), icon: "sign", run: () => { tool.value = "sign"; if (!(settings.value.signatures || []).length) openPanel("signature"); } },
    { label: _t("New signature..."), icon: "rename", run: () => openPanel("signature") },
    { label: _t("A picture..."), icon: "image", run: async () => {
      const [f] = await pickFiles({ accept: "image/png,image/jpeg", multiple: false });
      if (!f) return;
      const bytes = new Uint8Array(await f.arrayBuffer());
      const img = await createImageBitmap(f);
      setOpt("picture", { bytes, w: img.width, h: img.height });
      tool.value = "picture";
      toast(_t("Click on the page to put the picture there."));
    } },
  ]);
  const hlMenu = (e) => { e.preventDefault(); om(e, [
    { label: _t("Highlight"), icon: "highlighter", run: () => { setOpt("hlKind", "Highlight"); tool.value = "highlight"; } },
    { label: _t("Underline"), icon: "line", run: () => { setOpt("hlKind", "Underline"); tool.value = "highlight"; } },
    { label: _t("Strike out"), icon: "x", run: () => { setOpt("hlKind", "StrikeOut"); tool.value = "highlight"; } },
    { label: _t("Wavy line"), icon: "sign", run: () => { setOpt("hlKind", "Squiggly"); tool.value = "highlight"; } },
  ]); };
  const noteMenu = (e) => { e.preventDefault(); om(e, [{ title: _t("Sticky note paper") }, ...PAPERS.map(([c, l]) => ({ label: l + ((o.paper || "#FFED8C") === c ? _t(" (now)") : ""), swatch: c, run: () => { setOpt("paper", c); tool.value = "note"; } }))]); };
  const addMenu = (e) => om(e, [
    { title: _t("Add to this book") },
    { label: _t("Pages to this document..."), icon: "addpage", run: () => openPanel("addpages", { book: book.id }) },
    { label: _t("Files..."), icon: "upload", run: async () => uploadFiles(book, await pickFiles()) },
    store.value.canPick && { label: _t("Files from my Google Drive..."), icon: "drive", run: () => addFromDrive(book) },
    { label: _t("A folder as a sub-book..."), icon: "book", run: () => addFolder(book) },
    store.value.canPick && { label: _t("A whole folder from my Drive (a new book)..."), icon: "drive", run: () => addFolderFromDrive() },
    "-",
    { label: _t("Write a new document..."), icon: "edit", run: () => openPanel("write", { book: book.id }) },
    { label: _t("Scan pages (camera or photos)..."), icon: "camera", run: () => openPanel("scan", { book: book.id }) },
    store.value.kind === "drive" && { label: _t("Write it in Google Docs..."), icon: "word", run: () => openPanel("addpages", { book: book.id, tab: "google" }) },
  ]);
  return { colorMenu, shapeMenu, stampMenu, hlMenu, noteMenu, addMenu };
}

// the marking tools on the frame: small white icons, a word when you point; double-click keeps one on
export function FrameTools({ book }) {
  const t = tool.value, o = toolOpts.value;
  const m = toolMenus(book, "left");
  const F = ({ n, label, on, run, lock, ctx, children, disabled }) => (
    <button class={"fb" + (on ? " on" : "") + (on && lock && toolLock.value ? " locked" : "")} aria-label={label} disabled={disabled}
      onClick={run} onContextMenu={ctx}
      onDblClick={lock ? () => { tool.value = lock; toolLock.value = true; toast(_t("It stays on until you choose the arrow.")); } : undefined}>
      {children || <Icon n={n} size={17} />}<span class="fbtip">{label}</span>
    </button>
  );
  const shapeIcon = t === "tick" ? "tick" : t === "cross" ? "cross" : o.shape === "circle" ? "circle" : o.shape === "line" ? "line" : o.shape === "arrow" ? "arrow" : "shape";
  return (
    <>
      <F n="select" label={_t("Select and move (V)")} on={t === "select"} run={() => setTool("select")} />
      <F n="pen" label={_t("Pen (P) · double-click: keep it on")} on={t === "pen"} run={() => setTool("pen")} lock="pen" />
      <F n="highlighter" label={_t("Highlighter (H) · right-click: underline, strike out")} on={t === "highlight"} run={() => setTool("highlight")} ctx={m.hlMenu} lock="highlight" />
      <F n="text" label={_t("Text box (T) · right-click: style, colour, size")} on={t === "text"} run={() => setTool("text")} ctx={(e) => { e.preventDefault(); m.colorMenu(e); }} lock="text" />
      <F n="note" label={_t("Sticky note (N) · right-click: the paper")} on={t === "note"} run={() => setTool("note")} ctx={m.noteMenu} lock="note" />
      <F n={shapeIcon} label={_t("Shapes, tick, cross, white box, crop")} on={["shape", "tick", "cross", "whitebox", "whitebrush", "redact", "crop"].includes(t)} run={m.shapeMenu} />
      <F n={t === "sign" ? "sign" : "stamp"} label={_t("Stamps, signature, picture")} on={["stamp", "sign", "picture"].includes(t)} run={m.stampMenu} />
      <F n="textedit" label={_t("Change the text of the PDF (Ctrl+E)")} on={t === "edit"} run={() => { setTool("edit"); if (tool.value === "edit") toast(_t("Click the line of text to change.")); }} />
      <F n="eraser" label={_t("Eraser: click a mark to take it off (E)")} on={t === "eraser"} run={() => setTool("eraser")} />
      <F label={_t("Colours and sizes")} run={m.colorMenu}><span class="fbswatch" style={{ background: t === "highlight" ? o.color : o.pen }} /></F>
      <span class="fbsep" />
      <F n="undo" label={_t("Undo (Ctrl+Z)")} run={undo} disabled={!undoStack.value.length} />
      <F n="redo" label={_t("Redo (Ctrl+Y)")} run={redo} disabled={!redoStack.value.length} />
    </>
  );
}

// the tools in a row, for when the icons on the frame are hidden (Settings)
export function RowTools({ book }) {
  const t = tool.value, o = toolOpts.value;
  const m = toolMenus(book);
  const T = ({ n, label, on, onClick, lock, onContextMenu, disabled }) => (
    <button class={"ib" + (on ? " on" : "") + (on && lock && toolLock.value ? " locked" : "")} title={label} aria-label={label} onClick={onClick} disabled={disabled}
      onContextMenu={onContextMenu} onDblClick={lock ? () => { tool.value = lock; toolLock.value = true; toast(_t("It stays on until you choose the arrow.")); } : undefined}><Icon n={n} /></button>
  );
  return (
    <div class="tools">
      <T n="select" label={_t("Select and move (V)")} on={t === "select"} onClick={() => setTool("select")} />
      <T n="pen" label={_t("Pen (P)")} on={t === "pen"} onClick={() => setTool("pen")} lock="pen" />
      <T n="highlighter" label={_t("Highlighter (H)")} on={t === "highlight"} onClick={() => setTool("highlight")} onContextMenu={m.hlMenu} lock="highlight" />
      <T n="text" label={_t("Text (T)")} on={t === "text"} onClick={() => setTool("text")} onContextMenu={(e) => { e.preventDefault(); m.colorMenu(e); }} lock="text" />
      <T n="note" label={_t("Sticky note (N)")} on={t === "note"} onClick={() => setTool("note")} onContextMenu={m.noteMenu} lock="note" />
      <button class={"ib" + (["shape", "tick", "cross"].includes(t) ? " on" : "")} title={_t("Shapes, tick and cross")} onClick={m.shapeMenu}><Icon n="shape" /></button>
      <button class={"ib" + (["stamp", "sign", "picture"].includes(t) ? " on" : "")} title={_t("Stamps, signature, picture")} onClick={m.stampMenu}><Icon n={t === "sign" ? "sign" : "stamp"} /></button>
      <T n="textedit" label={_t("Change the text of the PDF")} on={t === "edit"} onClick={() => setTool("edit")} />
      <T n="eraser" label={_t("Eraser (E)")} on={t === "eraser"} onClick={() => setTool("eraser")} />
      <button class="ib" title={_t("Colours")} onClick={m.colorMenu}><span class="swatch" style={{ background: t === "highlight" ? o.color : o.pen }} /></button>
      <span class="sep" />
      <T n="undo" label={_t("Undo (Ctrl+Z)")} onClick={undo} disabled={!undoStack.value.length} />
      <T n="redo" label={_t("Redo (Ctrl+Y)")} onClick={redo} disabled={!redoStack.value.length} />
    </div>
  );
}

