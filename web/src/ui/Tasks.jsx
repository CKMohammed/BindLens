// Tasks: things to do, for you or a colleague, with a date - about a book or a page. The dated ones are in What needs you.
import { useState } from "preact/hooks";
import { panel, settings, setSetting, books, openBook, toast, currentBook, fileId, pageNo, store } from "../state.js";
import { Dialog, openMenu } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { status } from "../reports/dates.js";
import { scrollTo } from "./Viewer.jsx";
import { fileFor } from "../docs.js";
import { uid, fmtDate, daysBetween, isoDate } from "../util.js";

const close = () => { panel.value = null; };

export function taskLine(t) {
  const where = t.file ? ` ("${t.file}"${t.page != null ? `, page ${t.page + 1}` : ""}${t.book ? `, in the book "${t.book}"` : ""})` : t.book ? ` (the book "${t.book}")` : "";
  return t.text + where + (t.due ? ` - by ${fmtDate(new Date(t.due + "T00:00"), true)}` : "");
}

function mailTask(t) {
  const f = t.fileId && fileFor(t.fileId);
  const link = f && store.value.webLink ? "\n\nThe document: " + store.value.webLink(f) : "";
  const subject = "Task: " + t.text.slice(0, 80);
  const body = `Hello${t.who ? " " + t.who.split(/[\s@]/)[0] : ""},\n\n${taskLine(t)}.${link}\n\n(Sent from BindLens)`;
  const to = /@/.test(t.who || "") ? t.who : "";
  location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function Tasks({ about }) {
  const all = settings.value.tasks || [];
  const book = currentBook.value;
  const f = fileFor(fileId.value);
  const [text, setText] = useState("");
  const [who, setWho] = useState("");
  const [due, setDue] = useState("");
  const [onPage, setOnPage] = useState(!!about);
  const [only, setOnly] = useState(about && book ? "book" : "all");
  const [showDone, setShowDone] = useState(false);
  const people = [...new Set(all.map(t => t.who).filter(Boolean))].slice(0, 20);
  const today = new Date();
  const add = () => {
    if (!text.trim()) return;
    const t = { id: uid(), text: text.trim().slice(0, 200), who: who.trim().slice(0, 80), due: due || "", made: Date.now(), done: 0 };
    if (book) { t.bookId = book.id; t.book = book.name; }
    if (onPage && book && f) { t.fileId = f.id; t.file = f.name; t.page = pageNo.value; }
    setSetting("tasks", [t, ...all]);
    setText(""); setDue("");
    toast(t.due ? "The task is in What needs you on its day." : "The task is in your list.", "ok");
  };
  const set = (id, change) => setSetting("tasks", all.map(t => t.id === id ? { ...t, ...change } : t));
  const del = (id) => setSetting("tasks", all.filter(t => t.id !== id));
  const go = (t) => {
    if (!t.bookId) return;
    close();
    if (t.fileId) { openBook(t.bookId, t.fileId, t.page || 0); setTimeout(() => { scrollTo.value = { fileId: t.fileId, page: t.page || 0 }; }, 60); }
    else openBook(t.bookId);
  };
  const list = all.filter(t => only === "all" || (book && t.bookId === book.id));
  const open = list.filter(t => !t.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const done = list.filter(t => t.done).sort((a, b) => b.done - a.done);
  const Row = ({ t }) => {
    const days = t.due ? daysBetween(today, new Date(t.due + "T00:00")) : null;
    const st = days != null ? status(days) : null;
    return (
      <div class={"task" + (t.done ? " done" : "")}>
        <input type="checkbox" checked={!!t.done} onChange={(e) => set(t.id, { done: e.target.checked ? Date.now() : 0 })} aria-label="Done" />
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="t-text">{t.text}</div>
          <div class="t-meta">
            {t.who && <span class="t-who"><Icon n="people" size={12} />{t.who}</span>}
            {st && !t.done && <span class={"chipst " + st.cls}>{st.text}</span>}
            {t.due && <span class="tiny muted">{fmtDate(new Date(t.due + "T00:00"))}</span>}
            {t.bookId && <a href="#" class="tiny" onClick={(e) => { e.preventDefault(); go(t); }}>{t.file ? `${t.file}${t.page != null ? " · p. " + (t.page + 1) : ""}` : t.book}</a>}
          </div>
        </div>
        <button class="ib" title="More" onClick={(e) => openMenu(e, [
          { label: "Send it by email...", icon: "mail", run: () => mailTask(t) },
          { label: "Change the date...", icon: "calendar", sub: [
            ...[["Today", 0], ["Tomorrow", 1], ["In a week", 7], ["In two weeks", 14], ["In a month", 30]].map(([l, n]) => ({ label: l, run: () => set(t.id, { due: isoDate(new Date(Date.now() + n * 86400000)) }) })),
            { label: "No date", run: () => set(t.id, { due: "" }) },
          ] },
          "-",
          { label: "Delete", icon: "trash", danger: true, run: () => del(t.id) },
        ])}><Icon n="more" size={17} /></button>
      </div>
    );
  };
  return (
    <Dialog title="Tasks" icon="task" onClose={close} cls="mid">
      <div class="taskadd">
        <input class="field" value={text} placeholder="What has to be done? e.g. Ask Aoife to sign the contract" onInput={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} autoFocus />
        <div class="row wrap" style={{ gap: 8 }}>
          <input class="field" list="bl-people" style={{ flex: "1 1 180px" }} value={who} placeholder="Who (a name or an email) - optional" onInput={(e) => setWho(e.target.value)} />
          <datalist id="bl-people">{people.map(p => <option key={p} value={p} />)}</datalist>
          <input class="field" type="date" style={{ flex: "0 1 170px" }} value={due} onInput={(e) => setDue(e.target.value)} title="By when (optional)" />
          <button class="btn" onClick={add} disabled={!text.trim()}><Icon n="plus" size={16} />Add</button>
        </div>
        {book && f && <label class="chk small"><input type="checkbox" checked={onPage} onChange={(e) => setOnPage(e.target.checked)} />About this page: {f.name}, page {pageNo.value + 1}</label>}
      </div>
      <div class="row" style={{ margin: "14px 0 6px" }}>
        <b class="grow">To do <span class="muted small">· {open.length}</span></b>
        {book && <div class="seg">
          <button class={only === "all" ? "on" : ""} onClick={() => setOnly("all")}>All</button>
          <button class={only === "book" ? "on" : ""} onClick={() => setOnly("book")}>{book.name}</button>
        </div>}
      </div>
      {!open.length ? <p class="small muted">Nothing to do{only === "book" ? " in this book" : ""}. Add a task above: with a date, it comes up in What needs you.</p> : <div class="tasks">{open.map(t => <Row key={t.id} t={t} />)}</div>}
      {done.length > 0 && <>
        <button class="btn plain small" style={{ marginTop: 8 }} onClick={() => setShowDone(!showDone)}><Icon n={showDone ? "down" : "right"} size={14} />Done · {done.length}</button>
        {showDone && <div class="tasks">{done.slice(0, 60).map(t => <Row key={t.id} t={t} />)}</div>}
      </>}
      <p class="tiny muted" style={{ marginTop: 12 }}>Tasks are kept with your settings in your {store.value.cloud || "library"}. "Send it by email" sends one to a colleague, with the link to its document.</p>
    </Dialog>
  );
}
