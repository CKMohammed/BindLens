// Add pages: one clear place for every way to add pages to a document - paper (blank, lined, squared, dotted), a file,
// pages of another document, a written page, a scan, or the real Google Docs / Sheets / Slides in a window beside.
import { useEffect, useState } from "preact/hooks";
import { panel, books, fileId, pageNo, settings, setSetting, store, toast, addFileToBook, logChange, openBook } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { getDoc, pageOp, fileFor, call, anyToPdf, pdfCopyOf } from "../docs.js";
import { scrollTo, docState } from "./Viewer.jsx";
import { pickFiles } from "../actions.js";
import { kindOf, uniqueName, baseName, isPaged } from "../util.js";
import { parsePages } from "../filetools.js";

const close = () => { panel.value = null; };
const ab = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

const PAPER = [
  ["blank", "Blank page", "The size of the page you are on"],
  ["lined", "Lined page", "Lines and a margin, like a notebook"],
  ["squared", "Squared page", "5 mm squares"],
  ["dotted", "Dotted page", "A dot every 5 mm"],
];
const GOOGLE = [["doc", "Google Docs", "word", "A letter, a report, notes"], ["sheet", "Google Sheets", "excel", "A table, figures, a budget"],
  ["slides", "Google Slides", "slides", "Slides, a poster"]];

// the paper, drawn small
function Paper({ k }) {
  const lines = [];
  if (k === "lined") for (let y = 14; y < 56; y += 7) lines.push(<line key={y} x1="6" x2="40" y1={y} y2={y} stroke="#A9C4EC" stroke-width="1" />);
  if (k === "squared") { for (let x = 6; x <= 40; x += 5) lines.push(<line key={"x" + x} x1={x} x2={x} y1="6" y2="56" stroke="#D5DBE5" stroke-width=".8" />); for (let y = 6; y <= 56; y += 5) lines.push(<line key={"y" + y} x1="6" x2="40" y1={y} y2={y} stroke="#D5DBE5" stroke-width=".8" />); }
  if (k === "dotted") for (let x = 8; x <= 40; x += 5) for (let y = 8; y <= 56; y += 5) lines.push(<circle key={x + "," + y} cx={x} cy={y} r=".9" fill="#9EA6B8" />);
  return (
    <svg viewBox="0 0 46 62" width="40" height="54" aria-hidden="true">
      <rect x="1" y="1" width="44" height="60" rx="2" fill="#fff" stroke="#D9D6CE" />
      {lines}{k === "lined" && <line x1="11" x2="11" y1="3" y2="59" stroke="#EAA4A4" stroke-width=".9" />}
    </svg>
  );
}

// Google: the real editor in a window beside BindLens; its pages come in when you are done
export function openBeside(url) {
  const w = Math.min(1100, Math.round(screen.availWidth * 0.55)), h = Math.round(screen.availHeight * 0.92);
  const left = Math.max(0, screen.availWidth - w), top = Math.round(screen.availHeight * 0.04);
  return window.open(url, "bl_google", `popup,width=${w},height=${h},left=${left},top=${top}`) || window.open(url, "_blank");
}

export async function addGooglePages(job, { replace = false } = {}) {
  // job: {id, kind, name, fileId, at, start?, n?}
  const s = store.value;
  const file = fileFor(job.fileId);
  if (!file) { toast("The document to add the pages to is no longer in the library."); return false; }
  toast(`Bringing the pages of "${job.name}"...`);
  const pdf = await s.exportPdf(job.id);
  const tag = { from: "google", kind: job.kind, id: job.id, name: job.name };
  let at = job.at;
  if (replace) await pageOp(file, "replaceTagged", job.start, job.n, pdf, tag);
  else {
    const d = await getDoc(file);
    at = Math.min(job.at, d.pages.length);
    await pageOp(file, "insertTagged", at, pdf, tag);
  }
  setSetting("googleJobs", (settings.value.googleJobs || []).filter(j => j.id !== job.id || j.fileId !== job.fileId));
  logChange(replace ? "Put in anew the pages of " + job.name + " in" : "Added the pages of " + job.name + " to", file.name);
  fileId.value = file.id; pageNo.value = replace ? job.start : at;
  setTimeout(() => { scrollTo.value = { fileId: file.id, page: replace ? job.start : at }; }, 160);
  toast(replace ? `The pages of "${job.name}" are up to date.` : `The pages of "${job.name}" are in "${file.name}". Ctrl+Z takes them out.`, "ok", 5000);
  return true;
}

export function AddPages({ book: bid, tab: firstTab, at: atGiven }) {
  const book = books.value.find(b => b.id === bid) || books.value.find(b => b.files.some(f => f.id === fileId.value));
  const cur = fileFor(fileId.value);
  const inBook = cur && book && book.files.some(f => f.id === cur.id);
  const pdfs = book ? book.files.filter(f => f.kind === "pdf") : [];
  const [target, setTarget] = useState(inBook && isPaged(cur.kind) && cur.kind !== "image" ? cur.id : pdfs[0]?.id || "new");
  const [where, setWhere] = useState(atGiven != null ? "given" : "after");
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState("");
  const [other, setOther] = useState(null);       // pages of another document: {fileId, pages}
  const [gname, setGname] = useState("");
  const tf = target === "new" ? null : fileFor(target);
  const isCur = tf && cur && tf.id === cur.id;
  const n = tf ? (docState.value[tf.id]?.pages?.length || 0) : 0;
  const needsCopy = tf && tf.kind !== "pdf";
  const jobs = (settings.value.googleJobs || []).filter(j => book && j.book === book.id);
  useEffect(() => { if (tf) getDoc(tf).catch(() => {}); }, [target]);
  if (!book) return <Dialog title="Add pages" icon="addpage" onClose={close}><p>Open a book first.</p></Dialog>;

  const atIndex = async (f) => {
    const d = await getDoc(f);
    const total = d.pages.length;
    if (where === "given") return Math.min(atGiven, total);
    if (where === "start") return 0;
    if (where === "end" || !isCur) return total;
    return Math.min(total, where === "before" ? pageNo.value : pageNo.value + 1);
  };
  const sizeRef = async (f) => {
    if (!f) return { w: 595, h: 842 };
    const d = await getDoc(f);
    const i = Math.max(0, Math.min(d.pages.length - 1, isCur ? pageNo.value : 0));
    const p = d.pages[i] || { w: 595, h: 842 };
    return { w: Math.round(p.w), h: Math.round(p.h) };
  };
  // the PDF to add to: the one chosen, or a PDF copy of a Word / Excel file, or a new document
  const theTarget = async () => {
    if (!tf) return null;
    if (!needsCopy) return tf;
    const copy = await pdfCopyOf(tf, book);
    setTarget(copy.id);
    return copy;
  };
  const newDoc = async (name, bytes) => {
    const taken = book.files.map(f => f.name);
    const nm = uniqueName(name, taken);
    const f = await store.value.create(book.id, nm, bytes, "application/pdf");
    f.parent = book.id;
    addFileToBook(book.id, f);
    logChange("Made", nm, book.name);
    close();
    openBook(book.id, f.id, 0);
    toast(`"${nm}" is in "${book.name}".`, "ok");
  };
  const done = (f, at, k) => {
    close();
    fileId.value = f.id; pageNo.value = at;
    setTimeout(() => { scrollTo.value = { fileId: f.id, page: at }; }, 160);
    toast(`${k === 1 ? "1 page" : k + " pages"} added${at === 0 ? " at the start" : ` after page ${at}`} of "${f.name}". Ctrl+Z takes ${k === 1 ? "it" : "them"} out.`, "ok", 5000);
  };
  const run = async (label, fn) => {
    if (busy) return;
    setBusy(label);
    try { await fn(); } catch (e) { console.error(e); toast("The pages could not be added: " + (e.message || e), "bad", 6000); }
    setBusy("");
  };

  const addPaper = (k) => run(k, async () => {
    const z = await sizeRef(tf);
    if (!tf) { const u8 = await call("blankPdf", count, z.w, z.h, k); await newDoc((k === "blank" ? "New pages" : PAPER.find(p => p[0] === k)[1] + "s") + ".pdf", ab(u8)); return; }
    const f = await theTarget();
    const at = await atIndex(f);
    await pageOp(f, "insertBlank", at, count, z.w, z.h, k);
    logChange(`Added ${count} ${k} page${count === 1 ? "" : "s"} to`, f.name, book.name);
    done(f, at, count);
  });
  const addFiles = () => run("file", async () => {
    const fs = await pickFiles({ accept: "application/pdf,.pdf,image/*,.docx,.xlsx,.pptx,.odt,.ods,.odp,.rtf,.txt,.md,.csv,.html,.eml" });
    if (!fs.length) return;
    // pictures together (one page each); every other file its own pages, in the order chosen
    const parts = [];
    const pics = fs.filter(x => kindOf(x.name, x.type) === "image");
    if (pics.length) { const u8 = await call("imagesToPdf", await Promise.all(pics.map(x => x.arrayBuffer()))); parts.push(ab(u8)); }
    for (const x of fs.filter(y => kindOf(y.name, y.type) !== "image")) {
      const pdf = await anyToPdf(x.name, x.type, await x.arrayBuffer(), kindOf(x.name, x.type));
      if (pdf) parts.push(pdf); else toast(`"${x.name}" cannot be turned into pages here.`);
    }
    if (!parts.length) return;
    if (!tf) {
      let bytes = parts[0];
      for (let i = 1; i < parts.length; i++) bytes = await joinTwo(bytes, parts[i]);
      await newDoc(baseName(fs[0].name) + ".pdf", bytes); return;
    }
    const f = await theTarget();
    let at = await atIndex(f);
    const at0 = at;
    let total = 0;
    for (const part of parts) {
      const before = (await getDoc(f)).pages.length;
      const pages = await pageOp(f, "insertPages", at, part);
      const k = pages.length - before;
      at += k; total += k;
    }
    logChange(`Added ${total} pages from ${fs.map(x => x.name).join(", ")} to`, f.name, book.name);
    done(f, at0, total);
  });
  const addOther = () => run("other", async () => {
    const src = fileFor(other.fileId);
    const d = await getDoc(src);
    const list = parsePages(other.pages || "1-", d.pages.length);
    if (!list || !list.length) { toast("Write the pages like this: 1-3, 5"); return; }
    const u8 = await call("extractPages", d.key, list);
    if (!tf) { await newDoc(baseName(src.name) + " (pages).pdf", ab(u8)); return; }
    const f = await theTarget();
    const at = await atIndex(f);
    await pageOp(f, "insertPages", at, ab(u8));
    logChange(`Added ${list.length} pages of ${src.name} to`, f.name, book.name);
    done(f, at, list.length);
  });
  const startGoogle = (kind) => run("g" + kind, async () => {
    const s = store.value;
    const name = (gname.trim() || ({ doc: "Notes", sheet: "Table", slides: "Slides" })[kind] + " " + new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })).slice(0, 80);
    if (!tf) {
      // its own document in the book: the Google file lives in the book, BindLens shows its pages
      const g = await s.createGoogle(kind, name, book.id);
      g.parent = book.id;
      addFileToBook(book.id, g);
      logChange("Made a Google " + ({ doc: "Doc", sheet: "Sheet", slides: "Slides" })[kind], name, book.name);
      openBeside(s.editLink(kind, g.id));
      close();
      openBook(book.id, g.id, 0);
      toast(`"${name}" is open in Google ${({ doc: "Docs", sheet: "Sheets", slides: "Slides" })[kind]}. When you come back, BindLens shows it as it is now.`, "ok", 7000);
      return;
    }
    const f = await theTarget();
    const at = await atIndex(f);
    const g = await s.createGoogle(kind, name, null);     // kept in the BindLens folder, not as a document of the book
    const job = { id: g.id, kind, name, fileId: f.id, at, book: book.id, made: Date.now() };
    setSetting("googleJobs", [...(settings.value.googleJobs || []), job]);
    openBeside(s.editLink(kind, g.id));
    logChange("Opened Google " + ({ doc: "Docs", sheet: "Sheets", slides: "Slides" })[kind] + " for pages of", f.name, book.name);
  });

  const google = store.value.kind === "drive" && store.value.createGoogle;
  const docsOf = books.value.flatMap(b => b.files.filter(f => isPaged(f.kind) && f.kind !== "image" && f.id !== target).map(f => ({ f, b })));
  return (
    <Dialog title="Add pages" icon="addpage" onClose={close} cls="wide addpages">
      <div class="ap-where">
        <label class="small"><span class="muted">To</span>
          <select class="field" value={target} onChange={(e) => setTarget(e.target.value)}>
            {book.files.filter(f => isPaged(f.kind) && f.kind !== "image").map(f => <option key={f.id} value={f.id}>{f.name}{f.kind !== "pdf" ? " (BindLens makes a PDF copy)" : ""}</option>)}
            <option value="new">A new document in "{book.name}"</option>
          </select></label>
        {tf && <label class="small"><span class="muted">Where</span>
          <select class="field" value={where} onChange={(e) => setWhere(e.target.value)}>
            {atGiven != null && <option value="given">After page {atGiven}</option>}
            {isCur && <option value="after">After this page ({pageNo.value + 1})</option>}
            {isCur && <option value="before">Before this page ({pageNo.value + 1})</option>}
            <option value="start">At the start</option>
            <option value="end">At the end{n ? ` (after page ${n})` : ""}</option>
          </select></label>}
      </div>
      {jobs.length > 0 && (
        <div class="ap-jobs">
          {jobs.map(j => (
            <div key={j.id} class="ap-job">
              <Icon n={GOOGLE.find(g => g[0] === j.kind)?.[2] || "word"} size={18} />
              <span class="grow small"><b>{j.name}</b> is open in Google {({ doc: "Docs", sheet: "Sheets", slides: "Slides" })[j.kind]} · its pages go into <b>{fileFor(j.fileId)?.name || "a document"}</b></span>
              <button class="btn plain small" onClick={() => openBeside(store.value.editLink(j.kind, j.id))}>Open it again</button>
              <button class="btn small" disabled={!!busy} onClick={() => run("job", async () => { if (await addGooglePages(j)) close(); })}><Icon n="addpage" size={15} />Add these pages</button>
              <button class="ib" title="Forget it (the Google file stays in your Drive)" onClick={() => setSetting("googleJobs", (settings.value.googleJobs || []).filter(x => x !== j))}><Icon n="close" size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <div class="ap-sec">Paper</div>
      <div class="ap-grid">
        {PAPER.map(([k, t, d]) => (
          <button key={k} class={"ap-card" + (busy === k ? " busy" : "")} onClick={() => addPaper(k)} disabled={!!busy}>
            <Paper k={k} /><span><b>{t}</b><small>{d}</small></span>
          </button>
        ))}
        <label class="ap-count small"><span class="muted">How many</span>
          <input class="field" type="number" min="1" max="50" value={count} onInput={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} /></label>
      </div>
      <div class="ap-sec">From somewhere else</div>
      <div class="ap-grid">
        <button class={"ap-card" + (busy === "file" ? " busy" : "")} onClick={addFiles} disabled={!!busy}>
          <span class="ap-ico"><Icon n="upload" size={22} /></span><span><b>From a file</b><small>PDF, photos, Word, Excel, PowerPoint, text</small></span>
        </button>
        <button class="ap-card" onClick={() => { close(); panel.value = { type: "scan", book: book.id, into: tf && !needsCopy ? tf.id : undefined, at: tf && isCur ? pageNo.value + 1 : undefined }; }} disabled={!!busy}>
          <span class="ap-ico"><Icon n="camera" size={22} /></span><span><b>Scan paper</b><small>The camera of your phone, or photos</small></span>
        </button>
        <button class="ap-card" onClick={() => { close(); panel.value = { type: "write", book: book.id, into: tf && !needsCopy ? tf.id : undefined, at: tf && isCur ? pageNo.value + 1 : undefined }; }} disabled={!!busy}>
          <span class="ap-ico"><Icon n="edit" size={22} /></span><span><b>Write a page here</b><small>A letter, notes, a table, in BindLens</small></span>
        </button>
        <div class={"ap-card ap-other" + (other ? " open" : "")}>
          <button class="ap-in" onClick={() => setOther(other ? null : { fileId: docsOf[0]?.f.id || "", pages: "1-" })} disabled={!docsOf.length}>
            <span class="ap-ico"><Icon n="copy" size={22} /></span><span><b>Pages of another document</b><small>{docsOf.length ? "From any book of your library" : "There is no other document yet"}</small></span>
          </button>
          {other && <div class="ap-otherform">
            <select class="field" value={other.fileId} onChange={(e) => setOther({ ...other, fileId: e.target.value })}>
              {docsOf.map(({ f, b }) => <option key={f.id} value={f.id}>{b.name} · {f.name}</option>)}
            </select>
            <input class="field" value={other.pages} placeholder="Pages, e.g. 1-3, 5 (1- is all)" onInput={(e) => setOther({ ...other, pages: e.target.value })} />
            <button class="btn small" onClick={addOther} disabled={!!busy || !other.fileId}>Add them</button>
          </div>}
        </div>
      </div>
      {google && <>
        <div class="ap-sec">Write it in Google, then bring the pages <span class="ap-new">New</span></div>
        <p class="small muted" style={{ margin: "0 0 8px" }}>{tf
          ? <>The real Google editor opens in a window beside BindLens. Write, then come back and press <b>Add these pages</b>: they go into "{tf.name}", where you chose. The Google file stays in your Drive, and later you can open it again and bring its pages anew.</>
          : <>A Google document of its own in "{book.name}": it opens in a window beside BindLens, and BindLens shows its pages here as it changes.</>}</p>
        <div class="ap-gname"><input class="field" value={gname} placeholder="Its name (e.g. Minutes of the meeting)" onInput={(e) => setGname(e.target.value)} /></div>
        <div class="ap-grid">
          {GOOGLE.map(([k, t, ic, d]) => (
            <button key={k} class={"ap-card" + (busy === "g" + k ? " busy" : "")} onClick={() => startGoogle(k)} disabled={!!busy}>
              <span class={"ap-ico g-" + k}><Icon n={ic} size={22} /></span><span><b>{t}</b><small>{d}</small></span>
            </button>
          ))}
        </div>
      </>}
      {busy && <div class="ap-busy"><div class="spinner" style={{ width: 20, height: 20, margin: 0 }} /><span class="small">Adding the pages...</span></div>}
    </Dialog>
  );
}

// two PDFs as one (for a new document made of several files)
async function joinTwo(a, b) {
  const key = "join:" + Math.random().toString(36).slice(2);
  const r = await call("open", key, a, "application/pdf", "a.pdf");
  try {
    await call("insertPages", key, r.pages.length, b);
    return ab(await call("save", key));
  } finally { call("close", key).catch(() => {}); }
}
