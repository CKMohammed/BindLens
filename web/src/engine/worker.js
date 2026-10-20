// BindLens Web - the document engine. Runs MuPDF (the same engine as the Windows app) in a Web Worker, so pages
// render, marks are written and files are saved without freezing the page. The page talks to it with messages:
// {id, fn, args} -> {id, ok, value} (see client.js).
// (the build puts MuPDF's WebAssembly file next to its script; MuPDF finds it there)
import { _t } from "../i18n.js";
const mupdf = await import("mupdf");

const docs = new Map(); // key -> {doc, pdf, mime, name, journal}

function get(key) {
  const d = docs.get(key);
  if (!d) throw new Error(_t("This document is not open: ") + key);
  return d;
}

function pageSizes(doc) {
  const out = [];
  const n = doc.countPages();
  for (let i = 0; i < n; i++) {
    const p = doc.loadPage(i);
    const b = p.getBounds();
    out.push({ w: b[2] - b[0], h: b[3] - b[1], x0: b[0], y0: b[1] });
    p.destroy?.();
  }
  return out;
}

function flatOutline(items, depth = 0, out = []) {
  for (const it of items || []) {
    out.push({ title: it.title || "", page: it.page ?? -1, depth });
    if (it.down) flatOutline(it.down, depth + 1, out);
  }
  return out;
}

const annotTypesWeShow = new Set(["Text", "FreeText", "Line", "Square", "Circle", "Polygon", "PolyLine", "Highlight",
  "Underline", "Squiggly", "StrikeOut", "Stamp", "Caret", "Ink", "FileAttachment", "Redact"]);

function colorOf(c) {
  if (!c || !c.length) return null;
  if (c.length === 1) return [c[0], c[0], c[0]];
  if (c.length === 4) { const k = c[3]; return [(1 - c[0]) * (1 - k), (1 - c[1]) * (1 - k), (1 - c[2]) * (1 - k)]; }
  return c;
}

function describeAnnot(a, i) {
  const type = a.getType();
  const o = { i, type, rect: a.getBounds(), contents: "", color: null, author: "" };
  try { o.contents = a.getContents() || ""; } catch (e) {}
  try { o.color = colorOf(a.getColor()); } catch (e) {}
  try { if (a.hasAuthor()) o.author = a.getAuthor() || ""; } catch (e) {}
  try { o.subject = a.getSubject?.() || ""; } catch (e) {}
  try { o.name = a.getName?.() || ""; } catch (e) {}
  try { if (a.hasQuadPoints()) o.quads = a.getQuadPoints(); } catch (e) {}
  try { o.opacity = a.getOpacity(); } catch (e) {}
  try { o.modified = +a.getModificationDate(); } catch (e) {}
  if (type === "FreeText") { const st = styleOf(a); if (st) o.style = st; try { o.size = a.getDefaultAppearance().size; } catch (e) {} }
  if (type === "Square" || type === "Circle") { try { const ic = a.getInteriorColor(); if (ic && ic.length) o.fill = colorOf(ic); } catch (e) {} }
  if (type === "Line") try { o.line = a.getLine(); } catch (e) {}
  if (type === "FreeText" && o.subject === "Sticky note") try { o.paper = colorOf(a.getColor()); } catch (e) {}
  const rot = rotOf(a);
  if (rot && Math.abs(rot.deg || 0) > 0.05) { o.rot = rot.deg; o.rw = rot.w; o.rh = rot.h; }
  if (type === "Text") {
    // a comment (with a name and a date) and the replies to it ("IRT", as Acrobat writes them)
    try { const obj = a.getObject(); o.num = obj.isIndirect() ? obj.asIndirect() : -1; if (!obj.get("IRT").isNull()) o.reply = true; if (!obj.get("BLDone").isNull()) o.done = true; } catch (e) {}
  }
  return o;
}

function annotNum(a) { try { const o = a.getObject(); return o.isIndirect() ? o.asIndirect() : -1; } catch (e) { return -1; } }
function findByNum(p, num) { return p.getAnnotations().find(a => annotNum(a) === num) || null; }
const PINK = [1, 0.52, 0.76], DONE = [0.18, 0.55, 0.34];

function loadPDFPage(d, page) {
  if (!d.pdf) throw new Error(_t("Marks can only go on PDF pages"));
  return d.pdf.loadPage(page);
}

function stCache(d, page) {
  d.st = d.st || new Map();
  if (!d.st.has(page)) d.st.set(page, d.doc.loadPage(page).toStructuredText("preserve-whitespace"));
  return d.st.get(page);
}

function stextOf(page) {
  return JSON.parse(page.toStructuredText("preserve-whitespace,preserve-spans").asJSON());
}

// ---- writing new text into a page (Change the text): a small content stream with a standard font
const BASE14 = {
  sans: ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"],
  serif: ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"],
  mono: ["Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"],
};

function pdfString(s) {
  // WinAnsi text for the standard fonts: escape ( ) \ and write other characters as octal
  let out = "";
  for (const ch of s) {
    let c = ch.codePointAt(0);
    const map = { 0x20AC: 128, 0x2018: 145, 0x2019: 146, 0x201C: 147, 0x201D: 148, 0x2013: 150, 0x2014: 151, 0x2022: 149 };
    if (map[c]) c = map[c];
    if (c > 255) c = 63; // ?
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else if (c < 32 || c > 126) out += "\\" + c.toString(8).padStart(3, "0");
    else out += String.fromCharCode(c);
  }
  return "(" + out + ")";
}

function textWidth(font, s, size) {
  let w = 0;
  for (const ch of s) {
    const g = font.encodeCharacter(ch.codePointAt(0));
    w += font.advanceGlyph(g, 0);
  }
  return w * size;
}

function addTextToPage(d, pageIndex, items, cover) {
  // items: [{x, y (baseline, page coords from the top), text, size, family, bold, italic, color:[r,g,b]}]
  const page = d.pdf.loadPage(pageIndex);
  const pobj = page.getObject();
  let res = pobj.getInheritable("Resources");
  if (!res || res.isNull()) { res = d.pdf.newDictionary(); pobj.put("Resources", res); }
  else if (res.isIndirect()) res = res.resolve();
  let fonts = res.get("Font");
  if (!fonts || fonts.isNull()) { fonts = d.pdf.newDictionary(); res.put("Font", fonts); }
  const [, , , H] = page.getBounds();
  const m = page.getTransform(); // page -> MuPDF space; we need the inverse for user units
  const inv = mupdf.Matrix.invert(m);
  let cs = "q\n";
  if (cover) {
    // on a scan the old words are part of the picture: paint them over with the paper's colour first
    const tp = (x, y) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]];
    const a = tp(cover.rect[0], cover.rect[1]), b = tp(cover.rect[2], cover.rect[3]);
    const [cr, cg, cb] = cover.color || [1, 1, 1];
    cs += `${cr.toFixed(3)} ${cg.toFixed(3)} ${cb.toFixed(3)} rg ${Math.min(a[0], b[0]).toFixed(2)} ${Math.min(a[1], b[1]).toFixed(2)} ${Math.abs(b[0] - a[0]).toFixed(2)} ${Math.abs(b[1] - a[1]).toFixed(2)} re f\n`;
  }
  for (const it of items) {
    const fam = BASE14[it.family] ? it.family : "sans";
    const base = BASE14[fam][(it.bold ? 1 : 0) + (it.italic ? 2 : 0)];
    const fname = "BLW" + base.replace(/[^A-Za-z]/g, "");
    if (fonts.get(fname).isNull()) {
      const f = d.pdf.addSimpleFont(new mupdf.Font(base), "Latin");
      fonts.put(fname, f);
    }
    const [r, g, b] = it.color || [0, 0, 0];
    const px = inv[0] * it.x + inv[2] * it.y + inv[4];
    const py = inv[1] * it.x + inv[3] * it.y + inv[5];
    cs += `BT /${fname} ${it.size.toFixed(2)} Tf ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ` +
      `1 0 0 1 ${px.toFixed(2)} ${py.toFixed(2)} Tm ${pdfString(it.text)} Tj ET\n`;
  }
  cs += "Q\n";
  const stream = d.pdf.addStream(cs, {});
  let contents = pobj.get("Contents");
  if (contents.isArray()) contents.push(stream);
  else if (!contents.isNull()) { const arr = d.pdf.newArray(); arr.push(contents); arr.push(stream); pobj.put("Contents", arr); }
  else pobj.put("Contents", stream);
  void H;
}

// ---- stamps: drawn as a Stamp annotation with our own appearance (a rounded box with words), like the app
function stampAppearance(d, a, spec) {
  const r = a.getRect();
  const w = r[2] - r[0], h = r[3] - r[1];
  const [cr, cg, cb] = spec.color || [0.8, 0.1, 0.1];
  const font = d.pdf.addSimpleFont(new mupdf.Font("Helvetica-Bold"), "Latin");
  const res = d.pdf.newDictionary();
  const fd = d.pdf.newDictionary();
  fd.put("F", font);
  res.put("Font", fd);
  const text = spec.text || "APPROVED";
  const f = new mupdf.Font("Helvetica-Bold");
  let size = Math.min(h * 0.5, 40);
  while (size > 4 && textWidth(f, text, size) > w - 12) size -= 0.5;
  const tw = textWidth(f, text, size);
  const k = Math.min(8, h / 4);
  const lw = Math.max(1.5, Math.min(3, h / 14));
  const sub = spec.sub || "";
  let cs = `q ${cr} ${cg} ${cb} RG ${lw} w\n`;
  // rounded rectangle
  const x0 = lw / 2, y0 = lw / 2, x1 = w - lw / 2, y1 = h - lw / 2;
  cs += `${x0 + k} ${y0} m ${x1 - k} ${y0} l ${x1} ${y0} ${x1} ${y0} ${x1} ${y0 + k} c ${x1} ${y1 - k} l ` +
    `${x1} ${y1} ${x1} ${y1} ${x1 - k} ${y1} c ${x0 + k} ${y1} l ${x0} ${y1} ${x0} ${y1} ${x0} ${y1 - k} c ` +
    `${x0} ${y0 + k} l ${x0} ${y0} ${x0} ${y0} ${x0 + k} ${y0} c S\n`;
  const ty = sub ? h * 0.52 : (h - size * 0.7) / 2;
  cs += `BT /F ${size.toFixed(2)} Tf ${cr} ${cg} ${cb} rg 1 0 0 1 ${((w - tw) / 2).toFixed(2)} ${ty.toFixed(2)} Tm ${pdfString(text)} Tj ET\n`;
  if (sub) {
    const ss = Math.max(5, size * 0.42);
    const sw = textWidth(f, sub, ss);
    cs += `BT /F ${ss.toFixed(2)} Tf ${cr} ${cg} ${cb} rg 1 0 0 1 ${((w - sw) / 2).toFixed(2)} ${(h * 0.2).toFixed(2)} Tm ${pdfString(sub)} Tj ET\n`;
  }
  cs += "Q\n";
  a.setAppearance(null, null, mupdf.Matrix.identity, [0, 0, w, h], res, cs);
}

// a sticky note: a yellow paper with the words wrapped inside it (its own look, kept by any PDF program)
function wrapLines(font, text, size, width) {
  const out = [];
  for (const para of String(text || "").split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const t = line ? line + " " + word : word;
      if (line && textWidth(font, t, size) > width) { out.push(line); line = word; }
      else line = t;
    }
    out.push(line);
  }
  return out;
}

// the font of a text mark: sans / serif / mono, bold, italic (the PDF's 14 standard fonts, readable by any program)
function baseFont(st = {}) {
  const fam = { sans: ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"],
    serif: ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"],
    mono: ["Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"] }[st.font || "sans"] || ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"];
  return fam[(st.bold ? 1 : 0) + (st.italic ? 2 : 0)];
}
// the lines of a text, each placed left, centre or right in a box of width w
function placedLines(f, lines, size, lead, w, pad, top, align) {
  let cs = "";
  lines.forEach((l, i) => {
    const lw = textWidth(f, l, size);
    const x = align === "center" ? (w - lw) / 2 : align === "right" ? w - pad - lw : pad;
    cs += `1 0 0 1 ${Math.max(0, x).toFixed(2)} ${(top - i * lead).toFixed(2)} Tm ${pdfString(l)} Tj `;
  });
  return cs;
}
function customText(st) { return !!st && (st.bold || st.italic || (st.font && st.font !== "sans") || (st.align && st.align !== "left")); }

function stickyAppearance(d, a) {
  // a sticky note like the app's: coloured paper with a soft shadow, a darker strip at the top, a piece of tape
  // and the bottom corner folded
  let r = a.getRect();
  const st = styleOf(a) || {};
  let da = {};
  try { da = a.getDefaultAppearance() || {}; } catch (e) {}
  const size = da.size && da.size !== 12 ? da.size : 12, lead = size * 1.25, pad = 10, sh = 3;
  const ink = da.color && da.color.length === 3 && da.color.some(v => v > 0.01) ? da.color : [0.16, 0.14, 0.3];
  let paper = [1, 0.93, 0.55];
  try { const c = a.getColor(); if (c && c.length === 3) paper = c; } catch (e) {}
  const dark = paper.map(v => Math.max(0, v * 0.84));
  const f = new mupdf.Font(baseFont(st));
  const w = r[2] - r[0];
  const lines = wrapLines(f, a.getContents(), size, w - pad * 2 - sh);
  const need = pad * 2 + 8 + sh + lines.length * lead;
  if (r[3] - r[1] < need) { r = [r[0], r[1], r[2], r[1] + need]; a.setRect(r); }
  const h = r[3] - r[1];
  const font = d.pdf.addSimpleFont(new mupdf.Font(baseFont(st)), "Latin");
  const res = d.pdf.newDictionary();
  const fd = d.pdf.newDictionary();
  fd.put("F", font);
  res.put("Font", fd);
  const gs = d.pdf.newDictionary();
  const g1 = d.pdf.newDictionary(); g1.put("ca", 0.16); gs.put("S", g1);
  const g2 = d.pdf.newDictionary(); g2.put("ca", 0.55); gs.put("T", g2);
  res.put("ExtGState", gs);
  const pw = w - sh, fold = Math.min(14, pw / 6, h / 5);
  const n = (v) => v.toFixed(2);
  let cs = "q /S gs 0 0 0 rg " + sh + " 0 " + n(pw) + " " + n(h - sh) + " re f Q\n";
  cs += "q " + paper.map(n).join(" ") + " rg 0 " + sh + " m " + n(pw - fold) + " " + sh + " l " + n(pw) + " " + n(sh + fold) + " l " + n(pw) + " " + n(h) + " l 0 " + n(h) + " l h f ";
  cs += dark.map(n).join(" ") + " rg 0 " + n(h - 6) + " " + n(pw) + " 6 re f ";
  cs += n(pw - fold) + " " + sh + " m " + n(pw - fold) + " " + n(sh + fold) + " l " + n(pw) + " " + n(sh + fold) + " l h f Q\n";
  cs += "q /T gs 1 1 1 rg " + n(pw / 2 - 17) + " " + n(h - 9) + " 34 9 re f Q\n";
  cs += "BT /F " + size + " Tf " + ink.map(n).join(" ") + " rg " + placedLines(f, lines, size, lead, pw, pad, h - pad - 8 - size, st.align);
  cs += "ET\n";
  a.setAppearance(null, null, mupdf.Matrix.identity, [0, 0, w, h], res, cs);
}

// plain words on the page: the box grows to fit all the lines (after a new size or new words); new words: as wide
// as their longest line, as when they were written
function fitPlain(a, words) {
  let r = a.getRect();
  const size = a.getDefaultAppearance().size || 12;
  if (words) {
    const f = new mupdf.Font("Helvetica");
    const w = Math.max(...String(a.getContents() || "").split("\n").map(l => textWidth(f, l, size))) + 10;
    r = [r[0], r[1], r[0] + Math.max(20, w), r[3]];
    a.setRect(r);
  }
  const lines = wrapLines(new mupdf.Font("Helvetica"), a.getContents(), size, Math.max(10, r[2] - r[0] - 4));
  const need = lines.length * size * 1.25 + 6;
  if (r[3] - r[1] < need - 0.5) a.setRect([r[0], r[1], r[2], r[1] + need]);
}

// a text box with a style (outline, label, solid colour, dashed, marker): its own look, kept by any PDF program
const BOX_STYLES = {
  plain: {},
  outline: { line: true },
  label: { fillSoft: true, line: true, round: true },
  solid: { fillStrong: true, round: true, white: true },
  dashed: { line: true, dash: true },
  marker: { marker: true },
};
function styleOf(a) {
  try { const v = a.getObject().get("BLStyle"); if (!v.isNull()) return JSON.parse(v.asString()); } catch (e) {}
  return null;
}
function boxAppearance(d, a, st) {
  let r = a.getRect();
  const da = a.getDefaultAppearance();
  const size = da.size || 12, lead = size * 1.25, pad = !st.style || st.style === "plain" ? 2 : 6;
  const f = new mupdf.Font(baseFont(st));
  const w = r[2] - r[0];
  const lines = wrapLines(f, a.getContents(), size, w - pad * 2);
  const need = pad * 2 + lines.length * lead;
  if (r[3] - r[1] < need - 0.5) { r = [r[0], r[1], r[2], r[1] + need]; a.setRect(r); }
  const h = r[3] - r[1];
  const font = d.pdf.addSimpleFont(new mupdf.Font(baseFont(st)), "Latin");
  const res = d.pdf.newDictionary();
  const fd = d.pdf.newDictionary();
  fd.put("F", font);
  res.put("Font", fd);
  const S = BOX_STYLES[st.style] || {};
  const c = st.color || da.color || [0.12, 0.11, 0.17];
  const line = st.line || c;
  let fill = st.fill || null;
  if (!fill && S.fillSoft) fill = c.map(v => 1 - (1 - v) * 0.14);
  if (!fill && S.fillStrong) fill = c;
  if (!fill && S.marker) fill = [1, 0.9, 0.35];
  const txt = S.white ? [1, 1, 1] : c;
  const rr = (st.round ?? S.round) ? Math.min(8, h / 3) : 0;
  const box = (x0, y0, x1, y1, k) => k ? `${x0 + k} ${y0} m ${x1 - k} ${y0} l ${x1} ${y0} ${x1} ${y0} ${x1} ${y0 + k} c ${x1} ${y1 - k} l ` +
    `${x1} ${y1} ${x1} ${y1} ${x1 - k} ${y1} c ${x0 + k} ${y1} l ${x0} ${y1} ${x0} ${y1} ${x0} ${y1 - k} c ${x0} ${y0 + k} l ${x0} ${y0} ${x0} ${y0} ${x0 + k} ${y0} c h `
    : `${x0} ${y0} ${x1 - x0} ${y1 - y0} re `;
  let cs = "q ";
  if (st.opacity != null && st.opacity < 1) {
    const gs = d.pdf.newDictionary(); const g = d.pdf.newDictionary();
    g.put("ca", st.opacity); g.put("CA", Math.max(st.opacity, 0.6)); gs.put("G", g); res.put("ExtGState", gs);
    cs += "/G gs ";
  }
  const lw = st.width || 1.2;
  if (fill) cs += `${fill.join(" ")} rg ${box(0.6, 0.6, w - 0.6, h - 0.6, rr)}f `;
  if (st.line || S.line) cs += `${line.join(" ")} RG ${lw} w ${S.dash || st.dash ? "[4 3] 0 d " : ""}${box(lw / 2, lw / 2, w - lw / 2, h - lw / 2, rr)}S `;
  cs += "Q\n";
  cs += `BT /F ${size} Tf ${txt.join(" ")} rg ` + placedLines(f, lines, size, lead, w, pad, h - pad - size * 0.85, st.align);
  cs += "ET\n";
  a.setAppearance(null, null, mupdf.Matrix.identity, [0, 0, w, h], res, cs);
}

// copy the pages of src into dst at a place; a written page keeps its words as written (BLSource)
function graftWithSource(dst, src, at) {
  const map = dst.newGraftMap();
  const n = src.countPages();
  for (let i = 0; i < n; i++) {
    map.graftPage(at + i, src, i);
    const so = src.loadPage(i).getObject();
    const html = so.get("BLSource");
    if (!html.isNull()) {
      const po = dst.loadPage(at + i).getObject();
      po.put("BLSource", dst.newString(html.asString()));
      po.put("BLSourceN", so.get("BLSourceN").isNull() ? 1 : so.get("BLSourceN").asNumber());
    }
  }
}

function tagPages(d, at, n, tag) {
  for (let i = 0; i < n; i++) {
    const po = d.pdf.loadPage(at + i).getObject();
    po.put("BLFrom", d.pdf.newString(JSON.stringify(tag)));
    po.put("BLFromI", i);
    po.put("BLFromN", n);
  }
}

// the lines of a page of paper (PDF drawing commands): lined like a notebook, squared (5 mm) or dotted
function paperPattern(kind, w, h) {
  const f = (x) => (Math.round(x * 100) / 100).toString();
  let s = "";
  if (kind === "lined") {
    s += "0.70 0.80 0.93 RG 0.5 w\n";
    for (let y = h - 96; y > 48; y -= 24) s += `48 ${f(y)} m ${f(w - 48)} ${f(y)} l S\n`;
    s += "0.93 0.62 0.62 RG 0.6 w\n" + `84 36 m 84 ${f(h - 36)} l S\n`;
  } else if (kind === "squared") {
    const st = 14.173, x0 = 28, y0 = 28, x1 = w - 28, y1 = h - 28;
    s += "0.86 0.89 0.93 RG 0.3 w\n";
    for (let x = x0; x <= x1 + 0.1; x += st) s += `${f(x)} ${f(y0)} m ${f(x)} ${f(y1)} l S\n`;
    for (let y = y0; y <= y1 + 0.1; y += st) s += `${f(x0)} ${f(y)} m ${f(x1)} ${f(y)} l S\n`;
  } else if (kind === "dotted") {
    const st = 14.173;
    s += "0.62 0.66 0.74 RG 1.3 w 1 J\n";
    for (let x = 28; x <= w - 28; x += st) for (let y = 28; y <= h - 28; y += st) s += `${f(x)} ${f(y)} m ${f(x)} ${f(y)} l S\n`;
  }
  return s;
}


// ---- the parts of a document (sections)
function secNorm(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
const SEC_NUM = /^\s*((?:\d+|[ivxlc]+|[A-Z])(?:[.\-]\d+)*)[.)]?\s+\S/i;
function secLevelFromNumber(t) { const m = SEC_NUM.exec(t || ""); return m && /\d/.test(m[1]) ? Math.min(4, m[1].split(/[.\-]/).length) : null; }
// a page's text as visual rows (left to right), from the structured text: [{y, h, parts:[{x, x1, text, size, bold}]}]
function pageRows(d, pi) {
  const js = stextOf(d.doc.loadPage(pi));
  const items = [];
  for (const b of js.blocks) {
    if (b.type !== "text") continue;
    b.lines.forEach((l, li) => { if ((l.text || "").trim()) items.push({ x: l.bbox.x, x1: l.bbox.x + l.bbox.w, y: l.bbox.y, h: l.bbox.h, text: l.text.trim(), size: l.font?.size || 10, bold: l.font?.weight === "bold" || /bold|black|heavy/i.test(l.font?.name || ""), first: li === 0, nl: b.lines.length }); });
  }
  items.sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2) || a.x - b.x);
  const rows = [];
  for (const it of items) {
    const yc = it.y + it.h / 2, last = rows[rows.length - 1];
    if (last && Math.abs(yc - last.yc) <= Math.max(2, it.h * 0.45)) last.parts.push(it);
    else rows.push({ yc, y: it.y, h: it.h, parts: [it] });
  }
  for (const r of rows) r.parts.sort((a, b) => a.x - b.x);
  return rows;
}
function tocRow(r, pageW, nPages) {
  const last = r.parts[r.parts.length - 1];
  const m = /^(.*?)[\s.·…_]*?(\d{1,4})$/.exec(last.text);
  if (!m) return null;
  const num = Number(m[2]);
  if (num < 1 || num > nPages * 2 + 60 || (num >= 1900 && num <= 2100 && nPages < 1900)) return null;
  let title = [...r.parts.slice(0, -1).map(p => p.text), m[1]].join(" ").replace(/[.·…_]{2,}/g, " ").replace(/\s+/g, " ").trim();
  const leader = /[.·…_]{3,}/.test(r.parts.map(p => p.text).join(" "));
  if ((title.match(/\p{L}/gu) || []).length < 2 || title.length > 160) return null;
  const gap = r.parts.length > 1 ? last.x - r.parts[r.parts.length - 2].x1 : 0;
  if (!(leader || gap > 14 || last.x1 > pageW * 0.62)) return null;
  return { t: title, num, x: r.parts[0].x };
}
function printedToc(d, n) {
  const pages = [];
  for (let i = 0; i < Math.min(n, 40); i++) pages.push(i);
  if (n > 60) for (let i = Math.max(40, n - 15); i < n; i++) pages.push(i);
  const found = [];
  let run = [];
  for (const pi of pages) {
    let rows = [], pw = 595;
    try { rows = pageRows(d, pi); pw = d.doc.loadPage(pi).getBounds()[2]; } catch (e) {}
    const good = rows.map(r => tocRow(r, pw, n)).filter(Boolean);
    if (good.length >= 4 && good.length >= 0.3 * Math.max(1, rows.length)) {
      const nums = good.map(g => g.num);
      let up = 0; for (let i = 1; i < nums.length; i++) if (nums[i] >= nums[i - 1]) up++;
      if (up >= 0.75 * (nums.length - 1)) { const minx = Math.min(...good.map(g => g.x)); run.push({ pi, es: good.map(g => ({ ...g, x: g.x - minx })) }); continue; }
    }
    if (run.length) { found.push(run); run = []; }
  }
  if (run.length) found.push(run);
  if (!found.length) return null;
  const best = found.sort((a, b) => b.reduce((s, p) => s + p.es.length, 0) - a.reduce((s, p) => s + p.es.length, 0))[0];
  const tocEnd = best[best.length - 1].pi;
  const raw = best.flatMap(p => p.es);
  if (raw.length < 3) return null;
  const steps = [...new Set(raw.map(e => Math.round(e.x / 6)))].sort((a, b) => a - b);
  const items = raw.map(e => ({ t: e.t, num: e.num, lvl: secLevelFromNumber(e.t) || Math.min(3, steps.indexOf(Math.round(e.x / 6)) + 1), key: secNorm(e.t).slice(0, 40) }));
  // which page of the file is printed page 12: find where the first titles really are
  const textCache = new Map();
  const text = (pi) => { if (!textCache.has(pi)) { let t = ""; try { t = secNorm(pageRows(d, pi).map(r => r.parts.map(p => p.text).join(" ")).join(" ")); } catch (e) {} textCache.set(pi, t); } return textCache.get(pi); };
  const offs = new Map();
  for (const e of items.filter(x => x.key.length >= 5).slice(0, 5)) {
    for (let pi = tocEnd + 1; pi < Math.min(n, tocEnd + 141); pi++) {
      if (text(pi).includes(e.key)) { const o = pi - (e.num - 1); offs.set(o, (offs.get(o) || 0) + 1); break; }
    }
  }
  let offset = 0;
  if (offs.size) offset = [...offs.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return items.map(e => ({ lvl: e.lvl, t: e.t, page: Math.max(0, Math.min(n - 1, e.num - 1 + offset)) })).slice(0, 600);
}
function headingSections(d, n) {
  if (n > 600) return null;
  const sizes = new Map(), lines = [];
  for (let pi = 0; pi < n; pi++) {
    let page, H = 842, js;
    try { page = d.doc.loadPage(pi); H = page.getBounds()[3] || 842; js = stextOf(page); } catch (e) { continue; }
    for (const b of js.blocks) {
      if (b.type !== "text") continue;
      b.lines.forEach((l, li) => {
        const t = (l.text || "").trim();
        if (!t) return;
        const size = l.font?.size || 10;
        const k = Math.round(size);
        sizes.set(k, (sizes.get(k) || 0) + t.length);
        const bold = l.font?.weight === "bold" || /bold|black|heavy/i.test(l.font?.name || "");
        lines.push({ pi, yr: l.bbox.y / H, t, size, bold, first: li === 0, nl: b.lines.length });
      });
    }
  }
  if (!sizes.size) return null;
  const body = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const cands = [];
  for (const l of lines) {
    const t = l.t;
    if (t.length < 3 || t.length > 90 || (t.match(/\p{L}/gu) || []).length < 3 || !(l.yr > 0.035 && l.yr < 0.94)) continue;
    if (l.size >= body * 1.25 || (l.bold && l.size >= body * 1.02 && l.first && l.nl <= 3 && t.length <= 70 && !/[.,;:]$/.test(t))) {
      const c = cands[cands.length - 1];
      if (c && c.pi === l.pi && Math.abs(c.size - l.size) < 0.6 && l.yr - c.y2 > 0 && l.yr - c.y2 < 0.045 && c.t.length + t.length < 110) { c.t += " " + t; c.y2 = l.yr; continue; }
      cands.push({ pi: l.pi, yr: l.yr, t, size: l.size, y2: l.yr });
    }
  }
  const many = new Map();
  for (const c of cands) { const k = secNorm(c.t); many.set(k, (many.get(k) || 0) + 1); }
  const keep = cands.filter(c => { const k = secNorm(c.t); return k && many.get(k) <= Math.max(2, n * 0.12); });
  if (keep.length < 2) return null;
  const big = [...new Set(keep.filter(c => c.size >= body * 1.25).map(c => Math.round(c.size * 2) / 2))].sort((a, b) => b - a);
  let out = keep.map(c => { const r = Math.round(c.size * 2) / 2; return { lvl: Math.min(4, secLevelFromNumber(c.t) || (big.includes(r) ? big.indexOf(r) + 1 : big.length + 1)), t: c.t, page: c.pi }; });
  const lv = [...new Set(out.map(o => o.lvl))].sort((a, b) => a - b);
  out = out.map(o => ({ ...o, lvl: lv.indexOf(o.lvl) + 1 }));
  while (out.length > Math.max(40, n * 2) && Math.max(...out.map(o => o.lvl)) > 1) { const top = Math.max(...out.map(o => o.lvl)); out = out.filter(o => o.lvl < top); }
  return out.length >= 2 ? out.slice(0, 400) : null;
}

function imageFromBytes(bytes) {
  return new mupdf.Image(bytes);
}

function newAnnot(d, pageIndex, spec) {
  const page = loadPDFPage(d, pageIndex);
  const a = page.createAnnotation(spec.type);
  if (spec.author) try { a.setAuthor(spec.author); } catch (e) {}
  if (spec.subject) try { a.setSubject(spec.subject); } catch (e) {}
  switch (spec.type) {
    case "Highlight": case "Underline": case "StrikeOut": case "Squiggly":
      a.setQuadPoints(spec.quads);
      a.setColor(spec.color);
      if (spec.opacity != null) a.setOpacity(spec.opacity);
      break;
    case "Ink":
      a.setInkList(spec.ink);
      a.setColor(spec.color);
      a.setBorderWidth(spec.width || 2);
      if (spec.opacity != null) a.setOpacity(spec.opacity);
      break;
    case "FreeText":
      a.setRect(spec.rect);
      a.setContents(spec.text || "");
      a.setDefaultAppearance(spec.font || "Helv", spec.size || 12, spec.color || [0, 0, 0]);
      if (spec.fill) try { a.setColor(spec.fill); } catch (e) {}   // a FreeText's C is its background
      try { a.setBorderWidth(0); } catch (e) {}
      break;
    case "Text":
      a.setRect(spec.rect);
      a.setContents(spec.text || "");
      a.setColor(spec.color || [1, 0.85, 0.2]);
      try { a.setIcon(spec.icon || "Comment"); } catch (e) {}
      break;
    case "Square": case "Circle":
      a.setRect(spec.rect);
      a.setColor(spec.color);
      a.setBorderWidth(spec.width || 2);
      if (spec.fill) a.setInteriorColor(spec.fill);
      break;
    case "Line":
      a.setLine(spec.a, spec.b);
      a.setColor(spec.color);
      a.setBorderWidth(spec.width || 2);
      if (spec.arrow) a.setLineEndingStyles("None", "OpenArrow");
      break;
    case "Stamp":
      a.setRect(spec.rect);
      if (spec.image) {
        a.setStampImage(imageFromBytes(spec.image));
      } else {
        a.setContents(spec.text || "");
        // the stamp's name is its words, so other programs that draw it again write the same words
        try { a.setIcon((spec.text || "Approved").replace(/[^A-Za-z]/g, "").slice(0, 30) || "Approved"); } catch (e) {}
      }
      break;
    default:
      if (spec.rect) a.setRect(spec.rect);
  }
  if (spec.contents != null && spec.type !== "FreeText" && spec.type !== "Text") a.setContents(spec.contents);
  a.setModificationDate(new Date());
  a.update();
  if (spec.type === "Stamp" && !spec.image) stampAppearance(d, a, spec);
  if (spec.type === "FreeText" && spec.subject === "Sticky note") stickyAppearance(d, a);
  if (spec.type === "FreeText" && spec.style && spec.style.style !== "plain") {
    a.getObject().put("BLStyle", d.pdf.newString(JSON.stringify(spec.style)));
    try { a.setSubject("Text box"); } catch (e) {}
    boxAppearance(d, a, spec.style);
  }
  page.update();
  return page.getAnnotations().length - 1;
}

// move a mark by writing its /Rect straight into the PDF (in the PDF's own units), so MuPDF does not draw
// a new look for it (a stamp, a signature or a picture keeps exactly its appearance)
function moveRaw(page, a, dx, dy) {
  const r = a.getRect();
  const inv = mupdf.Matrix.invert(page.getTransform());
  const tp = (x, y) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]];
  const p1 = tp(r[0] + dx, r[1] + dy), p2 = tp(r[2] + dx, r[3] + dy);
  a.getObject().put("Rect", [Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]), Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1])]);
}

function annotAt(d, pageIndex, i) {
  const page = loadPDFPage(d, pageIndex);
  const list = page.getAnnotations();
  if (i < 0 || i >= list.length) throw new Error(_t("That mark is not there any more"));
  return { page, a: list[i] };
}

function op(d, label, fn) {
  if (!d.pdf) return fn();
  d.pdf.beginOperation(label);
  try {
    const v = fn();
    d.pdf.endOperation();
    d.dirty = true;
    return v;
  } catch (e) {
    try { d.pdf.abandonOperation(); } catch (e2) {}
    throw e;
  }
}

function render(d, pageIndex, scale, annots = true) {
  const page = d.doc.loadPage(pageIndex);
  const m = mupdf.Matrix.scale(scale, scale);
  let pix;
  if (d.pdf && !annots) pix = page.toPixmap(m, mupdf.ColorSpace.DeviceRGB, true, false);
  else pix = page.toPixmap(m, mupdf.ColorSpace.DeviceRGB, true, true);
  const w = pix.getWidth(), h = pix.getHeight();
  const px = new Uint8ClampedArray(pix.getPixels());
  pix.destroy?.();
  return { w, h, px };
}

// ---- turning, sizing: the look's own matrix is turned and the box round it grows to fit; BLRot keeps the angle
// and the size before turning (so the words of a turned text box can still be changed, and it is turned again)
const BOXY = new Set(["FreeText", "Square", "Circle", "Stamp"]);
const GEO = new Set(["moveBy", "rotateBy", "resize", "stamp"]);
function nums(o) { const out = []; for (let i = 0; i < o.length; i++) out.push(o.get(i).asNumber()); return out; }
function rotOf(a) {
  try { const v = a.getObject().get("BLRot"); if (!v.isNull()) return JSON.parse(v.asString()); } catch (e) {}
  return null;
}
function apN(a) {
  const ap = a.getObject().get("AP");
  if (!ap || ap.isNull()) return null;
  const n = ap.get("N");
  return !n || n.isNull() || !n.isStream() ? null : n;
}
function rawDate(d, a) {
  const t = new Date(), z = (n) => String(n).padStart(2, "0");
  try { a.getObject().put("M", d.pdf.newString(`D:${t.getUTCFullYear()}${z(t.getUTCMonth() + 1)}${z(t.getUTCDate())}${z(t.getUTCHours())}${z(t.getUTCMinutes())}${z(t.getUTCSeconds())}Z`)); } catch (e) {}
}
function writeRect(page, a, r) {
  const inv = mupdf.Matrix.invert(page.getTransform());
  const tp = (x, y) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]];
  const p1 = tp(r[0], r[1]), p2 = tp(r[2], r[3]);
  a.getObject().put("Rect", [Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]), Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1])]);
}
function unturnedRect(page, cx, cy, w, h) {
  // w, h are in the PDF's own units: on a page turned a quarter they are the other way round on the screen
  const m = page.getTransform();
  const q = Math.abs(m[1]) > Math.abs(m[0]);
  const W = q ? h : w, H = q ? w : h;
  return [cx - W / 2, cy - H / 2, cx + W / 2, cy + H / 2];
}
function rotateTo(d, a, deg, fresh, centre) {
  const obj = a.getObject();
  const ap = apN(a);
  if (!ap) return;
  const bbox = nums(ap.get("BBox"));
  const mo = ap.get("Matrix");
  const Mc = !mo || mo.isNull() ? [1, 0, 0, 1, 0, 0] : nums(mo);
  const R = nums(obj.get("Rect"));
  let st = fresh ? null : rotOf(a);
  if (!st || !st.m) {
    const tb = mupdf.Rect.transform(bbox, Mc);
    const kx = (R[2] - R[0]) / ((tb[2] - tb[0]) || 1), ky = (R[3] - R[1]) / ((tb[3] - tb[1]) || 1);
    st = { m: mupdf.Matrix.concat(Mc, mupdf.Matrix.scale(kx, ky)), w: R[2] - R[0], h: R[3] - R[1] };
  }
  deg = ((((deg + 180) % 360) + 360) % 360) - 180;
  const tb = mupdf.Rect.transform(bbox, st.m);
  const cx = (tb[0] + tb[2]) / 2, cy = (tb[1] + tb[3]) / 2;
  const M = mupdf.Matrix.concat(mupdf.Matrix.concat(mupdf.Matrix.concat(st.m, mupdf.Matrix.translate(-cx, -cy)), mupdf.Matrix.rotate(-deg)), mupdf.Matrix.translate(cx, cy));
  const nb = mupdf.Rect.transform(bbox, M);
  const rx = centre ? centre[0] : (R[0] + R[2]) / 2, ry = centre ? centre[1] : (R[1] + R[3]) / 2;
  const W = nb[2] - nb[0], H = nb[3] - nb[1];
  ap.put("Matrix", M);
  obj.put("Rect", [rx - W / 2, ry - H / 2, rx + W / 2, ry + H / 2]);
  obj.put("BLRot", d.pdf.newString(JSON.stringify({ deg: Math.round(deg * 10) / 10, m: st.m, w: st.w, h: st.h })));
}
const SKIP_COPY = new Set(["P", "Popup", "NM", "IRT", "Subtype", "Type", "Parent"]);
function deepCopy(d, v) {
  if (v.isIndirect()) {
    const r = v.resolve();
    if (r.isStream()) {
      const dict = d.pdf.newDictionary();
      r.forEach((x, k) => { if (k !== "Length") dict.put(k, deepCopy(d, x)); });
      return d.pdf.addRawStream(v.readRawStream(), dict);
    }
    if (r.isDictionary() && r.get("Type").isName && !r.get("Type").isNull() && r.get("Type").asName() === "Page") return v;
    return deepCopy(d, r);
  }
  if (v.isArray()) { const arr = d.pdf.newArray(); for (let i = 0; i < v.length; i++) arr.push(deepCopy(d, v.get(i))); return arr; }
  if (v.isDictionary()) { const dict = d.pdf.newDictionary(); v.forEach((x, k) => dict.put(k, deepCopy(d, x))); return dict; }
  return v;
}

const api = {
  ping() { return "ok"; },

  open(key, bytes, mime, name) {
    if (docs.has(key)) api.close(key);
    let doc;
    const magic = mime || name || "application/pdf";
    doc = mupdf.Document.openDocument(new Uint8Array(bytes), magic);
    if (doc.needsPassword()) return { password: true };
    const pdf = doc.asPDF ? doc.asPDF() : null;
    if (pdf) try { pdf.enableJournal(); } catch (e) {}
    if (!pdf && doc.isReflowable) try { doc.layout(595, 842, 11); } catch (e) {}
    const d = { doc, pdf, mime, name, dirty: false };
    docs.set(key, d);
    let outline = [];
    try { outline = flatOutline(doc.loadOutline()); } catch (e) {}
    // a form to fill in (text boxes, ticks, choices)?
    let form = false;
    try { const f = pdf && pdf.getTrailer().get("Root").get("AcroForm").get("Fields"); form = !!(f && f.isArray() && f.length > 0); } catch (e) {}
    return { pages: pageSizes(doc), isPDF: !!pdf, outline, canUndo: false, form };
  },

  // the fields of a form on a page
  formFields(key, page) {
    const d = get(key);
    if (!d.pdf) return [];
    const p = loadPDFPage(d, page);
    return p.getWidgets().map((w, i) => {
      const t = w.getFieldType();
      let options = null;
      if (t === "combobox" || t === "listbox") try { options = w.getOptions(); } catch (e) { options = []; }
      let on = false;
      if (t === "checkbox" || t === "radiobutton") { const v = w.getValue(); on = !!v && v !== "Off"; }
      return { i, type: t, name: w.getName(), value: w.getValue(), on, rect: w.getRect(), ro: w.isReadOnly(),
        multi: t === "text" && w.isMultiline(), options, max: t === "text" ? w.getMaxLen() : 0 };
    });
  },

  setField(key, page, i, value) {
    const d = get(key);
    return op(d, "Fill in the form", () => {
      const w = loadPDFPage(d, page).getWidgets()[i];
      if (!w) return false;
      const t = w.getFieldType();
      if (t === "text") w.setTextValue(String(value ?? ""));
      else if (t === "combobox" || t === "listbox") w.setChoiceValue(String(value ?? ""));
      else if (t === "checkbox" || t === "radiobutton") { const v = w.getValue(); const on = !!v && v !== "Off"; if (!!value !== on) w.toggle(); }
      try { w.update(); } catch (e) {}
      return true;
    });
  },

  close(key) {
    const d = docs.get(key);
    if (!d) return;
    try { d.doc.destroy?.(); } catch (e) {}
    docs.delete(key);
  },

  closeAll() { for (const k of [...docs.keys()]) api.close(k); },

  info(key) {
    const d = get(key);
    return { pages: pageSizes(d.doc), isPDF: !!d.pdf, dirty: d.dirty, canUndo: d.pdf?.canUndo() || false,
      canRedo: d.pdf?.canRedo() || false };
  },

  render(key, page, scale, annots) {
    const r = render(get(key), page, scale, annots);
    return { __transfer: [r.px.buffer], value: r };
  },

  text(key, page) {
    const d = get(key);
    const p = d.doc.loadPage(page);
    return stextOf(p);
  },

  plainText(key) {
    // every page's text (for Find and Reports)
    const d = get(key);
    const out = [];
    const n = d.doc.countPages();
    for (let i = 0; i < n; i++) {
      const p = d.doc.loadPage(i);
      out.push(p.toStructuredText("preserve-whitespace").asText());
    }
    return out;
  },

  linesOf(key) {
    // lines with positions, for tables and reports: per page [{y, x, w, h, text, size, bold}]
    const d = get(key);
    const out = [];
    const n = d.doc.countPages();
    for (let i = 0; i < n; i++) {
      const p = d.doc.loadPage(i);
      const js = stextOf(p);
      const lines = [];
      for (const b of js.blocks) {
        if (b.type !== "text") continue;
        for (const l of b.lines) {
          lines.push({ x: l.bbox.x, y: l.bbox.y, w: l.bbox.w, h: l.bbox.h, text: l.text,
            size: l.font?.size || 10, bold: l.font?.weight === "bold" });
        }
      }
      out.push(lines);
    }
    return out;
  },

  // the parts of a document, as the Windows app finds them: 1) its bookmarks; 2) else a printed contents page
  // ("Title ..... 12", page numbers going up, and where printed page 12 really is); 3) else its headings (lines clearly
  // bigger than the text, or short bold lines starting a paragraph; running heads left out)
  sections(key) {
    const d = get(key);
    const n = d.doc.countPages();
    let ol = [];
    try { ol = flatOutline(d.doc.loadOutline()); } catch (e) {}
    ol = ol.filter(o => o.title.trim() && o.page >= 0 && o.page < n);
    if (ol.length >= 2 || (ol.length === 1 && n >= 20)) return { src: "bookmarks", items: ol.slice(0, 600).map(o => ({ lvl: o.depth + 1, t: o.title.trim(), page: o.page })) };
    if (d.pdf && n >= 6) { try { const it = printedToc(d, n); if (it) return { src: "contents", items: it }; } catch (e) {} }
    try { const h = headingSections(d, n); if (h) return { src: "headings", items: h }; } catch (e) {}
    return { src: null, items: [] };
  },

  // the lines of one page, with where they are (read aloud lights them)
  pageLines(key, page) {
    const d = get(key);
    const js = stextOf(d.doc.loadPage(page));
    const lines = [];
    for (const b of js.blocks) {
      if (b.type !== "text") continue;
      for (const l of b.lines) lines.push({ x: l.bbox.x, y: l.bbox.y, w: l.bbox.w, h: l.bbox.h, text: l.text,
        size: l.font?.size || 10, bold: l.font?.weight === "bold", italic: l.font?.style === "italic", block: js.blocks.indexOf(b) });
    }
    return lines;
  },

  // every word with where it is, page by page (for tables: the columns are found from the gaps between words)
  words(key) {
    const d = get(key);
    const out = [];
    const n = d.doc.countPages();
    for (let i = 0; i < n; i++) {
      const st = stCache(d, i);
      const words = [];
      let cur = null;
      const flush = () => { if (cur && cur.t.trim()) words.push(cur); cur = null; };
      st.walk({
        beginLine() { flush(); },
        endLine() { flush(); },
        onChar(c, origin, font, size, q) {
          if (c === " " || c === "\t" || c === "\u00a0") { flush(); return; }
          const x0 = Math.min(q[0], q[4]), x1 = Math.max(q[2], q[6]), y0 = Math.min(q[1], q[3]), y1 = Math.max(q[5], q[7]);
          if (cur && x0 - cur.x1 > size * 0.25) flush();
          if (!cur) cur = { x0, y0, x1, y1, t: "", s: size, b: font.isBold() ? 1 : 0 };
          cur.t += c;
          cur.x1 = Math.max(cur.x1, x1); cur.y0 = Math.min(cur.y0, y0); cur.y1 = Math.max(cur.y1, y1);
        },
      });
      flush();
      out.push(words.map(w => [Math.round(w.x0 * 10) / 10, Math.round(w.y0 * 10) / 10, Math.round(w.x1 * 10) / 10, Math.round(w.y1 * 10) / 10, w.t, Math.round(w.s * 10) / 10, w.b]));
    }
    return out;
  },

  // ---- text under the pointer: selecting words, and the line to change
  select(key, page, a, b) {
    const d = get(key);
    const st = stCache(d, page);
    const quads = st.highlight(a, b, 2000);
    let text = "";
    try { text = st.copy(a, b); } catch (e) {}
    return { quads, text };
  },

  lineAt(key, page, pt) {
    const d = get(key);
    const p = d.doc.loadPage(page);
    const js = stextOf(p);
    let best = null;
    for (const b of js.blocks) {
      if (b.type !== "text") continue;
      for (const l of b.lines) {
        const r = l.bbox;
        if (pt[0] >= r.x - 2 && pt[0] <= r.x + r.w + 2 && pt[1] >= r.y - 2 && pt[1] <= r.y + r.h + 2) {
          if (!best || r.h < best.bbox.h) best = l;
        }
      }
    }
    if (!best) return null;
    // the colour of its letters
    let color = [0, 0, 0];
    try {
      const st = stCache(d, page);
      let found = false;
      st.walk({
        onChar(c, origin, font, size, quad, col) {
          if (found) return;
          if (origin[0] >= best.bbox.x - 1 && origin[1] >= best.bbox.y - 1 && origin[1] <= best.bbox.y + best.bbox.h + 1) {
            color = colorOf(col) || color; found = true;
          }
        },
      });
    } catch (e) {}
    const f = best.font || {};
    const fam = /courier|mono/i.test(f.name || "") || f.family === "monospace" ? "mono"
      : (/times|serif|roman|georgia|garamond|cambria/i.test(f.name || "") && !/sans/i.test(f.name || "")) || f.family === "serif" ? "serif" : "sans";
    return { bbox: best.bbox, text: best.text, x: best.x, y: best.y, size: f.size || 11, family: fam,
      bold: f.weight === "bold" || /bold/i.test(f.name || ""), italic: f.style === "italic" || /italic|oblique/i.test(f.name || ""),
      color };
  },

  search(key, needle) {
    const d = get(key);
    const out = [];
    const n = d.doc.countPages();
    for (let i = 0; i < n; i++) {
      const p = d.doc.loadPage(i);
      const hits = p.search(needle);
      if (hits.length) out.push({ page: i, hits });
    }
    return out;
  },

  annots(key, page) {
    const d = get(key);
    if (!d.pdf) return [];
    const p = d.pdf.loadPage(page);
    return p.getAnnotations().map(describeAnnot).filter(a => annotTypesWeShow.has(a.type) && !a.reply);
  },

  // ---- comments: a note with your name and the date; colleagues reply; Resolve ticks it
  comments(key) {
    const d = get(key);
    if (!d.pdf) return [];
    const out = [], byNum = new Map(), replies = [];
    const n = d.doc.countPages();
    for (let i = 0; i < n; i++) {
      const p = d.pdf.loadPage(i);
      for (const a of p.getAnnotations()) {
        if (a.getType() !== "Text") continue;
        const o = describeAnnot(a, 0);
        const c = { page: i, num: o.num, rect: o.rect, author: o.author, contents: o.contents, modified: o.modified || 0, done: !!o.done };
        if (o.reply) { try { const irt = a.getObject().get("IRT"); c.parent = irt.isIndirect() ? irt.asIndirect() : -1; } catch (e) { c.parent = -1; } replies.push(c); }
        else { c.replies = []; out.push(c); byNum.set(c.num, c); }
      }
    }
    for (const r of replies) { const p = byNum.get(r.parent); if (p) p.replies.push(r); }
    for (const c of out) c.replies.sort((x, y) => x.modified - y.modified);
    return out;
  },

  addComment(key, page, x, y, text, author) {
    const d = get(key);
    return op(d, "Comment", () => {
      const p = loadPDFPage(d, page);
      const a = p.createAnnotation("Text");
      a.setRect([x - 10, y - 10, x + 10, y + 10]);
      a.setContents(text);
      try { a.setIcon("Comment"); } catch (e) {}
      a.setColor(PINK);
      if (author) a.setAuthor(author);
      try { a.setSubject("Comment"); } catch (e) {}
      a.setModificationDate(new Date());
      a.update();
      return annotNum(a);
    });
  },

  replyComment(key, page, num, text, author) {
    const d = get(key);
    return op(d, "Reply", () => {
      const p = loadPDFPage(d, page);
      const parent = findByNum(p, num);
      if (!parent) throw new Error(_t("The comment is no longer there"));
      const a = p.createAnnotation("Text");
      a.setRect(parent.getRect());
      a.setContents(text);
      try { a.setIcon("Comment"); } catch (e) {}
      a.setColor(PINK);
      if (author) a.setAuthor(author);
      a.setModificationDate(new Date());
      const o = a.getObject();
      o.put("IRT", d.pdf.newIndirect(num));
      o.put("RT", d.pdf.newName("R"));
      try { a.setFlags(a.getFlags() | 2); } catch (e) {}     // hidden on the page: the comment's own pin is there
      a.update();
      return true;
    });
  },

  resolveComment(key, page, num, on) {
    const d = get(key);
    return op(d, on ? "Resolve" : "Open again", () => {
      const p = loadPDFPage(d, page);
      const a = findByNum(p, num);
      if (!a) throw new Error(_t("The comment is no longer there"));
      const o = a.getObject();
      if (on) o.put("BLDone", true); else o.delete("BLDone");
      try { a.setIcon(on ? "Check" : "Comment"); } catch (e) {}
      a.setColor(on ? DONE : PINK);
      a.update();
      return true;
    });
  },

  deleteComment(key, page, num) {
    const d = get(key);
    return op(d, "Delete a comment", () => {
      const p = loadPDFPage(d, page);
      for (const a of [...p.getAnnotations()]) {
        if (a.getType() !== "Text") continue;
        const n = annotNum(a);
        let irt = -2;
        try { const r = a.getObject().get("IRT"); if (!r.isNull()) irt = r.isIndirect() ? r.asIndirect() : -2; } catch (e) {}
        if (n === num || irt === num) p.deleteAnnotation(a);
      }
      return true;
    });
  },

  allAnnots(key) {
    const d = get(key);
    if (!d.pdf) return [];
    const out = [];
    const n = d.doc.countPages();
    for (let i = 0; i < n; i++) {
      const p = d.pdf.loadPage(i);
      const list = p.getAnnotations();
      if (!list.length) continue;
      let st = null;
      for (const [k, a] of list.entries()) {
        const o = describeAnnot(a, k);
        if (!annotTypesWeShow.has(o.type) || o.reply) continue;
        o.page = i;
        if (o.quads && o.quads.length) {
          // the words under a highlight
          try {
            st = st || p.toStructuredText("preserve-whitespace");
            const q = o.quads;
            const a0 = [q[0][0], q[0][1]], b0 = [q[q.length - 1][6], q[q.length - 1][7]];
            o.text = st.copy ? st.copy(a0, b0) : "";
          } catch (e) {}
        }
        out.push(o);
      }
    }
    return out;
  },

  addAnnot(key, page, spec) {
    const d = get(key);
    return op(d, "Add " + spec.type, () => newAnnot(d, page, spec));
  },

  updateAnnot(key, page, i, change) {
    const d = get(key);
    return op(d, "Change a mark", () => {
      const { page: p, a } = annotAt(d, page, i);
      const type = a.getType();
      let subject = "";
      try { subject = a.getSubject(); } catch (e) {}
      const rot = rotOf(a);
      const turned = rot && Math.abs(rot.deg || 0) > 0.05 ? rot : null;
      const boxy = BOXY.has(type);
      // moving or turning a box, a text or a stamp (and making a stamp bigger): written straight into the PDF,
      // so its look stays exactly as it is (MuPDF would draw a plain one again)
      const geo = Object.keys(change).every(k => GEO.has(k) && (k !== "stamp" || !change.stamp));
      if (boxy && geo && (type === "Stamp" || !change.resize)) {
        if (change.moveBy) moveRaw(p, a, change.moveBy[0], change.moveBy[1]);
        if (change.resize) {
          const b = a.getBounds(), n = change.resize;
          const s = (n[2] - n[0]) / ((b[2] - b[0]) || 1);
          writeRect(p, a, n);
          if (rot && rot.m) { rot.m = mupdf.Matrix.concat(rot.m, mupdf.Matrix.scale(s, s)); rot.w *= s; rot.h *= s; a.getObject().put("BLRot", d.pdf.newString(JSON.stringify(rot))); }
        }
        if (change.rotateBy) rotateTo(d, a, (rot?.deg || 0) + change.rotateBy, !rot);
        rawDate(d, a);
        p.update();
        return true;
      }
      // a stamp, a signature or a picture keeps its own look: take its picture before anything changes
      // (any change makes MuPDF draw a plain "Draft" stamp instead), and put it back at the end
      const isStamp = type === "Stamp";
      const look = isStamp ? a.toDisplayList() : null;
      let shift = [0, 0];
      let moveBy = change.moveBy, resize = change.resize, scaled = !!change.resize, keepAt = null;
      if (turned && boxy && !isStamp) {
        // a turned box is changed as it was before turning it, then turned again
        const b = a.getBounds();
        let cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, w = rot.w, h = rot.h;
        if (moveBy) { cx += moveBy[0]; cy += moveBy[1]; moveBy = null; }
        if (resize) {
          const s = (resize[2] - resize[0]) / ((b[2] - b[0]) || 1);
          w *= s; h *= s; cx = (resize[0] + resize[2]) / 2; cy = (resize[1] + resize[3]) / 2; resize = null;
        }
        a.setRect(unturnedRect(p, cx, cy, w, h));
        const inv = mupdf.Matrix.invert(p.getTransform());
        keepAt = [inv[0] * cx + inv[2] * cy + inv[4], inv[1] * cx + inv[3] * cy + inv[5]];   // turned again round here
      }
      a.setModificationDate(new Date());
      if (change.contents != null) a.setContents(change.contents);
      if (change.color) {
        if (type === "FreeText") {
          const da = a.getDefaultAppearance();
          a.setDefaultAppearance(da.font || "Helv", da.size || 12, change.color);
        } else a.setColor(change.color);
      }
      if (change.paper && type === "FreeText") try { a.setColor(change.paper); } catch (e) {}
      if (change.rect) a.setRect(change.rect);
      if (moveBy) {
        const [dx, dy] = moveBy;
        if (a.hasQuadPoints()) a.setQuadPoints(a.getQuadPoints().map(q => q.map((v, j) => v + (j % 2 ? dy : dx))));
        else if (a.hasInkList()) a.setInkList(a.getInkList().map(s => s.map(([x, y]) => [x + dx, y + dy])));
        else if (a.hasLine()) { const [p1, p2] = a.getLine(); a.setLine([p1[0] + dx, p1[1] + dy], [p2[0] + dx, p2[1] + dy]); }
        else if (a.hasVertices()) a.setVertices(a.getVertices().map(([x, y]) => [x + dx, y + dy]));
        else if (isStamp) {
          const r = a.getRect();
          a.setRect([r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy]);
          shift = [dx, dy];
        }
        else { const r = a.getRect(); a.setRect([r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy]); }
      }
      if (resize) {
        // bigger or smaller: a box to its new size, a drawing or a line stretched to it
        const o = a.getBounds(), n = resize;
        const sx = (n[2] - n[0]) / ((o[2] - o[0]) || 1), sy = (n[3] - n[1]) / ((o[3] - o[1]) || 1);
        const map = ([x, y]) => [n[0] + (x - o[0]) * sx, n[1] + (y - o[1]) * sy];
        if (a.hasInkList()) a.setInkList(a.getInkList().map(s => s.map(map)));
        else if (a.hasLine()) { const [p1, p2] = a.getLine(); a.setLine(map(p1), map(p2)); }
        else if (a.hasVertices()) a.setVertices(a.getVertices().map(map));
        else if (!a.hasQuadPoints()) a.setRect(n);
      }
      if (change.line && a.hasLine()) a.setLine(change.line[0], change.line[1]);
      if (change.rotateBy && !boxy) {
        // a drawing or a line turns round its middle
        const b = a.getBounds();
        const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
        const t = change.rotateBy * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
        const turn = ([x, y]) => [cx + (x - cx) * cs - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * cs];
        if (a.hasInkList()) a.setInkList(a.getInkList().map(s => s.map(turn)));
        else if (a.hasLine()) { const [p1, p2] = a.getLine(); a.setLine(turn(p1), turn(p2)); }
        else if (a.hasVertices()) a.setVertices(a.getVertices().map(turn));
      }
      if (change.fill !== undefined && (type === "Square" || type === "Circle")) {
        if (change.fill) a.setInteriorColor(change.fill); else a.setInteriorColor([]);
      }
      if (change.style && type === "FreeText") {
        const was = styleOf(a) || {};
        const st = { ...was, ...change.style };
        a.getObject().put("BLStyle", d.pdf.newString(JSON.stringify(st)));
        let subj0 = ""; try { subj0 = a.getSubject() || ""; } catch (e) {}
        if (subj0 !== "Sticky note") try { a.setSubject((!st.style || st.style === "plain") && !st.fill && !st.line ? subj0 && subj0 !== "Text box" ? subj0 : "" : "Text box"); } catch (e) {}
      }
      if (change.size && type === "FreeText") {
        const da = a.getDefaultAppearance();
        const size = Math.max(4, Math.min(200, change.size));
        a.setDefaultAppearance(da.font || "Helv", size, da.color || [0, 0, 0]);
        if (!scaled && subject !== "Sticky note") {
          // bigger letters, a bigger box
          const r = a.getRect(), q = size / (da.size || 12);
          a.setRect([r[0], r[1], r[0] + (r[2] - r[0]) * q, r[1] + (r[3] - r[1]) * q]);
        }
      }
      try { subject = a.getSubject(); } catch (e) {}
      // stamps, signatures and pictures keep their own look when they move; sticky notes are drawn again
      if (type === "Stamp") {
        a.update();
        if (change.stamp) stampAppearance(d, a, change.stamp);
        else a.setAppearanceFromDisplayList(null, null, mupdf.Matrix.translate(shift[0], shift[1]), look);
      }
      else if (type === "FreeText" && subject === "Sticky note") { a.update(); stickyAppearance(d, a); }
      else if (type === "FreeText" && styleOf(a) && ((styleOf(a).style && styleOf(a).style !== "plain") || styleOf(a).fill || styleOf(a).line || customText(styleOf(a)))) {
        a.update();
        const st = styleOf(a);
        if (change.color) st.color = change.color;
        a.getObject().put("BLStyle", d.pdf.newString(JSON.stringify(st)));
        boxAppearance(d, a, st);
      }
      else {
        if (type === "FreeText" && (change.size || change.contents != null || change.resize)) fitPlain(a, change.contents != null && !change.resize);
        a.update();
      }
      // turned before (or turned now): turn the new look
      if (boxy && !isStamp && (turned || change.rotateBy)) rotateTo(d, a, (turned?.deg || 0) + (change.rotateBy || 0), true, keepAt);
      p.update();
      return true;
    });
  },

  // a copy of a mark, a little lower and to the right (its look and all)
  copyAnnot(key, page, i) {
    const d = get(key);
    return op(d, "Copy a mark", () => {
      const { page: p, a } = annotAt(d, page, i);
      const src = a.getObject();
      const b = p.createAnnotation(a.getType());
      b.update();                               // its own first look, then everything of the mark is written over it
      const obj = b.getObject();
      src.forEach((v, k) => { if (!SKIP_COPY.has(String(k)) && k !== "AP") obj.put(k, deepCopy(d, v)); });
      // its look through MuPDF's own call (written straight in, MuPDF would draw a plain one again later)
      const N = apN(a) && src.get("AP").get("N");
      if (N) {
        const mo = N.get("Matrix");
        const res = N.get("Resources");
        b.setAppearance(null, null, !mo || mo.isNull() ? mupdf.Matrix.identity : nums(mo), nums(N.get("BBox")),
          !res || res.isNull() ? d.pdf.newDictionary() : deepCopy(d, res), N.readStream());
        obj.put("Rect", deepCopy(d, src.get("Rect")));
      }
      p.update();
      const list = p.getAnnotations();
      const n = list.length - 1;
      const c = list[n];
      if (c.hasInkList()) { c.setInkList(c.getInkList().map(s => s.map(([x, y]) => [x + 14, y + 14]))); c.update(); }
      else if (c.hasLine()) { const [p1, p2] = c.getLine(); c.setLine([p1[0] + 14, p1[1] + 14], [p2[0] + 14, p2[1] + 14]); c.update(); }
      else if (c.hasQuadPoints()) { c.setQuadPoints(c.getQuadPoints().map(q => q.map(v => v + 14))); c.update(); }
      else moveRaw(p, c, 14, 14);
      p.update();
      return n;
    });
  },

  deleteAnnot(key, page, i) {
    const d = get(key);
    return op(d, "Take off a mark", () => {
      const { page: p, a } = annotAt(d, page, i);
      p.deleteAnnotation(a);
      p.update();
      return true;
    });
  },

  deleteAllAnnots(key, page) {
    const d = get(key);
    return op(d, "Take off all marks", () => {
      const p = loadPDFPage(d, page);
      for (const a of p.getAnnotations()) if (annotTypesWeShow.has(a.getType())) p.deleteAnnotation(a);
      p.update();
      return true;
    });
  },

  undo(key) { const d = get(key); if (d.pdf?.canUndo()) { d.pdf.undo(); d.dirty = true; d.st = null; } return api.info(key); },
  redo(key) { const d = get(key); if (d.pdf?.canRedo()) { d.pdf.redo(); d.dirty = true; d.st = null; } return api.info(key); },

  save(key) {
    const d = get(key);
    if (!d.pdf) throw new Error(_t("Only PDFs can be saved"));
    let buf;
    try {
      buf = d.pdf.canBeSavedIncrementally() ? d.pdf.saveToBuffer("incremental") : d.pdf.saveToBuffer("compress");
    } catch (e) {
      buf = d.pdf.saveToBuffer("compress");
    }
    d.dirty = false;
    const u8 = buf.asUint8Array().slice();
    return { __transfer: [u8.buffer], value: u8 };
  },

  // ---- Change the text: cover the old words and write the new ones in a matching font
  replaceText(key, page, rect, items) {
    const d = get(key);
    return op(d, "Change the text", () => {
      const p = loadPDFPage(d, page);
      // is the line on a picture (a scanned page)? then the old words are painted over, in the paper's colour
      let cover = null;
      const js = stextOf(p);
      const onImage = js.blocks.some(b => b.type === "image" && b.bbox.x < rect[2] && b.bbox.x + b.bbox.w > rect[0] && b.bbox.y < rect[3] && b.bbox.y + b.bbox.h > rect[1]);
      if (onImage) {
        let color = [1, 1, 1];
        try {
          // the colour of the paper just around the line
          const pix = p.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false, false);
          const px = pix.getPixels(), W = pix.getWidth(), H = pix.getHeight(), n = pix.getNumberOfComponents();
          const samples = [];
          for (const [x, y] of [[rect[0] - 3, rect[1] - 3], [rect[2] + 3, rect[1] - 3], [rect[0] - 3, rect[3] + 3], [rect[2] + 3, rect[3] + 3]]) {
            const xi = Math.max(0, Math.min(W - 1, Math.round(x))), yi = Math.max(0, Math.min(H - 1, Math.round(y)));
            const o = (yi * W + xi) * n;
            samples.push([px[o] / 255, px[o + 1] / 255, px[o + 2] / 255]);
          }
          samples.sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2]));
          color = samples[0];
        } catch (e) {}
        cover = { rect: [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1], color };
      }
      const r = p.createAnnotation("Redact");
      r.setRect(rect);
      r.update();
      p.applyRedactions(false, 0, 0, 0);
      addTextToPage(d, page, items, cover);
      p.update();
      d.st = null;
      return true;
    });
  },

  // ---- pages
  rotatePage(key, page, by) {
    const d = get(key);
    return op(d, "Turn a page", () => { d.st = null;
      const po = d.pdf.findPage(page);
      const cur = po.getInheritable("Rotate");
      const r = ((cur.isNull() ? 0 : cur.asNumber()) + by + 360) % 360;
      po.put("Rotate", r);
      return pageSizes(d.doc);
    });
  },

  deletePage(key, page) {
    const d = get(key);
    return op(d, "Take out a page", () => { d.st = null; d.pdf.deletePage(page); return pageSizes(d.doc); });
  },

  movePage(key, from, to) {
    const d = get(key);
    return op(d, "Move a page", () => { d.st = null;
      const n = d.doc.countPages();
      const order = [...Array(n).keys()];
      const [x] = order.splice(from, 1);
      order.splice(to, 0, x);
      d.pdf.rearrangePages(order);
      return pageSizes(d.doc);
    });
  },

  insertPages(key, at, bytes) {
    // put the pages of another PDF (a written page, a scan...) at a place in this one
    const d = get(key);
    return op(d, "Add pages", () => { d.st = null;
      const src = mupdf.Document.openDocument(new Uint8Array(bytes), "application/pdf").asPDF();
      graftWithSource(d.pdf, src, at);
      return pageSizes(d.doc);
    });
  },

  // the written page (or pages) around this page: {html, start, n} or null
  writtenAt(key, page) {
    const d = get(key);
    if (!d.pdf) return null;
    for (let p = page; p >= 0 && p > page - 60; p--) {
      const po = d.pdf.loadPage(p).getObject();
      const src = po.get("BLSource");
      if (src.isNull()) continue;
      const n = po.get("BLSourceN").isNull() ? 1 : po.get("BLSourceN").asNumber();
      if (p + n > page) return { html: src.asString(), start: p, n };
      return null;
    }
    return null;
  },

  // put the written pages in again, changed
  replaceWritten(key, start, n, bytes) {
    const d = get(key);
    return op(d, "Change a written page", () => {
      d.st = null;
      for (let i = 0; i < n; i++) d.pdf.deletePage(start);
      const src = mupdf.Document.openDocument(new Uint8Array(bytes), "application/pdf").asPDF();
      graftWithSource(d.pdf, src, start);
      return pageSizes(d.doc);
    });
  },

  // blank pages the size of the page they follow: plain, lined, squared or dotted paper
  insertBlank(key, at, n = 1, w = 595, h = 842, pattern = "blank") {
    const d = get(key);
    return op(d, "Add pages", () => { d.st = null;
      for (let i = 0; i < n; i++) {
        const page = d.pdf.addPage([0, 0, w, h], 0, d.pdf.newDictionary(), paperPattern(pattern, w, h));
        d.pdf.insertPage(at + i, page);
      }
      return pageSizes(d.doc);
    });
  },

  // a new PDF of blank pages (a new document in a book)
  blankPdf(n = 1, w = 595, h = 842, pattern = "blank") {
    const out = new mupdf.PDFDocument();
    for (let i = 0; i < n; i++) out.insertPage(i, out.addPage([0, 0, w, h], 0, out.newDictionary(), paperPattern(pattern, w, h)));
    const u8 = out.saveToBuffer("compress").asUint8Array().slice();
    return { __transfer: [u8.buffer], value: u8 };
  },

  // pages that come from a Google Doc, Sheet or Slides: each page remembers where it came from, so it can be
  // opened there again and its pages put in anew
  insertTagged(key, at, bytes, tag) {
    const d = get(key);
    return op(d, "Add pages", () => { d.st = null;
      const src = mupdf.Document.openDocument(new Uint8Array(bytes), "application/pdf").asPDF();
      const n = src.countPages();
      graftWithSource(d.pdf, src, at);
      tagPages(d, at, n, tag);
      return pageSizes(d.doc);
    });
  },

  taggedAt(key, page) {
    const d = get(key);
    if (!d.pdf) return null;
    const po = d.pdf.loadPage(page).getObject();
    const t = po.get("BLFrom");
    if (t.isNull()) return null;
    const i = po.get("BLFromI").isNull() ? 0 : po.get("BLFromI").asNumber();
    const n = po.get("BLFromN").isNull() ? 1 : po.get("BLFromN").asNumber();
    try { return { tag: JSON.parse(t.asString()), start: page - i, n }; } catch (e) { return null; }
  },

  replaceTagged(key, start, n, bytes, tag) {
    const d = get(key);
    return op(d, "Put the pages in anew", () => {
      d.st = null;
      for (let i = 0; i < n; i++) d.pdf.deletePage(start);
      const src = mupdf.Document.openDocument(new Uint8Array(bytes), "application/pdf").asPDF();
      const m = src.countPages();
      graftWithSource(d.pdf, src, start);
      tagPages(d, start, m, tag);
      return pageSizes(d.doc);
    });
  },

  // every document of a book, one after another, as one PDF (with the marks)
  joinOpen(keys) {
    const out = new mupdf.PDFDocument();
    let at = 0;
    for (const key of keys) {
      const d = get(key);
      let src = d.pdf;
      if (!src) {
        const buf = new mupdf.Buffer();
        const wr = new mupdf.DocumentWriter(buf, "pdf", "compress");
        const n = d.doc.countPages();
        for (let i = 0; i < n; i++) { const pg = d.doc.loadPage(i); const dev = wr.beginPage(pg.getBounds()); pg.run(dev, mupdf.Matrix.identity); wr.endPage(); }
        wr.close();
        src = mupdf.Document.openDocument(buf.asUint8Array().slice(), "application/pdf").asPDF();
      }
      const map = out.newGraftMap();
      const n = src.countPages();
      for (let i = 0; i < n; i++) map.graftPage(at++, src, i);
    }
    const u8 = out.saveToBuffer("garbage=1,compress").asUint8Array().slice();
    return { __transfer: [u8.buffer], value: u8 };
  },

  // ---- making PDFs
  htmlToPdf(html, css, w = 595, h = 842, margin = 54, keepSource = false) {
    // a written page or document: MuPDF lays out the HTML on A4 pages
    const mg = typeof margin === "number" ? margin + "pt" : String(margin);
    const full = `<html><head><style>@page{margin:${mg}} body{margin:0} ${css || ""}</style></head><body>${html}</body></html>`;
    const hd = mupdf.Document.openDocument(new TextEncoder().encode(full), "text/html");
    hd.layout(w, h, 11);
    const out = new mupdf.Buffer();
    const wr = new mupdf.DocumentWriter(out, "pdf", "compress");
    const n = hd.countPages();
    for (let i = 0; i < n; i++) {
      const pg = hd.loadPage(i);
      const dev = wr.beginPage(pg.getBounds());
      pg.run(dev, mupdf.Matrix.identity);
      wr.endPage();
    }
    wr.close();
    let u8 = out.asUint8Array().slice();
    if (keepSource) {
      // the words as written (HTML) stay inside the first page, so "Edit this written page" can open them again
      const pdf = mupdf.Document.openDocument(u8, "application/pdf").asPDF();
      const po = pdf.loadPage(0).getObject();
      po.put("BLSource", pdf.newString(html));
      po.put("BLSourceN", n);
      u8 = pdf.saveToBuffer("compress").asUint8Array().slice();
    }
    return { __transfer: [u8.buffer], value: u8 };
  },

  imagesToPdf(images) {
    // photos or scans -> one PDF, a page per picture (A4 width, the picture's own proportions)
    const pdf = new mupdf.PDFDocument();
    for (const bytes of images) {
      const img = new mupdf.Image(new Uint8Array(bytes));
      const iw = img.getWidth(), ih = img.getHeight();
      const W = 595, H = Math.round(595 * ih / iw);
      const res = pdf.newDictionary();
      const xo = pdf.newDictionary();
      xo.put("I0", pdf.addImage(img));
      res.put("XObject", xo);
      const page = pdf.addPage([0, 0, W, H], 0, res, `q ${W} 0 0 ${H} 0 0 cm /I0 Do Q`);
      pdf.insertPage(-1, page);
    }
    const u8 = pdf.saveToBuffer("compress").asUint8Array().slice();
    return { __transfer: [u8.buffer], value: u8 };
  },

  joinPdfs(list) {
    const pdf = new mupdf.PDFDocument();
    let at = 0;
    for (const bytes of list) {
      const src = mupdf.Document.openDocument(new Uint8Array(bytes), "application/pdf").asPDF();
      const map = pdf.newGraftMap();
      for (let i = 0; i < src.countPages(); i++) map.graftPage(at++, src, i);
    }
    const u8 = pdf.saveToBuffer("compress").asUint8Array().slice();
    return { __transfer: [u8.buffer], value: u8 };
  },

  // a report's pages: a thin frame with the colours on its top edge (the institution's or BindLens'), the title on
  // top of the pages after the first, and the foot: "Made with BindLens" with the logo, the date, "Page i of n"
  decorateReport(bytes, spec) {
    const pdf = mupdf.Document.openDocument(new Uint8Array(bytes), "application/pdf").asPDF();
    const n = pdf.countPages();
    const fR = pdf.addSimpleFont(new mupdf.Font("Helvetica"), "Latin");
    const fB = pdf.addSimpleFont(new mupdf.Font("Helvetica-Bold"), "Latin");
    const HR = new mupdf.Font("Helvetica"), HB = new mupdf.Font("Helvetica-Bold");
    let logo = null;
    try { if (spec.logo) logo = pdf.addImage(new mupdf.Image(new Uint8Array(spec.logo))); } catch (e) { logo = null; }
    const rgb = (hex) => { const h = String(hex || "#000000").replace("#", ""); const v = h.length === 3 ? h.split("").map(c => c + c).join("") : h; return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255); };
    const col = (hex, op) => rgb(hex).map(x => x.toFixed(3)).join(" ") + " " + op;
    const lerp = (a, b, t) => { const A = rgb(a), B = rgb(b); return A.map((x, i) => x + (B[i] - x) * t); };
    const stops = (spec.frame && spec.frame.length ? spec.frame : ["#111218", "#FF85C2", "#FFC83D", "#FF85C2", "#111218"]);
    const fit = (font, s, size, max) => { let t = String(s || ""); while (t.length > 3 && textWidth(font, t, size) > max) t = t.slice(0, -2); return t === String(s || "") ? t : t.replace(/\s+\S*$/, "") + "..."; };
    for (let i = 0; i < n; i++) {
      const page = pdf.loadPage(i);
      const [bx0, by0, bx1, by1] = page.getBounds();
      const W = bx1 - bx0, H = by1 - by0;
      const m = 15, r = 9, x0 = m, y0 = m, x1 = W - m, y1 = H - m;
      const k = 0.5523 * r;
      const rr = `${x0 + r} ${y0} m ${x1 - r} ${y0} l ${x1 - r + k} ${y0} ${x1} ${y0 + r - k} ${x1} ${y0 + r} c ${x1} ${y1 - r} l ${x1} ${y1 - r + k} ${x1 - r + k} ${y1} ${x1 - r} ${y1} c ${x0 + r} ${y1} l ${x0 + r - k} ${y1} ${x0} ${y1 - r + k} ${x0} ${y1 - r} c ${x0} ${y0 + r} l ${x0} ${y0 + r - k} ${x0 + r - k} ${y0} ${x0 + r} ${y0} c h`;
      let cs = "q\n";
      // the colours along the top edge, inside the rounded frame
      cs += `q ${rr} W n\n`;
      const segs = 90, bw = (x1 - x0) / segs;
      for (let s = 0; s < segs; s++) {
        const t = s / (segs - 1) * (stops.length - 1), a = Math.min(stops.length - 2, Math.floor(t));
        const c = lerp(stops[a], stops[a + 1], t - a).map(x => x.toFixed(3)).join(" ");
        cs += `${c} rg ${(x0 + s * bw).toFixed(2)} ${(y1 - 3.2).toFixed(2)} ${(bw + 0.4).toFixed(2)} 3.2 re f\n`;
      }
      cs += "Q\n";
      cs += `${col(spec.line || "#CFCBD8", "RG")} 0.6 w ${rr} S\n`;
      const txt = (font, name, size, x, y, s, hex, anchor = "left") => {
        const w = textWidth(font, s, size);
        const tx = anchor === "right" ? x - w : anchor === "center" ? x - w / 2 : x;
        return `BT /${name} ${size} Tf ${col(hex, "rg")} 1 0 0 1 ${tx.toFixed(2)} ${y.toFixed(2)} Tm ${pdfString(s)} Tj ET\n`;
      };
      // the title on top of the next pages
      if (i > 0) {
        cs += txt(HB, "BLRB", 7.5, 38, H - 31, fit(HB, spec.title, 7.5, W * 0.55), "#3B3946");
        if (spec.right) cs += txt(HR, "BLRR", 7.5, W - 38, H - 31, fit(HR, spec.right, 7.5, W * 0.3), "#6B6878", "right");
      }
      // the foot
      const fy = 24;
      let fx = 38;
      if (logo) { cs += `q 9 0 0 9 ${fx} ${fy - 2} cm /BLRL Do Q\n`; fx += 13; }
      cs += txt(HR, "BLRR", 7, fx, fy, spec.foot || _t("Made with BindLens"), "#8A8796");
      if (spec.mid) cs += txt(spec.alert ? HB : HR, spec.alert ? "BLRB" : "BLRR", 7, W / 2, fy, spec.mid, spec.alert ? "#9B1C1C" : "#8A8796", "center");
      cs += txt(HB, "BLRB", 7, W - 38, fy, _t("Page {0} of {1}", i + 1, n), "#3B3946", "right");
      cs += "Q\n";
      const pobj = page.getObject();
      let res = pobj.getInheritable("Resources");
      if (!res || res.isNull()) { res = pdf.newDictionary(); pobj.put("Resources", res); }
      else if (res.isIndirect()) res = res.resolve();
      let fonts = res.get("Font");
      if (!fonts || fonts.isNull()) { fonts = pdf.newDictionary(); res.put("Font", fonts); }
      else if (fonts.isIndirect()) fonts = fonts.resolve();
      fonts.put("BLRR", fR); fonts.put("BLRB", fB);
      if (logo) {
        let xo = res.get("XObject");
        if (!xo || xo.isNull()) { xo = pdf.newDictionary(); res.put("XObject", xo); }
        else if (xo.isIndirect()) xo = xo.resolve();
        xo.put("BLRL", logo);
      }
      // the page's own drawing goes inside q ... Q, so ours starts from the plain page (not from its last transform)
      const arr = pdf.newArray();
      arr.push(pdf.addStream("q\n", {}));
      const contents = pobj.get("Contents");
      if (contents.isArray()) { for (let j = 0; j < contents.length; j++) arr.push(contents.get(j)); }
      else if (!contents.isNull()) arr.push(contents);
      arr.push(pdf.addStream("\nQ\n", {}));
      arr.push(pdf.addStream(cs, {}));
      pobj.put("Contents", arr);
    }
    // the title and the maker in the file's own details
    try { pdf.setMetaData("info:Title", spec.title || _t("Report")); pdf.setMetaData("info:Creator", "BindLens"); pdf.setMetaData("info:Producer", "BindLens (MuPDF)"); } catch (e) {}
    const u8 = pdf.saveToBuffer("garbage=1,compress").asUint8Array().slice();
    return { __transfer: [u8.buffer], value: u8 };
  },

  // ---- scans: straighten a photo of a page (four corners -> a flat page), and cleaner black on white
  warp(bytes, pts, w, h, clean) {
    const img = new mupdf.Image(new Uint8Array(bytes));
    let pix = img.toPixmap();
    if (pix.getColorSpace() && pix.getColorSpace().getType && pix.getColorSpace().getType() !== "RGB") {
      try { pix = pix.convertToColorSpace(mupdf.ColorSpace.DeviceRGB, false); } catch (e) {}
    }
    let out = pix.warp(pts, Math.round(w), Math.round(h));
    if (clean) {
      try { out = out.convertToColorSpace(mupdf.ColorSpace.DeviceGray, false); } catch (e) {}
      // stretch the greys: the paper goes white, the ink goes dark
      const px = out.getPixels();
      const n = out.getNumberOfComponents() + (out.getAlpha() ? 1 : 0);
      const hist = new Array(256).fill(0);
      for (let i = 0; i < px.length; i += n) hist[px[i]]++;
      const total = px.length / n;
      let acc = 0, lo = 0, hi = 255;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break; } }
      acc = 0;
      for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.35) { hi = v; break; } }
      if (hi - lo > 20) {
        const lut = new Uint8Array(256);
        for (let v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(255, Math.round((v - lo) * 255 / (hi - lo))));
        // write back through a new pixmap
        const g = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, out.getWidth(), out.getHeight()], false);
        const gp = g.getPixels();
        for (let i = 0, j = 0; j < gp.length; i += n, j++) gp[j] = lut[px[i]];
        out = g;
      }
    }
    const jpg = out.asJPEG(85).slice();
    return { __transfer: [jpg.buffer], value: jpg };
  },

  // the words read from a scanned page, written invisibly over it, so the PDF can be searched and copied from
  addInvisibleText(key, page, words) {
    const d = get(key);
    return op(d, "Read a scanned page", () => {
      const p = d.pdf.loadPage(page);
      const pobj = p.getObject();
      let res = pobj.getInheritable("Resources");
      if (!res || res.isNull()) { res = d.pdf.newDictionary(); pobj.put("Resources", res); }
      else if (res.isIndirect()) res = res.resolve();
      let fonts = res.get("Font");
      if (!fonts || fonts.isNull()) { fonts = d.pdf.newDictionary(); res.put("Font", fonts); }
      if (fonts.get("BLWOCR").isNull()) fonts.put("BLWOCR", d.pdf.addSimpleFont(new mupdf.Font("Helvetica"), "Latin"));
      const f = new mupdf.Font("Helvetica");
      const inv = mupdf.Matrix.invert(p.getTransform());
      let cs = "q BT 3 Tr\n";
      for (const w of words) {
        const [x0, y0, x1, y1] = w.bbox;
        const size = Math.max(4, (y1 - y0) * 0.9);
        const tw = textWidth(f, w.text, size) || 1;
        const tz = Math.max(10, Math.min(400, ((x1 - x0) / tw) * 100));
        const bx = inv[0] * x0 + inv[2] * (y1 - (y1 - y0) * 0.2) + inv[4];
        const by = inv[1] * x0 + inv[3] * (y1 - (y1 - y0) * 0.2) + inv[5];
        cs += `/BLWOCR ${size.toFixed(2)} Tf ${tz.toFixed(1)} Tz 1 0 0 1 ${bx.toFixed(2)} ${by.toFixed(2)} Tm ${pdfString(w.text)} Tj\n`;
      }
      cs += "ET Q\n";
      const stream = d.pdf.addStream(cs, {});
      const contents = pobj.get("Contents");
      if (contents.isArray()) contents.push(stream);
      else { const arr = d.pdf.newArray(); if (!contents.isNull()) arr.push(contents); arr.push(stream); pobj.put("Contents", arr); }
      d.st = null;
      return true;
    });
  },

  hasText(key, page) {
    const d = get(key);
    return d.doc.loadPage(page).toStructuredText("").asText().trim().length > 15;
  },

  // ---- copies and changes of a whole document
  extractPages(key, pages) {
    // these pages (0-based, in this order) as a new PDF
    const d = get(key);
    const src = d.pdf;
    const out = new mupdf.PDFDocument();
    const map = out.newGraftMap();
    pages.forEach((pg, i) => map.graftPage(i, src, pg));
    const u8 = out.saveToBuffer("compress").asUint8Array().slice();
    return { __transfer: [u8.buffer], value: u8 };
  },

  watermark(key, text, opacityGrey = 0.35) {
    const d = get(key);
    return op(d, "Watermark", () => {
      const f = new mupdf.Font("Helvetica-Bold");
      const n = d.doc.countPages();
      for (let i = 0; i < n; i++) {
        const page = d.pdf.loadPage(i);
        const [x0, y0, x1, y1] = page.getBounds();
        const w = x1 - x0, h = y1 - y0;
        const pobj = page.getObject();
        let res = pobj.getInheritable("Resources");
        if (!res || res.isNull()) { res = d.pdf.newDictionary(); pobj.put("Resources", res); }
        else if (res.isIndirect()) res = res.resolve();
        let fonts = res.get("Font");
        if (!fonts || fonts.isNull()) { fonts = d.pdf.newDictionary(); res.put("Font", fonts); }
        if (fonts.get("BLWWM").isNull()) fonts.put("BLWWM", d.pdf.addSimpleFont(new mupdf.Font("Helvetica-Bold"), "Latin"));
        let gs = res.get("ExtGState");
        if (!gs || gs.isNull()) { gs = d.pdf.newDictionary(); res.put("ExtGState", gs); }
        if (gs.get("BLWGS").isNull()) {
          const g = d.pdf.newDictionary(); g.put("Type", d.pdf.newName("ExtGState")); g.put("ca", 0.22); g.put("CA", 0.22);
          gs.put("BLWGS", d.pdf.addObject(g));
        }
        const diag = Math.hypot(w, h);
        let size = 72;
        while (size > 10 && textWidth(f, text, size) > diag * 0.7) size -= 2;
        const tw = textWidth(f, text, size);
        const ang = Math.atan2(h, w);
        const c = Math.cos(ang), sn = Math.sin(ang);
        // centre of the page, in PDF units (bottom-left origin)
        const inv = mupdf.Matrix.invert(page.getTransform());
        const cx = inv[0] * (x0 + w / 2) + inv[2] * (y0 + h / 2) + inv[4];
        const cy = inv[1] * (x0 + w / 2) + inv[3] * (y0 + h / 2) + inv[5];
        const tx = cx - c * tw / 2 + sn * size * 0.35, ty = cy - sn * tw / 2 - c * size * 0.35;
        const g = opacityGrey.toFixed(2);
        const cs = `q /BLWGS gs BT /BLWWM ${size} Tf ${g} ${g} ${g} rg ${c.toFixed(4)} ${sn.toFixed(4)} ${(-sn).toFixed(4)} ${c.toFixed(4)} ${tx.toFixed(2)} ${ty.toFixed(2)} Tm ${pdfString(text)} Tj ET Q\n`;
        const stream = d.pdf.addStream(cs, {});
        const contents = pobj.get("Contents");
        if (contents.isArray()) contents.push(stream);
        else { const arr = d.pdf.newArray(); if (!contents.isNull()) arr.push(contents); arr.push(stream); pobj.put("Contents", arr); }
      }
      d.st = null;
      return true;
    });
  },

  crop(key, page, margins) {
    // margins [left, top, right, bottom] in points; page -1 = every page
    const d = get(key);
    return op(d, "Crop", () => {
      const n = d.doc.countPages();
      for (let i = 0; i < n; i++) {
        if (page >= 0 && i !== page) continue;
        const p = d.pdf.loadPage(i);
        const po = p.getObject();
        const mb = po.getInheritable("CropBox").isNull() ? po.getInheritable("MediaBox") : po.getInheritable("CropBox");
        const r = [0, 1, 2, 3].map(j => mb.get(j).asNumber());
        const [l, t, rr, b] = margins;
        p.setPageBox("CropBox", [r[0] + l, r[1] + b, r[2] - rr, r[3] - t].map(v => Math.round(v * 100) / 100));
      }
      d.st = null;
      return pageSizes(d.doc);
    });
  },

  protectedCopy(key, userPw, ownerPw, readOnly) {
    // a copy that asks for a password to open (and/or cannot be changed or printed)
    const d = get(key);
    const bytes = d.pdf.saveToBuffer("").asUint8Array().slice();
    const tmp = mupdf.Document.openDocument(bytes, "application/pdf").asPDF();
    let opts = "encrypt=aes-256,garbage=1";
    if (userPw) opts += ",user-password=" + userPw.replace(/,/g, "");
    opts += ",owner-password=" + (ownerPw || userPw || Math.random().toString(36).slice(2)).replace(/,/g, "");
    if (readOnly) opts += ",permissions=" + (4 | 16);   // may print and copy text, nothing else
    const u8 = tmp.saveToBuffer(opts).asUint8Array().slice();
    return { __transfer: [u8.buffer], value: u8 };
  },

  smallerCopy(key, maxSide = 1800, quality = 72) {
    // big pictures (scans, photos) drawn again smaller as JPEG, then everything packed tight; on a copy
    const d = get(key);
    const bytes = d.pdf.saveToBuffer("").asUint8Array().slice();
    const pdf = mupdf.Document.openDocument(bytes, "application/pdf").asPDF();
    const done = new Map();
    let pictures = 0;
    const n = pdf.countPages();
    for (let i = 0; i < n; i++) {
      const po = pdf.loadPage(i).getObject();
      const res = po.getInheritable("Resources");
      if (!res || res.isNull()) continue;
      const xo = res.get("XObject");
      if (!xo || xo.isNull()) continue;
      const names = [];
      xo.forEach((v, k) => names.push(k));
      for (const name of names) {
        const ref = xo.get(name);
        if (!ref.isIndirect()) continue;
        const num = ref.asIndirect();
        if (done.has(num)) { if (done.get(num)) xo.put(name, done.get(num)); continue; }
        done.set(num, null);
        const obj = ref.resolve();
        if (obj.get("Subtype").toString() !== "/Image") continue;
        if (!obj.get("SMask").isNull() || !obj.get("Mask").isNull() || obj.get("ImageMask").asBoolean?.()) continue;
        let img;
        try { img = pdf.loadImage(ref); } catch (e) { continue; }
        const w = img.getWidth(), h = img.getHeight();
        if (w * h < 400 * 400 || img.getImageMask()) continue;
        const cs = img.getColorSpace();
        if (!cs || !(cs.isRGB() || cs.isGray())) continue;
        const k = Math.min(1, maxSide / Math.max(w, h));
        let pix = img.toPixmap();
        if (pix.getAlpha && pix.getAlpha()) continue;
        if (k < 1) {
          const W = Math.round(w * k), H = Math.round(h * k);
          pix = pix.warp([[0, 0], [w, 0], [w, h], [0, h]], W, H);
        }
        const jpg = pix.asJPEG(quality);
        const oldLen = obj.get("Length").isNull() ? Infinity : obj.get("Length").asNumber();
        if (jpg.length >= oldLen * 0.9) continue;
        const nref = pdf.addImage(new mupdf.Image(jpg));
        done.set(num, nref);
        xo.put(name, nref);
        pictures++;
      }
    }
    const u8 = pdf.saveToBuffer("garbage=4,compress,compress-fonts,clean").asUint8Array().slice();
    return { __transfer: [u8.buffer], value: { bytes: u8, pictures } };
  },

  // erase for good: the words, lines and picture under the box are taken out of the PDF (not only covered)
  eraseArea(key, page, rect, black, markIndex = -1) {
    const d = get(key);
    return op(d, "Erase for good", () => {
      const p = loadPDFPage(d, page);
      if (markIndex >= 0) { const a = p.getAnnotations()[markIndex]; if (a) p.deleteAnnotation(a); }
      const r = p.createAnnotation("Redact");
      r.setRect(rect);
      r.update();
      p.applyRedactions(!!black, 2, 1, 0);
      d.st = null;
      return true;
    });
  },


  // the whole document with marks drawn in (for printing a copy of a non-PDF, or a picture of a page)
  // strips of a page (a table's header and a row), one under the other, as they look: one PNG
  clip(key, page, rects, scale = 2) {
    const d = get(key);
    const p = d.doc.loadPage(page);
    const W = Math.max(1, Math.round((rects[0][2] - rects[0][0]) * scale));
    const bands = rects.map(r => {
      const bbox = [Math.round(r[0] * scale), Math.round(r[1] * scale), Math.round(r[0] * scale) + W, Math.round(r[3] * scale)];
      const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, false);
      pix.clear(255);
      const dev = new mupdf.DrawDevice(mupdf.Matrix.scale(scale, scale), pix);
      p.run(dev, mupdf.Matrix.identity);
      dev.close();
      return pix;
    });
    const H = bands.reduce((a, b) => a + b.getHeight(), 0);
    const out = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, W, H], false);
    const all = out.getPixels();
    let off = 0;
    for (const b of bands) { const px = b.getPixels(); all.set(px.subarray(0, Math.min(px.length, all.length - off)), off); off += px.length; }
    const u8 = out.asPNG().slice();
    return { __transfer: [u8.buffer], value: u8 };
  },

  pagePng(key, page, scale) {
    const d = get(key);
    const p = d.doc.loadPage(page);
    const pix = p.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
    const u8 = pix.asPNG().slice();
    return { __transfer: [u8.buffer], value: u8 };
  },
};

self.onmessage = async (e) => {
  const { id, fn, args } = e.data;
  try {
    if (!api[fn]) throw new Error(_t("Unknown call ") + fn);
    let v = api[fn](...(args || []));
    if (v instanceof Promise) v = await v;
    if (v && v.__transfer) self.postMessage({ id, ok: true, value: v.value }, v.__transfer);
    else self.postMessage({ id, ok: true, value: v });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
self.postMessage({ ready: true });
export const __api = api; // (for tests in Node)
