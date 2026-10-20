// New book from a template: a case file ready to fill - its sub-books, its checklist of documents, its icon and its shelf.
import { useState } from "preact/hooks";
import { panel, settings, setSetting, setBookMeta, store, books, openBook, toast } from "../state.js";
import { Dialog, ask } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { BookTile } from "./bookicons.jsx";
import { newBook } from "../actions.js";
import { uid } from "../util.js";
import { _t } from "../i18n.js";

const close = () => { panel.value = null; };

const OFFICE = _t("Office & administration"), UNI = _t("University");
export const TEMPLATES = [
  { group: OFFICE, name: _t("Employee file"), icon: "id_badge", color: "#2F4A7A", subs: [_t("Contract"), _t("ID and documents"), _t("Payroll"), _t("Training"), _t("Reviews")],
    check: [_t("Signed contract"), _t("Copy of ID or passport"), _t("Bank details"), _t("Tax form"), _t("Data protection consent"), _t("Emergency contact")] },
  { group: OFFICE, name: _t("Client or supplier"), icon: "handshake", color: "#2D6E6A", subs: [_t("Quotes"), _t("Contracts"), _t("Invoices"), _t("Letters and emails")],
    check: [_t("Signed contract"), _t("VAT or tax number"), _t("Bank details"), _t("Insurance certificate"), _t("Contact person")] },
  { group: OFFICE, name: _t("Project"), icon: "target", color: "#5A4A7A", subs: [_t("Plan"), _t("Meetings"), _t("Deliverables"), _t("Budget")],
    check: [_t("Project plan approved"), _t("Budget approved"), _t("Kick-off minutes"), _t("Risk list"), _t("Final report")] },
  { group: OFFICE, name: _t("Invoices of the year"), icon: "invoice", color: "#B8862E", subs: ["Q1", "Q2", "Q3", "Q4", _t("Receipts")],
    check: [_t("Q1 sent to the accountant"), _t("Q2 sent to the accountant"), _t("Q3 sent to the accountant"), _t("Q4 sent to the accountant"), _t("Year-end summary")] },
  { group: OFFICE, name: _t("Meetings and minutes"), icon: "calendar", color: "#3E6B8C", subs: [_t("Agendas"), _t("Minutes"), _t("Reports")],
    check: [_t("Agenda sent"), _t("Minutes approved")] },
  { group: OFFICE, name: _t("Tender or grant"), icon: "certificate", color: "#7A2E3E", subs: [_t("The call"), _t("Our application"), _t("Budget"), _t("Letters of support")],
    check: [_t("Call read and dates noted"), _t("Budget"), _t("Letters of support"), _t("Signed declaration"), _t("Application sent")] },
  { group: UNI, name: _t("Student file"), icon: "cap", color: "#3E6B8C", subs: [_t("Admission"), _t("ID and documents"), _t("Fees"), _t("Results"), _t("Letters and emails")],
    check: [_t("Application form"), _t("Copy of ID or passport"), _t("Previous transcript"), _t("Fee payment"), _t("Signed agreement")] },
  { group: UNI, name: _t("Course or module"), icon: "lecture", color: "#5E7D5A", subs: [_t("Syllabus"), _t("Lectures"), _t("Assignments"), _t("Exams"), _t("Grades")],
    check: [_t("Syllabus published"), _t("Assignment briefs"), _t("Exam paper approved"), _t("Grades submitted")] },
  { group: UNI, name: _t("Research project"), icon: "microscope", color: "#4A5568", subs: [_t("Proposal"), _t("Ethics"), _t("Data"), _t("Papers"), _t("Reports")],
    check: [_t("Proposal approved"), _t("Ethics approval"), _t("Data management plan"), _t("Interim report"), _t("Final report")] },
  { group: UNI, name: _t("Thesis"), icon: "thesis", color: "#9C4F2E", subs: [_t("Chapters"), _t("Literature"), _t("Data"), _t("Supervisor feedback")],
    check: [_t("Research proposal"), _t("Ethics approval"), _t("Draft chapters to the supervisor"), _t("Final draft"), _t("Submitted")] },
  { group: UNI, name: _t("Quality and accreditation"), icon: "shield", color: "#8A6D3B", subs: [_t("Self-evaluation"), _t("Evidence"), _t("Panel reports")],
    check: [_t("Self-evaluation report"), _t("Evidence collected"), _t("Panel visit"), _t("Action plan")] },
];

export async function makeFromTemplate(t, name) {
  const b = await newBook(name || t.name, { quiet: true });
  if (!b) return null;
  const made = [];
  for (const s of t.subs || []) {
    try {
      const sub = await store.value.createSub(s, b.id);
      made.push({ id: sub.id, name: s, path: s });
    } catch (e) { console.warn(e); }
  }
  books.value = books.value.map(x => x.id === b.id ? { ...x, subs: [...(x.subs || []), ...made] } : x);
  const shelves = settings.value.shelves || [];
  if (t.group && !shelves.includes(t.group)) setSetting("shelves", [...shelves, t.group]);
  setBookMeta(b.id, { icon: t.icon, color: t.color, tstyle: "flat", shelf: t.group || "", template: t.name,
    checklist: (t.check || []).map(text => ({ id: uid(), text, done: 0 })) });
  toast(_t("\"{0}\" is ready: {1} sub-books and a checklist of {2} documents.", b.name, made.length, (t.check || []).length), "ok", 5000);
  return b;
}

export function Templates() {
  const [busy, setBusy] = useState(false);
  const pick = async (t) => {
    if (busy) return;
    const name = await ask(_t("New book: ") + t.name, { label: _t("Its name (e.g. the person's, the client's or the project's)"), value: t.name === _t("Invoices of the year") ? _t("Invoices ") + new Date().getFullYear() : "", placeholder: t.name, ok: _t("Make the book") });
    if (name == null) return;
    setBusy(true);
    try { const b = await makeFromTemplate(t, name || t.name); if (b) { close(); openBook(b.id); } } finally { setBusy(false); }
  };
  const groups = [OFFICE, UNI];
  return (
    <Dialog title={_t("New book")} icon="template" onClose={close} cls="wide">
      <p class="small muted" style={{ marginTop: 0 }}>{_t("A template makes the book with its sub-books and a checklist of the documents it needs. You can change everything later.")}</p>
      <div class="tpl-grid">
        <button class="tpl" disabled={busy} onClick={async () => { const b = await newBook(); if (b) { close(); openBook(b.id); } }}>
          <span class="tpl-ico blank"><Icon n="plus" size={22} /></span><span><b>{_t("An empty book")}</b><small>{_t("A folder in your {0}, nothing in it", store.value.cloud || _t("library"))}</small></span>
        </button>
      </div>
      {groups.map(g => (
        <div key={g}>
          <div class="ap-sec">{g}</div>
          <div class="tpl-grid">
            {TEMPLATES.filter(t => t.group === g).map(t => (
              <button key={t.name} class="tpl" disabled={busy} onClick={() => pick(t)}>
                <BookTile book={{ id: t.name, name: t.name, color: t.color }} meta={{ icon: t.icon, color: t.color, tstyle: "flat" }} size={36} />
                <span><b>{t.name}</b><small>{t.subs.join(" · ")}</small><small class="tpl-check"><Icon n="checklist" size={12} />{t.check.length} {_t("documents to collect")}</small></span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {busy && <div class="ap-busy"><div class="spinner" style={{ width: 20, height: 20, margin: 0 }} /><span class="small">{_t("Making the book...")}</span></div>}
    </Dialog>
  );
}
