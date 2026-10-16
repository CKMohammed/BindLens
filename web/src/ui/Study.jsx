// Study cards: your highlights and notes of a book as cards to review - the words on the front, where they come
// from on the back. "I knew it" puts a card at the end; "Again" keeps it near.
import { useEffect, useState } from "preact/hooks";
import { panel, currentBook, books, settings, setSetting, store, toast } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { allMarks, call } from "../docs.js";
import { fmtDate, escapeHtml, download } from "../util.js";
import { goToWord } from "./Find.jsx";

// the summary sheet: every highlight and note of the book, in the order of the book, as they are written
function sheetBlocks(book, list) {
  const blocks = [{ h: `${book.name} - summary` }, { p: `Your highlights and notes · ${fmtDate(new Date())} · BindLens`, small: true, color: "6E6A82" }];
  let lastFile = null;
  for (const c of list) {
    if (c.file.id !== lastFile) { blocks.push({ h2: c.file.name.replace(/\.[^.]+$/, "") }); lastFile = c.file.id; }
    blocks.push({ p: (c.note ? "Note: " : "") + c.front + `   (page ${c.page + 1})`, italic: !!c.note });
  }
  return blocks;
}
function blocksHtml(blocks) {
  return blocks.map(b => b.h ? `<h1>${escapeHtml(b.h)}</h1>` : b.h2 ? `<h2>${escapeHtml(b.h2)}</h2>` : `<p style="${b.italic ? "font-style:italic;" : ""}${b.small ? "font-size:9pt;" : ""}${b.color ? "color:#" + b.color : ""}">${escapeHtml(b.p)}</p>`).join("");
}
const SHEET_CSS = "body{font-family:sans-serif;font-size:11pt;line-height:1.4} h1{font-size:20pt;margin:0 0 4pt} h2{font-size:14pt;margin:14pt 0 4pt;color:#3a2e7a} p{margin:0 0 6pt}";

export function Study() {
  const book = currentBook.value || books.value[0];
  const [cards, setCards] = useState(null);
  const [inOrder, setInOrder] = useState([]);
  const [tab, setTab] = useState("cards");
  const [i, setI] = useState(0);
  const [back, setBack] = useState(false);
  const [known, setKnown] = useState(0);
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
            out.push({ front: words, note: m.type === "FreeText" || m.type === "Text" ? "Your note" : "", file: f, page: m.page });
          }
        } catch (e) {}
      }
      if (alive) setInOrder([...out]);
      // a different order each time
      for (let k = out.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [out[k], out[j]] = [out[j], out[k]]; }
      if (alive) setCards(out);
    })();
    return () => { alive = false; };
  }, [book?.id]);
  useEffect(() => {
    const k = (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); setBack(b => !b); }
      if (e.key === "ArrowRight") next(true);
      if (e.key === "ArrowLeft") next(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const next = (knew) => {
    if (!cards || !cards.length) return;
    const c = [...cards];
    const [card] = c.splice(i, 1);
    if (knew) { c.push(card); setKnown(n => n + 1); }
    else c.splice(Math.min(c.length, i + 3), 0, card);
    setCards(c);
    setBack(false);
    if (i >= c.length) setI(0);
  };
  const card = cards && cards[i];
  const sheetPdf = async () => (await import("../exportMarks.js")).exportMarks(book, "pdf");
  const sheetWord = async () => (await import("../exportMarks.js")).exportMarks(book, "word");
  const sheetGoogle = async () => (await import("../exportMarks.js")).exportMarks(book, "google").catch(e => toast("Google: " + e.message, "bad"));
  const tabs = (
    <div class="row" style={{ marginBottom: 12 }}>
      <button class={"btn small " + (tab === "cards" ? "" : "plain")} onClick={() => setTab("cards")}>Cards</button>
      <button class={"btn small " + (tab === "sheet" ? "" : "plain")} onClick={() => setTab("sheet")}>Summary sheet</button>
    </div>
  );
  if (tab === "sheet") return (
    <Dialog title={`Study · ${book ? book.name : ""}`} icon="star" onClose={close} cls="mid"
      foot={inOrder.length ? <><span class="grow small muted">{inOrder.length === 1 ? "1 highlight or note" : `${inOrder.length} highlights and notes`}, as you marked them</span>
        {store.value.createConverted && <button class="btn ghost" onClick={sheetGoogle}><Icon n="word" size={17} />In Google Docs</button>}
        <button class="btn soft" onClick={sheetWord}><Icon n="word" size={17} />As Word</button>
        <button class="btn" onClick={sheetPdf}><Icon n="pdf" size={17} />As PDF</button></> : null}>
      {tabs}
      {!inOrder.length ? <p class="muted">Nothing to put on the sheet yet. Highlight lines or write notes in the PDFs of this book.</p> : (
        <div class="rep-out" style={{ padding: "4px 14px", maxHeight: "52vh" }}>
          {sheetBlocks(book, inOrder).slice(2).map((b, k) => b.h2 ? <h3 key={k} style={{ margin: "12px 0 4px" }}>{b.h2}</h3> : <p key={k} class="small" style={{ margin: "0 0 6px", fontStyle: b.italic ? "italic" : "" }}>{b.p}</p>)}
        </div>
      )}
    </Dialog>
  );
  return (
    <Dialog title={`Study cards${book ? " · " + book.name : ""}`} icon="star" onClose={close} cls="mid"
      foot={card ? <>
        <span class="grow small muted">{known} known · {cards.length} cards · Space turns the card</span>
        <button class="btn plain" onClick={() => next(false)}>Again</button>
        <button class="btn" onClick={() => next(true)}><Icon n="check" size={17} />I knew it</button>
      </> : null}>
      {tabs}
      {!cards ? <div class="spinner" /> : !cards.length ? (
        <p class="muted">No cards yet. Highlight the important lines of your readings (or write notes on them), and they come here as cards to review.</p>
      ) : (
        <button onClick={() => setBack(!back)} style={{ width: "100%", minHeight: 260, border: 0, borderRadius: 18, cursor: "pointer", padding: 28,
          background: back ? "linear-gradient(135deg,#F3EFFA,#FBF8F1)" : "linear-gradient(135deg,#FFF6CC,#FFE9A8)", boxShadow: "var(--shadow2)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 12 }}>
          {!back ? <>
            <span class="tiny muted" style={{ textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>{card.note || "Highlight"}</span>
            <span style={{ font: "600 21px/1.4 Georgia,serif", color: "#1E1C2B" }}>{card.front}</span>
            <span class="tiny muted">Click or press Space to see where it comes from</span>
          </> : <>
            <span class="tiny muted" style={{ textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>From</span>
            <b style={{ fontSize: 18 }}>{card.file.name.replace(/\.[^.]+$/, "")}</b>
            <span class="muted">page {card.page + 1}</span>
            <span class="btn soft small" onClick={(e) => { e.stopPropagation(); close(); goToWord(book, card.file, card.page, card.front.slice(0, 40)); }}>Open the page</span>
          </>}
        </button>
      )}
      {void settings}{void setSetting}
    </Dialog>
  );
}
