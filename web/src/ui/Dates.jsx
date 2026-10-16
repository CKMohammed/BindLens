// What needs you: renewals, due dates, "valid until", deadlines - found in your documents - and your own reminders.
import { useEffect, useState } from "preact/hooks";
import { panel, settings, setSetting, books, openBook, toast } from "../state.js";
import { scrollTo } from "./Viewer.jsx";
import { Dialog, ask } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { allDeadlines, needs, status, calendarLink, icsOf, itemKey } from "../reports/dates.js";
import { goToWord } from "./Find.jsx";
import { fmtDate, isoDate, download, daysBetween, monthName, uid } from "../util.js";

// the dates of a calendar file (.ics): every event's day and title (a repeating one: its next dates, up to a year)
export function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out = [];
  let ev = null;
  const day = (v) => { const m = /(\d{4})(\d{2})(\d{2})/.exec(v || ""); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
  for (const l of lines) {
    if (l === "BEGIN:VEVENT") ev = {};
    else if (l === "END:VEVENT") {
      if (ev && ev.date) {
        out.push({ date: ev.date, text: ev.text || "Event" });
        const r = /FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/.exec(ev.rrule || "");
        if (r) {
          const cnt = Number((/COUNT=(\d+)/.exec(ev.rrule) || [])[1] || 0);
          const until = day((/UNTIL=([0-9T]+)/.exec(ev.rrule) || [])[1]);
          const d = new Date(ev.date + "T00:00");
          const end = Date.now() + 365 * 86400000;
          for (let i = 1; i < 400; i++) {
            if (r[1] === "DAILY") d.setDate(d.getDate() + 1); else if (r[1] === "WEEKLY") d.setDate(d.getDate() + 7);
            else if (r[1] === "MONTHLY") d.setMonth(d.getMonth() + 1); else d.setFullYear(d.getFullYear() + 1);
            const iso = isoDate(d);
            if ((cnt && i >= cnt) || (until && iso > until) || d.getTime() > end) break;
            out.push({ date: iso, text: ev.text || "Event" });
          }
        }
      }
      ev = null;
    } else if (ev) {
      const i = l.indexOf(":");
      const k = l.slice(0, i).split(";")[0], v = l.slice(i + 1);
      if (k === "DTSTART") ev.date = day(v);
      else if (k === "SUMMARY") ev.text = v.replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, " ");
      else if (k === "RRULE") ev.rrule = v;
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function MonthCal({ items, onDay, day }) {
  const [m, setM] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const startDow = (first.getDay() + 6) % 7;
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const byDay = new Map();
  for (const it of items) { const k = isoDate(it.date); byDay.set(k, [...(byDay.get(k) || []), it]); }
  const today = isoDate(new Date());
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(m.getFullYear(), m.getMonth(), d));
  return (
    <div style={{ background: "var(--panel2)", borderRadius: 14, padding: 12, border: "1px solid var(--line)" }}>
      <div class="row" style={{ marginBottom: 8 }}>
        <button class="ib" title="Month before" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))}><Icon n="left" /></button>
        <b class="grow" style={{ textAlign: "center" }}>{monthName(m.getMonth())} {m.getFullYear()}</b>
        <button class="ib" title="Next month" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))}><Icon n="right" /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, textAlign: "center" }}>
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(d => <span key={d} class="tiny muted">{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const k = isoDate(d);
          const its = byDay.get(k) || [];
          const sel = day === k;
          return (
            <button key={i} onClick={() => onDay(k)} style={{ border: 0, borderRadius: 9, padding: "6px 0", background: sel ? "var(--accent)" : k === today ? "var(--accent-soft)" : "transparent", color: sel ? "#fff" : "inherit", fontWeight: k === today ? 800 : 400, position: "relative" }}>
              {d.getDate()}
              {its.length > 0 && <i style={{ position: "absolute", left: "50%", bottom: 2, marginLeft: -3, width: 6, height: 6, borderRadius: 3, background: sel ? "#fff" : its.some(x => x.mine && !x.cal) ? "var(--accent)" : its.some(x => !x.mine) ? "var(--bad)" : "var(--ok)" }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Dates() {
  const [items, setItems] = useState(null);
  const [prog, setProg] = useState([0, 0]);
  const [show, setShow] = useState("needs");
  const [day, setDay] = useState(null);
  const close = () => { panel.value = null; };
  useEffect(() => {
    let alive = true;
    allDeadlines((a, b) => alive && setProg([a, b])).then(x => alive && setItems(x));
    return () => { alive = false; };
  }, [books.value.length]);
  const done = new Set(settings.value.datesDone || []);
  const today = new Date();
  const mine = [
    ...(settings.value.reminders || []).map(r => ({ ...r, date: new Date(r.date + "T00:00"), mine: true, what: r.fileId ? "About a page" : "Reminder", line: r.text, file: r.file || "", book: r.book || "" })),
    ...(settings.value.calendar || []).map(r => ({ ...r, date: new Date(r.date + "T00:00"), mine: true, cal: true, what: "Calendar", line: r.text, file: "", book: r.source || "" })),
  ].map(r => ({ ...r, days: daysBetween(today, r.date) }));
  const all = items ? [...items, ...mine].sort((a, b) => a.date - b.date) : null;
  let list = !all ? [] : show === "needs" ? [...needs(items), ...mine.filter(r => !r.cal && r.days >= -1 && r.days <= 30)].sort((a, b) => a.date - b.date)
    : show === "ahead" ? all.filter(x => x.days >= 0) : all;
  if (day) list = (all || []).filter(x => isoDate(x.date) === day);

  const markDone = (it) => {
    if (it.cal) { setSetting("calendar", (settings.value.calendar || []).filter(r => r.id !== it.id)); return; }
    if (it.mine) { setSetting("reminders", (settings.value.reminders || []).filter(r => r.id !== it.id)); return; }
    setSetting("datesDone", [...(settings.value.datesDone || []), itemKey(it)]);
  };
  const addReminder = async () => {
    const text = await ask("A reminder" + (day ? " for " + fmtDate(new Date(day + "T00:00")) : ""), { label: "What do you want to remember?", placeholder: "e.g. Call the accountant", ok: "Add it" });
    if (!text) return;
    let d = day;
    if (!d) {
      const t = await ask("When?", { label: "The date, e.g. 2026-11-20", value: isoDate(new Date(Date.now() + 7 * 86400000)), ok: "Add it" });
      if (!t || isNaN(new Date(t + "T00:00"))) return;
      d = t;
    }
    setSetting("reminders", [...(settings.value.reminders || []), { id: uid(), date: d, text }]);
  };
  const bringCalendar = async () => {
    const { pickFiles } = await import("../actions.js");
    const [f] = await pickFiles({ accept: ".ics,text/calendar", multiple: false });
    if (!f) return;
    const evs = parseIcs(await f.text());
    const from = Date.now() - 60 * 86400000;
    const keep = evs.filter(e => new Date(e.date + "T00:00").getTime() >= from).slice(0, 400)
      .map(e => ({ id: uid(), date: e.date, text: e.text, source: f.name.replace(/\.ics$/i, "") }));
    const others = (settings.value.calendar || []).filter(r => r.source !== f.name.replace(/\.ics$/i, ""));
    setSetting("calendar", [...others, ...keep]);
    toast(keep.length ? `${keep.length} dates from "${f.name}" are in the calendar.` : `"${f.name}" has no dates from the last two months on.`, keep.length ? "ok" : "");
  };
  const open = (it) => {
    if (it.mine && it.fileId) {
      const b = books.value.find(x => x.id === it.bookId);
      close();
      if (b) { openBook(b.id, it.fileId, it.page || 0); setTimeout(() => { scrollTo.value = { fileId: it.fileId, page: it.page || 0 }; }, 50); }
      return;
    }
    if (it.mine) return;
    const b = books.value.find(x => x.id === it.bookId);
    const f = b && b.files.find(x => x.id === it.fileId);
    close();
    if (b && f) goToWord(b, f, it.page, it.line.slice(0, 40));
    else if (b) openBook(b.id);
  };
  return (
    <Dialog title="What needs you" icon="clock" onClose={close} cls="wide"
      foot={<>
        <button class="btn plain" onClick={addReminder}><Icon n="plus" size={17} />A reminder of my own</button>
        <button class="btn plain" title="An .ics file from Outlook, Google Calendar or Apple Calendar" onClick={bringCalendar}><Icon n="calendar" size={17} />Bring in a calendar</button>
        <span class="grow" />
        {list.length > 0 && <button class="btn soft" onClick={() => download(icsOf(list.filter(x => x.days >= 0)), "BindLens dates.ics", "text/calendar")}><Icon n="calendar" size={17} />For Outlook / Apple Calendar</button>}
      </>}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 16 }} class="dates-grid">
        <div style={{ minWidth: 0 }}>
          <div class="row wrap" style={{ marginBottom: 10 }}>
            {[["needs", "Needs you"], ["ahead", "All dates ahead"], ["all", "All"]].map(([k, l]) => (
              <button key={k} class={"btn small " + (show === k && !day ? "" : "plain")} onClick={() => { setShow(k); setDay(null); }}>{l}</button>
            ))}
            {day && <span class="small">· {fmtDate(new Date(day + "T00:00"), true)} <button class="btn plain small" onClick={() => setDay(null)}>Show all</button></span>}
          </div>
          {!items ? <div style={{ textAlign: "center", padding: 20 }}><div class="spinner" /><p class="small muted">Reading the dates in your documents... {prog[0]} of {prog[1]}</p></div>
            : !list.length ? <p class="muted">{show === "needs" && !day ? "Nothing needs you now. Dates in the next 30 days, and the ones gone by, come here." : "No dates here."}</p>
              : (
                <div class="rep-out" style={{ maxHeight: "52vh" }}>
                  <table class="rows">
                    <thead><tr><th>Date</th><th>What</th><th>Where</th><th></th></tr></thead>
                    <tbody>
                      {list.map((it, i) => {
                        const st = status(it.days);
                        const isDone = !it.mine && done.has(itemKey(it));
                        return (
                          <tr key={i} style={isDone ? { opacity: .5 } : null}>
                            <td style={{ whiteSpace: "nowrap" }}><b>{fmtDate(it.date)}</b><div><span class={"chipst " + st.cls}>{st.text}</span></div></td>
                            <td><b>{it.what}</b><div class="small muted">{it.line}</div></td>
                            <td class="small">{it.cal ? <span class="muted">From {it.book}</span> : it.mine && !it.fileId ? <span class="muted">Your reminder</span> : <a href="#" onClick={(e) => { e.preventDefault(); open(it); }}>{it.file}</a>}{(!it.mine || it.fileId) && <div class="tiny muted">{it.book} · page {(it.page || 0) + 1}</div>}</td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <a class="ib" title="Add to Google Calendar" href={calendarLink({ ...it, file: it.file || it.line, book: it.book || "" })} target="_blank" rel="noopener"><Icon n="calendar" /></a>
                              {!isDone && <button class="ib" title={it.cal ? "Take it out of the calendar" : it.mine ? "Delete the reminder" : "Done: it no longer needs me"} onClick={() => markDone(it)}><Icon n={it.mine ? "trash" : "check"} /></button>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
        </div>
        <div>
          <MonthCal items={all || []} day={day} onDay={(k) => setDay(day === k ? null : k)} />
          <p class="tiny muted">Red dots: dates in your documents. Purple: your reminders. Green: a calendar you brought in. Click a day to see it, or to add a reminder to it.</p>
        </div>
      </div>
      <style>{"@media (max-width:760px){.dates-grid{grid-template-columns:1fr!important}}"}</style>
    </Dialog>
  );
}
