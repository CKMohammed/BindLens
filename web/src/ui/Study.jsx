// Study cards: your highlights and notes of a book as cards to review - the words on the front, where they come
// from on the back. "I knew it" puts a card at the end; "Again" keeps it near.
import { useEffect, useState } from "preact/hooks";
import { panel, currentBook, books, settings, setSetting } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { allMarks } from "../docs.js";
import { goToWord } from "./Find.jsx";

export function Study() {
  const book = currentBook.value || books.value[0];
  const [cards, setCards] = useState(null);
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
  return (
    <Dialog title={`Study cards${book ? " · " + book.name : ""}`} icon="star" onClose={close} cls="mid"
      foot={card ? <>
        <span class="grow small muted">{known} known · {cards.length} cards · Space turns the card</span>
        <button class="btn plain" onClick={() => next(false)}>Again</button>
        <button class="btn" onClick={() => next(true)}><Icon n="check" size={17} />I knew it</button>
      </> : null}>
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
