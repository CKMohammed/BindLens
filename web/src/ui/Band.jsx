// The top of the frame, as in the Windows app: the bar lives in the frame itself - where you are on the left
// (logo, Home, the library, the book and the document), Find in the middle, Reports, saved and you on the right.
import { view, readMode, leftOpen, saving, store, offline, currentBook, bookMeta, books } from "../state.js";
import { goHome } from "../state.js";
import { Icon } from "./icons.jsx";
import { openMenu } from "./dialogs.jsx";
import { Logo } from "./Logo.jsx";
import { BookTile } from "./bookicons.jsx";
import { DocSwitch } from "./Reading.jsx";
import { AccountButton, addItems } from "./Home.jsx";
import { FullButton } from "./FrameBar.jsx";
import { openPanel } from "../actions.js";

function Saved() {
  const s = saving.value;
  const where = store.value.kind === "onedrive" ? "OneDrive" : "Google Drive";
  const at = s.last ? new Date(s.last).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
  if (offline.value.on || offline.value.waiting) return <span class="bd-saved off" title="No network: your changes are kept in this browser and go up when the network is back"><Icon n="wifi" size={14} />{offline.value.waiting ? `Offline · ${offline.value.waiting} to save` : "Offline"}</span>;
  if (s.error) return <span class="bd-saved bad" title={s.error}><Icon n="x" size={14} />Not saved</span>;
  if (s.n) return <span class="bd-saved busy" title={"Saving in your " + where}><span class="sdot" />Saving</span>;
  if (store.value.kind === "demo") return <span class="bd-saved" title="The example library: nothing is saved">Example library</span>;
  return <span class="bd-saved" title={`Everything is saved in your ${where}${at ? " (" + at + ")" : ""}`}><Icon n="check" size={14} />{s.last ? "Saved · " + at : "Saved"}</span>;
}

export function Band() {
  const inBook = view.value === "book";
  const book = currentBook.value;
  return (
    <div class="band" role="banner">
      <button class="bd-brand" onClick={goHome} title="Home"><Logo size={32} still /><span class="bd-word">Bind<b>Lens</b></span></button>
      {inBook && book && <>
        <button class="bd-ib" title="Home (all your books)" onClick={goHome}><Icon n="home" size={18} /></button>
        <button class={"bd-ib" + (leftOpen.value && !readMode.value ? " on" : "")} title="The library: books, files, marks" onClick={() => { leftOpen.value = !leftOpen.value; }}><Icon n="sidebar" size={18} /></button>
        <span class="bd-sep" />
        <button class="bd-book" title="Another book" onClick={(e) => openMenu(e, [{ title: "Books" }, ...books.value.map(b => ({ label: b.name, swatch: bookMeta(b.id).color || b.color, run: () => import("../state.js").then(s => s.openBook(b.id)) }))])}>
          <BookTile book={book} meta={{ ...bookMeta(book.id), tstyle: "flat" }} size={22} /><b class="ellipsis">{book.name}</b><Icon n="down" size={11} />
        </button>
        <Icon n="right" size={12} />
        <DocSwitch book={book} />
        {readMode.value && <span class="bd-chip"><Icon n="read" size={13} />Reading</span>}
      </>}
      <span class="grow" />
      <div class="bd-find" onClick={() => openPanel("find")} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openPanel("find"); }}
        title="Find a book, a document, a word in any document, or anything to do">
        <Icon n="search" size={15} /><span class="ellipsis">Find anything</span><kbd>Ctrl K</kbd>
      </div>
      <button class="bd-btn" onClick={() => openPanel("reports")} title="Reports: contacts, tables, dates, amounts... from your documents (Ctrl+R)"><Icon n="reports" size={16} />Reports</button>
      {!inBook && <button class="bd-btn main" onClick={(e) => openMenu(e, addItems())}><Icon n="plus" size={16} />Add</button>}
      {inBook && readMode.value && <button class="bd-btn" onClick={() => { readMode.value = false; }} title="Back to the tools (Esc)"><Icon n="close" size={15} />Exit reading</button>}
      {inBook && <Saved />}
      <FullButton small />
      <AccountButton />
    </div>
  );
}
