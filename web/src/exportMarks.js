// The marks of a book (highlights, notes, texts) as a summary: a Word file, a PDF, or a Google Doc to keep working on.
import { allMarks, call } from "./docs.js";
import { store, toast, logChange } from "./state.js";
import { fmtDate, escapeHtml, download, rgbToHex } from "./util.js";

export async function marksOfBook(book) {
  const out = [];
  for (const f of book.files) {
    if (f.kind !== "pdf") continue;
    try {
      for (const m of await allMarks(f)) {
        const words = (m.text || m.contents || "").trim();
        if (!words || m.type === "Stamp" || m.type === "Ink") continue;
        out.push({ front: words, note: m.type === "FreeText" || m.type === "Text" ? "Your note" : "", file: f, page: m.page,
          color: m.color ? rgbToHex(m.color) : "", type: m.type });
      }
    } catch (e) {}
  }
  return out;
}

const soft = (hex) => {
  // the highlighter's colour, light enough to read on (for Word's shading)
  const h = (hex || "#FFE066").replace("#", "");
  const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 255).map(v => Math.round(v + (255 - v) * 0.45));
  return c.map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
};

export function marksBlocks(book, list) {
  const blocks = [{ h: `${book.name} - highlights and notes` }, { p: `${list.length} marks · ${fmtDate(new Date(), true)} · BindLens`, small: true, color: "6E6A82" }];
  let lastFile = null;
  for (const c of list) {
    if (c.file.id !== lastFile) { blocks.push({ h2: c.file.name.replace(/\.[^.]+$/, "") }); lastFile = c.file.id; }
    const hl = /Highlight/.test(c.type || "");
    blocks.push({ p: (c.note ? "Note: " : "") + c.front, italic: !!c.note, note: !!c.note, fill: hl ? soft(c.color) : "", bar: hl ? soft(c.color) : "C9C6D6", where: `page ${c.page + 1}` });
  }
  return blocks;
}

function blocksHtml(blocks) {
  return blocks.map(b => b.h ? `<h1>${escapeHtml(b.h)}</h1>` : b.h2 ? `<h2>${escapeHtml(b.h2)}</h2>`
    : `<p class="${b.fill || b.note ? "q" : ""}" style="${b.italic ? "font-style:italic;" : ""}${b.small ? "font-size:9pt;" : ""}${b.color ? "color:#" + b.color + ";" : ""}${b.bar ? "border-left-color:#" + b.bar : ""}">${b.fill ? `<span style="background:#${b.fill}">${escapeHtml(b.p)}</span>` : escapeHtml(b.p)}${b.where ? ` <small>${escapeHtml(b.where)}</small>` : ""}</p>`).join("");
}
const CSS = "body{font-family:sans-serif;font-size:11pt;line-height:1.45} h1{font-size:19pt;margin:0 0 4pt} h2{font-size:13pt;margin:16pt 0 6pt} p{margin:0 0 7pt} p.q{border-left:3pt solid #ddd;padding-left:8pt} small{color:#8a8797;font-size:8.5pt}";

export async function exportMarks(book, how, list) {
  list = list || await marksOfBook(book);
  if (!list.length) { toast("This book has no highlights or notes yet."); return; }
  const blocks = marksBlocks(book, list);
  const name = `${book.name} - highlights and notes`;
  if (how === "pdf") {
    const u8 = await call("htmlToPdf", blocksHtml(blocks), CSS);
    window.open(URL.createObjectURL(new Blob([u8], { type: "application/pdf" })), "_blank");
    return;
  }
  const { makeDocx } = await import("./docx.js");
  const docx = await makeDocx(blocks);
  if (how === "google" && store.value.createConverted) {
    toast("Making the Google Doc...");
    const f = await store.value.createConverted(null, name, docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "doc");
    logChange("Made a Google Doc with the highlights of", book.name);
    const { openBeside } = await import("./ui/AddPages.jsx");
    openBeside(store.value.editLink("doc", f.id));
    toast(`"${name}" is open in Google Docs. It is kept in the BindLens folder of your Drive.`, "ok", 6000);
    return;
  }
  download(docx, name + ".docx");
}
