// The book: every document of the folder, one after another, as pages you scroll through - and the marks on them.
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "preact/hooks";
import { signal } from "@preact/signals";
import { books, bookId, fileId, pageNo, tool, toolOpts, zoom, fitWidth, toast, rememberPlace, settings, store,
  readMode } from "../state.js";
import { getDoc, onDocChange, call, addMark, editMark, deleteMark, marksOn, pdfCopyOf, afterEdit, fileFor, isOpen } from "../docs.js";
import { hexToRgb, isPaged, kindOf, debounce, fmtSize } from "../util.js";
import { Icon, fileIcon } from "./icons.jsx";
import { confirm, openMenuAt } from "./dialogs.jsx";
import { stampSpec } from "./marks.js";
import { openPanel } from "../actions.js";
import { pip } from "./Gallery.jsx";

export const docState = signal({});        // fileId -> {status, pages, readOnly, error, v}
export const searchHits = signal(null);    // {query, list:[{fileId, page, quads}], cur}
export const selectedMark = signal(null);  // {fileId, page, i, rect, type, contents, color}
export const textSel = signal(null);       // {fileId, page, quads, text}
export const scrollTo = signal(null);      // {fileId, page, y?} - ask the viewer to go there
const PT = 96 / 72;

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
        const doc = await getDoc(file);
        const r = await call("render", doc.key, page, scale, true);
        const c = ref.current;
        if (!c) return;
        c.width = r.w; c.height = r.h;
        c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(r.px.buffer || r.px), r.w, r.h), 0, 0);
        setDrawn(true);
      },
    });
  }, [k, v, w, h]);
  drawRef.current = draw;
  useEffect(() => { want.current = null; if (vis.current) draw(); }, [k, v, w, h]);
  return (
    <div ref={wrap} style={{ position: "absolute", inset: 0 }}>
      <canvas ref={ref} />
      {!drawn && <div class="loading">Page {page + 1}</div>}
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
  const ok = await confirm("Mark a copy?", `"${file.name}" is not a PDF. BindLens can make a PDF copy of it in this book, and your marks go on the copy.`, { ok: "Make a PDF copy" });
  if (!ok) return null;
  const f = await pdfCopyOf(file, b);
  scrollTo.value = { fileId: f.id, page: 0 };
  return null;
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
        if (!touch) setDrag({ kind: "move", start: p, dx: 0, dy: 0, m });
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
      el.setPointerCapture(e.pointerId);
      setDrag({ kind: "hl", start: p });
      return;
    }
    if (t === "pen") {
      el.setPointerCapture(e.pointerId);
      setInk([p]);
      return;
    }
    if (t === "shape") {
      el.setPointerCapture(e.pointerId);
      setBox([p[0], p[1], p[0], p[1]]);
      return;
    }
    if (t === "tick" || t === "cross") {
      const s = 9;
      const [x, y] = p;
      const strokes = t === "tick" ? [[[x - s, y], [x - s / 3, y + s * 0.7], [x + s, y - s * 0.9]]]
        : [[[x - s * 0.8, y - s * 0.8], [x + s * 0.8, y + s * 0.8]], [[x + s * 0.8, y - s * 0.8], [x - s * 0.8, y + s * 0.8]]];
      await addMark(file, page, { type: "Ink", ink: strokes, color: t === "tick" ? [0.1, 0.6, 0.25] : [0.85, 0.15, 0.15], width: 2.6, subject: t === "tick" ? "Tick" : "Cross" });
      return;
    }
    if (t === "text") {
      e.preventDefault();
      setEdit({ x: p[0], y: p[1] - 8, w: 220, h: 26, kind: "text", value: "", size: o.textSize || 12 });
      return;
    }
    if (t === "note") {
      e.preventDefault();
      setEdit({ x: p[0], y: p[1], w: 170, h: 110, kind: "note", value: "", size: 12 });
      return;
    }
    if (t === "stamp") {
      const spec = stampSpec(o.stamp);
      const w = spec.w || 150, h = spec.h || 46;
      await addMark(file, page, { type: "Stamp", rect: [p[0] - w / 2, p[1] - h / 2, p[0] + w / 2, p[1] + h / 2], text: spec.text, sub: spec.sub, color: spec.color, subject: "Stamp" });
      return;
    }
    if (t === "sign") {
      const sig = (settings.value.signatures || [])[0];
      if (!sig) { openPanel("signature"); return; }
      const bytes = Uint8Array.from(atob(sig.png.split(",")[1]), c => c.charCodeAt(0));
      const w = 160, h = 160 * sig.h / sig.w;
      await addMark(file, page, { type: "Stamp", rect: [p[0] - w / 2, p[1] - h / 2, p[0] + w / 2, p[1] + h / 2], image: bytes, subject: "Signature" });
      return;
    }
    if (t === "picture") {
      const pic = o.picture;
      if (!pic) { toast("Choose a picture first (the stamp menu)."); return; }
      const w = 160, h = 160 * pic.h / pic.w;
      await addMark(file, page, { type: "Stamp", rect: [p[0] - w / 2, p[1] - h / 2, p[0] + w / 2, p[1] + h / 2], image: pic.bytes, subject: "Picture" });
      return;
    }
    if (t === "edit") {
      const doc = await getDoc(file);
      const line = await call("lineAt", doc.key, page, p);
      if (!line) {
        if (!(await call("hasText", doc.key, page))) {
          const ok = await confirm("This page is a scan", "To change its words, BindLens first reads them (it takes a moment). Read the words of this page?", { ok: "Read the words" });
          if (ok) {
            toast("Reading the words of the page...");
            const { readScannedPage } = await import("../ocr.js");
            const n = await readScannedPage(file, page);
            toast(n ? `${n} words read. Click a line to change it.` : "No words were found on this page.", n ? "ok" : "");
          }
          return;
        }
        toast("Click on a line of text to change it.");
        return;
      }
      setEdit({ x: line.bbox.x - 2, y: line.bbox.y - 2, w: Math.max(line.bbox.w + 40, 120), h: line.bbox.h + 6, kind: "edit", value: line.text, size: line.size, line });
    }
  };

  const move = async (e) => {
    const el = ref.current;
    if (!el) return;
    const p = ptOf(e, el, k);
    if (ink) { setInk([...ink, p]); return; }
    if (box) { setBox([box[0], box[1], p[0], p[1]]); return; }
    if (drag) {
      if (drag.kind === "move") setDrag({ ...drag, dx: p[0] - drag.start[0], dy: p[1] - drag.start[1] });
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
    if (ink) {
      const pts = ink;
      setInk(null);
      if (pts.length > 1) await addMark(file, page, { type: "Ink", ink: [pts], color: rgb(o.pen), width: o.width || 2 });
      return;
    }
    if (box) {
      const [x0, y0, x1, y1] = box;
      setBox(null);
      if (Math.abs(x1 - x0) < 3 && Math.abs(y1 - y0) < 3) return;
      const r = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
      const shape = o.shape || "rect";
      if (shape === "line" || shape === "arrow") await addMark(file, page, { type: "Line", a: [x0, y0], b: [x1, y1], color: rgb(o.pen), width: o.width || 2, arrow: shape === "arrow" });
      else await addMark(file, page, { type: shape === "circle" ? "Circle" : "Square", rect: r, color: rgb(o.pen), width: o.width || 2 });
      return;
    }
    if (drag) {
      const dr = drag;
      setDrag(null);
      if (dr.kind === "move") {
        if (Math.abs(dr.dx) > 1 || Math.abs(dr.dy) > 1) {
          await editMark(file, page, dr.m.i, { moveBy: [dr.dx, dr.dy], stamp: null });
          const r = dr.m.rect;
          selectedMark.value = { ...selectedMark.value, rect: [r[0] + dr.dx, r[1] + dr.dy, r[2] + dr.dx, r[3] + dr.dy] };
        }
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
        return;
      }
      if (dr.kind === "text") {
        const s = textSel.value;
        if (s && s.text && s.text.trim()) {
          const r = el.getBoundingClientRect();
          openMenuAt(e.clientX, e.clientY + 10, [
            { label: "Copy", icon: "copy", run: () => navigator.clipboard?.writeText(s.text).then(() => toast("Copied.")) },
            !readOnly && { label: "Highlight", icon: "highlighter", run: async () => { textSel.value = null; await addMark(file, page, { type: "Highlight", quads: s.quads, color: rgb(o.color) }); } },
            !readOnly && { label: "Underline", icon: "line", run: async () => { textSel.value = null; await addMark(file, page, { type: "Underline", quads: s.quads, color: [0.85, 0.2, 0.3] }); } },
            !readOnly && { label: "Strike out", icon: "x", run: async () => { textSel.value = null; await addMark(file, page, { type: "StrikeOut", quads: s.quads, color: [0.85, 0.2, 0.3] }); } },
            { label: "Find it in all books", icon: "search", run: () => openPanel("find", { q: s.text.trim().slice(0, 80) }) },
          ]);
          void r;
        }
      }
    }
  };

  const commit = async (ed, value) => {
    setEdit(null);
    const v = (value || "").replace(/\s+$/, "");
    if (ed.kind === "edit") {
      if (v === ed.line.text) return;
      const l = ed.line;
      const doc = await getDoc(file);
      await call("replaceText", doc.key, page, [l.bbox.x - 0.5, l.bbox.y, l.bbox.x + l.bbox.w + 0.5, l.bbox.y + l.bbox.h],
        [{ x: l.x, y: l.y, text: v, size: l.size, family: l.family, bold: l.bold, italic: l.italic, color: l.color }]);
      afterEdit(file.id, "pages");
      return;
    }
    if (!v.trim()) return;
    const lines = v.split("\n");
    if (ed.kind === "text") {
      const size = ed.size;
      const wpt = Math.max(...lines.map(l => l.length)) * size * 0.56 + 8;
      const hpt = lines.length * size * 1.25 + 6;
      await addMark(file, page, { type: "FreeText", rect: [ed.x, ed.y, ed.x + wpt, ed.y + hpt], text: v, size, color: rgb(o.textColor || "#1E1C2B") });
    } else if (ed.kind === "note") {
      await addMark(file, page, { type: "FreeText", rect: [ed.x, ed.y, ed.x + ed.w, ed.y + Math.max(ed.h, lines.length * 16 + 14)], text: v, size: 12, color: [0.15, 0.13, 0.3], fill: [1, 0.93, 0.55], subject: "Sticky note" });
    }
  };

  const toPx = (v) => v * k * PT;
  const S = (r) => ({ left: toPx(r[0]) + "px", top: toPx(r[1]) + "px", width: toPx(r[2] - r[0]) + "px", height: toPx(r[3] - r[1]) + "px" });
  const quadRect = (q) => [Math.min(q[0], q[4]), Math.min(q[1], q[3]), Math.max(q[2], q[6]), Math.max(q[5], q[7])];

  const myHits = hits && hits.list.filter(h => h.fileId === file.id && h.page === page);

  return (
    <div ref={ref} class={"ov tool-" + t} onPointerDown={down} onPointerMove={move} onPointerUp={up}
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
      {myHits && myHits.map((h, i) => h.quads.map((q, j) => (
        <div key={i + ":" + j} class={"hit" + (hits.cur && hits.cur.fileId === file.id && hits.cur.page === page && hits.cur.n === h.n ? " cur" : "")} style={S(quadRect(q))} />
      )))}
      {ts && ts.fileId === file.id && ts.page === page && ts.quads.map((q, i) => <div key={i} class="sel" style={{ ...S(quadRect(q)), background: ts.temp ? (o.color + "88") : undefined }} />)}
      {isSel && (() => {
        const r = sel.rect;
        const dx = drag && drag.kind === "move" ? drag.dx : 0, dy = drag && drag.kind === "move" ? drag.dy : 0;
        return <div class="selbox" style={S([r[0] - 2 + dx, r[1] - 2 + dy, r[2] + 2 + dx, r[3] + 2 + dy])} />;
      })()}
      {ink && (
        <svg class="inkpath" width={toPx(pw)} height={toPx(ph)}>
          <polyline points={ink.map(p => toPx(p[0]) + "," + toPx(p[1])).join(" ")} fill="none" stroke={o.pen} stroke-width={(o.width || 2) * k * PT} stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      )}
      {box && (() => {
        const r = [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])];
        const shape = o.shape || "rect";
        return (
          <svg class="inkpath" width={toPx(pw)} height={toPx(ph)}>
            {shape === "circle" ? <ellipse cx={toPx((r[0] + r[2]) / 2)} cy={toPx((r[1] + r[3]) / 2)} rx={toPx((r[2] - r[0]) / 2)} ry={toPx((r[3] - r[1]) / 2)} fill="none" stroke={o.pen} stroke-width="2" />
              : shape === "line" || shape === "arrow" ? <line x1={toPx(box[0])} y1={toPx(box[1])} x2={toPx(box[2])} y2={toPx(box[3])} stroke={o.pen} stroke-width="2" />
                : <rect x={toPx(r[0])} y={toPx(r[1])} width={toPx(r[2] - r[0])} height={toPx(r[3] - r[1])} fill="none" stroke={o.pen} stroke-width="2" />}
          </svg>
        );
      })()}
      {edit && <InlineEdit ed={edit} k={k} onDone={async (v) => {
        if (edit.kind === "change") {
          setEdit(null);
          if (v !== edit.m.contents) await editMark(file, page, edit.m.i, { contents: v });
        } else commit(edit, v);
      }} />}
    </div>
  );
}

function InlineEdit({ ed, k, onDone }) {
  const ref = useRef();
  const done = useRef(false);
  useEffect(() => { setTimeout(() => { ref.current?.focus(); if (ed.kind === "edit") ref.current?.select(); }, 20); }, []);
  const finish = () => { if (done.current) return; done.current = true; onDone(ref.current.value); };
  const px = (v) => v * k * PT;
  const note = ed.kind === "note" || (ed.kind === "change" && ed.m?.subject === "Sticky note");
  return (
    <textarea ref={ref} class="inlineedit" defaultValue={ed.value}
      style={{ left: px(ed.x) + "px", top: px(ed.y) + "px", width: px(ed.w) + "px", minHeight: px(ed.h) + "px",
        fontSize: px(ed.size) + "px", background: note ? "#FFF1A8" : undefined }}
      placeholder={ed.kind === "note" ? "Write a note..." : ed.kind === "text" ? "Type here..." : ""}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") { done.current = true; onDone(ed.value); }
        if (e.key === "Enter" && (ed.kind === "edit" || e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(); }
      }}
      onBlur={finish} />
  );
}

function DocBlock({ book, file, k, maxW }) {
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
          {st.status !== "ready" && <div class="loading">Opening {file.name}...</div>}
          {st.status === "ready" && <Overlay file={file} page={i} k={k} pw={p.w} ph={p.h} readOnly={st.readOnly} />}
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
          <button class="btn plain small" title="Keep it playing in a corner while you read" onClick={(e) => { const v = e.currentTarget.closest(".mediacard").querySelector("video"); v.pause(); pip.value = { file, src, t: v.currentTime }; }}><Icon n="pip" size={16} />In a corner</button>
          <button class="btn plain small" onClick={() => openPanel("gallery", { fileId: file.id })}><Icon n="expand" size={16} />Big</button></div>
      </> : <div class="other"><Icon n="video" size={28} />{file.name}</div>)
        : kind === "audio" ? (<div style={{ padding: 16 }}><div class="row" style={{ marginBottom: 10 }}><Icon n="audio" size={24} /><b>{file.name}</b></div>{src && <audio src={src} controls />}</div>)
          : (
            <div class="other">
              <Icon n={fileIcon(kind)} size={30} />
              <div class="grow"><b>{file.name}</b><div class="small muted">{fmtSize(file.size)} · BindLens cannot show this kind of file.</div></div>
              <button class="btn soft small" onClick={async () => { const u = await blobUrl(file); const a = document.createElement("a"); a.href = u; a.download = file.name; a.click(); }}><Icon n="download" />Download</button>
            </div>
          )}
    </div>
  );
}

export function Viewer({ book }) {
  const scroller = useRef();
  const [W, setW] = useState(900);
  const loading = useRef(false);
  const files = book.files;

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
          setDoc(f.id, { status: "ready", pages: d.pages, readOnly: d.readOnly, isPDF: d.isPDF, md5: f.md5 || f.modified, v: (docState.value[f.id]?.v || 0) + 1 });
        } catch (e) {
          setDoc(f.id, { status: "error", error: String(e.message || e) });
        }
      }
    })();
    return () => { alive = false; };
  }, [book.id, files.map(f => f.id + (f.md5 || "")).join()]);

  useEffect(() => {
    const el = scroller.current;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the scale: fit the widest page to the window, or the zoom the user chose
  let maxPt = 595;
  for (const f of files) { const st = docState.value[f.id]; if (st && st.pages) for (const p of st.pages) maxPt = Math.max(maxPt, Math.min(p.w, 1400)); }
  const avail = Math.max(240, W - (W < 700 ? 16 : 90));
  const fitK = Math.min(avail / (maxPt * PT), readMode.value ? 1.35 : 1.6);
  const k = fitWidth.value ? fitK * zoom.value : zoom.value;
  const maxW = Math.min(avail, 900 * k);

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
  const goto = (fid, page, y) => {
    const el = scroller.current;
    if (!el) return false;
    const target = el.querySelector(`[data-file="${fid}"][data-page="${page || 0}"]`) || el.querySelector(`[data-file="${fid}"]`);
    if (!target) return false;
    const top = target.offsetTop - 14 + (y != null ? y * k * PT - el.clientHeight * 0.3 : 0);
    el.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    return true;
  };
  useLayoutEffect(() => {
    const s = scrollTo.value;
    if (!s) return;
    if (goto(s.fileId, s.page, s.y)) {
      const st = docState.value[s.fileId];
      if (!st || st.status === "ready" || !isPaged(fileFor(s.fileId)?.kind || "")) scrollTo.value = null;
    }
  }, [scrollTo.value, docState.value, k]);
  // first open: the page you were on
  useEffect(() => { if (fileId.value) scrollTo.value = { fileId: fileId.value, page: pageNo.value }; }, [book.id]);

  // keep the same page in view when the zoom changes
  const prevK = useRef(k);
  useLayoutEffect(() => {
    if (prevK.current !== k && fileId.value) goto(fileId.value, pageNo.value);
    prevK.current = k;
  }, [k]);

  const [drop, setDrop] = useState(false);

  if (!files.length) {
    return (
      <div class="pages" ref={scroller} onDragOver={(e) => { e.preventDefault(); setDrop(true); }} onDragLeave={() => setDrop(false)}
        onDrop={async (e) => { e.preventDefault(); setDrop(false); const { uploadFiles } = await import("../actions.js"); uploadFiles(book, [...e.dataTransfer.files]); }}>
        <div class="empty" style={{ minHeight: "100%" }}>
          <div class="box">
            <h2>"{book.name}" is empty</h2>
            <p class="muted">Add PDFs, Word and Excel files, photos or videos. They are saved in your Google Drive, in this book's folder.</p>
            <EmptyButtons book={book} />
          </div>
        </div>
        {drop && <div class="dropzone">Drop to add to "{book.name}"</div>}
      </div>
    );
  }

  return (
    <div class="pages" ref={scroller} onScroll={onScroll}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setDrop(true); } }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setDrop(false); }}
      onDrop={async (e) => { e.preventDefault(); setDrop(false); const { uploadFiles } = await import("../actions.js"); uploadFiles(book, [...e.dataTransfer.files], { open: false }); }}
      onPointerDown={(e) => { if (e.target === e.currentTarget || e.target.classList.contains("pages-in")) { selectedMark.value = null; textSel.value = null; } }}>
      <div class="pages-in" style={{ "--pw": maxW + "px" }}>
        {files.map((f) => (
          <div key={f.id} style={{ display: "contents" }}>
            {files.length > 1 && <div class="dochead" style={{ maxWidth: Math.min(avail, (docState.value[f.id]?.pages?.[0]?.w || 595) * k * PT) + "px" }}>
              <Icon n={fileIcon(f.kind)} size={16} /><span class="grow ellipsis">{f.name}</span>
              {docState.value[f.id]?.pages && <span class="tiny">{docState.value[f.id].pages.length} page{docState.value[f.id].pages.length === 1 ? "" : "s"}</span>}
            </div>}
            <DocBlock book={book} file={f} k={k} maxW={maxW} />
          </div>
        ))}
      </div>
      <MarkBar k={k} />
      {drop && <div class="dropzone">Drop to add to "{book.name}"</div>}
    </div>
  );
}

function EmptyButtons({ book }) {
  const [mod, setMod] = useState(null);
  useEffect(() => { import("../actions.js").then(setMod); }, []);
  if (!mod) return null;
  return (
    <div class="row wrap" style={{ justifyContent: "center", marginTop: 14 }}>
      <button class="btn" onClick={async () => mod.uploadFiles(book, await mod.pickFiles())}><Icon n="upload" />Add files</button>
      {store.value.kind === "drive" && <button class="btn ghost" onClick={() => mod.addFromDrive(book)}><Icon n="drive" />From my Drive</button>}
      <button class="btn ghost" onClick={() => openPanel("scan", { book: book.id })}><Icon n="camera" />Scan</button>
      <button class="btn ghost" onClick={() => openPanel("write", { book: book.id })}><Icon n="edit" />Write</button>
    </div>
  );
}

// the small bar for the selected mark: colour, change the words, take it off
function MarkBar() {
  const sel = selectedMark.value;
  if (!sel) return null;
  const file = fileFor(sel.fileId);
  if (!file) return null;
  const colors = ["#FFD43B", "#69DB7C", "#74C0FC", "#F783AC", "#E03131", "#1C7ED6", "#2B8A3E", "#1E1C2B"];
  const names = { Highlight: "Highlight", Underline: "Underline", StrikeOut: "Strike-out", Squiggly: "Wavy line", Ink: sel.subject || "Drawing",
    FreeText: sel.subject === "Sticky note" ? "Sticky note" : "Text", Text: "Note", Square: "Box", Circle: "Circle", Line: "Line",
    Stamp: sel.subject || "Stamp" };
  return (
    <div class="pagebar" style={{ bottom: 74 }} onPointerDown={(e) => e.stopPropagation()}>
      <b class="small" style={{ padding: "0 6px" }}>{names[sel.type] || sel.type}</b>
      {sel.type !== "Stamp" && colors.map(c => (
        <button key={c} class="swatch" style={{ background: c, border: 0, width: 20, height: 20 }} title="Colour"
          onClick={async () => { await editMark(file, sel.page, sel.i, { color: hexToRgb(c) }); }} />
      ))}
      <span class="sep" />
      <button class="ib" title="Take it off (Delete)" onClick={async () => { await deleteMark(file, sel.page, sel.i); selectedMark.value = null; }}><Icon n="trash" /></button>
      <button class="ib" title="Done" onClick={() => { selectedMark.value = null; }}><Icon n="close" /></button>
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
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && textSel.value?.text) {
    navigator.clipboard?.writeText(textSel.value.text);
    toast("Copied.");
  }
});

export { kindOf };
