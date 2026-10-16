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

function pagesOf(f) { return docState.value[f.id]?.pages?.length || (isPaged(f.kind) ? 1 : 0); }

function go(f, page = 0) { fileId.value = f.id; pageNo.value = page; scrollTo.value = { fileId: f.id, page }; }

// the contents card (open or folded to a small button; remembered in this browser)
export const contentsOpen = signal((() => { try { return localStorage.getItem("bl-contents") !== "0"; } catch (e) { return true; } })());
export function Contents({ book, aloud, onAloud }) {
  const files = visibleFiles(book);
  const open = contentsOpen.value;
  const toggle = () => { contentsOpen.value = !open; try { localStorage.setItem("bl-contents", open ? "0" : "1"); } catch (e) {} };
  const total = files.reduce((a, f) => a + pagesOf(f), 0);
  let before = 0;
  for (const f of files) { if (f.id === fileId.value) { before += pageNo.value + 1; break; } before += pagesOf(f); }
  const pct = total ? Math.round(before / total * 100) : 0;
  const m = bookMeta(book.id);
  const color = m.color || book.color;
  const maxP = Math.max(1, ...files.map(pagesOf));
  if (!open) return <button class="contents-pill" onClick={toggle}><Icon n="list" size={16} />Contents <span class="muted">· {pct}%</span></button>;
  let at = 0;
  return (
    <div class="contents-card" style={{ "--bk": color }}>
      <span class="ribbon" />
      <div class="row" style={{ alignItems: "flex-start" }}>
        <div class="grow">
          <h2>Contents</h2>
          <div class="bookname">{book.name}</div>
        </div>
        <BookTile book={book} meta={m} size={38} />
        <button class="ib" title="Hide the contents" onClick={toggle} style={{ width: 28, height: 28, marginLeft: 2 }}><Icon n="close" size={15} /></button>
      </div>
      <div class="rule" />
      <div class="row" style={{ alignItems: "flex-end", gap: 12 }}>
        <div><div class="big">{files.length}</div><div class="tiny muted">document{files.length === 1 ? "" : "s"}</div></div>
        <div class="bars grow" aria-hidden="true">
          {files.slice(0, 24).map(f => <i key={f.id} class={f.id === fileId.value ? "on" : ""} style={{ height: 6 + 30 * pagesOf(f) / maxP + "px" }} />)}
        </div>
        <div class="tiny muted" style={{ textAlign: "right" }}>{total} pages<br /><b style={{ color: "var(--accent)" }}>{pct}%</b></div>
      </div>
      <ol class="toc">
        {files.map((f, i) => {
          const start = at + 1; at += pagesOf(f);
          const on = f.id === fileId.value;
          return (
            <li key={f.id} class={on ? "on" : ""} onClick={() => go(f)}>
              <span class="no">{String(i + 1).padStart(2, "0")}</span>
              <span class="nm">{f.sub ? <span class="muted">{f.sub} / </span> : null}{f.name.replace(/\.[^.]+$/, "")}</span>
              <span class="dots" /><span class="pg">{isPaged(f.kind) ? start : <Icon n={fileIcon(f.kind)} size={13} />}</span>
            </li>
          );
        })}
      </ol>
      <div class="progress"><i style={{ width: pct + "%" }} /><b style={{ left: pct + "%" }} /></div>
      <div class="row tiny muted"><span class="grow">Page {before} of {total}</span><span>{pct}% of the book</span></div>
      <button class={"btn small " + (aloud ? "" : "soft")} style={{ marginTop: 10 }} onClick={onAloud}>
        <Icon n={aloud ? "pause" : "play"} size={15} />{aloud ? "Stop reading" : "Read aloud"}</button>
    </div>
  );
}

// the clock with the calendar: one small piece, discreet, in the top right corner - drag it anywhere
const LOOKS = [["minimal", "Minimal"], ["soft", "Soft"], ["bold", "Bold"]];
export function ClockCal({ bounds }) {
  const c = settings.value.clock || {};
  const look = c.look || "minimal";
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), c.seconds ? 1000 : 10000); return () => clearInterval(t); }, [c.seconds]);
  const ref = useRef();
  const [pos, setPos] = useState(c.pos || null);           // {right, top} in px from the top right corner
  const drag = useRef(null);
  if (c.hidden) return <button class="clock-pill" title="Show the clock and the calendar" onClick={() => setSetting("clock", { ...c, hidden: false })}><Icon n="clock" size={15} /></button>;
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
    { title: "The clock and the calendar" },
    ...LOOKS.map(([k, l]) => ({ label: (look === k ? "✓ " : "") + l, run: () => set({ look: k }) })),
    "-",
    { label: (c.seconds ? "✓ " : "") + "Show the seconds", run: () => set({ seconds: !c.seconds }) },
    { label: (c.h12 ? "✓ " : "") + "12-hour clock (am / pm)", run: () => set({ h12: !c.h12 }) },
    { label: (c.big ? "✓ " : "") + "Bigger", run: () => set({ big: !c.big }) },
    { label: "Put it back in the corner", icon: "undo", run: () => { setPos(null); set({ pos: null }); } },
    { label: "Open What needs you", icon: "calendar", run: () => openPanel("dates") },
    "-",
    { label: "Hide it", icon: "close", run: () => set({ hidden: true }) },
  ]);
  const time = now.toLocaleTimeString(c.h12 ? "en-US" : "en-GB", { hour: "2-digit", minute: "2-digit", second: c.seconds ? "2-digit" : undefined, hour12: !!c.h12 });
  const p = pos || { right: 16, top: 14 };
  void bounds;
  return (
    <div ref={ref} class={"clockcal " + look + (c.big ? " big" : "")} style={{ right: p.right + "px", top: p.top + "px" }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} title="Drag to move it">
      <button class="cc-set" title="Personalise the clock and the calendar" onClick={menu}><Icon n="settings" size={12} /></button>
      <div class="cc-cal">
        <div class="cc-m">{now.toLocaleDateString("en-GB", { month: "short" }).toUpperCase()}</div>
        <div class="cc-d">{now.getDate()}</div>
      </div>
      <div class="cc-right">
        <div class="cc-t">{time}</div>
        <div class="cc-w">{now.toLocaleDateString("en-GB", { weekday: "long" })}</div>
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
      <button class="ib" title={prev ? "Before: " + prev.name : "This is the first document"} disabled={!prev} onClick={() => prev && go(prev)}><Icon n="left" size={18} /></button>
      <button class="ds-cur" title="Go to another document" onClick={(e) => openMenu(e, [
        { title: book.name },
        ...files.map((f, k) => ({ label: `${String(k + 1).padStart(2, "0")}  ${f.name.replace(/\.[^.]+$/, "")}`, icon: fileIcon(f.kind), run: () => go(f) })),
      ])}>
        <Icon n={fileIcon(cur.kind)} size={16} /><span class="ellipsis">{cur.name.replace(/\.[^.]+$/, "")}</span><span class="tiny muted">{i + 1}/{files.length}</span><Icon n="down" size={14} />
      </button>
      <button class="ib" title={next ? "Next: " + next.name : "This is the last document"} disabled={!next} onClick={() => next && go(next)}><Icon n="right" size={18} /></button>
    </div>
  );
}

export { mix };
