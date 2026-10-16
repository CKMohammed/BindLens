// The quick icons on the frame itself (the strip of colours on the right of the window), as in the Windows app.
import { useEffect, useState } from "preact/hooks";
import { readMode, view, settings, setSetting, books, openBook, toast, narrow, currentBook } from "../state.js";
import { Icon } from "./icons.jsx";
import { openMenu } from "./dialogs.jsx";
import { openPanel, continueReading } from "../actions.js";

export function frameBarOn() { return !narrow.value && !settings.value.hideRail; }

export function FrameBar() {
  if (!frameBarOn()) return null;
  const inBook = view.value === "book";
  const needBook = (fn) => () => {
    if (inBook) return fn();
    if (!books.value.length) { toast("Make a book first."); return; }
    if (!continueReading()) openBook(books.value[0].id);
    setTimeout(fn, 60);
  };
  const B = ({ n, t, run, on }) => <button class={"fb" + (on ? " on" : "")} title={t} aria-label={t} onClick={run}><Icon n={n} size={17} /></button>;
  return (
    <div class="framebar" onContextMenu={(e) => { e.preventDefault(); openMenu(e, [{ label: "Hide the icons on the frame (Settings brings them back)", icon: "close", run: () => setSetting("hideRail", true) }]); }}>
      <B n="read" t={readMode.value ? "Leave reading mode" : "Reading mode"} on={readMode.value} run={needBook(() => { readMode.value = !readMode.value; })} />
      <B n="clock" t="What needs you" run={() => openPanel("dates")} />
      <B n="table" t="Reports" run={() => openPanel("reports")} />
      <B n="image" t="Photos as a gallery" run={() => openPanel("gallery")} />
      <B n="camera" t="Scan" run={() => openPanel("scan", currentBook.value ? { book: currentBook.value.id } : {})} />
      <B n="edit" t="Write" run={() => openPanel("write", currentBook.value ? { book: currentBook.value.id } : {})} />
      <B n="star" t="Study cards (your highlights)" run={needBook(() => openPanel("study"))} />
      <span class="grow" />
      <B n="palette" t="Frame colours" run={() => openPanel("settings")} />
      <B n="lock" t="Lock with a PIN" run={() => openPanel("pin")} />
      <B n="help" t="Help" run={() => openPanel("help")} />
    </div>
  );
}

// full screen: the browser's bars go and the frame fills the screen - made to be seen and clicked
export function FullButton({ small = false }) {
  const [fs, setFs] = useState(!!document.fullscreenElement);
  useEffect(() => { const f = () => setFs(!!document.fullscreenElement); document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);
  if (!document.documentElement.requestFullscreen) return null;
  return (
    <button class={"fullbtn" + (fs ? " in" : "") + (small ? " small" : "")} title={fs ? "Leave full screen (Esc)" : "Full screen: BindLens fills the whole screen"}
      onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }}>
      <Icon n={fs ? "close" : "full"} size={18} />{!small && <span>{fs ? "Exit" : "Full screen"}</span>}
    </button>
  );
}
