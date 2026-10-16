// Scan: photos of paper (the phone's camera, or photos you have) -> straight, clean pages -> a PDF in your book.
import { useEffect, useRef, useState } from "preact/hooks";
import { panel, books, currentBook, toast, store, addFileToBook, openBook, logChange } from "../state.js";
import { Dialog, ask } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { call, fileFor, pageOp, getDoc } from "../docs.js";
import { pickFiles } from "../actions.js";
import { scrollTo } from "./Viewer.jsx";
import { fmtDate, uniqueName, cleanName } from "../util.js";
import { readScannedDoc } from "../ocr.js";

async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (e) { return createImageBitmap(file); }
}

function findCorners(bmp) {
  // the paper is the big light shape: its four extreme points
  const W = 240, H = Math.round(240 * bmp.height / bmp.width);
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext("2d");
  g.drawImage(bmp, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;
  const lum = new Uint8Array(W * H);
  const hist = new Array(256).fill(0);
  for (let i = 0; i < W * H; i++) { const v = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) | 0; lum[i] = v; hist[v]++; }
  // Otsu
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sB = 0, wB = 0, best = 0, th = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = W * H - wB; if (!wF) break;
    sB += t * hist[t];
    const mB = sB / wB, mF = (sum - sB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; th = t; }
  }
  let n = 0, tl = [0, 0, 1e9], br = [0, 0, -1e9], tr = [0, 0, -1e9], bl = [0, 0, 1e9];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (lum[y * W + x] <= th) continue;
    n++;
    const s = x + y, d = x - y;
    if (s < tl[2]) tl = [x, y, s];
    if (s > br[2]) br = [x, y, s];
    if (d > tr[2]) tr = [x, y, d];
    if (d < bl[2]) bl = [x, y, d];
  }
  const frac = n / (W * H);
  const k = bmp.width / W;
  if (frac < 0.15 || frac > 0.97) {
    const m = 0.04;
    return [[bmp.width * m, bmp.height * m], [bmp.width * (1 - m), bmp.height * m], [bmp.width * (1 - m), bmp.height * (1 - m)], [bmp.width * m, bmp.height * (1 - m)]];
  }
  return [tl, tr, br, bl].map(p => [p[0] * k, p[1] * k]);
}

export function Scan({ book: bid, into, at }) {
  const [queue, setQueue] = useState([]);      // photos still to do
  const [cur, setCur] = useState(null);        // {bmp, file, pts}
  const [pages, setPages] = useState([]);      // [{jpg, url}]
  const [clean, setClean] = useState(true);
  const [read, setRead] = useState(true);
  const [busy, setBusy] = useState("");
  const canvas = useRef();
  const [box, setBox] = useState(null);
  const close = () => { panel.value = null; };
  const target = into ? fileFor(into) : null;

  const take = async (camera) => {
    const fs = await pickFiles({ accept: "image/*", multiple: !camera, capture: camera ? "environment" : null });
    if (!fs.length) return;
    const [first, ...rest] = fs;
    setQueue(q => [...q, ...rest]);
    await startOn(first);
  };
  const startOn = async (file) => {
    const bmp = await loadBitmap(file);
    setCur({ bmp, file, pts: findCorners(bmp) });
  };

  useEffect(() => {
    if (!cur || !canvas.current) return;
    const c = canvas.current;
    const maxW = Math.min(760, c.parentElement.clientWidth || 760), maxH = window.innerHeight * 0.56;
    const k = Math.min(maxW / cur.bmp.width, maxH / cur.bmp.height);
    c.width = Math.round(cur.bmp.width * k); c.height = Math.round(cur.bmp.height * k);
    const g = c.getContext("2d");
    g.drawImage(cur.bmp, 0, 0, c.width, c.height);
    g.strokeStyle = "#7C5CFF"; g.lineWidth = 3; g.fillStyle = "rgba(124,92,255,.12)";
    g.beginPath(); cur.pts.forEach(([x, y], i) => i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)); g.closePath(); g.fill(); g.stroke();
    setBox({ k, w: c.width, h: c.height });
  }, [cur]);

  const dragCorner = (i) => (e) => {
    e.preventDefault();
    const c = canvas.current;
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width;
    const mv = (ev) => {
      const x = Math.max(0, Math.min(c.width, (ev.clientX - r.left) * sx)) / box.k;
      const y = Math.max(0, Math.min(c.height, (ev.clientY - r.top) * sx)) / box.k;
      setCur(cc => ({ ...cc, pts: cc.pts.map((p, j) => j === i ? [x, y] : p) }));
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const rotate = async () => {
    const b = cur.bmp;
    const c = new OffscreenCanvas(b.height, b.width);
    const g = c.getContext("2d");
    g.translate(b.height, 0); g.rotate(Math.PI / 2); g.drawImage(b, 0, 0);
    const bmp = await createImageBitmap(c);
    setCur({ ...cur, bmp, pts: findCorners(bmp) });
  };

  const addPage = async () => {
    setBusy("Straightening the page...");
    try {
      const b = cur.bmp;
      const c = new OffscreenCanvas(b.width, b.height);
      c.getContext("2d").drawImage(b, 0, 0);
      const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.92 });
      const bytes = await blob.arrayBuffer();
      const [tl, tr, br, bl] = cur.pts;
      const w = Math.max(Math.hypot(tr[0] - tl[0], tr[1] - tl[1]), Math.hypot(br[0] - bl[0], br[1] - bl[1]));
      const h = Math.max(Math.hypot(bl[0] - tl[0], bl[1] - tl[1]), Math.hypot(br[0] - tr[0], br[1] - tr[1]));
      const scale = Math.min(1, 2400 / Math.max(w, h));
      const jpg = await call("warp", bytes, [tl, tr, br, bl], w * scale, h * scale, clean);
      const url = URL.createObjectURL(new Blob([jpg], { type: "image/jpeg" }));
      setPages(p => [...p, { jpg: jpg.buffer.slice(jpg.byteOffset, jpg.byteOffset + jpg.byteLength), url }]);
      const [next, ...rest] = queue;
      setQueue(rest);
      setCur(null);
      if (next) await startOn(next);
    } catch (e) { toast("Could not straighten it: " + e.message, "bad"); }
    setBusy("");
  };

  const finish = async () => {
    setBusy("Making the PDF...");
    try {
      const u8 = await call("imagesToPdf", pages.map(p => p.jpg.slice(0)));
      const bytes = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      let file;
      if (target) {
        await pageOp(target, "insertPages", at ?? 0, bytes);
        file = target;
        toast(`${pages.length} page${pages.length > 1 ? "s" : ""} added to "${target.name}".`, "ok");
      } else {
        const b = books.value.find(x => x.id === bid) || currentBook.value || books.value[0];
        if (!b) { toast("Make a book first."); setBusy(""); return; }
        let name = await ask("Save the scan", { value: "Scan " + fmtDate(new Date()), label: `It goes in "${b.name}" as a PDF.`, ok: "Save" });
        if (!name) { setBusy(""); return; }
        name = uniqueName(cleanName(name).replace(/\.pdf$/i, "") + ".pdf", b.files.map(f => f.name));
        file = await store.value.create(b.id, name, bytes, "application/pdf");
        addFileToBook(b.id, file);
        logChange("Scanned", name, b.name);
        file = { ...file, kind: "pdf" };
        openBook(b.id, file.id, 0);
        toast(`"${name}" is in "${b.name}".`, "ok");
      }
      if (read) {
        setBusy("Reading the words (this takes a moment the first time)...");
        await getDoc(file);
        const n = await readScannedDoc(file, (i, of) => setBusy(`Reading the words of page ${i + 1} of ${of}...`));
        if (n) toast(`${n} words read: Find and Reports can use them now.`, "ok");
      }
      close();
      scrollTo.value = { fileId: file.id, page: target ? at ?? 0 : 0 };
    } catch (e) { toast("Could not save the scan: " + e.message, "bad"); }
    setBusy("");
  };

  return (
    <Dialog title={target ? `Scan pages into "${target.name}"` : "Scan"} icon="camera" onClose={close} cls="mid"
      foot={<>
        <label class="chk small"><input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} />Clean (black on white)</label>
        <label class="chk small"><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />Read the words</label>
        <span class="grow" />
        {cur && <button class="btn" disabled={!!busy} onClick={addPage}><Icon n="check" size={17} />Use this page</button>}
        {!cur && pages.length > 0 && <button class="btn" disabled={!!busy} onClick={finish}>{target ? "Add the pages" : `Make the PDF (${pages.length})`}</button>}
      </>}>
      {busy && <div style={{ textAlign: "center" }}><div class="spinner" /><p class="small muted">{busy}</p></div>}
      {!busy && !cur && (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <p class="muted" style={{ marginTop: 0 }}>{pages.length ? "Another page?" : "Put the paper on a dark table, with light on it, and take a photo from above."}</p>
          <div class="row wrap" style={{ justifyContent: "center" }}>
            <button class="btn" onClick={() => take(true)}><Icon n="camera" />Take a photo</button>
            <button class="btn ghost" onClick={() => take(false)}><Icon n="image" />Choose photos</button>
          </div>
        </div>
      )}
      {!busy && cur && (
        <>
          <p class="small muted" style={{ marginTop: 0 }}>Drag the four corners onto the corners of the paper.</p>
          <div class="scanview">
            <div style={{ position: "relative", display: "inline-block" }}>
              <canvas ref={canvas} />
              {box && cur.pts.map((p, i) => (
                <span key={i} class="corner" onPointerDown={dragCorner(i)}
                  style={{ left: (p[0] * box.k / box.w * 100) + "%", top: (p[1] * box.k / box.h * 100) + "%" }} />
              ))}
            </div>
          </div>
          <div class="row" style={{ marginTop: 8 }}>
            <button class="btn plain small" onClick={rotate}><Icon n="rotate" size={16} />Turn</button>
            <button class="btn plain small" onClick={() => setCur({ ...cur, pts: findCorners(cur.bmp) })}>Find the paper again</button>
            <button class="btn plain small" onClick={() => setCur({ ...cur, pts: [[0, 0], [cur.bmp.width, 0], [cur.bmp.width, cur.bmp.height], [0, cur.bmp.height]] })}>The whole photo</button>
            <span class="grow" />
            {queue.length > 0 && <span class="tiny muted">{queue.length} more photo{queue.length > 1 ? "s" : ""}</span>}
          </div>
        </>
      )}
      {pages.length > 0 && <div class="thumbs">{pages.map((p, i) => <img key={i} src={p.url} alt={"Page " + (i + 1)} />)}</div>}
    </Dialog>
  );
}
