// Español e inglés: BindLens speaks the reader's language.
// The English words are the keys; es.js gives the Spanish for each. A missing one stays in English.
// The language comes from what the person chose (kept in this browser), else from the browser's own languages.
import ES from "./i18n/es.js";

const KEY = "bl_lang";
const inWorker = typeof document === "undefined";

function detect() {
  if (inWorker) {
    const m = /(?:^|;)lang=(\w+)/.exec((typeof self !== "undefined" && self.name) || "");
    if (m) return m[1] === "es" ? "es" : "en";
  } else {
    try {
      const q = new URLSearchParams(location.search).get("lang");
      if (q === "es" || q === "en") { localStorage.setItem(KEY, q); return q; }
    } catch { /* no address bar */ }
    try {
      const s = localStorage.getItem(KEY);
      if (s === "es" || s === "en") return s;
    } catch { /* storage off */ }
  }
  const list = (typeof navigator !== "undefined" && (navigator.languages || [navigator.language])) || [];
  for (const l of list) {
    const b = String(l || "").slice(0, 2).toLowerCase();
    if (b === "es") return "es";
    if (b === "en") return "en";
  }
  return "en";
}

export const lang = detect();
export const isEs = lang === "es";
// dates and numbers written the way the reader writes them
export const loc = isEs ? "es-ES" : "en-GB";
export const LANGS = [["en", "English"], ["es", "Español"]];

if (!inWorker) {
  try { document.documentElement.lang = lang; } catch { /* no page */ }
}

// the choice is kept in this browser; the app starts again in the new language
export function setLang(l) {
  if (l !== "es" && l !== "en") return;
  try { localStorage.setItem(KEY, l); } catch { /* storage off */ }
  if (!inWorker) location.reload();
}

// the words still in English when the page is in Spanish (for checking; nothing is sent anywhere)
const missing = new Set();
if (!inWorker && isEs) { try { window.__blMissing = missing; } catch { /* no window */ } }

function look(key) {
  if (!isEs || typeof key !== "string") return key;
  const hit = ES[key];
  if (hit != null) return hit;
  // the dictionary keeps the words without the spaces round them; the spaces come back
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(key);
  if (m && (m[1] || m[3])) {
    const core = ES[m[2]];
    if (core != null) return m[1] + core + m[3];
  }
  if (key.trim() && /[A-Za-z]/.test(key)) missing.add(key.trim());
  return key;
}

// "{0} new@@many": the part after @@ only tells the Spanish apart (nueva / nuevas); English shows the words before it
const bare = (s) => (s.includes("@@") ? s.replace(/@@[\w-]+/g, "") : s);

// _t("Page {0} of {1}", 3, 8) -> "Página 3 de 8". With pieces of a page (JSX) among the values, an array comes back.
export function _t(key, ...args) {
  const s = bare(look(key));
  if (!args.length) return s;
  if (args.some(a => a !== null && typeof a === "object")) {
    const out = [];
    let last = 0;
    s.replace(/\{(\d+)\}/g, (m, i, at) => { if (at > last) out.push(s.slice(last, at)); out.push(args[i]); last = at + m.length; return m; });
    if (last < s.length) out.push(s.slice(last));
    return out;
  }
  return s.replace(/\{(\d+)\}/g, (m, i) => (args[i] == null ? "" : String(args[i])));
}

// the right word for one or many: _n(n, "{0} file", "{0} files")
export function _n(n, one, many, ...more) {
  return _t(n === 1 ? one : many, n, ...more);
}

// a value kept in English in the library (a status, a kind) shown in the reader's language; unknown ones stay as they are
export function _tv(v) {
  if (!isEs || typeof v !== "string") return v;
  const hit = ES[v];
  return hit != null ? hit : v;
}
