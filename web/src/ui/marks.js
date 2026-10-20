// The stamps, like the Windows app's: words in a rounded box, in a colour that fits them.
import { fmtDate } from "../util.js";
import { _t } from "../i18n.js";

export const STAMPS = [
  { key: "APPROVED", text: _t("APPROVED"), color: [0.16, 0.6, 0.3] },
  { key: "PAID", text: _t("PAID"), color: [0.16, 0.6, 0.3] },
  { key: "RECEIVED", text: _t("RECEIVED"), color: [0.2, 0.4, 0.85] },
  { key: "REVIEWED", text: _t("REVIEWED"), color: [0.2, 0.4, 0.85] },
  { key: "DONE", text: _t("DONE"), color: [0.16, 0.6, 0.3] },
  { key: "DRAFT", text: _t("DRAFT"), color: [0.45, 0.45, 0.5] },
  { key: "COPY", text: _t("COPY"), color: [0.45, 0.45, 0.5] },
  { key: "CONFIDENTIAL", text: _t("CONFIDENTIAL"), color: [0.85, 0.15, 0.2], w: 190 },
  { key: "URGENT", text: _t("URGENT"), color: [0.85, 0.15, 0.2] },
  { key: "REJECTED", text: _t("REJECTED"), color: [0.85, 0.15, 0.2] },
  { key: "SIGN HERE", text: _t("SIGN HERE"), color: [0.85, 0.45, 0.05] },
  { key: "DATE", text: "", color: [0.2, 0.4, 0.85], date: true },
];

export function stampSpec(key) {
  if (key && key.startsWith("custom:")) {
    const text = key.slice(7);
    return { text: text.toUpperCase(), color: [0.42, 0.36, 1], w: Math.max(120, Math.min(260, text.length * 13 + 40)) };
  }
  const s = STAMPS.find(x => x.key === key) || STAMPS[0];
  if (s.date) return { ...s, text: fmtDate(new Date()).toUpperCase(), sub: "", w: 150 };
  return { ...s, sub: s.key === "PAID" || s.key === "RECEIVED" || s.key === "APPROVED" ? fmtDate(new Date()) : "" };
}

export const PEN_COLORS = ["#E03131", "#1C7ED6", "#2B8A3E", "#1E1C2B", "#7048E8", "#F08C00"];
export const HL_COLORS = ["#FFD43B", "#69DB7C", "#74C0FC", "#F783AC", "#FFA94D", "#B197FC"];
