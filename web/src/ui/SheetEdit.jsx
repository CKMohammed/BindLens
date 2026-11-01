// 1.0: a Google Sheet edited right in BindLens - its tabs and cells, like a small spreadsheet. Only the cells you
// change go back to Google (formulas, colours and the rest of the sheet stay as they are).
import { useEffect, useRef, useState } from "preact/hooks";
import { Dialog, confirm } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { panel, store, toast } from "../state.js";
import { _t } from "../i18n.js";

const col = (i) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const q = (t) => "'" + t.replace(/'/g, "''") + "'";

export function SheetEdit({ file }) {
  const [tabs, setTabs] = useState(null);
  const [err, setErr] = useState("");
  const [at, setAt] = useState(0);
  const [edits, setEdits] = useState(new Map());     // "tab|row|col" -> text
  const [extra, setExtra] = useState({});             // rows added at the end of each tab
  const [busy, setBusy] = useState(false);
  const [foc, setFoc] = useState("");                // the cell being written in shows its formula; the others, their value
  const grid = useRef(null);
  const close = async () => { if (edits.size && !(await confirm(_t("Close without saving your changes?"), "", { ok: _t("Close"), danger: true }))) return; panel.value = null; };
  useEffect(() => {
    store.value.sheetRead(file.id).then(setTabs).catch(e => setErr(e.message || String(e)));
  }, [file.id]);

  const inGoogle = () => import("./AddPages.jsx").then(m => m.openBeside(store.value.editLink("sheet", file.id)));
  if (err) {
    const off = /has not been used|is disabled|SERVICE_DISABLED|not been enabled/i.test(err);
    return (
      <Dialog title={file.name} icon="table" onClose={() => { panel.value = null; }} cls="mid"
        foot={<><span class="grow" /><button class="btn" onClick={() => { panel.value = null; inGoogle(); }}><Icon n="edit" size={16} />{_t("Edit it in Google")}</button></>}>
        <p>{off ? _t("Editing Google Sheets in BindLens is not switched on yet. For now, edit it in Google: BindLens shows the changes when you come back.") : _t("Google did not answer:") + " " + err}</p>
      </Dialog>
    );
  }
  const t = tabs && tabs[at];
  const cell = (r, c) => {
    const k = at + "|" + r + "|" + c;
    if (edits.has(k)) return edits.get(k);
    const f = t.formula[r] && t.formula[r][c];
    if (typeof f === "string" && f.startsWith("=") && foc === r + ":" + c) return f;
    const v = t.shown[r] && t.shown[r][c];
    return v == null ? "" : String(v);
  };
  const used = t ? Math.max(t.shown.length, t.formula.length) : 0;
  const nRows = t ? Math.min(Math.max(used + 12, 25) + (extra[at] || 0), Math.max(t.rows, used + (extra[at] || 0))) : 0;
  const nCols = t ? Math.min(Math.max(...t.shown.map(r => r.length), ...t.formula.map(r => r.length), 6), Math.max(t.cols, 1)) : 0;
  const put = (r, c, v) => { const m = new Map(edits); m.set(at + "|" + r + "|" + c, v); setEdits(m); };
  const move = (e, r, c) => {
    let nr = r, nc = c;
    if (e.key === "Enter" || (e.key === "ArrowDown" && !e.shiftKey)) nr = r + 1;
    else if (e.key === "ArrowUp") nr = r - 1;
    else return;
    e.preventDefault();
    const el = grid.current && grid.current.querySelector(`input[data-rc="${Math.max(0, nr)}:${nc}"]`);
    if (el) { el.focus(); el.select(); }
  };
  const save = async () => {
    if (!edits.size) { panel.value = null; return; }
    setBusy(true);
    try {
      const data = [], more = [];
      for (const [k, v] of edits) {
        const [ti, r, c] = k.split("|").map(Number);
        data.push({ range: q(tabs[ti].title) + "!" + col(c) + (r + 1), values: [[v]] });
      }
      // rows beyond the end of a tab: the tab gets them first
      tabs.forEach((tb, ti) => {
        let need = 0;
        for (const k of edits.keys()) { const [a, r] = k.split("|").map(Number); if (a === ti) need = Math.max(need, r + 1); }
        if (need > tb.rows) more.push({ appendDimension: { sheetId: tb.id, dimension: "ROWS", length: need - tb.rows } });
      });
      await store.value.sheetWrite(file.id, data, more);
      toast(_t("Saved in Google Sheets."), "ok");
      setEdits(new Map());
      panel.value = null;
      import("./BookView.jsx").then(m => m.refreshGoogle && m.refreshGoogle(file, false)).catch(() => {});
    } catch (e) { toast(_t("Google did not answer:") + " " + e.message, "bad", 6000); }
    setBusy(false);
  };
  return (
    <Dialog title={file.name} icon="table" onClose={close} cls="wide sheetdlg"
      foot={<><button class="btn plain" onClick={inGoogle}><Icon n="edit" size={16} />{_t("Edit it in Google")}</button>
        <span class="grow" />
        {t && <button class="btn plain" onClick={() => setExtra({ ...extra, [at]: (extra[at] || 0) + 10 })}><Icon n="plus" size={16} />{_t("More rows")}</button>}
        <button class="btn" disabled={busy} onClick={save}><Icon n="check" size={16} />{edits.size ? _t("Save ({0})", edits.size) : _t("Done")}</button></>}>
      {!tabs && <div class="spinner" />}
      {tabs && tabs.length > 1 && <div class="sheettabs">{tabs.map((x, i) => <button key={x.id} class={i === at ? "on" : ""} onClick={() => setAt(i)}>{x.title}</button>)}</div>}
      {t && <div class="sheetgrid" ref={grid}>
        <table><thead><tr><th />{Array.from({ length: nCols }, (_, c) => <th key={c}>{col(c)}</th>)}</tr></thead>
          <tbody>{Array.from({ length: nRows }, (_, r) => (
            <tr key={r}><th>{r + 1}</th>{Array.from({ length: nCols }, (_, c) => {
              const ch = edits.has(at + "|" + r + "|" + c);
              return <td key={c} class={ch ? "ch" : ""}><input data-rc={r + ":" + c} value={cell(r, c)} onInput={(e) => put(r, c, e.currentTarget.value)} onKeyDown={(e) => move(e, r, c)} onFocus={() => setFoc(r + ":" + c)} onBlur={() => setFoc("")} /></td>;
            })}</tr>))}
          </tbody></table>
      </div>}
      {t && <p class="tiny muted" style={{ margin: "8px 0 0" }}>{_t("Only the cells you change go back to Google; formulas start with =.")}</p>}
    </Dialog>
  );
}
