// Start consultation mode (choose a code, twice) or leave it (the same code).
import { useState } from "preact/hooks";
import { panel } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { consult, startConsult, leaveConsult } from "../consult.js";
import { _t } from "../i18n.js";

export function Consult() {
  const leaving = consult.value;
  const [a, setA] = useState(""), [b, setB] = useState(""), [bad, setBad] = useState("");
  const close = () => { panel.value = null; };
  const ok = leaving ? a.length >= 4 : a.length >= 4 && b.length >= 4;
  const go = async () => {
    if (!ok) return;
    if (leaving) { if (!await leaveConsult(a)) { setBad(_t("That is not the code.")); setA(""); } return; }
    if (a !== b) { setBad(_t("The two codes are not the same.")); setB(""); return; }
    await startConsult(a);
  };
  const box = (v, set, auto) => <input class="field pinfield" type="password" inputMode="numeric" autoComplete="off" autoFocus={auto} maxLength={12} value={v}
    onInput={(e) => { set(e.target.value.replace(/\s/g, "")); setBad(""); }} onKeyDown={(e) => { if (e.key === "Enter") go(); }} />;
  return (
    <Dialog title={leaving ? _t("Leave consultation mode") : _t("Consultation mode")} icon="read" onClose={close} cls="mid"
      foot={<><button class="btn plain" onClick={close}>{_t("Cancel")}</button><span class="grow" />
        <button class="btn" disabled={!ok} onClick={go}>{leaving ? _t("Leave") : _t("Start consultation mode")}</button></>}>
      {leaving ? <p style={{ marginTop: 0 }}>{_t("Type the code that started consultation mode on this computer.")}</p> : <>
        <p style={{ marginTop: 0 }}>{_t("For a computer or tablet where people only read and search: a reception desk, a library, a meeting room. Nothing can be changed, the screen does not sleep, and every book keeps its own PIN.")}</p>
        <p class="small muted">{_t("It is only for this computer. To leave it, the same code is asked. Choose a code of 4 or more digits or letters and keep it.")}</p>
      </>}
      <label class="ddf"><span class="small muted">{_t("Code")}</span>{box(a, setA, true)}</label>
      {!leaving && <label class="ddf" style={{ marginTop: 10 }}><span class="small muted">{_t("The code again")}</span>{box(b, setB, false)}</label>}
      {bad && <p class="small" style={{ color: "var(--bad)", marginBottom: 0 }}>{bad}</p>}
    </Dialog>
  );
}
