// Home: a modern library. The books stand on shelves; pull one out to open it.
import { useEffect, useRef, useState } from "preact/hooks";
import { books, settings, setSetting, store, openBook, toast, bookMeta, setBookMeta } from "../state.js";
import { greeting, fmtDate, mix, initials, daysBetween } from "../util.js";
import { Icon } from "./icons.jsx";
import { openMenu, ask } from "./dialogs.jsx";
import { newBook, uploadFiles, pickFiles, renameBook, deleteBook, setBookColor, moveBook, openPanel, continueReading,
  addFromDrive, addFolderFromDrive, signOut, toggleBookLock, addFolder, addDocsAsBooks, newSubBook, releaseBook, addSharedBook, bringNewFiles } from "../actions.js";
import { needsCount, needsNow, status } from "../reports/dates.js";
import { openItem, addCountdown } from "./needs.js";
import { indexLibrary, indexed } from "../docs.js";
import { BookTile } from "./bookicons.jsx";
import { Logo } from "./Logo.jsx";
import { FullButton } from "./FrameBar.jsx";
import { BOOK_COLORS } from "../util.js";

function hashOf(s) { let h = 0; for (const c of s) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h; }

export function AccountButton() {
  const s = store.value;
  const u = s?.user || {};
  return (
    <button class="ib" title={u.email || "Account"} onClick={(e) => openMenu(e, [
      { title: s.kind === "demo" ? "Example library (nothing is saved)" : (u.email || "") },
      s.cloud && { label: "Open the BindLens folder in " + s.cloud, icon: "drive", run: () => window.open(s.folderLink(), "_blank") },
      { label: "Settings", icon: "settings", run: () => openPanel("settings") },
      { label: "Help", icon: "help", run: () => openPanel("help") },
      "-",
      { label: s.kind === "demo" ? "Leave the example library" : "Sign out", icon: "logout", run: signOut },
    ])}>
      <span class="avatar">{u.photo ? <img src={u.photo} alt="" referrerpolicy="no-referrer" /> : initials(u.name || "B")}</span>
    </button>
  );
}

function addItems() {
  return [
    { label: "New book from a template...", icon: "template", run: () => openPanel("templates") },
    { label: "New empty book...", icon: "plus", run: () => newBook().then(b => b && openBook(b.id)) },
    { label: "Add a folder... (a book with all its files)", icon: "book", run: () => addFolder() },
    store.value.canPick && { label: "A whole folder from my Google Drive...", icon: "drive", run: () => addFolderFromDrive() },
    store.value.canPick && { label: "Files from my Google Drive...", icon: "drive", run: () => addFromDrive() },
    store.value.kind === "drive" && { label: "A book shared with me...", icon: "share", run: () => addSharedBook() },
    { label: "Add documents... (each one becomes a book)", icon: "upload", run: () => addDocsAsBooks() },
    { label: "Add documents as one book...", icon: "upload", run: async () => { const fs = await pickFiles(); if (!fs.length) return; const b = await newBook(); if (b) uploadFiles(books.value.find(x => x.id === b.id), fs); } },
    books.value.length > 0 && { label: "Add files to the book I was in...", icon: "addpage", run: async () => { const fs = await pickFiles(); if (fs.length) uploadFiles(null, fs); } },
    "-",
    { label: "A new shelf (a name for a row of books)...", icon: "book", run: () => newShelf() },
  ];
}

function Spine({ b, h, onHover, lean }) {
  const ref = useRef();
  const [drop, setDrop] = useState(false);
  const menuItems = () => [
    { label: "Open", icon: "read", run: () => openBook(b.id) },
    { label: "Add files to it", icon: "upload", run: async () => uploadFiles(b, await pickFiles(), { open: false }) },
    b.shared && { label: "Bring in new files (your colleague added)", icon: "drive", run: () => bringNewFiles(b) },
    { label: "Add a folder to it as a sub-book...", icon: "book", run: () => addFolder(b) },
    { label: "New sub-book...", icon: "plus", run: () => newSubBook(b) },
    { label: "Save the whole book as one PDF...", icon: "download", run: async () => (await import("../filetools.js")).wholeBookAsPdf(b) },
    { label: "Rename", icon: "rename", run: () => renameBook(b) },
    { label: "Icon and colour...", icon: "palette", run: () => openPanel("bookstyle", { id: b.id }) },
    { label: "Put it on a shelf" + (bookMeta(b.id).shelf ? ": " + bookMeta(b.id).shelf : ""), icon: "book", sub: shelfItems(b) },
    { label: "Share with a colleague...", icon: "share", run: () => openPanel("share", { id: b.id }) },
    { label: bookMeta(b.id).locked ? "Open it without the PIN" : "Lock it with the PIN", icon: "lock", run: () => toggleBookLock(b) },
    { title: "Colour" },
    ...BOOK_COLORS.slice(0, 8).map(c => ({ label: c === b.color ? "This colour" : "", swatch: c, run: () => setBookColor(b, c) })),
    "-",
    { label: "Move left", icon: "left", run: () => moveBook(b, -1) },
    { label: "Move right", icon: "right", run: () => moveBook(b, 1) },
    "-",
    store.value.kind !== "onedrive" && { label: "Take it out of BindLens (it stays in your Drive)", icon: "logout", run: () => releaseBook(b) },
    { label: "Move to the bin", icon: "trash", danger: true, run: () => deleteBook(b) },
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
      onClick={open}
      onMouseEnter={() => onHover(b)} onFocus={() => onHover(b)} onMouseLeave={() => onHover(null)}
      onContextMenu={(e) => { e.preventDefault(); openMenu({ clientX: e.clientX, clientY: e.clientY, preventDefault() {}, stopPropagation() {} }, menuItems()); }}
      onDragOver={(e) => { e.preventDefault(); setDrop(true); }} onDragLeave={() => setDrop(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDrop(false); uploadFiles(b, [...e.dataTransfer.files], { open: false }); }}>
      <span class="lbl"><span class="t">{b.name}</span>
        {m.icon && m.icon !== "letters" ? <span class="medal"><BookTile book={b} meta={{ ...m, tstyle: "flat", color: c }} size={Math.round(w * 0.42)} /></span> : null}</span>
      <span class="hole" />
      {m.locked && <span class="cnt">🔒</span>}
      {b.shared && <span class="sharedmark" title="Shared with you"><Icon n="people" size={11} /></span>}
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
      <div class="bl-bar"><div class="bl-find"><Icon n="search" size={15} /><input placeholder="Find a book" value={q} onInput={(e) => setQ(e.target.value)} /></div>
        <span class="muted small">{list.length} of {all.length} books</span></div>
      <div class="bl-table">
        <div class="bl-row head"><span>Book</span><span>Documents</span><span>Last change</span><span /></div>
        {list.map(b => {
          const m = bookMeta(b.id);
          const t = latest(b);
          return (
            <div class="bl-row" key={b.id} onClick={() => openBook(b.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openBook(b.id); }}>
              <span class="bl-name"><BookTile book={b} meta={m} size={30} /><b>{b.name}</b>{m.locked ? <Icon n="lock" size={13} /> : null}</span>
              <span class="muted">{b.files.length}</span>
              <span class="muted">{t ? fmtDate(new Date(t)) : "-"}</span>
              <span class="bl-open">Open <Icon n="right" size={14} /></span>
            </div>
          );
        })}
        {!list.length && <div class="bl-row"><span class="muted">No book with that name.</span></div>}
      </div>
    </div>
  );
}

// What needs you, beside the shelf: the next three things, the countdowns, See all
function NeedsCard() {
  const [items, setItems] = useState(null);
  const st = settings.value;
  useEffect(() => {
    let alive = true;
    const run = () => needsNow(true).then(x => { if (alive) setItems(x); }).catch(() => { if (alive) setItems([]); });
    run();
    indexed.listeners.add(run);
    return () => { alive = false; indexed.listeners.delete(run); };
  }, [books.value.length, st.reminders, st.datesDone, st.tasks]);
  const today = new Date();
  const cds = (st.countdowns || []).map(c => ({ ...c, days: daysBetween(today, new Date(c.date + "T00:00")) })).sort((a, b) => a.days - b.days);
  const top = (items || []).slice(0, 3);
  return (
    <aside class="needcard">
      <div class="nc-head"><Icon n="clock" size={16} /><b>What needs you</b><span class="grow" />
        <button class="btn plain small" onClick={() => openPanel("dates")}>See all{items && items.length > 3 ? ` (${items.length})` : ""}<Icon n="right" size={14} /></button></div>
      {!items ? <div class="nc-empty"><div class="spinner" style={{ width: 22, height: 22, margin: 0 }} /><span class="muted small">Reading the dates in your documents...</span></div>
        : !top.length ? <div class="nc-empty"><Icon n="check" size={18} /><span class="small">Nothing needs you in the next 30 days.</span></div>
          : top.map((it, i) => {
            const sv = status(it.days);
            return (
              <button key={i} class="nc-item" onClick={() => openItem(it)} title={it.line}>
                <span class={"nc-day " + sv.cls}><b>{Math.abs(it.days)}</b><small>{it.days === 0 ? "today" : it.days > 0 ? (it.days === 1 ? "day" : "days") : "ago"}</small></span>
                <span class="nc-txt"><b class="ellipsis">{it.what}{it.file ? " · " + it.file.replace(/\.[^.]+$/, "") : ""}</b>
                  <span class="tiny muted ellipsis">{fmtDate(it.date)}{it.book ? " · " + it.book : ""}{it.line && it.mine ? " · " + it.line : ""}</span></span>
              </button>
            );
          })}
      {cds.length > 0 && <div class="nc-sub">Counting down</div>}
      {cds.map(c => (
        <div key={c.id} class={"nc-cd" + (c.days < 0 ? " gone" : "")} onContextMenu={(e) => { e.preventDefault(); openMenu(e, [{ label: "Stop counting down", icon: "trash", run: () => setSetting("countdowns", (st.countdowns || []).filter(x => x.id !== c.id)) }]); }}>
          <span class="nc-big">{c.days < 0 ? "✓" : c.days}</span>
          <span class="nc-txt"><b class="ellipsis">{c.text}</b><span class="tiny muted">{c.days < 0 ? "Gone by · " : c.days === 0 ? "Today · " : c.days === 1 ? "Tomorrow · " : "days to go · "}{fmtDate(new Date(c.date + "T00:00"))}</span></span>
          <button class="ib" title="Stop counting down" onClick={() => setSetting("countdowns", (st.countdowns || []).filter(x => x.id !== c.id))}><Icon n="close" size={15} /></button>
        </div>
      ))}
      <div class="nc-foot">
        <button class="btn plain small" onClick={() => addCountdown()}><Icon n="hourglass" size={15} />Count down</button>
        <button class="btn plain small" onClick={() => openPanel("tasks")}><Icon n="task" size={15} />Tasks{(st.tasks || []).filter(t => !t.done).length ? ` (${(st.tasks || []).filter(t => !t.done).length})` : ""}</button>
      </div>
    </aside>
  );
}

// the shelves: one per name (a brass plate on its board), books without a shelf on the last one
export function shelfItems(b) {
  const names = settings.value.shelves || [];
  const cur = bookMeta(b.id).shelf || "";
  return [
    ...names.map(n => ({ label: (cur === n ? "✓ " : "") + n, run: () => setBookMeta(b.id, { shelf: n }) })),
    names.length > 0 && { label: (!cur ? "✓ " : "") + "No shelf of its own", run: () => setBookMeta(b.id, { shelf: "" }) },
    "-",
    { label: "A new shelf...", icon: "plus", run: async () => { const n = await newShelf(); if (n) setBookMeta(b.id, { shelf: n }); } },
  ];
}

export async function newShelf() {
  const n = await ask("A new shelf", { label: "Its name, on a brass plate under the books", placeholder: "e.g. Office & administration, University, Clients", ok: "Make the shelf" });
  if (!n) return null;
  const name = n.slice(0, 40);
  setSetting("shelves", [...(settings.value.shelves || []).filter(x => x !== name), name]);
  return name;
}

function plateMenu(e, name) {
  const names = settings.value.shelves || [];
  const i = names.indexOf(name);
  openMenu(e, [
    { title: "Shelf: " + name },
    { label: "Rename...", icon: "rename", run: async () => {
      const n = await ask("Rename the shelf", { value: name, ok: "Rename" });
      if (!n || n === name) return;
      const all = { ...(settings.value.books || {}) };
      for (const k of Object.keys(all)) if (all[k].shelf === name) all[k] = { ...all[k], shelf: n };
      setSetting("books", all);
      setSetting("shelves", names.map(x => x === name ? n : x));
    } },
    i > 0 && { label: "Move it up", icon: "up", run: () => { const a = [...names]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setSetting("shelves", a); } },
    i < names.length - 1 && { label: "Move it down", icon: "down", run: () => { const a = [...names]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setSetting("shelves", a); } },
    { label: "A new shelf...", icon: "plus", run: () => newShelf() },
    "-",
    { label: "Take the shelf away (its books stay)", icon: "trash", danger: true, run: () => {
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
            <div class="date">{fmtDate(now, true)}{needs > 0 ? <> · <a class="needlink" onClick={() => openPanel("dates")}>{needs} {needs === 1 ? "thing needs" : "things need"} you</a></> : null}</div>
          </div>
          <div class="home-find" onClick={() => openPanel("find")} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") openPanel("find"); }}>
            <Icon n="search" size={16} /><span>Find anything</span><kbd>Ctrl+K</kbd>
          </div>
          <div class="seg">
            <button class={mode === "shelf" ? "on" : ""} onClick={() => setMode("shelf")}><Icon n="book" size={15} />Shelf</button>
            <button class={mode === "list" ? "on" : ""} onClick={() => setMode("list")}><Icon n="list" size={15} />List</button>
          </div>
          <button class="btn small" onClick={(e) => openMenu(e, addItems())}><Icon n="plus" size={16} />Add</button>
          <FullButton small />
          <AccountButton />
        </div>

        {lastBook ? (
          <div class="contcard">
            <BookTile book={lastBook} meta={{ ...bookMeta(lastBook.id), tstyle: "flat" }} size={34} />
            <div class="grow"><span class="tiny muted cc-k">Continue where you were</span><b>{lastBook.name}{lastFile ? " · " + lastFile.name.replace(/\.[^.]+$/, "") : ""}</b>
              {lastFile && <span class="muted"> · page {(last.page || 0) + 1}</span>}</div>
            <button class="btn small" onClick={continueReading}>Continue <Icon n="right" size={15} /></button>
          </div>
        ) : !all.length ? (
          <div class="contcard empty">
            <div class="grow"><b>Your library is empty.</b> <span class="muted">Make a book (a folder in your Drive), then add your documents to it.</span></div>
            <button class="btn small" onClick={() => openPanel("templates")}><Icon n="plus" size={15} />New book</button>
            <button class="btn ghost small" onClick={async () => { const fs = await pickFiles(); if (fs.length) uploadFiles(null, fs); }}><Icon n="upload" size={15} />Add files</button>
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
                            {si === addAt && <button class="addspine" title="Add a book" onClick={(e) => openMenu(e, addItems())}><Icon n="plus" size={18} /></button>}
                          </div>
                        </div>
                        <div class="bc-board">{row.name ? <button class="plate" title="The shelf's name - click to change it" onClick={(e) => plateMenu(e, row.name)}>{row.name}</button> : null}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>)}
            {mode !== "list" && <div class="hovername">{hover ? <>{hover.name} <span class="muted small">· {hover.files.length} file{hover.files.length === 1 ? "" : "s"}{bookMeta(hover.id).shelf ? " · " + bookMeta(hover.id).shelf : ""}</span></> : ""}</div>}
          </div>
          <NeedsCard />
        </div>
      </div>
      {drag && <div class="dropzone">Drop to add to your library</div>}
    </div>
  );
}
