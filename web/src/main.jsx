import { render } from "preact";
import "./styles.css";
import { App } from "./ui/App.jsx";
import { toast } from "./state.js";
import "./install.js";
import { _t } from "./i18n.js";

// anything that goes wrong is said in a line at the bottom, not lost
window.addEventListener("unhandledrejection", (e) => {
  const m = String(e.reason?.message || e.reason || "");
  if (!m || /AbortError|The user aborted/i.test(m)) return;
  console.error(e.reason);
  toast(_t("Something did not work: ") + m, "bad", 6000);
});

render(<App />, document.getElementById("app"));

// works offline once opened: the app is kept in the browser (sw.js); a new version comes in on the next visit
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const v = (/assets\/index-([\w-]+)\.js/.exec(import.meta.url) || [])[1] || "1";
  const reg = () => navigator.serviceWorker.register("/app/sw.js?v=" + v, { scope: "/app/" }).catch(() => {});
  if (document.readyState === "complete") reg(); else window.addEventListener("load", reg);
}
