// BindLens Pro: 7 days to try everything, then a licence (Lemon Squeezy) or a gift code. Without one you can still
// open your books, read and see your marks. No server of ours: the licence is checked with Lemon Squeezy itself,
// and a gift code carries its own signature (made with a private key only its owner has).
import { effect } from "@preact/signals";
import nacl from "tweetnacl";
import { settings, setSetting, store, phase, panel, tool, toast } from "./state.js";
import { _t } from "./i18n.js";

export const TRIAL_DAYS = 7;
// the payment links of each plan (Lemon Squeezy) - set when the shop is open
export const PLANS = [
  { id: "pro", size: "", devices: 2, month: 7, year: 70, buyMonth: "", buyYear: "" },
  { id: "inst-s", size: "S", devices: 10, month: 30, year: 300, buyMonth: "", buyYear: "", inst: true },
  { id: "inst-m", size: "M", devices: 25, month: 65, year: 650, buyMonth: "", buyYear: "", inst: true },
  { id: "inst-l", size: "L", devices: 50, month: 110, year: 1100, buyMonth: "", buyYear: "", inst: true },
];
// the public key of the gift codes (its private key stays on its owner's computer); empty = no codes yet
export const GIFT_PUBLIC_KEY = "";
const API = "https://api.lemonsqueezy.com/v1/licenses/";
// what a licence is needed for, once the 7 days are over (reading, finding and seeing your marks stay free)
const PAID_PANELS = new Set(["reports", "scan", "signature", "write", "addpages"]);
const FREE_TOOLS = new Set(["select", "hand", "pan", "read"]);

const day = 86400000;
const email = () => ((store.value && store.value.user && store.value.user.email) || "").trim().toLowerCase();

// until the shop is open nobody is stopped, and the 7 days have not started
export const SHOP_OPEN = PLANS.some(p => p.buyMonth || p.buyYear);

export function trialLeft() {
  const t = settings.value.trialStart;
  if (!t) return TRIAL_DAYS;
  return Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - t) / day));
}

function b64u(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

// a gift code: BL1.<data>.<signature> - data {e: email, x: "2027-10-31" or "", p: "pro" | "inst"}
export function readGift(code) {
  try {
    if (!GIFT_PUBLIC_KEY || !code) return null;
    const [v, d, s] = String(code).trim().split(".");
    if (v !== "BL1" || !d || !s) return null;
    const data = b64u(d);
    if (!nacl.sign.detached.verify(data, b64u(s), b64u(GIFT_PUBLIC_KEY))) return null;
    const g = JSON.parse(new TextDecoder().decode(data));
    return { email: String(g.e || "").toLowerCase(), until: g.x || "", plan: g.p === "inst" ? "inst" : "pro" };
  } catch (e) { return null; }
}

function giftOk(g) { return g && (!g.email || g.email === email()) && (!g.until || Date.parse(g.until + "T23:59:59") > Date.now()); }

function licOk(L) {
  if (!L || !L.key || L.status !== "active") return false;
  if (L.email && email() && L.email !== email()) return false;              // a licence is for its own account
  if (L.expires && Date.parse(L.expires) < Date.now()) return false;
  return Date.now() - (L.checked || 0) < 21 * day;                          // checked again at least every 3 weeks
}

// "demo" (the example library) | "pro" | "inst" | "trial" | "free"
export function plan() {
  const s = store.value;
  if (!s || s.kind === "demo") return "demo";
  if (!SHOP_OPEN) return "trial";
  const L = settings.value.license;
  if (licOk(L)) return L.inst ? "inst" : "pro";
  const g = readGift(settings.value.gift);
  if (giftOk(g)) return g.plan;
  return trialLeft() > 0 ? "trial" : "free";
}
export const paidOk = () => plan() !== "free";
export const instOk = () => ["demo", "trial", "inst"].includes(plan());

// a Pro feature: true when it can be used, otherwise the licence window opens
export function need(why) {
  if (paidOk()) return true;
  panel.value = { type: "license", why: why || "" };
  return false;
}
export function needPanel(type) { return !PAID_PANELS.has(type) || paidOk(); }

async function call(what, body) {
  const r = await fetch(API + what, { method: "POST", headers: { Accept: "application/json" }, body: new URLSearchParams(body) });
  const j = await r.json().catch(() => ({}));
  return j;
}

function instanceName() {
  const ua = navigator.userAgent || "";
  const dev = /Android|iPhone|iPad/i.test(ua) ? (/iPad/i.test(ua) ? "tablet" : "phone") : "computer";
  return "BindLens Web · " + dev;
}

// "Activate": the key bought in the shop - for this account, on this device (a licence has room for 2, 10, 25 or 50)
export async function activate(key) {
  key = String(key || "").trim();
  if (!key) return { ok: false, msg: _t("Paste the licence key from your email.") };
  let j;
  try { j = await call("activate", { license_key: key, instance_name: instanceName() }); }
  catch (e) { return { ok: false, msg: _t("No connection. Try again in a moment.") }; }
  const lk = j.license_key || {}, m = j.meta || {};
  if (!j.activated) {
    const full = /limit/i.test(j.error || "");
    return { ok: false, msg: full ? _t("This licence is already used on all its devices. Free one in \"My licence\" on another device, or choose a plan with more devices.") : _t("This key is not valid.") };
  }
  const em = String(m.customer_email || "").toLowerCase();
  if (em && email() && em !== email()) {
    try { await call("deactivate", { license_key: key, instance_id: j.instance && j.instance.id }); } catch (e) {}
    return { ok: false, msg: _t("This licence belongs to another account. Sign in with the email you used to pay.") };
  }
  const name = (m.variant_name || "") + " " + (m.product_name || "");
  setSetting("license", { key, instance: j.instance && j.instance.id, email: em, status: lk.status === "expired" ? "expired" : "active",
    expires: lk.expires_at || "", limit: lk.activation_limit || 0, used: lk.activation_usage || 0, name: name.trim(),
    inst: /instituci|institution/i.test(name), checked: Date.now() });
  return { ok: true, msg: _t("Thank you! BindLens Pro is on.") };
}

export async function release() {
  const L = settings.value.license;
  if (!L) return;
  try { await call("deactivate", { license_key: L.key, instance_id: L.instance }); } catch (e) {}
  setSetting("license", null);
}

async function recheck() {
  const L = settings.value.license;
  if (!L || !L.key || Date.now() - (L.checked || 0) < 3 * day) return;
  try {
    const j = await call("validate", { license_key: L.key, instance_id: L.instance || "" });
    if (j && j.license_key) setSetting("license", { ...L, status: j.valid ? "active" : (j.license_key.status || "inactive"), expires: j.license_key.expires_at || "", checked: Date.now() });
  } catch (e) { /* offline: the last check stands for 3 weeks */ }
}

// the 7 days start the first time you open your own library; a quiet reminder in the last days
let started = false;
effect(() => {
  if (phase.value !== "ready" || started) return;
  const s = store.value;
  if (!s || s.kind === "demo") return;
  started = true;
  setTimeout(() => {
    if (!SHOP_OPEN) return;
    if (!settings.value.trialStart) setSetting("trialStart", Date.now());
    recheck();
    const p = plan(), left = trialLeft();
    const k = "bl-trial-note-" + new Date().toISOString().slice(0, 10);
    let seen = false;
    try { seen = !!localStorage.getItem(k); localStorage.setItem(k, "1"); } catch (e) {}
    if (!seen && p === "trial" && left <= 3) toast(_t("Your BindLens Pro trial: {0} days left. See plans in \"My licence\".", left));
    if (!seen && p === "free") toast(_t("Your 7 days are over: you can still read. BindLens Pro unlocks everything again."));
  }, 1500);
});

// the Pro tools (highlighter, pen, text, stamps, signature, changing the text...) once the 7 days are over
effect(() => {
  const t = tool.value;
  if (FREE_TOOLS.has(t) || phase.value !== "ready") return;
  if (!paidOk()) { setTimeout(() => { tool.value = "select"; need("tools"); }, 0); }
});

// your institution's name, logo and colours: in the institution plans (and while trying)
globalThis.__blInstOk = instOk;
