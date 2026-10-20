// The top of the frame, as in the Windows app: the bar lives in the frame itself - where you are on the left
// (logo, Home, the library, the book and the document), Find in the middle, Reports, saved and you on the right.
import { view, readMode, leftOpen, saving, store, offline, currentBook, bookMeta, books, settings, setSetting, fileId, pageNo } from "../state.js";
import { docState } from "./Viewer.jsx";
import { contentsOpen } from "./Reading.jsx";
import { goHome } from "../state.js";
import { Icon } from "./icons.jsx";
import { openMenu } from "./dialogs.jsx";
import { Logo } from "./Logo.jsx";
import { BookTile } from "./bookicons.jsx";
import { DocSwitch } from "./Reading.jsx";
import { AccountButton, addItems } from "./Home.jsx";
import { FullButton } from "./FrameBar.jsx";
import { openPanel } from "../actions.js";
import { consult, scratch } from "../consult.js";
import { openBook, bookHidden } from "../state.js";
import { _t, loc } from "../i18n.js";

function Saved() {
  const s = saving.value;
  const where = store.value.kind === "onedrive" ? "OneDrive" : "Google Drive";
  const at = s.last ? new Date(s.last).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }) : "";
  if (offline.value.on || offline.value.waiting) return <span class="bd-saved off" title={_t("No network: your changes are kept in this browser and go up when the network is back")}><Icon n="wifi" size={14} />{offline.value.waiting ? _t("Offline · {0} to save", offline.value.waiting) : _t("Offline")}</span>;
  if (s.error) return <span class="bd-saved bad" title={s.error}><Icon n="x" size={14} />{_t("Not saved")}</span>;
  if (s.n) return <span class="bd-saved busy" title={_t("Saving in your ") + where}><span class="sdot" />{_t("Saving")}</span>;
  if (store.value.kind === "demo") return <span class="bd-saved" title={_t("The example library: nothing is saved")}>{_t("Example library")}</span>;
  return <span class="bd-saved" title={_t("Everything is saved in your {0}{1}", where, at ? " (" + at + ")" : "")}><Icon n="check" size={14} />{s.last ? _t("Saved · ") + at : _t("Saved")}</span>;
}

// reading mode: where you are, and how it looks (background, two pages side by side, what is beside the page)
function ReadingChip({ book }) {
  const r = settings.value.reading || {};
  const set = (ch) => setSetting("reading", { ...r, ...ch });
  const c = settings.value.clock || {};
  let total = 0, cur = 0;
  for (const f of book.files) { const n = docState.value[f.id]?.pages?.length || 0; if (f.id === fileId.value) cur = total + pageNo.value + 1; total += n; }
  return (
    <button class="bd-chip" title={_t("How reading mode looks")} onClick={(e) => openMenu(e, [
      { title: _t("Reading mode") },
      { label: _t("Background"), icon: "palette", sub: [["calm", _t("Calm")], ["soft", _t("Soft colours of the frame")], ["paper", _t("Warm paper")], ["dark", _t("Dark")]].map(([k, l]) => ({ label: ((r.bg || "calm") === k ? "✓ " : "") + l, run: () => set({ bg: k }) })) },
      { label: (r.spread ? "✓ " : "") + _t("Two pages side by side"), icon: "grid", run: () => set({ spread: !r.spread }) },
      { label: (contentsOpen.value ? "✓ " : "") + _t("The contents beside the page"), icon: "list", run: () => { contentsOpen.value = !contentsOpen.value; } },
      { label: (!c.hidden ? "✓ " : "") + _t("The clock and the calendar"), icon: "clock", run: () => setSetting("clock", { ...c, hidden: !c.hidden }) },
      { label: (r.map !== false ? "✓ " : "") + _t("The map of the book"), icon: "book", run: () => set({ map: r.map === false }) },
      { label: (settings.value.night ? "✓ " : "") + _t("Night pages"), icon: "moon", run: () => setSetting("night", !settings.value.night) },
    ])}><Icon n="read" size={13} />{_t("Reading")}{total ? _t(" · page {0} of {1}", cur, total) : ""}<Icon n="down" size={10} /></button>
  );
}

// Read with PIN: only what reading needs - the book and the document (to change), reports, print, the pencil, leave
function ReadBand({ book }) {
  const others = (e) => openMenu(e, [{ title: _t("Books") }, ...books.value.filter(b => !bookHidden(b)).map(b => ({
    label: b.name, swatch: bookMeta(b.id).color || b.color, hint: bookMeta(b.id).locked ? "\uD83D\uDD12" : b.id === book.id ? "\u2713" : "", run: () => openBook(b.id) }))]);
  return (
    <div class="band readband" role="banner">
      <span class="bd-brand"><Logo size={28} still /></span>
      <button class="bd-book" title={_t("Another book")} onClick={others}>
        <BookTile book={book} meta={{ ...bookMeta(book.id), tstyle: "flat" }} size={20} /><b class="ellipsis">{book.name}</b><Icon n="down" size={11} />
      </button>
      <Icon n="right" size={12} />
      <DocSwitch book={book} />
      <span class="grow" />
      <button class="bd-btn" onClick={() => openPanel("reports")}><Icon n="reports" size={16} />{_t("Reports")}</button>
      <button class="bd-btn" onClick={() => openPanel("print")}><Icon n="print" size={16} />{_t("Print")}</button>
      <button class={"bd-btn" + (scratch.value ? " main" : "")} onClick={() => { scratch.value = !scratch.value; }} title={_t("A pencil to point at things - nothing is saved")}><Icon n="pen" size={16} />{_t("Pencil")}</button>
      <button class="bd-btn" onClick={() => openPanel("consult")} title={_t("Only your PIN leaves reading")}><Icon n="lock" size={15} />{_t("Leave")}</button>
    </div>
  );
}

export function Band() {
  const inBook = view.value === "book";
  const book = currentBook.value;
  if (consult.value && inBook && book) return <ReadBand book={book} />;
  return (
    <div class="band" role="banner">
      <button class="bd-brand" onClick={goHome} title={_t("Home")}><Logo size={32} still /><span class="bd-word">Bind<b>Lens</b></span></button>
      {inBook && book && <>
        <button class="bd-ib" title={_t("Home (all your books)")} onClick={goHome}><Icon n="home" size={18} /></button>
        <button class={"bd-ib" + (leftOpen.value && !readMode.value ? " on" : "")} title={_t("The library: books, files, marks")} onClick={() => { if (readMode.value && !consult.value) { readMode.value = false; leftOpen.value = true; } else leftOpen.value = !leftOpen.value; }}><Icon n="sidebar" size={18} /></button>
        <span class="bd-sep" />
        <button class="bd-book" title={_t("Another book")} onClick={(e) => openMenu(e, [{ title: _t("Books") }, ...books.value.map(b => ({ label: b.name, swatch: bookMeta(b.id).color || b.color, run: () => import("../state.js").then(s => s.openBook(b.id)) }))])}>
          <BookTile book={book} meta={{ ...bookMeta(book.id), tstyle: "flat" }} size={22} /><b class="ellipsis">{book.name}</b><Icon n="down" size={11} />
        </button>
        <Icon n="right" size={12} />
        <DocSwitch book={book} />
        {readMode.value && <ReadingChip book={book} />}
      </>}
      <span class="grow" />
      <div class="bd-find" onClick={() => openPanel("find")} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openPanel("find"); }}
        title={_t("Find a book, a document, a word in any document, or anything to do")}>
        <Icon n="search" size={15} /><span class="ellipsis">{_t("Find anything")}</span><kbd>{_t("Ctrl K")}</kbd>
      </div>
      <button class="bd-btn" onClick={() => openPanel("reports")} title={_t("Reports: contacts, tables, dates, amounts... from your documents (Ctrl+R)")}><Icon n="reports" size={16} />{_t("Reports")}</button>
      {!inBook && <button class="bd-btn main" onClick={(e) => openMenu(e, addItems())}><Icon n="plus" size={16} />{_t("Add")}</button>}
      {inBook && readMode.value && <button class="bd-btn" onClick={() => openPanel("consult")} title={_t("Only reading, until your PIN is typed again")}><Icon n="lock" size={15} />{_t("Lock with PIN")}</button>}
      {inBook && readMode.value && <button class="bd-btn" onClick={() => { readMode.value = false; }} title={_t("Back to the tools (Esc)")}><Icon n="close" size={15} />{_t("Exit reading")}</button>}
      {inBook && <Saved />}
      <FullButton small />
      <AccountButton />
    </div>
  );
}
