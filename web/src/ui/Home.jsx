import { consult } from "../consult.js";
// Home: a modern library. The books stand on shelves; pull one out to open it.
import { useEffect, useRef, useState } from "preact/hooks";
import { books, settings, setSetting, store, openBook, toast, bookMeta, setBookMeta } from "../state.js";
import { greeting, fmtDate, mix, initials, daysBetween, isoDate, uid } from "../util.js";
import { Icon } from "./icons.jsx";
import { openMenu, ask } from "./dialogs.jsx";
import { newBook, uploadFiles, pickFiles, renameBook, deleteBook, setBookColor, moveBook, bookDragStart, bookWasDragged, openPanel, continueReading,
  addFromDrive, addFolderFromDrive, signOut, toggleBookLock, addFolder, addDocsAsBooks, newSubBook, releaseBook, addSharedBook, bringNewFiles } from "../actions.js";
import { needsCount, needsNow, status } from "../reports/dates.js";
import { openItem, addCountdown, addExpiry, daysLeft, expiriesDue } from "./needs.js";
import { indexLibrary, indexed } from "../docs.js";
import { BookTile } from "./bookicons.jsx";
import { Logo } from "./Logo.jsx";
import { FullButton } from "./FrameBar.jsx";
import { BOOK_COLORS } from "../util.js";
import { _t, _n, loc } from "../i18n.js";

function hashOf(s) { let h = 0; for (const c of s) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h; }

export function AccountButton() {
  const s = store.value;
  const u = s?.user || {};
  return (
    <button class="ib" title={u.email || _t("Account")} onClick={(e) => openMenu(e, consult.value ? [
      { title: _t("Reading is locked") },
      { label: _t("Help"), icon: "help", run: () => openPanel("help") },
      { label: _t("Unlock reading..."), icon: "lock", run: () => openPanel("consult") },
    ] : [
      { title: s.kind === "demo" ? _t("Example library (nothing is saved)") : (u.email || "") },
      s.cloud && { label: _t("Open my Drive in ") + s.cloud, icon: "drive", run: () => window.open(s.folderLink(), "_blank") },
      { label: _t("Settings"), icon: "settings", run: () => openPanel("settings") },
      { label: _t("Help"), icon: "help", run: () => openPanel("help") },
      { label: _t("Send feedback"), icon: "feedback", run: () => openPanel("feedback") },
      "-",
      { label: s.kind === "demo" ? _t("Leave the example library") : _t("Sign out"), icon: "logout", run: signOut },
    ])}>
      <span class="avatar">{u.photo ? <img src={u.photo} alt="" referrerpolicy="no-referrer" /> : initials(u.name || "B")}</span>
    </button>
  );
}

// 1.0: upload, right on the shelf - from this computer to My Drive as they are, or your originals from Drive (no copies)
export function uploadItems() {
  return [
    { label: _t("Documents from this computer (into a folder you name)..."), icon: "upload", run: async () => { const fs = await pickFiles(); if (fs.length) uploadFiles(null, fs, { root: true }); } },
    { label: _t("A folder from this computer (it becomes a book)..."), icon: "book", run: () => addFolder() },
    store.value.canPick && { label: _t("From my Google Drive (the originals, no copies)..."), icon: "drive", run: () => addFromDrive() },
  ];
}

export function addItems() {
  return [
    { label: _t("New book from a template..."), icon: "template", run: () => openPanel("templates") },
    { label: _t("New empty book..."), icon: "plus", run: () => newBook().then(b => b && openBook(b.id)) },
    { label: _t("Add a folder... (a book with all its files)"), icon: "book", run: () => addFolder() },
    store.value.canPick && { label: _t("A whole folder from my Google Drive..."), icon: "drive", run: () => addFolderFromDrive() },
    store.value.canPick && { label: _t("Files from my Google Drive..."), icon: "drive", run: () => addFromDrive() },
    store.value.kind === "drive" && { label: _t("A book shared with me..."), icon: "share", run: () => addSharedBook() },
    { label: _t("Add documents... (each one becomes a book)"), icon: "upload", run: () => addDocsAsBooks() },
    { label: _t("Add documents as one book..."), icon: "upload", run: async () => { const fs = await pickFiles(); if (!fs.length) return; const b = await newBook(); if (b) uploadFiles(books.value.find(x => x.id === b.id), fs); } },
    books.value.length > 0 && { label: _t("Add files to the book I was in..."), icon: "addpage", run: async () => { const fs = await pickFiles(); if (fs.length) uploadFiles(null, fs); } },
    "-",
    { label: _t("A new shelf (a name for a row of books)..."), icon: "book", run: () => newShelf() },
  ];
}

function Spine({ b, h, onHover, lean }) {
  const ref = useRef();
  const [drop, setDrop] = useState(false);
  const menuItems = () => [
    { label: _t("Open"), icon: "read", run: () => openBook(b.id) },
    { label: _t("Add files to it"), icon: "upload", run: async () => uploadFiles(b, await pickFiles(), { open: false }) },
    b.shared && { label: _t("Bring in new files (your colleague added)"), icon: "drive", run: () => bringNewFiles(b) },
    { label: _t("Add a folder to it as a sub-book..."), icon: "book", run: () => addFolder(b) },
    { label: _t("New sub-book..."), icon: "plus", run: () => newSubBook(b) },
    { label: _t("Save the whole book as one PDF..."), icon: "download", run: async () => (await import("../filetools.js")).wholeBookAsPdf(b) },
    { label: _t("Rename"), icon: "rename", run: () => renameBook(b) },
    { label: _t("Icon and colour..."), icon: "palette", run: () => openPanel("bookstyle", { id: b.id }) },
    { label: _t("Put it on a shelf") + (bookMeta(b.id).shelf ? ": " + bookMeta(b.id).shelf : ""), icon: "book", sub: shelfItems(b) },
    { label: _t("Share with a colleague..."), icon: "share", run: () => openPanel("share", { id: b.id }) },
    { label: bookMeta(b.id).locked ? _t("Open it without the PIN") : _t("Lock it with the PIN"), icon: "lock", run: () => toggleBookLock(b) },
    { title: _t("Colour") },
    ...BOOK_COLORS.slice(0, 8).map(c => ({ label: c === b.color ? _t("This colour") : "", swatch: c, run: () => setBookColor(b, c) })),
    "-",
    { label: _t("Move left"), icon: "left", run: () => moveBook(b, -1) },
    { label: _t("Move right"), icon: "right", run: () => moveBook(b, 1) },
    "-",
    store.value.kind !== "onedrive" && { label: _t("Take it out of BindLens (it stays in your Drive)"), icon: "logout", run: () => releaseBook(b) },
    { label: _t("Move to the bin"), icon: "trash", danger: true, run: () => deleteBook(b) },
  ];
  const w = 48 + Math.min(16, b.files.length * 2);
  const m = bookMeta(b.id);
  const c = m.color || b.color;
  const [out, setOut] = useState(false);
  const open = () => { setOut(true); setTimeout(() => openBook(b.id), 260); };
  return (
    <button ref={ref} class={"spine" + (lean ? " lean" : "") + (out ? " out" : "") + (m.icon && m.icon !== "letters" ? " withmedal" : "")} title={b.name}
      style={{ height: h + "px", width: w + "px", "--sc": c, "--h": h + "px", "--ms": Math.round(w * 0.62) + "px",
        background: `linear-gradient(90deg, ${mix(c, "#000000", 0.28)} 0%, ${c} 7%, ${mix(c, "#ffffff", 0.06)} 50%, ${c} 93%, ${mix(c, "#000000", 0.3)} 100%)`,
        outline: drop ? "3px solid var(--accent)" : "" }}
      data-bk={b.id} onPointerDown={(e) => bookDragStart(e, b.id)}
      onClick={() => { if (!bookWasDragged()) open(); }}
      onMouseEnter={() => onHover(b)} onFocus={() => onHover(b)} onMouseLeave={() => onHover(null)}
      onContextMenu={(e) => { e.preventDefault(); openMenu({ clientX: e.clientX, clientY: e.clientY, preventDefault() {}, stopPropagation() {} }, menuItems()); }}
      onDragOver={(e) => { e.preventDefault(); setDrop(true); }} onDragLeave={() => setDrop(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDrop(false); uploadFiles(b, [...e.dataTransfer.files], { open: false }); }}>
      <span class="lbl"><span class="t">{b.name}</span>
        {m.icon && m.icon !== "letters" ? <span class="medal"><BookTile book={b} meta={{ ...m, tstyle: "flat", color: c }} size={Math.round(w * 0.42)} /></span> : null}</span>
      <span class="hole" />
      {m.locked && <span class="cnt">🔒</span>}
      {b.shared && <span class="sharedmark" title={_t("Shared with you")}><Icon n="people" size={11} /></span>}
    </button>
  );
}

// a spine that shows its icon is a little taller, so its whole name fits above the icon
function medalRoom(b) {
  const m = bookMeta(b.id);
  return m.icon && m.icon !== "letters" ? (42 + Math.min(20, b.files.length * 2.5)) * 0.62 + 12 : 0;
}

// the library as a list: for many books
function BookList({ all }) {
  const [q, setQ] = useState("");
  const nq = q.trim().toLowerCase();
  const list = all.filter(b => !nq || b.name.toLowerCase().includes(nq));
  const latest = (b) => b.files.reduce((m, f) => (f.modified && f.modified > m ? f.modified : m), b.modified || "");
  return (
    <div class="booklist">
      <div class="bl-bar"><div class="bl-find"><Icon n="search" size={15} /><input placeholder={_t("Find a book")} value={q} onInput={(e) => setQ(e.target.value)} /></div>
        <span class="muted small">{_t("{0} of {1} books", list.length, all.length)}</span></div>
      <div class="bl-table">
        <div class="bl-row head"><span>{_t("Book")}</span><span>{_t("Documents")}</span><span>{_t("Last change")}</span><span /></div>
        {list.map(b => {
          const m = bookMeta(b.id);
          const t = latest(b);
          return (
            <div class="bl-row" key={b.id} data-bk={b.id} onPointerDown={(e) => bookDragStart(e, b.id)} onClick={() => { if (!bookWasDragged()) openBook(b.id); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openBook(b.id); }}>
              <span class="bl-name"><BookTile book={b} meta={m} size={30} /><b>{b.name}</b>{m.locked ? <Icon n="lock" size={13} /> : null}</span>
              <span class="muted">{b.files.length}</span>
              <span class="muted">{t ? fmtDate(new Date(t)) : "-"}</span>
              <span class="bl-open">{_t("Open")} <Icon n="right" size={14} /></span>
            </div>
          );
        })}
        {!list.length && <div class="bl-row"><span class="muted">{_t("No book with that name.")}</span></div>}
      </div>
    </div>
  );
}

// What needs you, beside the shelf: the next three things, the countdowns, See all
// 1.0: notes and reminders for work and study (in the place of What needs you) - a small notebook page: write a
// line, give it a day if you want (it reminds you), tick it when done. Your page reminders show here too.
function NeedsCard() {
  const st = settings.value;
  const [text, setText] = useState("");
  const [tag, setTag] = useState("work");
  const [day, setDay] = useState("");
  const today = isoDate(new Date());
  const notes = st.notes || [];
  const rems = (st.reminders || []).map(r => ({ ...r, rem: true, tag: "work" }));
  const all = [...notes, ...rems].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.date || "9").localeCompare(b.date || "9"));
  const add = () => {
    const t = text.trim();
    if (!t) return;
    setSetting("notes", [{ id: uid(), text: t, tag, date: day || "", done: false, at: Date.now() }, ...notes]);
    setText(""); setDay("");
  };
  const tick = (n) => n.rem ? setSetting("reminders", (st.reminders || []).filter(x => x.id !== n.id))
    : setSetting("notes", notes.map(x => x.id === n.id ? { ...x, done: !x.done } : x));
  const drop = (n) => n.rem ? setSetting("reminders", (st.reminders || []).filter(x => x.id !== n.id)) : setSetting("notes", notes.filter(x => x.id !== n.id));
  const when = (d) => d === today ? _t("today") : new Date(d + "T00:00").toLocaleDateString(loc, { day: "numeric", month: "short" });
  const exps = (st.expiries || []).map(e => ({ ...e, left: daysLeft(e) })).sort((a, b) => a.left - b.left);
  const expWhen = (e) => e.left < 0 ? _t("expired") : e.left === 0 ? _t("today") : _t("in {0} days", e.left);
  // once a day, a warning for what expires soon
  useEffect(() => {
    const due = expiriesDue(); if (!due.length) return;
    const k = "bl-exp-" + isoDate(new Date());
    try { if (localStorage.getItem(k)) return; localStorage.setItem(k, "1"); } catch (e) {}
    due.slice(0, 3).forEach(e => toast(_t("Attention: \"{0}\" expires on {1} ({2})", e.text, fmtDate(new Date(e.date + "T00:00")), daysLeft(e) < 0 ? _t("expired") : _t("in {0} days", daysLeft(e))), "bad"));
  }, []);
  const cds = (st.countdowns || []).map(c => ({ ...c, days: daysBetween(new Date(), new Date(c.date + "T00:00")) })).filter(c => c.days >= 0).sort((a, b) => a.days - b.days);
  return (
    <aside class="needcard notecard">
      <div class="nc-head"><i class="pin" /><b>{_t("Notes")}</b><span class="grow" />
        <div class="seg tiny">{[["work", _t("Work")], ["study", _t("Study")]].map(([k, l]) => <button key={k} class={tag === k ? "on" : ""} onClick={() => setTag(k)}>{l}</button>)}</div></div>
      <div class="nt-add">
        <input class="nt-in" value={text} placeholder={tag === "study" ? _t("Something to study...") : _t("Something to do...")} onInput={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <label class={"nt-day" + (day ? " on" : "")} title={_t("A day to remind you")}><Icon n="calendar" size={14} /><input type="date" value={day} onInput={(e) => setDay(e.target.value)} /></label>
      </div>
      {all.slice(0, 7).map(n => (
        <div key={n.id} class={"nt" + (n.done ? " done" : "") + (n.date && n.date < today && !n.done ? " late" : "")}>
          <button class="nt-box" aria-label={_t("Done")} onClick={() => tick(n)}>{n.done ? <Icon n="check" size={11} /> : null}</button>
          <i class={"nt-tag " + (n.tag || "work")} />
          <span class="grow ellipsis" title={n.text} onClick={() => { if (n.rem && n.bookId) openItem({ ...n, mine: true, date: new Date(n.date + "T00:00") }); }}>{n.text}</span>
          {n.date && <small class="nt-when">{when(n.date)}</small>}
          <button class="nt-x" aria-label={_t("Delete")} onClick={() => drop(n)}><Icon n="close" size={12} /></button>
        </div>
      ))}
      {exps.slice(0, 3).map(e => (
        <div key={e.id} class={"nt exp" + (e.left <= (e.before ?? 30) ? " late" : "")} title={_t("Attention: \"{0}\" expires on {1} ({2})", e.text, fmtDate(new Date(e.date + "T00:00")), expWhen(e))}>
          <Icon n="calendar" size={13} />
          <span class="grow ellipsis" onClick={() => { if (e.bookId) openItem({ ...e, mine: true, page: 0 }); }}>{e.text}</span>
          <small class="nt-when">{expWhen(e)}</small>
          <button class="nt-x" aria-label={_t("Delete")} onClick={() => setSetting("expiries", (st.expiries || []).filter(x => x.id !== e.id))}><Icon n="close" size={12} /></button>
        </div>
      ))}
      {cds.slice(0, 2).map(c => <div key={c.id} class="nt cd"><b class="nt-big">{c.days}</b><span class="grow ellipsis">{c.text}</span><small class="nt-when">{_t("days")}</small></div>)}
      <div class="nc-foot">
        <button class="btn plain small" onClick={() => addCountdown()}><Icon n="hourglass" size={15} />{_t("Count down")}</button>
        <button class="btn plain small" onClick={() => addExpiry()}><Icon n="calendar" size={15} />{_t("Expiry date")}</button>
        <button class="btn plain small" onClick={() => openPanel("inbox")}><Icon n="download" size={15} />{_t("Inbox")}</button>
        <button class="btn plain small" onClick={() => openPanel("tasks")}><Icon n="task" size={15} />{_t("Tasks")}</button>
      </div>
    </aside>
  );
}

// beside the shelf, under What needs you: the documents opened lately, and the reports you made
function agoText(t) {
  const s = (Date.now() - (t || 0)) / 1000;
  if (s < 3600) return _t("{0} min ago", Math.max(1, Math.round(s / 60)));
  if (s < 86400) return _t("{0} h ago", Math.round(s / 3600));
  if (s < 86400 * 7) return _n(Math.round(s / 86400), "{0} day ago", "{0} days ago");
  return fmtDate(new Date(t));
}
function SideCards() {
  const st = settings.value;
  const rec = (st.recentDocs || []).map(r => { const b = books.value.find(x => x.id === r.book); const f = b && b.files.find(x => x.id === r.file); return b && f ? { ...r, b, f } : null; }).filter(Boolean).slice(1, 5);
  const runs = (st.repRuns || []).slice(0, 3);
  if (!rec.length && !runs.length) return null;
  return (
    <aside class="needcard sidecard">
      {rec.length > 0 && <>
        <div class="nc-head"><Icon n="file" size={16} /><b>{_t("Opened lately")}</b></div>
        {rec.map(r => (
          <button key={r.file} class="sc-item" onClick={() => openBook(r.b.id, r.f.id, (bookMeta(r.b.id).last && bookMeta(r.b.id).last.file === r.f.id && bookMeta(r.b.id).last.page) || 0)} title={r.f.name}>
            <BookTile book={r.b} meta={{ ...bookMeta(r.b.id), tstyle: "flat" }} size={22} />
            <span class="nc-txt"><b class="ellipsis">{r.f.name.replace(/\.[^.]+$/, "")}</b><span class="tiny muted ellipsis">{r.b.name} · {agoText(r.at)}</span></span>
          </button>
        ))}
      </>}
      {runs.length > 0 && <>
        <div class="nc-head" style={rec.length ? { marginTop: 8 } : null}><Icon n="reports" size={16} /><b>{_t("Reports you made")}</b><span class="grow" />
          <button class="btn plain small" onClick={() => openPanel("reports")}>{_t("All reports")}<Icon n="right" size={14} /></button></div>
        {runs.map((r, i) => (
          <button key={i} class="sc-item" onClick={() => openPanel("reports", { rerun: { ...r } })} title={_t("Make it again with the documents as they are now: ") + r.title}>
            <span class="sc-ico"><Icon n="reports" size={15} /></span>
            <span class="nc-txt"><b class="ellipsis">{r.title}</b><span class="tiny muted ellipsis">{r.where || ""}{r.rows != null ? _t(" · {0} rows", r.rows) : ""} · {r.at ? agoText(r.at) : r.when}</span></span>
            <Icon n="refresh" size={14} />
          </button>
        ))}
      </>}
    </aside>
  );
}

// the shelves: one per name (a brass plate on its board), books without a shelf on the last one
export function shelfItems(b) {
  const names = settings.value.shelves || [];
  const cur = bookMeta(b.id).shelf || "";
  return [
    ...names.map(n => ({ label: (cur === n ? "✓ " : "") + n, run: () => setBookMeta(b.id, { shelf: n }) })),
    names.length > 0 && { label: (!cur ? "✓ " : "") + _t("No shelf of its own"), run: () => setBookMeta(b.id, { shelf: "" }) },
    "-",
    { label: _t("A new shelf..."), icon: "plus", run: async () => { const n = await newShelf(); if (n) setBookMeta(b.id, { shelf: n }); } },
  ];
}

export async function newShelf() {
  const n = await ask(_t("A new shelf"), { label: _t("Its name, on a brass plate under the books"), placeholder: _t("e.g. Office & administration, University, Clients"), ok: _t("Make the shelf") });
  if (!n) return null;
  const name = n.slice(0, 40);
  setSetting("shelves", [...(settings.value.shelves || []).filter(x => x !== name), name]);
  return name;
}

function plateMenu(e, name) {
  const names = settings.value.shelves || [];
  const i = names.indexOf(name);
  openMenu(e, [
    { title: _t("Shelf: ") + name },
    { label: _t("Rename..."), icon: "rename", run: async () => {
      const n = await ask(_t("Rename the shelf"), { value: name, ok: _t("Rename") });
      if (!n || n === name) return;
      const all = { ...(settings.value.books || {}) };
      for (const k of Object.keys(all)) if (all[k].shelf === name) all[k] = { ...all[k], shelf: n };
      setSetting("books", all);
      setSetting("shelves", names.map(x => x === name ? n : x));
    } },
    i > 0 && { label: _t("Move it up"), icon: "up", run: () => { const a = [...names]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setSetting("shelves", a); } },
    i < names.length - 1 && { label: _t("Move it down"), icon: "down", run: () => { const a = [...names]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setSetting("shelves", a); } },
    { label: _t("A new shelf..."), icon: "plus", run: () => newShelf() },
    "-",
    { label: _t("Take the shelf away (its books stay)"), icon: "trash", danger: true, run: () => {
      const all = { ...(settings.value.books || {}) };
      for (const k of Object.keys(all)) if (all[k].shelf === name) all[k] = { ...all[k], shelf: "" };
      setSetting("books", all);
      setSetting("shelves", names.filter(x => x !== name));
    } },
  ]);
}

export function Home() {
  const all = books.value;
  const wallRef = useRef();
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState(null);
  const [drag, setDrag] = useState(false);
  const [needs, setNeeds] = useState(null);
  useEffect(() => {
    if (!wallRef.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(wallRef.current);
    return () => ro.disconnect();
  }, [settings.value.homeView]);
  useEffect(() => {
    let alive = true;
    const count = () => needsCount().then(n => { if (alive) setNeeds(n); }).catch(() => {});
    count();
    indexed.listeners.add(count);
    indexLibrary();
    return () => { alive = false; indexed.listeners.delete(count); };
  }, [all.length]);

  // the shelves: named ones (Settings > shelves) each with their books; the rest spread evenly, never more than fit
  const phone = width < 560;
  const fit = phone ? Math.max(4, Math.floor((width - 30) / 44)) : Math.max(4, Math.floor((width - 120) / 58));
  const cap = Math.min(fit, phone ? 7 : 10);
  const names = settings.value.shelves || [];
  const groups = [];
  if (names.length) {
    const by = new Map(names.map(n => [n, []]));
    const rest = [];
    for (const b of all) { const sn = bookMeta(b.id).shelf; if (sn && by.has(sn)) by.get(sn).push(b); else rest.push(b); }
    for (const n of names) groups.push({ name: n, books: by.get(n) });
    if (rest.length) groups.push({ name: "", books: rest });
  } else groups.push({ name: "", books: all });
  const shelves = [];      // rows: {name (on the first row of a shelf), books}
  for (const g of groups) {
    const n = g.books.length;
    const rows = names.length ? Math.max(1, Math.ceil((n + 1) / cap)) : (n <= Math.min(7, cap - 1) ? 1 : Math.ceil((n + 1) / cap));
    const per = Math.max(1, Math.ceil((n + 1) / rows));
    for (let i = 0, r = 0; r < rows; i += per, r++) shelves.push({ name: r === 0 ? g.name : "", group: g.name, books: g.books.slice(i, i + per) });
  }
  const addAt = shelves.length - 1;
  const last = settings.value.last;
  const lastBook = last && all.find(b => b.id === last.book);
  const lastFile = lastBook && lastBook.files.find(f => f.id === last.file);
  const now = new Date();
  const longest = Math.max(1, ...shelves.map(r => r.books.length + 1));
  const caseW = phone ? 0 : Math.min(width - 4, Math.max(460, longest * 62 + 120));

  // 1.0 calm: the shelf (or a list) first, "Continue" at the top, What needs you beside the shelf
  const mode = settings.value.homeView || "shelf";
  const setMode = (m) => setSetting("homeView", m);
  return (
    <div class={"home calm" + (mode === "list" ? " listmode" : "")}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setDrag(false); }}
      onDrop={async (e) => { e.preventDefault(); setDrag(false); const fs = [...e.dataTransfer.files]; if (fs.length) uploadFiles(null, fs); }}>
      <div class="home-in">
        <div class="home-top">
          <Logo size={44} />
          <div class="grow">
            <h1>{greeting()}</h1>
            <div class="date">{fmtDate(now, true)}</div>
          </div>
          <div class="home-find phone-only" onClick={() => openPanel("find")} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") openPanel("find"); }}>
            <Icon n="search" size={16} /><span>{_t("Find anything")}</span><kbd>{_t("Ctrl+K")}</kbd>
          </div>
          <div class="seg">
            <button class={mode === "shelf" ? "on" : ""} onClick={() => setMode("shelf")}><Icon n="book" size={15} />{_t("Shelf")}</button>
            <button class={mode === "list" ? "on" : ""} onClick={() => setMode("list")}><Icon n="list" size={15} />{_t("List")}</button>
          </div>
          <button class="btn small soft" title={_t("Upload documents or a folder")} onClick={(e) => openMenu(e, uploadItems())}><Icon n="upload" size={16} />{_t("Upload")}</button>
          <button class="btn small phone-only" onClick={(e) => openMenu(e, addItems())}><Icon n="plus" size={16} />{_t("Add")}</button>
          <span class="phone-only"><AccountButton /></span>
        </div>

        {lastBook ? (
          <div class="contcard">
            <BookTile book={lastBook} meta={{ ...bookMeta(lastBook.id), tstyle: "flat" }} size={34} />
            <div class="grow"><span class="tiny muted cc-k">{_t("Continue where you were")}</span><b>{lastBook.name}{lastFile ? " · " + lastFile.name.replace(/\.[^.]+$/, "") : ""}</b>
              {lastFile && <span class="muted"> {_t("· page")} {(last.page || 0) + 1}</span>}</div>
            <button class="btn small" onClick={continueReading}>{_t("Continue")} <Icon n="right" size={15} /></button>
          </div>
        ) : !all.length ? (
          <div class="contcard empty">
            <div class="grow"><b>{_t("Your library is empty.")}</b> <span class="muted">{_t("Make a book (a folder in your Drive), then add your documents to it.")}</span></div>
            <button class="btn small" onClick={() => openPanel("firstrun")}><Icon n="plus" size={15} />{_t("Make my first book")}</button>
            <button class="btn ghost small" onClick={async () => { const fs = await pickFiles(); if (fs.length) uploadFiles(null, fs); }}><Icon n="upload" size={15} />{_t("Add files")}</button>
          </div>
        ) : null}

        <div class="home-main">
          <div class="home-left">
            {mode === "list" ? <BookList all={all} /> : (
              <div class="bookcase-wrap" ref={wallRef}>
                <div class="bookcase" style={{ width: caseW ? caseW + "px" : undefined }}>
                  <div class="bc-body">
                    {shelves.map((row, si) => (
                      <div class="bc-shelf" key={si}>
                        <div class="bc-back">
                          <div class="booksrun">
                            {row.books.map((b) => <Spine key={b.id} b={b} h={(phone ? 0.78 : 1) * Math.min(232, Math.max(186 + (hashOf(b.name) % 24), b.name.length * 7.4 + 84 + medalRoom(b) * 0.7))} onHover={setHover} />)}
                            {si === addAt && <button class="addspine" title={_t("Add a book")} onClick={(e) => openMenu(e, addItems())}><Icon n="plus" size={18} /></button>}
                          </div>
                        </div>
                        <div class="bc-board">{row.name ? <button class="plate" title={_t("The shelf's name - click to change it")} onClick={(e) => plateMenu(e, row.name)}>{row.name}</button> : null}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>)}
            {mode !== "list" && <div class="hovername">{hover ? <>{hover.name} <span class="muted small">· {hover.files.length} {_t("file")}{hover.files.length === 1 ? "" : "s"}{bookMeta(hover.id).shelf ? " · " + bookMeta(hover.id).shelf : ""}</span></> : ""}</div>}
          </div>
          <div class="home-side"><NeedsCard /><SideCards /></div>
        </div>
      </div>
      {drag && <div class="dropzone">{_t("Drop to add to your library")}</div>}
    </div>
  );
}
