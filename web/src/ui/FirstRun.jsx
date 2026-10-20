// The first time, in two steps: 1. the first book, from a template; 2. its documents (from the Drive: no copies).
// And a short hint the first time in each place (Home, a book, reading mode, Reports) - once, then never again.
import { useState } from "preact/hooks";
import { panel, settings, setSetting, store, view, readMode, books, openBook } from "../state.js";
import { Dialog, ask } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { BookTile } from "./bookicons.jsx";
import { _t } from "../i18n.js";

const welcomed = () => { setSetting("welcomed", true); try { localStorage.setItem("bl-welcomed", "1"); } catch (e) {} };

export function FirstRun() {
  const [step, setStep] = useState(1);
  const [book, setBook] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tpls, setTpls] = useState(null);
  if (!tpls) import("./Templates.jsx").then(m => setTpls(m.TEMPLATES));
  const skip = () => { welcomed(); panel.value = null; };
  const make = async (t) => {
    if (busy) return;
    let b = null;
    setBusy(true);
    try {
      if (!t) { const { newBook } = await import("../actions.js"); b = await newBook(); }
      else {
        const name = await ask(_t("New book: ") + t.name, { label: _t("Its name (e.g. the person's, the client's or the project's)"), placeholder: t.name, ok: _t("Make the book") });
        if (name == null) return;
        const { makeFromTemplate } = await import("./Templates.jsx");
        b = await makeFromTemplate(t, name || t.name);
      }
    } finally { setBusy(false); }
    if (b) { setBook(b); setStep(2); }
  };
  const finish = async (how) => {
    welcomed();
    panel.value = null;
    const b = books.value.find(x => x.id === book.id) || book;
    openBook(b.id);
    const a = await import("../actions.js");
    if (how === "drive") a.addFromDrive(b);
    else if (how === "files") a.uploadFiles(b, await a.pickFiles(), { open: false });
    else if (how === "scan") a.openPanel("scan", { book: b.id });
  };
  const canPick = !!store.value?.canPick;
  return (
    <Dialog title={step === 1 ? _t("Step 1 of 2 · Your first book") : _t("Step 2 of 2 · Its documents")} icon="sparkle" cls="wide"
      onClose={skip}
      foot={<><button class="btn plain" onClick={skip}>{_t("Skip")}</button><span class="grow" />
        <button class="btn plain" onClick={() => { panel.value = { type: "welcome" }; }}>{_t("Show me the tour")}</button></>}>
      {step === 1 ? <>
        <p style={{ marginTop: 0 }}>{_t("A book is a folder in your Drive: a subject, a student, a client. Start from a template - it comes with its sub-books and the list of documents it needs.")}</p>
        {!tpls ? <div class="spinner" /> : <div class="tpl-grid">
          {tpls.map(t => (
            <button key={t.name} class="tpl" disabled={busy} onClick={() => make(t)}>
              <BookTile book={{ id: t.name, name: t.name, color: t.color }} meta={{ icon: t.icon, color: t.color, tstyle: "flat" }} size={32} />
              <span><b>{t.name}</b><small>{t.subs.slice(0, 3).join(" · ")}</small></span>
            </button>
          ))}
          <button class="tpl" disabled={busy} onClick={() => make(null)}>
            <span class="tpl-ico blank"><Icon n="plus" size={20} /></span><span><b>{_t("An empty book")}</b><small>{_t("Only the folder")}</small></span>
          </button>
        </div>}
        {busy && <div class="ap-busy"><div class="spinner" style={{ width: 20, height: 20, margin: 0 }} /><span class="small">{_t("Making the book...")}</span></div>}
      </> : <>
        <p style={{ marginTop: 0 }}>{_t("\"{0}\" is ready. Now put its documents in.", book?.name || "")}</p>
        <div class="tpl-grid">
          {canPick && <button class="tpl rec" onClick={() => finish("drive")}>
            <span class="tpl-ico"><Icon n="drive" size={20} /></span>
            <span><b>{_t("From my Drive")} <i class="recbadge">{_t("Recommended")}</i></b><small>{_t("The files are already in your Drive: nothing is copied twice.")}</small></span>
          </button>}
          <button class="tpl" onClick={() => finish("files")}>
            <span class="tpl-ico"><Icon n="upload" size={20} /></span>
            <span><b>{_t("From this computer")}</b><small>{_t("They are copied into the book's folder in your Drive.")}</small></span>
          </button>
          <button class="tpl" onClick={() => finish("scan")}>
            <span class="tpl-ico"><Icon n="camera" size={20} /></span>
            <span><b>{_t("Scan paper")}</b><small>{_t("The camera of your phone, or photos")}</small></span>
          </button>
          <button class="tpl" onClick={() => finish("later")}>
            <span class="tpl-ico"><Icon n="right" size={20} /></span>
            <span><b>{_t("Later")}</b><small>{_t("Open the book now")}</small></span>
          </button>
        </div>
      </>}
    </Dialog>
  );
}

// ---- a short hint the first time in each place
const HINTS = {
  home: () => _t("This is Home: your books on the shelf. Add makes a book or brings files; Ctrl+K finds anything."),
  book: () => _t("All the documents of the book, one after another. Pick a tool at the top to mark; right-click a page or a file for more. Everything is saved in your Drive."),
  read: () => _t("Reading mode: only the page, the contents and the clock. Esc brings the tools back."),
  reports: () => _t("Reports take rows out of your documents exactly as they are written. Pick one, then save it as PDF or Excel."),
};

function seen(id) {
  if ((settings.value.hints || {})[id]) return true;
  try { return !!localStorage.getItem("bl-hint-" + id); } catch (e) { return false; }
}

export function Hints() {
  const p = panel.value;
  if (p && p.type !== "reports") return null;               // never over another window
  if (!settings.value.welcomed && store.value?.kind !== "demo") return null;
  const id = p?.type === "reports" ? "reports" : readMode.value ? "read" : view.value === "book" ? "book" : "home";
  if (seen(id)) return null;
  const done = () => {
    setSetting("hints", { ...(settings.value.hints || {}), [id]: 1 });
    try { localStorage.setItem("bl-hint-" + id, "1"); } catch (e) {}
  };
  return (
    <div class="firsthint" role="status">
      <Icon n="sparkle" size={16} /><span>{HINTS[id]()}</span>
      <button class="btn small" onClick={done}>{_t("Got it")}</button>
    </div>
  );
}
