// What needs you, shared by Home and its panel: open where a date comes from; count down to a date.
import { books, openBook, settings, setSetting, toast } from "../state.js";
import { scrollTo } from "./Viewer.jsx";
import { ask } from "./dialogs.jsx";
import { goToWord } from "./Find.jsx";
import { isoDate, uid } from "../util.js";

// open the page a date comes from (or the page of a reminder or a task)
export function openItem(it) {
  if (it.mine && it.fileId) {
    const b = books.value.find(x => x.id === it.bookId);
    if (b) { openBook(b.id, it.fileId, it.page || 0); setTimeout(() => { scrollTo.value = { fileId: it.fileId, page: it.page || 0 }; }, 50); }
    return;
  }
  if (it.mine) { if (it.bookId) openBook(it.bookId); return; }
  const b = books.value.find(x => x.id === it.bookId);
  const f = b && b.files.find(x => x.id === it.fileId);
  if (b && f) goToWord(b, f, it.page, it.line.slice(0, 40));
  else if (b) openBook(b.id);
}

// count down to a date, on Home
export async function addCountdown(preset) {
  let text = preset?.text;
  if (!text) text = await ask("Count down to a date", { label: "What is it?", placeholder: "e.g. Audit, Exams, End of the contract", ok: "Next" });
  if (!text) return;
  let d = preset?.date;
  if (!d) {
    d = await ask("When?", { label: "The date, e.g. 2026-12-18", value: isoDate(new Date(Date.now() + 30 * 86400000)), ok: "Count down" });
    if (!d || isNaN(new Date(d + "T00:00"))) { if (d) toast("Write the date like this: 2026-12-18"); return; }
  }
  setSetting("countdowns", [...(settings.value.countdowns || []).filter(c => c.text !== text), { id: uid(), text: text.slice(0, 60), date: d }].slice(-4));
  toast("It counts down on Home.", "ok");
}

