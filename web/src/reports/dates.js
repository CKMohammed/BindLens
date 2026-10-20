// What needs you: the deadlines found in the documents (renewals, due dates, "valid until", submissions...).
import { books, settings, bookHidden } from "../state.js";
import { wordsOf } from "../docs.js";
import { deadlineDates } from "./patterns.js";
import { daysBetween, isoDate, isPaged } from "../util.js";
import { _t } from "../i18n.js";

const perFile = new Map(); // id:md5 -> items

export function itemKey(it) { return `${it.fileId}|${it.page}|${isoDate(it.date)}|${it.what}`; }

async function fileDeadlines(book, file, cachedOnly = false) {
  const k = file.id + ":" + (file.md5 || file.modified);
  if (perFile.has(k)) return perFile.get(k);
  const out = [];
  if (!isPaged(file.kind) || file.kind === "image" || (file.size && file.size > 25e6)) { perFile.set(k, out); return out; }
  try {
    const w = await wordsOf(file, { cachedOnly });
    if (!w) return out;               // not read yet: no dates from it for now (and nothing remembered)
    const { pages } = w;
    pages.forEach((pt, page) => {
      const lines = (pt || "").split(/\n+/).map(s => s.trim()).filter(Boolean);
      lines.forEach((line, i) => {
        const prev = i > 0 ? lines[i - 1] : "";
        const text = prev ? prev + "   " + line : line;
        const off = prev ? prev.length + 3 : 0;
        for (const d of deadlineDates({ text })) {
          if (d.at < off) continue;
          out.push({ date: d.date, what: d.what || _t("Date"), line, fileId: file.id, file: file.name, bookId: book.id,
            book: book.name, page });
        }
      });
    });
  } catch (e) { /* a file that cannot be read has no dates */ }
  const seen = new Set();
  const uniq = out.filter(it => { const key = itemKey(it); if (seen.has(key)) return false; seen.add(key); return true; });
  perFile.set(k, uniq);
  return uniq;
}

export async function allDeadlines(onProgress, cachedOnly = false) {
  const out = [];
  const list = books.value.filter(b => !bookHidden(b)).flatMap(b => b.files.map(f => [b, f]));
  let n = 0;
  for (const [b, f] of list) {
    out.push(...await fileDeadlines(b, f, cachedOnly));
    n++;
    onProgress && onProgress(n, list.length);
  }
  const today = new Date();
  for (const it of out) it.days = daysBetween(today, it.date);
  out.sort((a, b) => a.date - b.date);
  return out;
}

export function needs(items) {
  const done = new Set(settings.value.datesDone || []);
  return items.filter(it => it.days >= -60 && it.days <= 30 && !done.has(itemKey(it)));
}

// your own: reminders, tasks with a date, and a calendar brought in
export function myItems(today = new Date()) {
  const st = settings.value;
  return [
    ...(st.reminders || []).map(r => ({ ...r, date: new Date(r.date + "T00:00"), mine: true, what: r.fileId ? _t("About a page") : _t("Reminder"), line: r.text, file: r.file || "", book: r.book || "" })),
    ...(st.tasks || []).filter(t => t.due && !t.done).map(t => ({ ...t, id: t.id, date: new Date(t.due + "T00:00"), mine: true, task: true, what: _t("Task") + (t.who ? " · " + t.who : ""), line: t.text, file: t.file || "", book: t.book || "" })),
    ...(st.calendar || []).map(r => ({ ...r, date: new Date(r.date + "T00:00"), mine: true, cal: true, what: _t("Calendar"), line: r.text, file: "", book: r.source || "" })),
  ].map(r => ({ ...r, days: daysBetween(today, r.date) }));
}

// what needs you now: dates found in the documents (from 60 days ago to 30 ahead) and your own (from yesterday)
export async function needsNow(cachedOnly = true) {
  const items = await allDeadlines(null, cachedOnly);
  const mine = myItems().filter(r => !r.cal && r.days >= -1 && r.days <= 30);
  return [...needs(items), ...mine].sort((a, b) => a.date - b.date);
}

export async function needsCount() {
  return (await needsNow(true)).length;
}

export function status(days) {
  if (days < 0) return { cls: "bad", text: days === -1 ? _t("Yesterday") : _t("{0} days ago", -days) };
  if (days === 0) return { cls: "bad", text: _t("Today") };
  if (days <= 30) return { cls: "warn", text: days === 1 ? _t("Tomorrow") : _t("In {0} days", days) };
  return { cls: "ok", text: _t("In {0} days", days) };
}

// a link that adds the date to Google Calendar (no permission needed: it opens Calendar with the event filled in)
export function calendarLink(it) {
  const d = isoDate(it.date).replace(/-/g, "");
  const n = new Date(it.date); n.setDate(n.getDate() + 1);
  const d2 = isoDate(n).replace(/-/g, "");
  const title = `${it.what}: ${it.file.replace(/\.[^.]+$/, "")}`;
  const details = _t("{0}\n\nFrom \"{1}\" in the book \"{2}\" (BindLens).", it.line, it.file, it.book);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${d}/${d2}&details=${encodeURIComponent(details)}`;
}

// all of them as a calendar file (Outlook, Apple Calendar...)
export function icsOf(items) {
  const esc = (s) => String(s).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  let s = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//BindLens//Web//EN\r\n";
  for (const it of items) {
    const d = isoDate(it.date).replace(/-/g, "");
    s += `BEGIN:VEVENT\r\nUID:${encodeURIComponent(itemKey(it))}@bindlens.com\r\nDTSTAMP:${d}T090000Z\r\nDTSTART;VALUE=DATE:${d}\r\n` +
      `SUMMARY:${esc(it.what + ": " + it.file.replace(/\.[^.]+$/, ""))}\r\nDESCRIPTION:${esc(it.line)}\r\n` +
      `BEGIN:VALARM\r\nTRIGGER:-P7D\r\nACTION:DISPLAY\r\nDESCRIPTION:${esc(it.what)}\r\nEND:VALARM\r\nEND:VEVENT\r\n`;
  }
  return s + "END:VCALENDAR\r\n";
}
