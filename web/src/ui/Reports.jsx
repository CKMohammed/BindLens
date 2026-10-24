// Reports: choose what you want, where to look - and get the rows, exactly as they are in your documents.
// On top: a few figures, and for dates and money a chart. Rows that were not there the last time are in blue.
// Out: a PDF in the colours of your institution (or of BindLens), a styled Excel file, CSV, or a copy.
import { useState, useEffect, useRef } from "preact/hooks";
import { panel, books, currentBook, currentFile, settings, setSetting, toast, store, addFileToBook, logChange,
  STATUSES, setStatus, pulseFrame, bookHidden } from "../state.js";
import { parseDatesAt } from "../reports/patterns.js";
import { Dialog, openMenu } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { REPORTS, runReport } from "../reports/run.js";
import { goToWord } from "./Find.jsx";
import { download, fmtDate, uniqueName, isoDate, uid } from "../util.js";
import { call } from "../docs.js";
import { idb } from "../idb.js";
import { countOf, summaryOf, chartOf, chartSvg, repTheme, visibleCols, toTsv, toCsv, reportXlsx, reportPdfHtml, reportPdfSpec,
  printsOf, markNew, rowPrint } from "../reports/out.js";
import { _t, loc, _tv, _n } from "../i18n.js";

// the reports most people need, first; the others under More reports
export const ESSENTIALS = ["contacts", "deadlines", "money", "tables", "case", "find", "person", "marks"];

export async function reportPdf(rep) {
  const { html, css, theme } = await reportPdfHtml(rep);
  const raw = await call("htmlToPdf", html, css, 842, 595, "46pt 38pt 42pt 38pt");
  const spec = await reportPdfSpec(rep, theme);
  return call("decorateReport", raw, spec);
}

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
    toast(_t("On {0}, What needs you shows it.", fmtDate(d)), "ok");
  };
  openMenu(e, [
    go && { label: _t("Open its page"), icon: "right", run: () => onGo(go) },
    date && { label: _t("Remind me on {0}", fmtDate(date)), icon: "clock", run: () => remind(date) },
    date && { label: _t("Remind me 2 weeks before"), icon: "bell", run: () => remind(new Date(date.getTime() - 14 * 86400000)) },
    f && { label: _t("Status of its file"), icon: "check", sub: [...STATUSES.map(([nm, col]) => ({ label: _tv(nm), color: col, run: () => { setStatus(f.id, nm); toast(_t("\"{0}\" is marked {1}.", f.name, _tv(nm)), "ok"); } })), "-", { label: _t("No status"), run: () => setStatus(f.id, "") }] },
    { label: _t("Copy this row"), icon: "copy", run: () => { navigator.clipboard?.writeText(cells.map(c => String(c ?? "")).join("\t")); toast(_t("Copied.")); } },
  ]);
}

function Pic({ png, w }) {
  const [u, setU] = useState(null);
  useEffect(() => { const x = URL.createObjectURL(new Blob([png], { type: "image/png" })); setU(x); return () => URL.revokeObjectURL(x); }, [png]);
  return u ? <img src={u} alt="" style={{ width: w ? Math.round(w * 1.25) + "px" : undefined, maxWidth: "100%", display: "block", border: "1px solid var(--line)", borderRadius: 6, background: "#fff" }} /> : null;
}

// the figures on top
function Summary({ rep }) {
  const s = summaryOf(rep);
  if (!s.length) return null;
  return (
    <div class="repsum">
      {s.map((x, i) => <div key={i} class="rs"><b>{x.v}</b><span>{x.st ? <i class={"rsd " + x.st} /> : null}{x.l}</span></div>)}
      {rep.newCount > 0 && <div class="rs new"><b>{rep.newCount}</b><span><i class="rsd new" />{_t("New since")} {fmtDate(rep.newSince)}</span></div>}
    </div>
  );
}

// the chart: drawn once as SVG; pointing at a column or a bar says what it is
function RepChart({ ch }) {
  const [tip, setTip] = useState(null);
  const box = useRef();
  const dark = document.documentElement.dataset.theme === "dark";
  const { svg } = chartSvg(ch, repTheme(), { w: 760, dark });
  const move = (e) => {
    const i = e.target?.dataset?.i;
    if (i == null) { setTip(null); return; }
    const it = ch.items[+i];
    const r = box.current.getBoundingClientRect();
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, v: ch.kind === "col" ? `${it.v} ${it.v === 1 ? ch.unit[0] : ch.unit[1]}` : (it.text || String(it.v)), l: it.tip || it.label });
  };
  return (
    <div class="repchart" ref={box} onPointerMove={move} onPointerLeave={() => setTip(null)}>
      <div class="rc-h"><b>{ch.title}</b><span class="tiny muted">{ch.sub}</span></div>
      <div class="rc-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      {tip && <div class="rc-tip" style={{ left: Math.min(tip.x + 12, (box.current?.clientWidth || 600) - 180) + "px", top: tip.y - 44 + "px" }}><b>{tip.v}</b><span>{tip.l}</span></div>}
    </div>
  );
}

function RowsTable({ rep, onGo }) {
  if (rep.pictures) {
    return rep.pictures.map((sc, i) => (
      <div key={i} style={{ marginBottom: 18 }}>
        <div class="row" style={{ marginBottom: 6 }}><b class="grow">{sc.title}</b><span class="tiny muted">{sc.items.length} {_t("row")}{sc.items.length === 1 ? "" : "s"}</span></div>
        {!sc.items.length && <p class="muted small">{_t("Not found.")}</p>}
        {sc.items.map((it, k) => (
          <div key={k} style={{ marginBottom: 10, cursor: "pointer" }} title={_t("Double-click to open the page")} onDblClick={() => onGo(it.go)}>
            <div class="tiny muted" style={{ marginBottom: 3 }}>{it.title}</div>
            {it.png ? <Pic png={it.png} w={it.w} /> : <div class="small">{it.text}</div>}
          </div>
        ))}
      </div>
    ));
  }
  if (rep.tables) {
    if (!rep.tables.length) return <p class="muted">{_t("No tables found here.")}</p>;
    return rep.tables.map((t, i) => (
      <div key={i} style={{ marginBottom: 16 }}>
        <div class="row" style={{ marginBottom: 6 }}><b class="grow">{t.title}</b><span class="tiny muted">{t.rows.length} {_t("rows")}</span>
          {t.go && <button class="btn plain small" onClick={() => onGo(t.go)}>{_t("Open")}</button>}</div>
        <div class="rep-out" style={{ maxHeight: "40vh" }}>
          <table class="rows">
            {t.header && <thead><tr>{t.header.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>}
            <tbody>{t.rows.map((r, k) => <tr key={k} class={t.isNew && t.isNew[k] ? "new" : ""} onContextMenu={(e) => rowMenu(e, r, t.go, onGo)}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    ));
  }
  if (!rep.rows.length) return <p class="muted">{_t("Nothing found here.")}</p>;
  const cols = visibleCols(rep.columns, rep.rows);
  const stCol = rep.stCol || _t("When");
  return (
    <div class="rep-out">
      <table class="rows">
        <thead><tr>{cols.map(j => <th key={j}>{rep.columns[j]}</th>)}</tr></thead>
        <tbody>
          {rep.rows.slice(0, 3000).map((r, k) => (
            <tr key={k} class={"click" + (r.isNew ? " new" : "")} title={(r.isNew ? _t("New since the last time · ") : "") + _t("Double-click to open the page · right-click for more")} onDblClick={() => onGo(r.go)} onContextMenu={(e) => rowMenu(e, cols.map(j => r.cells[j]), r.go, onGo)}>
              {cols.map(j => <td key={j}>{rep.columns[j] === stCol && r.st ? <span class={"chipst " + r.st}>{r.cells[j]}</span> : rep.id === "compare" && j === 0 ? <span class={"chipst " + (r.cells[0] === "Changed" ? "warn" : r.cells[0].includes("first") ? "bad" : "ok")}>{r.cells[j]}</span> : r.cells[j]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rep.rows.length > 3000 && <p class="tiny muted" style={{ padding: "6px 10px" }}>{_t("The first 3,000 rows are here; Excel, CSV and the PDF have all")} {rep.rows.length.toLocaleString(loc)}.</p>}
    </div>
  );
}

function ago(t) {
  if (!t) return "";
  const s = (Date.now() - t) / 1000;
  if (s < 90) return _t("just now");
  if (s < 3600) return _t("{0} min ago", Math.round(s / 60));
  if (s < 86400) return _t("{0} h ago", Math.round(s / 3600));
  if (s < 86400 * 7) return _n(Math.round(s / 86400), "{0} day ago", "{0} days ago");
  return fmtDate(new Date(t));
}

// the reports you made: open one again (the rows are read again, so they are as the documents are now)
export function ReportsMade({ onOpen, max = 8, compact = false }) {
  const runs = (settings.value.repRuns || []).slice(0, max);
  if (!runs.length) return null;
  return (
    <div class={"repmade" + (compact ? " compact" : "")}>
      {runs.map((r, i) => {
        const def = REPORTS.find(x => x.id === r.id);
        return (
          <button key={i} class="rm" onClick={() => onOpen(r)} title={_t("Make it again: ") + r.title}>
            <Icon n={def?.icon || "reports"} size={17} />
            <span class="grow rm-t"><b class="ellipsis">{r.title}</b><span class="tiny muted ellipsis">{r.where || ""}{r.rows != null ? _t(" · {0} row{1}", r.rows, r.rows === 1 ? "" : "s") : ""} · {r.at ? ago(r.at) : r.when}</span></span>
            <span class="rm-go"><Icon n="refresh" size={14} />{compact ? "" : _t("Open again")}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Reports({ compare, pickId, rerun }) {
  const [pick, setPick] = useState(() => (pickId && REPORTS.find(r => r.id === pickId)) || null);
  const [scope, setScope] = useState(currentBook.value ? "book" : "all");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(null);
  const [rep, setRep] = useState(null);
  const [more, setMore] = useState(() => { try { return localStorage.getItem("bl-repmore") === "1"; } catch (e) { return false; } });
  const [some, setSome] = useState(() => settings.value.repBooks || (currentBook.value ? [currentBook.value.id] : []));
  const [making, setMaking] = useState("");
  const close = () => { panel.value = null; };
  const toggleSome = (id) => { const n = some.includes(id) ? some.filter(x => x !== id) : [...some, id]; setSome(n); setSetting("repBooks", n); };
  const book = currentBook.value;
  const file = currentFile.value;
  useEffect(() => {
    if (!compare) return;
    (async () => {
      const { compareDocs } = await import("../reports/run.js");
      const find = (id) => { for (const b of books.value) { const f = b.files.find(x => x.id === id); if (f) return { book: b, file: f }; } return null; };
      const a = find(compare.a), b2 = find(compare.b);
      if (!a || !b2) return;
      setBusy({ n: 0, of: 2, name: a.file.name });
      try {
        const r = await compareDocs(a, b2);
        setRep({ ...r, title: _t("Compare: {0} and {1}", a.file.name, b2.file.name), where: a.book.id === b2.book.id ? _t("Book: {0}", a.book.name) : _t("{0} and {1}", a.book.name, b2.book.name), id: "compare" });
        if (r.same) toast(_t("The two documents have the same lines."), "ok");
      } catch (e) { toast(_t("Could not compare them: ") + e.message, "bad"); }
      setBusy(null);
    })();
  }, [compare?.a, compare?.b]);
  useEffect(() => { if (rerun) { setQ(rerun.q || ""); run(rerun.id, rerun.scope, rerun.q || "", rerun); } }, [rerun]);

  // where to look: this book, this document, all books, or some books (kept with the run, to make it again later)
  const resolve = (sc, saved) => {
    if (sc === "some") { const ids = saved?.ids || some; const list = books.value.filter(b => ids.includes(b.id) && !bookHidden(b)); return { list, ids, where: list.length === 1 ? _t("Book: {0}", list[0].name) : _t("{0} books", list.length) }; }
    if (sc === "book" || sc === "doc") {
      const b = books.value.find(x => x.id === (saved?.ids?.[0] || book?.id));
      if (b && sc === "book") return { list: [b], ids: [b.id], where: _t("Book: {0}", b.name) };
      const f = b && b.files.find(x => x.id === (saved?.fid || file?.id));
      if (b && f) return { list: [{ ...b, files: [f] }], ids: [b.id], fid: f.id, where: _t("Document: {0}", f.name) };
    }
    // the books locked with the PIN stay out until they are opened
    const open = books.value.filter(b => !bookHidden(b));
    return { list: open, ids: [], where: open.length < books.value.length ? _t("All books (not the {0} locked)", books.value.length - open.length) : _t("All books") };
  };

  const run = async (id = pick?.id, sc = scope, qq = q, saved = null) => {
    const def = REPORTS.find(r => r.id === id);
    if (!def) return;
    if (def.ask && !qq.trim()) { setPick(def); return; }
    const { list, ids, fid, where } = resolve(sc, saved);
    if (sc === "some" && !list.length) { toast(_t("Choose the books to look in.")); return; }
    setPick(def);
    setRep(null);
    setBusy({ n: 0, of: list.reduce((a, b) => a + b.files.length, 0), name: "" });
    try {
      const r = await runReport(id, list, { q: qq.trim(), exact: !!settings.value.repExact, progress: (n, of, name) => setBusy({ n, of, name }) });
      const title = def.title + (def.ask ? `: ${qq.trim()}` : "");
      const full = { ...r, title, where, id };
      // what is new since the last time this same report was made
      const key = `rep:${id}|${sc}|${ids.join(",")}|${fid || ""}|${qq.trim().toLowerCase()}`;
      try {
        const prev = await idb.get("kv", key);
        full.newCount = markNew(full, prev);
        if (full.newCount) { full.newSince = prev.at; pulseFrame(); }
        await idb.set("kv", key, { at: Date.now(), hashes: printsOf(full).slice(0, 60000) });
      } catch (e) {}
      setRep(full);
      const entry = { id, scope: sc, ids, fid, q: qq.trim(), title, where, rows: countOf(full), at: Date.now(), when: fmtDate(new Date()) };
      setSetting("repRuns", [entry, ...(settings.value.repRuns || []).filter(x => !(x.id === id && (x.q || "") === qq.trim() && x.scope === sc && (x.ids || []).join(",") === ids.join(",")))].slice(0, 12));
    } catch (e) {
      toast(_t("The report did not finish: ") + e.message, "bad");
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

  const fileBase = () => `${rep.title.replace(/[\\/:*?"<>|]/g, " ").trim()} - ${fmtDate(new Date())}`;
  const busyDo = async (what, fn) => { setMaking(what); try { await fn(); } catch (e) { toast(_t("Could not make it: ") + (e.message || e), "bad"); } setMaking(""); };
  const asPdf = () => busyDo("pdf", async () => { const u8 = await reportPdf(rep); window.open(URL.createObjectURL(new Blob([u8], { type: "application/pdf" })), "_blank"); });
  const asXlsx = () => busyDo("xlsx", async () => download(await reportXlsx(rep), fileBase() + ".xlsx"));
  const saveIn = (pdf, b) => busyDo(pdf ? "pdf" : "xlsx", async () => {
    const bytes = pdf ? await reportPdf(rep) : await reportXlsx(rep);
    const name = uniqueName(`${fileBase()}.${pdf ? "pdf" : "xlsx"}`, b.files.map(f => f.name));
    const f = await store.value.create(b.id, name, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), pdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    addFileToBook(b.id, f);
    logChange(_t("Saved the report"), name, b.name);
    toast(_t("Saved \"{0}\" in \"{1}\".", name, b.name), "ok");
  });
  const saveInBook = (e) => {
    const list = (pdf) => books.value.map(b => ({ label: b.name, swatch: b.color, run: () => saveIn(pdf, b) }));
    openMenu(e, [
      { title: _t("Save the report in a book") },
      { label: _t("As a PDF"), icon: "file", sub: list(true) },
      !rep.pictures && { label: _t("As an Excel file"), icon: "excel", sub: list(false) },
    ]);
  };

  const match = (r) => !filter || (r.title + " " + r.desc).toLowerCase().includes(filter.toLowerCase());
  const ess = ESSENTIALS.map(id => REPORTS.find(r => r.id === id)).filter(Boolean).filter(match);
  const rest = REPORTS.filter(r => !ESSENTIALS.includes(r.id)).filter(match);
  const count = rep ? countOf(rep) : 0;
  const ch = rep && !rep.pictures ? chartOf(rep) : null;
  const card = (r) => (
    <button key={r.id} class={"cardopt" + (pick?.id === r.id ? " on" : "")} onClick={() => { setPick(r); if (!r.ask) run(r.id); }}>
      <Icon n={r.icon} /><span><b>{r.title}</b><span class="small muted">{r.desc}</span></span>
    </button>
  );
  const showMore = more || !!filter;

  return (
    <Dialog title={rep ? rep.title : _t("Reports")} icon="reports" onClose={close} cls="wide"
      foot={rep ? <>
        <button class="btn plain" onClick={() => setRep(null)}><Icon n="left" size={17} />{_t("Other reports")}</button>
        <span class="grow small muted">{count.toLocaleString(loc)} {_t("row")}{count === 1 ? "" : "s"}{rep.newCount ? <b class="newn"> · {_n(rep.newCount, "{0} new@@one", "{0} new@@many")}</b> : null} · {rep.where}</span>
        <button class="btn plain" onClick={() => { navigator.clipboard?.writeText(toTsv(rep)); toast(_t("Copied: paste it in Excel or a document.")); }}><Icon n="copy" size={17} />{_t("Copy")}</button>
        {!rep.pictures && <button class="btn plain" disabled={!!making} onClick={asXlsx}><Icon n="excel" size={17} />{making === "xlsx" ? _t("Making...") : _t("Excel")}</button>}
        <button class="btn plain hide-phone" onClick={() => download(toCsv(rep), fileBase() + ".csv", "text/csv")}>{_t("CSV")}</button>
        <button class="btn plain" disabled={!!making} onClick={asPdf}><Icon n="print" size={17} />{making === "pdf" ? _t("Making...") : _t("PDF")}</button>
        <button class="btn" disabled={!!making} onClick={saveInBook}><Icon n="drive" size={17} />{_t("Save in a book")}</button>
      </> : null}>
      {busy ? (
        <div style={{ textAlign: "center", padding: 30 }}>
          <div class="spinner" />
          <p class="muted small">{_t("Reading {0}... {1} of {2}", busy.name || _t("your documents"), busy.n, busy.of)}</p>
        </div>
      ) : rep ? <>
        <Summary rep={rep} />
        {rep.id === "case" && rep.facts?.without > 0 && <p class="small muted" style={{ margin: "0 0 10px" }}><Icon n="checklist" size={14} /> {_n(rep.facts.without, "{0} book has no checklist yet: the Checklist tab of a book (or a template) says which documents it needs.", "{0} books have no checklist yet: the Checklist tab of a book (or a template) says which documents it needs.")}</p>}
        {ch && <RepChart ch={ch} />}
        <RowsTable rep={rep} onGo={onGo} />
      </> : <>
        <div class="row wrap" style={{ marginBottom: 12 }}>
          <span class="small muted">{_t("Look in")}</span>
          {book && <button class={"btn small " + (scope === "book" ? "" : "plain")} onClick={() => setScope("book")}>{_t("This book ({0})", book.name)}</button>}
          {file && <button class={"btn small " + (scope === "doc" ? "" : "plain")} onClick={() => setScope("doc")}>{_t("This document")}</button>}
          <button class={"btn small " + (scope === "all" ? "" : "plain")} onClick={() => setScope("all")}>{_t("All books")}</button>
          <button class={"btn small " + (scope === "some" ? "" : "plain")} onClick={() => setScope("some")}>{_t("Some books...")}</button>
          <span class="grow" />
          <input class="field" style={{ maxWidth: 220 }} placeholder={_t("Find a report")} value={filter} onInput={(e) => setFilter(e.target.value)} />
        </div>
        {scope === "some" && (
          <div class="row wrap" style={{ marginBottom: 12, gap: 6 }}>
            {books.value.map(b => (
              <button key={b.id} class={"btn small " + (some.includes(b.id) ? "soft" : "plain")} onClick={() => toggleSome(b.id)}>
                <span class="swatch" style={{ background: b.color, width: 12, height: 12 }} />{some.includes(b.id) ? "✓ " : ""}{b.name}</button>
            ))}
          </div>
        )}
        {pick && pick.ask && (
          <div class="cardopt on" style={{ marginBottom: 12, alignItems: "center" }}>
            <Icon n={pick.icon} /><b style={{ flex: "none" }}>{pick.title}</b>
            <input class="field" autoFocus placeholder={pick.ask} value={q} onInput={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) run(pick.id); }} />
            <button class="btn" disabled={!q.trim()} onClick={() => run(pick.id)}>{_t("Make it")}</button>
          </div>
        )}
        {pick && pick.ask && pick.exact && (
          <label class="chk small" style={{ margin: "-4px 0 12px 4px" }}>
            <input type="checkbox" checked={!!settings.value.repExact} onChange={(e) => setSetting("repExact", e.target.checked)} />
            {_t("Only exactly as I write it (no names one letter apart)")}
          </label>
        )}
        {!filter && (settings.value.repRuns || []).length > 0 && <>
          <div class="rep-sec">{_t("Reports you made")}</div>
          <ReportsMade max={4} onOpen={(r) => { setQ(r.q || ""); setScope(r.scope); run(r.id, r.scope, r.q || "", r); }} />
        </>}
        {ess.length > 0 && <div class="rep-sec">{_t("The essentials")}</div>}
        <div class="rep-list">{ess.map(card)}</div>
        {rest.length > 0 && <>
          <button class="rep-more" onClick={() => { const v = !more; setMore(v); try { localStorage.setItem("bl-repmore", v ? "1" : "0"); } catch (e) {} }}>
            <Icon n={showMore ? "down" : "right"} size={14} />{_t("More reports")} <span class="muted">({rest.length})</span>
          </button>
          {showMore && <div class="rep-list">{rest.map(card)}</div>}
        </>}
        <p class="tiny muted" style={{ margin: "12px 0 0" }}>{_t("Reports show the rows exactly as they are written in your documents - nothing is rewritten or summarised. Double-click a row to open its page; rows new since the last time are in blue.")}</p>
      </>}
    </Dialog>
  );
}

export { rowPrint };
