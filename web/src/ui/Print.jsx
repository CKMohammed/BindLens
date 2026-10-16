// Print: BindLens makes the PDF (with your marks) and opens it in a new tab, where you print it.
import { useState } from "preact/hooks";
import { panel, currentBook, currentFile, pageNo, toast, books } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { getDoc, call, saveNow, fileFor } from "../docs.js";
import { isPaged } from "../util.js";

async function pdfBytesOf(file) {
  // the document as a PDF, marks included
  const d = await getDoc(file);
  if (d.isPDF && !d.converted) {
    const u8 = await call("save", d.key);
    return u8;
  }
  // a converted or picture document: one picture per page
  const pngs = [];
  for (let i = 0; i < d.pages.length; i++) {
    const p = await call("pagePng", d.key, i, 2);
    pngs.push(p.buffer.slice(p.byteOffset, p.byteOffset + p.byteLength));
  }
  return call("imagesToPdf", pngs);
}

export async function makePrintPdf(what, file, page, book) {
  if (what === "doc") return pdfBytesOf(file);
  if (what === "page") {
    const all = await pdfBytesOf(file);
    const tmp = "print-" + Date.now();
    await call("open", tmp, all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength), "application/pdf", "x.pdf");
    const n = (await call("info", tmp)).pages.length;
    for (let i = n - 1; i >= 0; i--) if (i !== page) await call("deletePage", tmp, i);
    const out = await call("save", tmp);
    await call("close", tmp);
    return out;
  }
  // the whole book: every document one after another
  const list = [];
  for (const f of book.files) {
    if (!isPaged(f.kind)) continue;
    if (f.kind === "image") {
      const { store } = await import("../state.js");
      const buf = await store.value.read(f);
      const u8 = await call("imagesToPdf", [buf]);
      list.push(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
      continue;
    }
    const u8 = await pdfBytesOf(f);
    list.push(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
  }
  if (!list.length) throw new Error("Nothing in this book can be printed");
  return call("joinPdfs", list);
}

export function Print() {
  const book = currentBook.value || books.value[0];
  const file = currentFile.value;
  const [what, setWhat] = useState(file ? "doc" : "book");
  const [busy, setBusy] = useState(false);
  const close = () => { panel.value = null; };
  const go = async () => {
    const w = window.open("", "_blank");
    if (w) w.document.write("<p style='font:16px sans-serif;padding:30px'>BindLens is making the PDF to print...</p>");
    setBusy(true);
    try {
      if (file) await saveNow(file.id);
      const u8 = await makePrintPdf(what, file, pageNo.value, book);
      const url = URL.createObjectURL(new Blob([u8], { type: "application/pdf" }));
      if (w) w.location.href = url; else window.open(url, "_blank");
      close();
      toast("Print it from the new tab (the printer button, or Ctrl+P).", "ok", 5000);
    } catch (e) {
      if (w) w.close();
      toast("Could not make the PDF: " + e.message, "bad");
    }
    setBusy(false);
  };
  const opt = (k, icon, t, d, dis) => (
    <button class={"cardopt" + (what === k ? " on" : "")} disabled={dis} onClick={() => setWhat(k)} style={dis ? { opacity: .5 } : null}>
      <Icon n={icon} /><span><b>{t}</b><span class="small muted">{d}</span></span>
    </button>
  );
  return (
    <Dialog title="Print" icon="print" onClose={close}
      foot={<><button class="btn plain" onClick={close}>Cancel</button><button class="btn" disabled={busy || !book} onClick={go}>{busy ? "Making it..." : <><Icon n="print" size={17} />Open to print</>}</button></>}>
      <div style={{ display: "grid", gap: 8 }}>
        {opt("page", "file", "This page", file ? `Page ${pageNo.value + 1} of ${file.name}` : "", !file)}
        {opt("doc", "pdf", "This document", file ? file.name + ", with your marks" : "", !file)}
        {opt("book", "book", "The whole book", book ? `Every document of "${book.name}", one after another` : "", !book)}
      </div>
      <p class="small muted" style={{ marginBottom: 0 }}>The PDF opens in a new tab of your browser. Print it from there with your printer.</p>
    </Dialog>
  );
}

export { fileFor };
