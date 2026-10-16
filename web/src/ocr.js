// Reading the words of a scanned page (Tesseract, in this browser). The words are written invisibly over the
// page in the PDF, so Find, Reports and any PDF program can search and copy them.
import { call, getDoc, afterEdit } from "./docs.js";
import { toast } from "./state.js";

let worker = null;
async function tesseract(lang = "eng") {
  if (worker) return worker;
  const { createWorker } = await import("tesseract.js");
  worker = await createWorker(lang);
  return worker;
}

function wordsFrom(data) {
  const out = [];
  const walk = (o) => {
    if (!o) return;
    if (o.words) for (const w of o.words) if (w.text && w.text.trim() && w.confidence > 30) out.push({ text: w.text.trim(), bbox: [w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1] });
    for (const k of ["blocks", "paragraphs", "lines"]) if (Array.isArray(o[k])) o[k].forEach(walk);
  };
  if (data.words) walk({ words: data.words });
  else walk(data);
  return out;
}

// image (Blob / bytes) -> [{text, bbox in image pixels}]
export async function readImage(img) {
  const w = await tesseract();
  const { data } = await w.recognize(img, {}, { blocks: true, text: true });
  return { words: wordsFrom(data), text: data.text || "" };
}

// a page of a PDF in the book: draw it, read it, write the words in
export async function readScannedPage(file, page) {
  const d = await getDoc(file);
  if (!d.isPDF || d.readOnly) throw new Error("Only PDF pages can be read");
  if (await call("hasText", d.key, page)) return 0;
  const p = d.pages[page];
  const scale = Math.min(3, 2400 / Math.max(p.w, p.h));
  const png = await call("pagePng", d.key, page, scale);
  const { words } = await readImage(new Blob([png], { type: "image/png" }));
  if (!words.length) return 0;
  const k = 1 / scale;
  await call("addInvisibleText", d.key, page, words.map(w => ({ text: w.text, bbox: w.bbox.map(v => v * k) })));
  afterEdit(file.id, "pages");
  return words.length;
}

export async function readScannedDoc(file, onProgress) {
  const d = await getDoc(file);
  let total = 0;
  for (let i = 0; i < d.pages.length; i++) {
    onProgress && onProgress(i, d.pages.length);
    try { total += await readScannedPage(file, i); } catch (e) { toast(e.message, "bad"); break; }
  }
  return total;
}
