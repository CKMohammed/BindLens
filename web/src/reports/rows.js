// The rows of a page, and its tables - with or without lines: the columns are the empty strips between the words
// that line up from one row to the next. Each table comes out exactly as it is, with its column titles.

function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; }

// words [x0,y0,x1,y1,text,size,bold] -> rows [{y, h, chunks:[{x0,x1,t,b}], text}]
export function pageRows(words) {
  const ws = words.map(w => ({ x0: w[0], y0: w[1], x1: w[2], y1: w[3], t: w[4], s: w[5], b: w[6], cy: (w[1] + w[3]) / 2 }))
    .sort((a, b) => a.cy - b.cy || a.x0 - b.x0);
  const rows = [];
  for (const w of ws) {
    const h = w.y1 - w.y0;
    const r = rows.length ? rows[rows.length - 1] : null;
    if (r && Math.abs(w.cy - r.cy) <= Math.max(2, Math.min(h, r.h) * 0.45)) {
      r.ws.push(w);
      r.cy = (r.cy * (r.ws.length - 1) + w.cy) / r.ws.length;
    } else rows.push({ cy: w.cy, h, ws: [w] });
  }
  for (const r of rows) {
    r.ws.sort((a, b) => a.x0 - b.x0);
    const size = median(r.ws.map(w => w.s)) || 10;
    const chunks = [];
    for (const w of r.ws) {
      const c = chunks[chunks.length - 1];
      if (c && w.x0 - c.x1 < size * 0.9) { c.t += " " + w.t; c.x1 = w.x1; c.b = c.b && w.b; }
      else chunks.push({ x0: w.x0, x1: w.x1, t: w.t, b: w.b });
    }
    r.chunks = chunks;
    r.text = chunks.map(c => c.t).join("   ");
    r.y = Math.min(...r.ws.map(w => w.y0));
    r.size = size;
  }
  return rows;
}

// columns shared by a run of rows
function columnsOf(run) {
  const xs = [];
  for (const r of run) for (const c of r.chunks) xs.push(c.x0);
  xs.sort((a, b) => a - b);
  const cols = [];
  for (const x of xs) {
    const c = cols[cols.length - 1];
    if (c && x - c.last <= 8) { c.n++; c.last = x; c.sum += x; }
    else cols.push({ first: x, last: x, n: 1, sum: x });
  }
  return cols.filter(c => c.n >= Math.max(2, run.length * 0.4)).map(c => c.first);
}

function fits(r, cols) {
  if (r.chunks.length < 2) return false;
  let ok = 0;
  for (const c of r.chunks) if (cols.some(x => Math.abs(c.x0 - x) <= 8)) ok++;
  return ok >= Math.max(2, r.chunks.length - 1);
}

function cellsOf(r, cols) {
  const cells = cols.map(() => "");
  for (const c of r.chunks) {
    let j = 0;
    for (let k = 0; k < cols.length; k++) if (c.x0 >= cols[k] - 8) j = k;
    cells[j] = cells[j] ? cells[j] + " " + c.t : c.t;
  }
  return cells;
}

const NUMERIC = /^[\s€$£%.,:/\-+()\d]+$/;

function looksHeader(r, next) {
  if (!next) return false;
  const cells = r.chunks.map(c => c.t);
  if (cells.some(t => NUMERIC.test(t))) return false;
  if (cells.some(t => /@/.test(t))) return false;
  if (r.chunks.every(c => c.b) && !next.chunks.every(c => c.b)) return true;
  // titles are short words; the rows under them have numbers, emails, longer text
  const nextHasData = next.chunks.some(c => /\d|@/.test(c.t));
  return nextHasData && cells.every(t => t.length <= 28);
}

// -> {rows:[{text, cells?, header?, y}], tables:[{header, rows, y}]}
export function pageTables(words, ctx = {}) {
  const rows = pageRows(words);
  const tables = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].chunks.length < 2) { i++; continue; }
    // grow a run of rows that line up
    let j = i + 1;
    let cols = columnsOf(rows.slice(i, Math.min(rows.length, i + 3)));
    while (j < rows.length && rows[j].chunks.length >= 2 && cols.length >= 2) {
      const next = columnsOf(rows.slice(i, j + 1));
      if (next.length < 2 || !fits(rows[j], next)) break;
      cols = next;
      j++;
    }
    const run = rows.slice(i, j);
    if (run.length >= 2 && cols.length >= 2) {
      let header = null;
      let body = run;
      if (looksHeader(run[0], run[1])) { header = cellsOf(run[0], cols); body = run.slice(1); }
      else if (ctx.header && ctx.header.length === cols.length && i === 0) header = ctx.header; // a table going on from the page before
      const t = { header, rows: body.map(r => cellsOf(r, cols)), y: run[0].y };
      for (const r of body) { r.cells = cellsOf(r, cols); r.header = header; }
      if (header) { run[0].isHeader = true; ctx.header = header; }
      tables.push(t);
      i = j;
    } else i++;
  }
  return { rows, tables };
}
