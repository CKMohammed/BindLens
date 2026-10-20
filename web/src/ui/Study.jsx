// Study cards: your highlights and notes of a book as cards to review - the words on the front, where they come
// from on the back. Spaced repetition: each card comes back when it is due - Again (today), Hard, Good, Easy (later
// and later). What each card has learnt is kept with the settings in your Drive.
import { useEffect, useState } from "preact/hooks";
import { panel, currentBook, books, settings, setSetting, store, toast } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { allMarks, call } from "../docs.js";
import { fmtDate, escapeHtml, download } from "../util.js";
import { goToWord } from "./Find.jsx";
import { _t, loc } from "../i18n.js";

// the summary sheet: every highlight and note of the book, in the order of the book, as they are written
function sheetBlocks(book, list) {
  const blocks = [{ h: _t("{0} - summary", book.name) }, { p: _t("Your highlights and notes · {0} · BindLens", fmtDate(new Date())), small: true, color: "6E6A82" }];
  let lastFile = null;
  for (const c of list) {
    if (c.file.id !== lastFile) { blocks.push({ h2: c.file.name.replace(/\.[^.]+$/, "") }); lastFile = c.file.id; }
    blocks.push({ p: (c.note ? _t("Note: ") : "") + c.front + _t("   (page {0})", c.page + 1), italic: !!c.note });
  }
  return blocks;
}
function blocksHtml(blocks) {
  return blocks.map(b => b.h ? `<h1>${escapeHtml(b.h)}</h1>` : b.h2 ? `<h2>${escapeHtml(b.h2)}</h2>` : `<p style="${b.italic ? "font-style:italic;" : ""}${b.small ? "font-size:9pt;" : ""}${b.color ? "color:#" + b.color : ""}">${escapeHtml(b.p)}</p>`).join("");
}
const SHEET_CSS = "body{font-family:sans-serif;font-size:11pt;line-height:1.4} h1{font-size:20pt;margin:0 0 4pt} h2{font-size:14pt;margin:14pt 0 4pt;color:#3a2e7a} p{margin:0 0 6pt}";

// spaced repetition (as SM-2, simpler): the interval grows with each good answer; Again starts again
const GRADES = [[0, () => _t("Again"), "plain"], [1, () => _t("Hard"), "soft"], [2, () => _t("Good"), ""], [3, () => _t("Easy"), "soft"]];
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function cardId(fid, page, words) { let h = 0; for (const ch of words.slice(0, 200)) h = (h * 31 + ch.charCodeAt(0)) | 0; return `${fid}:${page}:${(h >>> 0).toString(36)}`; }
export function schedule(r, grade) {
  r = r || { ivl: 0, ease: 2.5, n: 0 };
  let { ivl, ease, n } = r;
  if (grade === 0) { ivl = 0; n = 0; ease = Math.max(1.3, ease - 0.2); }
  else if (grade === 1) { ivl = Math.max(1, Math.round(ivl * 1.2)); ease = Math.max(1.3, ease - 0.15); n++; }
  else { ivl = n === 0 ? (grade === 3 ? 4 : 1) : n === 1 ? (grade === 3 ? 8 : 3) : Math.round(ivl * ease * (grade === 3 ? 1.3 : 1)); if (grade === 3) ease += 0.15; n++; }
  const d = new Date(); d.setDate(d.getDate() + ivl);
  const due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { ivl, ease: Math.round(ease * 100) / 100, n, due };
}
const inDays = (n) => n <= 0 ? _t("today") : n === 1 ? _t("tomorrow") : _t("in {0} days", n);
function nextDue(cards) {
  const st = settings.value.study || {};
  const d = cards.map(c => st[c.id]?.due).filter(Boolean).sort()[0];
  return d ? new Date(d + "T00:00").toLocaleDateString(loc, { day: "numeric", month: "long" }) : "";
}

export function Study() {
  const book = currentBook.value || books.value[0];
  const [cards, setCards] = useState(null);
  const [inOrder, setInOrder] = useState([]);
  const [tab, setTab] = useState("cards");
  const [i, setI] = useState(0);
  const [back, setBack] = useState(false);
  const [known, setKnown] = useState(0);
  const [allCards, setAllCards] = useState([]);
  const close = () => { panel.value = null; };
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = [];
      for (const f of book ? book.files : []) {
        if (f.kind !== "pdf") continue;
        try {
          for (const m of await allMarks(f)) {
            const words = (m.text || m.contents || "").trim();
            if (!words || m.type === "Stamp" || m.type === "Ink") continue;
            out.push({ id: cardId(f.id, m.page, words), front: words, note: m.type === "FreeText" || m.type === "Text" ? _t("Your note") : "", file: f, page: m.page });
          }
        } catch (e) {}
      }
      if (alive) setInOrder([...out]);
      // a different order each time
      for (let k = out.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [out[k], out[j]] = [out[j], out[k]]; }
      // due first (new ones and those whose day has come); the rest wait for their day
      const st = settings.value.study || {}, today = todayIso();
      const due = out.filter(c => !st[c.id] || st[c.id].due <= today);
      if (alive) { setAllCards(out); setCards(due); }
    })();
    return () => { alive = false; };
  }, [book?.id]);
  useEffect(() => {
    const k = (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); setBack(b => !b); }
      if (e.key === "ArrowRight") next(3);
      if (e.key === "ArrowLeft") next(0);
      if (back && ["1", "2", "3", "4"].includes(e.key)) next(Number(e.key) - 1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  // grade: 0 Again, 1 Hard, 2 Good, 3 Easy
  const next = (grade) => {
    if (!cards || !cards.length) return;
    const c = [...cards];
    const [card] = c.splice(i, 1);
    const st = { ...(settings.value.study || {}) };
    st[card.id] = schedule(st[card.id], grade);
    setSetting("study", st);
    if (grade === 0) c.splice(Math.min(c.length, i + 3), 0, card);
    else setKnown(n => n + 1);
    setCards(c);
    setBack(false);
    if (i >= c.length) setI(0);
  };
  const card = cards && cards[i];
  const sheetPdf = async () => (await import("../exportMarks.js")).exportMarks(book, "pdf");
  const sheetWord = async () => (await import("../exportMarks.js")).exportMarks(book, "word");
  const sheetGoogle = async () => (await import("../exportMarks.js")).exportMarks(book, "google").catch(e => toast(_t("Google: ") + e.message, "bad"));
  const tabs = (
    <div class="row" style={{ marginBottom: 12 }}>
      <button class={"btn small " + (tab === "cards" ? "" : "plain")} onClick={() => setTab("cards")}>{_t("Cards")}</button>
      <button class={"btn small " + (tab === "sheet" ? "" : "plain")} onClick={() => setTab("sheet")}>{_t("Summary sheet")}</button>
    </div>
  );
  if (tab === "sheet") return (
    <Dialog title={_t("Study · {0}", book ? book.name : "")} icon="star" onClose={close} cls="mid"
      foot={inOrder.length ? <><span class="grow small muted">{inOrder.length === 1 ? _t("1 highlight or note") : _t("{0} highlights and notes", inOrder.length)}{_t(", as you marked them")}</span>
        {store.value.createConverted && <button class="btn ghost" onClick={sheetGoogle}><Icon n="word" size={17} />{_t("In Google Docs")}</button>}
        <button class="btn soft" onClick={sheetWord}><Icon n="word" size={17} />{_t("As Word")}</button>
        <button class="btn" onClick={sheetPdf}><Icon n="pdf" size={17} />{_t("As PDF")}</button></> : null}>
      {tabs}
      {!inOrder.length ? <p class="muted">{_t("Nothing to put on the sheet yet. Highlight lines or write notes in the PDFs of this book.")}</p> : (
        <div class="rep-out" style={{ padding: "4px 14px", maxHeight: "52vh" }}>
          {sheetBlocks(book, inOrder).slice(2).map((b, k) => b.h2 ? <h3 key={k} style={{ margin: "12px 0 4px" }}>{b.h2}</h3> : <p key={k} class="small" style={{ margin: "0 0 6px", fontStyle: b.italic ? "italic" : "" }}>{b.p}</p>)}
        </div>
      )}
    </Dialog>
  );
  return (
    <Dialog title={_t("Study cards{0}", book ? " · " + book.name : "")} icon="star" onClose={close} cls="mid"
      foot={card ? <>
        <span class="grow small muted">{_t("{0} to review · Space turns the card", cards.length)}</span>
        {!back ? <button class="btn" onClick={() => setBack(true)}>{_t("Show the answer")}</button> : GRADES.map(([g, l, cls]) => (
          <button key={g} class={"btn " + cls} title={_t("Next time: {0}", inDays(schedule((settings.value.study || {})[card.id], g).ivl))} onClick={() => next(g)}>{l()}<small style={{ opacity: .7, marginLeft: 4 }}>{g + 1}</small></button>
        ))}
      </> : null}>
      {tabs}
      {!cards ? <div class="spinner" /> : !cards.length && allCards.length ? (
        <div class="empty"><p>{known ? _t("Done for today: {0} cards reviewed.", known) : _t("Nothing to review today.")} {nextDue(allCards) ? _t("The next card is due {0}.", nextDue(allCards)) : ""}</p>
          <button class="btn soft" onClick={() => { setCards([...allCards].sort(() => Math.random() - 0.5)); setI(0); setBack(false); }}>{_t("Review them all anyway")}</button></div>
      ) : !cards.length ? (
        <p class="muted">{_t("No cards yet. Highlight the important lines of your readings (or write notes on them), and they come here as cards to review.")}</p>
      ) : (
        <button onClick={() => setBack(!back)} style={{ width: "100%", minHeight: 260, border: 0, borderRadius: 18, cursor: "pointer", padding: 28,
          background: back ? "linear-gradient(135deg,#F3EFFA,#FBF8F1)" : "linear-gradient(135deg,#FFF6CC,#FFE9A8)", boxShadow: "var(--shadow2)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 12 }}>
          {!back ? <>
            <span class="tiny muted" style={{ textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>{card.note || _t("Highlight")}</span>
            <span style={{ font: "600 21px/1.4 Georgia,serif", color: "#1E1C2B" }}>{card.front}</span>
            <span class="tiny muted">{_t("Click or press Space to see where it comes from")}</span>
          </> : <>
            <span class="tiny muted" style={{ textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>{_t("From")}</span>
            <b style={{ fontSize: 18 }}>{card.file.name.replace(/\.[^.]+$/, "")}</b>
            <span class="muted">{_t("page")} {card.page + 1}</span>
            <span class="btn soft small" onClick={(e) => { e.stopPropagation(); close(); goToWord(book, card.file, card.page, card.front.slice(0, 40)); }}>{_t("Open the page")}</span>
          </>}
        </button>
      )}
      {void settings}{void setSetting}
    </Dialog>
  );
}
