// A small Word file (.docx) made in the browser: headings and paragraphs, nothing more (the summary sheet).
import JSZip from "jszip";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// blocks: [{h: "Title"} | {h2: "Heading"} | {p: "text", italic?, small?, color?}]
export async function makeDocx(blocks) {
  const run = (t, { bold, italic, size, color, fill } = {}) => `<w:r><w:rPr>${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}${size ? `<w:sz w:val="${size}"/>` : ""}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ""}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const body = blocks.map(b => {
    if (b.h) return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${run(b.h, { bold: true, size: 36 })}</w:p>`;
    if (b.h2) return `<w:p><w:pPr><w:spacing w:before="240" w:after="80"/></w:pPr>${run(b.h2, { bold: true, size: 26 })}</w:p>`;
    // a highlight: its words on its colour, then where it comes from, small and grey
    const where = b.where ? run("   " + b.where, { size: 17, color: "8A8797" }) : "";
    return `<w:p><w:pPr><w:spacing w:after="100"/>${b.fill || b.note ? `<w:ind w:left="170"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${b.bar || "D9D6CE"}"/></w:pBdr>` : ""}</w:pPr>${run(b.p, { italic: b.italic, size: b.small ? 18 : 22, color: b.color, fill: b.fill })}${where}</w:p>`;
  }).join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}
