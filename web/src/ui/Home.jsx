// Home: a modern library. The books stand on shelves; pull one out to open it.
import { useEffect, useRef, useState } from "preact/hooks";
import { books, settings, store, openBook, toast, bookMeta } from "../state.js";
import { greeting, fmtDate, mix, initials } from "../util.js";
import { Icon } from "./icons.jsx";
import { openMenu } from "./dialogs.jsx";
import { newBook, uploadFiles, pickFiles, renameBook, deleteBook, setBookColor, moveBook, openPanel, continueReading,
  addFromDrive, signOut, toggleBookLock } from "../actions.js";
import { needsCount } from "../reports/dates.js";
import { indexLibrary, indexed } from "../docs.js";
import { BOOK_COLORS } from "../util.js";

function hashOf(s) { let h = 0; for (const c of s) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h; }

export function AccountButton() {
  const s = store.value;
  const u = s?.user || {};
  return (
    <button class="ib" title={u.email || "Account"} onClick={(e) => openMenu(e, [
      { title: s.kind === "demo" ? "Example library (nothing is saved)" : (u.email || "") },
      s.kind === "drive" && { label: "Open the BindLens folder in Google Drive", icon: "drive", run: () => window.open(s.folderLink(), "_blank") },
      { label: "Settings", icon: "settings", run: () => openPanel("settings") },
      { label: "Help", icon: "help", run: () => openPanel("help") },
      "-",
      { label: s.kind === "demo" ? "Leave the example library" : "Sign out", icon: "logout", run: signOut },
    ])}>
      <span class="avatar">{u.photo ? <img src={u.photo} alt="" referrerpolicy="no-referrer" /> : initials(u.name || "B")}</span>
    </button>
  );
}

function Frame() {
  return (
    <svg class="pic" viewBox="0 0 54 66" aria-hidden="true">
      <rect x="2" y="2" width="50" height="62" rx="3" fill="#2B2440" />
      <rect x="7" y="7" width="40" height="52" rx="2" fill="#F3EFFA" />
      <circle cx="20" cy="22" r="5" fill="#F2C85A" />
      <path d="M8 56 L22 36 L31 47 L37 40 L46 56Z" fill="#7C5CFF" opacity=".8" />
    </svg>
  );
}

function Vase() {
  return (
    <svg class="plant" viewBox="0 0 44 70" aria-hidden="true">
      <path d="M22 40 C18 24 14 14 8 6 M22 40 C24 22 28 12 36 4 M22 40 C22 26 22 16 22 2" stroke="#8A6A1E" stroke-width="1.6" fill="none" />
      <circle cx="8" cy="6" r="3.5" fill="#F2C85A" /><circle cx="36" cy="4" r="3.5" fill="#FF8A3D" /><circle cx="22" cy="2" r="3" fill="#E06C9F" />
      <path d="M13 40h18c2 8 2 18-3 28H16c-5-10-5-20-3-28z" fill="#6C5CFF" />
      <path d="M13 40h18v4H13z" fill="#8E7FFF" />
    </svg>
  );
}

function Stack() {
  return (
    <div class="stack" aria-hidden="true">
      {[["#C9B8E8", 74], ["#E8C8A0", 66], ["#A8D5C2", 70], ["#F3B7C8", 60]].map(([c, w], i) => <i key={i} style={{ background: c, width: w + "px" }} />)}
    </div>
  );
}

function Spine({ b, h, onHover, lean }) {
  const ref = useRef();
  const [drop, setDrop] = useState(false);
  const menuItems = () => [
    { label: "Open", icon: "read", run: () => openBook(b.id) },
    { label: "Add files to it", icon: "upload", run: async () => uploadFiles(b, await pickFiles(), { open: false }) },
    { label: "Rename", icon: "rename", run: () => renameBook(b) },
    { label: bookMeta(b.id).locked ? "Open it without the PIN" : "Lock it with the PIN", icon: "lock", run: () => toggleBookLock(b) },
    { title: "Colour" },
    ...BOOK_COLORS.slice(0, 8).map(c => ({ label: c === b.color ? "This colour" : "", swatch: c, run: () => setBookColor(b, c) })),
    "-",
    { label: "Move left", icon: "left", run: () => moveBook(b, -1) },
    { label: "Move right", icon: "right", run: () => moveBook(b, 1) },
    "-",
    { label: "Move to the bin", icon: "trash", danger: true, run: () => deleteBook(b) },
  ];
  const w = 40 + Math.min(18, b.files.length * 2);
  return (
    <button ref={ref} class={"spine" + (lean ? " lean" : "")} title={b.name}
      style={{ height: h + "px", width: w + "px", background: `linear-gradient(90deg, ${mix(b.color, "#000000", 0.08)}, ${b.color} 30%, ${mix(b.color, "#ffffff", 0.08)} 70%, ${mix(b.color, "#000000", 0.12)})`,
        outline: drop ? "3px solid var(--accent)" : "" }}
      onClick={() => openBook(b.id)}
      onMouseEnter={() => onHover(b)} onFocus={() => onHover(b)} onMouseLeave={() => onHover(null)}
      onContextMenu={(e) => { e.preventDefault(); openMenu({ clientX: e.clientX, clientY: e.clientY, preventDefault() {}, stopPropagation() {} }, menuItems()); }}
      onDragOver={(e) => { e.preventDefault(); setDrop(true); }} onDragLeave={() => setDrop(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDrop(false); uploadFiles(b, [...e.dataTransfer.files], { open: false }); }}>
      <i class="b1" /><span class="t">{b.name}</span><i class="b2" />
      {bookMeta(b.id).locked && <span class="cnt">🔒</span>}
    </button>
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

  return (
    <div class="home"
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setDrag(false); }}
      onDrop={async (e) => { e.preventDefault(); setDrag(false); const fs = [...e.dataTransfer.files]; if (fs.length) uploadFiles(null, fs); }}>
      <div class="home-in">
        <div class="home-top">
          <div>
            <h1>{greeting()}</h1>
            <div class="date">{fmtDate(now, true)}</div>
          </div>
          <div class="home-find" onClick={() => openPanel("find")} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") openPanel("find"); }}>
            <Icon n="search" /><span>Find a document, a word, an action...</span><kbd>Ctrl+K</kbd>
          </div>
          {needs > 0 && <button class="needs" onClick={() => openPanel("dates")}><i />{needs} {needs === 1 ? "date needs" : "dates need"} you</button>}
          <AccountButton />
        </div>

        <div class="shelfwall" ref={wallRef}>
          {shelves.map((row, si) => (
            <div class="shelf" key={si}>
              <div class="rowbooks">
                <div class="decor left">{si % 2 === 0 ? <Plant /> : <Frame />}</div>
                <div class="booksrun">
                  {row.map((b, bi) => <Spine key={b.id} b={b} h={(phone ? 0.72 : 1) * (156 + (hashOf(b.name) % 46))} onHover={setHover} lean={bi === row.length - 1 && si !== addAt && row.length > 3} />)}
                  {si === addAt && <button class="addspine" title="New book" onClick={() => newBook().then(b => b && openBook(b.id))}>+</button>}
                </div>
                <div class="decor right">{si % 2 === 0 ? <Stack /> : <Vase />}</div>
              </div>
              <div class="board" />
            </div>
          ))}
        </div>

        <div class="hovername">
          {hover ? <>{hover.name} <span class="muted small">· {hover.files.length} file{hover.files.length === 1 ? "" : "s"} · click to open</span></>
            : !all.length ? <span class="muted">Your library is empty. Make a book, then add your documents to it.</span> : ""}
        </div>

        <div class="continue">
          {lastBook ? (
            <button class="btn" onClick={continueReading}>
              Continue · {lastFile ? lastFile.name.replace(/\.[^.]+$/, "") : lastBook.name}
              {lastFile && <small>page {(last.page || 0) + 1}</small>} <Icon n="right" size={16} />
            </button>
          ) : !all.length ? (
            <div class="row wrap" style={{ justifyContent: "center" }}>
              <button class="btn" onClick={() => newBook().then(b => b && openBook(b.id))}><Icon n="plus" />New book</button>
              <button class="btn ghost" onClick={async () => { const fs = await pickFiles(); if (fs.length) uploadFiles(null, fs); }}><Icon n="upload" />Add files</button>
            </div>
          ) : null}
        </div>

        <div class="home-actions">
          <button class="qa" onClick={() => { if (!continueReading()) { if (all[0]) openBook(all[0].id); else toast("Make a book first."); } }}><Icon n="read" />Read</button>
          <button class="qa" onClick={() => openPanel("dates")}><Icon n="clock" />What needs you</button>
          <button class="qa" onClick={() => openPanel("reports")}><Icon n="reports" />Reports</button>
          <button class="qa" onClick={() => openPanel("write")}><Icon n="edit" />Write</button>
          <button class="qa" onClick={() => openPanel("scan")}><Icon n="camera" />Scan</button>
          <button class="qa" onClick={() => { if (!books.value.length) { toast("Make a book first."); return; } if (!settings.value.last) openBook(books.value[0].id); openPanel("study"); }}><Icon n="star" />Study cards</button>
          <button class="qa" onClick={async () => { const fs = await pickFiles(); if (fs.length) uploadFiles(null, fs); }}><Icon n="upload" />Add files</button>
          {store.value.kind === "drive" && <button class="qa" onClick={() => addFromDrive()}><Icon n="drive" />From Drive</button>}
          <button class="qa" onClick={() => openPanel("settings")}><Icon n="palette" />Frame colours</button>
        </div>
      </div>
      {drag && <div class="dropzone">Drop to add to your library</div>}
    </div>
  );
}
