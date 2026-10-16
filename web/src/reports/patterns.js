// Finding data in text: emails, phones, addresses, dates, amounts - the same rules as the Windows app.
export const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7,
  july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12,
  december: 12, enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9,
  setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const MON_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

export const RE = {
  Emails: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  Links: /(?:https?:\/\/\s?|www\.)[^\s<>"')\]]+/gi,
  Dates: new RegExp(String.raw`\b(?:\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2}|` +
    String.raw`\d{1,2}(?:st|nd|rd|th)?(?:\s+de)?\s+(?:${MON_RE})\.?(?:,?\s+(?:de\s+)?\d{4})?|` +
    String.raw`(?:${MON_RE})\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b`, "gi"),
  Amounts: /(?:[€$£][ \t]?\d[\d.,]*\d|\d[\d.,]*\d?[ \t]?(?:€|EUR|USD|GBP|euros?)(?!\w))/gi,
  Phones: /(?<![\w/.,-])(?:\+\d{1,3}[ .-]?)?\(?\d{2,4}\)?(?:[ .-]?\d{2,4}){2,4}(?![\w/,-])/g,
  Addresses: new RegExp(String.raw`\b\d{1,4}[A-Za-z]?,?\s+(?:[A-Z][\w'.-]*\s+){0,4}(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Lane|Ln\.?|` +
    String.raw`Drive|Dr\.?|Park|Square|Sq\.?|Court|Ct\.?|Place|Pl\.?|Terrace|Close|Way|Crescent|Grove|Gardens|Row|Quay|` +
    String.raw`Hill|View|Green|Walk|Rise|Heights|Mews)\b[^\n|]{0,60}` +
    String.raw`|\b(?:C\/|Calle|Avda\.?|Avenida|Plaza|Pza\.?|Paseo|Camino|Carretera|Ctra\.?)\s+[^\n|,]{2,40}(?:,\s*\d{1,4})?[^\n|]{0,40}` +
    String.raw`|\b[AC-FHKNPRTV-Y]\d{2}\s?[0-9AC-FHKNPRTV-Y]{4}\b` +
    String.raw`|\b[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}\b`, "g"),
  IDs: /\b(?:(?:invoice|inv|order|ref|reference|no|number|quote|receipt|account|acct|policy|case|ticket|id)\.?\s*(?:no\.?|number|#)?\s*[:#]?\s*)([A-Z]{0,4}[-/]?\d[\dA-Z/-]{2,})\b|\b\d{7}[A-W][A-IW]?\b|\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/gi,
  Companies: /\b(?:[A-Z][\w&'.-]*\s){0,4}(?:Ltd\.?|Limited|LLC|Inc\.?|PLC|plc|GmbH|S\.?L\.?|S\.?A\.?|Teoranta|DAC|CLG|Council|University|College|Institute|Bank|Group|Accountants|Builders|Design|Consulting|Solutions|Services|Insurance|Partners)\b/g,
};

const UP = "A-ZÀ-ÖØ-ÞĀ-Ž", LO = "a-zß-öø-ÿĀ-ž";
const NW = `(?:Mc[A-Z][a-z]+|Mac[A-Z][a-z]+|O['’][${UP}][${LO}]+|[${UP}][${LO}'’-]+)`;
const PART = `(?:Ó|Ní|Nic|Uí|Ua|Mac|Mc)(?=[ \\t]+[${UP}])`;
export const NAME_RE = new RegExp(`^(?:(?:Mr|Mrs|Ms|Miss|Dr)\\.?[ \\t]+)?${NW}(?:[ \\t]+(?:${PART}|${NW}|[${UP}]\\.?|de|del|la|van|von)){1,4}$`, "u");
export const NAME_IN_TEXT = new RegExp(`(?:(?:Mr|Mrs|Ms|Miss|Dr)\\.?[ \\t]+)?${NW}(?:[ \\t]+(?:${PART}|${NW}|[${UP}]\\.?(?=[ \\t]))){1,3}`, "gu");

export const NAME_HDR = /\b(name|full name|contact|staff|student|employee|person|member|client|customer|teacher|worker|owner|tenant|landlord|supplier|nombre|alumno)\b/i;
export const ORG_HDR = /\b(organi[sz]ation|company|institution|centre|center|service|employer|agency|business|provider|club|department|empresa|centro|university|college)\b/i;
export const EMAIL_HDR = /e-?mail|correo/i;
export const PHONE_HDR = /phone|mobile|tel|cell|móvil|movil|teléfono|telefono/i;
export const ADDR_HDR = /address|street|eircode|postcode|direcci[oó]n/i;
export const EXPIRY_COL = /expir|valid|renew|due|review|deadline|until|ends?\b|caduc|vence/i;
export const NOT_EXPIRY = /\b(issued?|date of issue|issue date|received|d\.?o\.?b\.?|date of birth|birth|born|started?|start date|signed|completed|attended|commenced|joined|from|printed|created|dated)\b/i;
export const EXPIRY_RE = /\b(expir\w*|valid (?:until|to|till)|renew\w*|due(?: date| by| on)?|deadline|review date|ends? (?:on|date)|end date|closing date|before|no later than|submission|submit\w*|caduc\w*|vence|vencimiento|fecha l[ií]mite|plazo)\b/gi;

const NOT_NAMES = new Set(("Dear Sir Madam Yours Sincerely Kind Regards Best Thank You Monday Tuesday Wednesday Thursday Friday " +
  "Saturday Sunday January February March April May June July August September October November December Total Invoice " +
  "Page Date Client Contact Start Notes Scope Name Email Phone Company Quote Office Street Road Payment Terms Item " +
  "Amount Due Valid Until Offer Design Budget Summary Chapter Lecture Week Abstract Present Decisions Launch Content " +
  "Milestones Team Service Term Renewal Policy Tax Return Receipts Bill Items Paper Printer Toner Folders Research Question " +
  "Deadline Sources Supply Demand Regression Day Keynote Venue Address Speakers Programme").split(" "));

export function allMatches(re, text) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text || ""))) {
    out.push({ v: m[0], at: m.index, end: m.index + m[0].length, g: m });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

export function cleanPhone(p) {
  const digits = p.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  if (/^(19|20)\d{2}$/.test(digits)) return null;
  return p.trim();
}

export function looksLikeName(s) {
  s = (s || "").trim().replace(/\s+/g, " ");
  if (s.length < 4 || s.length > 48) return false;
  if (!NAME_RE.test(s)) return false;
  const words = s.replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/, "").split(" ");
  if (words.some(w => NOT_NAMES.has(w))) return false;
  return true;
}

// every date in a text with where it is: [{date, at, end, text}]
export function parseDatesAt(text) {
  const out = [];
  const thisYear = new Date().getFullYear();
  for (const m of allMatches(RE.Dates, text)) {
    const v = m.v.toLowerCase().replace(/,/g, " ").replace(/ de /g, " ");
    let d = null;
    let n = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(v);
    if (n) {
      let [dd, mo, y] = n.slice(1).map(Number);
      if (y < 100) y = y + 2000 <= thisYear + 30 ? y + 2000 : y + 1900;
      d = mk(y, mo, dd);
    } else if ((n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v))) {
      d = mk(+n[1], +n[2], +n[3]);
    } else {
      const parts = v.match(/[a-záéíóú]+|\d+/g) || [];
      const nums = parts.filter(p => /^\d+$/.test(p)).map(Number);
      const mon = parts.map(p => MONTHS[p.replace(/\.$/, "")]).find(Boolean);
      const year = nums.find(x => x > 31);
      const day = nums.find(x => x <= 31);
      if (mon && day) d = mk(year || guessYear(mon, day), mon, day);
    }
    if (d) out.push({ date: d, at: m.at, end: m.end, text: m.v });
  }
  return out;
}

function guessYear(mon, day) {
  // "Send the quote before 20 October": this year, or next year when it has passed long ago
  const now = new Date();
  const y = now.getFullYear();
  const d = new Date(y, mon - 1, day);
  return (now - d) / 86400000 > 120 ? y + 1 : y;
}

function mk(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const x = new Date(y, m - 1, d);
  if (x.getMonth() !== m - 1) return null;
  return x;
}

// the dates of a row (or a line) that are really deadlines: under an 'Expiry' / 'Valid until' column in a table,
// otherwise the date that follows the deadline words - never a date of issue, of birth, a start date...
export function deadlineDates(row, { all = false } = {}) {
  const cells = row.cells || [], hdr = row.header || [];
  if (hdr.length && cells.length && hdr.length === cells.length) {
    const cols = hdr.map((h, j) => EXPIRY_COL.test(h || "") && !NOT_EXPIRY.test(h || "") ? j : -1).filter(j => j >= 0);
    if (cols.length) return cols.flatMap(j => parseDatesAt(cells[j]).map(x => ({ ...x, what: hdr[j] })));
    if (!all && hdr.some(h => NOT_EXPIRY.test(h || "")) && !hdr.some(h => EXPIRY_COL.test(h || ""))) return [];
  }
  const text = row.text || "";
  const found = parseDatesAt(text);
  if (!found.length) return [];
  if (all) return found;
  const good = [];
  for (const f of found) {
    const before = text.slice(Math.max(0, f.at - 40), f.at);
    const nots = allMatches(new RegExp(NOT_EXPIRY.source, "gi"), before).map(m => m.end);
    const exps = allMatches(new RegExp(EXPIRY_RE.source, "gi"), before);
    if (nots.length && (!exps.length || Math.max(...nots) > Math.max(...exps.map(m => m.end)))) continue;
    if (!exps.length) continue;
    f.what = whatOf(text, exps[exps.length - 1].v);
    good.push(f);
  }
  return good;
}

function whatOf(text, word) {
  const w = word.toLowerCase();
  if (/renew/.test(w)) return "Renewal";
  if (/expir|caduc|vence/.test(w)) return "Expires";
  if (/due/.test(w)) return "Due";
  if (/valid/.test(w)) return "Valid until";
  if (/submi/.test(w)) return "Submission";
  if (/deadline|plazo|l[ií]mite/.test(w)) return "Deadline";
  if (/before|no later/.test(w)) return "Before";
  if (/end/.test(w)) return "Ends";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function amountValue(s) {
  let t = s.replace(/[^\d.,]/g, "");
  if (/,\d{2}$/.test(t) && !/\.\d{2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const v = parseFloat(t);
  return isNaN(v) ? null : v;
}
