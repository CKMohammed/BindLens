// Small helpers used everywhere.
import { _t, isEs } from "./i18n.js";

export const BOOK_COLORS = ["#3A3D4A", "#B4587F", "#C29A45", "#6E5A7E", "#9C6B86", "#A88B5E", "#5B5F6B", "#8A3E5C", "#B98A3A", "#4E4A63"];   // 1.0 thin: soft tones of the logo (ink, pink, gold)

export function colorFor(name) {
  let h = 0;
  for (const c of name || "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BOOK_COLORS[h % BOOK_COLORS.length];
}

// a person's name as it is shown: the first name as an initial ("M. Chahboune Kadi"); full names stay in authorship and legal texts
export function shortName(n) {
  const w = String(n || "").trim().split(/\s+/);
  if (w.length < 2 || /@/.test(n) || /\.$/.test(w[0])) return String(n || "").trim();
  return w[0][0].toUpperCase() + ". " + w.slice(1).join(" ");
}

export function initials(name) {
  const words = (name || "?").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function ext(name) {
  const m = /\.([^.]+)$/.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

export function baseName(name) {
  return (name || "").replace(/\.[^.]+$/, "");
}

const KINDS = {
  pdf: "pdf",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", bmp: "image", tif: "image", tiff: "image",
  svg: "image",
  mp4: "video", webm: "video", mov: "video", m4v: "video", ogv: "video",
  mp3: "audio", m4a: "audio", wav: "audio", ogg: "audio",
  docx: "word", doc: "word", odt: "word", rtf: "word", docm: "word", dotx: "word",
  xlsx: "excel", xls: "excel", ods: "excel", csv: "excel", tsv: "excel", xlsm: "excel", xlsb: "excel",
  pptx: "powerpoint", ppt: "powerpoint", odp: "powerpoint", ppsx: "powerpoint", pptm: "powerpoint",
  txt: "text", md: "text", html: "text", htm: "text", json: "text", log: "text", xml: "text", yaml: "text",
  yml: "text", ini: "text", eml: "text",
  epub: "ebook", xps: "ebook", cbz: "ebook", fb2: "ebook",
};

export function kindOf(name, mime) {
  // a Google Doc, Sheet or Slides given to BindLens: read as a PDF (Drive makes it)
  if (mime && /^application\/vnd\.google-apps\.(document|spreadsheet|presentation|drawing)$/.test(mime)) return "gdoc";
  const k = KINDS[ext(name)];
  if (k) return k;
  if (mime) {
    if (mime === "application/pdf") return "pdf";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("text/")) return "text";
  }
  return "other";
}

export function mimeOf(name) {
  const e = ext(name);
  return ({
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/mp4",
    mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv", txt: "text/plain", md: "text/markdown", html: "text/html", htm: "text/html",
    epub: "application/epub+zip", json: "application/json", eml: "message/rfc822", rtf: "application/rtf",
    odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation", tsv: "text/tab-separated-values", xml: "text/xml",
  })[e] || "application/octet-stream";
}

// files the engine can show as pages
export function isPaged(kind) {
  return ["pdf", "image", "word", "excel", "powerpoint", "text", "ebook", "gdoc"].includes(kind);
}

export function debounce(fn, ms) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function fmtSize(n) {
  if (n == null) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
  "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
  "noviembre", "diciembre"];
const DAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// "Tuesday 20 October 2026" / "20 Oct 2026"; in Spanish "martes, 20 de octubre de 2026" / "20 oct 2026"
export function fmtDate(d, long = false) {
  if (!d) return "";
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d)) return "";
  if (isEs) return long ? `${DAYS_ES[d.getDay()]}, ${d.getDate()} de ${MONTHS_ES[d.getMonth()]} de ${d.getFullYear()}`
    : `${d.getDate()} ${MONTHS_ES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
  return long ? `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
    : `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

export function todayISO() {
  const d = new Date();
  return isoDate(d);
}

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(a, b) {
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((B - A) / 86400000);
}

export function whenText(days) {
  if (days === 0) return _t("Today");
  if (days === 1) return _t("Tomorrow");
  if (days === -1) return _t("Yesterday");
  if (days < 0) return _t("{0} days ago", -days);
  return _t("In {0} days", days);
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return _t("Good night");
  if (h < 12) return _t("Good morning");
  if (h < 18) return _t("Good afternoon");
  return _t("Good evening");
}

export function monthName(i) { return isEs ? MONTHS_ES[i][0].toUpperCase() + MONTHS_ES[i].slice(1) : MONTHS[i]; }
export function dayName(i) { return isEs ? DAYS_ES[i][0].toUpperCase() + DAYS_ES[i].slice(1) : DAYS[i]; }

export function download(bytesOrBlob, name, mime) {
  const blob = bytesOrBlob instanceof Blob ? bytesOrBlob : new Blob([bytesOrBlob], { type: mime || mimeOf(name) });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(c) {
  if (!c) return "#000000";
  return "#" + c.slice(0, 3).map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
}

export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

export function cleanName(s) {
  return (s || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}

export function uniqueName(name, taken) {
  const set = new Set(taken.map(t => t.toLowerCase()));
  if (!set.has(name.toLowerCase())) return name;
  const b = baseName(name), e = ext(name);
  for (let i = 2; i < 1000; i++) {
    const n = `${b} (${i})${e ? "." + e : ""}`;
    if (!set.has(n.toLowerCase())) return n;
  }
  return name;
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export async function sha256(text) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}

export function isPhone() {
  return window.matchMedia("(max-width: 760px)").matches;
}

export function natCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

// how readable one colour is on another (WCAG contrast, 1 to 21)
export function contrast(a, b) {
  const L = (hex) => hexToRgb(hex).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// the same colour, darker until white words on it (and it on white) read well
export function readable(hex, min = 4.5) {
  let c = hex;
  for (let i = 0; i < 20 && contrast(c, "#FFFFFF") < min; i++) c = mix(c, "#000000", 0.08);
  return c;
}

// the institution's colours (Settings > Colours), or null for the BindLens colours of the logo
export function brandOf(st) {
  const b = st && st.brand;
  if (!b || !b.on || !b.c1) return null;
  const c1 = b.c1, c2 = b.c2 || mix(b.c1, "#FFFFFF", 0.45);
  const accent = readable(c1);
  return { ...b, c1, c2, accent, soft: mix(c1, "#FFFFFF", 0.88), btn: readable(c1, 6), frameColors: [c1, mix(c1, "#FFFFFF", 0.3), c2, mix(c2, "#000000", 0.18), c1] };
}
