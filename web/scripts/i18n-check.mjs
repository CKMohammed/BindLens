// Lists the English texts in _t(...) / _n(...) that have no Spanish yet in src/i18n/es.js.
// node scripts/i18n-check.mjs   (run from web/)
import fs from "fs";
import path from "path";
import ES from "../src/i18n/es.js";

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (f !== "i18n") walk(p); }
    else if (/\.(jsx?|mjs)$/.test(f)) files.push(p);
  }
})("src");

const STR = String.raw`"((?:[^"\\]|\\.)*)"`;
const re = new RegExp(String.raw`\b_t\(\s*` + STR + String.raw`|\b_n\([^,]+,\s*` + STR + String.raw`\s*,\s*` + STR, "g");
const missing = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(re)) {
    for (const raw of [m[1], m[2], m[3]]) {
      if (raw == null) continue;
      const k = JSON.parse('"' + raw + '"').trim();
      if (!k || !/[A-Za-z]/.test(k) || k in ES) continue;
      if (!missing.has(k)) missing.set(k, f);
    }
  }
}
for (const [k, f] of missing) console.log(f + "\t" + JSON.stringify(k));
console.log(missing.size ? `${missing.size} texts without Spanish` : "Every text has its Spanish.");
