// Read with PIN: start it (your BindLens PIN) or leave it (the same PIN).
import { useState } from "preact/hooks";
import { panel, settings, bookId, fileId, pageNo } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { pinHash } from "./Lock.jsx";
import { consult, lockReading, unlockReading } from "../consult.js";
import { _t } from "../i18n.js";

export function Consult() {
  const leaving = consult.value;
  const [pin, setPin] = useState(""), [bad, setBad] = useState(false);
  const close = () => { panel.value = null; };
  const has = !!settings.value.pin;
  const go = async (v) => {
    // no PIN any more (the example library forgets it when it reloads): nothing to keep locked
    if (settings.value.pin && await pinHash(v) !== settings.value.pin) { setBad(true); setPin(""); return; }
    close();
    if (leaving) await unlockReading();
    else await lockReading({ book: bookId.value, file: fileId.value, page: pageNo.value });
  };
  return (
    <Dialog title={leaving ? _t("Leave Read with PIN") : _t("Read with PIN")} icon="lock" onClose={close} cls="">
      {!has && !leaving ? <>
        <p style={{ marginTop: 0 }}>{_t("Choose your BindLens PIN first: the same PIN starts and leaves Read with PIN, and opens the locked books.")}</p>
        <button class="btn" onClick={() => { panel.value = { type: "pin" }; }}><Icon n="lock" size={16} />{_t("Choose a PIN")}</button>
      </> : <>
        <p class="small muted" style={{ marginTop: 0 }}>{leaving ? _t("Type your PIN to go back to everything.") : _t("Only reading: other documents and books, reports and printing, and a pencil that is not saved. Only your PIN leaves it. Type your PIN to start.")}</p>
        <input class="field" autoFocus type="password" inputMode="numeric" maxLength={4} value={pin} aria-label={_t("PIN")}
          style={{ fontSize: 26, letterSpacing: ".5em", textAlign: "center" }}
          onInput={(e) => { const v = e.target.value.replace(/\D/g, ""); setPin(v); setBad(false); if (v.length === 4) go(v); }} />
        {bad && <p class="small" style={{ color: "var(--bad)", marginBottom: 0 }}>{_t("That PIN is not right.")}</p>}
      </>}
    </Dialog>
  );
}
