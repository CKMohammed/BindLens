// Read with PIN: start it (your BindLens PIN) or leave it (the same PIN).
import { useState } from "preact/hooks";
import { panel, settings, bookId, fileId, pageNo } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { pinHash } from "./Lock.jsx";
import { consult, lockReading, unlockReading } from "../consult.js";
import { _t } from "../i18n.js";

export function Consult({ intro }) {
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
    <Dialog title={leaving ? _t("Unlock reading") : _t("Lock reading?")} icon="lock" onClose={close} cls=""
      foot={!leaving ? <><span class="grow" /><button class="btn plain" onClick={close}>{_t("Not now")}</button></> : null}>
      {!has && !leaving ? <>
        <p style={{ marginTop: 0 }}>{_t("You can lock reading with your PIN: then only reading is possible and only your PIN unlocks it - to leave the computer to someone else. It is optional. It uses your BindLens PIN, which also opens the locked books.")}</p>
        <button class="btn" onClick={() => { panel.value = { type: "pin" }; }}><Icon n="lock" size={16} />{_t("Choose a PIN")}</button>
      </> : <>
        <p class="small muted" style={{ marginTop: 0 }}>{leaving ? _t("Type your PIN to go back to everything.") : _t("Lock reading with your PIN: then only reading is possible (other documents and books, reports, printing, the pencil) and only your PIN unlocks it - to leave the computer to someone else. It is optional: the small lock at the top does it whenever you want.")}</p>
        <input class="field" autoFocus type="password" inputMode="numeric" maxLength={4} value={pin} aria-label={_t("PIN")}
          style={{ fontSize: 26, letterSpacing: ".5em", textAlign: "center" }}
          onInput={(e) => { const v = e.target.value.replace(/\D/g, ""); setPin(v); setBad(false); if (v.length === 4) go(v); }} />
        {bad && <p class="small" style={{ color: "var(--bad)", marginBottom: 0 }}>{_t("That PIN is not right.")}</p>}
      </>}
    </Dialog>
  );
}
