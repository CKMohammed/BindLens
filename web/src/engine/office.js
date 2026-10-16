// Word, Excel, PowerPoint and text files, turned into simple HTML so the engine can lay them out as pages.
// In the browser there is no Office, so they look close to the original, not exactly the same.
import { escapeHtml, ext } from "../util.js";

export const OFFICE_CSS = `
body{font-family:sans-serif;font-size:11pt;line-height:1.4;color:#1d1d24}
h1{font-size:20pt;margin:0 0 10pt} h2{font-size:15pt;margin:14pt 0 6pt} h3{font-size:12.5pt;margin:12pt 0 5pt}
p{margin:0 0 7pt} table{border-collapse:collapse;margin:6pt 0 10pt;width:100%}
td,th{border:0.6pt solid #9a98a8;padding:3pt 5pt;font-size:9.5pt;vertical-align:top;text-align:left}
th{background:#ece9f7;font-weight:bold}
.sheet{font-size:13pt;font-weight:bold;margin:0 0 8pt;color:#4a3fb0}
.slide{border:1pt solid #c9c6d8;padding:14pt;margin:0 0 14pt;page-break-after:always}
.slide h2{margin-top:0;color:#2b2470} pre{white-space:pre-wrap;font-family:monospace;font-size:9.5pt}
img{max-width:100%}
`;

async function docxToHtml(buf) {
  const mammoth = await import("mammoth");
  const r = await (mammoth.default || mammoth).convertToHtml({ arrayBuffer: buf });
  return r.value;
}

async function xlsxToHtml(buf, name) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
  let html = "";
  wb.SheetNames.forEach((sn, i) => {
    const ws = wb.Sheets[sn];
    if (!ws || !ws["!ref"]) return;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
    const used = rows.filter(r => r.some(c => String(c).trim() !== ""));
    if (!used.length) return;
    const ncol = Math.max(...used.map(r => r.length));
    if (wb.SheetNames.length > 1 || ext(name) !== "csv") html += `<div class="sheet"${i ? ' style="page-break-before:always"' : ""}>${escapeHtml(sn)}</div>`;
    html += "<table>";
    used.forEach((r, ri) => {
      html += "<tr>";
      for (let c = 0; c < ncol; c++) {
        const v = escapeHtml(r[c] ?? "");
        html += ri === 0 ? `<th>${v}</th>` : `<td>${v}</td>`;
      }
      html += "</tr>";
    });
    html += "</table>";
  });
  return html || "<p>(This spreadsheet is empty.)</p>";
}

async function pptxToHtml(buf) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml/)[1]) - Number(b.match(/(\d+)\.xml/)[1]));
  let html = "";
  for (const [i, n] of slides.entries()) {
    const xml = await zip.files[n].async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const paras = [...doc.getElementsByTagNameNS("*", "p")].map(p =>
      [...p.getElementsByTagNameNS("*", "t")].map(t => t.textContent).join("")).filter(t => t.trim());
    html += `<div class="slide"><h2>${escapeHtml(paras[0] || "Slide " + (i + 1))}</h2>`;
    for (const t of paras.slice(1)) html += `<p>${escapeHtml(t)}</p>`;
    html += "</div>";
  }
  return html || "<p>(No slides.)</p>";
}

function textToHtml(text, name) {
  if (ext(name) === "md") {
    return text.split(/\n{2,}/).map(block => {
      const m = /^(#{1,3})\s+(.*)/.exec(block);
      if (m) return `<h${m[1].length}>${escapeHtml(m[2])}</h${m[1].length}>`;
      if (/^\s*[-*]\s/.test(block)) return "<ul>" + block.split("\n").map(l => `<li>${escapeHtml(l.replace(/^\s*[-*]\s/, ""))}</li>`).join("") + "</ul>";
      return `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`;
    }).join("");
  }
  return `<pre>${escapeHtml(text)}</pre>`;
}

// -> {html} for the engine, or null when the engine opens the file itself
export async function toHtml(kind, name, buf) {
  const e = ext(name);
  if (kind === "word" && e === "docx") return docxToHtml(buf);
  if (kind === "excel") return xlsxToHtml(buf, name);
  if (kind === "powerpoint" && e === "pptx") return pptxToHtml(buf);
  if (kind === "text" && (e === "html" || e === "htm")) return new TextDecoder().decode(buf);
  if (kind === "text") return textToHtml(new TextDecoder().decode(buf), name);
  if (kind === "word" || kind === "powerpoint") {
    return `<h2>${escapeHtml(name)}</h2><p>This older Office file cannot be shown in the browser. Open it in Word or PowerPoint, or save it as .docx / .pptx.</p>`;
  }
  return null;
}

// the rows of a spreadsheet, exactly as they are (for Reports)
export async function sheetRows(buf, name) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
  return wb.SheetNames.map(sn => ({
    sheet: sn,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: "" })
      .filter(r => r.some(c => String(c).trim() !== "")),
  })).filter(s => s.rows.length);
}
