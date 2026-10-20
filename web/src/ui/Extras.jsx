// Keyboard shortcuts (Ctrl+/) and Send feedback.
import { useState } from "preact/hooks";
import { panel, view, currentBook, store, toast } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { _t } from "../i18n.js";

const close = () => { panel.value = null; };

const KEYS = [
  [_t("Everywhere"), [[_t("Ctrl K"), _t("Find anything: a book, a document, a word, an action")], [_t("Ctrl /"), _t("These shortcuts")], [_t("Ctrl R"), _t("Reports")], [_t("Ctrl ,"), _t("Settings")], [_t("Ctrl S"), _t("Save now")], ["F1", _t("Help")]]],
  [_t("In a book"), [[_t("← →  PgUp PgDn"), _t("The page before, the next page")], [_t("Ctrl P"), _t("Print")], [_t("Ctrl +  Ctrl -  Ctrl 0"), _t("Bigger, smaller, fit the width")], ["F2", _t("Rename the document")], [_t("Ctrl E"), _t("Change the text of the PDF")], [_t("Esc"), _t("Stop reading aloud, close")]]],
  [_t("Marking"), [["V", _t("Select and move")], ["P", _t("Pen")], ["H", _t("Highlighter")], ["T", _t("Text box")], ["N", _t("Sticky note")], ["E", _t("Eraser")], [_t("Double-click a tool"), _t("It stays on until you choose the arrow")], [_t("Ctrl Z  Ctrl Y"), _t("Undo, redo")]]],
  [_t("A chosen mark"), [[_t("Arrows"), _t("Move it (Shift: further)")], [_t("Ctrl D"), _t("A copy of it")], [_t("Delete"), _t("Take it off")], [_t("Double-click"), _t("Change its words")]]],
];

export function Keys() {
  return (
    <Dialog title={_t("Keyboard shortcuts")} icon="type" onClose={close} cls="mid">
      <div class="keys">
        {KEYS.map(([g, list]) => (
          <div key={g} class="keys-g">
            <div class="ap-sec">{g}</div>
            {list.map(([k, d]) => <div key={k} class="keys-r"><span class="keys-k">{k.split("  ").map((x, i) => <kbd key={i}>{x}</kbd>)}</span><span class="small">{d}</span></div>)}
          </div>
        ))}
      </div>
      <p class="tiny muted">{_t("On a Mac, Cmd instead of Ctrl.")}</p>
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
  const KINDS = [["bug", _t("Something does not work")], ["idea", _t("An idea")], ["hard", _t("Something is hard to find")], ["thanks", _t("It helps me")]];
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
  const copy = async () => { try { await navigator.clipboard.writeText(title() + "\n\n" + body()); toast(_t("Copied: paste it wherever you like."), "ok"); } catch (e) { toast(_t("The browser did not let BindLens copy it.")); } };
  return (
    <Dialog title={_t("Send feedback")} icon="feedback" onClose={close} cls="mid"
      foot={<>
        <button class="btn plain" onClick={copy} disabled={!text.trim()}><Icon n="copy" size={16} />{_t("Copy")}</button>
        <span class="grow" />
        {FEEDBACK_EMAIL && <button class="btn ghost" onClick={mail} disabled={!text.trim()}><Icon n="mail" size={16} />{_t("Send by email")}</button>}
        <button class="btn" onClick={github} disabled={!text.trim()}><Icon n="share" size={16} />{_t("Post it on GitHub")}</button>
      </>}>
      <div class="seg" style={{ display: "inline-flex", flexWrap: "wrap", marginBottom: 10 }}>
        {KINDS.map(([k, l]) => <button key={k} class={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      <textarea class="field" style={{ minHeight: 130 }} value={text} autoFocus onInput={(e) => setText(e.target.value)}
        placeholder={kind === "bug" ? _t("What did you do, what happened, and what did you expect? e.g. I added a page after page 3 and it went to the end.") : _t("Tell us in a few words.")} />
      <label class="chk small" style={{ marginTop: 8 }}><input type="checkbox" checked={tech} onChange={(e) => setTech(e.target.checked)} />{_t("Add the technical details (browser, screen, Home or a book) - never your documents or their names")}</label>
      {tech && <pre class="fb-tech">{details()}</pre>}
      <p class="tiny muted" style={{ marginBottom: 0 }}>{_t("BindLens has no servers, so your feedback goes where you choose. GitHub is public: do not write private data there.")}{FEEDBACK_EMAIL ? "" : _t(" An email address for feedback is coming.")}</p>
    </Dialog>
  );
}
