// Print: BindLens makes the PDF (with your marks) and opens it in a new tab, where you print it.
import { useState } from "preact/hooks";
import { panel, currentBook, currentFile, pageNo, toast, books } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { getDoc, call, saveNow, fileFor } from "../docs.js";
import { isPaged } from "../util.js";
import { _t } from "../i18n.js";

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

async function withoutMarks(u8) {
  const tmp = "print-nomarks-" + Date.now();
  await call("open", tmp, u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), "application/pdf", "x.pdf");
  const n = (await call("info", tmp)).pages.length;
  for (let i = 0; i < n; i++) await call("deleteAllAnnots", tmp, i);
  const out = await call("save", tmp);
  await call("close", tmp);
  return out;
}

export async function makePrintPdf(what, file, page, book, { range = "", marks = true } = {}) {
  const u8 = await makeIt(what, file, page, book, range);
  return marks ? u8 : withoutMarks(u8);
}

async function makeIt(what, file, page, book, range) {
  if (what === "doc") return pdfBytesOf(file);
  if (what === "pages") {
    const all = await pdfBytesOf(file);
    const tmp = "print-" + Date.now();
    await call("open", tmp, all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength), "application/pdf", "x.pdf");
    const n = (await call("info", tmp)).pages.length;
    const { parsePages } = await import("../filetools.js");
    const pages = parsePages(range, n);
    if (!pages) { await call("close", tmp); throw new Error(_t("Write the pages like this: 1-3, 5")); }
    const out = await call("extractPages", tmp, pages);
    await call("close", tmp);
    return out;
  }
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
  if (!list.length) throw new Error(_t("Nothing in this book can be printed"));
  return call("joinPdfs", list);
}

export function Print() {
  const book = currentBook.value || books.value[0];
  const file = currentFile.value;
  const [what, setWhat] = useState(file ? "doc" : "book");
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState("");
  const [marks, setMarks] = useState(true);
  const close = () => { panel.value = null; };
  const go = async () => {
    const w = window.open("", "_blank");
    if (w) w.document.write("<p style='font:16px sans-serif;padding:30px'>BindLens is making the PDF to print...</p>");
    setBusy(true);
    try {
      if (file) await saveNow(file.id);
      const u8 = await makePrintPdf(what, file, pageNo.value, book, { range, marks });
      const url = URL.createObjectURL(new Blob([u8], { type: "application/pdf" }));
      if (w) w.location.href = url; else window.open(url, "_blank");
      close();
      toast(_t("Print it from the new tab (the printer button, or Ctrl+P)."), "ok", 5000);
    } catch (e) {
      if (w) w.close();
      toast(_t("Could not make the PDF: ") + e.message, "bad");
    }
    setBusy(false);
  };
  const opt = (k, icon, t, d, dis) => (
    <button class={"cardopt" + (what === k ? " on" : "")} disabled={dis} onClick={() => setWhat(k)} style={dis ? { opacity: .5 } : null}>
      <Icon n={icon} /><span><b>{t}</b><span class="small muted">{d}</span></span>
    </button>
  );
  return (
    <Dialog title={_t("Print")} icon="print" onClose={close}
      foot={<><button class="btn plain" onClick={close}>{_t("Cancel")}</button><button class="btn" disabled={busy || !book || (what === "pages" && !range.trim())} onClick={go}>{busy ? _t("Making it...") : <><Icon n="print" size={17} />{_t("Open to print")}</>}</button></>}>
      <div style={{ display: "grid", gap: 8 }}>
        {opt("page", "file", _t("This page"), file ? _t("Page {0} of {1}", pageNo.value + 1, file.name) : "", !file)}
        {opt("pages", "grid", _t("Some pages"), file ? _t("Of {0}", file.name) : "", !file)}
        {what === "pages" && <input class="field" autoFocus placeholder={_t("Which pages? For example 1-3, 5")} value={range} onInput={(e) => setRange(e.target.value)} />}
        {opt("doc", "pdf", _t("This document"), file ? file.name : "", !file)}
        {opt("book", "book", _t("The whole book"), book ? _t("Every document of \"{0}\", one after another", book.name) : "", !book)}
      </div>
      <label class="chk" style={{ marginTop: 12 }}><input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} />{_t("With my marks (highlights, notes, stamps...)")}</label>
      <p class="small muted" style={{ marginBottom: 0 }}>{_t("The PDF opens in a new tab of your browser. Print it from there with your printer.")}</p>
    </Dialog>
  );
}

export { fileFor };
