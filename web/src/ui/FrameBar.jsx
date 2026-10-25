// The quick bar on the right of the frame, as in the Windows app: your favourite things one click away. Right-click
// it (or More > Choose what is here) to choose them and their order. A word comes when you point at an icon.
import { useEffect, useState } from "preact/hooks";
import { readMode, view, settings, setSetting, books, openBook, toast, narrow, currentBook, commentsOpen, aloud, panel } from "../state.js";
import { Icon } from "./icons.jsx";
import { openMenu, Dialog } from "./dialogs.jsx";
import { openPanel, continueReading } from "../actions.js";
import { toggleAloud, canSpeak } from "./Aloud.jsx";
import { _t } from "../i18n.js";

export function frameBarOn() { return !narrow.value && !settings.value.hideRail; }

const needBook = (fn) => () => {
  if (view.value === "book") return fn();
  if (!books.value.length) { toast(_t("Make a book first.")); return; }
  if (!continueReading()) openBook(books.value[0].id);
  setTimeout(fn, 60);
};

export const QB = {
  aloud: { icon: "speaker", label: _t("Read aloud (Ctrl+U)"), book: true, on: () => aloud.value.on, run: () => toggleAloud(), ok: () => canSpeak },
  comments: { icon: "comment", label: _t("Comments"), book: true, on: () => !!commentsOpen.value, run: () => { commentsOpen.value = commentsOpen.value ? null : {}; } },
  tasks: { icon: "task", label: _t("Tasks"), run: () => openPanel("tasks") },
  scan: { icon: "scan", label: _t("Scan paper"), run: () => openPanel("scan", currentBook.value ? { book: currentBook.value.id } : {}) },
  write: { icon: "edit", label: _t("Write a document"), run: () => openPanel("write", currentBook.value ? { book: currentBook.value.id } : {}) },
  study: { icon: "star", label: _t("Study cards (Ctrl+B)"), run: needBook(() => openPanel("study")) },
  gallery: { icon: "image", label: _t("Photos as a gallery"), run: () => openPanel("gallery") },
  reading: { icon: "read", label: _t("Reading mode"), book: true, on: () => readMode.value, run: () => { readMode.value = !readMode.value; } },
  addpages: { icon: "addpage", label: _t("Add pages"), book: true, run: () => openPanel("addpages", { book: currentBook.value?.id }) },
  templates: { icon: "template", label: _t("New book from a template"), run: () => openPanel("templates") },
  print: { icon: "print", label: _t("Print (Ctrl+P)"), book: true, run: () => openPanel("print") },
  share: { icon: "share", label: _t("Share this book"), book: true, run: () => currentBook.value && openPanel("share", { id: currentBook.value.id }) },
  reports: { icon: "reports", label: _t("Reports (Ctrl+R)"), run: () => openPanel("reports") },
  pin: { icon: "lock", label: _t("Lock with a PIN"), run: () => openPanel("pin") },
  settings: { icon: "settings", label: _t("Settings (Ctrl+,)"), run: () => openPanel("settings") },
  help: { icon: "help", label: _t("How BindLens works (F1)"), run: () => openPanel("help") },
  keys: { icon: "type", label: _t("Keyboard shortcuts (Ctrl+/)"), run: () => openPanel("keys") },
  feedback: { icon: "feedback", label: _t("Send feedback"), run: () => openPanel("feedback") },
  // 1.0: your institution (its name, logo and colours on the reports) - its own logo shows here when there is one
  inst: { icon: "book", label: _t("Your institution: name, logo and colours on the reports"), img: () => (settings.value.brand || {}).on && (settings.value.brand || {}).logo, run: () => openPanel("settings", { group: "inst" }) },
};
export const QB_DEFAULT = ["aloud", "comments", "share", "print", "tasks", "scan", "write", "study", "gallery", "inst"];
// Scan, Share and Print are always on the bar
const qbList = () => { const l = [...(settings.value.quickBar || QB_DEFAULT)]; for (const k of ["scan", "print", "share"]) if (!l.includes(k)) l.splice(Math.min(2, l.length), 0, k); return (l.includes("inst") || settings.value.qbInstOff ? l : [...l, "inst"]).filter(k => QB[k] && (!QB[k].ok || QB[k].ok())); };

export function FrameBar() {
  const [h, setH] = useState(typeof window !== "undefined" ? window.innerHeight : 900);
  useEffect(() => { const f = () => setH(window.innerHeight); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  if (!frameBarOn()) return null;
  const inBook = view.value === "book";
  const all = qbList().filter(k => inBook || !QB[k].book);
  const fit = Math.max(3, Math.floor((h - 150) / 38));          // what does not fit goes under More
  const shown = all.slice(0, fit), rest = all.slice(fit);
  const B = ({ k }) => {
    const it = QB[k];
    const img = it.img && it.img();
    return <button class={"fb" + (it.on && it.on() ? " on" : "") + (img ? " withimg" : "")} aria-label={it.label} onClick={it.run}>{img ? <img src={img} alt="" /> : <Icon n={it.icon} size={17} />}<span class="fbtip">{it.label}</span></button>;
  };
  const choose = () => { panel.value = { type: "quickbar" }; };
  return (
    <div class="framebar" onContextMenu={(e) => { e.preventDefault(); openMenu(e, [{ label: _t("Choose what is here..."), icon: "settings", run: choose }, { label: _t("Hide the quick bar (Settings brings it back)"), icon: "close", run: () => setSetting("hideRail", true) }], { side: "left" }); }}>
      {shown.map(k => <B key={k} k={k} />)}
      <span class="grow" />
      <button class="fb" aria-label={_t("More")} onClick={(e) => openMenu(e, [
        ...rest.map(k => ({ label: QB[k].label, icon: QB[k].icon, run: QB[k].run })),
        rest.length > 0 && "-",
        ...["reports", "settings", "help", "keys", "feedback"].filter(k => !all.includes(k)).map(k => ({ label: QB[k].label, icon: QB[k].icon, run: QB[k].run })),
        "-",
        { label: _t("Choose what is here..."), icon: "settings", run: choose },
      ], { side: "left" })}><Icon n="more" size={17} /><span class="fbtip">{_t("More · choose what is here")}</span></button>
    </div>
  );
}

// Choose what the quick bar shows, and in which order
export function QuickBarChoose() {
  const cur = qbList();
  const set = (l) => setSetting("quickBar", l);
  const close = () => { panel.value = null; };
  const keys = [...cur, ...Object.keys(QB).filter(k => !cur.includes(k))];
  return (
    <Dialog title={_t("The quick bar")} icon="settings" onClose={close} cls="mid"
      foot={<><button class="btn plain" onClick={() => set(QB_DEFAULT)}>{_t("Back to the first choice")}</button><span class="grow" /><button class="btn" onClick={close}>{_t("Done")}</button></>}>
      <p class="small muted" style={{ marginTop: 0 }}>{_t("The icons on the right of the frame. Tick the ones you want; the arrows change their order. What does not fit goes under More.")}</p>
      <div class="qbl">
        {keys.map(k => {
          const on = cur.includes(k), i = cur.indexOf(k);
          return (
            <div key={k} class={"qbr" + (on ? " on" : "")}>
              <label class="chk grow"><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked ? [...cur, k] : cur.filter(x => x !== k))} />
                <span class="qbi"><Icon n={QB[k].icon} size={16} /></span>{QB[k].label}{QB[k].book ? <span class="tiny muted"> {_t("· in a book")}</span> : null}</label>
              {on && <button class="ib" title={_t("Up")} disabled={i === 0} onClick={() => { const l = [...cur]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; set(l); }}><Icon n="up" size={15} /></button>}
              {on && <button class="ib" title={_t("Down")} disabled={i === cur.length - 1} onClick={() => { const l = [...cur]; [l[i + 1], l[i]] = [l[i], l[i + 1]]; set(l); }}><Icon n="down" size={15} /></button>}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

// full screen: the browser's bars go and the frame fills the screen
export function FullButton({ small = false }) {
  const [fs, setFs] = useState(!!document.fullscreenElement);
  useEffect(() => { const f = () => setFs(!!document.fullscreenElement); document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);
  if (!document.documentElement.requestFullscreen) return null;
  return (
    <button class={"fullbtn" + (fs ? " in" : "") + (small ? " small" : "")} title={fs ? _t("Leave full screen (Esc)") : _t("Full screen: BindLens fills the whole screen")}
      onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }}>
      <Icon n={fs ? "close" : "full"} size={18} />{!small && <span>{fs ? _t("Exit") : _t("Full screen")}</span>}
    </button>
  );
}
