// Reports: what you need from your documents, as rows - exactly as it is written. Names, emails, phones, tables...
// Nothing is summarised or rewritten: every row says where it comes from, and a click takes you there.
import { wordsOf, allMarks } from "../docs.js";
import { store } from "../state.js";
import { pageTables } from "./rows.js";
import { RE, allMatches, cleanPhone, looksLikeName, NAME_IN_TEXT, NAME_HDR, ORG_HDR, EMAIL_HDR, PHONE_HDR, ADDR_HDR,
  parseDatesAt, deadlineDates, amountValue } from "./patterns.js";
import { sheetRows } from "../engine/office.js";
import { isPaged, fmtDate, ext, daysBetween, fmtSize } from "../util.js";
import { status } from "./dates.js";

export const REPORTS = [
  { id: "contacts", title: "People & contacts", icon: "people", desc: "Everyone with their email, phone and address, from any table or text." },
  { id: "tables", title: "All tables", icon: "table", desc: "Every table exactly as it is, with its column titles - ready for Excel." },
  { id: "deadlines", title: "Deadlines", icon: "clock", desc: "Renewals, due dates, 'valid until', deadlines - and how long is left." },
  { id: "rows", title: "Rows with a name or value", icon: "table", desc: "Every table row (and line) with the names or values you write, with its own columns and column titles, exactly as it is - one section for each.", ask: "Names or values, with commas between them" },
  { id: "snapshot", title: "Rows as they look", icon: "image", desc: "The same rows as pictures, exactly as they look in each file, with the table's column titles over them.", ask: "Names or values, with commas between them" },
  { id: "columns", title: "Columns from every table", icon: "table", desc: "The columns you name (e.g. Name, Email) from every table that has them, row by row, as they are.", ask: "Column titles, with commas between them" },
  { id: "forms", title: "Form answers", icon: "list", desc: "Every 'Label: answer' line of your forms and documents, as it is written: one row each." },
  { id: "status", title: "Status of files", icon: "check", desc: "Every file with its status (Pending, Checked, Signed, Done...), book by book." },
  { id: "privacy", title: "Personal data (GDPR)", icon: "lock", desc: "PPS numbers, bank accounts (IBAN), card numbers, dates of birth, emails and phones - each with its line and where it is." },
  { id: "health", title: "Document health", icon: "info", desc: "Scanned pages without words, empty pages, very big files, files that cannot be opened - file by file." },
  { id: "duplicates", title: "Duplicates", icon: "copy", desc: "The same file twice, and the same row in several places." },
  { id: "find", title: "Find a word or a name", icon: "search", desc: "Every line where it appears.", ask: "The word or the name" },
  { id: "person", title: "Everything about one person", icon: "people", desc: "Every place a person appears, with the emails and phones next to them.", ask: "The person's name" },
  { id: "money", title: "Invoices & money", icon: "money", desc: "Each amount with its line: totals, prices, what is due." },
  { id: "marks", title: "My highlights & notes", icon: "highlighter", desc: "Everything you marked, by document." },
  { id: "Emails", title: "Emails", icon: "at", desc: "Every email address, with the line it is in." },
  { id: "Phones", title: "Phone numbers", icon: "phone", desc: "Every phone and mobile number." },
  { id: "Names", title: "Names of people", icon: "people", desc: "Every person named in your documents." },
  { id: "Addresses", title: "Addresses & postcodes", icon: "map", desc: "Street addresses, Eircodes and postcodes." },
  { id: "Dates", title: "All dates", icon: "calendar", desc: "Every date, in order." },
  { id: "IDs", title: "IDs & reference numbers", icon: "hash", desc: "Invoice, order and reference numbers, IBAN." },
  { id: "Companies", title: "Companies & organisations", icon: "building", desc: "Companies, universities, councils, banks..." },
  { id: "Links", title: "Links & websites", icon: "link", desc: "Every web address." },
];

// ---- reading a file into pages of rows and tables
const cache = new Map();

async function readFile(file) {
  const key = file.id + ":" + (file.md5 || file.modified);
  if (cache.has(key)) return cache.get(key);
  let out;
  if (file.kind === "excel") {
    // a spreadsheet: its rows exactly as they are, each sheet a table
    const buf = await store.value.read(file);
    const sheets = await sheetRows(buf, file.name);
    out = { pages: sheets.map(s => {
      const [header, ...rows] = s.rows;
      const r = s.rows.map(cells => ({ text: cells.filter(c => String(c).trim()).join("   "), cells: cells.map(String), header }));
      return { rows: r, tables: [{ header: header.map(String), rows: rows.map(x => x.map(String)), sheet: s.sheet }] };
    }) };
  } else if (isPaged(file.kind) && file.kind !== "image") {
    const w = await wordsOf(file);
    const ctx = {};
    out = { pages: (w.words || []).map((pw, i) => {
      const pt = pageTables(pw, ctx);
      // the plain text keeps lines that the word positions may split (scanned words added later, too)
      if (!pt.rows.length && w.pages[i]) pt.rows = w.pages[i].split(/\n+/).filter(s => s.trim()).map(t => ({ text: t }));
      return pt;
    }) };
  } else out = { pages: [] };
  cache.set(key, out);
  return out;
}

function filesIn(scope) {
  return scope.flatMap(b => b.files.map(f => ({ b, f })));
}

function where(b, f, page, q) { return { bookId: b.id, fileId: f.id, page, q }; }

function docName(f) { return f.name.replace(/\.[^.]+$/, ""); }

// ---- the reports
async function contacts(scope, progress) {
  const rows = [];
  const seen = new Set();
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
      // 1. tables with names / emails / phones columns: the row as it is
      for (const t of pg.tables) {
        const h = t.header || [];
        const col = (re) => h.findIndex(x => re.test(x || ""));
        let ci = { name: col(NAME_HDR), email: col(EMAIL_HDR), phone: col(PHONE_HDR), addr: col(ADDR_HDR), org: col(ORG_HDR) };
        if (ci.email < 0 && ci.phone < 0) {
          // no titles: find the columns by what they hold
          const sample = t.rows.slice(0, 8);
          const by = (test) => { for (let j = 0; j < (sample[0] || []).length; j++) if (sample.filter(r => test(r[j] || "")).length >= Math.ceil(sample.length * 0.6)) return j; return -1; };
          ci = { name: by(looksLikeName), email: by(s => /@/.test(s)), phone: by(s => !!cleanPhone(s) && allMatches(RE.Phones, s).length > 0), addr: -1, org: -1 };
          if (ci.email < 0 && ci.phone < 0) continue;
        }
        for (const r of t.rows) {
          const get = (j) => j >= 0 ? (r[j] || "").trim() : "";
          const row = [get(ci.name), get(ci.email), get(ci.phone), get(ci.addr), get(ci.org)];
          if (!row[1] && !row[2]) continue;
          const k = row.join("|").toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          rows.push({ cells: [...row, docName(f), String(page + 1)], go: where(b, f, page, row[1] || row[2] || row[0]) });
        }
      }
      // 2. text: an email or a phone on a line, and the name next to it
      const tableRows = new Set(pg.rows.filter(r => r.cells || r.isHeader));
      pg.rows.forEach((r, i) => {
        if (tableRows.has(r)) return;
        const text = r.text || "";
        const emails = allMatches(RE.Emails, text).map(m => m.v);
        const phones = allMatches(RE.Phones, text).map(m => cleanPhone(m.v)).filter(Boolean)
          .filter(p => !parseDatesAt(p).length);
        if (!emails.length && !phones.length) return;
        const near = [text, pg.rows[i - 1]?.text || ""].join("   ");
        const names = allMatches(NAME_IN_TEXT, near).map(m => m.v.trim()).filter(looksLikeName);
        const addr = allMatches(RE.Addresses, near).map(m => m.v.trim())[0] || "";
        const row = [names[0] || "", emails.join(", "), phones.join(", "), addr, ""];
        const k = row.join("|").toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        rows.push({ cells: [...row, docName(f), String(page + 1)], go: where(b, f, page, emails[0] || phones[0]) });
      });
    });
  }
  return { columns: ["Name", "Email", "Phone", "Address", "Company", "Document", "Page"], rows: dropEmptyColumns(rows, 5) };
}

function dropEmptyColumns(rows, upTo) {
  // a column nobody has (e.g. no addresses at all) is left out of the report
  return rows;
}

async function tables(scope, progress) {
  const out = [];
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
      pg.tables.forEach((t, k) => {
        if (!t.rows.length) return;
        out.push({ title: `${docName(f)}${t.sheet ? " · " + t.sheet : pages.length > 1 ? " · page " + (page + 1) : ""}${pg.tables.length > 1 ? " · table " + (k + 1) : ""}`,
          header: t.header, rows: t.rows, go: where(b, f, page, (t.rows[0] || [])[0]) });
      });
    });
  }
  // tables with the same column titles go together (a list that goes on over several pages)
  const joined = [];
  for (const t of out) {
    const last = joined[joined.length - 1];
    if (last && t.header && last.header && t.header.join("|") === last.header.join("|") && last.go.fileId === t.go.fileId) last.rows.push(...t.rows);
    else joined.push({ ...t, rows: [...t.rows] });
  }
  return { tables: joined };
}

async function deadlines(scope, progress) {
  const rows = [];
  const today = new Date();
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
      pg.rows.forEach((r, i) => {
        const prev = pg.rows[i - 1]?.text || "";
        const text = r.cells ? r.text : (prev ? prev + "   " + r.text : r.text);
        const off = r.cells ? 0 : (prev ? prev.length + 3 : 0);
        for (const d of deadlineDates({ text, cells: r.cells, header: r.header })) {
          if (!r.cells && d.at < off) continue;
          const days = daysBetween(today, d.date);
          rows.push({ date: d.date, cells: [fmtDate(d.date), status(days).text, d.what || "Date", r.text, docName(f), String(page + 1)], st: status(days).cls, go: where(b, f, page, d.text) });
        }
      });
    });
  }
  rows.sort((a, c) => a.date - c.date);
  const seen = new Set();
  return { columns: ["Date", "When", "What", "The line", "Document", "Page"], rows: rows.filter(r => { const k = r.cells.join("|"); if (seen.has(k)) return false; seen.add(k); return true; }) };
}

async function findWord(scope, progress, q) {
  const rows = [];
  const nq = q.toLowerCase();
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    if (f.name.toLowerCase().includes(nq)) rows.push({ cells: [docName(f), "", "(in the name of the document)", b.name], go: where(b, f, 0) });
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
      for (const r of pg.rows) if ((r.text || "").toLowerCase().includes(nq)) rows.push({ cells: [docName(f), String(page + 1), r.text, b.name], go: where(b, f, page, q) });
    });
  }
  return { columns: ["Document", "Page", "The line", "Book"], rows };
}

// rows with a name or value: every table row that has it (its cells and the table's titles), and every line
function valuesOf(q) { return q.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean); }
function hasValue(text, v) {
  const t = (text || "").toLowerCase(), x = v.toLowerCase();
  if (/^[\p{L}\p{N}]/u.test(x) && /[\p{L}\p{N}]$/u.test(x)) {
    const re = new RegExp("(^|[^\\p{L}\\p{N}])" + x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^\\p{L}\\p{N}])", "u");
    return re.test(t);
  }
  return t.includes(x);
}
async function rowsFound(scope, progress, q) {
  const values = valuesOf(q);
  const found = [];   // {v, b, f, page, r, t}
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
      if (f.kind === "excel") {
        for (const t of pg.tables) for (const cells of t.rows) for (const v of values) if (cells.some(c => hasValue(c, v))) found.push({ v, b, f, page, cells, header: t.header, sheet: t.sheet });
        return;
      }
      for (const r of pg.rows) {
        if (r.isHeader) continue;
        for (const v of values) if (hasValue(r.text, v)) found.push({ v, b, f, page, r, cells: r.cells || null, header: r.header || null, t: r.table || null });
      }
    });
  }
  return { values, found };
}

function totalsRow(header, rows) {
  // add up the columns of hours, fees, amounts... when every row has a number there
  if (rows.length < 2) return null;
  const n = Math.max(...rows.map(r => r.length));
  const tot = Array(n).fill("");
  let any = false;
  for (let j = 1; j < n; j++) {
    const vals = rows.map(r => amountValue(String(r[j] || "")));
    const h = (header && header[j]) || "";
    if (vals.every(v => v != null) && (SUM_HDR.test(h) || /hour|hrs|qty|quantity|units|days|horas/i.test(h))) { tot[j] = String(Math.round(vals.reduce((a, c) => a + c, 0) * 100) / 100); any = true; }
  }
  if (!any) return null;
  tot[0] = "Total";
  return tot;
}

async function rowsWith(scope, progress, q) {
  const { values, found } = await rowsFound(scope, progress, q);
  const tables = [];
  for (const v of values) {
    const mine = found.filter(x => x.v === v);
    // one table for each source table (same file and same column titles); lines on their own go in one list
    const groups = new Map();
    for (const x of mine) {
      const key = x.cells ? `${x.f.id}|${x.sheet || ""}|${(x.header || []).join("|")}|${x.cells.length}` : `${x.f.id}|lines`;
      if (!groups.has(key)) groups.set(key, { x, rows: [], pages: new Set() });
      const g = groups.get(key);
      g.rows.push(x.cells ? [...x.cells] : [x.r.text]);
      g.pages.add(x.page + 1);
    }
    for (const g of groups.values()) {
      const { x } = g;
      const header = x.cells ? (x.header || x.cells.map((_, j) => "Column " + (j + 1))) : ["The line"];
      const rows = [...g.rows];
      const tot = x.cells ? totalsRow(header, rows) : null;
      if (tot) rows.push(tot);
      tables.push({ title: `${v} · ${docName(x.f)}${x.sheet ? " · " + x.sheet : ""} · page ${[...g.pages].join(", ")}`, header, rows, go: where(x.b, x.f, x.page, v) });
    }
    if (!mine.length) tables.push({ title: `${v} · not found`, header: ["The line"], rows: [], go: null });
  }
  return { tables };
}

async function rowPictures(scope, progress, q) {
  const { values, found } = await rowsFound(scope, progress, q);
  const { readOnce, call } = await import("../docs.js");
  const sections = [];
  for (const v of values) {
    const items = [];
    for (const x of found.filter(y => y.v === v)) {
      if (!x.r) { items.push({ title: `${docName(x.f)}${x.sheet ? " · " + x.sheet : ""}`, text: x.cells.join("   "), go: where(x.b, x.f, x.page, v) }); continue; }
      const r = x.r, t = x.t;
      const X0 = (t ? t.x0 : r.x0) - 6, X1 = (t ? t.x1 : r.x1) + 6;
      const rects = [];
      if (t && t.headerRow) rects.push([X0, t.headerRow.y - 3, X1, t.headerRow.y1 + 3]);
      rects.push([X0, r.y - 3, X1, r.y1 + 3]);
      try {
        const png = await readOnce(x.f, (key) => call("clip", key, x.page, rects, 2));
        items.push({ title: `${docName(x.f)} · page ${x.page + 1}`, png, text: r.text, w: X1 - X0, go: where(x.b, x.f, x.page, v) });
      } catch (e) { items.push({ title: `${docName(x.f)} · page ${x.page + 1}`, text: r.text, go: where(x.b, x.f, x.page, v) }); }
    }
    sections.push({ title: v, items });
  }
  return { pictures: sections };
}

async function columnsFrom(scope, progress, q) {
  const want = valuesOf(q).map(x => x.toLowerCase());
  const rows = [];
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
      for (const t of pg.tables) {
        const h = (t.header || []).map(x => String(x || "").toLowerCase().trim());
        const idx = want.map(w => h.findIndex(x => x === w || x.includes(w)));
        if (idx.every(j => j < 0)) continue;
        for (const r of t.rows) {
          const cells = idx.map(j => j >= 0 ? String(r[j] ?? "").trim() : "");
          if (!cells.some(Boolean)) continue;
          rows.push({ cells: [...cells, docName(f), String(page + 1)], go: where(b, f, page, cells.find(Boolean)) });
        }
      }
    });
  }
  return { columns: [...valuesOf(q), "Document", "Page"], rows };
}

const LABEL_RE = /^\s*([\p{Lu}\p{N}][\p{L}\p{N} .'()/&-]{0,40}?)\s*[:：]\s*(.+)$/u;
async function forms(scope, progress) {
  const rows = [];
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
      for (const r of pg.rows) {
        if (r.cells) {
          // a two-column table of labels and answers
          if (r.cells.length === 2 && r.cells[0] && r.cells[0].length <= 40 && !/\d{3,}/.test(r.cells[0])) rows.push({ cells: [r.cells[0].replace(/[:：]\s*$/, ""), r.cells[1], docName(f), String(page + 1)], go: where(b, f, page, r.cells[0]) });
          continue;
        }
        // "Label: answer", and several on one line ("Client: Harbour Cafe   Contact: Aoife Byrne")
        for (const part of (r.text || "").split(/\s{3,}|(?<=[.;])\s+(?=[\p{Lu}][\p{L}\p{N} ]{0,30}[:：])/u)) {
          const m = LABEL_RE.exec(part);
          if (m && !/^https?$/i.test(m[1]) && m[1].trim().split(/\s+/).length <= 5 && !/^\d+$/.test(m[1].trim())) rows.push({ cells: [m[1].trim(), m[2].trim(), docName(f), String(page + 1)], go: where(b, f, page, m[1]) });
        }
      }
    });
  }
  return { columns: ["Label", "Answer", "Document", "Page"], rows };
}

async function statusReport(scope) {
  const { statusOf } = await import("../state.js");
  const rows = [];
  for (const b of scope) for (const f of b.files) rows.push({ cells: [f.name, f.sub ? b.name + " / " + f.sub : b.name, statusOf(f.id) || "No status", f.modified ? fmtDate(new Date(f.modified)) : ""], go: where(b, f, 0) });
  return { columns: ["File", "Book", "Status", "Changed"], rows };
}

// two documents side by side: the lines only in one, only in the other, and the lines changed (not AI: line by line)
export async function compareDocs(a, b) {
  const linesOf = async (f) => {
    const { pages } = await readFile(f.file);
    const out = [];
    pages.forEach((pg, page) => { for (const r of pg.rows) { const t = (r.text || "").replace(/\s+/g, " ").trim(); if (t) out.push({ t, page }); } });
    return out;
  };
  const A = await linesOf(a), B = await linesOf(b);
  const n = A.length, m = B.length;
  const rows = [];
  const push = (kind, x, y) => rows.push({ cells: [kind, x ? x.t : "", y ? y.t : "", x ? String(x.page + 1) : "", y ? String(y.page + 1) : ""],
    go: x ? where(a.book, a.file, x.page, x.t.slice(0, 40)) : where(b.book, b.file, y.page, y.t.slice(0, 40)) });
  if (n * m <= 4e6) {
    // the longest run of lines in common (LCS), then what is left on each side
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i].t === B[j].t ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    const gone = [], added = [];
    const flush = () => {
      // a line taken out and one put in its place are "changed" only when they are alike (half their words the same)
      const words = (t) => new Set(t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
      const alike = (x, y) => { const a1 = words(x.t), b1 = words(y.t); let c = 0; for (const w of a1) if (b1.has(w)) c++; return c / Math.max(1, Math.max(a1.size, b1.size)) >= 0.5; };
      let gi = 0, ai = 0;
      while (gi < gone.length || ai < added.length) {
        if (gi < gone.length && ai < added.length && alike(gone[gi], added[ai])) { push("Changed", gone[gi++], added[ai++]); continue; }
        if (gi < gone.length) push("Only in the first", gone[gi++], null);
        else push("Only in the second", null, added[ai++]);
      }
      gone.length = 0; added.length = 0;
    };
    while (i < n || j < m) {
      if (i < n && j < m && A[i].t === B[j].t) { flush(); i++; j++; }
      else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) added.push(B[j++]);
      else gone.push(A[i++]);
    }
    flush();
  } else {
    const sa = new Set(A.map(x => x.t)), sb = new Set(B.map(x => x.t));
    for (const x of A) if (!sb.has(x.t)) push("Only in the first", x, null);
    for (const y of B) if (!sa.has(y.t)) push("Only in the second", null, y);
  }
  return { columns: ["What", a.file.name.replace(/\.[^.]+$/, ""), b.file.name.replace(/\.[^.]+$/, ""), "Page", "Page"], rows,
    same: rows.length === 0 };
}

// personal data, for GDPR: what it is, the value, its line, where
function luhn(d) { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let x = +d[i]; if (alt) { x *= 2; if (x > 9) x -= 9; } s += x; alt = !alt; } return s % 10 === 0; }
const PPS_RE = /\b\d{7}[A-W][A-IW]?\b/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const DOB_RE = /\b(?:d\.?o\.?b\.?|date of birth|born|birth date|fecha de nacimiento)\b/i;
async function personalData(scope, progress) {
  const rows = [];
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
      pg.rows.forEach((r, i) => {
        const text = r.text || "";
        const add = (what, v) => rows.push({ cells: [what, v, text, docName(f), String(page + 1)], go: where(b, f, page, v) });
        for (const m of allMatches(PPS_RE, text)) add("PPS number", m.v);
        for (const m of allMatches(IBAN_RE, text)) if (/\d{6,}/.test(m.v.replace(/ /g, ""))) add("Bank account (IBAN)", m.v);
        for (const m of allMatches(CARD_RE, text)) { const d = m.v.replace(/\D/g, ""); if (d.length >= 13 && d.length <= 19 && luhn(d) && !/^0+$/.test(d)) add("Card number", m.v.trim()); }
        const hdrDob = r.cells && r.header ? r.header.findIndex(h => DOB_RE.test(h || "")) : -1;
        if (hdrDob >= 0 && r.cells[hdrDob]) add("Date of birth", r.cells[hdrDob]);
        else if (DOB_RE.test(text) || DOB_RE.test(pg.rows[i - 1]?.text || "")) for (const d of parseDatesAt(text)) add("Date of birth", d.text);
        for (const m of allMatches(RE.Emails, text)) add("Email", m.v);
        for (const m of allMatches(RE.Phones, text)) { const p = cleanPhone(m.v); if (p && !parseDatesAt(p).length) add("Phone", p); }
      });
    });
  }
  return { columns: ["What", "The value", "The line", "Document", "Page"], rows };
}

async function health(scope, progress) {
  const rows = [];
  const list = filesIn(scope);
  const { readOnce, call } = await import("../docs.js");
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const notes = [];
    let pagesN = "";
    if (f.size && f.size > 20e6) notes.push(`Very big (${Math.round(f.size / 1e6)} MB): Make this file smaller`);
    if (isPaged(f.kind) && f.kind !== "image") {
      try {
        const w = await wordsOf(f);
        pagesN = String(w.pages.length);
        const scanned = [], empty = [];
        if (f.kind === "pdf") {
          await readOnce(f, async (key) => {
            for (let i = 0; i < w.pages.length; i++) {
              if ((w.pages[i] || "").trim()) continue;
              if (w.ocr && w.ocr[i]) continue;
              const has = await call("hasText", key, i);
              if (!has) { const png = await call("pagePng", key, i, 0.08); (png.length < 900 ? empty : scanned).push(i + 1); }
            }
          });
        } else w.pages.forEach((t, i) => { if (!(t || "").trim()) empty.push(i + 1); });
        if (scanned.length) notes.push(`Scanned pages without words: ${scanned.join(", ")} (Read the words of its scanned pages)`);
        if (empty.length) notes.push(`Empty pages: ${empty.join(", ")}`);
      } catch (e) { notes.push("Cannot be opened: " + (e.message || e)); }
    }
    rows.push({ cells: [f.name, b.name, pagesN, f.size ? fmtSize(f.size) : "", notes.length ? notes.join(" · ") : "All right"], go: where(b, f, 0) });
  }
  rows.sort((a, c) => (a.cells[4] === "All right") - (c.cells[4] === "All right"));
  return { columns: ["File", "Book", "Pages", "Size", "What to look at"], rows };
}

async function duplicates(scope, progress) {
  const rows = [];
  const list = filesIn(scope);
  // the same file twice (same contents), or the same name in two books
  const byMd5 = new Map();
  for (const { b, f } of list) if (f.md5) { if (!byMd5.has(f.md5)) byMd5.set(f.md5, []); byMd5.get(f.md5).push({ b, f }); }
  for (const g of byMd5.values()) if (g.length > 1) for (const { b, f } of g) rows.push({ cells: ["The same file", f.name, `${g.length} copies: ${g.map(x => x.b.name).join(", ")}`, b.name, ""], go: where(b, f, 0) });
  // the same row in several places (tables only, at least 3 words)
  const seen = new Map();
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
      for (const r of pg.rows) {
        if (!r.cells || r.text.split(/\s+/).length < 3) continue;
        const k = r.text.replace(/\s+/g, " ").trim().toLowerCase();
        if (!seen.has(k)) seen.set(k, []);
        seen.get(k).push({ b, f, page, text: r.text });
      }
    });
  }
  for (const g of seen.values()) if (g.length > 1) for (const x of g) rows.push({ cells: ["The same row", x.text, `${g.length} times`, docName(x.f), String(x.page + 1)], go: where(x.b, x.f, x.page, x.text.slice(0, 40)) });
  return { columns: ["What", "Which", "How many", "Where", "Page"], rows };
}

async function person(scope, progress, q) {
  const rows = [];
  const parts = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
      pg.rows.forEach((r, i) => {
        const t = (r.text || "").toLowerCase();
        if (!parts.every(p => t.includes(p))) return;
        const near = [r.text, pg.rows[i + 1]?.cells ? "" : pg.rows[i + 1]?.text || ""].join("   ");
        const emails = allMatches(RE.Emails, near).map(m => m.v).join(", ");
        const phones = allMatches(RE.Phones, near).map(m => cleanPhone(m.v)).filter(Boolean).join(", ");
        const dates = parseDatesAt(r.text).map(d => fmtDate(d.date)).join(", ");
        rows.push({ cells: [docName(f), String(page + 1), r.text, emails, phones, dates], go: where(b, f, page, q) });
      });
    });
  }
  return { columns: ["Document", "Page", "The line", "Email", "Phone", "Dates"], rows };
}

const SUM_HDR = /\b(amount|total|cost|price|paid|due|balance|fee|fees|charge|importe|precio)\b|€|\$|£|eur\b/i;

async function money(scope, progress) {
  const rows = [];
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
      // a table with an Amount / Total / Price column: each of its numbers, with the row it is in
      for (const t of pg.tables) {
        const cols = (t.header || []).map((h, j) => SUM_HDR.test(h || "") ? j : -1).filter(j => j >= 0);
        for (const r of t.rows) for (const j of cols) {
          const v = String(r[j] || "").trim();
          if (!/\d/.test(v) || allMatches(RE.Amounts, v).length) continue;
          rows.push({ cells: [v, t.header[j], r.filter(c => String(c).trim()).join("   "), docName(f), String(page + 1)], value: amountValue(v), go: where(b, f, page, v) });
        }
      }
      for (const r of pg.rows) {
        for (const m of allMatches(RE.Amounts, r.text || "")) {
          const kind = /total/i.test(r.text) ? "Total" : /due|owed|balance|pay/i.test(r.text) ? "Due" : /budget/i.test(r.text) ? "Budget" : "";
          rows.push({ cells: [m.v.trim(), kind, r.text, docName(f), String(page + 1)], value: amountValue(m.v), go: where(b, f, page, m.v.trim()) });
        }
      }
    });
  }
  return { columns: ["Amount", "Kind", "The line", "Document", "Page"], rows };
}

async function marks(scope, progress) {
  const rows = [];
  const names = { Highlight: "Highlight", Underline: "Underline", StrikeOut: "Strike-out", Squiggly: "Wavy line", Ink: "Drawing", FreeText: "Text", Text: "Note", Square: "Box", Circle: "Circle", Line: "Line", Stamp: "Stamp" };
  const list = filesIn(scope).filter(x => x.f.kind === "pdf");
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    try {
      for (const m of await allMarks(f)) {
        rows.push({ cells: [docName(f), String(m.page + 1), m.subject && m.type === "FreeText" ? m.subject : names[m.type] || m.type, m.text || m.contents || "", m.modified ? fmtDate(new Date(m.modified)) : ""], go: where(b, f, m.page) });
      }
    } catch (e) {}
  }
  return { columns: ["Document", "Page", "Mark", "The words", "Date"], rows };
}

async function extract(kind, scope, progress) {
  const rows = [];
  const seen = new Set();
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
      for (const r of pg.rows) {
        const text = r.text || "";
        let vals = [];
        if (kind === "Names") {
          // names in a 'Name' column, or names in the text
          if (r.cells && r.header) r.header.forEach((h, j) => { if (NAME_HDR.test(h || "") && looksLikeName(r.cells[j] || "")) vals.push(r.cells[j].trim()); });
          else vals = allMatches(NAME_IN_TEXT, text).map(m => m.v.trim()).filter(looksLikeName);
        } else if (kind === "Phones") vals = allMatches(RE.Phones, text).map(m => cleanPhone(m.v)).filter(Boolean).filter(p => !parseDatesAt(p).length);
        else if (kind === "Dates") vals = parseDatesAt(text).map(d => ({ v: d.text, date: d.date }));
        else if (kind === "IDs") vals = allMatches(RE.IDs, text).map(m => (m.g[1] || m.v).trim()).filter(v => /\d/.test(v) && !parseDatesAt(v).length && v.replace(/\D/g, "").length >= 3);
        else vals = allMatches(RE[kind], text).map(m => m.v.trim().replace(/[.,;:]$/, ""));
        for (const v of vals) {
          const val = typeof v === "string" ? v : v.v;
          const k = val.toLowerCase() + "|" + f.id + "|" + page;
          if (seen.has(k)) continue;
          seen.add(k);
          rows.push({ cells: [val, text, docName(f), String(page + 1)], date: v.date, go: where(b, f, page, val) });
        }
      }
    });
  }
  if (kind === "Dates") rows.sort((a, c) => a.date - c.date);
  const label = { Emails: "Email", Phones: "Phone", Names: "Name", Addresses: "Address", Dates: "Date", IDs: "Number", Companies: "Company", Links: "Link" }[kind] || kind;
  return { columns: [label, "The line", "Document", "Page"], rows };
}

export async function runReport(id, scope, { q = "", progress = () => {} } = {}) {
  switch (id) {
    case "contacts": return contacts(scope, progress);
    case "tables": return tables(scope, progress);
    case "deadlines": return deadlines(scope, progress);
    case "find": return findWord(scope, progress, q);
    case "rows": return rowsWith(scope, progress, q);
    case "columns": return columnsFrom(scope, progress, q);
    case "forms": return forms(scope, progress);
    case "status": return statusReport(scope);
    case "privacy": return personalData(scope, progress);
    case "health": return health(scope, progress);
    case "duplicates": return duplicates(scope, progress);
    case "snapshot": return rowPictures(scope, progress, q);
    case "person": return person(scope, progress, q);
    case "money": return money(scope, progress);
    case "marks": return marks(scope, progress);
    default: return extract(id, scope, progress);
  }
}

export { ext };
