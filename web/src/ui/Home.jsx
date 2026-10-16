// Home: a modern library. The books stand on shelves; pull one out to open it.
import { useEffect, useRef, useState } from "preact/hooks";
import { books, settings, setSetting, store, openBook, toast, bookMeta } from "../state.js";
import { greeting, fmtDate, mix, initials } from "../util.js";
import { Icon } from "./icons.jsx";
import { openMenu } from "./dialogs.jsx";
import { newBook, uploadFiles, pickFiles, renameBook, deleteBook, setBookColor, moveBook, openPanel, continueReading,
  addFromDrive, addFolderFromDrive, signOut, toggleBookLock, addFolder, addDocsAsBooks, newSubBook, releaseBook } from "../actions.js";
import { needsCount } from "../reports/dates.js";
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
    { label: "New empty book...", icon: "plus", run: () => newBook().then(b => b && openBook(b.id)) },
    { label: "Add a folder... (a book with all its files)", icon: "book", run: () => addFolder() },
    store.value.canPick && { label: "A whole folder from my Google Drive...", icon: "drive", run: () => addFolderFromDrive() },
    store.value.canPick && { label: "Files from my Google Drive...", icon: "drive", run: () => addFromDrive() },
    { label: "Add documents... (each one becomes a book)", icon: "upload", run: () => addDocsAsBooks() },
    { label: "Add documents as one book...", icon: "upload", run: async () => { const fs = await pickFiles(); if (!fs.length) return; const b = await newBook(); if (b) uploadFiles(books.value.find(x => x.id === b.id), fs); } },
    books.value.length > 0 && { label: "Add files to the book I was in...", icon: "addpage", run: async () => { const fs = await pickFiles(); if (fs.length) uploadFiles(null, fs); } },
  ];
}

function Spine({ b, h, onHover, lean }) {
  const ref = useRef();
  const [drop, setDrop] = useState(false);
  const menuItems = () => [
    { label: "Open", icon: "read", run: () => openBook(b.id) },
    { label: "Add files to it", icon: "upload", run: async () => uploadFiles(b, await pickFiles(), { open: false }) },
    { label: "Add a folder to it as a sub-book...", icon: "book", run: () => addFolder(b) },
    { label: "New sub-book...", icon: "plus", run: () => newSubBook(b) },
    { label: "Save the whole book as one PDF...", icon: "download", run: async () => (await import("../filetools.js")).wholeBookAsPdf(b) },
    { label: "Rename", icon: "rename", run: () => renameBook(b) },
    { label: "Icon and colour...", icon: "palette", run: () => openPanel("bookstyle", { id: b.id }) },
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
    </button>
  );
}

// a spine that shows its icon is a little taller, so its whole name fits above the icon
function medalRoom(b) {
  const m = bookMeta(b.id);
  return m.icon && m.icon !== "letters" ? (42 + Math.min(20, b.files.length * 2.5)) * 0.62 + 12 : 0;
}

function LyingBooks({ seed = 0 }) {
  const cols = [["#3E7BFF", "#E9A13B", "#8E6CF0"], ["#E06C9F", "#4CC38A", "#F08A4B"], ["#5B8DEF", "#C9A227", "#3FB28F"]][seed % 3];
  return (
    <div class="lying" aria-hidden="true">
      {cols.map((c, i) => <i key={i} style={{ background: `linear-gradient(${mix(c, "#ffffff", 0.18)}, ${c} 45%, ${mix(c, "#000000", 0.22)})`, width: 70 - i * 7 + (seed % 2) * 6 + "px", marginLeft: (i % 2) * 6 + "px" }} />)}
    </div>
  );
}

function Bookend() {
  return <svg class="bookend" viewBox="0 0 26 64" aria-hidden="true"><path d="M3 64V6a4 4 0 0 1 4-4h2v58h17v4z" fill="#C9A227" /><path d="M3 64V6a4 4 0 0 1 4-4h2v58h17v4z" fill="none" stroke="#8A6A1E" stroke-width="1.2" /></svg>;
}

function Hourglass() {
  return (
    <svg class="hourglass" viewBox="0 0 40 64" aria-hidden="true">
      <rect x="4" y="2" width="32" height="5" rx="2" fill="#8B5E3C" /><rect x="4" y="57" width="32" height="5" rx="2" fill="#8B5E3C" />
      <path d="M9 7h22c0 12-8 15-8 25s8 13 8 25H9c0-12 8-15 8-25S9 19 9 7z" fill="rgba(255,255,255,.55)" stroke="#E8D9C5" stroke-width="1.5" />
      <path class="sand-top" d="M12 12h16c-1 7-6 10-8 14-2-4-7-7-8-14z" fill="#F2C85A" /><path class="sand-bot" d="M12 55h16c-2-8-6-10-8-14-2 4-6 6-8 14z" fill="#F2C85A" />
    </svg>
  );
}

function TopDecor() {
  return (
    <div class="topdecor" aria-hidden="true">
      <svg class="globe" viewBox="0 0 60 70"><path d="M30 64v-6M18 66h24" stroke="#8A6A1E" stroke-width="3" stroke-linecap="round" /><path d="M50 30a20 20 0 0 1-30 17" stroke="#C9A227" stroke-width="3" fill="none" /><circle cx="30" cy="30" r="18" fill="#5AA9E6" /><path d="M20 20c6 2 6 8 12 8s6 6 2 10M36 14c-2 4 2 6 6 6" stroke="#3FB28F" stroke-width="5" fill="none" stroke-linecap="round" /><circle cx="24" cy="22" r="5" fill="rgba(255,255,255,.35)" /></svg>
      <span class="grow" />
      <svg class="lamp" viewBox="0 0 60 70"><path d="M16 66h28" stroke="#3A2E2A" stroke-width="5" stroke-linecap="round" /><path d="M30 64V36l12-14" stroke="#3A2E2A" stroke-width="3.5" fill="none" stroke-linecap="round" /><path d="M30 8l20 6-6 18-22-8z" fill="#E9A13B" /><path d="M24 26l18 6" stroke="#B8892A" stroke-width="2" /><ellipse class="glow" cx="33" cy="34" rx="12" ry="6" fill="#FFE9A8" opacity=".55" /></svg>
      <Plant />
    </div>
  );
}

function Plant() {
  return (
    <svg class="plant" viewBox="0 0 44 70" aria-hidden="true">
      <path d="M22 44 C10 30 6 18 10 8 C18 16 22 28 22 44Z" fill="#4CAF7A" />
      <path d="M22 44 C30 28 38 22 40 12 C30 16 24 28 22 44Z" fill="#3E9C6A" />
      <path d="M22 44 C16 36 4 34 2 26 C12 26 20 32 22 44Z" fill="#5FC08A" />
      <path d="M10 44h24l-3 24H13z" fill="#E7DCCB" />
      <path d="M10 44h24v4H10z" fill="#D8C9B2" />
    </svg>
  );
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
  }, []);
  useEffect(() => {
    let alive = true;
    const count = () => needsCount().then(n => { if (alive) setNeeds(n); }).catch(() => {});
    count();
    indexed.listeners.add(count);
    indexLibrary();
    return () => { alive = false; indexed.listeners.delete(count); };
  }, [all.length]);

  // the books on two or three shelves, spread evenly and centred, never more than fit on one shelf
  const phone = width < 560;
  const fit = phone ? Math.max(4, Math.floor((width - 30) / 44)) : Math.max(4, Math.floor((width - 200) / 58));
  const cap = Math.min(fit, phone ? 7 : 9);
  const nShelves = all.length <= Math.min(7, cap - 1) ? 1 : Math.ceil((all.length + 1) / cap);
  const per = Math.max(1, Math.ceil((all.length + 1) / nShelves));
  const shelves = [];
  for (let i = 0; i < Math.max(1, all.length); i += per) shelves.push(all.slice(i, i + per));
  if (!shelves.length) shelves.push([]);
  const addAt = shelves.length - 1;
  const last = settings.value.last;
  const lastBook = last && all.find(b => b.id === last.book);
  const lastFile = lastBook && lastBook.files.find(f => f.id === last.file);
  const now = new Date();
  const longest = Math.max(1, ...shelves.map(r => r.length + 1));
  const caseW = phone ? 0 : Math.min(width - 20, Math.max(520, longest * 62 + 260));

  // 1.0 calm: the shelf (or a list) first, "Continue" at the top; the rest of the actions are on the frame
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
            <div class="date">{fmtDate(now, true)}{needs > 0 ? <> · <a class="needlink" onClick={() => openPanel("dates")}>{needs} {needs === 1 ? "date needs" : "dates need"} you</a></> : null}</div>
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
            <BookTile book={lastBook} meta={bookMeta(lastBook.id)} size={36} />
            <div class="grow"><b>{lastBook.name}{lastFile ? " · " + lastFile.name.replace(/\.[^.]+$/, "") : ""}</b>
              {lastFile && <span class="muted"> · page {(last.page || 0) + 1}</span>}</div>
            <button class="btn small" onClick={continueReading}>Continue <Icon n="right" size={15} /></button>
          </div>
        ) : !all.length ? (
          <div class="contcard empty">
            <div class="grow"><b>Your library is empty.</b> <span class="muted">Make a book (a folder in your Drive), then add your documents to it.</span></div>
            <button class="btn small" onClick={() => newBook().then(b => b && openBook(b.id))}><Icon n="plus" size={15} />New book</button>
            <button class="btn ghost small" onClick={async () => { const fs = await pickFiles(); if (fs.length) uploadFiles(null, fs); }}><Icon n="upload" size={15} />Add files</button>
          </div>
        ) : null}

        {mode === "list" ? <BookList all={all} /> : (
        <div class="bookcase-wrap" ref={wallRef}>
          <div class="bookcase" style={{ width: caseW ? caseW + "px" : undefined }}>
            <div class="bc-body">
              {shelves.map((row, si) => (
                <div class="bc-shelf" key={si}>
                  <div class="bc-back">
                    <div class="booksrun">
                      {row.map((b) => <Spine key={b.id} b={b} h={(phone ? 0.78 : 1) * Math.min(232, Math.max(186 + (hashOf(b.name) % 24), b.name.length * 7.4 + 84 + medalRoom(b) * 0.7))} onHover={setHover} />)}
                      {si === addAt && <button class="addspine" title="Add a book" onClick={(e) => openMenu(e, addItems())}><Icon n="plus" size={18} /></button>}
                    </div>
                  </div>
                  <div class="bc-board" />
                </div>
              ))}
            </div>
          </div>
        </div>)}
        {mode !== "list" && <div class="hovername">{hover ? <>{hover.name} <span class="muted small">· {hover.files.length} file{hover.files.length === 1 ? "" : "s"}</span></> : ""}</div>}
      </div>
      {drag && <div class="dropzone">Drop to add to your library</div>}
    </div>
  );
}
