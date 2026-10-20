// The documents as an office keeps them: the data of each one (kind, date, reference, owner, expiry), the inbox
// (what came in and is not filed yet) and actions on several documents at once.
import { useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { books, panel, settings, docData, setDocData, DOC_TYPES, statusOf, setStatus, STATUSES, openBook, fileId, pageNo,
  toast, removeFile, bookHidden, logChange, store } from "../state.js";
import { Dialog, openMenu, confirm } from "./dialogs.jsx";
import { Icon, fileIcon } from "./icons.jsx";
import { scrollTo } from "./Viewer.jsx";
import { _t, _tv, _n, loc } from "../i18n.js";

// the documents chosen for an action on several at once (file ids)
export const picked = signal(new Set());
export const pick = (id) => { const s = new Set(picked.value); if (s.has(id)) s.delete(id); else s.add(id); picked.value = s; };
export const unpick = () => { picked.value = new Set(); };

const close = () => { panel.value = null; };
const where = (id) => { for (const b of books.value) { const f = b.files.find(x => x.id === id); if (f) return [b, f]; } return [null, null]; };
const FIELDS = [["type", () => _t("Kind of document")], ["date", () => _t("Date of the document")], ["ref", () => _t("Reference (number, case, file)")],
  ["owner", () => _t("Whose it is (person, client, student, department)")], ["expires", () => _t("Expires on")]];

// one line under a document's name: Invoice · 3 Mar 2026 · F-2026-114 · Ana Ruiz · expires 1 Jan 2027
export function docLine(id) {
  const d = docData(id);
  const day = (v) => new Date(v + "T00:00").toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
  return [d.type && _tv(d.type), d.date && day(d.date), d.ref, d.owner, d.expires && _t("expires {0}", day(d.expires))].filter(Boolean).join(" · ");
}

// ---- the data of one document, or of several at once
export function DocDetails() {
  const ids = panel.value?.ids || [];
  const list = ids.map(id => docData(id));
  const same = (k) => list.every(d => (d[k] || "") === (list[0][k] || "")) ? list[0][k] || "" : null;
  const [v, setV] = useState(() => Object.fromEntries(FIELDS.map(([k]) => [k, same(k) ?? ""])));
  const owners = [...new Set(Object.values(settings.value.docs || {}).map(d => d.owner).filter(Boolean))].slice(0, 60);
  const save = () => {
    const ch = {};
    for (const [k] of FIELDS) if (v[k] !== "" || same(k) !== null) ch[k] = v[k].trim ? v[k].trim() : v[k];
    if (ch.type) ch.filed = true;
    setDocData(ids, ch);
    toast(ids.length > 1 ? _t("The data of {0} documents is saved.", ids.length) : _t("Saved."), "ok");
    unpick(); back();
  };
  const back = () => { panel.value = panel.value?.back ? { type: panel.value.back } : null; };
  const [b, f] = where(ids[0]);
  return (
    <Dialog title={ids.length > 1 ? _t("The data of {0} documents", ids.length) : _t("Document data")} icon="form" onClose={back} cls="mid"
      foot={<><button class="btn plain" onClick={back}>{_t("Cancel")}</button><span class="grow" /><button class="btn" onClick={save}>{_t("Save")}</button></>}>
      <p class="small muted" style={{ marginTop: 0 }}>{ids.length > 1 ? _t("What you fill in goes to all of them; a box left empty keeps what each one has.") : <><b>{f?.name}</b>{b ? " · " + b.name : ""}</>}</p>
      <datalist id="dd-types">{DOC_TYPES.map(t => <option key={t} value={_tv(t)} />)}</datalist>
      <datalist id="dd-owners">{owners.map(o => <option key={o} value={o} />)}</datalist>
      <div class="ddgrid">
        {FIELDS.map(([k, l]) => (
          <label key={k} class="ddf"><span class="small muted">{l()}</span>
            <input class="field" type={k === "date" || k === "expires" ? "date" : "text"} list={k === "type" ? "dd-types" : k === "owner" ? "dd-owners" : undefined}
              value={k === "type" ? _tv(v[k]) : v[k]} placeholder={same(k) === null ? _t("(different in each)") : ""}
              onInput={(e) => { let x = e.target.value; if (k === "type") { const en = DOC_TYPES.find(t => _tv(t) === x); if (en) x = en; } setV({ ...v, [k]: x }); }} />
          </label>
        ))}
      </div>
      <p class="tiny muted" style={{ marginBottom: 0 }}>{_t("The expiry date shows in What needs you. The data is kept in your Drive with your settings; the files do not change.")}</p>
    </Dialog>
  );
}

// ---- what to do with several documents at once (a bar over the list)
export function BulkBar({ items, back }) {
  // items: [[book, file]] of the chosen documents
  if (!items.length) return null;
  const ids = items.map(([, f]) => f.id);
  const others = books.value.filter(b => !bookHidden(b));
  const move = async (to) => {
    const { moveFileTo } = await import("../actions.js");
    let n = 0;
    for (const [b, f] of items) if (b.id !== to.id) { await moveFileTo(b, f, to); n++; }
    toast(_n(n, "{0} document moved to {1}.", "{0} documents moved to {1}.", to.name), "ok"); unpick();
  };
  const bin = async () => {
    if (!await confirm(_n(ids.length, "Move {0} document to the bin?", "Move {0} documents to the bin?"), _t("They go to your Google Drive bin, where you can get them back for 30 days."), { ok: _t("Move to the bin"), danger: true })) return;
    const { saveAll } = await import("../docs.js");
    await saveAll();
    for (const [b, f] of items) { await store.value.trash(f.id); logChange(_t("Moved to the bin"), f.name, b.name); removeFile(f.id); }
    toast(_n(ids.length, "{0} document is in the bin.", "{0} documents are in the bin."), "ok"); unpick();
  };
  return (
    <div class="bulkbar" role="toolbar" aria-label={_t("Several documents")}>
      <b class="small">{_n(ids.length, "{0} chosen", "{0} chosen@@many")}</b>
      <span class="grow" />
      <button class="btn soft small" onClick={() => { panel.value = { type: "docdata", ids, back }; }}><Icon n="form" size={15} />{_t("Data")}</button>
      <button class="btn soft small" onClick={(e) => openMenu(e, [...STATUSES.map(([s, c]) => ({ label: _tv(s), color: c, run: () => { ids.forEach(id => setStatus(id, s)); unpick(); } })), "-", { label: _t("No status"), run: () => { ids.forEach(id => setStatus(id, "")); unpick(); } }])}><Icon n="check" size={15} />{_t("Status")}</button>
      <button class="btn soft small" onClick={(e) => openMenu(e, [{ title: _t("Move to") }, ...others.map(b => ({ label: b.name, swatch: b.color, run: () => move(b) }))])}><Icon n="right" size={15} />{_t("Move")}</button>
      <button class="btn soft small" onClick={() => { setDocData(ids, { filed: true }); toast(_t("Filed."), "ok"); unpick(); }}><Icon n="tick" size={15} />{_t("Filed")}</button>
      <button class="btn plain small" style={{ color: "var(--bad)" }} onClick={bin}><Icon n="trash" size={15} /></button>
      <button class="ib" title={_t("Choose none")} onClick={unpick}><Icon n="close" size={15} /></button>
    </div>
  );
}

// ---- the inbox: documents of the last 60 days that are not filed yet (no kind, no status, not marked Filed)
export function inboxItems() {
  const since = Date.now() - 60 * 864e5;
  const out = [];
  for (const b of books.value) {
    if (bookHidden(b)) continue;
    for (const f of b.files) {
      const d = docData(f.id);
      if (d.filed || d.type || statusOf(f.id)) continue;
      const t = f.modified ? Date.parse(f.modified) : 0;
      if (t && t < since) continue;
      out.push([b, f, t]);
    }
  }
  return out.sort((a, c) => c[2] - a[2]);
}

export function Inbox() {
  const items = inboxItems();
  const sel = picked.value;
  const chosen = items.filter(([, f]) => sel.has(f.id));
  const open = (b, f) => { close(); openBook(b.id); setTimeout(() => { fileId.value = f.id; pageNo.value = 0; scrollTo.value = { fileId: f.id, page: 0 }; }, 300); };
  return (
    <Dialog title={_t("Inbox")} icon="download" onClose={() => { unpick(); close(); }} cls="wide">
      <p class="small muted" style={{ marginTop: 0 }}>{_t("The documents that came in the last 60 days and are not filed yet. Give each one its data or a status, move it to its book, or mark it Filed.")}</p>
      {!items.length ? <p class="empty small">{_t("Nothing to file. Everything is in its place.")}</p> : <>
        <div class="row small" style={{ margin: "0 0 6px", gap: 8 }}>
          <label class="chk"><input type="checkbox" checked={chosen.length === items.length} onChange={(e) => { picked.value = e.target.checked ? new Set(items.map(([, f]) => f.id)) : new Set(); }} />{_t("All")}</label>
          <span class="muted">{_n(items.length, "{0} document", "{0} documents")}</span>
        </div>
        <BulkBar items={chosen} back="inbox" />
        <div class="inbox">
          {items.map(([b, f]) => (
            <div key={f.id} class={"ibrow" + (sel.has(f.id) ? " on" : "")}>
              <input type="checkbox" checked={sel.has(f.id)} onChange={() => pick(f.id)} aria-label={f.name} />
              <span class="ico"><Icon n={fileIcon(f.kind)} size={17} /></span>
              <button class="linkish grow ellipsis" onClick={() => open(b, f)}><b>{f.name}</b><small class="muted"> · {b.name}{f.modified ? " · " + new Date(f.modified).toLocaleDateString(loc, { day: "numeric", month: "short" }) : ""}</small></button>
              <button class="btn plain small" onClick={() => { panel.value = { type: "docdata", ids: [f.id], back: "inbox" }; }}><Icon n="form" size={15} />{_t("Data")}</button>
              <button class="ib" title={_t("Filed")} onClick={() => setDocData([f.id], { filed: true })}><Icon n="tick" size={15} /></button>
            </div>
          ))}
        </div>
      </>}
    </Dialog>
  );
}

