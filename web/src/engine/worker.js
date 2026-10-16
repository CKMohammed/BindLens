// BindLens Web - the document engine. Runs MuPDF (the same engine as the Windows app) in a Web Worker, so pages
// render, marks are written and files are saved without freezing the page. The page talks to it with messages:
// {id, fn, args} -> {id, ok, value} (see client.js).
// (the build puts MuPDF's WebAssembly file next to its script; MuPDF finds it there)
const mupdf = await import("mupdf");

const docs = new Map(); // key -> {doc, pdf, mime, name, journal}

function get(key) {
  const d = docs.get(key);
  if (!d) throw new Error("This document is not open: " + key);
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
  return o;
}

function loadPDFPage(d, page) {
  if (!d.pdf) throw new Error("Marks can only go on PDF pages");
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

function stickyAppearance(d, a) {
  let r = a.getRect();
  const size = 12, lead = 15, pad = 9;
  const f = new mupdf.Font("Helvetica");
  const w = r[2] - r[0];
  const lines = wrapLines(f, a.getContents(), size, w - pad * 2);
  const need = pad * 2 + 6 + lines.length * lead;
  if (r[3] - r[1] < need) { r = [r[0], r[1], r[2], r[1] + need]; a.setRect(r); }
  const h = r[3] - r[1];
  const font = d.pdf.addSimpleFont(new mupdf.Font("Helvetica"), "Latin");
  const res = d.pdf.newDictionary();
  const fd = d.pdf.newDictionary();
  fd.put("F", font);
  res.put("Font", fd);
  let cs = "q 1 0.93 0.55 rg 0 0 " + w + " " + h + " re f ";
  cs += "1 0.86 0.36 rg 0 " + (h - 7) + " " + w + " 7 re f ";
  cs += "0.86 0.75 0.3 RG 0.6 w 0.3 0.3 " + (w - 0.6) + " " + (h - 0.6) + " re S Q\n";
  cs += "BT /F " + size + " Tf 0.16 0.14 0.3 rg " + lead + " TL 1 0 0 1 " + pad + " " + (h - pad - 6 - size) + " Tm ";
  for (const [i, l] of lines.entries()) cs += (i ? "T* " : "") + pdfString(l) + " Tj ";
  cs += "ET\n";
  a.setAppearance(null, null, mupdf.Matrix.identity, [0, 0, w, h], res, cs);
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
  const size = da.size || 12, lead = size * 1.25, pad = st.style === "plain" ? 2 : 6;
  const f = new mupdf.Font(st.bold ? "Helvetica-Bold" : "Helvetica");
  const w = r[2] - r[0];
  const lines = wrapLines(f, a.getContents(), size, w - pad * 2);
  const need = pad * 2 + lines.length * lead;
  if (r[3] - r[1] < need - 0.5) { r = [r[0], r[1], r[2], r[1] + need]; a.setRect(r); }
  const h = r[3] - r[1];
  const font = d.pdf.addSimpleFont(new mupdf.Font(st.bold ? "Helvetica-Bold" : "Helvetica"), "Latin");
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
  cs += `BT /F ${size} Tf ${txt.join(" ")} rg ${lead.toFixed(2)} TL 1 0 0 1 ${pad} ${(h - pad - size * 0.85).toFixed(2)} Tm `;
  for (const [i, l] of lines.entries()) cs += (i ? "T* " : "") + pdfString(l) + " Tj ";
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
  if (i < 0 || i >= list.length) throw new Error("That mark is not there any more");
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
    return { pages: pageSizes(doc), isPDF: !!pdf, outline, canUndo: false };
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
    return p.getAnnotations().map(describeAnnot).filter(a => annotTypesWeShow.has(a.type));
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
        if (!annotTypesWeShow.has(o.type)) continue;
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
      // a stamp, a signature or a picture keeps its own look: take its picture before anything changes
      // (any change makes MuPDF draw a plain "Draft" stamp instead), and put it back at the end
      const isStamp = a.getType() === "Stamp";
      const look = isStamp ? a.toDisplayList() : null;
      let shift = [0, 0];
      a.setModificationDate(new Date());
      if (change.contents != null) a.setContents(change.contents);
      if (change.color) {
        if (a.getType() === "FreeText") {
          const da = a.getDefaultAppearance();
          a.setDefaultAppearance(da.font || "Helv", da.size || 12, change.color);
        } else a.setColor(change.color);
      }
      if (change.rect) a.setRect(change.rect);
      if (change.moveBy) {
        const [dx, dy] = change.moveBy;
        const t = a.getType();
        if (a.hasQuadPoints()) a.setQuadPoints(a.getQuadPoints().map(q => q.map((v, j) => v + (j % 2 ? dy : dx))));
        else if (a.hasInkList()) a.setInkList(a.getInkList().map(s => s.map(([x, y]) => [x + dx, y + dy])));
        else if (a.hasLine()) { const [p1, p2] = a.getLine(); a.setLine([p1[0] + dx, p1[1] + dy], [p2[0] + dx, p2[1] + dy]); }
        else if (a.hasVertices()) a.setVertices(a.getVertices().map(([x, y]) => [x + dx, y + dy]));
        else if (t === "Stamp") {
          const r = a.getRect();
          a.setRect([r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy]);
          shift = [dx, dy];
        }
        else { const r = a.getRect(); a.setRect([r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy]); }
      }
      if (change.fill !== undefined && (a.getType() === "Square" || a.getType() === "Circle")) {
        if (change.fill) a.setInteriorColor(change.fill); else a.setInteriorColor([]);
      }
      if (change.style && a.getType() === "FreeText") {
        const was = styleOf(a) || {};
        const st = { ...was, ...change.style };
        a.getObject().put("BLStyle", d.pdf.newString(JSON.stringify(st)));
        try { a.setSubject(st.style === "plain" && !st.fill && !st.line ? "" : "Text box"); } catch (e) {}
      }
      if (change.size && a.getType() === "FreeText") {
        const da = a.getDefaultAppearance();
        a.setDefaultAppearance(da.font || "Helv", change.size, da.color || [0, 0, 0]);
      }
      const type = a.getType();
      let subject = "";
      try { subject = a.getSubject(); } catch (e) {}
      // stamps, signatures and pictures keep their own look when they move; sticky notes are drawn again
      if (type === "Stamp") {
        a.update();
        if (change.stamp) stampAppearance(d, a, change.stamp);
        else a.setAppearanceFromDisplayList(null, null, mupdf.Matrix.translate(shift[0], shift[1]), look);
      }
      else if (type === "FreeText" && subject === "Sticky note") { a.update(); stickyAppearance(d, a); }
      else if (type === "FreeText" && styleOf(a) && (styleOf(a).style !== "plain" || styleOf(a).fill || styleOf(a).line)) {
        a.update();
        const st = styleOf(a);
        if (change.color) st.color = change.color;
        a.getObject().put("BLStyle", d.pdf.newString(JSON.stringify(st)));
        boxAppearance(d, a, st);
      }
      else a.update();
      p.update();
      return true;
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
    if (!d.pdf) throw new Error("Only PDFs can be saved");
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
    const full = `<html><head><style>@page{margin:${margin}pt} body{margin:0} ${css || ""}</style></head><body>${html}</body></html>`;
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
    if (!api[fn]) throw new Error("Unknown call " + fn);
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
