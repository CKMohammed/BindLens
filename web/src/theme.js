// Light, dark, or as the computer is - and "Fast": nothing moves. Kept with your settings; the page shows it at once.
import { effect } from "@preact/signals";
import { settings } from "./state.js";

const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const slow = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export function themeNow() {
  const t = settings.value.theme || "light";
  return t === "auto" ? (mq && mq.matches ? "dark" : "light") : t;
}

function apply() {
  const root = document.documentElement;
  const th = themeNow();
  root.dataset.theme = th;
  root.style.colorScheme = th;
  root.classList.toggle("fast", !!settings.value.fast || !!(slow && slow.matches));
  root.classList.toggle("shownames", !!settings.value.ribbonNames);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", th === "dark" ? "#0A0A0D" : "#0A0A0D");
  try { localStorage.setItem("bl-theme", th); } catch (e) {}
}

if (typeof document !== "undefined") {
  // before the settings come from the Drive: the look of the last time, so a dark screen does not flash white
  try { const t = localStorage.getItem("bl-theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
  effect(() => { void settings.value.theme; void settings.value.fast; void settings.value.ribbonNames; apply(); });
  if (mq && mq.addEventListener) mq.addEventListener("change", () => { if ((settings.value.theme || "light") === "auto") apply(); });
  if (slow && slow.addEventListener) slow.addEventListener("change", apply);
}
