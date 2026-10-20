// A name for a scan, from the words on its first page: "Invoice 2026-10-14 - Harbour Cafe".
import { parseDatesAt } from "./patterns.js";
import { isoDate } from "../util.js";
import { _t } from "../i18n.js";

const TYPES = [
  [/\b(tax\s+)?invoice\b|\bfactura\b/i, _t("Invoice")], [/\breceipt\b|\brecibo\b|\bticket\b/i, _t("Receipt")], [/\bquot(e|ation)\b|\bpresupuesto\b/i, _t("Quote")],
  [/\bpayslip\b|\bpay\s*slip\b|\bn[oó]mina\b/i, _t("Payslip")], [/\b(bank\s+)?statement\b|\bextracto\b/i, _t("Statement")],
  [/\bcontract\b|\bagreement\b|\bcontrato\b/i, _t("Contract")], [/\bcertificate\b|\bcertificado\b|\bcertify\b/i, _t("Certificate")],
  [/\btranscript\b|\bresults\b|\bgrades\b/i, _t("Transcript")], [/\bminutes\b|\bacta\b/i, _t("Minutes")], [/\bapplication\s+form\b|\bform\b|\bsolicitud\b/i, _t("Form")],
  [/\bprescription\b|\breceta\b/i, _t("Prescription")], [/\bpolicy\b|\bp[oó]liza\b/i, _t("Policy")], [/\breport\b|\binforme\b/i, _t("Report")],
  [/\bdelivery\s+note\b|\balbar[aá]n\b/i, _t("Delivery note")], [/\bdear\b|\bestimad[oa]\b|\byours\s+(sincerely|faithfully)\b/i, _t("Letter")],
];
const ORG = /\b(ltd|limited|plc|inc|llc|gmbh|s\.?l\.?|s\.?a\.?|university|college|institute|council|bank|insurance|hospital|clinic|school|department|revenue|services|solutions|group|company|co\.)\b/i;

export function suggestScanName(text) {
  const t = (text || "").replace(/\r/g, "");
  if (t.replace(/\s/g, "").length < 12) return "";
  const lines = t.split("\n").map(s => s.replace(/\s+/g, " ").trim()).filter(s => s.length > 1);
  const type = (TYPES.find(([re]) => re.test(t)) || [0, ""])[1];
  const dates = parseDatesAt(t).map(d => d.date).filter(d => d && d.getFullYear() > 1990 && d.getFullYear() < 2100);
  const date = dates[0] ? isoDate(dates[0]) : "";
  // who it is from: a line with Ltd, University, Council... near the top, or the first line that looks like a name
  const top = lines.slice(0, 12);
  let who = top.find(l => ORG.test(l) && l.length < 60) || "";
  if (!who) who = top.find(l => /^[A-ZÁÉÍÓÚÑ][\p{L}&'. -]{2,40}$/u.test(l) && !TYPES.some(([re]) => re.test(l)) && !/\d/.test(l)) || "";
  who = who.replace(/[^\p{L}\p{N}&'. -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (who && who === who.toUpperCase()) who = who.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, c) => a + c.toUpperCase());
  const parts = [type || _t("Scan"), date].filter(Boolean).join(" ");
  return (who && type ? `${parts} - ${who}` : who && !type ? `${who} ${date}`.trim() : parts).trim();
}
