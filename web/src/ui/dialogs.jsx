// Dialogs, menus and questions (ask / confirm / choose), shown above everything.
import { signal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./icons.jsx";

export const modal = signal(null);   // {kind:"ask"|"confirm", ...resolve}
export const menu = signal(null);    // {x, y, items:[{label, icon, run, danger}|"-"|{title}]}

export function Dialog({ title, onClose, children, foot, cls = "", icon }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose && onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return (
    <div class="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div class={"dialog " + cls} role="dialog" aria-label={title}>
        {title != null && (
          <div class="dh">
            {icon && <Icon n={icon} size={22} style={{ color: "var(--accent)" }} />}
            <h2 class="grow">{title}</h2>
            {onClose && <button class="ib" onClick={onClose} title="Close (Esc)"><Icon n="close" /></button>}
          </div>
        )}
        <div class="db">{children}</div>
        {foot && <div class="df">{foot}</div>}
      </div>
    </div>
  );
}

export function ask(title, { value = "", label = "", placeholder = "", ok = "OK", multiline = false } = {}) {
  return new Promise((resolve) => { modal.value = { kind: "ask", title, value, label, placeholder, ok, multiline, resolve }; });
}

export function confirm(title, text = "", { ok = "OK", danger = false } = {}) {
  return new Promise((resolve) => { modal.value = { kind: "confirm", title, text, ok, danger, resolve }; });
}

export function openMenu(e, items) {
  e.preventDefault?.();
  e.stopPropagation?.();
  const r = e.currentTarget?.getBoundingClientRect?.();
  const x = r ? r.left : e.clientX, y = r ? r.bottom + 4 : e.clientY;
  menu.value = { x, y, items };
}

export function openMenuAt(x, y, items) { menu.value = { x, y, items }; }

function Ask({ m }) {
  const [v, setV] = useState(m.value);
  const ref = useRef();
  useEffect(() => { setTimeout(() => { ref.current?.focus(); ref.current?.select?.(); }, 30); }, []);
  const done = (val) => { modal.value = null; m.resolve(val); };
  return (
    <Dialog title={m.title} onClose={() => done(null)}
      foot={<><button class="btn plain" onClick={() => done(null)}>Cancel</button>
        <button class="btn" onClick={() => done(v.trim())} disabled={!v.trim()}>{m.ok}</button></>}>
      {m.label && <p class="muted small" style={{ marginTop: 0 }}>{m.label}</p>}
      {m.multiline
        ? <textarea ref={ref} class="field" value={v} placeholder={m.placeholder} onInput={(e) => setV(e.target.value)} />
        : <input ref={ref} class="field" value={v} placeholder={m.placeholder} onInput={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) done(v.trim()); }} />}
    </Dialog>
  );
}

function Confirm({ m }) {
  const done = (val) => { modal.value = null; m.resolve(val); };
  useEffect(() => {
    const k = (e) => { if (e.key === "Enter") done(true); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <Dialog title={m.title} onClose={() => done(false)}
      foot={<><button class="btn plain" onClick={() => done(false)}>Cancel</button>
        <button class={"btn" + (m.danger ? " danger" : "")} onClick={() => done(true)}>{m.ok}</button></>}>
      {m.text && <p style={{ margin: 0 }}>{m.text}</p>}
    </Dialog>
  );
}

export function Modals() {
  const m = modal.value;
  if (!m) return null;
  if (m.kind === "ask") return <Ask m={m} />;
  if (m.kind === "confirm") return <Confirm m={m} />;
  return null;
}

export function Menu() {
  const m = menu.value;
  const ref = useRef();
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!m) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) menu.value = null; };
    const key = (e) => { if (e.key === "Escape") menu.value = null; };
    setTimeout(() => { window.addEventListener("mousedown", close); window.addEventListener("touchstart", close); }, 0);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("touchstart", close); window.removeEventListener("keydown", key); };
  }, [m]);
  useEffect(() => {
    if (!m || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    let x = m.x, y = m.y;
    if (x + r.width > window.innerWidth - 8) x = window.innerWidth - r.width - 8;
    if (y + r.height > window.innerHeight - 8) y = Math.max(8, m.y - r.height - 40);
    setPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [m]);
  if (!m) return null;
  return (
    <div class="menu" ref={ref} style={{ left: (pos || m).x + "px", top: (pos || m).y + "px", visibility: pos ? "visible" : "hidden" }}>
      {m.items.filter(Boolean).map((it, i) => {
        if (it === "-") return <hr key={i} />;
        if (it.title) return <div class="lbl" key={i}>{it.title}</div>;
        return (
          <button key={i} style={it.danger ? { color: "var(--bad)" } : null} disabled={it.disabled}
            onClick={() => { menu.value = null; it.run && it.run(); }}>
            {it.icon && <Icon n={it.icon} />}{it.swatch && <span class="swatch" style={{ background: it.swatch, width: 16, height: 16 }} />}
            <span class="grow">{it.label}</span>{it.hint && <span class="tiny muted">{it.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
