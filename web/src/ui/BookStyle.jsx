// "Icon and colour" of a book, as in the Windows app: a style (3D, flat, light), an icon from the groups (or your own
// letters, a year, a month), and its colour.
import { useState } from "preact/hooks";
import { panel, books, bookMeta, setBookMeta } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { BookTile, ICON_GROUPS, ICON_WORDS, TILE_STYLES } from "./bookicons.jsx";
import { setBookColor } from "../actions.js";
import { BOOK_COLORS, initials } from "../util.js";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MORE_COLORS = ["#1F2A44", "#3A3F48", "#7B1E3F", "#1D5C45", "#0B63CE", "#C9A227"];

export function BookStyle({ id }) {
  const book = books.value.find(b => b.id === id);
  const m0 = bookMeta(id);
  const [st, setSt] = useState({ icon: m0.icon || "letters", tstyle: m0.tstyle || "3d", color: m0.color || book?.color || BOOK_COLORS[0] });
  const [group, setGroup] = useState("Folders");
  const [q, setQ] = useState("");
  const [own, setOwn] = useState(initials(book?.name || ""));
  const close = () => { panel.value = null; };
  if (!book) return null;
  const set = (ch) => setSt({ ...st, ...ch });
  const meta = { ...st };
  const groups = [...ICON_GROUPS.map(g => g[0]), "Letters & numbers", "Dates"];
  let icons = [];
  const nq = q.trim().toLowerCase();
  if (nq) {
    const extra = Object.entries(ICON_WORDS).filter(([k]) => k.includes(nq) || nq.includes(k)).flatMap(([, v]) => v.split(" "));
    for (const [g, list] of ICON_GROUPS) for (const ic of list) if ((ic.replace(/_/g, " ").includes(nq) || extra.includes(ic) || g.toLowerCase().includes(nq)) && !icons.includes(ic)) icons.push(ic);
  } else if (group === "Letters & numbers") icons = ["letters", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("").map(c => "tx:" + c)];
  else if (group === "Dates") { const y = new Date().getFullYear(); icons = [...[-4, -3, -2, -1, 0, 1, 2].map(k => "yr:" + (y + k)), ...MONTHS.map(x => "mo:" + x)]; }
  else icons = (ICON_GROUPS.find(g => g[0] === group) || ICON_GROUPS[0])[1];
  const save = () => {
    setBookMeta(id, { icon: st.icon, tstyle: st.tstyle });
    setBookColor(book, st.color);
    close();
  };
  return (
    <Dialog title="Icon and colour" icon="palette" onClose={close} cls="wide"
      foot={<><button class="btn plain" onClick={() => setSt({ icon: "letters", tstyle: "3d", color: book.color })}>As it was at first</button><span class="grow" /><button class="btn plain" onClick={close}>Cancel</button><button class="btn" onClick={save}>Save</button></>}>
      <div class="row" style={{ gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <BookTile book={book} meta={meta} size={84} />
        <div class="grow" style={{ minWidth: 240 }}>
          <b style={{ fontSize: 17 }}>{book.name}</b>
          <div class="row wrap" style={{ marginTop: 8, gap: 6 }}>
            <span class="tiny muted" style={{ fontWeight: 700 }}>STYLE</span>
            {TILE_STYLES.map(([k, l]) => <button key={k} class={"btn small " + (st.tstyle === k ? "soft" : "plain")} onClick={() => set({ tstyle: k })}>{l}</button>)}
          </div>
          <div class="row wrap" style={{ marginTop: 8, gap: 6 }}>
            <span class="tiny muted" style={{ fontWeight: 700 }}>FIND</span>
            <input class="field" style={{ maxWidth: 220 }} placeholder="e.g. money, staff, university" value={q} onInput={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </div>
      <div class="row wrap" style={{ gap: 4, margin: "14px 0 8px" }}>
        {groups.map(g => <button key={g} class={"btn small " + (group === g && !nq ? "soft" : "plain")} onClick={() => { setGroup(g); setQ(""); }}>{g}</button>)}
      </div>
      <div class="icongrid">
        {!icons.length && <p class="small muted">No icon with that name - try another word, or look in the groups.</p>}
        {icons.map(ic => (
          <button key={ic} class={"iconcell" + (st.icon === ic ? " on" : "")} title={ic.replace(/^..:/, "").replace(/_/g, " ")} onClick={() => set({ icon: ic })}>
            <BookTile book={book} meta={{ ...meta, icon: ic }} size={42} />
          </button>
        ))}
      </div>
      {group === "Letters & numbers" && !nq && (
        <div class="row wrap" style={{ marginTop: 8, gap: 8 }}>
          <span class="small">Your own letters (1-4):</span>
          <input class="field" style={{ width: 90 }} maxLength={4} value={own} onInput={(e) => setOwn(e.target.value.replace(/[^0-9A-Za-zÀ-ÿ&/+-]/g, "").slice(0, 4).toUpperCase())} />
          <button class="btn soft small" disabled={!own} onClick={() => set({ icon: "tx:" + own })}>Use them</button>
        </div>
      )}
      <div class="row wrap" style={{ marginTop: 14, gap: 6 }}>
        <span class="tiny muted" style={{ fontWeight: 700 }}>COLOUR</span>
        {[...BOOK_COLORS, ...MORE_COLORS].map(c => <button key={c} class={"colordot" + (st.color === c ? " on" : "")} style={{ background: c }} title={c} onClick={() => set({ color: c })} />)}
        <label class="row small" title="Your own colour"><input type="color" value={st.color} onInput={(e) => set({ color: e.target.value })} style={{ width: 34, height: 28, border: 0, background: "none" }} />Your own</label>
      </div>
    </Dialog>
  );
}
