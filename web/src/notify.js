// Notifications: what needs you today or tomorrow, said by the computer or the phone (while BindLens is open, or
// installed as an app). Each thing once a day.
import { settings, toast, openBook } from "./state.js";
import { needsNow, itemKey } from "./reports/dates.js";
import { isoDate } from "./util.js";

export const canNotify = typeof window !== "undefined" && "Notification" in window;

function seen() { try { return JSON.parse(localStorage.getItem("bl_notified") || "{}"); } catch (e) { return {}; } }
function mark(k) { const s = seen(); const today = isoDate(new Date()); for (const x of Object.keys(s)) if (s[x] !== today) delete s[x]; s[k] = today; try { localStorage.setItem("bl_notified", JSON.stringify(s)); } catch (e) {} }

async function show(title, body, key) {
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration("/app/");
    if (reg && reg.showNotification) { await reg.showNotification(title, { body, icon: "/app/icon-192.png", badge: "/app/icon-192.png", tag: key, data: { key } }); return; }
  } catch (e) {}
  try { const n = new Notification(title, { body, icon: "/app/icon-192.png", tag: key }); n.onclick = () => { window.focus(); n.close(); }; } catch (e) {}
}

export async function checkNow() {
  if (!canNotify || !settings.value.notify || Notification.permission !== "granted") return 0;
  let list = [];
  try { list = await needsNow(true); } catch (e) { return 0; }
  const s = seen();
  const today = isoDate(new Date());
  let n = 0;
  for (const it of list) {
    if (it.days > 1 || it.days < -1) continue;
    const k = it.id ? "m:" + it.id : itemKey(it);
    if (s[k] === today) continue;
    const when = it.days === 0 ? "Today" : it.days === 1 ? "Tomorrow" : "Yesterday";
    await show(`${when}: ${it.what}`, [it.file ? it.file.replace(/\.[^.]+$/, "") : "", it.line].filter(Boolean).join(" - ").slice(0, 180), k);
    mark(k); n++;
    if (n >= 4) break;
  }
  return n;
}

let timer = null;
export function startNotifications() {
  clearInterval(timer);
  if (!canNotify || !settings.value.notify) return;
  setTimeout(checkNow, 8000);
  timer = setInterval(checkNow, 30 * 60 * 1000);
}

export async function turnOn() {
  if (!canNotify) { toast("This browser cannot show notifications."); return false; }
  const p = await Notification.requestPermission();
  if (p !== "granted") { toast("The browser said no. Allow notifications for bindlens.com in its settings, then try again.", "", 6000); return false; }
  return true;
}

if (typeof navigator !== "undefined" && navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.bl === "needs") import("./actions.js").then(a => a.openPanel("dates")); });
}
void openBook;
