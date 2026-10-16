// A book with its own PIN: asked before it opens.
import { useState } from "preact/hooks";
import { panel, settings, unlockedBooks, openBook, books } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { pinHash } from "./Lock.jsx";

export function BookPin({ id, fid, page }) {
  const [pin, setPin] = useState("");
  const [bad, setBad] = useState(false);
  const book = books.value.find(b => b.id === id);
  const close = () => { panel.value = null; };
  const go = async (p) => {
    if (await pinHash(p) === settings.value.pin) {
      unlockedBooks.value = new Set([...unlockedBooks.value, id]);
      panel.value = null;
      openBook(id, fid, page);
    } else { setBad(true); setPin(""); }
  };
  return (
    <Dialog title={`"${book ? book.name : "This book"}" is locked`} icon="lock" onClose={close} cls="">
      <p class="small muted" style={{ marginTop: 0 }}>Type your PIN to open it.</p>
      <input class="field" autoFocus type="password" inputMode="numeric" maxLength={4} value={pin}
        style={{ fontSize: 26, letterSpacing: ".5em", textAlign: "center" }}
        onInput={(e) => { const v = e.target.value.replace(/\D/g, ""); setPin(v); setBad(false); if (v.length === 4) go(v); }} />
      {bad && <p class="small" style={{ color: "var(--bad)" }}>That PIN is not right.</p>}
    </Dialog>
  );
}
