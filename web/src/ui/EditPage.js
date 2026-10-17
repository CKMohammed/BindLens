// "Edit like Word": a page of a PDF as a document you can change as in Word, then back into the PDF where it was.
// In Google Docs: Drive turns the page into a Google Doc (it reads the words); "Put the page back" brings it in again.
// In BindLens: the page's words (headings, bold, paragraphs) open in Write; Save puts the new page in its place.
import { settings, setSetting, store, toast, logChange } from "../state.js";
import { getDoc, call } from "../docs.js";
import { escapeHtml } from "../util.js";

export async function editInGoogle(book, f, page) {
  const s = store.value;
  toast("Making a Google Doc of the page (Google reads its words)...");
  try {
    const d = await getDoc(f);
    const u8 = await call("extractPages", d.key, [page]);
    const name = `${f.name.replace(/\.[^.]+$/, "")} - page ${page + 1}`;
    const g = await s.createConverted(null, name, u8, "application/pdf", "doc");
    const job = { id: g.id, kind: "doc", name, fileId: f.id, at: page, book: book.id, made: Date.now(), replace: { start: page, n: 1 } };
    setSetting("googleJobs", [...(settings.value.googleJobs || []), job]);
    const { openBeside } = await import("./AddPages.jsx");
    openBeside(s.editLink("doc", g.id));
    logChange("Opened a page in Google Docs", f.name, book.name);
    toast("Change the page in Google Docs, then come back and press Put the page back.", "ok", 7000);
  } catch (e) { toast("Google: " + e.message, "bad", 6000); }
}

// the page's lines -> a simple document: headings (bigger lines), bold lines, paragraphs
export function linesToHtml(lines) {
  const ls = lines.filter(l => (l.text || "").trim());
  if (!ls.length) return "<p></p>";
  const sizes = {};
  for (const l of ls) { const k = Math.round(l.size); sizes[k] = (sizes[k] || 0) + l.text.length; }
  const body = Number(Object.entries(sizes).sort((a, b) => b[1] - a[1])[0][0]) || 11;
  const out = [];
  let para = null, last = null;
  const flush = () => { if (para) out.push(para.tag === "p" ? `<p>${para.html}</p>` : `<${para.tag}>${para.html}</${para.tag}>`); para = null; };
  for (const l of ls) {
    const t = escapeHtml(l.text.replace(/\s+/g, " ").trim());
    const tag = l.size >= body * 1.6 ? "h1" : l.size >= body * 1.25 ? "h2" : "p";
    const gap = last ? l.y - (last.y + last.h) : 0;
    const newPara = !para || tag !== para.tag || tag !== "p" || gap > last.h * 0.7 || l.block !== last.block;
    if (newPara) { flush(); para = { tag, html: "" }; }
    const piece = l.bold && tag === "p" ? `<b>${t}</b>` : l.italic && tag === "p" ? `<i>${t}</i>` : t;
    if (para.html && para.html.endsWith("-")) para.html = para.html.slice(0, -1) + piece;
    else para.html += (para.html ? " " : "") + piece;
    last = l;
  }
  flush();
  return out.join("\n");
}

export async function editInWrite(book, f, page) {
  const d = await getDoc(f);
  // a page written in BindLens opens as it was written
  const w = await call("writtenAt", d.key, page);
  const { panel } = await import("../state.js");
  if (w) { panel.value = { type: "write", edit: { fileId: f.id, start: w.start, n: w.n, html: w.html } }; return; }
  const lines = await call("pageLines", d.key, page);
  if (!lines.some(l => (l.text || "").trim())) { toast("This page has no words (a scan?). Edit > Read scan (OCR) first."); return; }
  panel.value = { type: "write", edit: { fileId: f.id, start: page, n: 1, html: linesToHtml(lines), fromPage: true } };
  toast("The words of the page, as a document. Pictures and the exact look are not kept - Undo brings the page back.", "", 7000);
  void book;
}
