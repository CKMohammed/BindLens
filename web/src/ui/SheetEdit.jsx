// 1.0: a Google Sheet edited right in BindLens - its tabs and cells, like a small spreadsheet, right in the page.
// What you write goes back to Google by itself a moment later; only the cells you change (formulas, colours and the
// rest of the sheet stay as they are). If it cannot be edited here, the sheet is shown as it looks.
import { useEffect, useRef, useState } from "preact/hooks";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { panel, store, toast } from "../state.js";
import { paidOk, need } from "../license.js";
import { _t } from "../i18n.js";

const col = (i) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const q = (t) => "'" + t.replace(/'/g, "''") + "'";

export function SheetGrid({ file, onFail, inline = true }) {
  const [tabs, setTabs] = useState(null);
  const [at, setAt] = useState(0);
  const [edits, setEdits] = useState(new Map());     // "tab|row|col" -> text, not saved yet
  const [extra, setExtra] = useState({});             // rows added at the end of each tab
  const [state, setState] = useState("");             // "" | "saving" | "saved" | "error"
  const [foc, setFoc] = useState("");                 // the cell being written in shows its formula; the others, their value
  const grid = useRef(null);
  const timer = useRef(null);
  const pending = useRef(new Map());
  const tabsRef = useRef(null);
  useEffect(() => {
    let alive = true;
    store.value.sheetRead(file.id).then(t => { tabsRef.current = t; if (alive) setTabs(t); }).catch(e => { console.warn("sheet", e); if (alive && onFail) onFail(e.message || String(e)); });
    return () => { alive = false; if (timer.current) { clearTimeout(timer.current); flush(); } };
  }, [file.id]);

  const flush = async () => {
    timer.current = null;
    const todo = pending.current, tabs = tabsRef.current;
    if (!todo.size || !tabs) return;
    pending.current = new Map();
    setState("saving");
    try {
      const data = [], more = [];
      for (const [k, v] of todo) {
        const [ti, r, c] = k.split("|").map(Number);
        data.push({ range: q(tabs[ti].title) + "!" + col(c) + (r + 1), values: [[v]] });
      }
      tabs.forEach((tb, ti) => {                     // rows beyond the end of a tab: the tab gets them first
        let n = 0;
        for (const k of todo.keys()) { const [a, r] = k.split("|").map(Number); if (a === ti) n = Math.max(n, r + 1); }
        if (n > tb.rows) { more.push({ appendDimension: { sheetId: tb.id, dimension: "ROWS", length: n - tb.rows } }); tb.rows = n; }
      });
      await store.value.sheetWrite(file.id, data, more);
      setState("saved");
    } catch (e) {
      for (const [k, v] of todo) if (!pending.current.has(k)) pending.current.set(k, v);
      setState("error");
      toast(_t("Google did not answer:") + " " + e.message, "bad", 6000);
    }
  };

  if (!tabs) return <div class={"sheetwrap" + (inline ? " inline" : "")}><div class="spinner" /></div>;
  const t = tabs[at];
  const cell = (r, c) => {
    const k = at + "|" + r + "|" + c;
    if (edits.has(k)) return edits.get(k);
    const f = t.formula[r] && t.formula[r][c];
    if (typeof f === "string" && f.startsWith("=") && foc === r + ":" + c) return f;
    const v = t.shown[r] && t.shown[r][c];
    return v == null ? "" : String(v);
  };
  const used = Math.max(t.shown.length, t.formula.length);
  const nRows = Math.min(Math.max(used + 12, 25) + (extra[at] || 0), Math.max(t.rows, used) + (extra[at] || 0));
  const nCols = Math.min(Math.max(...t.shown.map(r => r.length), ...t.formula.map(r => r.length), 6), Math.max(t.cols, 1));
  const put = (r, c, v) => {
    if (!paidOk()) { need("sheet"); return; }
    const k = at + "|" + r + "|" + c;
    const m = new Map(edits); m.set(k, v); setEdits(m);
    pending.current.set(k, v);
    setState("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1200);
  };
  const move = (e, r, c) => {
    let nr = r;
    if (e.key === "Enter" || e.key === "ArrowDown") nr = r + 1;
    else if (e.key === "ArrowUp") nr = r - 1;
    else return;
    e.preventDefault();
    const el = grid.current && grid.current.querySelector(`input[data-rc="${Math.max(0, nr)}:${c}"]`);
    if (el) { el.focus(); el.select(); }
  };
  return (
    <div class={"sheetwrap" + (inline ? " inline" : "")}>
      <div class="sheetbar">
        {tabs.length > 1 && <div class="sheettabs">{tabs.map((x, i) => <button key={x.id} class={i === at ? "on" : ""} onClick={() => setAt(i)}>{x.title}</button>)}</div>}
        <span class="grow" />
        <span class={"tiny sheetstate " + state}>{state === "saving" ? _t("Saving...") : state === "saved" ? _t("Saved in Google Sheets.") : state === "error" ? _t("Not saved yet") : ""}</span>
        <button class="btn plain small" onClick={() => setExtra({ ...extra, [at]: (extra[at] || 0) + 10 })}><Icon n="plus" size={15} />{_t("More rows")}</button>
      </div>
      <div class="sheetgrid" ref={grid}>
        <table><thead><tr><th />{Array.from({ length: nCols }, (_, c) => <th key={c}>{col(c)}</th>)}</tr></thead>
          <tbody>{Array.from({ length: nRows }, (_, r) => (
            <tr key={r}><th>{r + 1}</th>{Array.from({ length: nCols }, (_, c) => {
              const ch = edits.has(at + "|" + r + "|" + c);
              return <td key={c} class={ch ? "ch" : ""}><input data-rc={r + ":" + c} value={cell(r, c)} onInput={(e) => put(r, c, e.currentTarget.value)}
                onKeyDown={(e) => move(e, r, c)} onFocus={() => setFoc(r + ":" + c)} onBlur={() => { setFoc(""); if (timer.current) { clearTimeout(timer.current); flush(); } }} /></td>;
            })}</tr>))}
          </tbody></table>
      </div>
    </div>
  );
}

// the same, in a window (kept for links that open it so)
export function SheetEdit({ file }) {
  const [err, setErr] = useState("");
  const close = () => { panel.value = null; };
  return (
    <Dialog title={file.name} icon="table" onClose={close} cls="wide sheetdlg">
      {err ? <p>{_t("Google did not answer:")} {err}</p> : <SheetGrid file={file} inline={false} onFail={setErr} />}
    </Dialog>
  );
}
