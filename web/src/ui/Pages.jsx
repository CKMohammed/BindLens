// All the pages of a document as small pictures: go to one, turn it, move it, take it out.
import { useEffect, useRef, useState } from "preact/hooks";
import { panel, fileId, pageNo, currentBook } from "../state.js";
import { Dialog, confirm } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { getDoc, call, fileFor, pageOp, onDocChange } from "../docs.js";
import { scrollTo, docState } from "./Viewer.jsx";

function Thumb({ file, i, v }) {
  const ref = useRef();
  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await getDoc(file);
      const p = d.pages[i];
      if (!p) return;
      const r = await call("render", d.key, i, 150 / p.w, true);
      if (!alive || !ref.current) return;
      const c = ref.current;
      c.width = r.w; c.height = r.h;
      c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(r.px.buffer || r.px), r.w, r.h), 0, 0);
    })();
    return () => { alive = false; };
  }, [file.id, i, v]);
  return <canvas ref={ref} style={{ width: "100%", background: "#fff", boxShadow: "var(--shadow2)", borderRadius: 3 }} />;
}

export function Pages({ fileId: fid }) {
  const file = fileFor(fid || fileId.value);
  const [pages, setPages] = useState(null);
  const [v, setV] = useState(0);
  const close = () => { panel.value = null; };
  useEffect(() => {
    if (!file) return;
    getDoc(file).then(d => setPages(d.pages));
    return onDocChange(async (id) => { if (id === file.id) { const d = await getDoc(file); setPages([...d.pages]); setV(x => x + 1); } });
  }, [file?.id]);
  if (!file) return <Dialog title="Pages" onClose={close}><p>Open a document first.</p></Dialog>;
  const pdf = file.kind === "pdf" && !docState.value[file.id]?.readOnly;
  const act = async (fn, ...a) => { const p = await pageOp(file, fn, ...a); setPages([...p]); setV(x => x + 1); };
  return (
    <Dialog title={file.name} icon="grid" onClose={close} cls="wide">
      {!pages ? <div class="spinner" /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 16 }}>
          {pages.map((p, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <button style={{ border: 0, background: "none", padding: 0, width: "100%", cursor: "pointer", outline: i === pageNo.value && file.id === fileId.value ? "3px solid var(--accent)" : "" }}
                onClick={() => { close(); fileId.value = file.id; pageNo.value = i; scrollTo.value = { fileId: file.id, page: i }; }}>
                <Thumb file={file} i={i} v={v} />
              </button>
              <div class="row" style={{ justifyContent: "center", gap: 0 }}>
                <span class="small muted" style={{ marginRight: 4 }}>{i + 1}</span>
                {pdf && <>
                  <button class="ib" title="Turn" onClick={() => act("rotatePage", i, 90)}><Icon n="rotate" size={16} /></button>
                  <button class="ib" title="Move earlier" disabled={i === 0} onClick={() => act("movePage", i, i - 1)}><Icon n="left" size={16} /></button>
                  <button class="ib" title="Move later" disabled={i === pages.length - 1} onClick={() => act("movePage", i, i + 1)}><Icon n="right" size={16} /></button>
                  <button class="ib" title="Take it out" disabled={pages.length < 2} onClick={async () => { if (await confirm(`Take page ${i + 1} out?`, "Undo (Ctrl+Z) puts it back, and so does Deleted pages in the Pages menu.", { ok: "Take it out", danger: true })) { const { takePageOut } = await import("../filetools.js"); await takePageOut(file, i); const d = await getDoc(file); setPages([...d.pages]); setV(x => x + 1); } }}><Icon n="trash" size={16} /></button>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}
      {!pdf && <p class="small muted">This document is not a PDF, so its pages cannot be moved here.</p>}
      <div class="row" style={{ marginTop: 14 }}><span class="grow" /><button class="btn ghost small" onClick={() => { close(); panel.value = { type: "addpages", book: currentBook.value?.id }; }}><Icon n="addpage" size={16} />Add pages...</button></div>
      {void currentBook}
    </Dialog>
  );
}
