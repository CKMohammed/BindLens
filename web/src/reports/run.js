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
import { _t, _tv } from "../i18n.js";

export const REPORTS = [
  { id: "contacts", title: _t("People & contacts"), icon: "people", desc: _t("Everyone with their email, phone and address, from any table or text.") },
  { id: "tables", title: _t("All tables"), icon: "table", desc: _t("Every table exactly as it is, with its column titles - ready for Excel.") },
  { id: "deadlines", title: _t("Deadlines"), icon: "clock", desc: _t("Renewals, due dates, 'valid until', deadlines - and how long is left.") },
  { id: "rows", exact: true, title: _t("Rows with a name or value"), icon: "table", desc: _t("Every table row (and line) with the names or values you write, with its own columns and column titles, exactly as it is - one section for each."), ask: _t("Names or values, with commas between them") },
  { id: "snapshot", exact: true, title: _t("Rows as they look"), icon: "image", desc: _t("Each row with the name, whole, as a picture exactly as it looks in its file - with the table's column titles over it."), ask: _t("Names or values, with commas between them") },
  { id: "columns", title: _t("Columns from every table"), icon: "table", desc: _t("The columns you name from every table that has them, row by row, as they are."), ask: _t("Column titles, with commas between them") },
  { id: "forms", title: _t("Form answers"), icon: "list", desc: _t("Every 'Label: answer' line of your forms and documents, as it is written: one row each.") },
  { id: "status", title: _t("Status of files"), icon: "check", desc: _t("Every file with its status (Pending, Checked, Signed, Done...), book by book.") },
  { id: "privacy", title: _t("Personal data (GDPR)"), icon: "lock", desc: _t("PPS numbers, bank accounts (IBAN), card numbers, dates of birth, emails and phones - each with its line and where it is.") },
  { id: "health", title: _t("Document health"), icon: "info", desc: _t("Scanned pages without words, empty pages, very big files, files that cannot be opened - file by file.") },
  { id: "duplicates", title: _t("Duplicates"), icon: "copy", desc: _t("The same file twice, and the same row in several places.") },
  { id: "find", title: _t("Find a word or a name"), icon: "search", desc: _t("Every line where it appears."), ask: _t("The word or the name") },
  { id: "person", title: _t("Everything about one person"), icon: "people", desc: _t("Every place a person appears, with the emails and phones next to them."), ask: _t("The person's name") },
  { id: "money", title: _t("Invoices & money"), icon: "money", desc: _t("Each amount with its line: totals, prices, what is due.") },
  { id: "marks", title: _t("My highlights & notes"), icon: "highlighter", desc: _t("Everything you marked, by document.") },
  { id: "case", title: _t("Case files: what is missing"), icon: "checklist", desc: _t("Book by book: the checklist documents still missing, the files waiting and the open tasks.") },
  { id: "Emails", title: _t("Emails"), icon: "at", desc: _t("Every email address, with the line it is in.") },
  { id: "Phones", title: _t("Phone numbers"), icon: "phone", desc: _t("Every phone and mobile number.") },
  { id: "Names", title: _t("Names of people"), icon: "people", desc: _t("Every person named in your documents.") },
  { id: "Addresses", title: _t("Addresses & postcodes"), icon: "map", desc: _t("Street addresses, Eircodes and postcodes.") },
  { id: "Dates", title: _t("All dates"), icon: "calendar", desc: _t("Every date, in order.") },
  { id: "IDs", title: _t("IDs & reference numbers"), icon: "hash", desc: _t("Invoice, order and reference numbers, IBAN.") },
  { id: "Companies", title: _t("Companies & organisations"), icon: "building", desc: _t("Companies, universities, councils, banks...") },
  { id: "Links", title: _t("Links & websites"), icon: "link", desc: _t("Every web address.") },
];

// ---- reading a file into pages of rows and tables
const cache = new Map();
const isSheet = (f) => f.kind === "excel" || (f.kind === "gdoc" && /spreadsheet/.test(f.mime || ""));

async function readFile(file) {
  const key = file.id + ":" + (file.md5 || file.modified);
  if (cache.has(key)) return cache.get(key);
  let out;
  if (isSheet(file)) {
    // a spreadsheet (Excel, or a Google Sheet read as Excel): its rows exactly as they are, each sheet a table
    const gs = file.kind === "gdoc";
    const buf = gs && store.value.exportAs ? await store.value.exportAs(file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") : await store.value.read(file);
    const sheets = await sheetRows(buf, gs ? file.name + ".xlsx" : file.name);
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
  return { columns: [_t("Name"), _t("Email"), _t("Phone"), _t("Address"), _t("Company"), _t("Document"), _t("Page")], rows: dropEmptyColumns(rows, 5) };
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
        out.push({ title: `${docName(f)}${t.sheet ? " · " + t.sheet : pages.length > 1 ? _t(" · page ") + (page + 1) : ""}${pg.tables.length > 1 ? _t(" · table ") + (k + 1) : ""}`,
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
          rows.push({ date: d.date, cells: [fmtDate(d.date), status(days).text, d.what || _t("Date"), r.text, docName(f), String(page + 1)], st: status(days).cls, go: where(b, f, page, d.text) });
        }
      });
    });
  }
  rows.sort((a, c) => a.date - c.date);
  const seen = new Set();
  return { columns: [_t("Date"), _t("When"), _t("What"), _t("The line"), _t("Document"), _t("Page")], rows: rows.filter(r => { const k = r.cells.join("|"); if (seen.has(k)) return false; seen.add(k); return true; }) };
}

async function findWord(scope, progress, q) {
  const rows = [];
  const nq = q.toLowerCase();
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    if (f.name.toLowerCase().includes(nq)) rows.push({ cells: [docName(f), "", _t("(in the name of the document)"), b.name], go: where(b, f, 0) });
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
      for (const r of pg.rows) if ((r.text || "").toLowerCase().includes(nq)) rows.push({ cells: [docName(f), String(page + 1), r.text, b.name], go: where(b, f, page, q) });
    });
  }
  return { columns: [_t("Document"), _t("Page"), _t("The line"), _t("Book")], rows };
}

// rows with a name or value: every table row that has it (its cells and the table's titles), and every line
function valuesOf(q) { return q.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean); }
// names: no accents, any case; a name one letter apart counts too (Mohamed / Mohammed) - unless "exactly as written"
const fold = (s) => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘`]/g, "'").toLowerCase();
function near1(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1 || Math.min(la, lb) < 4) return false;
  let i = 0;
  while (i < Math.min(la, lb) && a[i] === b[i]) i++;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1);
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
const wordsOfText = (t) => fold(t).split(/[^\p{L}\p{N}'.-]+/u).map(w => w.replace(/^[.'-]+|[.'-]+$/g, "")).filter(Boolean);
function tokIn(tok, words, exact) { return words.some(w => w === tok || (!exact && near1(tok, w))); }
function nameIn(text, v, exact) {
  const toks = wordsOfText(v), ws = wordsOfText(text);
  return toks.length > 0 && toks.every(t => tokIn(t, ws, exact));
}
function hasValue(text, v, exact = false) {
  if (!exact && /[\p{L}]/u.test(v) && nameIn(text, v, false)) return true;     // (a name, one letter apart too)
  const t = (text || "").toLowerCase(), x = v.toLowerCase();
  if (/^[\p{L}\p{N}]/u.test(x) && /[\p{L}\p{N}]$/u.test(x)) {
    const re = new RegExp("(^|[^\\p{L}\\p{N}])" + x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^\\p{L}\\p{N}])", "u");
    return re.test(t);
  }
  return t.includes(x);
}
async function rowsFound(scope, progress, q, exact = false) {
  const values = valuesOf(q);
  const found = [];   // {v, b, f, page, r, t}
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const { pages } = await readFile(f);
    pages.forEach((pg, page) => {
      if (isSheet(f)) {
        for (const t of pg.tables) for (const cells of t.rows) for (const v of values) if (cells.some(c => hasValue(c, v, exact))) found.push({ v, b, f, page, cells, header: t.header, sheet: t.sheet });
        return;
      }
      for (const r of pg.rows) {
        if (r.isHeader) continue;
        for (const v of values) if (hasValue(r.text, v, exact)) found.push({ v, b, f, page, r, cells: r.cells || null, header: r.header || null, t: r.table || null });
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
  tot[0] = _t("Total");
  return tot;
}

async function rowsWith(scope, progress, q, exact) {
  const { values, found } = await rowsFound(scope, progress, q, exact);
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
      const header = x.cells ? (x.header || x.cells.map((_, j) => _t("Column ") + (j + 1))) : [_t("The line")];
      const rows = [...g.rows];
      const tot = x.cells ? totalsRow(header, rows) : null;
      if (tot) rows.push(tot);
      tables.push({ title: _t("{0} · {1}{2} · page {3}", v, docName(x.f), x.sheet ? " · " + x.sheet : "", [...g.pages].join(", ")), header, rows, go: where(x.b, x.f, x.page, v) });
    }
    if (!mine.length) tables.push({ title: _t("{0} · not found", v), header: [_t("The line")], rows: [], go: null });
  }
  return { tables };
}

// rows as they look: each row with the name, whole - from the line above it to the line below it (drawn lines,
// cell borders or coloured stripes; a table without lines: its block of lines) - with the column titles on top
async function rowPictures(scope, progress, q, exact = false) {
  const values = valuesOf(q);
  const { readOnce, call } = await import("../docs.js");
  const sections = values.map(v => ({ title: v, items: [] }));
  const list = filesIn(scope);
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const { pages } = await readFile(f);
    for (const [page, pg] of pages.entries()) {
      if (isSheet(f)) {
        for (const t of pg.tables) for (const cells of t.rows) values.forEach((v, i) => {
          if (cells.some(c => hasValue(c, v, exact))) sections[i].items.push({ title: `${docName(f)}${t.sheet ? " · " + t.sheet : ""}`, text: cells.join("   "), go: where(b, f, page, v) });
        });
        continue;
      }
      const lines = (pg.rows || []).filter(r => r.y != null && r.y1 != null);
      if (!lines.length) continue;
      const sorted = [...lines].sort((a, c) => a.y - c.y);
      let geo = null;
      for (const [vi, v] of values.entries()) {
        const toks = wordsOfText(v);
        if (!toks.length) continue;
        const key = toks.reduce((a, c) => (c.length > a.length ? c : a), "");
        const hits = lines.filter(L => tokIn(key, wordsOfText(L.text), exact));
        if (!hits.length) continue;
        if (!geo) {
          try { geo = await readOnce(f, (k) => call("rowLines", k, page)); } catch (e) { geo = { ys: [], x0: 0, x1: 0 }; }
        }
        const ys = geo.ys || [];
        const done = [];
        for (const L of hits) {
          const lh = Math.max(6, L.y1 - L.y);
          const above = ys.filter(y => y > L.y - lh * 8 && y <= L.y + 1);
          const below = ys.filter(y => y >= L.y1 - 1 && y < L.y1 + lh * 16);
          const lined = above.length > 0 && below.length > 0;
          let top, bot;
          if (lined) { top = Math.max(...above); bot = Math.min(...below); }
          else {                                         // no lines: the block of lines close together
            let j0 = sorted.indexOf(L), j1 = j0;
            while (j0 > 0 && sorted[j0].y - sorted[j0 - 1].y1 < 0.45 * lh) j0--;
            while (j1 < sorted.length - 1 && sorted[j1 + 1].y - sorted[j1].y1 < 0.45 * lh) j1++;
            top = sorted[j0].y - lh * 0.35; bot = sorted[j1].y1 + lh * 0.35;
          }
          const inRow = lines.filter(x => x.y < bot - 1 && x.y1 > top + 1);
          const rowWords = wordsOfText(inRow.map(x => x.text).join(" "));
          if (!toks.every(t => tokIn(t, rowWords, exact))) continue;
          if (done.some(([a, c]) => Math.abs(a - top) < 2 && Math.abs(c - bot) < 2)) continue;
          done.push([top, bot]);
          const tb = !lined && L.table;                  // a table without lines: its own column titles and width
          const X0 = lined ? geo.x0 - 2 : Math.min(tb ? tb.x0 : Infinity, ...inRow.map(x => x.x0 ?? 0)) - 6;
          const X1 = lined ? geo.x1 + 2 : Math.max(tb ? tb.x1 : -Infinity, ...inRow.map(x => x.x1 ?? 0)) + 6;
          const rects = [];
          if (tb && tb.headerRow && tb.headerRow.y1 <= top + 1) rects.push([X0, tb.headerRow.y - 3, X1, tb.headerRow.y1 + 3]);
          if (lined) {                                    // the column titles: the rows above that are not like the rows
            const hh = bot - top, i = ys.indexOf(top);
            let a_ = i, b_ = ys.indexOf(bot);
            while (a_ > 0 && ys[a_] - ys[a_ - 1] < 4 * hh) a_--;
            while (b_ < ys.length - 1 && ys[b_ + 1] - ys[b_] < 4 * hh) b_++;
            const stat = (y0, y1) => {
              const t = lines.filter(x => (x.y + x.y1) / 2 > y0 + 1 && (x.y + x.y1) / 2 < y1 - 1).flatMap(x => x.text.split(/\s+/)).filter(Boolean);
              return [t.length, t.filter(z => /\d/.test(z)).length / (t.length || 1)];
            };
            const st = [];
            for (let k2 = a_; k2 < b_; k2++) st.push(stat(ys[k2], ys[k2 + 1]));
            const med = (arr) => [...arr].sort((x, y) => x - y)[Math.floor(arr.length / 2)] || 0;
            const mn = med(st.map(x => x[0])), md = med(st.map(x => x[1]));
            let j = a_;
            while (j < i && (st[j - a_][0] < 0.5 * mn || st[j - a_][1] < 0.5 * md)) j++;
            if (j > a_) rects.push([X0, ys[a_] - 1, X1, ys[j] + 1]);
          }
          rects.push([X0, top - 1, X1, bot + 1]);
          const text = inRow.map(x => x.text).join("  ");
          const title = _t("{0} · page {1}", docName(f), page + 1);
          try {
            const png = await readOnce(f, (k) => call("clip", k, page, rects, 2));
            sections[vi].items.push({ title, png, text, w: X1 - X0, go: where(b, f, page, v) });
          } catch (e) { sections[vi].items.push({ title, text, go: where(b, f, page, v) }); }
        }
      }
    }
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
  return { columns: [...valuesOf(q), _t("Document"), _t("Page")], rows };
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
  return { columns: [_t("Label"), _t("Answer"), _t("Document"), _t("Page")], rows };
}

// case files: what each book still needs - from its checklist, the status of its files and its tasks
async function caseFiles(scope) {
  const { bookMeta, statusOf, settings } = await import("../state.js");
  const rows = [];
  let without = 0;
  const today = new Date();
  const WAIT = new Set(["Pending", "Urgent", "Waiting"]);
  for (const b of scope) {
    const list = bookMeta(b.id).checklist || [];
    const done = list.filter(x => x.done).length;
    const prog = list.length ? _t("{0} of {1}", done, list.length) : "";
    if (!list.length) without++;
    for (const it of list) if (!it.done) rows.push({ kind: "missing", st: "bad", cells: [b.name, _t("Missing"), _t("Document: ") + it.text, prog, ""], go: b.files[0] ? where(b, b.files[0], 0) : null });
    for (const f of b.files) {
      const s = statusOf(f.id);
      if (WAIT.has(s)) rows.push({ kind: "file", st: s === "Urgent" ? "bad" : "warn", cells: [b.name, _tv(s), f.name, prog, f.modified ? fmtDate(new Date(f.modified)) : ""], go: where(b, f, 0) });
    }
    for (const t of (settings.value.tasks || [])) {
      if (t.done || t.bookId !== b.id) continue;
      const due = t.due ? new Date(t.due + "T00:00") : null;
      const days = due ? daysBetween(today, due) : null;
      const f = t.fileId && b.files.find(x => x.id === t.fileId);
      rows.push({ kind: "task", st: due ? status(days).cls : "", cells: [b.name, due ? (days < 0 ? _t("Task, late") : _t("Task")) : _t("Task"), t.text + (t.who ? " - " + t.who : "") + (t.file ? ` ("${t.file}")` : ""), prog, due ? fmtDate(due) : ""], go: f ? where(b, f, t.page || 0) : b.files[0] ? where(b, b.files[0], 0) : null });
    }
    if (list.length && done === list.length && !rows.some(r => r.cells[0] === b.name)) rows.push({ kind: "ok", st: "ok", cells: [b.name, _t("Complete"), _t("Every document of the checklist is here"), prog, ""], go: b.files[0] ? where(b, b.files[0], 0) : null });
  }
  const order = { missing: 0, file: 1, task: 2, ok: 3 };
  rows.sort((a, c) => a.cells[0].localeCompare(c.cells[0]) || order[a.kind] - order[c.kind]);
  return { columns: [_t("Book"), _t("State"), _t("What"), _t("Checklist"), _t("Date")], stCol: _t("State"), rows, facts: { books: scope.length, without } };
}

async function statusReport(scope) {
  const { statusOf } = await import("../state.js");
  const rows = [];
  for (const b of scope) for (const f of b.files) rows.push({ cells: [f.name, f.sub ? b.name + " / " + f.sub : b.name, _tv(statusOf(f.id)) || _t("No status"), f.modified ? fmtDate(new Date(f.modified)) : ""], go: where(b, f, 0) });
  return { columns: [_t("File"), _t("Book"), _t("Status"), _t("Changed")], rows };
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
        if (gi < gone.length && ai < added.length && alike(gone[gi], added[ai])) { push(_t("Changed"), gone[gi++], added[ai++]); continue; }
        if (gi < gone.length) push(_t("Only in the first"), gone[gi++], null);
        else push(_t("Only in the second"), null, added[ai++]);
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
    for (const x of A) if (!sb.has(x.t)) push(_t("Only in the first"), x, null);
    for (const y of B) if (!sa.has(y.t)) push(_t("Only in the second"), null, y);
  }
  return { columns: [_t("What"), a.file.name.replace(/\.[^.]+$/, ""), b.file.name.replace(/\.[^.]+$/, ""), _t("Page"), _t("Page")], rows,
    same: rows.length === 0 };
}

// personal data, for GDPR: what it is, the value, its line, where
function luhn(d) { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let x = +d[i]; if (alt) { x *= 2; if (x > 9) x -= 9; } s += x; alt = !alt; } return s % 10 === 0; }
const PPS_RE = /\b\d{7}[A-W][A-IW]?\b/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const DOB_RE = /\b(?:d\.?o\.?b\.?|date of birth|born|birth date|fecha de nacimiento|f\. ?nac\.?|nacid[oa] el)\b/i;
// Spanish DNI and NIE: 8 digits (or X/Y/Z and 7) and the letter that checks them
const DNI_RE = /\b[XYZ]?\d{7,8}[A-Z]\b/g;
const dniOk = (v) => { const m = /^([XYZ]?)(\d{7,8})([A-Z])$/.exec(v); if (!m || (m[1] ? m[2].length !== 7 : m[2].length !== 8)) return false; const n = Number(("XYZ".indexOf(m[1]) >= 0 ? String("XYZ".indexOf(m[1])) : "") + m[2]); return "TRWAGMYFPDXBNJZSQVHLCKE"[n % 23] === m[3]; };
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
        for (const m of allMatches(PPS_RE, text)) add(_t("PPS number"), m.v);
        for (const m of allMatches(DNI_RE, text)) if (dniOk(m.v)) add(_t("DNI / NIE number"), m.v);
        for (const m of allMatches(IBAN_RE, text)) if (/\d{6,}/.test(m.v.replace(/ /g, ""))) add(_t("Bank account (IBAN)"), m.v);
        for (const m of allMatches(CARD_RE, text)) { const d = m.v.replace(/\D/g, ""); if (d.length >= 13 && d.length <= 19 && luhn(d) && !/^0+$/.test(d)) add(_t("Card number"), m.v.trim()); }
        const hdrDob = r.cells && r.header ? r.header.findIndex(h => DOB_RE.test(h || "")) : -1;
        if (hdrDob >= 0 && r.cells[hdrDob]) add(_t("Date of birth"), r.cells[hdrDob]);
        else if (DOB_RE.test(text) || DOB_RE.test(pg.rows[i - 1]?.text || "")) for (const d of parseDatesAt(text)) add(_t("Date of birth"), d.text);
        for (const m of allMatches(RE.Emails, text)) add(_t("Email"), m.v);
        for (const m of allMatches(RE.Phones, text)) { const p = cleanPhone(m.v); if (p && !parseDatesAt(p).length) add(_t("Phone"), p); }
      });
    });
  }
  return { columns: [_t("What"), _t("The value"), _t("The line"), _t("Document"), _t("Page")], rows };
}

async function health(scope, progress) {
  const rows = [];
  const list = filesIn(scope);
  const { readOnce, call } = await import("../docs.js");
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    const notes = [];
    let pagesN = "";
    if (f.size && f.size > 20e6) notes.push(_t("Very big ({0} MB): Make this file smaller", Math.round(f.size / 1e6)));
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
        if (scanned.length) notes.push(_t("Scanned pages without words: {0} (Read the words of its scanned pages)", scanned.join(", ")));
        if (empty.length) notes.push(_t("Empty pages: {0}", empty.join(", ")));
      } catch (e) { notes.push(_t("Cannot be opened: ") + (e.message || e)); }
    }
    rows.push({ cells: [f.name, b.name, pagesN, f.size ? fmtSize(f.size) : "", notes.length ? notes.join(" · ") : _t("All right")], go: where(b, f, 0) });
  }
  rows.sort((a, c) => (a.cells[4] === _t("All right")) - (c.cells[4] === _t("All right")));
  return { columns: [_t("File"), _t("Book"), _t("Pages"), _t("Size"), _t("What to look at")], rows };
}

async function duplicates(scope, progress) {
  const rows = [];
  const list = filesIn(scope);
  // the same file twice (same contents), or the same name in two books
  const byMd5 = new Map();
  for (const { b, f } of list) if (f.md5) { if (!byMd5.has(f.md5)) byMd5.set(f.md5, []); byMd5.get(f.md5).push({ b, f }); }
  for (const g of byMd5.values()) if (g.length > 1) for (const { b, f } of g) rows.push({ cells: [_t("The same file"), f.name, _t("{0} copies: {1}", g.length, g.map(x => x.b.name).join(", ")), b.name, ""], go: where(b, f, 0) });
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
  for (const g of seen.values()) if (g.length > 1) for (const x of g) rows.push({ cells: [_t("The same row"), x.text, _t("{0} times", g.length), docName(x.f), String(x.page + 1)], go: where(x.b, x.f, x.page, x.text.slice(0, 40)) });
  return { columns: [_t("What"), _t("Which"), _t("How many"), _t("Where"), _t("Page")], rows };
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
  return { columns: [_t("Document"), _t("Page"), _t("The line"), _t("Email"), _t("Phone"), _t("Dates")], rows };
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
          const kind = /total/i.test(r.text) ? _t("Total") : /due|owed|balance|pay|pendiente|a pagar|adeud|saldo|vencimiento/i.test(r.text) ? _t("Due") : /budget|presupuesto/i.test(r.text) ? _t("Budget") : "";
          rows.push({ cells: [m.v.trim(), kind, r.text, docName(f), String(page + 1)], value: amountValue(m.v), go: where(b, f, page, m.v.trim()) });
        }
      }
    });
  }
  return { columns: [_t("Amount"), _t("Kind"), _t("The line"), _t("Document"), _t("Page")], rows };
}

async function marks(scope, progress) {
  const rows = [];
  const names = { Highlight: _t("Highlight"), Underline: _t("Underline"), StrikeOut: _t("Strike-out"), Squiggly: _t("Wavy line"), Ink: _t("Drawing"), FreeText: _t("Text"), Text: _t("Note"), Square: _t("Box"), Circle: _t("Circle"), Line: _t("Line"), Stamp: _t("Stamp") };
  const list = filesIn(scope).filter(x => x.f.kind === "pdf");
  for (const [n, { b, f }] of list.entries()) {
    progress(n, list.length, f.name);
    try {
      for (const m of await allMarks(f)) {
        rows.push({ cells: [docName(f), String(m.page + 1), m.subject && m.type === "FreeText" ? m.subject : names[m.type] || m.type, m.text || m.contents || "", m.modified ? fmtDate(new Date(m.modified)) : ""], go: where(b, f, m.page) });
      }
    } catch (e) {}
  }
  return { columns: [_t("Document"), _t("Page"), _t("Mark"), _t("The words"), _t("Date")], rows };
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
  const label = { Emails: _t("Email"), Phones: _t("Phone"), Names: _t("Name"), Addresses: _t("Address"), Dates: _t("Date"), IDs: _t("Number"), Companies: _t("Company"), Links: _t("Link") }[kind] || kind;
  return { columns: [label, _t("The line"), _t("Document"), _t("Page")], rows };
}

export async function runReport(id, scope, { q = "", progress = () => {}, exact = false } = {}) {
  switch (id) {
    case "contacts": return contacts(scope, progress);
    case "tables": return tables(scope, progress);
    case "deadlines": return deadlines(scope, progress);
    case "find": return findWord(scope, progress, q);
    case "rows": return rowsWith(scope, progress, q, exact);
    case "columns": return columnsFrom(scope, progress, q);
    case "forms": return forms(scope, progress);
    case "status": return statusReport(scope);
    case "privacy": return personalData(scope, progress);
    case "health": return health(scope, progress);
    case "duplicates": return duplicates(scope, progress);
    case "snapshot": return rowPictures(scope, progress, q, exact);
    case "person": return person(scope, progress, q);
    case "money": return money(scope, progress);
    case "marks": return marks(scope, progress);
    case "case": return caseFiles(scope);
    default: return extract(id, scope, progress);
  }
}

export { ext };
