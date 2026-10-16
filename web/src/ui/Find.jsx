// Find (Ctrl+K): a document, a book, a word inside any document, or something to do.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { books, openBook, goHome, readMode, panel, locked, settings, store, view } from "../state.js";
import { wordsOf, getDoc, call } from "../docs.js";
import { Icon, fileIcon } from "./icons.jsx";
import { openPanel, newBook, uploadFiles, pickFiles, signOut, continueReading } from "../actions.js";
import { searchHits, scrollTo } from "./Viewer.jsx";
import { escapeHtml, isPaged, initials } from "../util.js";

const ACTIONS = [
  { label: "New book", icon: "plus", words: "new book folder make create", run: () => newBook().then(b => b && openBook(b.id)) },
  { label: "Add files", icon: "upload", words: "add upload files documents import", run: async () => uploadFiles(null, await pickFiles()) },
  { label: "Reports", icon: "reports", words: "reports contacts emails phones tables excel data extract", run: () => openPanel("reports") },
  { label: "What needs you (dates and deadlines)", icon: "clock", words: "dates deadlines expiry renewal due calendar reminders what needs you", run: () => openPanel("dates") },
  { label: "Write a new document", icon: "edit", words: "write new document letter page template notes invoice", run: () => openPanel("write") },
  { label: "Scan pages", icon: "camera", words: "scan camera photo phone paper", run: () => openPanel("scan") },
  { label: "Study cards (my highlights)", icon: "star", words: "study cards flashcards review revise learn exam highlights", run: () => openPanel("study") },
  { label: "Photos as a gallery", icon: "image", words: "photos gallery pictures slideshow", run: () => openPanel("gallery") },
  { label: "Print", icon: "print", words: "print printer paper", run: () => openPanel("print") },
  { label: "Reading mode", icon: "read", words: "read reading calm mode", run: () => { if (view.value !== "book") continueReading(); readMode.value = true; } },
  { label: "Continue where I was", icon: "right", words: "continue last open resume", run: () => continueReading() },
  { label: "Home", icon: "home", words: "home library shelf bookcase start", run: () => goHome() },
  { label: "Frame colours", icon: "palette", words: "frame colours colors personalise customize look theme", run: () => openPanel("settings") },
  { label: "Lock with a PIN", icon: "lock", words: "lock pin password", run: () => { if (settings.value.pin) locked.value = true; else openPanel("pin"); } },
  { label: "Settings", icon: "settings", words: "settings options", run: () => openPanel("settings") },
  { label: "Help", icon: "help", words: "help how to guide", run: () => openPanel("help") },
  { label: "Sign out", icon: "logout", words: "sign out log out exit leave", run: () => signOut() },
];

function norm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

function snippet(text, at, len) {
  const a = Math.max(0, at - 50), b = Math.min(text.length, at + len + 70);
  const s = (a > 0 ? "…" : "") + text.slice(a, at) + "\u0001" + text.slice(at, at + len) + "\u0002" + text.slice(at + len, b) + (b < text.length ? "…" : "");
  return escapeHtml(s.replace(/\s+/g, " ")).replace("\u0001", "<mark>").replace("\u0002", "</mark>");
}

export async function goToWord(book, file, page, query) {
  openBook(book.id, file.id, page);
  try {
    const d = await getDoc(file);
    const res = await call("search", d.key, query);
    const list = res.map((r, n) => ({ fileId: file.id, file: file.name, page: r.page, quads: r.hits.flat(), count: r.hits.length, n }));
    const cur = list.find(x => x.page === page) || list[0];
    searchHits.value = { query, list, cur };
    scrollTo.value = { fileId: file.id, page: cur ? cur.page : page, y: cur?.quads[0]?.[1] };
  } catch (e) { scrollTo.value = { fileId: file.id, page }; }
}

export function Find() {
  const [q, setQ] = useState(panel.value?.q || "");
  const [words, setWords] = useState([]);
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(0);
  const ref = useRef();
  const close = () => { panel.value = null; };
  useEffect(() => { setTimeout(() => ref.current?.focus(), 20); }, []);

  const nq = norm(q.trim());
  const quick = useMemo(() => {
    if (!nq) {
      const recent = (settings.value.recent || []).map(id => books.value.find(b => b.id === id)).filter(Boolean).slice(0, 5);
      return [
        ...recent.map(b => ({ type: "book", b, label: b.name, sub: `${b.files.length} files` })),
        ...ACTIONS.slice(0, 6).map(a => ({ type: "action", a, label: a.label })),
      ];
    }
    const out = [];
    for (const a of ACTIONS) if (norm(a.label + " " + a.words).includes(nq)) out.push({ type: "action", a, label: a.label });
    for (const b of books.value) {
      if (norm(b.name).includes(nq)) out.push({ type: "book", b, label: b.name, sub: `Book · ${b.files.length} files` });
      for (const f of b.files) if (norm(f.name).includes(nq)) out.push({ type: "file", b, f, label: f.name, sub: b.name });
    }
    return out.slice(0, 30);
  }, [nq, books.value]);

  // words inside the documents (a moment after typing stops)
  useEffect(() => {
    if (nq.length < 2) { setWords([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      setBusy(true);
      const found = [];
      for (const b of books.value) {
        for (const f of b.files) {
          if (!alive) return;
          if (!isPaged(f.kind) || f.kind === "image") continue;
          try {
            const { pages } = await wordsOf(f);
            pages.forEach((text, page) => {
              const n = norm(text);
              let at = n.indexOf(nq), count = 0, first = at;
              while (at >= 0 && count < 50) { count++; at = n.indexOf(nq, at + nq.length); }
              if (count) found.push({ type: "word", b, f, page, count, html: snippet(text, first, nq.length) });
            });
          } catch (e) {}
          if (alive && found.length) setWords([...found]);
        }
      }
      if (alive) { setWords([...found]); setBusy(false); }
    }, 250);
    return () => { alive = false; clearTimeout(t); setBusy(false); };
  }, [nq]);

  const all = [...quick, ...words.slice(0, 60)];
  const choose = (it) => {
    close();
    if (it.type === "action") it.a.run();
    else if (it.type === "book") openBook(it.b.id);
    else if (it.type === "file") { openBook(it.b.id, it.f.id, 0); scrollTo.value = { fileId: it.f.id, page: 0 }; }
    else if (it.type === "word") goToWord(it.b, it.f, it.page, q.trim());
  };
  const key = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOn(Math.min(all.length - 1, on + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setOn(Math.max(0, on - 1)); }
    if (e.key === "Enter" && all[on]) choose(all[on]);
    if (e.key === "Escape") close();
  };
  useEffect(() => setOn(0), [nq]);

  let lastGroup = null;
  const groupOf = (it) => ({ action: "Do", book: "Books", file: "Documents", word: "Words inside your documents" })[it.type];
  return (
    <div class="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} style={{ alignItems: "flex-start" }}>
      <div class="dialog palette">
        <div class="row" style={{ paddingRight: 12 }}>
          <input ref={ref} value={q} onInput={(e) => setQ(e.target.value)} onKeyDown={key}
            placeholder="Find a document, a word, an action..." aria-label="Find" />
          {busy && <div class="spinner" style={{ width: 20, height: 20, borderWidth: 3, margin: 0 }} />}
        </div>
        <div class="results">
          {!all.length && nq && !busy && <p class="muted small" style={{ padding: 12 }}>Nothing found for "{q}".</p>}
          {all.map((it, i) => {
            const g = groupOf(it);
            const head = g !== lastGroup ? <div class="grouph">{g}</div> : null;
            lastGroup = g;
            const color = it.b ? it.b.color : "var(--accent)";
            return (
              <div key={i}>
                {head}
                <button class={"res" + (i === on ? " on" : "")} onMouseEnter={() => setOn(i)} onClick={() => choose(it)}>
                  <span class="ico" style={{ background: it.type === "action" ? "var(--accent-soft)" : color, color: it.type === "action" ? "var(--accent)" : "#fff" }}>
                    {it.type === "action" ? <Icon n={it.a.icon} size={16} /> : it.type === "book" ? initials(it.b.name) : <Icon n={fileIcon(it.f.kind)} size={16} />}
                  </span>
                  <span class="grow" style={{ minWidth: 0 }}>
                    {it.type === "word" ? <>
                      <div class="small"><b>{it.f.name}</b> <span class="muted">· {it.b.name} · page {it.page + 1}{it.count > 1 ? ` · ${it.count} times` : ""}</span></div>
                      <div class="ctx" dangerouslySetInnerHTML={{ __html: it.html }} />
                    </> : <>
                      <div class="ellipsis">{it.label}</div>
                      {it.sub && <div class="ctx">{it.sub}</div>}
                    </>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        <div class="tiny muted" style={{ padding: "8px 14px", borderTop: "1px solid var(--line)" }}>↑ ↓ to choose · Enter to open · Esc to close{store.value.kind === "drive" ? " · words are read from your documents the first time, then remembered in this browser" : ""}</div>
      </div>
    </div>
  );
}
