// Write: a new page or a new document - a letter, notes, an invoice - straight into a book, as a PDF.
import { useEffect, useRef, useState } from "preact/hooks";
import { panel, books, currentBook, toast, store, addFileToBook, openBook, logChange } from "../state.js";
import { Dialog, ask } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { call, fileFor, pageOp } from "../docs.js";
import { scrollTo } from "./Viewer.jsx";
import { fmtDate, uniqueName, cleanName } from "../util.js";
import { pickFiles } from "../actions.js";

const today = () => fmtDate(new Date(), true);
const ph = (t) => `<span class="ph">${t}</span>`;

export const TEMPLATES = [
  { key: "blank", name: "Blank page", html: () => "<p><br></p>" },
  { key: "notes", name: "Notes", html: () => `<h1>Notes</h1><p style="color:#6e6a82">${today()}</p><p>${ph("Write here...")}</p>` },
  { key: "letter", name: "Letter", html: () => `<p style="text-align:right"><b>Your name</b><br>Your address<br>Phone · email</p><p style="text-align:right">${today()}</p><p>Name of the person<br>Organisation<br>Address</p><p><b>Re: subject of the letter</b></p><p>Dear ...,</p><p>${ph("Write your letter here.")}</p><p>Yours sincerely,</p><p><br><br>Your name</p>` },
  { key: "meeting", name: "Meeting notes", html: () => `<h1>Meeting notes</h1><table><tr><td><b>Date</b></td><td>${today()}</td></tr><tr><td><b>Present</b></td><td>&nbsp;</td></tr><tr><td><b>Apologies</b></td><td>&nbsp;</td></tr></table><h2>Agenda</h2><ol><li></li><li></li></ol><h2>Decisions</h2><ul><li></li></ul><h2>Actions</h2><table><tr><th>What</th><th>Who</th><th>By when</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></table><p><b>Next meeting:</b> </p>` },
  { key: "todo", name: "To-do list", html: () => `<h1>To do</h1><p style="color:#6e6a82">${today()}</p><table><tr><th style="width:30pt">Done</th><th>What</th><th style="width:90pt">By when</th></tr>${"<tr><td>☐</td><td>&nbsp;</td><td>&nbsp;</td></tr>".repeat(10)}</table>` },
  { key: "invoice", name: "Invoice", html: () => `<table style="border:0"><tr><td style="border:0"><h1>INVOICE</h1></td><td style="border:0;text-align:right"><b>Your business</b><br>Address<br>Email · phone</td></tr></table><table><tr><td><b>Invoice no.</b></td><td>001</td><td><b>Date</b></td><td>${fmtDate(new Date())}</td></tr><tr><td><b>Bill to</b></td><td colspan="3">Client name, address</td></tr><tr><td><b>Due date</b></td><td colspan="3">${fmtDate(new Date(Date.now() + 30 * 86400000))}</td></tr></table><table><tr><th>Description</th><th style="width:50pt">Qty</th><th style="width:70pt">Price</th><th style="width:80pt">Amount</th></tr>${"<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>".repeat(5)}<tr><td colspan="3" style="text-align:right"><b>Total</b></td><td><b>€</b></td></tr></table><p><b>Payment:</b> IBAN ... · Payment terms: 30 days.</p><p>Thank you.</p>` },
  { key: "planner", name: "Weekly planner", html: () => `<h1>Week of ${fmtDate(new Date())}</h1><table>${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(d => `<tr><td style="width:90pt"><b>${d}</b></td><td style="height:56pt">&nbsp;</td></tr>`).join("")}</table><h2>Notes</h2><p></p>` },
  { key: "cover", name: "Report cover", html: () => `<p><br><br><br><br><br></p><h1 style="font-size:30pt;text-align:center">Title of the report</h1><p style="text-align:center;font-size:14pt;color:#6e6a82">Subtitle</p><p><br><br><br><br><br><br></p><p style="text-align:center"><b>Your name</b><br>Organisation<br>${today()}</p>` },
  { key: "cornell", name: "Cornell notes", html: () => `<h1>Topic</h1><p style="color:#6e6a82">Course · ${today()}</p><table><tr><th style="width:150pt">Questions & key words</th><th>Notes</th></tr><tr><td style="height:420pt"></td><td>&nbsp;</td></tr></table><h2>Summary</h2><p></p>` },
  { key: "memo", name: "Memo", html: () => `<h1>MEMO</h1><table style="border:0"><tr><td style="border:0;width:60pt"><b>To:</b></td><td style="border:0">&nbsp;</td></tr><tr><td style="border:0"><b>From:</b></td><td style="border:0">&nbsp;</td></tr><tr><td style="border:0"><b>Date:</b></td><td style="border:0">${today()}</td></tr><tr><td style="border:0"><b>Subject:</b></td><td style="border:0">&nbsp;</td></tr></table><hr><p>${ph("Write here...")}</p>` },
  { key: "quote", name: "Quote", html: () => `<h1>QUOTE</h1><table><tr><td><b>Quote no.</b></td><td>Q-001</td><td><b>Date</b></td><td>${fmtDate(new Date())}</td></tr><tr><td><b>For</b></td><td colspan="3">Client name</td></tr><tr><td><b>Valid until</b></td><td colspan="3">${fmtDate(new Date(Date.now() + 30 * 86400000))}</td></tr></table><table><tr><th>Work</th><th style="width:80pt">Amount</th></tr>${"<tr><td>&nbsp;</td><td>&nbsp;</td></tr>".repeat(5)}<tr><td style="text-align:right"><b>Total</b></td><td><b>€</b></td></tr></table>` },
];

const CSS = ".pb{page-break-after:always;height:0} table.pic,table.pic td{border:0} body{font-family:sans-serif;font-size:11pt;line-height:1.4;color:#1d1d24} h1{font-size:20pt;margin:0 0 10pt} h2{font-size:15pt;margin:14pt 0 6pt} p{margin:0 0 7pt} table{border-collapse:collapse;width:100%;margin:4pt 0 10pt} td,th{border:0.6pt solid #9a98a8;padding:4pt 5pt;vertical-align:top;text-align:left} th{background:#ece9f7} .ph{color:#1d1d24} img{max-width:100%}";

function Btn({ icon, label, cmd, arg, children }) {
  return <button class="ib" title={label} onMouseDown={(e) => { e.preventDefault(); document.execCommand(cmd, false, arg); }}>{icon ? <Icon n={icon} size={18} /> : children}</button>;
}

// the cell, row and table the caret is in (for the table tools)
function cellAt() {
  const s = getSelection();
  let n = s && s.anchorNode;
  while (n && n.nodeType !== 1) n = n.parentNode;
  const cell = n && n.closest && n.closest("td,th");
  if (!cell || !cell.closest(".paper")) return null;
  const row = cell.parentElement, table = cell.closest("table");
  return { cell, row, table, col: [...row.children].indexOf(cell) };
}
function emptyCell(tag = "td") { const c = document.createElement(tag); c.innerHTML = "&nbsp;"; return c; }
const TABLE = {
  rowAbove: (t) => { const r = t.row.cloneNode(false); for (const c of t.row.children) { const x = emptyCell(); if (c.colSpan > 1) x.colSpan = c.colSpan; r.appendChild(x); } t.row.before(r); },
  rowBelow: (t) => { const r = t.row.cloneNode(false); for (const c of t.row.children) { const x = emptyCell(); if (c.colSpan > 1) x.colSpan = c.colSpan; r.appendChild(x); } t.row.after(r); },
  colLeft: (t) => { for (const r of t.table.rows) { const c = r.children[Math.min(t.col, r.children.length - 1)]; c && c.before(emptyCell(c.tagName.toLowerCase())); } },
  colRight: (t) => { for (const r of t.table.rows) { const c = r.children[Math.min(t.col, r.children.length - 1)]; c && c.after(emptyCell(c.tagName.toLowerCase())); } },
  delRow: (t) => { if (t.table.rows.length > 1) t.row.remove(); else t.table.remove(); },
  delCol: (t) => { if (t.row.children.length < 2) { t.table.remove(); return; } for (const r of [...t.table.rows]) { const c = r.children[Math.min(t.col, r.children.length - 1)]; if (c && c.colSpan > 1) c.colSpan--; else c && c.remove(); } },
  delTable: (t) => t.table.remove(),
  merge: (t) => { const nx = t.cell.nextElementSibling; if (!nx) return; t.cell.colSpan = (t.cell.colSpan || 1) + (nx.colSpan || 1); if (nx.innerText.trim()) t.cell.innerHTML += " " + nx.innerHTML; nx.remove(); },
  split: (t) => { if ((t.cell.colSpan || 1) < 2) return; t.cell.colSpan--; t.cell.after(emptyCell(t.cell.tagName.toLowerCase())); },
  header: (t) => { const first = t.table.rows[0]; for (const c of [...first.children]) { const isH = c.tagName === "TH"; const x = document.createElement(isH ? "td" : "th"); x.innerHTML = c.innerHTML; if (c.colSpan > 1) x.colSpan = c.colSpan; if (c.style.cssText) x.style.cssText = c.style.cssText; c.replaceWith(x); } },
};

export function Write({ book: bid, into, at, edit }) {
  const [tpl, setTpl] = useState(edit ? "" : "blank");
  const [busy, setBusy] = useState(false);
  const [inTable, setInTable] = useState(false);
  const ref = useRef();
  const close = () => { panel.value = null; };
  const target = into ? fileFor(into) : null;
  const editing = edit ? fileFor(edit.fileId) : null;
  useEffect(() => { ref.current.innerHTML = edit ? edit.html : TEMPLATES[0].html(); }, []);
  useEffect(() => {
    const f = () => setInTable(!!cellAt());
    document.addEventListener("selectionchange", f);
    return () => document.removeEventListener("selectionchange", f);
  }, []);
  const tableDo = (k) => { const t = cellAt(); if (!t) { toast("Click in a table first."); return; } TABLE[k](t); };
  // a picture: click it to choose it, then its size, where the text goes, a caption
  const [pic, setPic] = useState(null);
  useEffect(() => {
    const el = ref.current;
    const f = (e) => { const img = e.target.closest && e.target.closest("img"); el.querySelectorAll("img.picked").forEach(x => x !== img && x.classList.remove("picked")); if (img && el.contains(img)) { img.classList.add("picked"); setPic(img); } else setPic(null); };
    el.addEventListener("click", f);
    return () => el.removeEventListener("click", f);
  }, []);
  const picHolder = (img) => img.closest("table.pic") || img.closest("p.picline") || img;
  const placePic = (how) => {
    const img = pic; if (!img) return;
    const holder = picHolder(img);
    const caption = holder.querySelector ? holder.querySelector(".cap") : null;
    const cap = caption ? caption.outerHTML : "";
    img.classList.remove("picked");
    const w = parseInt(img.style.width) || 200;
    img.style.width = Math.min(w, how === "line" ? 487 : 300) + "px";
    const imgHtml = img.outerHTML;
    let html;
    if (how === "line") html = `<p class="picline" style="text-align:center">${imgHtml}${cap ? "<br>" + cap : ""}</p>`;
    else {
      const side = `<td style="border:0;width:${parseInt(img.style.width) + 10}px;padding:${how === "right" ? "0 10px 0 0" : "0 0 0 10px"};vertical-align:top">${imgHtml}${cap ? "<br>" + cap : ""}</td>`;
      const words = `<td style="border:0;vertical-align:top"><p>Write here...</p></td>`;
      html = `<table class="pic" style="border:0;width:100%"><tr>${how === "right" ? side + words : words + side}</tr></table><p><br></p>`;
    }
    const tmp = document.createElement("div"); tmp.innerHTML = html;
    holder.replaceWith(...tmp.childNodes);
    setPic(null);
  };
  const sizePic = (px) => { if (!pic) return; pic.style.width = px + "px"; pic.style.maxWidth = "100%"; const td = pic.closest("table.pic td"); if (td) td.style.width = (px + 10) + "px"; };
  const captionPic = async () => {
    const img = pic; if (!img) return;
    const holder = picHolder(img);
    const old = holder.querySelector ? holder.querySelector(".cap") : null;
    const t = await ask("Caption", { label: "A few words under the picture", value: old ? old.innerText : "", ok: "Put the caption" });
    if (!t) return;
    if (old) { old.innerText = t; return; }
    let host;
    if (holder === img) {
      host = document.createElement("p"); host.className = "picline"; host.style.textAlign = "center";
      img.replaceWith(host); host.appendChild(img);
    } else host = holder.tagName === "TABLE" ? img.closest("td") : holder;
    const span = document.createElement("span"); span.className = "cap"; span.style.cssText = "font-size:9pt;color:#6e6a82"; span.innerText = t;
    host.appendChild(document.createElement("br")); host.appendChild(span);
  };

  const choose = (t) => {
    const empty = !ref.current.innerText.trim() || TEMPLATES.some(x => x.key === tpl);
    if (!empty && !confirm("Start again with this template? What you wrote goes.")) return;
    setTpl(t.key);
    ref.current.innerHTML = t.html();
    ref.current.focus();
  };
  const html = () => {
    const c = ref.current.cloneNode(true);
    c.querySelectorAll("img.picked").forEach(x => x.classList.remove("picked"));
    return c.innerHTML.replace(/<span class="ph">([\s\S]*?)<\/span>/g, "$1");
  };

  const save = async () => {
    setBusy(true);
    try {
      const u8 = await call("htmlToPdf", html(), CSS, 595, 842, 54, true);
      const bytes = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      if (editing) {
        await pageOp(editing, "replaceWritten", edit.start, edit.n, bytes);
        logChange("Changed a written page in", editing.name);
        toast(`The page in "${editing.name}" is changed. Undo (Ctrl+Z) brings the old one back.`, "ok", 5000);
        close();
        scrollTo.value = { fileId: editing.id, page: edit.start };
        return;
      }
      if (target) {
        await pageOp(target, "insertPages", at ?? 0, bytes);
        logChange("Wrote a page in", target.name);
        toast(`The page is in "${target.name}".`, "ok");
        close();
        scrollTo.value = { fileId: target.id, page: at ?? 0 };
        return;
      }
      let b = books.value.find(x => x.id === bid) || currentBook.value || books.value[0];
      if (!b) { toast("Make a book first."); setBusy(false); return; }
      const first = (ref.current.querySelector("h1")?.innerText || TEMPLATES.find(x => x.key === tpl)?.name || "New document").trim();
      let name = await ask("Save the document", { value: first === "Blank page" ? "New document" : first, label: `It goes in "${b.name}" as a PDF.`, ok: "Save" });
      if (!name) { setBusy(false); return; }
      name = uniqueName(cleanName(name).replace(/\.pdf$/i, "") + ".pdf", b.files.map(f => f.name));
      const f = await store.value.create(b.id, name, bytes, "application/pdf");
      addFileToBook(b.id, f);
      logChange("Wrote", name, b.name);
      toast(`"${name}" is saved in "${b.name}".`, "ok");
      close();
      openBook(b.id, f.id, 0);
      scrollTo.value = { fileId: f.id, page: 0 };
    } catch (e) {
      toast("Could not save it: " + e.message, "bad");
    }
    setBusy(false);
  };

  const insertPicture = async () => {
    const [f] = await pickFiles({ accept: "image/*", multiple: false });
    if (!f) return;
    const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    ref.current.focus();
    document.execCommand("insertHTML", false, `<p class="picline" style="text-align:center"><img src="${url}" style="width:320px;max-width:100%"></p><p><br></p>`);
    toast("Click the picture for its size, a caption, or text beside it.");
  };
  const insertTable = () => {
    ref.current.focus();
    document.execCommand("insertHTML", false, "<table><tr><th>Column</th><th>Column</th><th>Column</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></table><p><br></p>");
  };

  return (
    <Dialog title={editing ? `Edit the written page${edit.n > 1 ? "s" : ""} in "${editing.name}"` : target ? `Write a page for "${target.name}"` : "Write"} icon="edit" onClose={close} cls="wide"
      foot={<><span class="grow small muted">{editing ? "The changed page takes the place of the old one. Marks on the old page go with it." : target ? "The page goes into the PDF, after the page you were on." : "It is saved as a PDF in your book. You can mark it like any other, and open it here again: Edit this written page."}</span>
        <button class="btn plain" onClick={close}>Cancel</button>
        <button class="btn" disabled={busy} onClick={save}>{busy ? "Saving..." : editing ? "Save the changes" : target ? "Add the page" : "Save in the book"}</button></>}>
      <div class="writer">
        <div class="wt">
          <select class="field" style={{ width: 130, padding: "5px 8px" }} onChange={(e) => { document.execCommand("formatBlock", false, e.target.value); e.target.value = ""; }} value="">
            <option value="" disabled>Style</option><option value="P">Normal text</option><option value="H1">Title</option><option value="H2">Heading</option>
          </select>
          <Btn label="Bold" cmd="bold"><b>B</b></Btn>
          <Btn label="Italic" cmd="italic"><i>I</i></Btn>
          <Btn label="Underline" cmd="underline"><u>U</u></Btn>
          <Btn label="Strike" cmd="strikeThrough"><s>S</s></Btn>
          <input type="color" title="Text colour" defaultValue="#1d1d24" style={{ width: 30, height: 28, border: 0, background: "none" }} onInput={(e) => document.execCommand("foreColor", false, e.target.value)} />
          <span class="sep" />
          <Btn icon="list" label="Bullets" cmd="insertUnorderedList" />
          <Btn label="Numbered list" cmd="insertOrderedList"><b class="small">1.</b></Btn>
          <Btn label="Left" cmd="justifyLeft"><span class="small">⯇≡</span></Btn>
          <Btn label="Centre" cmd="justifyCenter"><span class="small">≡</span></Btn>
          <Btn label="Right" cmd="justifyRight"><span class="small">≡⯈</span></Btn>
          <span class="sep" />
          <button class="ib" title="A table" onMouseDown={(e) => { e.preventDefault(); insertTable(); }}><Icon n="table" size={18} /></button>
          <button class="ib" title="A picture" onMouseDown={(e) => { e.preventDefault(); insertPicture(); }}><Icon n="image" size={18} /></button>
          <button class="ib" title="A separator line" onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertHTML", false, "<hr><p><br></p>"); }}><Icon n="line" size={18} /></button>
          <button class="ib" title="A page break (what follows starts a new page)" onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertHTML", false, '<div class="pb" style="page-break-after:always"></div><p><br></p>'); }}><Icon n="addpage" size={18} /></button>
          <Btn icon="undo" label="Undo" cmd="undo" />
          <Btn icon="redo" label="Redo" cmd="redo" />
        </div>
        {pic && <div class="wt tbltools" style={{ borderTop: 0, paddingTop: 0 }} onMouseDown={(e) => e.preventDefault()}>
          <span class="tiny muted" style={{ fontWeight: 700 }}>PICTURE</span>
          <button class="btn plain small" onClick={() => sizePic(120)}>Small</button>
          <button class="btn plain small" onClick={() => sizePic(200)}>Medium</button>
          <button class="btn plain small" onClick={() => sizePic(320)}>Big</button>
          <button class="btn plain small" onClick={() => sizePic(487)}>Page wide</button>
          <span class="sep" />
          <button class="btn plain small" onClick={() => placePic("right")}>Text on its right</button>
          <button class="btn plain small" onClick={() => placePic("left")}>Text on its left</button>
          <button class="btn plain small" onClick={() => placePic("line")}>On its own line</button>
          <button class="btn plain small" onClick={captionPic}>Caption...</button>
          <span class="sep" />
          <button class="btn plain small" style={{ color: "var(--bad)" }} onClick={() => { picHolder(pic).remove(); setPic(null); }}>Delete the picture</button>
        </div>}
        {inTable && <div class="wt tbltools" style={{ borderTop: 0, paddingTop: 0 }} onMouseDown={(e) => e.preventDefault()}>
          <span class="tiny muted" style={{ fontWeight: 700 }}>TABLE</span>
          <button class="btn plain small" onClick={() => tableDo("rowAbove")} title="Add a row above">+ Row above</button>
          <button class="btn plain small" onClick={() => tableDo("rowBelow")} title="Add a row below">+ Row below</button>
          <button class="btn plain small" onClick={() => tableDo("colLeft")} title="Add a column left">+ Col. left</button>
          <button class="btn plain small" onClick={() => tableDo("colRight")} title="Add a column right">+ Col. right</button>
          <button class="btn plain small" onClick={() => tableDo("merge")} title="Merge with the cell on the right">Merge</button>
          <button class="btn plain small" onClick={() => tableDo("split")} title="Split the cell">Split</button>
          <button class="btn plain small" onClick={() => tableDo("header")} title="The first row is a header (or not)">Header</button>
          <label class="row tiny" title="The colour of this cell">Cell<input type="color" defaultValue="#ece9f7" style={{ width: 26, height: 22, border: 0, background: "none" }} onInput={(e) => { const t = cellAt(); if (t) t.cell.style.background = e.target.value; }} /></label>
          <label class="row tiny" title="The colour of the header row">Header<input type="color" defaultValue="#ece9f7" style={{ width: 26, height: 22, border: 0, background: "none" }} onInput={(e) => { const t = cellAt(); if (t) t.table.querySelectorAll("th").forEach(c => { c.style.background = e.target.value; }); }} /></label>
          <span class="sep" />
          <button class="btn plain small" onClick={() => tableDo("delRow")} title="Delete this row">− Row</button>
          <button class="btn plain small" onClick={() => tableDo("delCol")} title="Delete this column">− Col.</button>
          <button class="btn plain small" style={{ color: "var(--bad)" }} onClick={() => tableDo("delTable")} title="Delete the table">− Table</button>
        </div>}
        <div class="wbody">
          <div class="tpl">
            <div class="tiny muted" style={{ padding: "4px 10px", fontWeight: 700, letterSpacing: ".05em" }}>START FROM</div>
            {TEMPLATES.map(t => <button key={t.key} class={tpl === t.key ? "on" : ""} onClick={() => choose(t)}>{t.name}</button>)}
          </div>
          <div class="paper-wrap">
            <div ref={ref} class="paper" contentEditable spellcheck
              onFocus={(e) => { const p = e.target.querySelector(".ph"); if (p) { const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
