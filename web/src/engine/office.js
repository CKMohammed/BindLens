// Word, Excel, PowerPoint and text files, turned into simple HTML so the engine can lay them out as pages.
// In the browser there is no Office, so they look close to the original, not exactly the same.
import { escapeHtml, ext } from "../util.js";
import { _t } from "../i18n.js";

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
    html += `<div class="slide"><h2>${escapeHtml(paras[0] || _t("Slide ") + (i + 1))}</h2>`;
    for (const t of paras.slice(1)) html += `<p>${escapeHtml(t)}</p>`;
    html += "</div>";
  }
  return html || "<p>(No slides.)</p>";
}

// ---- e-mails (.eml), OpenDocument (.odt .ods .odp), RTF and data files (.json .xml .log ...), as the Windows app does

function decodeWords(s) {
  // =?utf-8?B?...?= and =?utf-8?Q?...?= in e-mail headers
  return String(s || "").replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (m, cs, enc, txt) => {
    try {
      let bytes;
      if (enc.toUpperCase() === "B") bytes = Uint8Array.from(atob(txt), c => c.charCodeAt(0));
      else bytes = Uint8Array.from(txt.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16))), c => c.charCodeAt(0));
      return new TextDecoder(cs).decode(bytes);
    } catch (e) { return txt; }
  }).replace(/\?=\s+=\?/g, "?==?");
}

function mimePart(raw) {
  const i = raw.search(/\r?\n\r?\n/);
  const head = (i < 0 ? raw : raw.slice(0, i)).replace(/\r?\n[ \t]+/g, " ");
  const body = i < 0 ? "" : raw.slice(i).replace(/^\r?\n\r?\n/, "");
  const headers = {};
  for (const line of head.split(/\r?\n/)) { const k = line.indexOf(":"); if (k > 0) headers[line.slice(0, k).trim().toLowerCase()] = line.slice(k + 1).trim(); }
  return { headers, body };
}

function decodeBody(part) {
  const enc = (part.headers["content-transfer-encoding"] || "").toLowerCase();
  const cs = (/charset="?([^";]+)/i.exec(part.headers["content-type"] || "") || [])[1] || "utf-8";
  let bytes;
  if (enc === "base64") { try { bytes = Uint8Array.from(atob(part.body.replace(/\s+/g, "")), c => c.charCodeAt(0)); } catch (e) { bytes = new TextEncoder().encode(part.body); } }
  else if (enc === "quoted-printable") bytes = Uint8Array.from(part.body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16))), c => c.charCodeAt(0) & 255);
  else bytes = Uint8Array.from(part.body, c => c.charCodeAt(0) & 255);
  try { return new TextDecoder(cs).decode(bytes); } catch (e) { return new TextDecoder().decode(bytes); }
}

function walkMime(part, out) {
  const ct = (part.headers["content-type"] || "text/plain").toLowerCase();
  const disp = part.headers["content-disposition"] || "";
  const fname = (/filename\*?="?([^";]+)/i.exec(disp) || /name="?([^";]+)/i.exec(part.headers["content-type"] || "") || [])[1];
  if (ct.startsWith("multipart/")) {
    const b = (/boundary="?([^";]+)"?/i.exec(part.headers["content-type"]) || [])[1];
    if (!b) return;
    for (const chunk of part.body.split("--" + b).slice(1)) {
      if (chunk.startsWith("--")) break;
      walkMime(mimePart(chunk.replace(/^\r?\n/, "")), out);
    }
  } else if (fname && /attachment|inline/i.test(disp || "attachment") && !ct.startsWith("text/plain")) out.att.push(decodeWords(fname));
  else if (ct.startsWith("text/plain") && out.plain == null) out.plain = decodeBody(part);
  else if (ct.startsWith("text/html") && out.html == null) out.html = decodeBody(part);
  else if (fname) out.att.push(decodeWords(fname));
}

function emlToHtml(buf) {
  const raw = new TextDecoder("latin1").decode(buf);
  const top = mimePart(raw);
  const out = { plain: null, html: null, att: [] };
  walkMime(top, out);
  let h = `<h1>${escapeHtml(decodeWords(top.headers.subject || _t("(no subject)")))}</h1><table style="border:0;width:auto">`;
  for (const k of ["from", "to", "cc", "date"]) if (top.headers[k]) h += `<tr><td style="border:0;color:#6B6F80;padding:0 8pt 1pt 0">${k[0].toUpperCase() + k.slice(1)}</td><td style="border:0;padding:0 0 1pt 0">${escapeHtml(decodeWords(top.headers[k]))}</td></tr>`;
  h += "</table>";
  if (out.plain != null) h += `<pre style="font-family:sans-serif;font-size:10.5pt;margin-top:10pt">${escapeHtml(out.plain.trim())}</pre>`;
  else if (out.html != null) h += out.html.replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<img[^>]*>/gi, "");
  if (out.att.length) h += "<h2>Attached</h2>" + out.att.map(a => `<p>• ${escapeHtml(a)}</p>`).join("");
  return h;
}

async function odfToHtml(buf) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("content.xml").async("string");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const textOf = (el) => {
    let t = "";
    for (const n of el.childNodes) {
      if (n.nodeType === 3) t += n.nodeValue;
      else if (n.localName === "s") t += " ".repeat(Math.min(50, Number(n.getAttribute("text:c") || 1)));
      else if (n.localName === "tab") t += "\t";
      else if (n.localName === "line-break") t += "\n";
      else if (n.localName !== "annotation") t += textOf(n);
    }
    return t;
  };
  const walk = (el) => {
    let h = "";
    for (const n of el.children) {
      const k = n.localName;
      if (k === "h") h += `<h2>${escapeHtml(textOf(n))}</h2>`;
      else if (k === "p") { const t = textOf(n); h += t.trim() ? `<p>${escapeHtml(t).replace(/\n/g, "<br>")}</p>` : ""; }
      else if (k === "list") h += "<ul>" + [...n.children].map(li => `<li>${escapeHtml([...li.getElementsByTagNameNS("*", "p")].map(textOf).join(" "))}</li>`).join("") + "</ul>";
      else if (k === "table") {
        const name = n.getAttribute("table:name");
        const rows = [...n.getElementsByTagNameNS("*", "table-row")].map(r => [...r.children].filter(c => c.localName === "table-cell").flatMap(c => Array(Math.min(20, Number(c.getAttribute("table:number-columns-repeated") || 1))).fill([...c.getElementsByTagNameNS("*", "p")].map(textOf).join(" ")))).filter(r => r.some(c => c.trim()));
        if (!rows.length) continue;
        const nc = Math.max(...rows.map(r => { let k2 = r.length; while (k2 > 0 && !r[k2 - 1].trim()) k2--; return k2; }));
        if (name && el.localName === "spreadsheet") h += `<div class="sheet">${escapeHtml(name)}</div>`;
        h += "<table>" + rows.slice(0, 5000).map((r, i) => "<tr>" + r.slice(0, nc).map(c => i === 0 ? `<th>${escapeHtml(c)}</th>` : `<td>${escapeHtml(c)}</td>`).join("") + "</tr>").join("") + "</table>";
      } else if (k === "page") h += `<div class="slide">${walk(n)}</div>`;
      else if (k === "frame" || k === "text-box" || k === "section" || k === "text" || k === "spreadsheet" || k === "presentation" || k === "body" || k === "custom-shape") h += walk(n);
    }
    return h;
  };
  const body = doc.getElementsByTagNameNS("*", "body")[0];
  return (body && walk(body)) || "<p>(This document is empty.)</p>";
}

function rtfToText(s) {
  let out = s.replace(/\{\\\*[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "")
    .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict)[\s\S]*?\}\s*(?=\\|\{|$)/g, "")
    .replace(/\\par[d]?\b ?/g, "\n").replace(/\\line\b ?/g, "\n").replace(/\\tab\b ?/g, "\t")
    .replace(/\\'([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u(-?\d+)\??/g, (m, n) => String.fromCharCode((Number(n) + 65536) % 65536))
    .replace(/\\[a-z]+-?\d* ?/gi, "").replace(/[{}]/g, "").replace(/\\([\\{}])/g, "$1");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

function textToHtml(text, name) {
  const e = ext(name);
  if (e === "json") { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (err) {} }
  if (e === "rtf") return rtfToText(text).split(/\n/).map(p => p.trim() ? `<p>${escapeHtml(p)}</p>` : "").join("") || "<p>(Empty.)</p>";
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
  if (e === "eml") return emlToHtml(buf);
  if (e === "odt" || e === "odp" || e === "ods") return odfToHtml(buf);
  if (e === "rtf") return textToHtml(new TextDecoder("latin1").decode(buf), name);
  if (kind === "word" && e === "docx") return docxToHtml(buf);
  if (kind === "excel") return xlsxToHtml(buf, name);
  if (kind === "powerpoint" && e === "pptx") return pptxToHtml(buf);
  if (kind === "text" && (e === "html" || e === "htm")) return new TextDecoder().decode(buf);
  if (kind === "text") return textToHtml(new TextDecoder().decode(buf), name);
  if (kind === "word" || kind === "powerpoint") {
    return `<h2>${escapeHtml(name)}</h2><p>${escapeHtml(_t("This older Office file cannot be shown in the browser by itself. Right-click it in the Library and choose \"Show it as it looks (Google converts it)\", or save it as .docx / .pptx."))}</p>`;
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
