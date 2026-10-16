// A book's checklist: the documents a case file needs (a signed contract, a copy of the ID...). Tick one, and say which
// document it is; BindLens suggests the document when its name fits.
import { useState } from "preact/hooks";
import { bookMeta, setBookMeta, fileId, pageNo } from "../state.js";
import { Icon } from "./icons.jsx";
import { openMenu } from "./dialogs.jsx";
import { scrollTo } from "./Viewer.jsx";
import { uid } from "../util.js";

const STOP = new Set(["copy", "the", "and", "for", "with", "from", "signed", "sent", "approved", "form", "list", "plan", "report", "details", "number", "file", "documents", "document", "final", "of", "or", "to", "a"]);
function words(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter(w => w.length > 2); }

// the document whose name fits an item (e.g. "Signed contract" -> "Contract - Aoife Byrne.pdf")
function guess(book, item, used) {
  const key = words(item.text).filter(w => !STOP.has(w));
  if (!key.length) return null;
  let best = null, score = 0;
  for (const f of book.files) {
    if (used.has(f.id)) continue;
    const fw = new Set(words(f.name.replace(/\.[^.]+$/, "")));
    const hit = key.filter(w => fw.has(w) || [...fw].some(x => x.startsWith(w.slice(0, 5)) && w.length > 4)).length;
    if (hit > score) { score = hit; best = f; }
  }
  return score ? best : null;
}

export function checklistOf(id) { return bookMeta(id).checklist || []; }
export function checkProgress(id) { const c = checklistOf(id); return c.length ? { done: c.filter(x => x.done).length, of: c.length } : null; }

export function Checklist({ book }) {
  const list = checklistOf(book.id);
  const [text, setText] = useState("");
  const save = (l) => setBookMeta(book.id, { checklist: l });
  const set = (id, ch) => save(list.map(x => x.id === id ? { ...x, ...ch } : x));
  const used = new Set(list.map(x => x.fileId).filter(Boolean));
  const done = list.filter(x => x.done).length;
  const add = () => { if (!text.trim()) return; save([...list, { id: uid(), text: text.trim().slice(0, 120), done: 0 }]); setText(""); };
  const go = (fid) => { fileId.value = fid; pageNo.value = 0; scrollTo.value = { fileId: fid, page: 0 }; };
  const fileName = (fid) => book.files.find(f => f.id === fid)?.name;
  return (
    <div class="list checklist">
      {list.length > 0 && <div class="ck-head">
        <div class="ck-bar"><i style={{ width: (100 * done / list.length) + "%" }} /></div>
        <span class="small"><b>{done}</b> of {list.length} {done === list.length ? "· complete" : ""}</span>
      </div>}
      {!list.length && <p class="small muted" style={{ padding: "4px 8px" }}>A checklist of the documents this book needs - for a case file, a student, a project. Add the first one below.</p>}
      {list.map(it => {
        const g = !it.done ? guess(book, it, used) : null;
        const fn = it.fileId && fileName(it.fileId);
        return (
          <div key={it.id} class={"ck-item" + (it.done ? " done" : "")}>
            <input type="checkbox" checked={!!it.done} onChange={(e) => set(it.id, { done: e.target.checked ? Date.now() : 0, fileId: e.target.checked ? it.fileId || g?.id || "" : it.fileId })} aria-label={it.text} />
            <div class="grow" style={{ minWidth: 0 }}>
              <div class="ck-text">{it.text}</div>
              {fn ? <a href="#" class="tiny ellipsis" onClick={(e) => { e.preventDefault(); go(it.fileId); }}><Icon n="file" size={11} /> {fn}</a>
                : g ? <button class="ck-guess tiny" onClick={() => set(it.id, { done: Date.now(), fileId: g.id })} title="Tick it with this document">Is it "{g.name}"? <b>Yes</b></button> : null}
            </div>
            <button class="ib" style={{ width: 26, height: 26 }} title="More" onClick={(e) => openMenu(e, [
              { title: it.text },
              { label: "Which document is it?", icon: "file", sub: [
                ...book.files.map(f => ({ label: f.name, run: () => set(it.id, { fileId: f.id, done: it.done || Date.now() }) })),
                it.fileId && { label: "None", run: () => set(it.id, { fileId: "" }) },
              ] },
              { label: "Rename...", icon: "rename", run: async () => { const { ask } = await import("./dialogs.jsx"); const t = await ask("The item", { value: it.text, ok: "Save" }); if (t) set(it.id, { text: t.slice(0, 120) }); } },
              { label: "Move up", icon: "up", run: () => { const i = list.indexOf(it); if (i > 0) { const l = [...list]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; save(l); } } },
              "-",
              { label: "Take it off the list", icon: "trash", danger: true, run: () => save(list.filter(x => x.id !== it.id)) },
            ])}><Icon n="more" size={15} /></button>
          </div>
        );
      })}
      <div class="ck-add">
        <input class="field" value={text} placeholder="Add a document it needs, e.g. Signed contract" onInput={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button class="btn small" onClick={add} disabled={!text.trim()}><Icon n="plus" size={15} /></button>
      </div>
    </div>
  );
}
