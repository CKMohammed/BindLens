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

const CSS = "body{font-family:sans-serif;font-size:11pt;line-height:1.4;color:#1d1d24} h1{font-size:20pt;margin:0 0 10pt} h2{font-size:15pt;margin:14pt 0 6pt} p{margin:0 0 7pt} table{border-collapse:collapse;width:100%;margin:4pt 0 10pt} td,th{border:0.6pt solid #9a98a8;padding:4pt 5pt;vertical-align:top;text-align:left} th{background:#ece9f7} .ph{color:#1d1d24} img{max-width:100%}";

function Btn({ icon, label, cmd, arg, children }) {
  return <button class="ib" title={label} onMouseDown={(e) => { e.preventDefault(); document.execCommand(cmd, false, arg); }}>{icon ? <Icon n={icon} size={18} /> : children}</button>;
}

export function Write({ book: bid, into, at }) {
  const [tpl, setTpl] = useState("blank");
  const [busy, setBusy] = useState(false);
  const ref = useRef();
  const close = () => { panel.value = null; };
  const target = into ? fileFor(into) : null;
  useEffect(() => { ref.current.innerHTML = TEMPLATES[0].html(); }, []);
  const choose = (t) => {
    const empty = !ref.current.innerText.trim() || TEMPLATES.some(x => x.key === tpl);
    if (!empty && !confirm("Start again with this template? What you wrote goes.")) return;
    setTpl(t.key);
    ref.current.innerHTML = t.html();
    ref.current.focus();
  };
  const html = () => ref.current.innerHTML.replace(/<span class="ph">([\s\S]*?)<\/span>/g, "$1");

  const save = async () => {
    setBusy(true);
    try {
      const u8 = await call("htmlToPdf", html(), CSS);
      const bytes = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
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
    document.execCommand("insertHTML", false, `<img src="${url}" style="max-width:100%">`);
  };
  const insertTable = () => {
    ref.current.focus();
    document.execCommand("insertHTML", false, "<table><tr><th>Column</th><th>Column</th><th>Column</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></table><p><br></p>");
  };

  return (
    <Dialog title={target ? `Write a page for "${target.name}"` : "Write"} icon="edit" onClose={close} cls="wide"
      foot={<><span class="grow small muted">{target ? "The page goes into the PDF, after the page you were on." : "It is saved as a PDF in your book. You can mark it like any other."}</span>
        <button class="btn plain" onClick={close}>Cancel</button>
        <button class="btn" disabled={busy} onClick={save}>{busy ? "Saving..." : target ? "Add the page" : "Save in the book"}</button></>}>
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
          <Btn icon="undo" label="Undo" cmd="undo" />
          <Btn icon="redo" label="Redo" cmd="redo" />
        </div>
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
