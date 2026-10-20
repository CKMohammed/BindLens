// The book: every document of the folder, one after another, as pages you scroll through - and the marks on them.
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "preact/hooks";
import { signal, effect } from "@preact/signals";
import { books, bookId, fileId, pageNo, tool, toolOpts, zoom, fitWidth, toast, rememberPlace, settings, store,
  readMode, visibleFiles, subView, fitPage, bookMeta, commentsOpen, aloudMark } from "../state.js";
import { getDoc, onDocChange, call, addMark, editMark, deleteMark, copyMark, marksOn, pdfCopyOf, afterEdit, fileFor, isOpen } from "../docs.js";
import { hexToRgb, isPaged, kindOf, debounce, fmtSize, mix } from "../util.js";
import { Icon, fileIcon } from "./icons.jsx";
import { confirm, openMenuAt, openMenu } from "./dialogs.jsx";
import { stampSpec, HL_COLORS } from "./marks.js";
import { openPanel } from "../actions.js";
import { pip } from "./Gallery.jsx";
import { _t, _tv } from "../i18n.js";
import { consult } from "../consult.js";

export const docState = signal({});        // fileId -> {status, pages, readOnly, error, v}
export const searchHits = signal(null);    // {query, list:[{fileId, page, quads}], cur}
export const selectedMark = signal(null);  // {fileId, page, i, rect, type, contents, color}
export const textSel = signal(null);       // {fileId, page, quads, text}
export const scrollTo = signal(null);      // {fileId, page, y?} - ask the viewer to go there
export const toolLock = signal(false);     // a double-click on a tool keeps it on (otherwise it goes back to the arrow)
// another tool chosen: the chosen mark is let go (its bar would cover the page)
effect(() => { const t = tool.value; if (t !== "select" && t !== "eraser") selectedMark.value = null; });
const PT = 96 / 72;

// after a mark is put on the page the tool goes back to the arrow, as in the app, and the new mark is chosen -
// ready to move, turn or resize. The pen, the brush and the highlighter go back a moment after the last stroke.
let backTimer = null;
let pinching = false;           // two fingers on the pages: they zoom, they do not draw
async function placed(file, page, i, select = true) {
  clearTimeout(backTimer);
  if (!toolLock.value) tool.value = "select";
  if (select && typeof i === "number" && i >= 0) await reselect(file, page, i);
}
function placedLater() {
  clearTimeout(backTimer);
  if (toolLock.value) return;
  backTimer = setTimeout(() => { if (!toolLock.value && ["pen", "whitebrush", "highlight"].includes(tool.value)) tool.value = "select"; }, 1400);
}
async function reselect(file, page, i) {
  const list = await marksOn(file, page);
  const m = list.find(x => x.i === i);
  selectedMark.value = m ? { fileId: file.id, page, ...m } : null;
}
export { reselect };

// which handles a mark gets: boxes, drawings, texts and stamps can be resized and turned; a line has its two ends
const FLAT = new Set(["Highlight", "Underline", "StrikeOut", "Squiggly", "Text", "Polygon", "PolyLine"]);
function isPlainText(m) { return m.type === "FreeText" && m.subject !== "Sticky note" && !(m.style && (m.style.style && m.style.style !== "plain" || m.style.fill || m.style.line)); }
function handlesOf(m) {
  if (!m || FLAT.has(m.type)) return { list: [], rotate: false };
  if (m.type === "Line") return { list: [], ends: true, rotate: false };
  if (m.rot || m.type === "Stamp") return { list: ["nw", "ne", "se", "sw"], rotate: true };
  if (isPlainText(m)) return { list: ["nw", "ne", "se", "sw", "e", "w"], rotate: true };
  return { list: ["nw", "n", "ne", "e", "se", "s", "sw", "w"], rotate: true };
}
function resizedRect(dr, p, shift) {
  const m = dr.m, o = m.rect, h = dr.h;
  const ow = o[2] - o[0] || 1, oh = o[3] - o[1] || 1;
  if (m.rot) {
    // a turned mark grows and shrinks round its middle
    const cx = (o[0] + o[2]) / 2, cy = (o[1] + o[3]) / 2;
    const s = Math.max(0.15, Math.hypot(p[0] - cx, p[1] - cy) / (Math.hypot(dr.start[0] - cx, dr.start[1] - cy) || 1));
    return { s, rect: [cx - ow / 2 * s, cy - oh / 2 * s, cx + ow / 2 * s, cy + oh / 2 * s] };
  }
  let [x0, y0, x1, y1] = o;
  if (h.includes("w")) x0 = Math.min(p[0], o[2] - 6);
  if (h.includes("e")) x1 = Math.max(p[0], o[0] + 6);
  if (h.includes("n")) y0 = Math.min(p[1], o[3] - 6);
  if (h.includes("s")) y1 = Math.max(p[1], o[1] + 6);
  const keep = h.length === 2 && (m.type === "Stamp" || shift || isPlainText(m));
  if (keep) {
    const s = Math.max(0.1, Math.max((x1 - x0) / ow, (y1 - y0) / oh));
    const w = ow * s, hh = oh * s;
    if (h.includes("w")) x0 = o[2] - w; else x1 = o[0] + w;
    if (h.includes("n")) y0 = o[3] - hh; else y1 = o[1] + hh;
  }
  return { s: (x1 - x0) / ow, rect: [x0, y0, x1, y1] };
}

function setDoc(id, change) {
  docState.value = { ...docState.value, [id]: { ...(docState.value[id] || {}), ...change } };
}

export function bumpDoc(id) {
  const d = docState.value[id];
  if (d) setDoc(id, { v: (d.v || 0) + 1 });
}

onDocChange(async (id, what) => {
  const d = docState.value[id];
  if (!d) return;
  if (what === "pages") {
    try {
      const f = fileFor(id);
      const doc = await getDoc(f);
      const info = await call("info", doc.key);
      doc.pages = info.pages;
      setDoc(id, { pages: info.pages, v: (d.v || 0) + 1 });
    } catch (e) { bumpDoc(id); }
  } else bumpDoc(id);
});

// ---- render queue: the engine draws one page at a time; pages on screen first
const queue = [];
let busy = false;
function enqueue(job) {
  const i = queue.findIndex(j => j.id === job.id);
  if (i >= 0) queue.splice(i, 1);
  queue.push(job);
  pump();
}
async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    queue.sort((a, b) => (b.prio() - a.prio()));
    const job = queue.shift();
    if (job.prio() < 0) continue;
    try { await job.run(); } catch (e) { console.warn("render", e); }
  }
  busy = false;
}

function PageCanvas({ file, page, w, h, k, v }) {
  const ref = useRef();
  const vis = useRef(false);
  const wrap = useRef();
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState("");
  const drawRef = useRef(null);
  useEffect(() => {
    const el = wrap.current;
    let forget = null;
    const io = new IntersectionObserver(([e]) => {
      vis.current = e.isIntersecting;
      clearTimeout(forget);
      if (e.isIntersecting) drawRef.current && drawRef.current();
      else {
        // far from the screen: let the picture go (big books would use too much memory), draw it again on return
        forget = setTimeout(() => {
          if (vis.current || !ref.current) return;
          ref.current.width = 0; ref.current.height = 0;
          want.current = null;
          setDrawn(false);
        }, 4000);
      }
    }, { root: el.closest(".pages"), rootMargin: "900px 0px" });
    io.observe(el);
    return () => { io.disconnect(); vis.current = false; clearTimeout(forget); };
  }, []);
  const want = useRef(null);
  const draw = useCallback(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    let scale = k * PT * dpr;
    const maxPx = 9e6;
    if (w * h * scale * scale > maxPx) scale = Math.sqrt(maxPx / (w * h));
    const sig = `${scale.toFixed(3)}:${v}`;
    if (want.current === sig) return;
    want.current = sig;
    enqueue({
      id: file.id + ":" + page,
      prio: () => (vis.current ? 10 : 0) - (want.current !== sig ? 100 : 0),
      run: async () => {
        if (want.current !== sig) return;
        let r = null;
        for (let tries = 0; tries < 2 && !r; tries++) {
          try { const doc = await getDoc(file); r = await call("render", doc.key, page, scale, true); }
          catch (e) { if (tries) { setFailed(String(e.message || e)); want.current = null; return; } await new Promise(z => setTimeout(z, 600)); }
        }
        const c = ref.current;
        if (!c || !r) return;
        c.width = r.w; c.height = r.h;
        c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(r.px.buffer || r.px), r.w, r.h), 0, 0);
        setDrawn(true); setFailed("");
      },
    });
  }, [k, v, w, h]);
  drawRef.current = draw;
  useEffect(() => { want.current = null; if (vis.current) draw(); }, [k, v, w, h]);
  return (
    <div ref={wrap} style={{ position: "absolute", inset: 0 }}>
      <canvas ref={ref} />
      {!drawn && !failed && <div class="loading">{_t("Page")} {page + 1}</div>}
      {failed && <div class="pagefail"><Icon n="info" size={22} /><b>{_t("Page {0} could not be drawn", page + 1)}</b><span class="tiny muted">{failed.slice(0, 120)}</span>
        <span class="row" style={{ gap: 6 }}><button class="btn small" onClick={() => { setFailed(""); want.current = null; draw(); }}>{_t("Try again")}</button>
          {store.value.webLink && <button class="btn ghost small" onClick={() => window.open(store.value.webLink(file), "_blank")}>{_t("Open it in")} {store.value.cloud || _t("Drive")}</button>}</span></div>}
    </div>
  );
}

// ---- pointer -> page points
function ptOf(e, el, k) {
  const r = el.getBoundingClientRect();
  return [(e.clientX - r.left) / (k * PT), (e.clientY - r.top) / (k * PT)];
}

function rgb(hex) { return hexToRgb(hex); }

function hitMark(list, p, pad = 4) {
  // the smallest mark under the point
  let best = null;
  for (const a of list) {
    const [x0, y0, x1, y1] = a.rect;
    if (p[0] >= x0 - pad && p[0] <= x1 + pad && p[1] >= y0 - pad && p[1] <= y1 + pad) {
      const area = (x1 - x0) * (y1 - y0);
      if (!best || area < best.area) best = { ...a, area };
    }
  }
  return best;
}

async function ensureWritable(file) {
  const d = docState.value[file.id];
  if (d && !d.readOnly) return file;
  const b = books.value.find(x => x.id === file.book) || books.value.find(x => x.files.some(f => f.id === file.id));
  const ok = await confirm(_t("Mark a copy?"), _t("\"{0}\" is not a PDF. BindLens can make a PDF copy of it in this book, and your marks go on the copy.", file.name), { ok: _t("Make a PDF copy") });
  if (!ok) return null;
  const f = await pdfCopyOf(file, b);
  scrollTo.value = { fileId: f.id, page: 0 };
  return null;
}

// a tick or a cross where you click: its size and colour as chosen (its own green / red, or the pen's colour)
async function quickMark(file, page, t, p, o) {
  const s = o.quickSize || 9;
  const [x, y] = p;
  const strokes = t === "tick" ? [[[x - s, y], [x - s / 3, y + s * 0.7], [x + s, y - s * 0.9]]]
    : [[[x - s * 0.8, y - s * 0.8], [x + s * 0.8, y + s * 0.8]], [[x + s * 0.8, y - s * 0.8], [x - s * 0.8, y + s * 0.8]]];
  const own = o.quickOwn !== false;
  return addMark(file, page, { type: "Ink", ink: strokes, color: own ? (t === "tick" ? [0.1, 0.6, 0.25] : [0.85, 0.15, 0.15]) : rgb(o.pen), width: Math.max(1.6, s * 0.29), subject: t === "tick" ? "Tick" : "Cross" });
}

// right-click on a page: put a mark right there, or do something with the page
async function pageMenu(e, file, page, p, readOnly, marks, setEdit, k) {
  e.preventDefault();
  const o = toolOpts.value;
  const m = marks ? hitMark(marks, p) : null;
  if (m && !readOnly) {
    selectedMark.value = { fileId: file.id, page, ...m };
    const white = (m.type === "Square" && m.subject === "White box") || (m.type === "Ink" && m.subject === "White brush");
    openMenuAt(e.clientX, e.clientY, [
      { title: m.subject || m.type },
      m.type === "Text" && m.num > 0 && { label: _t("Open the comment"), icon: "comment", run: () => { commentsOpen.value = { focus: m.num, fileId: file.id }; } },
      (m.type === "FreeText" || m.type === "Text") && { label: _t("Change the words..."), icon: "rename", run: () => setEdit({ x: m.rect[0], y: m.rect[1], w: m.rect[2] - m.rect[0], h: m.rect[3] - m.rect[1], kind: "change", value: m.contents, size: 12, m }) },
      !FLAT.has(m.type) && !white && { label: _t("A copy of it"), icon: "copy", run: () => copySelected() },
      handlesOf(m).rotate && { label: _t("Turn it a quarter"), icon: "rotate", run: async () => { await editMark(file, page, m.i, { rotateBy: 90 }); await reselect(file, page, m.i); } },
      m.rot && { label: _t("Put it straight again"), icon: "undo", run: async () => { await editMark(file, page, m.i, { rotateBy: -m.rot }); await reselect(file, page, m.i); } },
      white && { label: _t("Erase the text under it for good..."), icon: "eraser", run: async () => {
        if (!(await confirm(_t("Erase the text under it for good?"), _t("The words and pictures under it are taken out of the PDF, so nobody can copy or find them."), { ok: _t("Erase for good"), danger: true }))) return;
        const doc = await getDoc(file); await call("eraseArea", doc.key, page, m.rect, false, m.i); afterEdit(file.id, "pages"); selectedMark.value = null;
      } },
      "-",
      { label: white ? _t("Delete (show the text again)") : _t("Delete"), icon: "trash", danger: true, run: async () => { await deleteMark(file, page, m.i); selectedMark.value = null; } },
    ]);
    return;
  }
  const ts = textSel.value;
  const at = (fn) => async () => { if (readOnly) { await ensureWritable(file); return; } const n = await fn(); if (typeof n === "number" && n >= 0) await reselect(file, page, n); };
  const spec = stampSpec(o.stamp);
  const { fmtDate } = await import("../util.js");
  openMenuAt(e.clientX, e.clientY, [
    ts && ts.fileId === file.id && ts.text && { label: _t("Copy the text"), icon: "copy", run: () => navigator.clipboard?.writeText(ts.text).then(() => toast(_t("Copied."))) },
    { title: _t("Here") },
    { label: _t("Text here..."), icon: "text", run: at(() => setEdit({ x: p[0], y: p[1] - 8, w: 220, h: 26, kind: "text", value: "", size: o.textSize || 12 })) },
    { label: _t("Sticky note here..."), icon: "note", run: at(() => setEdit({ x: p[0], y: p[1], w: 170, h: 110, kind: "note", value: "", size: 12 })) },
    { label: _t("A comment here..."), icon: "comment", run: () => { if (readOnly) { ensureWritable(file); return; } commentsOpen.value = { draft: { fileId: file.id, page, x: p[0], y: p[1] } }; } },
    { label: _t("Tick here"), icon: "tick", run: at(() => quickMark(file, page, "tick", p, o)) },
    { label: _t("Cross here"), icon: "cross", run: at(() => quickMark(file, page, "cross", p, o)) },
    { label: _t("Stamp here ({0})", spec.text), icon: "stamp", run: at(() => { const w = spec.w || 150, h = spec.h || 46; return addMark(file, page, { type: "Stamp", rect: [p[0] - w / 2, p[1] - h / 2, p[0] + w / 2, p[1] + h / 2], text: spec.text, sub: spec.sub, color: spec.color, subject: "Stamp" }); }) },
    { label: _t("Today's date here"), icon: "calendar", run: at(() => { const d = fmtDate(new Date()); const sz = o.textSize || 12; return addMark(file, page, { type: "FreeText", rect: [p[0], p[1] - sz, p[0] + d.length * sz * 0.56 + 8, p[1] + sz * 0.4], text: d, size: sz, color: rgb(o.textColor || "#1E1C2B") }); }) },
    { label: _t("Separator line here"), icon: "line", run: at(() => { const pg0 = docState.value[file.id]?.pages?.[page]; const W = pg0 ? pg0.w : 595; return addMark(file, page, { type: "Line", a: [W * 0.08, p[1]], b: [W * 0.92, p[1]], color: rgb(o.pen), width: 1, subject: "Separator line" }); }) },
    (settings.value.signatures || []).length > 0 && { label: _t("My signature here"), icon: "sign", run: at(() => { const sig = settings.value.signatures[0]; const bytes = Uint8Array.from(atob(sig.png.split(",")[1]), c => c.charCodeAt(0)); const w = 160, h = 160 * sig.h / sig.w; return addMark(file, page, { type: "Stamp", rect: [p[0] - w / 2, p[1] - h / 2, p[0] + w / 2, p[1] + h / 2], image: bytes, subject: "Signature" }); }) },
    "-",
    "speechSynthesis" in window && { label: window.speechSynthesis.speaking ? _t("Stop reading aloud") : _t("Read aloud from here"), icon: window.speechSynthesis.speaking ? "pause" : "speaker", run: () => { if (window.speechSynthesis.speaking) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); else window.dispatchEvent(new CustomEvent("bl-read-aloud", { detail: { fileId: file.id, page } })); } },
    "speechSynthesis" in window && ts && ts.fileId === file.id && ts.text && { label: _t("Read aloud the text you chose"), icon: "speaker", run: () => window.dispatchEvent(new CustomEvent("bl-read-aloud", { detail: { fileId: file.id, page, text: ts.text } })) },
    { label: _t("Change the text of the PDF here"), icon: "edit", run: () => { tool.value = "edit"; toast(_t("Click the line to change.")); } },
    !readOnly && { label: _t("Take all the marks off this page"), icon: "eraser", run: async () => {
      if (!(await confirm(_t("Take all the marks off this page?"), _t("Highlights, drawings, notes, stamps... Undo (Ctrl+Z) brings them back."), { ok: _t("Take them off"), danger: true }))) return;
      const doc = await getDoc(file); await call("deleteAllAnnots", doc.key, page); afterEdit(file.id);
    } },
    { label: _t("All pages (grid)"), icon: "grid", run: () => openPanel("pages", { fileId: file.id }) },
  ]);
  void k;
}

function Overlay({ file, page, k, pw, ph, readOnly }) {
  const ref = useRef();
  const [ink, setInk] = useState(null);       // points while drawing
  const [box, setBox] = useState(null);       // shape being drawn [x0,y0,x1,y1]
  const [edit, setEdit] = useState(null);     // inline text {x,y,w,h,kind,value,size,line}
  const [drag, setDrag] = useState(null);
  const [marks, setMarks] = useState(null);
  const selBusy = useRef(false);
  const d = docState.value[file.id] || {};
  const t = tool.value;
  const o = toolOpts.value;
  const sel = selectedMark.value;
  const isSel = sel && sel.fileId === file.id && sel.page === page;
  const ts = textSel.value;
  const hits = searchHits.value;

  useEffect(() => { setMarks(null); }, [d.v]);
  useEffect(() => {
    const f = () => {
      const s = selectedMark.value;
      if (s && s.fileId === file.id && s.page === page && (s.type === "FreeText" || s.type === "Text")) {
        const r = s.rect;
        setEdit({ x: r[0], y: r[1], w: r[2] - r[0], h: r[3] - r[1], kind: "change", value: s.contents, size: 12, m: s });
      }
    };
    window.addEventListener("bl-edit-mark", f);
    return () => window.removeEventListener("bl-edit-mark", f);
  }, [file.id, page]);
  const getMarks = async () => {
    if (marks) return marks;
    const m = await marksOn(file, page);
    setMarks(m);
    return m;
  };

  const down = async (e) => {
    if (e.button && e.button !== 0) return;
    const el = ref.current;
    const p = ptOf(e, el, k);
    if (edit) return;
    if (t === "select" || t === "eraser") {
      // capture the pointer now (after a wait the browser may refuse it), then find the mark under it
      if (e.pointerType !== "touch") try { el.setPointerCapture(e.pointerId); } catch (err) {}
      const list = readOnly ? [] : await getMarks();
      const m = hitMark(list, p);
      if (t === "eraser") {
        if (m) { await deleteMark(file, page, m.i); selectedMark.value = null; }
        return;
      }
      const touch = e.pointerType === "touch";
      if (m) {
        selectedMark.value = { fileId: file.id, page, ...m };
        textSel.value = null;
        if (!touch) setDrag({ kind: "move", start: p, dx: 0, dy: 0, m, ghost: snap(m.rect) });
        return;
      }
      selectedMark.value = null;
      if (touch) return;            // a finger on the page scrolls it
      setDrag({ kind: "text", start: p });
      textSel.value = null;
      return;
    }
    if (readOnly) { await ensureWritable(file); return; }
    if (t === "highlight") {
      clearTimeout(backTimer);
      el.setPointerCapture(e.pointerId);
      setDrag({ kind: "hl", start: p });
      return;
    }
    if (t === "pen" || t === "whitebrush") {
      clearTimeout(backTimer);
      el.setPointerCapture(e.pointerId);
      setInk([p]);
      return;
    }
    if (t === "shape" || t === "whitebox" || t === "redact" || t === "crop") {
      el.setPointerCapture(e.pointerId);
      setBox([p[0], p[1], p[0], p[1]]);
      return;
    }
    if (t === "tick" || t === "cross") {
      await placed(file, page, await quickMark(file, page, t, p, o), false);
      return;
    }
    if (t === "date" || t === "initials") {
      // today's date, or your initials, as text where you click (Fill & Sign)
      e.preventDefault();
      const { fmtDate, initials } = await import("../util.js");
      const u = store.value?.user || {};
      const words = t === "date" ? fmtDate(new Date()) : (settings.value.initials || initials(u.name || u.email || "Me"));
      const sz = o.textSize || 12;
      await placed(file, page, await addMark(file, page, { type: "FreeText", rect: [p[0], p[1] - sz * 0.75, p[0] + words.length * sz * 0.58 + 8, p[1] + sz * 0.55], text: words, size: sz, color: rgb(o.textColor || "#1E1C2B"), subject: t === "date" ? "Date" : "Initials" }), false);
      return;
    }
    if (t === "text") {
      e.preventDefault();
      setEdit({ x: p[0], y: p[1] - 8, w: 220, h: 26, kind: "text", value: "", size: o.textSize || 12 });
      return;
    }
    if (t === "comment") {
      e.preventDefault();
      if (readOnly) { toast(_t("Comments go on PDFs. Right-click the page to make a PDF copy.")); return; }
      commentsOpen.value = { draft: { fileId: file.id, page, x: p[0], y: p[1] } };
      if (!toolLock.value) tool.value = "select";
      return;
    }
    if (t === "note") {
      e.preventDefault();
      setEdit({ x: p[0], y: p[1], w: 170, h: 110, kind: "note", value: "", size: 12, paper: o.paper || "#FFED8C" });
      return;
    }
    if (t === "stamp") {
      const spec = stampSpec(o.stamp);
      const w = spec.w || 150, h = spec.h || 46;
      await placed(file, page, await addMark(file, page, { type: "Stamp", rect: [p[0] - w / 2, p[1] - h / 2, p[0] + w / 2, p[1] + h / 2], text: spec.text, sub: spec.sub, color: spec.color, subject: "Stamp" }));
      return;
    }
    if (t === "sign") {
      const sig = (settings.value.signatures || [])[0];
      if (!sig) { openPanel("signature"); return; }
      const bytes = Uint8Array.from(atob(sig.png.split(",")[1]), c => c.charCodeAt(0));
      const w = 160, h = 160 * sig.h / sig.w;
      await placed(file, page, await addMark(file, page, { type: "Stamp", rect: [p[0] - w / 2, p[1] - h / 2, p[0] + w / 2, p[1] + h / 2], image: bytes, subject: "Signature" }));
      return;
    }
    if (t === "picture") {
      const pic = o.picture;
      if (!pic) { toast(_t("Choose a picture first (the stamp menu).")); return; }
      const w = 160, h = 160 * pic.h / pic.w;
      await placed(file, page, await addMark(file, page, { type: "Stamp", rect: [p[0] - w / 2, p[1] - h / 2, p[0] + w / 2, p[1] + h / 2], image: pic.bytes, subject: "Picture" }));
      return;
    }
    if (t === "edit") {
      const doc = await getDoc(file);
      const line = await call("lineAt", doc.key, page, p);
      if (!line) {
        if (!(await call("hasText", doc.key, page))) {
          const ok = await confirm(_t("This page is a scan"), _t("To change its words, BindLens first reads them (it takes a moment). Read the words of this page?"), { ok: _t("Read the words") });
          if (ok) {
            toast(_t("Reading the words of the page..."));
            const { readScannedPage } = await import("../ocr.js");
            const n = await readScannedPage(file, page);
            toast(n ? _t("{0} words read. Click a line to change it.", n) : _t("No words were found on this page."), n ? "ok" : "");
          }
          return;
        }
        toast(_t("Click on a line of text to change it."));
        return;
      }
      setEdit({ x: line.bbox.x - 2, y: line.bbox.y - 2, w: Math.max(line.bbox.w + 40, 120), h: line.bbox.h + 6, kind: "edit", value: line.text, size: line.size, line });
    }
  };

  const move = async (e) => {
    const el = ref.current;
    if (!el) return;
    if (pinching) { if (ink) setInk(null); if (box) setBox(null); if (drag) setDrag(null); return; }
    const p = ptOf(e, el, k);
    if (ink) { setInk([...ink, p]); return; }
    if (box) { setBox([box[0], box[1], p[0], p[1]]); return; }
    if (drag) {
      if (drag.kind === "move") setDrag({ ...drag, dx: p[0] - drag.start[0], dy: p[1] - drag.start[1] });
      else if (drag.kind === "resize") setDrag({ ...drag, res: resizedRect(drag, p, e.shiftKey) });
      else if (drag.kind === "end") setDrag({ ...drag, pt: p });
      else if (drag.kind === "rotate") {
        const a = (Math.atan2(p[1] - drag.c[1], p[0] - drag.c[0]) - drag.a0) * 180 / Math.PI;
        let total = (drag.m.rot || 0) + a;
        if (e.shiftKey) total = Math.round(total / 15) * 15;
        else { const near = Math.round(total / 45) * 45; if (Math.abs(total - near) < 4) total = near; }
        total = ((total + 540) % 360) - 180;
        let delta = total - (drag.m.rot || 0);
        delta = ((delta + 540) % 360) - 180;
        setDrag({ ...drag, delta, total });
      }
      else if (drag.kind === "text" || drag.kind === "hl") {
        if (Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]) < 2) return;
        if (selBusy.current) return;          // one question to the engine at a time while the mouse moves
        selBusy.current = true;
        try {
          const doc = await getDoc(file);
          const r = await call("select", doc.key, page, drag.start, p);
          textSel.value = { fileId: file.id, page, quads: r.quads, text: r.text, temp: drag.kind === "hl" };
        } finally { selBusy.current = false; }
      }
    }
  };

  const up = async (e) => {
    const el = ref.current;
    if (pinching) return;
    if (ink) {
      const pts = ink;
      setInk(null);
      if (pts.length > 1) {
        if (t === "whitebrush") await addMark(file, page, { type: "Ink", ink: [pts], color: [1, 1, 1], width: o.brush || 14, subject: "White brush" });
        else await addMark(file, page, { type: "Ink", ink: [pts], color: rgb(o.pen), width: o.width || 2 });
      }
      placedLater();
      return;
    }
    if (box) {
      const [x0, y0, x1, y1] = box;
      setBox(null);
      if (Math.abs(x1 - x0) < 3 && Math.abs(y1 - y0) < 3) return;
      const r = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
      if (t === "whitebox") {
        await placed(file, page, await addMark(file, page, { type: "Square", rect: r, color: [1, 1, 1], fill: [1, 1, 1], width: 0, subject: "White box" }));
        return;
      }
      if (t === "redact") {
        const ok = await confirm(_t("Erase it for good?"), _t("The words, lines and pictures under the box are taken out of the PDF, so nobody can copy or find them. It cannot come back once saved (Undo works until then)."), { ok: _t("Erase for good"), danger: true });
        if (!ok) return;
        const doc = await getDoc(file);
        await call("eraseArea", doc.key, page, r, false, -1);
        afterEdit(file.id, "pages");
        placed(file, page, -1, false);
        return;
      }
      if (t === "crop") {
        const pageW = pw, pageH = ph;
        const margins = [r[0], r[1], pageW - r[2], pageH - r[3]].map(v => Math.max(0, v));
        openMenuAt(e.clientX, e.clientY + 8, [
          { label: _t("Crop this page to the box"), icon: "fit", run: async () => { const doc = await getDoc(file); await call("crop", doc.key, page, margins); afterEdit(file.id, "pages"); tool.value = "select"; } },
          { label: _t("Crop every page the same"), icon: "grid", run: async () => { const doc = await getDoc(file); await call("crop", doc.key, -1, margins); afterEdit(file.id, "pages"); tool.value = "select"; } },
          { label: _t("Cancel"), icon: "close", run: () => {} },
        ]);
        return;
      }
      const shape = o.shape || "rect";
      let n;
      if (shape === "line" || shape === "arrow") n = await addMark(file, page, { type: "Line", a: [x0, y0], b: [x1, y1], color: rgb(o.pen), width: o.width || 2, arrow: shape === "arrow" });
      else n = await addMark(file, page, { type: shape === "circle" ? "Circle" : "Square", rect: r, color: rgb(o.pen), width: o.width || 2, fill: o.fill ? rgb(mix(o.pen, "#ffffff", 0.78)) : null });
      await placed(file, page, n);
      return;
    }
    if (drag) {
      const dr = drag;
      setDrag(null);
      if (dr.kind === "move") {
        if (Math.abs(dr.dx) > 1 || Math.abs(dr.dy) > 1) {
          const r = dr.m.rect;
          selectedMark.value = { ...selectedMark.value, rect: [r[0] + dr.dx, r[1] + dr.dy, r[2] + dr.dx, r[3] + dr.dy] };
          await editMark(file, page, dr.m.i, { moveBy: [dr.dx, dr.dy], stamp: null });
          await reselect(file, page, dr.m.i);
        }
        return;
      }
      if (dr.kind === "resize") {
        const res = dr.res;
        if (!res || Math.abs(res.s - 1) < 0.005 && res.rect.every((v, j) => Math.abs(v - dr.m.rect[j]) < 0.5)) return;
        const ch = { resize: res.rect };
        if (isPlainText(dr.m) && (dr.h.length === 2 || dr.m.rot)) ch.size = Math.round((dr.m.size || 12) * res.s * 10) / 10;
        selectedMark.value = { ...selectedMark.value, rect: res.rect, rw: dr.m.rw && dr.m.rw * res.s, rh: dr.m.rh && dr.m.rh * res.s };
        await editMark(file, page, dr.m.i, ch);
        await reselect(file, page, dr.m.i);
        return;
      }
      if (dr.kind === "rotate") {
        if (Math.abs(dr.delta || 0) < 0.3) return;
        await editMark(file, page, dr.m.i, { rotateBy: dr.delta });
        await reselect(file, page, dr.m.i);
        return;
      }
      if (dr.kind === "end") {
        if (!dr.pt) return;
        const L = dr.m.line;
        await editMark(file, page, dr.m.i, { line: dr.h === "a" ? [dr.pt, L[1]] : [L[0], dr.pt] });
        await reselect(file, page, dr.m.i);
        return;
      }
      if (dr.kind === "hl") {
        // the selection up to where the mouse let go
        try {
          const doc = await getDoc(file);
          const r = await call("select", doc.key, page, dr.start, ptOf(e, el, k));
          if (r.quads && r.quads.length) textSel.value = { fileId: file.id, page, quads: r.quads, text: r.text, temp: true };
        } catch (err) {}
        const s = textSel.value;
        textSel.value = null;
        if (s && s.quads && s.quads.length) {
          const kind = o.hlKind || "Highlight";
          await addMark(file, page, { type: kind, quads: s.quads, color: kind === "Highlight" ? rgb(o.color) : rgb(o.pen) });
        }
        placedLater();
        return;
      }
      if (dr.kind === "text") {
        // the words you chose: the selection bar (TextSelBar) comes above them
        const s = textSel.value;
        if (s && s.text && s.text.trim()) textSel.value = { ...s, done: true };
        void el;
      }
    }
  };

  const commit = async (ed, value, fmt) => {
    setEdit(null);
    const v = (value || "").replace(/\s+$/, "");
    if (ed.kind === "edit") {
      const l0 = ed.line;
      const same = !fmt || (fmt.family === (l0.family || "sans") && Math.abs(fmt.size - l0.size) < 0.05 && !!fmt.bold === !!l0.bold && !!fmt.italic === !!l0.italic && JSON.stringify(fmt.color) === JSON.stringify(l0.color || null));
      if (v === l0.text && same) return;
      const l = fmt ? { ...l0, family: fmt.family, size: fmt.size, bold: fmt.bold, italic: fmt.italic, color: fmt.color || l0.color } : l0;
      const doc = await getDoc(file);
      await call("replaceText", doc.key, page, [l.bbox.x - 0.5, l.bbox.y, l.bbox.x + l.bbox.w + 0.5, l.bbox.y + l.bbox.h],
        [{ x: l.x, y: l.y, text: v, size: l.size, family: l.family, bold: l.bold, italic: l.italic, color: l.color }]);
      afterEdit(file.id, "pages");
      placed(file, page, -1, false);
      return;
    }
    if (!v.trim()) { if (ed.kind === "text" || ed.kind === "note") placed(file, page, -1, false); return; }
    const lines = v.split("\n");
    if (ed.kind === "text") {
      const size = ed.size;
      const wpt = Math.max(...lines.map(l => l.length)) * size * 0.56 + 8;
      const hpt = lines.length * size * 1.25 + 6;
      const style = o.textStyle && o.textStyle !== "plain" ? { style: o.textStyle } : null;
      await placed(file, page, await addMark(file, page, { type: "FreeText", rect: [ed.x, ed.y, ed.x + wpt + (style ? 12 : 0), ed.y + hpt + (style ? 8 : 0)], text: v, size, color: rgb(o.textColor || "#1E1C2B"), style }));
    } else if (ed.kind === "note") {
      await placed(file, page, await addMark(file, page, { type: "FreeText", rect: [ed.x, ed.y, ed.x + ed.w, ed.y + Math.max(ed.h, lines.length * 16 + 14)], text: v, size: 12, color: [0.15, 0.13, 0.3], fill: rgb(o.paper || "#FFED8C"), subject: "Sticky note" }));
    }
  };

  // a picture of the mark as it is now, to move, turn or resize while the mouse is down
  const snap = (r) => {
    try {
      const c = ref.current?.parentElement?.querySelector("canvas");
      if (!c || !c.width) return null;
      const sc = c.width / (pw * k * PT), pad = 2;
      const x = Math.max(0, (r[0] - pad) * k * PT * sc), y = Math.max(0, (r[1] - pad) * k * PT * sc);
      const w = Math.min(c.width - x, (r[2] - r[0] + pad * 2) * k * PT * sc), h = Math.min(c.height - y, (r[3] - r[1] + pad * 2) * k * PT * sc);
      if (w < 2 || h < 2 || w * h > 6e6) return null;
      const cv = document.createElement("canvas");
      cv.width = Math.round(w); cv.height = Math.round(h);
      cv.getContext("2d").drawImage(c, x, y, w, h, 0, 0, cv.width, cv.height);
      return cv.toDataURL();
    } catch (err) { return null; }
  };
  const grab = (e, kind, h) => {
    if (e.button && e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const el = ref.current;
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    const p = ptOf(e, el, k);
    const m = selectedMark.value;
    if (!m || readOnly) return;
    const r = m.rect, c = [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
    const base = { kind, h, start: p, m, ghost: kind === "end" ? null : snap(r) };
    if (kind === "move") setDrag({ ...base, dx: 0, dy: 0 });
    else if (kind === "rotate") setDrag({ ...base, c, a0: Math.atan2(p[1] - c[1], p[0] - c[0]), delta: 0, total: m.rot || 0 });
    else setDrag(base);
  };

  const toPx = (v) => v * k * PT;
  const S = (r) => ({ left: toPx(r[0]) + "px", top: toPx(r[1]) + "px", width: toPx(r[2] - r[0]) + "px", height: toPx(r[3] - r[1]) + "px" });
  const quadRect = (q) => [Math.min(q[0], q[4]), Math.min(q[1], q[3]), Math.max(q[2], q[6]), Math.max(q[5], q[7])];

  const myHits = hits && hits.list.filter(h => h.fileId === file.id && h.page === page);

  return (
    <div ref={ref} class={"ov tool-" + t} onPointerDown={down} onPointerMove={move} onPointerUp={up}
      onContextMenu={async (e) => { e.preventDefault(); const pt = ptOf(e, ref.current, k); const list = readOnly ? [] : await getMarks(); pageMenu(e, file, page, pt, readOnly, list, setEdit, k); }}
      onPointerEnter={() => { if (!readOnly && !marks && (t === "select" || t === "eraser")) getMarks(); }}
      onDblClick={async (e) => {
        if (t !== "select" || readOnly) return;
        const list = await getMarks();
        const m = hitMark(list, ptOf(e, ref.current, k));
        if (m && (m.type === "FreeText" || m.type === "Text")) {
          const r = m.rect;
          setEdit({ x: r[0], y: r[1], w: r[2] - r[0], h: r[3] - r[1], kind: "change", value: m.contents, size: 12, m });
        }
      }}>
      {aloudMark.value && aloudMark.value.fileId === file.id && aloudMark.value.page === page && <>
        {aloudMark.value.rects.map((r, i) => <div key={"al" + i} class="aloudline" style={S([r[0] - 2, r[1] - 1, r[2] + 2, r[3] + 1])} />)}
        {aloudMark.value.line && <div class="aloudnow" style={S([aloudMark.value.line[0] - 2, aloudMark.value.line[3] - 1, aloudMark.value.line[2] + 2, aloudMark.value.line[3] + 1.2])} />}
      </>}
      {myHits && myHits.map((h, i) => h.quads.map((q, j) => (
        <div key={i + ":" + j} class={"hit" + (hits.cur && hits.cur.fileId === file.id && hits.cur.page === page && hits.cur.n === h.n ? " cur" : "")} style={S(quadRect(q))} />
      )))}
      {ts && ts.fileId === file.id && ts.page === page && ts.quads.map((q, i) => <div key={i} class="sel" style={{ ...S(quadRect(q)), background: ts.temp ? (o.color + "88") : undefined }} />)}
      {isSel && !edit && <SelFrame sel={sel} drag={drag} toPx={toPx} grab={grab} readOnly={readOnly} />}
      {ink && (
        <svg class="inkpath" width={toPx(pw)} height={toPx(ph)}>
          <polyline points={ink.map(p => toPx(p[0]) + "," + toPx(p[1])).join(" ")} fill="none" stroke={t === "whitebrush" ? "#ffffff" : o.pen} stroke-width={(t === "whitebrush" ? o.brush || 14 : o.width || 2) * k * PT} stroke-linecap="round" stroke-linejoin="round" style={t === "whitebrush" ? { filter: "drop-shadow(0 0 1px #9a98a8)" } : null} />
        </svg>
      )}
      {box && (() => {
        const r = [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])];
        const shape = t === "shape" ? (o.shape || "rect") : "rect";
        if (t !== "shape") {
          const look = t === "whitebox" ? { fill: "#fff", stroke: "#9a98a8", dash: "4 3" } : t === "redact" ? { fill: "rgba(224,49,49,.18)", stroke: "#E03131", dash: "" } : { fill: "rgba(91,141,239,.08)", stroke: "#5B8DEF", dash: "6 4" };
          return (
            <svg class="inkpath" width={toPx(pw)} height={toPx(ph)}>
              <rect x={toPx(r[0])} y={toPx(r[1])} width={toPx(r[2] - r[0])} height={toPx(r[3] - r[1])} fill={look.fill} stroke={look.stroke} stroke-width="1.5" stroke-dasharray={look.dash} />
            </svg>
          );
        }
        return (
          <svg class="inkpath" width={toPx(pw)} height={toPx(ph)}>
            {shape === "circle" ? <ellipse cx={toPx((r[0] + r[2]) / 2)} cy={toPx((r[1] + r[3]) / 2)} rx={toPx((r[2] - r[0]) / 2)} ry={toPx((r[3] - r[1]) / 2)} fill="none" stroke={o.pen} stroke-width="2" />
              : shape === "line" || shape === "arrow" ? <line x1={toPx(box[0])} y1={toPx(box[1])} x2={toPx(box[2])} y2={toPx(box[3])} stroke={o.pen} stroke-width="2" />
                : <rect x={toPx(r[0])} y={toPx(r[1])} width={toPx(r[2] - r[0])} height={toPx(r[3] - r[1])} fill="none" stroke={o.pen} stroke-width="2" />}
          </svg>
        );
      })()}
      {edit && <InlineEdit ed={edit} k={k} onDone={async (v, fmt) => {
        if (edit.kind === "change") {
          setEdit(null);
          if (v !== edit.m.contents) await editMark(file, page, edit.m.i, { contents: v });
        } else commit(edit, v, fmt);
      }} />}
    </div>
  );
}

// the chosen mark: a frame with handles round it (the corners to resize, the round knob above to turn it,
// the two ends of a line), and while the mouse is down a picture of it that follows
function SelFrame({ sel, drag, toPx, grab, readOnly }) {
  const H = handlesOf(sel);
  const r = sel.rect;
  let cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
  let w = sel.rot ? (sel.rw || r[2] - r[0]) : r[2] - r[0], h = sel.rot ? (sel.rh || r[3] - r[1]) : r[3] - r[1];
  let deg = sel.rot || 0;
  // the picture of the mark while it moves: its box, how much it is turned and how big
  let g = { x0: r[0], y0: r[1], x1: r[2], y1: r[3], turn: 0 };
  const dk = drag && drag.m && drag.m.i === sel.i ? drag.kind : null;
  if (dk === "move") { cx += drag.dx; cy += drag.dy; g = { x0: r[0] + drag.dx, y0: r[1] + drag.dy, x1: r[2] + drag.dx, y1: r[3] + drag.dy, turn: 0 }; }
  if (dk === "resize" && drag.res) {
    const n = drag.res.rect;
    if (sel.rot) { w *= drag.res.s; h *= drag.res.s; } else { w = n[2] - n[0]; h = n[3] - n[1]; }
    cx = (n[0] + n[2]) / 2; cy = (n[1] + n[3]) / 2;
    g = { x0: n[0], y0: n[1], x1: n[2], y1: n[3], turn: 0 };
  }
  if (dk === "rotate") { deg = drag.total; g = { ...g, turn: drag.delta }; }
  const pad = 3;
  const frame = { left: toPx(cx - w / 2) - pad + "px", top: toPx(cy - h / 2) - pad + "px", width: toPx(w) + pad * 2 + "px", height: toPx(h) + pad * 2 + "px",
    transform: deg ? `rotate(${deg}deg)` : undefined };
  const busy = dk && dk !== "end";
  const L = sel.line && (dk === "move" ? sel.line.map(q => [q[0] + drag.dx, q[1] + drag.dy]) : sel.line);
  const ends = H.ends && L && !readOnly ? [["a", dk === "end" && drag.h === "a" && drag.pt ? drag.pt : L[0]], ["b", dk === "end" && drag.h === "b" && drag.pt ? drag.pt : L[1]]] : null;
  return (
    <>
      {busy && drag.ghost && (
        <img class="markghost" src={drag.ghost} alt="" style={{ left: toPx(g.x0 - 2) + "px", top: toPx(g.y0 - 2) + "px", width: toPx(g.x1 - g.x0 + 4) + "px", height: toPx(g.y1 - g.y0 + 4) + "px",
          transform: g.turn ? `rotate(${g.turn}deg)` : undefined }} />
      )}
      {!ends && (
        <div class={"selframe" + (busy ? " busy" : "") + (readOnly ? " ro" : "")} style={frame} onPointerDown={(e) => grab(e, "move")}>
          {!readOnly && H.list.map(x => <i key={x} class={"hd " + x} onPointerDown={(e) => grab(e, "resize", x)} />)}
          {!readOnly && H.rotate && <span class="rk" title={_t("Turn it (Shift: in steps of 15°)")} onPointerDown={(e) => grab(e, "rotate")}><Icon n="rotate" size={13} /></span>}
          {dk === "rotate" && <b class="selbadge">{Math.round(drag.total)}°</b>}
          {dk === "resize" && drag.res && <b class="selbadge">{Math.round(drag.res.s * 100)}%</b>}
        </div>
      )}
      {ends && <>
        <svg class="inkpath" style={{ overflow: "visible" }} width="1" height="1"><line x1={toPx(ends[0][1][0])} y1={toPx(ends[0][1][1])} x2={toPx(ends[1][1][0])} y2={toPx(ends[1][1][1])} stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5 4" /></svg>
        <div class="selline" style={{ left: toPx(Math.min(ends[0][1][0], ends[1][1][0])) - 6 + "px", top: toPx(Math.min(ends[0][1][1], ends[1][1][1])) - 6 + "px", width: toPx(Math.abs(ends[1][1][0] - ends[0][1][0])) + 12 + "px", height: toPx(Math.abs(ends[1][1][1] - ends[0][1][1])) + 12 + "px" }} onPointerDown={(e) => grab(e, "move")} />
        {ends.map(([key, pt]) => <i key={key} class="hd end" style={{ left: toPx(pt[0]) - 7 + "px", top: toPx(pt[1]) - 7 + "px" }} onPointerDown={(e) => grab(e, "end", key)} />)}
      </>}
    </>
  );
}

// a form: its boxes can be filled in on the page itself - type in a box, tick a box, choose from a list
function FormLayer({ file, page, k, v }) {
  const [fields, setFields] = useState([]);
  const [ver, setVer] = useState(0);
  useEffect(() => {
    let alive = true;
    getDoc(file).then(d => call("formFields", d.key, page)).then(list => { if (alive) setFields(list || []); }).catch(() => {});
    return () => { alive = false; };
  }, [file.id, page, v, ver]);
  if (!fields.length) return null;
  const px = (x) => x * k * PT;
  const set = async (f, value) => {
    const d = await getDoc(file);
    await call("setField", d.key, page, f.i, value);
    afterEdit(file.id, "marks");
    setVer(x => x + 1);
  };
  const live = tool.value === "select";
  return (
    <div class={"formlayer" + (live ? "" : " off")}>
      {fields.map(f => {
        const [x0, y0, x1, y1] = f.rect;
        const st = { left: px(x0) + "px", top: px(y0) + "px", width: px(x1 - x0) + "px", height: px(y1 - y0) + "px" };
        const fs = Math.max(9, Math.min(px(y1 - y0) * 0.62, 16 * k * PT));
        if (f.ro) return null;
        if (f.type === "text") {
          const Tag = f.multi ? "textarea" : "input";
          return <Tag key={f.i + ":" + f.value} class="ff ftext" style={{ ...st, fontSize: fs + "px" }} defaultValue={f.value} title={f.name} maxLength={f.max || undefined}
            onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Enter" && !f.multi) e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.value = f.value; e.currentTarget.blur(); } }}
            onBlur={(e) => { if (e.currentTarget.value !== f.value) set(f, e.currentTarget.value); }} />;
        }
        if (f.type === "checkbox" || f.type === "radiobutton") return <button key={f.i} class={"ff fchk" + (f.on ? " on" : "")} style={st} title={f.name} onPointerDown={(e) => e.stopPropagation()} onClick={() => set(f, !f.on)} aria-label={f.name} />;
        if (f.type === "combobox" || f.type === "listbox") return (
          <select key={f.i + ":" + f.value} class="ff fsel" style={{ ...st, fontSize: fs + "px" }} defaultValue={f.value} title={f.name} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => set(f, e.currentTarget.value)}>
            {!f.options.includes(f.value) && <option value={f.value}>{f.value}</option>}
            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>);
        if (f.type === "signature") return <button key={f.i} class="ff fsig" style={st} onPointerDown={(e) => e.stopPropagation()} onClick={() => { tool.value = "sign"; toast(_t("Click inside the box to put your signature there.")); }}>{_t("Sign here")}</button>;
        return null;
      })}
    </div>
  );
}

// Ctrl+E: changing a line of the PDF's own text - a small bar over it to change its font, size, bold, italic, colour
const FAMS = { sans: "Helvetica,Arial,sans-serif", serif: "'Times New Roman',Times,serif", mono: "'Courier New',Courier,monospace" };
function InlineEdit({ ed, k, onDone }) {
  const ref = useRef();
  const done = useRef(false);
  const l = ed.line || {};
  const [fmt, setFmt] = useState({ family: l.family || "sans", size: Math.round((l.size || ed.size || 11) * 10) / 10, bold: !!l.bold, italic: !!l.italic, color: l.color || null });
  useEffect(() => { setTimeout(() => { ref.current?.focus(); if (ed.kind === "edit") ref.current?.select(); }, 20); }, []);
  const finish = () => { if (done.current) return; done.current = true; onDone(ref.current.value, ed.kind === "edit" ? fmt : null); };
  const px = (v) => v * k * PT;
  const note = ed.kind === "note" || (ed.kind === "change" && ed.m?.subject === "Sticky note");
  const keep = (e) => e.preventDefault();          // the bar's buttons keep the words in focus
  const col = fmt.color ? "#" + fmt.color.map(v => Math.round(v * 255).toString(16).padStart(2, "0")).join("") : "#1E1C2B";
  return (
    <>
    {ed.kind === "edit" && (
      <div class="floatbar editbar" style={{ left: px(ed.x) + "px", top: Math.max(0, px(ed.y) - 46) + "px" }} onPointerDown={(e) => { e.stopPropagation(); keep(e); }}>
        <b class="fl-name">{_t("Change text")}</b>
        <span class="rseg">{[["sans", _t("Sans")], ["serif", _t("Serif")], ["mono", _t("Mono")]].map(([f, n]) => <button key={f} class={fmt.family === f ? "on" : ""} onPointerDown={keep} onClick={() => setFmt({ ...fmt, family: f })}>{n}</button>)}</span>
        <span class="rseg"><button onPointerDown={keep} onClick={() => setFmt({ ...fmt, size: Math.max(4, Math.round((fmt.size - 0.5) * 10) / 10) })} title={_t("Smaller")}>−</button>
          <button class="on" style={{ minWidth: 40 }} onPointerDown={keep}>{fmt.size}</button>
          <button onPointerDown={keep} onClick={() => setFmt({ ...fmt, size: Math.round((fmt.size + 0.5) * 10) / 10 })} title={_t("Bigger")}>+</button></span>
        <span class="rseg"><button class={fmt.bold ? "on" : ""} onPointerDown={keep} onClick={() => setFmt({ ...fmt, bold: !fmt.bold })} title={_t("Bold")}><b>B</b></button>
          <button class={fmt.italic ? "on" : ""} onPointerDown={keep} onClick={() => setFmt({ ...fmt, italic: !fmt.italic })} title={_t("Italic")}><i style={{ fontFamily: "Georgia,serif" }}>I</i></button></span>
        <span class="rsws">{["#1E1C2B", "#C2337A", "#1C7ED6", "#2B8A3E", "#E03131"].map(c => <button key={c} class={"rsw" + (col.toLowerCase() === c.toLowerCase() ? " on" : "")} style={{ background: c }} onPointerDown={keep} onClick={() => setFmt({ ...fmt, color: hexToRgb(c) })} title={_t("Colour")} />)}</span>
        <span class="tiny muted">{_t("Enter to keep · Esc")}</span>
      </div>
    )}
    <textarea ref={ref} class="inlineedit" defaultValue={ed.value}
      style={{ left: px(ed.x) + "px", top: px(ed.y) + "px", width: px(ed.w) + "px", minHeight: px(ed.h) + "px",
        fontSize: px(ed.kind === "edit" ? fmt.size : ed.size) + "px", background: note ? (ed.paper || "#FFF1A8") : undefined,
        ...(ed.kind === "edit" ? { fontFamily: FAMS[fmt.family], fontWeight: fmt.bold ? 700 : 400, fontStyle: fmt.italic ? "italic" : "normal", color: col } : {}) }}
      placeholder={ed.kind === "note" ? _t("Write a note...") : ed.kind === "text" ? _t("Type here...") : ""}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") { done.current = true; onDone(ed.value); }
        if (e.key === "Enter" && (ed.kind === "edit" || e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(); }
      }}
      onBlur={finish} />
    </>
  );
}

// "Opening..." - and after a few seconds, why it takes long
function Opening({ file }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 5000); return () => clearTimeout(t); }, [file.id]);
  return <div class="loading">{slow ? <>{_t("Still opening")} {file.name}{file.size ? ` (${fmtSize(file.size)})` : ""} - {["word", "excel", "powerpoint"].includes(file.kind) ? _t("BindLens turns it into pages first") : _t("a big file takes a moment")}...</> : <>{_t("Opening")} {file.name}...</>}</div>;
}

function DocBlock({ book, file, k, maxW, grid }) {
  const st = docState.value[file.id] || {};
  const elRef = useRef();
  useEffect(() => {
    if (!isPaged(file.kind) || file.kind === "image") return;
    if (st.status) return;
    setDoc(file.id, { status: "loading" });
  }, [file.id]);
  if (file.kind === "image") return <ImageBlock file={file} k={k} maxW={maxW} />;
  if (!isPaged(file.kind)) return <MediaBlock file={file} maxW={maxW} />;
  const pages = st.pages || [{ w: 595, h: 842 }];
  return (
    <>
      {st.status === "error" && <div class="mediacard" style={{ "--pw": maxW + "px" }}><div class="other"><Icon n="info" size={28} /><div><b>{file.name}</b><div class="small muted">{st.error}</div></div></div></div>}
      {st.status !== "error" && pages.map((p, i) => (
        <div class="page" key={i} data-file={file.id} data-page={i} ref={i === 0 ? elRef : null}
          style={{ width: p.w * k * PT + "px", height: p.h * k * PT + "px" }}>
          {st.status === "ready" && <PageCanvas file={file} page={i} w={p.w} h={p.h} k={k} v={st.v || 0} />}
          {st.status !== "ready" && i === 0 && <Opening file={file} />}
          {st.status !== "ready" && i > 0 && <div class="loading">{_t("Page")} {i + 1}</div>}
          {st.status === "ready" && !grid && !consult.value && <Overlay file={file} page={i} k={k} pw={p.w} ph={p.h} readOnly={st.readOnly} />}
          {grid && <button class="gridpick" title={_t("Open page {0}", i + 1)} onClick={() => { fitWidth.value = true; fitPage.value = false; zoom.value = 1; fileId.value = file.id; pageNo.value = i; setTimeout(() => { scrollTo.value = { fileId: file.id, page: i }; }, 60); }} />}
          {st.status === "ready" && st.form && !st.readOnly && !grid && <FormLayer file={file} page={i} k={k} v={st.v || 0} />}
          <span class="num">{i + 1}</span>
        </div>
      ))}
    </>
  );
}

const urls = new Map();
async function blobUrl(file) {
  const key = file.id + ":" + (file.md5 || file.modified);
  if (urls.has(key)) return urls.get(key);
  const p = store.value.read(file).then(buf => URL.createObjectURL(new Blob([buf], { type: file.mime || "" })));
  urls.set(key, p);
  return p;
}
export { blobUrl };

function ImageBlock({ file, k, maxW }) {
  const [src, setSrc] = useState(null);
  const [nat, setNat] = useState(null);
  const ref = useRef();
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { blobUrl(file).then(setSrc); io.disconnect(); } },
      { root: ref.current.closest(".pages"), rootMargin: "1200px 0px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [file.id, file.md5]);
  const w = Math.min(maxW, nat ? nat.w : maxW);
  const h = nat ? w * nat.h / nat.w : w * 0.66;
  return (
    <div class="page" ref={ref} data-file={file.id} data-page={0} style={{ width: w + "px", height: h + "px" }}>
      {src ? <img class="imgpage" src={src} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "contain" }}
        onLoad={(e) => setNat({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
        onDblClick={() => openPanel("gallery", { fileId: file.id })} />
        : <div class="loading">{file.name}</div>}
      {src && tool.value !== "select" && <div class="ov" onPointerDown={() => ensureWritable(file)} />}
    </div>
  );
}

function MediaBlock({ file, maxW }) {
  const [src, setSrc] = useState(null);
  const ref = useRef();
  const kind = file.kind;
  useEffect(() => {
    if (kind !== "video" && kind !== "audio") return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { blobUrl(file).then(setSrc); io.disconnect(); } },
      { root: ref.current.closest(".pages"), rootMargin: "600px 0px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [file.id]);
  return (
    <div class="mediacard" ref={ref} data-file={file.id} data-page={0} style={{ "--pw": maxW + "px" }}>
      {kind === "video" ? (src ? <>
        <video src={src} controls playsInline preload="metadata" />
        <div class="row" style={{ padding: "6px 10px" }}><Icon n="video" size={16} /><span class="small grow ellipsis">{file.name}</span>
          <button class="btn plain small" title={_t("Keep it playing in a corner while you read")} onClick={(e) => { const v = e.currentTarget.closest(".mediacard").querySelector("video"); v.pause(); pip.value = { file, src, t: v.currentTime }; }}><Icon n="pip" size={16} />{_t("In a corner")}</button>
          <button class="btn plain small" onClick={() => openPanel("gallery", { fileId: file.id })}><Icon n="expand" size={16} />{_t("Big")}</button></div>
      </> : <div class="other"><Icon n="video" size={28} />{file.name}</div>)
        : kind === "audio" ? (<div style={{ padding: 16 }}><div class="row" style={{ marginBottom: 10 }}><Icon n="audio" size={24} /><b>{file.name}</b></div>{src && <audio src={src} controls />}</div>)
          : (
            <div class="other">
              <Icon n={fileIcon(kind)} size={30} />
              <div class="grow"><b>{file.name}</b><div class="small muted">{fmtSize(file.size)} {_t("· BindLens cannot show this kind of file.")}</div></div>
              <button class="btn soft small" onClick={async () => { const u = await blobUrl(file); const a = document.createElement("a"); a.href = u; a.download = file.name; a.click(); }}><Icon n="download" />{_t("Download")}</button>
            </div>
          )}
    </div>
  );
}

export function Viewer({ book }) {
  const scroller = useRef();
  const [W, setW] = useState(900);
  const loading = useRef(false);
  const files = visibleFiles(book);
  void subView.value;

  // open the documents of the book, the one you are going to first
  useEffect(() => {
    let alive = true;
    (async () => {
      const first = fileId.value;
      const order = [...files].sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : 0));
      for (const f of order) {
        if (!alive) return;
        if (!isPaged(f.kind) || f.kind === "image") continue;
        const st = docState.value[f.id];
        if (st && st.status === "ready" && (st.md5 === (f.md5 || f.modified) || isOpen(f.id))) continue;
        if (!st || st.status !== "ready") setDoc(f.id, { status: "loading" });
        try {
          const d = await getDoc(f);
          if (!alive) return;
          setDoc(f.id, { status: "ready", pages: d.pages, readOnly: d.readOnly, isPDF: d.isPDF, form: !!d.form, md5: f.md5 || f.modified, v: (docState.value[f.id]?.v || 0) + 1 });
        } catch (e) {
          setDoc(f.id, { status: "error", error: String(e.message || e) });
        }
      }
    })();
    return () => { alive = false; };
  }, [book.id, files.map(f => f.id + (f.md5 || "")).join()]);

  const [H, setH] = useState(700);
  useEffect(() => {
    const el = scroller.current;
    const ro = new ResizeObserver(([e]) => { setW(e.contentRect.width); setH(e.contentRect.height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the scale: fit the widest page to the window, or the zoom the user chose
  let maxPt = 595;
  for (const f of files) { const st = docState.value[f.id]; if (st && st.pages) for (const p of st.pages) maxPt = Math.max(maxPt, Math.min(p.w, 1400)); }
  // reading mode, two pages side by side: each page half the room
  const spread = readMode.value && (settings.value.reading || {}).spread && W > 900;
  const avail0 = Math.max(240, W - (W < 700 ? 16 : 90));
  const avail = spread ? avail0 / 2 - 14 : avail0;
  let fitK = Math.min(avail / (maxPt * PT), readMode.value ? 1.35 : 1.6);
  if (fitPage.value) {
    const cur = docState.value[fileId.value]?.pages?.[pageNo.value] || { w: 595, h: 842 };
    fitK = Math.min(avail / (cur.w * PT), (H - 30) / (cur.h * PT));
  }
  const k = fitWidth.value ? fitK * zoom.value : zoom.value;
  const maxW = Math.min(avail, 900 * k);
  const grid = !spread && maxPt * k * PT < avail * 0.36;           // small pages: side by side, a click opens one

  // which page is in the middle of the screen
  const onScroll = useCallback(debounce(() => {
    const el = scroller.current;
    if (!el) return;
    const mid = el.getBoundingClientRect().top + el.clientHeight * 0.35;
    let best = null;
    for (const p of el.querySelectorAll("[data-file]")) {
      const r = p.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) { best = p; break; }
      if (r.top > mid) { best = best || p; break; }
      best = p;
    }
    if (best) {
      const f = best.getAttribute("data-file"), pg = Number(best.getAttribute("data-page"));
      if (fileId.value !== f || pageNo.value !== pg) { fileId.value = f; pageNo.value = pg; }
      rememberPlace();
    }
  }, 120), []);

  // go to a document / page when asked (the file list, Find, Continue...)
  const goto = (fid, page, y, soft) => {
    const el = scroller.current;
    if (!el) return false;
    const target = el.querySelector(`[data-file="${fid}"][data-page="${page || 0}"]`) || el.querySelector(`[data-file="${fid}"]`);
    if (!target) return false;
    const top = target.offsetTop - 14 + (y != null ? y * k * PT - el.clientHeight * 0.3 : 0);
    if (soft) {
      const yy = target.offsetTop + (y || 0) * k * PT;
      if (yy > el.scrollTop + 40 && yy < el.scrollTop + el.clientHeight * 0.8) return true;
      el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      return true;
    }
    el.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    return true;
  };
  useLayoutEffect(() => {
    const s = scrollTo.value;
    if (!s) return;
    if (goto(s.fileId, s.page, s.y, s.soft)) {
      const st = docState.value[s.fileId];
      if (!st || st.status === "ready" || !isPaged(fileFor(s.fileId)?.kind || "")) scrollTo.value = null;
    }
  }, [scrollTo.value, docState.value, k]);
  // first open: the page you were on
  useEffect(() => { if (fileId.value) scrollTo.value = { fileId: fileId.value, page: pageNo.value }; }, [book.id]);

  // keep the same page in view when the zoom changes (after a pinch: the very point under the fingers)
  const prevK = useRef(k);
  const anchor = useRef(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    const inner = el && el.querySelector(".pages-in");
    if (inner) { inner.style.transform = ""; inner.style.transformOrigin = ""; }
    const a = anchor.current;
    anchor.current = null;
    if (prevK.current !== k && a && el) {
      const pg = el.querySelector(`[data-file="${a.fileId}"][data-page="${a.page}"]`);
      if (pg) {
        el.scrollTop = pg.offsetTop + a.fy * pg.offsetHeight - a.ay;
        el.scrollLeft = pg.offsetLeft + a.fx * pg.offsetWidth - a.ax;
      }
    } else if (prevK.current !== k && fileId.value) goto(fileId.value, pageNo.value);
    prevK.current = k;
  }, [k]);

  // zoom with two fingers (a phone, a tablet, a touchpad) or Ctrl + the mouse wheel, round the point you pinch:
  // the pages grow at once as a picture, and are drawn sharp again when you stop
  const kRef = useRef(k);
  kRef.current = k;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let g = null;                 // the pinch going on: {s (scale so far), ax, ay (point in the scroller), timer}
    const inner = () => el.querySelector(".pages-in");
    const begin = (cx, cy) => {
      const r = el.getBoundingClientRect();
      const ax = cx - r.left, ay = cy - r.top;
      const inn = inner();
      if (inn) inn.style.transformOrigin = `${el.scrollLeft + ax - inn.offsetLeft}px ${el.scrollTop + ay - inn.offsetTop}px`;
      // the page under the fingers, and where on it
      let a = null;
      for (const pg of el.querySelectorAll(".page[data-file]")) {
        const b = pg.getBoundingClientRect();
        if (cy >= b.top - 9 && cy <= b.bottom + 9) { a = { fileId: pg.getAttribute("data-file"), page: Number(pg.getAttribute("data-page")), fx: (cx - b.left) / b.width, fy: (cy - b.top) / b.height, ax, ay }; break; }
      }
      g = { s: 1, ax, ay, a, timer: null };
    };
    const show = () => { const inn = inner(); if (inn && g) inn.style.transform = `scale(${g.s})`; };
    const commit = () => {
      if (!g) return;
      const z0 = zoom.value;
      const z = Math.max(0.08, Math.min(5, z0 * g.s));
      anchor.current = g.a;
      g = null;
      if (Math.abs(z - z0) < 0.005) { const inn = inner(); if (inn) inn.style.transform = ""; return; }
      zoom.value = z;
    };
    const limit = (s) => { const z0 = zoom.value; return Math.max(0.08 / z0, Math.min(5 / z0, s)); };
    const wheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (!g) begin(e.clientX, e.clientY);
      g.s = limit(g.s * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022)));
      show();
      clearTimeout(g.timer);
      g.timer = setTimeout(commit, 180);
    };
    let t0 = null;               // two fingers: their distance at the start
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const tstart = (e) => {
      if (e.touches.length === 2) {
        pinching = true;
        t0 = dist(e.touches);
        begin((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      }
    };
    const tmove = (e) => {
      if (e.touches.length !== 2 || !t0 || !g) return;
      e.preventDefault();
      g.s = limit(dist(e.touches) / t0);
      show();
    };
    const tend = (e) => { if (e.touches.length === 0) pinching = false; if (t0 && e.touches.length < 2) { t0 = null; commit(); } };
    // Safari on a Mac sends its own pinch
    const gs = (e) => { e.preventDefault(); begin(e.clientX, e.clientY); };
    const gc = (e) => { e.preventDefault(); if (!g) begin(e.clientX, e.clientY); g.s = limit(e.scale); show(); };
    const ge = (e) => { e.preventDefault(); commit(); };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchstart", tstart, { passive: true });
    el.addEventListener("touchmove", tmove, { passive: false });
    el.addEventListener("touchend", tend);
    el.addEventListener("touchcancel", tend);
    el.addEventListener("gesturestart", gs);
    el.addEventListener("gesturechange", gc);
    el.addEventListener("gestureend", ge);
    return () => {
      el.removeEventListener("wheel", wheel); el.removeEventListener("touchstart", tstart); el.removeEventListener("touchmove", tmove);
      el.removeEventListener("touchend", tend); el.removeEventListener("touchcancel", tend);
      el.removeEventListener("gesturestart", gs); el.removeEventListener("gesturechange", gc); el.removeEventListener("gestureend", ge);
    };
  }, [files.length > 0]);

  const [drop, setDrop] = useState(false);

  if (!files.length) {
    return (
      <div class="pages" ref={scroller} onDragOver={(e) => { e.preventDefault(); setDrop(true); }} onDragLeave={() => setDrop(false)}
        onDrop={async (e) => { e.preventDefault(); setDrop(false); const { uploadFiles } = await import("../actions.js"); uploadFiles(book, [...e.dataTransfer.files]); }}>
        <div class="empty" style={{ minHeight: "100%" }}>
          <div class="box">
            <h2>{_t("\"{0}\" is empty", book.name)}</h2>
            <p class="muted">{_t("Add PDFs, Word and Excel files, photos or videos. They are saved in your Google Drive, in this book's folder.")}</p>
            <EmptyButtons book={book} />
            {(bookMeta(book.id).checklist || []).length > 0 && <div class="emptycheck">
              <div class="ap-sec">{_t("This book needs")}</div>
              {(bookMeta(book.id).checklist || []).map(it => <div key={it.id} class="small"><Icon n={it.done ? "check" : "circle"} size={14} />{it.text}</div>)}
            </div>}
          </div>
        </div>
        {drop && <div class="dropzone">{_t("Drop to add to \"{0}\"", book.name)}</div>}
      </div>
    );
  }

  return (
    <>
    <div class="pages" ref={scroller} onScroll={onScroll}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setDrop(true); } }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setDrop(false); }}
      onDrop={async (e) => { e.preventDefault(); setDrop(false); const { uploadFiles } = await import("../actions.js"); uploadFiles(book, [...e.dataTransfer.files], { open: false }); }}
      onPointerDown={(e) => { if (e.target === e.currentTarget || e.target.classList.contains("pages-in")) { selectedMark.value = null; textSel.value = null; } }}>
      <div class={"pages-in" + (grid ? " grid" : "") + (spread ? " spread" : "")} style={{ "--pw": maxW + "px" }}>
        {files.map((f) => (
          <div key={f.id} style={{ display: "contents" }}>
            {files.length > 1 && <div class="dochead" style={{ maxWidth: Math.min(avail, (docState.value[f.id]?.pages?.[0]?.w || 595) * k * PT) + "px" }}>
              <Icon n={fileIcon(f.kind)} size={16} /><span class="grow ellipsis">{f.sub ? <span class="muted">{f.sub.replace(/\//g, " / ")} / </span> : null}{f.name}</span>
              {docState.value[f.id]?.pages && <span class="tiny">{docState.value[f.id].pages.length} {_t("page")}{docState.value[f.id].pages.length === 1 ? "" : "s"}</span>}
            </div>}
            <DocBlock book={book} file={f} k={k} maxW={maxW} grid={grid} />
          </div>
        ))}
      </div>
      {drop && <div class="dropzone">{_t("Drop to add to \"{0}\"", book.name)}</div>}
    </div>
    <MarkBar k={k} />
    <TextSelBar />
    <MarkMap scroller={scroller} files={files} k={k} />
    </>
  );
}

// the marks of the book as small ticks on the right edge, at the height where each one is (a click goes there)
function MarkMap({ scroller, files, k }) {
  const [marks, setMarks] = useState([]);
  const [box, setBox] = useState(null);
  const [, setTick] = useState(0);
  const vs = files.map(f => docState.value[f.id]?.v || 0).join();
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = [];
      const { allMarks } = await import("../docs.js");
      for (const f of files) if (f.kind === "pdf") { try { for (const m of await allMarks(f)) out.push({ ...m, fid: f.id }); } catch (e) {} }
      if (alive) setMarks(out);
    })();
    return () => { alive = false; };
  }, [files.map(f => f.id).join(), vs]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const fit = () => { const r = el.getBoundingClientRect(); setBox({ top: r.top + 6, left: r.right - 14, height: r.height - 12 }); setTick(x => x + 1); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [scroller.current, k, marks.length]);
  const el = scroller.current;
  if (!el || !box || !marks.length || box.height < 120) return null;
  const top0 = el.getBoundingClientRect().top - el.scrollTop, H = el.scrollHeight || 1;
  const pos = (m) => {
    const p = el.querySelector(`[data-file="${m.fid}"][data-page="${m.page}"]`);
    if (!p) return null;
    const r = p.getBoundingClientRect();
    const ph = docState.value[m.fid]?.pages?.[m.page]?.h || 842;
    const y = r.top - top0 + (m.rect ? Math.max(0, Math.min(1, m.rect[1] / ph)) : 0) * r.height;
    return y;
  };
  const NOTE = new Set(["Text", "FreeText"]);
  return (
    <div class="markmap" style={{ top: box.top + "px", left: box.left + "px", height: box.height + "px" }} aria-label={_t("The marks of the book")}>
      {marks.map((m, i) => {
        const y = pos(m);
        if (y == null) return null;
        const col = NOTE.has(m.type) ? "#F5B700" : m.color ? (Array.isArray(m.color) ? `rgb(${m.color.map(c => Math.round(c * 255)).join(",")})` : m.color) : "var(--accent)";
        return <button key={i} class={"mm" + (NOTE.has(m.type) ? " note" : "")} style={{ top: (y / H * 100) + "%", background: col }}
          title={(m.text || m.contents || m.type || "").slice(0, 80)} onClick={() => el.scrollTo({ top: Math.max(0, y - el.clientHeight * 0.3), behavior: "smooth" })} />;
      })}
    </div>
  );
}

function EmptyButtons({ book }) {
  const [mod, setMod] = useState(null);
  useEffect(() => { import("../actions.js").then(setMod); }, []);
  if (!mod) return null;
  return (
    <div class="row wrap" style={{ justifyContent: "center", marginTop: 14 }}>
      <button class="btn" onClick={async () => mod.uploadFiles(book, await mod.pickFiles())}><Icon n="upload" />{_t("Add files")}</button>
      {store.value.canPick && <button class="btn ghost" onClick={() => mod.addFromDrive(book)}><Icon n="drive" />{_t("From my Drive")}</button>}
      <button class="btn ghost" onClick={() => openPanel("scan", { book: book.id })}><Icon n="camera" />{_t("Scan")}</button>
      <button class="btn ghost" onClick={() => openPanel("write", { book: book.id })}><Icon n="edit" />{_t("Write")}</button>
    </div>
  );
}

// the paper of a sticky note
const PAPERS = [["#FFED8C", _t("Yellow")], ["#FFD1E0", _t("Pink")], ["#CCE8FF", _t("Blue")], ["#CCF2CC", _t("Green")], ["#E4D9FF", _t("Lilac")], ["#FFDDB3", _t("Orange")]];
export { PAPERS };
function rgbHex(c) { return "#" + c.map(v => Math.round(v * 255).toString(16).padStart(2, "0")).join(""); }
async function copySelected() {
  const sel = selectedMark.value;
  if (!sel) return;
  const f = fileFor(sel.fileId);
  if (!f) return;
  const n = await copyMark(f, sel.page, sel.i);
  await reselect(f, sel.page, n);
  toast(_t("A copy - drag it where you want it."));
}

// the small bar for the selected mark: colour, style, change the words, take it off
const TEXT_STYLES = [["plain", _t("Plain")], ["outline", _t("Outline")], ["label", _t("Label")], ["solid", _t("Solid")], ["dashed", _t("Dashed")], ["marker", _t("Marker")]];
// the words you chose with the arrow: a small bar just above them - highlight (in a colour), underline, strike out,
// comment, copy, read aloud, find everywhere, a task about them
function TextSelBar() {
  const s = textSel.value;
  const ref = useRef();
  const [pos, setPos] = useState(null);
  const place = useCallback(() => {
    const t = textSel.value;
    if (!t || !t.done || !ref.current) return;
    const pageEl = document.querySelector(`.page[data-file="${t.fileId}"][data-page="${t.page}"]`);
    const host = ref.current.offsetParent;
    if (!pageEl || !host || !t.quads || !t.quads.length) { setPos(null); return; }
    const pw = docState.value[t.fileId]?.pages?.[t.page]?.w || 595;
    const pr = pageEl.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const k = pr.width / pw;
    const q0 = t.quads[0], q1 = t.quads[t.quads.length - 1];
    const x0 = Math.min(q0[0], q0[4]), y0 = Math.min(q0[1], q0[3]), y1 = Math.max(q1[5], q1[7]);
    const bw = ref.current.offsetWidth || 380, bh = ref.current.offsetHeight || 42;
    let top = pr.top + y0 * k - hr.top - bh - 10;
    if (top < 6) top = pr.top + y1 * k - hr.top + 10;
    setPos({ top: Math.max(6, top), left: Math.max(8, Math.min(hr.width - bw - 8, pr.left + x0 * k - hr.left)) });
  }, []);
  useLayoutEffect(() => { place(); }, [s, place]);
  useEffect(() => {
    const sc = document.querySelector(".vhost .pages");
    const f = () => place();
    sc && sc.addEventListener("scroll", f, { passive: true });
    return () => sc && sc.removeEventListener("scroll", f);
  }, [s?.fileId, place]);
  if (!s || !s.done || s.temp || !s.text || !s.text.trim()) return null;
  const file = fileFor(s.fileId);
  if (!file) return null;
  const ro = docState.value[file.id]?.readOnly;
  const o = toolOpts.value;
  const mark = async (type, color) => { textSel.value = null; await addMark(file, s.page, { type, quads: s.quads, color }); };
  const q = s.quads[0];
  return (
    <div ref={ref} class="floatbar selbar" style={pos ? { top: pos.top + "px", left: pos.left + "px" } : { visibility: "hidden" }} onPointerDown={(e) => e.stopPropagation()}>
      {!ro && <>
        <span class="rsws">{HL_COLORS.slice(0, 5).map(c => <button key={c} class={"rsw" + (o.color === c ? " on" : "")} style={{ background: c }} title={_t("Highlight in this colour")} onClick={() => { toolOpts.value = { ...toolOpts.value, color: c }; mark("Highlight", rgb(c)); }} />)}</span>
        <button class="ib" title={_t("Highlight")} onClick={() => mark("Highlight", rgb(o.color))}><Icon n="highlighter" size={17} /></button>
        <button class="ib" title={_t("Underline")} onClick={() => mark("Underline", [0.85, 0.2, 0.3])}><Icon n="line" size={17} /></button>
        <button class="ib" title={_t("Strike out")} onClick={() => mark("StrikeOut", [0.85, 0.2, 0.3])}><Icon n="x" size={17} /></button>
        <button class="ib" title={_t("Comment on these words")} onClick={() => { textSel.value = null; commentsOpen.value = { draft: { fileId: file.id, page: s.page, x: Math.max(q[2], q[6]) + 6, y: Math.min(q[1], q[3]) } }; }}><Icon n="comment" size={17} /></button>
        <span class="fl-sep" />
      </>}
      <button class="ib" title={_t("Copy (Ctrl+C)")} onClick={() => navigator.clipboard?.writeText(s.text).then(() => toast(_t("Copied.")))}><Icon n="copy" size={17} /></button>
      {"speechSynthesis" in window && <button class="ib" title={_t("Read it aloud")} onClick={() => window.dispatchEvent(new CustomEvent("bl-read-aloud", { detail: { fileId: file.id, page: s.page, text: s.text } }))}><Icon n="speaker" size={17} /></button>}
      <button class="ib" title={_t("Find it in all the books")} onClick={() => openPanel("find", { q: s.text.trim().slice(0, 80) })}><Icon n="search" size={17} /></button>
      <button class="ib" title={_t("A task about it")} onClick={() => { const t = s.text.trim().slice(0, 120); textSel.value = null; import("../state.js").then(st => { st.setSetting("tasks", [{ id: Math.random().toString(36).slice(2), text: t, who: "", due: "", made: Date.now(), done: 0, bookId: bookId.value, book: books.value.find(b => b.id === bookId.value)?.name || "", fileId: file.id, file: file.name, page: s.page }, ...(st.settings.value.tasks || [])]); openPanel("tasks"); }); }}><Icon n="task" size={17} /></button>
    </div>
  );
}

// the bar of the chosen mark: it floats just above it (below when there is no room) - for words: font, size, bold,
// italic, alignment, colour; for a sticky note its paper; for the rest its colour, turn, copy, take off
function MarkBar() {
  const sel = selectedMark.value;
  const ref = useRef();
  const [pos, setPos] = useState(null);
  const file = sel ? fileFor(sel.fileId) : null;
  const place = useCallback(() => {
    const s = selectedMark.value;
    if (!s || !ref.current) return;
    const pageEl = document.querySelector(`.page[data-file="${s.fileId}"][data-page="${s.page}"]`);
    const host = ref.current.offsetParent;
    if (!pageEl || !host) { setPos(null); return; }
    const pw = docState.value[s.fileId]?.pages?.[s.page]?.w || 595;
    const pr = pageEl.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const k = pr.width / pw;
    const r = s.rect || [0, 0, 0, 0];
    const bw = ref.current.offsetWidth || 420, bh = ref.current.offsetHeight || 44;
    let top = pr.top + r[1] * k - hr.top - bh - 12;
    if (top < 6) top = pr.top + r[3] * k - hr.top + 12;
    top = Math.max(6, Math.min(hr.height - bh - 70, top));
    const cx = pr.left + (r[0] + r[2]) / 2 * k - hr.left;
    setPos({ top, left: Math.max(8, Math.min(hr.width - bw - 8, cx - bw / 2)) });
  }, []);
  useLayoutEffect(() => { place(); }, [sel, place]);
  useEffect(() => {
    const sc = document.querySelector(".vhost .pages");
    const f = () => place();
    sc && sc.addEventListener("scroll", f, { passive: true });
    window.addEventListener("resize", f);
    return () => { sc && sc.removeEventListener("scroll", f); window.removeEventListener("resize", f); };
  }, [sel?.fileId, place]);
  if (!sel || !file) return null;
  const colors = ["#FFD43B", "#69DB7C", "#74C0FC", "#F783AC", "#E03131", "#1C7ED6", "#2B8A3E", "#1E1C2B"];
  const textColors = ["#1E1C2B", "#C2337A", "#1C7ED6", "#2B8A3E", "#E03131", "#E8772E"];
  const white = (sel.type === "Square" && sel.subject === "White box") || (sel.type === "Ink" && sel.subject === "White brush");
  const names = { Highlight: _t("Highlight"), Underline: _t("Underline"), StrikeOut: _t("Strike-out"), Squiggly: _t("Wavy line"), Ink: _tv(sel.subject) || _t("Drawing"),
    FreeText: sel.subject === "Sticky note" ? _t("Sticky note") : _t("Text"), Text: _t("Comment"), Square: white ? _t("White box") : _t("Box"), Circle: _t("Circle"), Line: _t("Line"),
    Stamp: _tv(sel.subject) || _t("Stamp") };
  const words = sel.type === "FreeText";
  const sticky = words && sel.subject === "Sticky note";
  const st = sel.style || {};
  const turnable = handlesOf(sel).rotate;
  const refresh = async () => {
    const { marksOn } = await import("../docs.js");
    const m = (await marksOn(file, sel.page)).find(x => x.i === sel.i);
    if (m) selectedMark.value = { fileId: file.id, page: sel.page, ...m };
  };
  const ed = async (change) => { await editMark(file, sel.page, sel.i, change); refresh(); };
  const styleMenu = (e) => openMenu(e, [
    { title: _t("Style of the text box") },
    ...TEXT_STYLES.map(([k2, l]) => ({ label: ((st.style || "plain") === k2 ? "✓ " : "") + l, run: () => ed({ style: { style: k2 } }) })),
    { title: _t("Colours and effects") },
    { label: _t("Fill colour"), sub: [{ label: _t("No fill"), run: () => ed({ style: { fill: null } }) },
      ...colors.map(c => ({ label: "", swatch: c, run: () => ed({ style: { fill: hexToRgb(mix(c, "#ffffff", 0.55)) } }) }))] },
    { label: _t("Line colour"), sub: [{ label: _t("No line"), run: () => ed({ style: { line: null } }) },
      ...colors.map(c => ({ label: "", swatch: c, run: () => ed({ style: { line: hexToRgb(c) } }) }))] },
    { label: (st.opacity ?? 1) < 1 ? _t("See-through: on") : _t("See-through: off"), run: () => ed({ style: { opacity: (st.opacity ?? 1) < 1 ? 1 : 0.6 } }) },
    { label: st.round ? _t("Round corners: on") : _t("Round corners: off"), run: () => ed({ style: { round: !st.round } }) },
  ]);
  const curColor = sel.color ? "#" + sel.color.map(v => Math.round(v * 255).toString(16).padStart(2, "0")).join("") : "";
  return (
    <div ref={ref} class="floatbar" style={pos ? { top: pos.top + "px", left: pos.left + "px" } : { visibility: "hidden" }} onPointerDown={(e) => e.stopPropagation()}>
      <b class="fl-name">{names[sel.type] || sel.type}</b>
      {words && <>
        <select class="rsel" value={st.font || "sans"} title={_t("Font")} onChange={(e) => ed({ style: { font: e.target.value } })}>
          <option value="sans">{_t("Sans")}</option><option value="serif">{_t("Serif")}</option><option value="mono">{_t("Mono")}</option></select>
        <select class="rsel" value={Math.round(sel.size || 12)} title={_t("Size")} onChange={(e) => ed({ size: Number(e.target.value) })}>
          {[...new Set([8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, Math.round(sel.size || 12)])].sort((x, y) => x - y).map(z => <option key={z} value={z}>{z}</option>)}</select>
        <span class="rseg">
          <button class={st.bold ? "on" : ""} title={_t("Bold")} onClick={() => ed({ style: { bold: !st.bold } })}><b>B</b></button>
          <button class={st.italic ? "on" : ""} title={_t("Italic")} onClick={() => ed({ style: { italic: !st.italic } })}><i style={{ fontFamily: "Georgia,serif" }}>I</i></button>
        </span>
        <span class="rseg">{[["left", _t("Left"), "alignl"], ["center", _t("Centre"), "alignc"], ["right", _t("Right"), "alignr"]].map(([k2, l, ic]) => <button key={k2} class={(st.align || "left") === k2 ? "on" : ""} title={_t("Align ") + l.toLowerCase()} onClick={() => ed({ style: { align: k2 } })}><Icon n={ic} size={14} /></button>)}</span>
        <span class="fl-sep" />
        <span class="rsws">{textColors.map(c => <button key={c} class={"rsw" + (curColor.toLowerCase() === c.toLowerCase() ? " on" : "")} style={{ background: c }} title={_t("Colour of the words")} onClick={() => ed({ color: hexToRgb(c) })} />)}</span>
      </>}
      {sticky && <><span class="fl-sep" /><span class="rsws" title={_t("The colour of the paper")}>{PAPERS.map(([c, l]) => (
        <button key={c} class={"paperdot" + (sel.paper && rgbHex(sel.paper) === c.toLowerCase() ? " on" : "")} style={{ background: c }} title={_t("{0} paper", l)} onClick={() => ed({ paper: hexToRgb(c) })} />))}</span></>}
      {words && !sticky && <button class="btn plain small" onClick={styleMenu}><Icon n="palette" size={15} />{_t("Box")}</button>}
      {white ? <button class="btn soft small" onClick={async () => {
          const ok = await confirm(_t("Erase the text under it for good?"), _t("The words and pictures under the white box are taken out of the PDF, so nobody can copy or find them."), { ok: _t("Erase for good"), danger: true });
          if (!ok) return;
          const { getDoc: gd } = await import("../docs.js");
          const doc = await gd(file);
          await call("eraseArea", doc.key, sel.page, sel.rect, false, sel.i);
          afterEdit(file.id, "pages");
          selectedMark.value = null;
        }}><Icon n="eraser" size={15} />{_t("Erase the text under it for good")}</button>
        : !words && sel.type !== "Stamp" && <span class="rsws">{colors.map(c => <button key={c} class={"rsw" + (curColor.toLowerCase() === c.toLowerCase() ? " on" : "")} style={{ background: c }} title={_t("Colour")} onClick={() => ed({ color: hexToRgb(c) })} />)}</span>}
      {(sel.type === "Square" || sel.type === "Circle") && !white && <button class="btn plain small" title={_t("Fill it with a light colour, or not")}
        onClick={() => ed({ fill: sel.fill ? null : hexToRgb(mix(curColor || "#E03131", "#ffffff", 0.78)) })}>{sel.fill ? _t("No fill") : _t("Fill")}</button>}
      <span class="fl-sep" />
      {words && <button class="ib" title={_t("Change the words (double-click)")} onClick={() => window.dispatchEvent(new CustomEvent("bl-edit-mark"))}><Icon n="rename" size={17} /></button>}
      {turnable && <button class="ib" title={_t("Turn it a quarter (or drag the round knob)")} onClick={() => ed({ rotateBy: 90 })}><Icon n="rotate" size={17} /></button>}
      {turnable && sel.rot ? <button class="btn plain small" title={_t("Put it straight again")} onClick={() => ed({ rotateBy: -sel.rot })}>{_t("Straight")}</button> : null}
      {!white && <button class="ib" title={_t("A copy of it (Ctrl+D)")} onClick={() => copySelected()}><Icon n="copy" size={17} /></button>}
      <button class="ib" title={white ? _t("Take the white box off (the text shows again)") : _t("Take it off (Delete)")} onClick={async () => { await deleteMark(file, sel.page, sel.i); selectedMark.value = null; }}><Icon n="trash" size={17} /></button>
      <button class="ib" title={_t("Done (Esc)")} onClick={() => { selectedMark.value = null; }}><Icon n="close" size={17} /></button>
    </div>
  );
}

window.addEventListener("keydown", async (e) => {
  if (/INPUT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable) return;
  const sel = selectedMark.value;
  if (sel && (e.key === "Delete" || e.key === "Backspace")) {
    e.preventDefault();
    const f = fileFor(sel.fileId);
    if (f) { await deleteMark(f, sel.page, sel.i); selectedMark.value = null; }
  }
  if (e.key === "Escape") { selectedMark.value = null; textSel.value = null; }
  if (sel && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); copySelected(); }
  if (sel && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // move the chosen mark a little (Shift: more)
    e.preventDefault();
    const f = fileFor(sel.fileId);
    const st = e.shiftKey ? 10 : 1;
    const dx = e.key === "ArrowLeft" ? -st : e.key === "ArrowRight" ? st : 0, dy = e.key === "ArrowUp" ? -st : e.key === "ArrowDown" ? st : 0;
    if (f) { await editMark(f, sel.page, sel.i, { moveBy: [dx, dy], stamp: null }); await reselect(f, sel.page, sel.i); }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && textSel.value?.text) {
    navigator.clipboard?.writeText(textSel.value.text);
    toast(_t("Copied."));
  }
});

export { kindOf };
