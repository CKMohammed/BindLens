// Find (Ctrl+K): a document, a book, a word inside any document, or something to do.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { books, openBook, goHome, readMode, panel, locked, settings, store, view } from "../state.js";
import { wordsOf, getDoc, call } from "../docs.js";
import { Icon, fileIcon } from "./icons.jsx";
import { openPanel, newBook, uploadFiles, pickFiles, signOut, continueReading } from "../actions.js";
import { searchHits, scrollTo } from "./Viewer.jsx";
import { BookTile } from "./bookicons.jsx";
import { bookMeta, bookHidden } from "../state.js";
import { escapeHtml, isPaged, initials } from "../util.js";
import { _t, loc, _tv, isEs, setLang } from "../i18n.js";
import { ribbonActions } from "./Ribbon.jsx";
import { currentBook } from "../state.js";

const ACTIONS = [
  { label: _t("New book"), icon: "plus", words: _t("new book folder make create"), run: () => newBook().then(b => b && openBook(b.id)) },
  { label: _t("Add files"), icon: "upload", words: _t("add upload files documents import"), run: async () => uploadFiles(null, await pickFiles()) },
  { label: _t("Dark mode"), icon: "moon", words: _t("dark night theme black look"), run: async () => { const st = await import("../state.js"); st.setSetting("theme", "dark"); } },
  { label: _t("Light mode"), icon: "sun", words: _t("light day theme white look"), run: async () => { const st = await import("../state.js"); st.setSetting("theme", "light"); } },
  { label: _t("Fast: nothing moves"), icon: "bolt", words: _t("fast animations motion still quick"), run: async () => { const st = await import("../state.js"); st.setSetting("fast", !st.settings.value.fast); } },
  { label: _t("Reports"), icon: "reports", words: _t("reports contacts emails phones tables excel data extract"), run: () => openPanel("reports") },
  { label: _t("Write a new document"), icon: "edit", words: _t("write new document letter page template notes invoice"), run: () => openPanel("write") },
  { label: _t("Scan pages"), icon: "scan", words: _t("scan camera photo phone paper"), run: () => openPanel("scan") },
  { label: _t("Study cards (my highlights)"), icon: "star", words: _t("study cards flashcards review revise learn exam highlights"), run: () => openPanel("study") },
  { label: _t("Photos as a gallery"), icon: "image", words: _t("photos gallery pictures slideshow"), run: () => openPanel("gallery") },
  { label: _t("Print"), icon: "print", words: _t("print printer paper"), run: () => openPanel("print") },
  { label: _t("Reading mode"), icon: "read", words: _t("read reading calm mode"), run: () => { if (view.value !== "book") continueReading(); readMode.value = true; } },
  { label: _t("Rows with a name or value (report)"), icon: "table", words: _t("rows name value table report person filas"), run: () => openPanel("reports", { pickId: "rows" }) },
  { label: _t("Rows as they look (report)"), icon: "image", words: _t("rows look pictures snapshot report person filas"), run: () => openPanel("reports", { pickId: "snapshot" }) },
  { label: _t("Continue where I was"), icon: "right", words: _t("continue last open resume"), run: () => continueReading() },
  { label: _t("Home"), icon: "home", words: _t("home library shelf bookcase start"), run: () => goHome() },
  { label: _t("Frame colours"), icon: "palette", words: _t("frame colours colors personalise customize look theme"), run: () => openPanel("settings", { group: "look" }) },
  { label: _t("Lock with a PIN"), icon: "lock", words: _t("lock pin password"), run: () => { if (settings.value.pin) locked.value = true; else openPanel("pin"); } },
  { label: _t("Settings"), icon: "settings", words: _t("settings options"), run: () => openPanel("settings") },
  { label: _t("Settings: Look"), icon: "palette", words: _t("look theme dark light frame colours language"), run: () => openPanel("settings", { group: "look" }) },
  { label: _t("Settings: Your institution"), icon: "palette", words: _t("institution logo colours brand company university office"), run: () => openPanel("settings", { group: "inst" }) },
  { label: _t("Settings: Privacy and PIN"), icon: "lock", words: _t("privacy pin lock notifications offline log changes"), run: () => openPanel("settings", { group: "privacy" }) },
  { label: _t("Settings: Account"), icon: "settings", words: _t("account sign out drive folder about version"), run: () => openPanel("settings", { group: "account" }) },
  { label: isEs ? "Language: English" : "Idioma: Español", icon: "settings", words: "language idioma english español spanish ingles inglés castellano", run: () => setLang(isEs ? "en" : "es") },
  { label: _t("Next deadline"), icon: "bell", words: _t("next deadline due soon date renewal expiry"), run: async () => {
    const { allDeadlines, needs } = await import("../reports/dates.js");
    const list = (await allDeadlines(null, true)).filter(x => x.days >= 0);
    const it = list[0];
    if (!it) { openPanel("dates"); return; }
    const b = books.value.find(x => x.id === it.bookId), f = b && b.files.find(x => x.id === it.fileId);
    if (b && f) goToWord(b, f, it.page, it.line.slice(0, 40)); else openPanel("dates");
    void needs;
  } },
  { label: _t("Help"), icon: "help", words: _t("help how to guide"), run: () => openPanel("help") },
  { label: _t("Add pages (blank, lined, from a file, Google Docs)"), icon: "addpage", words: _t("add page pages blank lined squared insert google docs sheets slides word"), run: async () => { const { currentBook } = await import("../state.js"); openPanel("addpages", { book: currentBook.value?.id }); } },
  { label: _t("Write it in Google Docs"), icon: "word", words: _t("google docs sheets slides word excel powerpoint real editor write"), run: async () => { const { currentBook } = await import("../state.js"); openPanel("addpages", { book: currentBook.value?.id, tab: "google" }); } },
  { label: _t("Inbox (documents to file)"), icon: "download", words: _t("inbox new incoming file unfiled sort documents to do"), run: () => openPanel("inbox") },
  { label: _t("Tasks"), icon: "task", words: _t("tasks to do todo colleague assign"), run: () => openPanel("tasks") },
  { label: _t("Make a book in two steps"), icon: "sparkle", words: _t("first start begin two steps template drive"), run: () => openPanel("firstrun") },
  { label: _t("New book from a template"), icon: "template", words: _t("template new book case file employee student project thesis course client"), run: () => openPanel("templates") },
  { label: _t("Count down to a date"), icon: "hourglass", words: _t("countdown count down days left exam audit deadline"), run: async () => (await import("./needs.js")).addCountdown() },
  { label: _t("Share this book with a colleague"), icon: "share", words: _t("share colleague team send invite permission"), run: async () => { const { currentBook } = await import("../state.js"); if (currentBook.value) openPanel("share", { id: currentBook.value.id }); else openPanel("help"); } },
  { label: _t("A book shared with me"), icon: "share", words: _t("shared with me colleague open shared book"), run: async () => (await import("../actions.js")).addSharedBook() },
  { label: _t("Keyboard shortcuts"), icon: "type", words: _t("keyboard shortcuts keys"), run: () => openPanel("keys") },
  { label: _t("Send feedback"), icon: "feedback", words: _t("feedback bug problem idea report suggestion"), run: () => openPanel("feedback") },
  { label: _t("The tour (how BindLens works)"), icon: "sparkle", words: _t("tour welcome start introduction what is"), run: () => openPanel("welcome") },
  { label: _t("Licence, privacy and legal"), icon: "info", words: _t("licence license privacy legal agpl source code terms"), run: () => openPanel("legal") },
  { label: _t("Add a folder (a book with all its files)"), icon: "book", words: _t("add folder import directory book"), run: async () => (await import("../actions.js")).addFolder() },
  { label: _t("Add documents (each one becomes a book)"), icon: "upload", words: _t("add documents books import each"), run: async () => (await import("../actions.js")).addDocsAsBooks() },
  { label: _t("Save the whole book as one PDF"), icon: "download", words: _t("whole book one pdf join merge combine export"), run: async () => { const { currentBook } = await import("../state.js"); if (!currentBook.value) { openPanel("help"); return; } (await import("../filetools.js")).wholeBookAsPdf(currentBook.value); } },
  { label: _t("Earlier versions of this document"), icon: "clock", words: _t("earlier versions history restore go back revision"), run: async () => { const { fileId } = await import("../state.js"); if (fileId.value) openPanel("versions", { fileId: fileId.value }); } },
  { label: _t("Copy with a password"), icon: "lock", words: _t("password protect encrypt read-only copy"), run: async () => { const { fileId } = await import("../state.js"); if (fileId.value) openPanel("protect", { fileId: fileId.value }); } },
  { label: _t("Send by email"), icon: "mail", words: _t("send email share mail attach"), run: async () => { const { fileId } = await import("../state.js"); const { fileFor } = await import("../docs.js"); const f = fileFor(fileId.value); if (f) (await import("../filetools.js")).sendFile(f); } },
  { label: _t("Sign out"), icon: "logout", words: _t("sign out log out exit leave"), run: () => signOut() },
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

// the filters of Find: a book, a kind of file, a status, when it changed
const KIND_F = [["", _t("Any kind")], ["pdf", _t("PDF")], ["word", _t("Word and Docs")], ["excel", _t("Excel and Sheets")], ["powerpoint", _t("PowerPoint and Slides")],
  ["image", _t("Pictures")], ["mail", _t("E-mails")], ["text", _t("Text")]];
const WHEN_F = [["", _t("Any time")], ["1", _t("Today")], ["7", _t("Last 7 days")], ["30", _t("Last 30 days")], ["365", _t("This year")]];
function kindOk(f, k) {
  if (!k) return true;
  if (k === "mail") return /\.eml$/i.test(f.name);
  if (k === "word") return f.kind === "word" || (f.kind === "gdoc" && /document/.test(f.mime || ""));
  if (k === "excel") return f.kind === "excel" || (f.kind === "gdoc" && /spreadsheet/.test(f.mime || ""));
  if (k === "powerpoint") return f.kind === "powerpoint" || (f.kind === "gdoc" && /presentation/.test(f.mime || ""));
  return f.kind === k;
}
function whenOk(f, w) {
  if (!w) return true;
  const t = f.modified ? new Date(f.modified).getTime() : 0;
  if (!t) return false;
  if (w === "365") return new Date(t).getFullYear() === new Date().getFullYear();
  if (w === "1") return new Date(t).toDateString() === new Date().toDateString();
  return Date.now() - t <= Number(w) * 86400000;
}

export function Find() {
  const [q, setQ] = useState(panel.value?.q || "");
  const [flt, setFlt] = useState({ book: panel.value?.book || "", kind: "", status: "", when: "" });
  // a book locked with the PIN keeps its files and words to itself until it is opened
  const fileOk = (b, f) => !bookHidden(b) && (!flt.book || b.id === flt.book) && kindOk(f, flt.kind) && (!flt.status || (settings.value.tags || {})[f.id] === flt.status) && whenOk(f, flt.when);
  const anyF = !!(flt.book || flt.kind || flt.status || flt.when);
  const [words, setWords] = useState([]);
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(0);
  const ref = useRef();
  const close = () => { panel.value = null; };
  useEffect(() => { setTimeout(() => ref.current?.focus(), 20); }, []);

  const nq = norm(q.trim());
  const quick = useMemo(() => {
    if (!nq && anyF) {
      const out = [];
      for (const b of books.value) for (const f of b.files) if (fileOk(b, f)) out.push({ type: "file", b, f, label: f.name, sub: b.name + (f.modified ? " · " + new Date(f.modified).toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" }) : "") });
      return out.slice(0, 80);
    }
    if (!nq) {
      const recent = (settings.value.recent || []).map(id => books.value.find(b => b.id === id)).filter(Boolean).slice(0, 5);
      return [
        ...recent.map(b => ({ type: "book", b, label: b.name, sub: _t("{0} files", b.files.length) })),
        ...ACTIONS.slice(0, 6).map(a => ({ type: "action", a, label: a.label })),
      ];
    }
    const out = [];
    if (!anyF) {
      const rib = view.value === "book" && currentBook.value ? ribbonActions(currentBook.value) : [];
      for (const a of ACTIONS) if (norm(a.label + " " + a.words).includes(nq)) out.push({ type: "action", a, label: a.label });
      for (const a of rib) if (norm(a.label + " " + a.words).includes(nq) && !out.some(o => o.label === a.label)) out.push({ type: "action", a, label: a.label, sub: a.sub });
    }
    for (const b of books.value) {
      if (!anyF && norm(b.name).includes(nq)) out.push({ type: "book", b, label: b.name, sub: _t("Book · {0} files", b.files.length) });
      for (const f of b.files) if (norm(f.name).includes(nq) && fileOk(b, f)) out.push({ type: "file", b, f, label: f.name, sub: b.name });
    }
    return out.slice(0, 30);
  }, [nq, books.value, flt]);

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
          if (!isPaged(f.kind) || f.kind === "image" || !fileOk(b, f)) continue;
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
  }, [nq, flt]);

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
  const groupOf = (it) => ({ action: _t("Do"), book: _t("Books"), file: _t("Documents"), word: _t("Words inside your documents") })[it.type];
  return (
    <div class="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} style={{ alignItems: "flex-start" }}>
      <div class="dialog palette">
        <div class="row" style={{ paddingRight: 12 }}>
          <input ref={ref} value={q} onInput={(e) => setQ(e.target.value)} onKeyDown={key}
            placeholder={_t("Find a document, a word, an action...")} aria-label={_t("Find")} />
          {busy && <div class="spinner" style={{ width: 20, height: 20, borderWidth: 3, margin: 0 }} />}
        </div>
        <div class="findf">
          <Icon n="filter" size={14} />
          <select class={flt.book ? "set" : ""} value={flt.book} onChange={(e) => setFlt({ ...flt, book: e.target.value })} aria-label={_t("Book")}>
            <option value="">{_t("All books")}</option>{books.value.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select class={flt.kind ? "set" : ""} value={flt.kind} onChange={(e) => setFlt({ ...flt, kind: e.target.value })} aria-label={_t("Kind")}>
            {KIND_F.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select class={flt.status ? "set" : ""} value={flt.status} onChange={(e) => setFlt({ ...flt, status: e.target.value })} aria-label={_t("Status")}>
            <option value="">{_t("Any status")}</option>{[...new Set(["Pending", "Checked", "Signed", "Done", "Urgent", "Waiting", ...Object.values(settings.value.tags || {})])].map(t => <option key={t} value={t}>{_tv(t)}</option>)}
          </select>
          <select class={flt.when ? "set" : ""} value={flt.when} onChange={(e) => setFlt({ ...flt, when: e.target.value })} aria-label={_t("Changed")}>
            {WHEN_F.map(([k, l]) => <option key={k} value={k}>{k ? _t("Changed: ") + l.toLowerCase() : _t("Changed: any time")}</option>)}
          </select>
          {anyF && <button class="btn plain small" onClick={() => setFlt({ book: "", kind: "", status: "", when: "" })}>{_t("Clear")}</button>}
        </div>
        <div class="results">
          {!all.length && (nq || anyF) && !busy && <p class="muted small" style={{ padding: 12 }}>{nq ? _t("Nothing found for \"{0}\"", q) : _t("No document is like that")}{anyF ? _t(" with these filters") : ""}.</p>}
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
                    {it.type === "action" ? <Icon n={it.a.icon} size={16} /> : it.type === "book" ? <BookTile book={it.b} meta={bookMeta(it.b.id)} size={30} /> : <Icon n={fileIcon(it.f.kind)} size={16} />}
                  </span>
                  <span class="grow" style={{ minWidth: 0 }}>
                    {it.type === "word" ? <>
                      <div class="small"><b>{it.f.name}</b> <span class="muted">· {it.b.name} {_t("· page")} {it.page + 1}{it.count > 1 ? _t(" · {0} times", it.count) : ""}</span></div>
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
        <div class="tiny muted" style={{ padding: "8px 14px", borderTop: "1px solid var(--line)" }}>{_t("↑ ↓ to choose · Enter to open · Esc to close")}{store.value.kind === "drive" ? _t(" · words are read from your documents the first time, then remembered in this browser") : ""}</div>
      </div>
    </div>
  );
}
