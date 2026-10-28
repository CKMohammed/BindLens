// What needs you, shared by Home and its panel: open where a date comes from; count down to a date.
import { books, openBook, settings, setSetting, toast } from "../state.js";
import { scrollTo } from "./Viewer.jsx";
import { ask } from "./dialogs.jsx";
import { goToWord } from "./Find.jsx";
import { isoDate, uid } from "../util.js";
import { _t } from "../i18n.js";

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
  if (!text) text = await ask(_t("Count down to a date"), { label: _t("What is it?"), placeholder: _t("e.g. Audit, Exams, End of the contract"), ok: _t("Next") });
  if (!text) return;
  let d = preset?.date;
  if (!d) {
    d = await ask(_t("When?"), { label: _t("The date, e.g. 2026-12-18"), value: isoDate(new Date(Date.now() + 30 * 86400000)), ok: _t("Count down") });
    if (!d || isNaN(new Date(d + "T00:00"))) { if (d) toast(_t("Write the date like this: 2026-12-18")); return; }
  }
  setSetting("countdowns", [...(settings.value.countdowns || []).filter(c => c.text !== text), { id: uid(), text: text.slice(0, 60), date: d }].slice(-4));
  toast(_t("It counts down on Home."), "ok");
}


// expiry dates you add yourself (a document, a policy, a passport...): BindLens warns you some days before (30 by default)
export async function addExpiry(preset = {}) {
  const text = await ask(_t("Expiry date"), { label: _t("What expires?"), value: preset.text || "", placeholder: _t("e.g. Car insurance, Passport, Contract"), ok: _t("Next") });
  if (!text) return;
  const d = await ask(_t("When does it expire?"), { label: _t("The date, e.g. 2027-06-24"), value: isoDate(new Date(Date.now() + 365 * 86400000)), ok: _t("Next") });
  if (!d || isNaN(new Date(d + "T00:00"))) { if (d) toast(_t("Write the date like this: 2026-12-18")); return; }
  const b = await ask(_t("Remind me how many days before?"), { label: _t("Days, e.g. 30"), value: "30", ok: _t("Save") });
  if (b === null || b === undefined) return;
  const before = Math.max(0, Math.min(365, parseInt(b, 10) || 30));
  setSetting("expiries", [...(settings.value.expiries || []), { id: uid(), text: text.slice(0, 80), date: d, before,
    bookId: preset.bookId || "", fileId: preset.fileId || "", file: preset.file || "", book: preset.book || "" }]);
  toast(_t("I will remind you {0} days before.", before), "ok");
}
export function daysLeft(e) { return Math.round((new Date(e.date + "T00:00") - new Date(isoDate(new Date()) + "T00:00")) / 86400000); }
// the ones to warn about now: inside their warning days, or already expired
export function expiriesDue() { return (settings.value.expiries || []).filter(e => daysLeft(e) <= (e.before ?? 30)).sort((a, b) => a.date.localeCompare(b.date)); }
