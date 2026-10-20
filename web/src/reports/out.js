// Reports out of BindLens: the PDF (a frame in the colours of the institution or of BindLens, the logo of the
// institution or the name of the person, a summary band, column titles on every page, "Page i of n"), the styled
// Excel file, CSV and text - and the few figures and the chart that go on top. The rows stay exactly as written.
import { settings, store, books } from "../state.js";
import { escapeHtml, fmtDate, brandOf, mix } from "../util.js";
import { _t, loc } from "../i18n.js";

const BL_FRAME = ["#111218", "#FF85C2", "#FFC83D", "#FF85C2", "#111218"];   // the logo's colours
export const NEW_BLUE = "#2F6FDE";
const VOLATILE = /^(When|Checklist|Changed|State)$/;    // columns that change by themselves (days left...) - not "new"

// ---- the colours of a report
export function repTheme() {
  const br = brandOf(settings.value);
  const u = store.value?.user;
  const person = (u && u.name && !/@/.test(u.name) ? u.name : "") || "";
  if (br && br.reports !== false) {
    return { brand: true, name: br.name || "", logo: br.logo || "", person, accent: br.accent, line: br.c1, rule: br.c1,
      soft: br.soft, grid: mix(br.c1, "#FFFFFF", 0.74), frame: br.frameColors, series: br.accent, seriesDark: mix(br.c1, "#FFFFFF", 0.3), mute: "#A9A5B5" };
  }
  return { brand: false, name: "", logo: "", person, accent: "#111218", line: "#2A2B33", rule: "#FF85C2", soft: "#F6F4F9",
    grid: "#E4E1EA", frame: BL_FRAME, series: "#C2306F", seriesDark: "#D9558F", mute: "#A9A5B5" };
}

// ---- what a report holds
export function countOf(rep) {
  return rep.pictures ? rep.pictures.reduce((a, sc) => a + sc.items.length, 0) : rep.tables ? rep.tables.reduce((a, t) => a + t.rows.length, 0) : rep.rows.length;
}
function gosOf(rep) {
  if (rep.pictures) return rep.pictures.flatMap(sc => sc.items.map(it => it.go));
  if (rep.tables) return rep.tables.map(t => t.go);
  return rep.rows.map(r => r.go);
}
export function docsOf(rep) { return new Set(gosOf(rep).filter(Boolean).map(g => g.fileId)).size; }
function booksOf(rep) { return new Set(gosOf(rep).filter(Boolean).map(g => g.bookId)).size; }

const n0 = (v) => Number(v || 0).toLocaleString(loc);
function topKinds(rows, j, k = 3) {
  const m = new Map();
  for (const r of rows) { const x = String(r.cells[j] || "").trim() || _t("Other"); m.set(x, (m.get(x) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);
}

// two to four figures for the band on top of the report
export function summaryOf(rep) {
  const rows = rep.rows || [];
  const docs = docsOf(rep);
  const D = { v: n0(docs), l: docs === 1 ? _t("Document") : _t("Documents") };
  switch (rep.id) {
    case "contacts": return [{ v: n0(rows.length), l: _t("People and contacts") }, { v: n0(rows.filter(r => r.cells[1]).length), l: _t("With an email") }, { v: n0(rows.filter(r => r.cells[2]).length), l: _t("With a phone") }, D];
    case "deadlines": return [{ v: n0(rows.filter(r => r.st === "bad").length), l: _t("Past or today"), st: "bad" }, { v: n0(rows.filter(r => r.st === "warn").length), l: _t("In the next 30 days"), st: "warn" }, { v: n0(rows.filter(r => r.st === "ok").length), l: _t("Later"), st: "ok" }, D];
    case "money": {
      const vals = rows.filter(r => r.value != null);
      const big = vals.reduce((a, r) => (!a || r.value > a.value ? r : a), null);
      return [{ v: n0(rows.length), l: _t("Amounts") }, { v: n0(rows.filter(r => r.cells[1] === _t("Total")).length), l: _t("Totals") }, big && { v: big.cells[0], l: _t("The largest") }, D].filter(Boolean);
    }
    case "privacy": return [{ v: n0(rows.length), l: _t("Personal data found") }, ...topKinds(rows, 0, 2).map(([k, c]) => ({ v: n0(c), l: k })), D];
    case "health": { const ok = rows.filter(r => r.cells[4] === _t("All right")).length; return [{ v: n0(rows.length), l: _t("Files") }, { v: n0(ok), l: _t("All right"), st: "ok" }, { v: n0(rows.length - ok), l: _t("To look at"), st: rows.length - ok ? "warn" : "" }]; }
    case "status": return [{ v: n0(rows.length), l: _t("Files") }, ...topKinds(rows, 2, 3).map(([k, c]) => ({ v: n0(c), l: k }))];
    case "case": return [{ v: n0(rep.facts?.books || 0), l: _t("Books") }, { v: n0(rows.filter(r => r.kind === "missing").length), l: _t("Documents missing"), st: rows.some(r => r.kind === "missing") ? "bad" : "" },
      { v: n0(rows.filter(r => r.kind === "file").length), l: _t("Files waiting") }, { v: n0(rows.filter(r => r.kind === "task").length), l: _t("Open tasks") }];
    case "marks": return [{ v: n0(rows.length), l: _t("Marks") }, { v: n0(rows.filter(r => [_t("Highlight"), _t("Underline")].includes(r.cells[2])).length), l: _t("Highlights") }, { v: n0(rows.filter(r => [_t("Note"), _t("Text"), _t("Sticky note")].includes(r.cells[2])).length), l: _t("Notes and words") }, D];
    case "compare": return [{ v: n0(rows.filter(r => r.cells[0] === _t("Changed")).length), l: _t("Lines changed") }, { v: n0(rows.filter(r => r.cells[0] === _t("Only in the first")).length), l: _t("Only in the first") }, { v: n0(rows.filter(r => r.cells[0] === _t("Only in the second")).length), l: _t("Only in the second") }];
    default:
      if (rep.tables) return [{ v: n0(rep.tables.length), l: rep.tables.length === 1 ? _t("Table") : _t("Tables") }, { v: n0(countOf(rep)), l: _t("Rows") }, D];
      return [{ v: n0(countOf(rep)), l: _t("Rows") }, D, { v: n0(booksOf(rep)), l: booksOf(rep) === 1 ? _t("Book") : _t("Books") }];
  }
}

export function factsOf(rep, th = repTheme()) {
  const now = new Date();
  const t = now.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  const n = countOf(rep), d = docsOf(rep);
  return [rep.where, _t("{0} row{1}", n0(n), n === 1 ? "" : "s"), d ? _t("{0} document{1}", n0(d), d === 1 ? "" : "s") : "", `${fmtDate(now)}, ${t}`, th.brand && th.person ? _t("Prepared by ") + th.person : ""].filter(Boolean).join("  ·  ");
}

// ---- new since the last time: a short fingerprint of each row (without the columns that change by themselves)
function fp(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function keepCols(cols) { return (cols || []).map((c, j) => VOLATILE.test(c || "") ? -1 : j).filter(j => j >= 0); }
export function rowPrint(cells, keep) { return fp((keep ? keep.map(j => cells[j]) : cells).map(c => String(c ?? "").trim()).join("\u0001")); }
export function printsOf(rep) {
  if (rep.pictures) return [];
  if (rep.tables) return rep.tables.flatMap(t => t.rows.map(r => fp(t.title + "\u0002" + r.join("\u0001"))));
  const keep = keepCols(rep.columns);
  return rep.rows.map(r => rowPrint(r.cells, keep));
}
// marks the rows that were not there last time; returns how many
export function markNew(rep, prev) {
  if (!prev || !prev.hashes || rep.pictures) return 0;
  const ps = new Set(prev.hashes);
  let n = 0;
  if (rep.tables) {
    for (const t of rep.tables) { t.isNew = t.rows.map(r => { const x = !ps.has(fp(t.title + "\u0002" + r.join("\u0001"))); if (x) n++; return x; }); }
  } else {
    const keep = keepCols(rep.columns);
    for (const r of rep.rows) { r.isNew = !ps.has(rowPrint(r.cells, keep)); if (r.isNew) n++; }
  }
  // everything new is the same as nothing to compare with (a report changed its columns, say)
  if (n === countOf(rep)) { if (rep.tables) rep.tables.forEach(t => { t.isNew = null; }); else rep.rows.forEach(r => { r.isNew = false; }); return 0; }
  return n;
}

// ---- the sheets of a report: column titles and rows (with their state), for Excel, CSV and the PDF
export function visibleCols(columns, rows) {
  return columns.map((c, j) => j).filter(j => rows.some(r => (r.cells[j] || "").toString().trim() !== ""));
}
export function sheetsOf(rep) {
  if (rep.pictures) return [{ name: rep.title, header: [_t("Name or value"), _t("Where"), _t("The row")], rows: rep.pictures.flatMap(sc => sc.items.map(it => ({ cells: [sc.title, it.title, it.text || ""], go: it.go }))) }];
  if (rep.tables) return rep.tables.map(t => ({ name: t.title, header: t.header || (t.rows[0] || []).map((_, j) => _t("Column ") + (j + 1)), rows: t.rows.map((r, i) => ({ cells: r, isNew: !!(t.isNew && t.isNew[i]), go: t.go })) }));
  const cols = visibleCols(rep.columns, rep.rows);
  const stCol = rep.stCol || _t("When");
  return [{ name: rep.title, header: cols.map(j => rep.columns[j]), stAt: cols.findIndex(j => rep.columns[j] === stCol), docAt: cols.findIndex(j => rep.columns[j] === _t("Document")),
    rows: rep.rows.map(r => ({ cells: cols.map(j => r.cells[j] ?? ""), st: r.st, isNew: !!r.isNew, go: r.go })) }];
}

export function toTsv(rep) {
  return sheetsOf(rep).map(s => (rep.tables ? s.name + "\n" : "") + [s.header, ...s.rows.map(r => r.cells)].map(r => r.map(c => String(c ?? "").replace(/\t|\n/g, " ")).join("\t")).join("\n")).join("\n\n");
}
export function toCsv(rep) {
  const q = (c) => { const s = String(c ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return "﻿" + sheetsOf(rep).map(s => [s.header, ...s.rows.map(r => r.cells)].map(r => r.map(q).join(",")).join("\r\n")).join("\r\n\r\n");
}

// how wide each column should be (in characters), from what it holds
export function colChars(header, rows) {
  return header.map((h, j) => {
    let tot = 0, mx = 0, n = 0;
    for (const r of rows.slice(0, 500)) { const s = String(r.cells ? r.cells[j] ?? "" : r[j] ?? ""); const l = Math.min(220, s.length); tot += l; mx = Math.max(mx, l); n++; }
    const avg = n ? tot / n : 0;
    return Math.max(String(h || "").length + 1, 5, Math.min(64, avg + (mx - avg) * 0.3));
  });
}

// ---- the chart on top: dates by month (deadlines), the largest total in each document (money)
const MON = [_t("Jan"), _t("Feb"), _t("Mar"), _t("Apr"), _t("May"), _t("Jun"), _t("Jul"), _t("Aug"), _t("Sep"), _t("Oct"), _t("Nov"), _t("Dec")];
function currencyOf(s) { const m = /€|EUR|\$|USD|£|GBP/i.exec(s || ""); if (!m) return ""; const c = m[0].toUpperCase(); return c === "EUR" ? "€" : c === "USD" ? "$" : c === "GBP" ? "£" : c; }
export function chartOf(rep) {
  if (rep.id === "deadlines" && rep.rows.length) {
    const now = new Date();
    const y0 = now.getFullYear(), m0 = now.getMonth();
    const items = [{ label: _t("Past"), v: 0, mute: true, tip: _t("Dates already gone") }];
    for (let k = 0; k < 12; k++) { const m = (m0 + k) % 12, y = y0 + Math.floor((m0 + k) / 12); items.push({ label: MON[m], sub: k === 0 || m === 0 ? String(y) : "", v: 0, tip: `${MON[m]} ${y}` }); }
    items.push({ label: _t("Later"), v: 0, tip: _t("After that") });
    const today = new Date(y0, m0, now.getDate());
    for (const r of rep.rows) {
      if (!r.date) continue;
      if (r.date < today) { items[0].v++; continue; }
      const k = (r.date.getFullYear() - y0) * 12 + r.date.getMonth() - m0;
      items[k >= 0 && k < 12 ? k + 1 : 13].v++;
    }
    if (items.every(x => !x.v)) return null;
    return { kind: "col", title: _t("Dates by month"), sub: _t("How many dates fall in each month; the dates already gone are together in grey."), unit: [_t("date"), _t("dates")], items };
  }
  if (rep.id === "money" && rep.rows.length) {
    const cur = new Map();
    for (const r of rep.rows) { const c = currencyOf(r.cells[0]) || currencyOf(r.cells[2]); if (c) cur.set(c, (cur.get(c) || 0) + 1); }
    const main = [...cur.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    const by = new Map();
    for (const r of rep.rows) {
      if (r.value == null || !(r.value > 0)) continue;
      if (main && (currencyOf(r.cells[0]) || currencyOf(r.cells[2])) && (currencyOf(r.cells[0]) || currencyOf(r.cells[2])) !== main) continue;
      const doc = r.cells[3], tot = r.cells[1] === _t("Total");
      const o = by.get(doc);
      if (!o || (tot && !o.tot) || (tot === o.tot && r.value > o.v)) by.set(doc, { v: r.value, text: r.cells[0], tot });
    }
    if (by.size < 2) return null;
    const items = [...by.entries()].map(([label, o]) => ({ label, v: o.v, text: o.text, tip: label + (o.tot ? _t(" · total") : _t(" · the largest amount")) })).sort((a, b) => b.v - a.v).slice(0, 8);
    return { kind: "bar", title: _t("The largest total in each document") + (main ? ` (${main})` : ""), sub: by.size > 8 ? _t("The {0} largest of {1} documents. Where a document has no line called total, its largest amount.", items.length, by.size) : _t("Where a document has no line called total, its largest amount."), items };
  }
  return null;
}

function niceMax(v) { if (v <= 4) return Math.max(1, v); const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p; return 10 * p; }
const FONT = "Helvetica, Arial, sans-serif";
function cut(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
// a rounded end at the data, square at the baseline
function colPath(x, y, w, h, r = 4) { r = Math.min(r, w / 2, h); return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`; }
function barPath(x, y, w, h, r = 4) { r = Math.min(r, h / 2, w); return `M${x} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x}Z`; }

// the chart as SVG text (every word escaped); the same drawing goes in the window and, as a picture, in the PDF
export function chartSvg(ch, th, { w = 760, dark = false } = {}) {
  const ink = dark ? "#F0EFEC" : "#1D1C22", ink2 = dark ? "#C3C2B7" : "#5B5966", grid = dark ? "#34333A" : "#E6E3EC";
  const series = dark ? th.seriesDark : th.series, mute = dark ? "#6E6A7A" : th.mute;
  const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${o.size || 11}" fill="${o.fill || ink2}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.bold ? ' font-weight="700"' : ""}>${escapeHtml(s)}</text>`;
  if (ch.kind === "col") {
    const h = 190, L = 34, R = 8, Tp = 22, B = 36;
    const pw = w - L - R, ph = h - Tp - B;
    const max = niceMax(Math.max(...ch.items.map(i => i.v)));
    const n = ch.items.length, band = pw / n, bw = Math.min(24, band * 0.62);
    const top = ch.items.reduce((a, it, i) => it.v > ch.items[a].v ? i : a, 0);
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
    for (const t of [0, max / 2, max]) {
      const y = Tp + ph - (t / max) * ph;
      s += `<line x1="${L}" x2="${w - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${grid}" stroke-width="1"/>`;
      s += T(L - 6, y + 4, Number.isInteger(t) ? String(t) : t.toFixed(1), { anchor: "end", size: 10 });
    }
    ch.items.forEach((it, i) => {
      const x = L + band * i + (band - bw) / 2;
      const bh = it.v ? Math.max(2, (it.v / max) * ph) : 0;
      const y = Tp + ph - bh;
      if (bh) s += `<path d="${colPath(x, y, bw, bh)}" fill="${it.mute ? mute : series}"/>`;
      if (i === top && it.v) s += T(x + bw / 2, y - 6, n0(it.v), { anchor: "middle", fill: ink, bold: true, size: 11 });
      s += T(L + band * i + band / 2, h - B + 15, it.label, { anchor: "middle", size: 10.5, fill: it.mute ? ink2 : ink });
      if (it.sub) s += T(L + band * i + band / 2, h - B + 28, it.sub, { anchor: "middle", size: 9.5 });
      s += `<rect data-i="${i}" x="${L + band * i}" y="${Tp}" width="${band}" height="${ph + 30}" fill="transparent"/>`;
    });
    return { svg: s + "</svg>", w, h };
  }
  // horizontal bars: the document on the left, the amount (as written) at the end of the bar
  const rowH = 26, L = Math.min(240, w * 0.32), R = 110, Tp = 6;
  const h = Tp + ch.items.length * rowH + 6;
  const max = Math.max(...ch.items.map(i => i.v));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
  s += `<line x1="${L}" x2="${L}" y1="${Tp}" y2="${h - 6}" stroke="${grid}" stroke-width="1"/>`;
  ch.items.forEach((it, i) => {
    const y = Tp + i * rowH, bh = 14;
    const bw = Math.max(2, (it.v / max) * (w - L - R));
    s += T(L - 10, y + rowH / 2 + 4, cut(it.label, Math.floor(L / 6.4)), { anchor: "end", size: 11, fill: ink });
    s += `<path d="${barPath(L, y + (rowH - bh) / 2, bw, bh)}" fill="${series}"/>`;
    s += T(L + bw + 7, y + rowH / 2 + 4, it.text || n0(it.v), { size: 11, fill: ink, bold: true });
    s += `<rect data-i="${i}" x="0" y="${y}" width="${w}" height="${rowH}" fill="transparent"/>`;
  });
  return { svg: s + "</svg>", w, h };
}

// the SVG as a PNG (twice the size, sharp in print)
export function svgPng(svg, w, h, scale = 2) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w * scale; c.height = h * scale;
      const g = c.getContext("2d");
      g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(async (b) => resolve(b ? new Uint8Array(await b.arrayBuffer()) : null), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
function imgSize(src) {
  return new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i.naturalWidth && i.naturalHeight ? { w: i.naturalWidth, h: i.naturalHeight } : null); i.onerror = () => resolve(null); i.src = src; });
}
export function b64(u8) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }

// the BindLens logo, small and still, as a PNG (the corner of the report, and its foot)
let logoPng = null;
export async function blLogoPng() {
  if (logoPng) return logoPng;
  const { logoSvg } = await import("../ui/Logo.jsx");
  logoPng = await svgPng(logoSvg(), 64, 64, 2);
  return logoPng;
}

// ---- the PDF: the page is A4 landscape; MuPDF lays out the HTML, then the worker draws the frame and the foot
const PW = 842, PH = 595, MT = 46, MB = 42, MS = 38;
const AW = PW - 2 * MS, AH = PH - MT - MB;
const ST_BG = { bad: ["#FDE7E7", "#9B1C1C"], warn: ["#FFF1D9", "#8A5300"], ok: ["#E4F3EA", "#1C6B3A"] };

function estLines(s, chars) { let n = 0; for (const part of String(s ?? "").split(/\n/)) n += Math.max(1, Math.ceil(part.length * 1.04 / chars)); return n; }

export async function reportPdfHtml(rep) {
  const th = repTheme();
  const sum = summaryOf(rep);
  const ch = chartOf(rep);
  const logo = await blLogoPng().catch(() => null);
  const css = `body{font-family:Helvetica,sans-serif;font-size:8pt;color:#1D1C22}
    table{border-collapse:collapse} .hd{width:100%;margin:0 0 6pt} .hd td{border:0;padding:0;vertical-align:middle}
    h1{font-size:17pt;margin:4pt 0 2pt;color:${th.accent}} .facts{color:#6B6878;font-size:7.5pt;margin:0 0 8pt}
    .sum{margin:0 0 9pt} .sum td{border:0;border-left:2.5pt solid ${th.rule};padding:1pt 18pt 1pt 7pt;vertical-align:top}
    .sum b{font-size:15pt;color:#1D1C22;display:block} .sum span{font-size:6.8pt;color:#6B6878}
    .t{width:100%;margin:0 0 8pt} .t td,.t th{border-bottom:0.5pt solid ${th.grid};padding:3pt 4pt;text-align:left;vertical-align:top}
    .t th{background:${th.soft};color:${th.accent};font-size:7.3pt;border-bottom:1.2pt solid ${th.rule}}
    .t tr.nw td{background:#EAF1FD} .t td.nw1{border-left:2pt solid ${NEW_BLUE}}
    h3{font-size:10pt;color:${th.accent};margin:8pt 0 3pt} .cont{color:#8A8796;font-size:7pt;font-weight:normal}
    .chart{margin:0 0 8pt} .chart p{margin:0} .ct{font-size:9pt;font-weight:bold;color:#1D1C22} .cs{font-size:7pt;color:#6B6878;margin:0 0 3pt}
    .newnote{font-size:7.3pt;color:${NEW_BLUE};margin:0 0 6pt} .muted{color:#6B6878}`;
  // the top: the institution (its logo and name) or the person, and BindLens small on the right
  const name = th.brand ? `<b style="color:${th.accent};font-size:10.5pt">${escapeHtml(th.name)}</b>` : th.person ? `<b style="font-size:10pt">${escapeHtml(th.person)}</b>` : "";
  const right = `${logo ? `<img src="data:image/png;base64,${b64(logo)}" style="width:10pt;height:10pt">&#160;` : ""}<span style="color:#8A8796;font-size:7.5pt">BindLens</span>`;
  // MuPDF wants the sizes in points: the logo keeps its own proportions, 28pt high (never wider than 150pt)
  let lw = 0, lh = 28;
  if (th.brand && th.logo) { const sz = await imgSize(th.logo); lw = sz ? Math.min(150, 28 * sz.w / sz.h) : 28; lh = lw === 150 && sz ? 150 * sz.h / sz.w : 28; }
  let h = `<table class="hd"><tr>${lw ? `<td style="width:${(lw + 10).toFixed(0)}pt"><img src="${th.logo}" style="width:${lw.toFixed(1)}pt;height:${lh.toFixed(1)}pt"></td>` : ""}<td>${name}</td><td style="text-align:right;width:70pt">${right}</td></tr></table>`;
  h += `<h1>${escapeHtml(rep.title)}</h1><p class="facts">${escapeHtml(factsOf(rep, th))}</p>`;
  let used = 66;
  if (sum.length) { h += `<table class="sum"><tr>${sum.map(x => `<td><b>${escapeHtml(x.v)}</b><span>${escapeHtml(x.l.toUpperCase())}</span></td>`).join("")}</tr></table>`; used += 38; }
  if (rep.newCount) { h += `<p class="newnote">&#9632; ${escapeHtml(_t(rep.newCount === 1 ? "{0} row is new since {1} - in blue." : "{0} rows are new since {1} - in blue.", rep.newCount, fmtDate(rep.newSince)))}</p>`; used += 14; }
  if (ch) {
    const { svg, w: cw, h: chh } = chartSvg(ch, th, { w: 760 });
    const png = await svgPng(svg, cw, chh, 2.5);
    if (png) {
      const wPt = Math.min(AW, cw * 0.8), hPt = chh * wPt / cw;
      h += `<div class="chart"><p class="ct">${escapeHtml(ch.title)}</p><p class="cs">${escapeHtml(ch.sub || "")}</p><img src="data:image/png;base64,${b64(png)}" style="width:${wPt.toFixed(0)}pt;height:${hPt.toFixed(0)}pt"></div>`;
      used += hPt + 26;
    }
  }
  if (rep.pictures) {
    for (const sc of rep.pictures) {
      h += `<h3>${escapeHtml(sc.title)}</h3>`;
      if (!sc.items.length) h += `<p class="muted">${_t("Not found.")}</p>`;
      for (const it of sc.items) {
        h += `<p style="margin:7pt 0 2pt;color:#6B6878;font-size:7.5pt">${escapeHtml(it.title)}</p>`;
        h += it.png ? `<p style="margin:0"><img src="data:image/png;base64,${b64(it.png)}" style="width:${Math.min(AW, Math.round(it.w || 500))}pt"></p>` : `<p>${escapeHtml(it.text || "")}</p>`;
      }
    }
    return { html: h, css, theme: th };
  }
  // the tables, cut where a page ends: the column titles come again at the top of every page
  const avail = AH - 6;
  let y = used, first = true;
  for (const s of sheetsOf(rep)) {
    if (!s.rows.length && !rep.tables) { h += `<p class="muted">${_t("Nothing found here.")}</p>`; continue; }
    const chars = colChars(s.header, s.rows);
    const tot = chars.reduce((a, c) => a + c, 0);
    const pct = chars.map(c => c / tot * 100);
    const cpl = pct.map(p => Math.max(4, (p / 100 * AW - 8.5) / 4.0));
    const hh = Math.max(...s.header.map((x, j) => estLines(x, cpl[j] * 1.08))) * 9.4 + 7;
    const rowH = (r) => Math.max(...r.cells.map((c, j) => estLines(c, cpl[j] || 10))) * 9.6 + 7.5;
    // MuPDF keeps widths in points (not in %): the width of each column, less its padding
    const head = `<tr>${s.header.map((x, j) => `<th style="width:${Math.max(12, pct[j] / 100 * AW - 8.5).toFixed(1)}pt">${escapeHtml(x)}</th>`).join("")}</tr>`;
    const titleH = rep.tables ? 22 : 0;
    const open = (cont, brk) => `${brk ? '<div style="page-break-after:always"></div><p style="margin:0;font-size:2pt">&#160;</p>' : ""}${rep.tables ? `<h3>${escapeHtml(s.name)}${cont ? ' <span class="cont">(continued)</span>' : ""}</h3>` : ""}<table class="t">${head}`;
    const firstH = s.rows.length ? rowH(s.rows[0]) : 0;
    let brk = !first && y + titleH + hh + firstH > avail;
    if (brk) y = 0;
    h += open(false, brk);
    y += titleH + hh;
    if (rep.tables && !s.rows.length) { h += `<tr><td class="muted">${_t("No rows.")}</td></tr>`; y += 17; }
    for (const r of s.rows) {
      const rh = rowH(r);
      if (y + rh > avail && y > titleH + hh + 1) { h += "</table>"; h += open(true, true); y = titleH + hh; }
      const cls = r.isNew ? ' class="nw"' : "";
      h += `<tr${cls}>${r.cells.map((c, j) => {
        let txt = escapeHtml(c);
        if (j === s.stAt && r.st && ST_BG[r.st]) txt = `<b style="color:${ST_BG[r.st][1]}">${txt}</b>`;
        const tdc = r.isNew && j === 0 ? ' class="nw1"' : "";
        const bg = j === s.stAt && r.st && ST_BG[r.st] && !r.isNew ? ` style="background:${ST_BG[r.st][0]}"` : "";
        return `<td${tdc}${bg}>${txt}</td>`;
      }).join("")}</tr>`;
      y += rh;
    }
    h += "</table>";
    y += 8;
    first = false;
  }
  return { html: h, css, theme: th };
}

// what the worker draws on every page: the frame in the colours, the title on top of the next pages, the foot
export async function reportPdfSpec(rep, th) {
  const logo = await blLogoPng().catch(() => null);
  const priv = rep.id === "privacy";
  return {
    frame: th.frame, line: th.brand ? th.line : "#CFCBD8",
    title: rep.title, right: th.brand ? th.name : th.person,
    foot: _t("Made with BindLens"), mid: priv ? _t("Confidential - personal data") : fmtDate(new Date()), alert: priv,
    logo: logo ? logo : null,
  };
}

// ---- the Excel file: a title, the facts, the figures, the column titles in colour, frozen, with filters
function argb(hex) { return "FF" + hex.replace("#", "").toUpperCase(); }
export async function reportXlsx(rep) {
  const mod = await import("exceljs/dist/exceljs.bare.min.js");
  const ExcelJS = mod.default || mod;
  const th = repTheme();
  const wb = new ExcelJS.Workbook();
  wb.creator = "BindLens"; wb.created = new Date();
  const used = new Set();
  const sum = summaryOf(rep).map(x => `${x.v} ${x.l.toLowerCase()}`).join("   ·   ");
  const facts = factsOf(rep, th) + (th.brand && th.name ? "   ·   " + th.name : "");
  const link = (go) => {
    if (!go || !store.value?.webLink) return "";
    for (const b of books.value) { const f = b.files.find(x => x.id === go.fileId); if (f) return store.value.webLink(f) || ""; }
    return "";
  };
  for (const s of sheetsOf(rep)) {
    let name = s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || _t("Rows");
    let k = 2;
    while (used.has(name.toLowerCase())) name = name.slice(0, 25) + " " + k++;
    used.add(name.toLowerCase());
    const nc = Math.max(1, s.header.length);
    const HR = 5;
    const ws = wb.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: HR, showGridLines: false }],
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${HR}:${HR}`, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.25 } },
      headerFooter: { oddFooter: `&L&8${_t("Made with BindLens")}&C&8${rep.id === "privacy" ? _t("Confidential - personal data") : "&D"}&R&8${_t("Page &P of &N")}`, oddHeader: `&L&8${(s.name || "").replace(/&/g, "&&").slice(0, 80)}&R&8${(th.brand ? th.name : th.person || "").replace(/&/g, "&&")}` },
      properties: { tabColor: { argb: argb(th.brand ? th.line : "#FF85C2") } },
    });
    const widths = colChars(s.header, s.rows);
    ws.columns = widths.map(w => ({ width: Math.round(Math.min(60, Math.max(9, w * 1.05))) }));
    ws.mergeCells(1, 1, 1, nc); ws.mergeCells(2, 1, 2, nc); ws.mergeCells(3, 1, 3, nc);
    const t = ws.getCell(1, 1); t.value = rep.tables ? s.name : rep.title; t.font = { name: "Calibri", size: 16, bold: true, color: { argb: argb(th.accent) } };
    ws.getRow(1).height = 26;
    const f2 = ws.getCell(2, 1); f2.value = rep.tables ? rep.title + "   ·   " + facts : facts; f2.font = { name: "Calibri", size: 9, color: { argb: "FF6B6878" } };
    const f3 = ws.getCell(3, 1); f3.value = sum + (rep.newCount ? "   ·   " + _t("{0} new since {1} (in blue)", rep.newCount, fmtDate(rep.newSince)) : ""); f3.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF3B3946" } };
    const hr = ws.getRow(HR);
    hr.values = s.header;
    hr.height = 20;
    hr.eachCell((c) => {
      c.font = { name: "Calibri", size: 10, bold: true, color: { argb: argb(th.accent) } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(th.soft) } };
      c.border = { bottom: { style: "medium", color: { argb: argb(th.rule) } } };
      c.alignment = { vertical: "middle", wrapText: true };
    });
    const ST = { bad: ["FFFDE7E7", "FF9B1C1C"], warn: ["FFFFF1D9", "FF8A5300"], ok: ["FFE4F3EA", "FF1C6B3A"] };
    s.rows.forEach((r, i) => {
      const row = ws.getRow(HR + 1 + i);
      row.values = r.cells.map(c => { const v = String(c ?? ""); return /^-?\d+(\.\d+)?$/.test(v) && v.length < 12 && !/^0\d/.test(v) ? Number(v) : v; });
      row.eachCell({ includeEmpty: true }, (c, j) => {
        c.font = { name: "Calibri", size: 10, color: { argb: "FF1D1C22" } };
        c.alignment = { vertical: "top", wrapText: widths[j - 1] > 24 };
        c.border = { bottom: { style: "thin", color: { argb: argb(th.grid) } } };
        if (r.isNew) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF1FD" } };
        if (j - 1 === s.stAt && r.st && ST[r.st]) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ST[r.st][0] } }; c.font = { name: "Calibri", size: 10, bold: true, color: { argb: ST[r.st][1] } }; }
      });
      if (r.isNew) ws.getCell(HR + 1 + i, 1).border = { left: { style: "thick", color: { argb: argb(NEW_BLUE) } }, bottom: { style: "thin", color: { argb: argb(th.grid) } } };
      if (s.docAt >= 0) { const u = link(r.go); if (u) { const c = ws.getCell(HR + 1 + i, s.docAt + 1); c.value = { text: String(r.cells[s.docAt] || "open"), hyperlink: u }; c.font = { name: "Calibri", size: 10, color: { argb: "FF1F5FBF" }, underline: true }; } }
    });
    if (s.rows.length) ws.autoFilter = { from: { row: HR, column: 1 }, to: { row: HR + s.rows.length, column: nc } };
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
