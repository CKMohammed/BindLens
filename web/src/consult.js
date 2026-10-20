// Consultation mode: a computer or tablet for reading and searching only (a reception desk, a library, a meeting room).
// It starts with a code and leaving it asks for the same code. Kept in this browser only: other computers stay as they are.
// Nothing can be changed (the store refuses every write), the screen does not sleep, and the books keep their own PINs.
import { signal } from "@preact/signals";
import { _t } from "./i18n.js";

const KEY = "bl-consult";
let saved = null;
try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
export const consult = signal(!!(saved && saved.h));

async function hash(code) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("bindlens-consult:" + code));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
export async function startConsult(code) {
  try { localStorage.setItem(KEY, JSON.stringify({ h: await hash(code), at: Date.now() })); } catch (e) { return false; }
  location.reload();
  return true;
}
export async function leaveConsult(code) {
  if (!saved || saved.h !== await hash(code)) return false;
  try { localStorage.removeItem(KEY); } catch (e) {}
  location.reload();
  return true;
}

// the screen stays on (asked again each time the page comes back)
let awake = null;
async function keepAwake() {
  if (!consult.value || !navigator.wakeLock || document.visibilityState !== "visible") return;
  try { awake = await navigator.wakeLock.request("screen"); } catch (e) {}
}
if (consult.value && typeof document !== "undefined") {
  document.addEventListener("visibilitychange", keepAwake);
  keepAwake();
}

// the windows that only read
export const CONSULT_PANELS = new Set(["find", "pages", "help", "keys", "legal", "bookpin", "gallery", "print", "consult"]);

// the store, reading only: every change is refused; the settings stay in this browser
const WRITES = new Set(["createFolder", "createBook", "rename", "trash", "untrash", "move", "createSub", "write", "resumable", "writeOnline",
  "create", "copy", "createGoogle", "createConverted", "share", "unshare", "release"]);
export const refused = () => _t("Consultation mode: here you can only read and search.");
export function readOnlyStore(s) {
  return new Proxy(s, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== "function") return v;
      if (k === "saveSettings" || k === "saveSettingsOnline") return async () => true;
      if (WRITES.has(k)) return async () => { import("./state.js").then(m => m.toast(refused())); throw new Error(refused()); };
      return v.bind(t);
    },
  });
}
void awake;
