// New book from a template: a case file ready to fill - its sub-books, its checklist of documents, its icon and its shelf.
import { useState } from "preact/hooks";
import { panel, settings, setSetting, setBookMeta, store, books, openBook, toast } from "../state.js";
import { Dialog, ask } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { BookTile } from "./bookicons.jsx";
import { newBook } from "../actions.js";
import { uid } from "../util.js";

const close = () => { panel.value = null; };

const OFFICE = "Office & administration", UNI = "University";
export const TEMPLATES = [
  { group: OFFICE, name: "Employee file", icon: "id_badge", color: "#2F4A7A", subs: ["Contract", "ID and documents", "Payroll", "Training", "Reviews"],
    check: ["Signed contract", "Copy of ID or passport", "Bank details", "Tax form", "Data protection consent", "Emergency contact"] },
  { group: OFFICE, name: "Client or supplier", icon: "handshake", color: "#2D6E6A", subs: ["Quotes", "Contracts", "Invoices", "Letters and emails"],
    check: ["Signed contract", "VAT or tax number", "Bank details", "Insurance certificate", "Contact person"] },
  { group: OFFICE, name: "Project", icon: "target", color: "#5A4A7A", subs: ["Plan", "Meetings", "Deliverables", "Budget"],
    check: ["Project plan approved", "Budget approved", "Kick-off minutes", "Risk list", "Final report"] },
  { group: OFFICE, name: "Invoices of the year", icon: "invoice", color: "#B8862E", subs: ["Q1", "Q2", "Q3", "Q4", "Receipts"],
    check: ["Q1 sent to the accountant", "Q2 sent to the accountant", "Q3 sent to the accountant", "Q4 sent to the accountant", "Year-end summary"] },
  { group: OFFICE, name: "Meetings and minutes", icon: "calendar", color: "#3E6B8C", subs: ["Agendas", "Minutes", "Reports"],
    check: ["Agenda sent", "Minutes approved"] },
  { group: OFFICE, name: "Tender or grant", icon: "certificate", color: "#7A2E3E", subs: ["The call", "Our application", "Budget", "Letters of support"],
    check: ["Call read and dates noted", "Budget", "Letters of support", "Signed declaration", "Application sent"] },
  { group: UNI, name: "Student file", icon: "cap", color: "#3E6B8C", subs: ["Admission", "ID and documents", "Fees", "Results", "Letters and emails"],
    check: ["Application form", "Copy of ID or passport", "Previous transcript", "Fee payment", "Signed agreement"] },
  { group: UNI, name: "Course or module", icon: "lecture", color: "#5E7D5A", subs: ["Syllabus", "Lectures", "Assignments", "Exams", "Grades"],
    check: ["Syllabus published", "Assignment briefs", "Exam paper approved", "Grades submitted"] },
  { group: UNI, name: "Research project", icon: "microscope", color: "#4A5568", subs: ["Proposal", "Ethics", "Data", "Papers", "Reports"],
    check: ["Proposal approved", "Ethics approval", "Data management plan", "Interim report", "Final report"] },
  { group: UNI, name: "Thesis", icon: "thesis", color: "#9C4F2E", subs: ["Chapters", "Literature", "Data", "Supervisor feedback"],
    check: ["Research proposal", "Ethics approval", "Draft chapters to the supervisor", "Final draft", "Submitted"] },
  { group: UNI, name: "Quality and accreditation", icon: "shield", color: "#8A6D3B", subs: ["Self-evaluation", "Evidence", "Panel reports"],
    check: ["Self-evaluation report", "Evidence collected", "Panel visit", "Action plan"] },
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
  toast(`"${b.name}" is ready: ${made.length} sub-books and a checklist of ${(t.check || []).length} documents.`, "ok", 5000);
  return b;
}

export function Templates() {
  const [busy, setBusy] = useState(false);
  const pick = async (t) => {
    if (busy) return;
    const name = await ask("New book: " + t.name, { label: "Its name (e.g. the person's, the client's or the project's)", value: t.name === "Invoices of the year" ? "Invoices " + new Date().getFullYear() : "", placeholder: t.name, ok: "Make the book" });
    if (name == null) return;
    setBusy(true);
    try { const b = await makeFromTemplate(t, name || t.name); if (b) { close(); openBook(b.id); } } finally { setBusy(false); }
  };
  const groups = [OFFICE, UNI];
  return (
    <Dialog title="New book" icon="template" onClose={close} cls="wide">
      <p class="small muted" style={{ marginTop: 0 }}>A template makes the book with its sub-books and a checklist of the documents it needs. You can change everything later.</p>
      <div class="tpl-grid">
        <button class="tpl" disabled={busy} onClick={async () => { const b = await newBook(); if (b) { close(); openBook(b.id); } }}>
          <span class="tpl-ico blank"><Icon n="plus" size={22} /></span><span><b>An empty book</b><small>A folder in your {store.value.cloud || "library"}, nothing in it</small></span>
        </button>
      </div>
      {groups.map(g => (
        <div key={g}>
          <div class="ap-sec">{g}</div>
          <div class="tpl-grid">
            {TEMPLATES.filter(t => t.group === g).map(t => (
              <button key={t.name} class="tpl" disabled={busy} onClick={() => pick(t)}>
                <BookTile book={{ id: t.name, name: t.name, color: t.color }} meta={{ icon: t.icon, color: t.color, tstyle: "flat" }} size={36} />
                <span><b>{t.name}</b><small>{t.subs.join(" · ")}</small><small class="tpl-check"><Icon n="checklist" size={12} />{t.check.length} documents to collect</small></span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {busy && <div class="ap-busy"><div class="spinner" style={{ width: 20, height: 20, margin: 0 }} /><span class="small">Making the book...</span></div>}
    </Dialog>
  );
}
