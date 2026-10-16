// Reports: choose what you want, where to look - and get the rows, exactly as they are in your documents.
import { useState } from "preact/hooks";
import { panel, books, currentBook, currentFile, settings, setSetting, toast, store, addFileToBook, logChange,
  STATUSES, setStatus } from "../state.js";
import { parseDatesAt } from "../reports/patterns.js";
import { Dialog, openMenu } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { REPORTS, runReport } from "../reports/run.js";
import { goToWord } from "./Find.jsx";
import { download, escapeHtml, fmtDate, uniqueName, isoDate, uid } from "../util.js";
import { call } from "../docs.js";

function visibleCols(columns, rows) {
  return columns.map((c, j) => j).filter(j => rows.some(r => (r.cells[j] || "").toString().trim() !== ""));
}

function asSheets(rep) {
  if (rep.tables) return rep.tables.map(t => ({ name: t.title, rows: [...(t.header ? [t.header] : []), ...t.rows] }));
  const cols = visibleCols(rep.columns, rep.rows);
  return [{ name: rep.title, rows: [cols.map(j => rep.columns[j]), ...rep.rows.map(r => cols.map(j => r.cells[j] ?? ""))] }];
}

async function toXlsx(rep) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const s of asSheets(rep)) {
    let name = s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || "Rows";
    let k = 2;
    while (used.has(name.toLowerCase())) name = name.slice(0, 25) + " " + k++;
    used.add(name.toLowerCase());
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    ws["!cols"] = (s.rows[0] || []).map((_, j) => ({ wch: Math.min(60, Math.max(10, ...s.rows.map(r => String(r[j] ?? "").length))) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

function toTsv(rep) {
  return asSheets(rep).map(s => (rep.tables ? s.name + "\n" : "") + s.rows.map(r => r.map(c => String(c ?? "").replace(/\t|\n/g, " ")).join("\t")).join("\n")).join("\n\n");
}

function toCsv(rep) {
  const q = (c) => { const s = String(c ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return "﻿" + asSheets(rep).map(s => s.rows.map(r => r.map(q).join(",")).join("\r\n")).join("\r\n\r\n");
}

function toHtml(rep) {
  let h = `<h1>${escapeHtml(rep.title)}</h1><p style="color:#666">${escapeHtml(rep.where)} · ${fmtDate(new Date())} · BindLens</p>`;
  for (const s of asSheets(rep)) {
    if (rep.tables) h += `<h3>${escapeHtml(s.name)}</h3>`;
    h += "<table>" + s.rows.map((r, i) => "<tr>" + r.map(c => (i === 0 ? "<th>" : "<td>") + escapeHtml(c) + (i === 0 ? "</th>" : "</td>")).join("") + "</tr>").join("") + "</table>";
  }
  return h;
}
const PDF_CSS = "body{font-family:sans-serif;font-size:9pt} h1{font-size:16pt;margin:0} table{border-collapse:collapse;width:100%;margin:6pt 0 12pt} td,th{border:0.5pt solid #bbb;padding:3pt 4pt;text-align:left;vertical-align:top} th{background:#eee}";

// right-click on a row: open its page, a reminder on its date, the status of its file, copy it
function rowMenu(e, cells, go, onGo) {
  e.preventDefault();
  let date = null;
  for (const c of cells) { const d = parseDatesAt(String(c ?? ""))[0]; if (d) { date = d.date; break; } }
  const line = cells.map(c => String(c ?? "").trim()).filter(Boolean).join(" · ").slice(0, 140);
  const b = go && books.value.find(x => x.id === go.bookId);
  const f = b && b.files.find(x => x.id === go.fileId);
  const remind = (d) => {
    setSetting("reminders", [...(settings.value.reminders || []), { id: uid(), date: isoDate(d), text: line, bookId: b?.id, fileId: f?.id, page: go?.page || 0, file: f?.name || "", book: b?.name || "" }]);
    toast(`On ${fmtDate(d)}, What needs you shows it.`, "ok");
  };
  openMenu(e, [
    go && { label: "Open its page", icon: "right", run: () => onGo(go) },
    date && { label: `Remind me on ${fmtDate(date)}`, icon: "clock", run: () => remind(date) },
    date && { label: "Remind me 2 weeks before", icon: "bell", run: () => remind(new Date(date.getTime() - 14 * 86400000)) },
    f && { label: "Status of its file", icon: "check", sub: [...STATUSES.map(([nm, col]) => ({ label: nm, color: col, run: () => { setStatus(f.id, nm); toast(`"${f.name}" is marked ${nm}.`, "ok"); } })), "-", { label: "No status", run: () => setStatus(f.id, "") }] },
    { label: "Copy this row", icon: "copy", run: () => { navigator.clipboard?.writeText(cells.map(c => String(c ?? "")).join("\t")); toast("Copied."); } },
  ]);
}

function RowsTable({ rep, onGo }) {
  if (rep.tables) {
    if (!rep.tables.length) return <p class="muted">No tables found here.</p>;
    return rep.tables.map((t, i) => (
      <div key={i} style={{ marginBottom: 16 }}>
        <div class="row" style={{ marginBottom: 6 }}><b class="grow">{t.title}</b><span class="tiny muted">{t.rows.length} rows</span>
          <button class="btn plain small" onClick={() => onGo(t.go)}>Open</button></div>
        <div class="rep-out" style={{ maxHeight: "40vh" }}>
          <table class="rows">
            {t.header && <thead><tr>{t.header.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>}
            <tbody>{t.rows.map((r, k) => <tr key={k} onContextMenu={(e) => rowMenu(e, r, t.go, onGo)}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    ));
  }
  if (!rep.rows.length) return <p class="muted">Nothing found here.</p>;
  const cols = visibleCols(rep.columns, rep.rows);
  return (
    <div class="rep-out">
      <table class="rows">
        <thead><tr>{cols.map(j => <th key={j}>{rep.columns[j]}</th>)}</tr></thead>
        <tbody>
          {rep.rows.map((r, k) => (
            <tr key={k} class="click" title="Double-click to open the page · right-click for more" onDblClick={() => onGo(r.go)} onContextMenu={(e) => rowMenu(e, cols.map(j => r.cells[j]), r.go, onGo)}>
              {cols.map(j => <td key={j}>{rep.columns[j] === "When" && r.st ? <span class={"chipst " + r.st}>{r.cells[j]}</span> : r.cells[j]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Reports() {
  const [pick, setPick] = useState(null);
  const [scope, setScope] = useState(currentBook.value ? "book" : "all");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(null);
  const [rep, setRep] = useState(null);
  const [some, setSome] = useState(() => settings.value.repBooks || (currentBook.value ? [currentBook.value.id] : []));
  const close = () => { panel.value = null; };
  const toggleSome = (id) => { const n = some.includes(id) ? some.filter(x => x !== id) : [...some, id]; setSome(n); setSetting("repBooks", n); };
  const book = currentBook.value;
  const file = currentFile.value;

  const run = async (id = pick?.id, sc = scope, qq = q) => {
    const def = REPORTS.find(r => r.id === id);
    if (!def) return;
    if (def.ask && !qq.trim()) { setPick(def); return; }
    let list, where;
    if (sc === "some") { list = books.value.filter(b => some.includes(b.id)); where = list.length === 1 ? `Book: ${list[0].name}` : `${list.length} books`; if (!list.length) { toast("Choose the books to look in."); return; } }
    else if (sc === "book" && book) { list = [book]; where = `Book: ${book.name}`; }
    else if (sc === "doc" && book && file) { list = [{ ...book, files: [file] }]; where = `Document: ${file.name}`; }
    else { list = books.value; where = "All books"; }
    setPick(def);
    setRep(null);
    setBusy({ n: 0, of: list.reduce((a, b) => a + b.files.length, 0), name: "" });
    try {
      const r = await runReport(id, list, { q: qq.trim(), progress: (n, of, name) => setBusy({ n, of, name }) });
      const title = def.title + (def.ask ? `: ${qq.trim()}` : "");
      setRep({ ...r, title, where, id });
      const runs = [{ id, scope: sc, q: qq.trim(), title, when: fmtDate(new Date()) }, ...(settings.value.repRuns || []).filter(x => !(x.id === id && x.q === qq.trim()))].slice(0, 8);
      setSetting("repRuns", runs);
    } catch (e) {
      toast("The report did not finish: " + e.message, "bad");
    }
    setBusy(null);
  };

  const onGo = (go) => {
    if (!go) return;
    const b = books.value.find(x => x.id === go.bookId);
    const f = b && b.files.find(x => x.id === go.fileId);
    if (!b || !f) return;
    close();
    goToWord(b, f, go.page || 0, String(go.q || "").slice(0, 60));
  };

  const saveInBook = async (e) => {
    openMenu(e, [
      { title: "Save the Excel file in..." },
      ...books.value.map(b => ({ label: b.name, swatch: b.color, run: async () => {
        const bytes = await toXlsx(rep);
        const name = uniqueName(`${rep.title.replace(/[\\/:*?"<>|]/g, " ")} - ${fmtDate(new Date())}.xlsx`, b.files.map(f => f.name));
        const f = await store.value.create(b.id, name, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        addFileToBook(b.id, f);
        logChange("Saved the report", name, b.name);
        toast(`Saved "${name}" in "${b.name}".`, "ok");
      } })),
    ]);
  };

  const shown = REPORTS.filter(r => !filter || (r.title + " " + r.desc).toLowerCase().includes(filter.toLowerCase()));
  const count = rep ? (rep.tables ? rep.tables.reduce((a, t) => a + t.rows.length, 0) : rep.rows.length) : 0;

  return (
    <Dialog title={rep ? rep.title : "Reports"} icon="reports" onClose={close} cls="wide"
      foot={rep ? <>
        <button class="btn plain" onClick={() => setRep(null)}><Icon n="left" size={17} />Other reports</button>
        <span class="grow small muted">{count} row{count === 1 ? "" : "s"} · {rep.where}</span>
        <button class="btn plain" onClick={() => { navigator.clipboard?.writeText(toTsv(rep)); toast("Copied: paste it in Excel or a document."); }}><Icon n="copy" size={17} />Copy</button>
        <button class="btn plain" onClick={async () => download(await toXlsx(rep), rep.title + ".xlsx")}><Icon n="excel" size={17} />Excel</button>
        <button class="btn plain hide-phone" onClick={() => download(toCsv(rep), rep.title + ".csv", "text/csv")}>CSV</button>
        <button class="btn plain" onClick={async () => { const u8 = await call("htmlToPdf", toHtml(rep), PDF_CSS, 842, 595, 30); window.open(URL.createObjectURL(new Blob([u8], { type: "application/pdf" })), "_blank"); }}><Icon n="print" size={17} />PDF</button>
        <button class="btn" onClick={saveInBook}><Icon n="drive" size={17} />Save in a book</button>
      </> : null}>
      {busy ? (
        <div style={{ textAlign: "center", padding: 30 }}>
          <div class="spinner" />
          <p class="muted small">Reading {busy.name || "your documents"}... {busy.n} of {busy.of}</p>
        </div>
      ) : rep ? <RowsTable rep={rep} onGo={onGo} /> : <>
        <div class="row wrap" style={{ marginBottom: 12 }}>
          <span class="small muted">Look in</span>
          {book && <button class={"btn small " + (scope === "book" ? "" : "plain")} onClick={() => setScope("book")}>This book ({book.name})</button>}
          {file && <button class={"btn small " + (scope === "doc" ? "" : "plain")} onClick={() => setScope("doc")}>This document</button>}
          <button class={"btn small " + (scope === "all" ? "" : "plain")} onClick={() => setScope("all")}>All books</button>
          <button class={"btn small " + (scope === "some" ? "" : "plain")} onClick={() => setScope("some")}>Some books...</button>
          <span class="grow" />
          <input class="field" style={{ maxWidth: 220 }} placeholder="Find a report" value={filter} onInput={(e) => setFilter(e.target.value)} />
        </div>
        {scope === "some" && (
          <div class="row wrap" style={{ marginBottom: 12, gap: 6 }}>
            {books.value.map(b => (
              <button key={b.id} class={"btn small " + (some.includes(b.id) ? "soft" : "plain")} onClick={() => toggleSome(b.id)}>
                <span class="swatch" style={{ background: b.color, width: 12, height: 12 }} />{some.includes(b.id) ? "✓ " : ""}{b.name}</button>
            ))}
          </div>
        )}
        {(settings.value.repRuns || []).length > 0 && !filter && (
          <div class="row wrap" style={{ marginBottom: 12 }}>
            <span class="tiny muted">Made lately:</span>
            {(settings.value.repRuns || []).map((r, i) => <button key={i} class="btn soft small" onClick={() => { setQ(r.q || ""); run(r.id, r.scope, r.q || ""); }}>{r.title}</button>)}
          </div>
        )}
        {pick && pick.ask && (
          <div class="cardopt on" style={{ marginBottom: 12, alignItems: "center" }}>
            <Icon n={pick.icon} /><b style={{ flex: "none" }}>{pick.title}</b>
            <input class="field" autoFocus placeholder={pick.ask} value={q} onInput={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) run(pick.id); }} />
            <button class="btn" disabled={!q.trim()} onClick={() => run(pick.id)}>Make it</button>
          </div>
        )}
        <div class="rep-list">
          {shown.map(r => (
            <button key={r.id} class={"cardopt" + (pick?.id === r.id ? " on" : "")} onClick={() => { setPick(r); if (!r.ask) run(r.id); }}>
              <Icon n={r.icon} /><span><b>{r.title}</b><span class="small muted">{r.desc}</span></span>
            </button>
          ))}
        </div>
        <p class="tiny muted" style={{ marginBottom: 0 }}>Reports show the rows exactly as they are written in your documents - nothing is rewritten or summarised. Double-click a row to open its page.</p>
      </>}
    </Dialog>
  );
}
