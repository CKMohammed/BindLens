// Reports: what you need from your documents, as rows - exactly as it is written. Names, emails, phones, tables...
// Nothing is summarised or rewritten: every row says where it comes from, and a click takes you there.
import { wordsOf, allMarks } from "../docs.js";
import { store } from "../state.js";
import { pageTables } from "./rows.js";
import { RE, allMatches, cleanPhone, looksLikeName, NAME_IN_TEXT, NAME_HDR, ORG_HDR, EMAIL_HDR, PHONE_HDR, ADDR_HDR,
  parseDatesAt, deadlineDates, amountValue } from "./patterns.js";
import { sheetRows } from "../engine/office.js";
import { isPaged, fmtDate, ext, daysBetween } from "../util.js";
import { status } from "./dates.js";

export const REPORTS = [
  { id: "contacts", title: "People & contacts", icon: "people", desc: "Everyone with their email, phone and address, from any table or text." },
  { id: "tables", title: "All tables", icon: "table", desc: "Every table exactly as it is, with its column titles - ready for Excel." },
  { id: "deadlines", title: "Deadlines", icon: "clock", desc: "Renewals, due dates, 'valid until', deadlines - and how long is left." },
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

async function money(scope, progress) {
  const rows = [];
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
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
    case "person": return person(scope, progress, q);
    case "money": return money(scope, progress);
    case "marks": return marks(scope, progress);
    default: return extract(id, scope, progress);
  }
}

export { ext };
