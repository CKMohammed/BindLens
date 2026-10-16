// Keyboard shortcuts (Ctrl+/) and Send feedback.
import { useState } from "preact/hooks";
import { panel, view, currentBook, store, toast } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";

const close = () => { panel.value = null; };

const KEYS = [
  ["Everywhere", [["Ctrl K", "Find anything: a book, a document, a word, an action"], ["Ctrl /", "These shortcuts"], ["Ctrl R", "Reports"], ["Ctrl ,", "Settings"], ["Ctrl S", "Save now"], ["F1", "Help"]]],
  ["In a book", [["← →  PgUp PgDn", "The page before, the next page"], ["Ctrl P", "Print"], ["Ctrl +  Ctrl -  Ctrl 0", "Bigger, smaller, fit the width"], ["F2", "Rename the document"], ["Ctrl E", "Change the text of the PDF"], ["Esc", "Stop reading aloud, close"]]],
  ["Marking", [["V", "Select and move"], ["P", "Pen"], ["H", "Highlighter"], ["T", "Text box"], ["N", "Sticky note"], ["E", "Eraser"], ["Double-click a tool", "It stays on until you choose the arrow"], ["Ctrl Z  Ctrl Y", "Undo, redo"]]],
  ["A chosen mark", [["Arrows", "Move it (Shift: further)"], ["Ctrl D", "A copy of it"], ["Delete", "Take it off"], ["Double-click", "Change its words"]]],
];

export function Keys() {
  return (
    <Dialog title="Keyboard shortcuts" icon="type" onClose={close} cls="mid">
      <div class="keys">
        {KEYS.map(([g, list]) => (
          <div key={g} class="keys-g">
            <div class="ap-sec">{g}</div>
            {list.map(([k, d]) => <div key={k} class="keys-r"><span class="keys-k">{k.split("  ").map((x, i) => <kbd key={i}>{x}</kbd>)}</span><span class="small">{d}</span></div>)}
          </div>
        ))}
      </div>
      <p class="tiny muted">On a Mac, Cmd instead of Ctrl.</p>
    </Dialog>
  );
}

// where feedback goes: an email address once BindLens has one; GitHub (public) always
export const FEEDBACK_EMAIL = "";
const REPO = "https://github.com/CKMohammed/BindLens";

export function Feedback() {
  const [kind, setKind] = useState("bug");
  const [text, setText] = useState("");
  const [tech, setTech] = useState(true);
  const KINDS = [["bug", "Something does not work"], ["idea", "An idea"], ["hard", "Something is hard to find"], ["thanks", "It helps me"]];
  const details = () => {
    const b = currentBook.value;
    return [
      "BindLens Web 1.0",
      "Where: " + (view.value === "book" ? "a book" + (b ? ` (${b.files.length} documents)` : "") : "Home"),
      "Library: " + (store.value.kind === "demo" ? "the example" : store.value.cloud || store.value.kind),
      "Browser: " + navigator.userAgent,
      "Screen: " + screen.width + "x" + screen.height + " · window " + innerWidth + "x" + innerHeight,
      "Installed as an app: " + (matchMedia("(display-mode: standalone), (display-mode: window-controls-overlay)").matches ? "yes" : "no"),
    ].join("\n");
  };
  const title = () => (KINDS.find(k => k[0] === kind)[1] + ": " + text.trim().split(/\n/)[0]).slice(0, 90);
  const body = () => text.trim() + (tech ? "\n\n---\n" + details() : "");
  const github = () => window.open(`${REPO}/issues/new?title=${encodeURIComponent(title())}&body=${encodeURIComponent(body())}&labels=${encodeURIComponent(kind === "bug" ? "bug" : "feedback")}`, "_blank", "noopener");
  const mail = () => { location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("BindLens Web - " + title())}&body=${encodeURIComponent(body())}`; };
  const copy = async () => { try { await navigator.clipboard.writeText(title() + "\n\n" + body()); toast("Copied: paste it wherever you like.", "ok"); } catch (e) { toast("The browser did not let BindLens copy it."); } };
  return (
    <Dialog title="Send feedback" icon="feedback" onClose={close} cls="mid"
      foot={<>
        <button class="btn plain" onClick={copy} disabled={!text.trim()}><Icon n="copy" size={16} />Copy</button>
        <span class="grow" />
        {FEEDBACK_EMAIL && <button class="btn ghost" onClick={mail} disabled={!text.trim()}><Icon n="mail" size={16} />Send by email</button>}
        <button class="btn" onClick={github} disabled={!text.trim()}><Icon n="share" size={16} />Post it on GitHub</button>
      </>}>
      <div class="seg" style={{ display: "inline-flex", flexWrap: "wrap", marginBottom: 10 }}>
        {KINDS.map(([k, l]) => <button key={k} class={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      <textarea class="field" style={{ minHeight: 130 }} value={text} autoFocus onInput={(e) => setText(e.target.value)}
        placeholder={kind === "bug" ? "What did you do, what happened, and what did you expect? e.g. I added a page after page 3 and it went to the end." : "Tell us in a few words."} />
      <label class="chk small" style={{ marginTop: 8 }}><input type="checkbox" checked={tech} onChange={(e) => setTech(e.target.checked)} />Add the technical details (browser, screen, Home or a book) - never your documents or their names</label>
      {tech && <pre class="fb-tech">{details()}</pre>}
      <p class="tiny muted" style={{ marginBottom: 0 }}>BindLens has no servers, so your feedback goes where you choose. GitHub is public: do not write private data there.{FEEDBACK_EMAIL ? "" : " An email address for feedback is coming."}</p>
    </Dialog>
  );
}
