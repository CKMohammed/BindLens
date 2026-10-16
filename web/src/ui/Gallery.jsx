// Photos as a gallery and a slideshow; videos big, or small in a corner while you read.
import { useEffect, useRef, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { panel, currentBook, books, toast } from "../state.js";
import { Icon } from "./icons.jsx";
import { blobUrl } from "./Viewer.jsx";
import { download } from "../util.js";

export const pip = signal(null); // {file, src, t}

export function Gallery({ fileId: fid }) {
  const book = currentBook.value;
  const pool = (book ? [book] : books.value);
  const items = pool.flatMap(b => b.files.filter(f => f.kind === "image" || f.kind === "video").map(f => ({ f, b })));
  const start = Math.max(0, items.findIndex(x => x.f.id === fid));
  const [i, setI] = useState(start);
  const [src, setSrc] = useState({});
  const [play, setPlay] = useState(false);
  const close = () => { panel.value = null; };
  const cur = items[i];
  useEffect(() => {
    let alive = true;
    for (const j of [i, i + 1, i - 1, ...items.map((_, k) => k)]) {
      const it = items[j];
      if (!it || src[it.f.id]) continue;
      blobUrl(it.f).then(u => { if (alive) setSrc(s => ({ ...s, [it.f.id]: u })); });
    }
    return () => { alive = false; };
  }, [i]);
  useEffect(() => {
    if (!play) return;
    const t = setInterval(() => setI(x => (x + 1) % items.length), 3500);
    return () => clearInterval(t);
  }, [play, items.length]);
  useEffect(() => {
    const k = (e) => {
      if (e.key === "ArrowRight") setI(x => Math.min(items.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI(x => Math.max(0, x - 1));
      if (e.key === "Escape") close();
      if (e.key === " ") { e.preventDefault(); setPlay(p => !p); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [items.length]);
  if (!items.length) {
    return (
      <div class="gallery" onClick={close}>
        <div class="stage"><div style={{ textAlign: "center" }}><Icon n="image" size={40} /><p>{book ? `"${book.name}" has no photos or videos.` : "No photos or videos yet."}</p><button class="btn">Close</button></div></div>
      </div>
    );
  }
  const u = cur && src[cur.f.id];
  return (
    <div class="gallery">
      <div class="gtop">
        <b class="grow ellipsis">{cur.f.name} <span style={{ opacity: .6, fontWeight: 400 }}>· {i + 1} of {items.length}{!book ? " · " + cur.b.name : ""}</span></b>
        <button class="ib" title={play ? "Stop the slideshow (space)" : "Slideshow (space)"} onClick={() => setPlay(!play)}><Icon n={play ? "pause" : "play"} /></button>
        {cur.f.kind === "video" && <button class="ib" title="Play in a corner while you read" onClick={() => { pip.value = { file: cur.f, src: u }; close(); }}><Icon n="pip" /></button>}
        <button class="ib" title="Download" onClick={async () => { const r = await fetch(u); download(await r.blob(), cur.f.name); }}><Icon n="download" /></button>
        <button class="ib" title="Full screen" onClick={() => document.documentElement.requestFullscreen?.()}><Icon n="full" /></button>
        <button class="ib" title="Close (Esc)" onClick={close}><Icon n="close" /></button>
      </div>
      <div class="stage">
        {!u ? <div class="spinner" /> : cur.f.kind === "video" ? <video src={u} controls autoPlay playsInline style={{ maxWidth: "92%", maxHeight: "100%" }} /> : <img src={u} alt={cur.f.name} />}
        {i > 0 && <button class="nav" style={{ left: 18 }} onClick={() => setI(i - 1)}>‹</button>}
        {i < items.length - 1 && <button class="nav" style={{ right: 18 }} onClick={() => setI(i + 1)}>›</button>}
      </div>
      <div class="strip">
        {items.map((it, j) => it.f.kind === "video"
          ? <span key={j} onClick={() => setI(j)} style={{ width: 74, height: 52, borderRadius: 5, background: "#333", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: j === i ? "2px solid var(--gold-l)" : "2px solid transparent", flex: "none" }}><Icon n="play" /></span>
          : <img key={j} class={j === i ? "on" : ""} src={src[it.f.id] || ""} alt="" onClick={() => setI(j)} />)}
      </div>
    </div>
  );
}

export function Pip() {
  const p = pip.value;
  const ref = useRef();
  const [pos, setPos] = useState(null);
  if (!p) return null;
  const startDrag = (e) => {
    const box = ref.current.getBoundingClientRect();
    const dx = e.clientX - box.left, dy = e.clientY - box.top;
    const mv = (ev) => setPos({ x: Math.max(0, Math.min(window.innerWidth - box.width, ev.clientX - dx)), y: Math.max(0, Math.min(window.innerHeight - box.height, ev.clientY - dy)) });
    const upf = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", upf); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", upf);
  };
  return (
    <div class="pip" ref={ref} style={pos ? { left: pos.x + "px", top: pos.y + "px", right: "auto", bottom: "auto" } : null}>
      <video src={p.src} controls autoPlay playsInline />
      <div class="bar" onPointerDown={startDrag}>
        <button class="ib" title="Big" onClick={() => { panel.value = { type: "gallery", fileId: p.file.id }; pip.value = null; }}><Icon n="expand" size={16} /></button>
        <button class="ib" title="Close" onClick={() => { pip.value = null; }}><Icon n="close" size={16} /></button>
      </div>
      {void toast}
    </div>
  );
}
