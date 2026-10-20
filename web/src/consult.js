// Read with PIN: reading only - read, go to another document or book (a locked book asks for the PIN), reports to
// download or print, print, a pencil that is never saved. It starts with your BindLens PIN and only the same PIN
// leaves it. It stays on in this browser (a reload comes back to it) and the screen does not sleep.
import { signal } from "@preact/signals";
import { _t } from "./i18n.js";

const KEY = "bl-consult";
function saved() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
export const consult = signal(!!(saved() && saved().on));
export const scratch = signal(false);              // the pencil (never saved)
export const consultPlace = () => saved() || {};
export function rememberPlace(place) { if (!consult.value) return; try { localStorage.setItem(KEY, JSON.stringify({ ...saved(), ...place })); } catch (e) {} }

// the screen stays on (asked again each time the page comes back)
let awake = null;
async function keepAwake() {
  if (!consult.value || !navigator.wakeLock || document.visibilityState !== "visible") return;
  try { awake = await navigator.wakeLock.request("screen"); } catch (e) {}
}
if (typeof document !== "undefined") document.addEventListener("visibilitychange", keepAwake);
if (consult.value) keepAwake();

// the store, reading only: every change is refused; the settings stay in this browser
const WRITES = new Set(["createFolder", "createBook", "rename", "trash", "untrash", "move", "createSub", "write", "resumable", "writeOnline",
  "create", "copy", "createGoogle", "createConverted", "share", "unshare", "release", "createShortcut"]);
export const refused = () => _t("Read with PIN: here you can only read.");
const RAW = new WeakMap();
export function readOnlyStore(s) {
  if (RAW.has(s)) return s;
  const p = new Proxy(s, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== "function") return v;
      if (k === "saveSettings" || k === "saveSettingsOnline") return async () => true;
      if (WRITES.has(k)) return async () => { import("./state.js").then(m => m.toast(refused())); throw new Error(refused()); };
      return v.bind(t);
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  RAW.set(p, s);
  return p;
}

export async function lockReading(place) {
  const st = await import("./state.js");
  try { localStorage.setItem(KEY, JSON.stringify({ on: 1, at: Date.now(), ...place })); } catch (e) { return false; }
  st.store.value = readOnlyStore(st.store.value);
  st.unlockedBooks.value = new Set(place.book ? [place.book] : []);   // the other locked books ask for the PIN again
  consult.value = true;
  st.readMode.value = true;
  keepAwake();
  return true;
}
export async function unlockReading() {
  const st = await import("./state.js");
  try { localStorage.removeItem(KEY); } catch (e) {}
  st.store.value = RAW.get(st.store.value) || st.store.value;
  consult.value = false;
  scratch.value = false;
  try { awake && awake.release(); } catch (e) {}
  st.setSetting("_touch", Date.now());               // what changed while locked (place, colours) is saved now
}

// the windows that only read
export const CONSULT_PANELS = new Set(["find", "pages", "help", "keys", "legal", "bookpin", "gallery", "print", "consult", "reports", "pin"]);
