// "My licence": what you have (trial, Pro, institution), the plans, a licence key, a gift code
import { useState } from "preact/hooks";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { panel, settings, setSetting, store, toast } from "../state.js";
import { PLANS, plan, trialLeft, activate, release, readGift, GIFT_PUBLIC_KEY } from "../license.js";
import { _t } from "../i18n.js";

export function License({ why }) {
  const [key, setKey] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [yearly, setYearly] = useState(true);
  const p = plan(), L = settings.value.license, left = trialLeft();
  const close = () => { panel.value = null; };
  const em = (store.value && store.value.user && store.value.user.email) || "";
  const buy = (url) => {
    if (!url) { toast(_t("The shop opens very soon.")); return; }
    window.open(url + (url.includes("?") ? "&" : "?") + "checkout[email]=" + encodeURIComponent(em), "_blank", "noopener");
  };
  const status = p === "pro" ? _t("BindLens Pro is on.") : p === "inst" ? _t("BindLens Pro for institutions is on.")
    : p === "trial" ? _t("Trial: {0} days left - everything is on.", left) : p === "demo" ? _t("Example library: everything is on.")
    : _t("Your 7 days are over. You can still open your books, read and see your marks.");
  const doKey = async () => { setBusy(true); const r = await activate(key); setBusy(false); setMsg(r.msg); if (r.ok) { setKey(""); toast(r.msg, "ok"); } };
  const doGift = () => {
    const g = readGift(code);
    if (!g) { setMsg(_t("This code is not valid.")); return; }
    if (g.email && g.email !== em.toLowerCase()) { setMsg(_t("This code is for another account.")); return; }
    if (g.until && Date.parse(g.until + "T23:59:59") < Date.now()) { setMsg(_t("This code has expired.")); return; }
    setSetting("gift", code.trim()); setCode(""); setMsg(_t("Thank you! BindLens Pro is on.")); toast(_t("Thank you! BindLens Pro is on."), "ok");
  };
  const title = (pl) => pl.inst ? _t("Institution {0}", pl.size) : _t("Individual");
  return (
    <Dialog title={_t("My licence")} icon="star" onClose={close} cls="mid">
      {why && p === "free" && <p style={{ marginTop: 0 }}><b>{_t("This is part of BindLens Pro.")}</b></p>}
      <p class="small muted" style={{ marginTop: 0 }}>{status}</p>
      {(p === "pro" || p === "inst") && L && L.key && (
        <div class="row wrap lic-have">
          <span class="grow small"><b>{L.name || "BindLens Pro"}</b>{L.limit ? " · " + _t("{0} of {1} devices", L.used || 1, L.limit) : ""}</span>
          <button class="btn plain small" onClick={async () => { await release(); toast(_t("This device is free again.")); }}>{_t("Free this device")}</button>
        </div>
      )}
      {p !== "pro" && p !== "inst" && <>
        <div class="seg" style={{ display: "inline-flex", margin: "4px 0 10px" }}>
          <button class={!yearly ? "on" : ""} onClick={() => setYearly(false)}>{_t("Monthly")}</button>
          <button class={yearly ? "on" : ""} onClick={() => setYearly(true)}>{_t("Yearly · 2 months free")}</button>
        </div>
        <div class="lic-grid">
          {PLANS.map(pl => (
            <div key={pl.id} class={"lic-card" + (pl.inst ? "" : " main")}>
              <b>{title(pl)}</b>
              <span class="tiny muted">{_t("{0} devices", pl.devices)}{pl.inst ? " · " + _t("your logo and colours") : ""}</span>
              <span class="lic-price">{yearly ? pl.year : pl.month} €<small>{yearly ? _t("/year") : _t("/month")}</small></span>
              <button class={"btn small" + (pl.inst ? " ghost" : "")} onClick={() => buy(yearly ? pl.buyYear : pl.buyMonth)}>{_t("Choose")}</button>
            </div>
          ))}
        </div>
      </>}
      <div class="lic-row">
        <label class="small muted">{_t("I have a licence key")}</label>
        <div class="row" style={{ gap: 8 }}>
          <input class="field grow" value={key} placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" onInput={(e) => setKey(e.target.value)} />
          <button class="btn" disabled={busy || !key.trim()} onClick={doKey}>{busy ? _t("Checking...") : _t("Activate")}</button>
        </div>
      </div>
      {GIFT_PUBLIC_KEY && <div class="lic-row">
        <label class="small muted">{_t("I have a gift code")}</label>
        <div class="row" style={{ gap: 8 }}>
          <input class="field grow" value={code} placeholder="BL1...." onInput={(e) => setCode(e.target.value)} />
          <button class="btn ghost" disabled={!code.trim()} onClick={doGift}>{_t("Use it")}</button>
        </div>
      </div>}
      {msg && <p class="small" style={{ marginBottom: 0 }}>{msg}</p>}
      <p class="tiny muted" style={{ marginBottom: 0 }}>{_t("Payments by Lemon Squeezy, with VAT. Cancel any time. Reading your books is always free.")}</p>
    </Dialog>
  );
}
