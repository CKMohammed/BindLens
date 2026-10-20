// Reading mode, as in the Windows app: the contents of the book on a card (with a ribbon, the documents numbered,
// how far you are), a small clock with the calendar that you can move and personalise, and a quick way to another
// document. The lava colours of the frame behind it all.
import { useEffect, useRef, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { fileId, pageNo, settings, setSetting, bookMeta, narrow, visibleFiles } from "../state.js";
import { docState, scrollTo } from "./Viewer.jsx";
import { Icon, fileIcon } from "./icons.jsx";
import { openMenu } from "./dialogs.jsx";
import { BookTile } from "./bookicons.jsx";
import { isPaged, mix } from "../util.js";
import { openPanel } from "../actions.js";
import { _t, loc } from "../i18n.js";

function pagesOf(f) { return docState.value[f.id]?.pages?.length || (isPaged(f.kind) ? 1 : 0); }

// the parts of each document (bookmarks, a printed contents page, or its headings), found once and kept
const secMem = new Map();
const secTick = signal(0);
function secKey(f) { return f.id + ":" + (f.md5 || f.modified || ""); }
function partsOf(f) {
  const k = secKey(f);
  if (secMem.has(k)) return secMem.get(k);
  secMem.set(k, null);
  (async () => {
    let r = { items: [] };
    try {
      const { readOnce, call } = await import("../docs.js");
      if (isPaged(f.kind) && f.kind !== "image") r = await readOnce(f, (key) => call("sections", key));
    } catch (e) { r = { items: [] }; }
    secMem.set(k, r.items || []);
    secTick.value++;
  })();
  return null;
}

function go(f, page = 0) { fileId.value = f.id; pageNo.value = page; scrollTo.value = { fileId: f.id, page }; }

// the contents card (open or folded to a small button; remembered in this browser)
export const contentsOpen = signal((() => { try { return localStorage.getItem("bl-contents") !== "0"; } catch (e) { return true; } })());
export function Contents({ book, aloud, onAloud, compact }) {
  const files = visibleFiles(book);
  const open = contentsOpen.value && !compact;
  const [shut, setShut] = useState({});
  const [q, setQ] = useState("");
  void secTick.value;
  const toggle = () => { contentsOpen.value = !open; try { localStorage.setItem("bl-contents", open ? "0" : "1"); } catch (e) {} };
  const total = files.reduce((a, f) => a + pagesOf(f), 0);
  let before = 0;
  for (const f of files) { if (f.id === fileId.value) { before += pageNo.value + 1; break; } before += pagesOf(f); }
  const pct = total ? Math.round(before / total * 100) : 0;
  const m = bookMeta(book.id);
  const color = m.color || book.color;
  const maxP = Math.max(1, ...files.map(pagesOf));
  if (!open) return <button class="contents-pill" onClick={compact ? () => { import("../state.js").then(s => { s.zoom.value = 1; s.fitWidth.value = true; }); } : toggle} title={compact ? _t("The page is big: the contents step aside. Click to see them (the page fits the width again)") : _t("Show the contents")}><Icon n="list" size={16} />{_t("Contents")} <span class="muted">· {pct}%</span></button>;
  let at = 0;
  return (
    <div class="contents-card" style={{ "--bk": color }}>
      <span class="ribbon" />
      <div class="row" style={{ alignItems: "flex-start" }}>
        <div class="grow">
          <h2>{_t("Contents")}</h2>
          <div class="bookname">{book.name}</div>
        </div>
        <BookTile book={book} meta={m} size={38} />
        <button class="ib" title={_t("Hide the contents")} onClick={toggle} style={{ width: 28, height: 28, marginLeft: 2 }}><Icon n="close" size={15} /></button>
      </div>
      <div class="rule" />
      <div class="row" style={{ alignItems: "flex-end", gap: 12 }}>
        <div><div class="big">{files.length}</div><div class="tiny muted">{_t("document")}{files.length === 1 ? "" : "s"}</div></div>
        <div class="bars grow" aria-hidden="true">
          {files.slice(0, 24).map(f => <i key={f.id} class={f.id === fileId.value ? "on" : ""} style={{ height: 6 + 30 * pagesOf(f) / maxP + "px" }} />)}
        </div>
        <div class="tiny muted" style={{ textAlign: "right" }}>{total} {_t("pages")}<br /><b style={{ color: "var(--accent)" }}>{pct}%</b></div>
      </div>
      {files.length > 3 || files.some(f => (secMem.get(secKey(f)) || []).length > 12) ? <div class="toc-find"><Icon n="search" size={13} /><input value={q} placeholder={_t("Find a part")} onInput={(e) => setQ(e.target.value)} /></div> : null}
      <ol class="toc">
        {files.map((f, i) => {
          const start = at + 1; at += pagesOf(f);
          const on = f.id === fileId.value;
          const parts = (on || shut[f.id] === false) && shut[f.id] !== true ? partsOf(f) : secMem.get(secKey(f));
          const openParts = parts && parts.length > 0 && (on ? shut[f.id] !== true : shut[f.id] === false);
          const nq = q.trim().toLowerCase();
          const shown = parts ? parts.filter(p => !nq || p.t.toLowerCase().includes(nq)) : [];
          // the part you are in: the last one that starts on this page or before
          let curPart = -1;
          if (on && parts) parts.forEach((p, j) => { if (p.page <= pageNo.value) curPart = j; });
          if (nq && !shown.length && !f.name.toLowerCase().includes(nq)) return null;
          return (
            <li key={f.id} class={"tocdoc" + (on ? " on" : "")}>
              <div class="tocrow" onClick={() => go(f)}>
                <span class="no">{String(i + 1).padStart(2, "0")}</span>
                <span class="nm">{f.sub ? <span class="muted">{f.sub} / </span> : null}{f.name.replace(/\.[^.]+$/, "")}</span>
                <span class="dots" /><span class="pg">{isPaged(f.kind) ? start : <Icon n={fileIcon(f.kind)} size={13} />}</span>
                {isPaged(f.kind) && f.kind !== "image" && <button class="tocx" title={openParts ? _t("Hide its parts") : _t("Its parts")} onClick={(e) => { e.stopPropagation(); setShut({ ...shut, [f.id]: openParts ? true : false }); if (!openParts) partsOf(f); }}><Icon n={openParts ? "down" : "right"} size={12} /></button>}
              </div>
              {(openParts || (nq && shown.length > 0)) && <ol class="tocparts">
                {(nq ? shown : parts).slice(0, 300).map((p, j) => (
                  <li key={j} class={"lv" + Math.min(4, p.lvl) + (on && j === curPart && !nq ? " cur" : "")} onClick={(e) => { e.stopPropagation(); go(f, p.page); }} title={p.t}>
                    <span class="nm">{p.t}</span><span class="pg">{start + p.page}</span>
                  </li>
                ))}
              </ol>}
              {on && parts === null && <div class="tiny muted" style={{ padding: "2px 0 4px 30px" }}>{_t("Finding its parts...")}</div>}
            </li>
          );
        })}
      </ol>
      <div class="progress"><i style={{ width: pct + "%" }} /><b style={{ left: pct + "%" }} /></div>
      <div class="row tiny muted"><span class="grow">{_t("Page {0} of {1}", before, total)}</span><span>{pct}{_t("% of the book")}</span></div>
      <button class={"btn small " + (aloud ? "" : "soft")} style={{ marginTop: 10 }} onClick={onAloud}>
        <Icon n={aloud ? "pause" : "play"} size={15} />{aloud ? _t("Stop reading") : _t("Read aloud")}</button>
    </div>
  );
}

// the clock with the calendar: one small piece, discreet, in the top right corner - drag it anywhere
const LOOKS = [["minimal", _t("Minimal")], ["soft", _t("Soft")], ["bold", _t("Bold")]];
// the map of the book beside the page, in the book's colour: each document a piece, as long as its pages; where you are
export function BookMap({ book }) {
  const files = visibleFiles(book).filter(f => isPaged(f.kind));
  const total = files.reduce((a, f) => a + Math.max(1, pagesOf(f)), 0);
  if (files.length < 1 || total < 2) return null;
  const m = bookMeta(book.id);
  const color = m.color || book.color;
  let at = 0, here = 0;
  for (const f of files) { if (f.id === fileId.value) { here = at + pageNo.value + 0.5; break; } at += Math.max(1, pagesOf(f)); }
  at = 0;
  return (
    <div class="bookmap" style={{ "--bk": color }} aria-label={_t("Where you are in the book")}>
      {files.map((f, i) => {
        const n = Math.max(1, pagesOf(f)), top = at / total * 100, h = n / total * 100; at += n;
        return <button key={f.id} class={"bm-doc" + (f.id === fileId.value ? " on" : "")} style={{ top: top + "%", height: `calc(${h}% - 2px)`, opacity: 0.45 + 0.4 * ((i % 2) ? 0.6 : 1) }}
          onClick={() => go(f)}><span class="bm-tip">{f.name.replace(/\.[^.]+$/, "")} · {n} {_t("page")}{n === 1 ? "" : "s"}</span></button>;
      })}
      <i class="bm-here" style={{ top: (here / total * 100) + "%" }} />
    </div>
  );
}

export function ClockCal({ bounds, compact }) {
  const c = settings.value.clock || {};
  const look = c.look || "minimal";
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), c.seconds ? 1000 : 10000); return () => clearInterval(t); }, [c.seconds]);
  const ref = useRef();
  const [pos, setPos] = useState(c.pos || null);           // {right, top} in px from the top right corner
  const drag = useRef(null);
  if (c.hidden) return <button class="clock-pill" title={_t("Show the clock and the calendar")} onClick={() => setSetting("clock", { ...c, hidden: false })}><Icon n="clock" size={15} /></button>;
  // the page is big: the clock steps aside, small, so it never covers the page
  if (compact) return <div class="clock-mini" title={now.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" })}>{now.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: !!c.h12 })}</div>;
  const set = (ch) => setSetting("clock", { ...c, ...ch });
  const down = (e) => {
    if (e.target.closest("button")) return;
    const box = ref.current.getBoundingClientRect();
    const host = ref.current.offsetParent.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, right: host.right - box.right, top: box.top - host.top, host };
    ref.current.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    const right = Math.max(4, Math.min(d.host.width - 120, d.right - (e.clientX - d.x)));
    const top = Math.max(4, Math.min(d.host.height - 60, d.top + (e.clientY - d.y)));
    setPos({ right, top });
  };
  const up = () => { if (drag.current && pos) set({ pos }); drag.current = null; };
  const menu = (e) => openMenu(e, [
    { title: _t("The clock and the calendar") },
    ...LOOKS.map(([k, l]) => ({ label: (look === k ? "✓ " : "") + l, run: () => set({ look: k }) })),
    "-",
    { label: (c.seconds ? "✓ " : "") + _t("Show the seconds"), run: () => set({ seconds: !c.seconds }) },
    { label: (c.h12 ? "✓ " : "") + _t("12-hour clock (am / pm)"), run: () => set({ h12: !c.h12 }) },
    { label: (c.big ? "✓ " : "") + _t("Bigger"), run: () => set({ big: !c.big }) },
    { label: _t("Put it back in the corner"), icon: "undo", run: () => { setPos(null); set({ pos: null }); } },
    "-",
    { label: _t("Hide it"), icon: "close", run: () => set({ hidden: true }) },
  ]);
  const time = now.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", second: c.seconds ? "2-digit" : undefined, hour12: !!c.h12 });
  const p = pos || { right: 16, top: 14 };
  void bounds;
  return (
    <div ref={ref} class={"clockcal " + look + (c.big ? " big" : "")} style={{ right: p.right + "px", top: p.top + "px" }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} title={_t("Drag to move it")}>
      <button class="cc-set" title={_t("Personalise the clock and the calendar")} onClick={menu}><Icon n="settings" size={12} /></button>
      <div class="cc-cal">
        <div class="cc-m">{now.toLocaleDateString(loc, { month: "short" }).toUpperCase()}</div>
        <div class="cc-d">{now.getDate()}</div>
      </div>
      <div class="cc-right">
        <div class="cc-t">{time}</div>
        <div class="cc-w">{now.toLocaleDateString(loc, { weekday: "long" })}</div>
      </div>
    </div>
  );
}

// another document, quickly: before / after, or the list
export function DocSwitch({ book }) {
  const files = visibleFiles(book);
  const i = files.findIndex(f => f.id === fileId.value);
  const cur = files[i];
  if (!cur || narrow.value) return null;
  const prev = files[i - 1], next = files[i + 1];
  return (
    <div class="docswitch">
      <button class="ib" title={prev ? _t("Before: ") + prev.name : _t("This is the first document")} disabled={!prev} onClick={() => prev && go(prev)}><Icon n="left" size={18} /></button>
      <button class="ds-cur" title={_t("Go to another document")} onClick={(e) => openMenu(e, [
        { title: book.name },
        ...files.map((f, k) => ({ label: `${String(k + 1).padStart(2, "0")}  ${f.name.replace(/\.[^.]+$/, "")}`, icon: fileIcon(f.kind), run: () => go(f) })),
      ])}>
        <Icon n={fileIcon(cur.kind)} size={16} /><span class="ellipsis">{cur.name.replace(/\.[^.]+$/, "")}</span><span class="tiny muted">{i + 1}/{files.length}</span><Icon n="down" size={14} />
      </button>
      <button class="ib" title={next ? _t("Next: ") + next.name : _t("This is the last document")} disabled={!next} onClick={() => next && go(next)}><Icon n="right" size={18} /></button>
    </div>
  );
}

export { mix };
