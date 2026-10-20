// Read aloud: the browser's own voices read the book, sentence by sentence, lighting the lines being read; it goes
// on to the next page and the next document. A small player: play / pause, sentence back and on, speed, voice.
import { useEffect, useState } from "preact/hooks";
import { aloud, aloudMark, fileId, pageNo, settings, setSetting, toast, currentBook } from "../state.js";
import { Icon } from "./icons.jsx";
import { openMenu } from "./dialogs.jsx";
import { scrollTo, docState } from "./Viewer.jsx";
import { getDoc, call, fileFor } from "../docs.js";
import { isPaged } from "../util.js";
import { _t, loc } from "../i18n.js";

export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
let run = 0;              // each start gets a number; an older reading stops by itself
const cache = new Map();  // file:page -> sentences

function conf() { return settings.value.aloud || {}; }

// the sentences of a page, each with the lines it is on (from the PDF's text, in reading order)
async function sentencesOf(f, page) {
  const k = f.id + ":" + page + ":" + (f.md5 || f.modified || "");
  if (cache.has(k)) return cache.get(k);
  const d = await getDoc(f);
  let lines = [];
  try { lines = await call("pageLines", d.key, page); } catch (e) { lines = []; }
  let text = "";
  const at = [];          // for each line: [start, end] in text
  for (const l of lines) {
    const t = (l.text || "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    let sep = text ? " " : "";
    if (text.endsWith("-") && /^[a-záéíóúñ]/.test(t)) { text = text.slice(0, -1); sep = ""; }   // a word cut at the end of a line
    const s0 = text.length + sep.length;
    text += sep + t;
    at.push([s0, text.length, [l.x, l.y, l.x + l.w, l.y + l.h]]);
  }
  const out = [];
  const re = /[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const s = m[0], a = m.index, b = a + s.length;
    if (!s.trim()) continue;
    // a very long sentence (a table, a list): in pieces of about 40 words
    const words = s.trim().split(/\s+/);
    const parts = [];
    for (let i = 0; i < words.length; i += 40) parts.push(words.slice(i, i + 40).join(" "));
    let off = a + (s.length - s.trimStart().length);
    for (const part of parts) {
      const pa = text.indexOf(part.split(" ")[0], off), pb = pa + part.length;
      const rects = at.filter(([x, y]) => x < pb && y > pa).map(r => r[2]);
      out.push({ text: part, a: pa, b: pb, rects, at: at.filter(([x, y]) => x < pb && y > pa) });
      off = pb;
    }
    void b;
  }
  cache.set(k, out);
  return out;
}

function speak(text, opts) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const c = conf();
    u.rate = c.rate || 1;
    const v = c.voice && speechSynthesis.getVoices().find(x => x.voiceURI === c.voice);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = document.documentElement.lang || loc;
    u.onboundary = opts.onWord || null;
    u.onend = () => resolve("end");
    u.onerror = () => resolve("error");
    speechSynthesis.speak(u);
  });
}

export function stopAloud(quiet = true) {
  run++;
  try { speechSynthesis.cancel(); } catch (e) {}
  aloud.value = { on: false };
  aloudMark.value = null;
  if (!quiet) toast(_t("Stopped reading."));
}

// read from a page (and a sentence) of a document, on through the book
export async function startAloud(fid = fileId.value, page = pageNo.value, from = 0, onlyText = null) {
  if (!canSpeak) { toast(_t("This browser cannot read aloud. Chrome, Edge and Safari can.")); return; }
  const book = currentBook.value;
  let f = fileFor(fid);
  if (!book || !f) { toast(_t("Open a book first.")); return; }
  stopAloud();
  const me = ++run;
  // the text you chose: just that
  if (onlyText) {
    aloud.value = { on: true, fileId: f.id, page, i: 0, n: 1, sel: true };
    await speak(onlyText, {});
    if (run === me) stopAloud();
    return;
  }
  let p = page, i = from;
  for (;;) {
    if (run !== me) return;
    let list = [];
    if (isPaged(f.kind) && f.kind !== "image") { try { list = await sentencesOf(f, p); } catch (e) { list = []; } }
    for (; i < list.length; i++) {
      if (run !== me) return;
      const s = list[i];
      aloud.value = { on: true, paused: false, fileId: f.id, page: p, i, n: list.length };
      aloudMark.value = { fileId: f.id, page: p, rects: s.rects };
      if (conf().follow !== false) {
        fileId.value = f.id; pageNo.value = p;
        const y = s.rects[0] ? s.rects[0][1] : 0;
        scrollTo.value = { fileId: f.id, page: p, y, soft: true };
      }
      const r = await speak(s.text, {
        onWord: (ev) => {
          if (run !== me || ev.name !== "word") return;
          const at = s.a + ev.charIndex;
          const line = s.at.find(([x, y]) => at >= x && at < y);
          if (line) aloudMark.value = { fileId: f.id, page: p, rects: s.rects, line: line[2] };
        },
      });
      if (run !== me) return;
      if (r === "error") { stopAloud(); toast(_t("The voice stopped. Press Read aloud again.")); return; }
    }
    // the next page, or the next document of the book
    if (conf().on === false) { stopAloud(); return; }
    const n = docState.value[f.id]?.pages?.length || 1;
    if (p + 1 < n) { p++; i = 0; continue; }
    const files = book.files.filter(x => isPaged(x.kind) && x.kind !== "image");
    const k = files.findIndex(x => x.id === f.id);
    if (k < 0 || k + 1 >= files.length) { stopAloud(); toast(_t("That was the end of the book.")); return; }
    f = files[k + 1]; p = 0; i = 0;
    try { await getDoc(f); } catch (e) { stopAloud(); return; }
  }
}

export function toggleAloud() {
  if (aloud.value.on) stopAloud(false);
  else startAloud();
}

function pause() {
  if (!aloud.value.on) return;
  if (aloud.value.paused) { speechSynthesis.resume(); aloud.value = { ...aloud.value, paused: false }; }
  else { speechSynthesis.pause(); aloud.value = { ...aloud.value, paused: true }; }
}

function step(by) {
  const a = aloud.value;
  if (!a.on || a.sel) return;
  startAloud(a.fileId, a.page, Math.max(0, (a.i || 0) + by));
}

// the player, at the bottom of the page while it reads
export function AloudPlayer() {
  const a = aloud.value;
  const [voices, setVoices] = useState(() => (canSpeak ? speechSynthesis.getVoices() : []));
  useEffect(() => {
    if (!canSpeak) return;
    const f = () => setVoices(speechSynthesis.getVoices());
    speechSynthesis.addEventListener?.("voiceschanged", f);
    return () => speechSynthesis.removeEventListener?.("voiceschanged", f);
  }, []);
  useEffect(() => () => stopAloud(), []);
  if (!a.on) return null;
  const c = conf();
  const set = (ch) => setSetting("aloud", { ...c, ...ch });
  const f = fileFor(a.fileId);
  const lang = (document.documentElement.lang || "en").slice(0, 2);
  const mine = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(lang));
  const others = voices.filter(v => !mine.includes(v));
  return (
    <div class="aloudbar" role="region" aria-label={_t("Reading aloud")}>
      <span class="ab-wave" aria-hidden="true"><i /><i /><i /><i /></span>
      <div class="ab-what"><b class="small">{_t("Reading aloud")}</b><span class="tiny muted ellipsis">{a.sel ? _t("The text you chose") : _t("{0} · page {1}", f ? f.name.replace(/\.[^.]+$/, "") : "", a.page + 1)}</span></div>
      <button class="ib" title={_t("The sentence before")} onClick={() => step(-1)} disabled={a.sel}><Icon n="left" size={18} /></button>
      <button class="ib ab-play" title={a.paused ? _t("Go on (space)") : _t("Pause (space)")} onClick={pause}><Icon n={a.paused ? "play" : "pause"} size={20} /></button>
      <button class="ib" title={_t("The next sentence")} onClick={() => step(1)} disabled={a.sel}><Icon n="right" size={18} /></button>
      <button class="btn plain small ab-speed" title={_t("How fast")} onClick={(e) => openMenu(e, [{ title: _t("How fast") }, ...[0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2].map(r => ({ label: ((c.rate || 1) === r ? "✓ " : "") + r + "×", run: () => { set({ rate: r }); if (!a.sel) startAloud(a.fileId, a.page, a.i); } }))])}>{(c.rate || 1) + "×"}</button>
      <button class="btn plain small" title={_t("The voice")} onClick={(e) => openMenu(e, [{ title: _t("The voice") },
        { label: (!c.voice ? "✓ " : "") + _t("The computer's own voice"), run: () => set({ voice: "" }) },
        ...mine.slice(0, 14).map(v => ({ label: (c.voice === v.voiceURI ? "✓ " : "") + v.name + " (" + v.lang + ")", run: () => { set({ voice: v.voiceURI }); if (!a.sel) startAloud(a.fileId, a.page, a.i); } })),
        others.length > 0 && { label: _t("Other languages"), sub: others.slice(0, 30).map(v => ({ label: (c.voice === v.voiceURI ? "✓ " : "") + v.name + " (" + v.lang + ")", run: () => { set({ voice: v.voiceURI }); if (!a.sel) startAloud(a.fileId, a.page, a.i); } })) },
        "-",
        { label: (c.follow !== false ? "✓ " : "") + _t("Follow the reading (turn the pages)"), run: () => set({ follow: c.follow === false }) },
        { label: (c.on !== false ? "✓ " : "") + _t("Go on to the next page"), run: () => set({ on: c.on === false }) },
      ])}><Icon n="people" size={15} />{_t("Voice")}</button>
      <button class="ib" title={_t("Stop (Esc)")} onClick={() => stopAloud()}><Icon n="close" size={18} /></button>
    </div>
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (!aloud.value.on) return;
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.key === "Escape") stopAloud();
    if (e.key === " ") { e.preventDefault(); pause(); }
  });
  window.addEventListener("bl-read-aloud", (e) => startAloud(e.detail.fileId, e.detail.page, 0, e.detail.text || null));
}
