// Comments: a note with your name and the date, on a point of a page; colleagues reply under it; Resolve ticks it.
// They are PDF comments (as Acrobat writes them), saved inside the PDF - whoever has the book sees them.
import { useEffect, useRef, useState } from "preact/hooks";
import { effect } from "@preact/signals";
import { store, fileId, pageNo, tool, toast, readMode, commentsOpen } from "../state.js";
import { Icon } from "./icons.jsx";
import { openMenu, confirm } from "./dialogs.jsx";
import { scrollTo, selectedMark } from "./Viewer.jsx";
import { getDoc, call, afterEdit, onDocChange, readOnce, fileFor } from "../docs.js";
import { initials } from "../util.js";

export { commentsOpen };

// choosing a comment's pin on the page opens it here
effect(() => {
  const m = selectedMark.value;
  if (m && m.type === "Text" && m.num > 0 && !(commentsOpen.value && commentsOpen.value.focus === m.num)) commentsOpen.value = { focus: m.num, fileId: m.fileId };
});

export function me() {
  const u = store.value?.user;
  return (u && (u.name || u.email)) || "Me";
}

function when(t) {
  if (!t) return "";
  const d = new Date(t), now = Date.now(), s = (now - t) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400 && d.getDate() === new Date().getDate()) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + (d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : "");
}

function Person({ name }) {
  return <span class="cm-av" title={name}>{initials(name || "?")}</span>;
}

export function startComment() {
  tool.value = "comment";
  toast("Click on the page where the comment goes.");
}

export function CommentsDrawer({ book }) {
  const [list, setList] = useState(null);
  const [show, setShow] = useState("open");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState(0);
  const st = commentsOpen.value || {};
  const draft = st.draft;
  const pdfs = book.files.filter(f => f.kind === "pdf");
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = [];
      for (const f of pdfs) {
        try { for (const c of await readOnce(f, (key) => call("comments", key))) out.push({ ...c, file: f }); } catch (e) {}
      }
      if (alive) setList(out);
    })();
    return () => { alive = false; };
  }, [book.id, v, pdfs.length]);
  useEffect(() => onDocChange((id) => { if (pdfs.some(f => f.id === id)) setV(x => x + 1); }), [book.id]);
  const focusRef = useRef();
  useEffect(() => { if (st.focus && focusRef.current) focusRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [st.focus, list]);

  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast(e.message || String(e), "bad"); } setBusy(false); };
  const post = () => run(async () => {
    const f = fileFor(draft.fileId);
    const d = await getDoc(f);
    if (d.readOnly) { toast("Comments go on PDFs. Make a PDF copy first (right-click the page)."); return; }
    const num = await call("addComment", d.key, draft.page, draft.x, draft.y, text.trim(), me());
    afterEdit(f.id);
    setText("");
    commentsOpen.value = { focus: num, fileId: f.id };
    setV(x => x + 1);
  });
  const reply = (c, t) => run(async () => {
    const d = await getDoc(c.file);
    await call("replyComment", d.key, c.page, c.num, t, me());
    afterEdit(c.file.id);
    setV(x => x + 1);
  });
  const resolve = (c, on) => run(async () => {
    const d = await getDoc(c.file);
    await call("resolveComment", d.key, c.page, c.num, on);
    afterEdit(c.file.id);
    setV(x => x + 1);
  });
  const del = (c) => run(async () => {
    if (!(await confirm("Delete the comment?", c.replies.length ? `It goes with its ${c.replies.length} repl${c.replies.length === 1 ? "y" : "ies"}. Ctrl+Z brings it back.` : "Ctrl+Z brings it back.", { ok: "Delete", danger: true }))) return;
    const d = await getDoc(c.file);
    await call("deleteComment", d.key, c.page, c.num);
    afterEdit(c.file.id);
    setV(x => x + 1);
  });
  const go = (c) => {
    fileId.value = c.file.id; pageNo.value = c.page;
    scrollTo.value = { fileId: c.file.id, page: c.page, y: c.rect[1] };
    commentsOpen.value = { focus: c.num, fileId: c.file.id };
  };

  const all = list || [];
  const shown = all.filter(c => show === "all" || (show === "open" ? !c.done : c.done));
  const open = all.filter(c => !c.done).length;
  return (
    <aside class="comments">
      <div class="cm-head">
        <Icon n="comment" size={17} /><b class="grow">Comments</b>
        <button class="btn small" onClick={startComment} title="Click on the page where it goes"><Icon n="plus" size={15} />Comment</button>
        <button class="ib" title="Close" onClick={() => { commentsOpen.value = null; if (tool.value === "comment") tool.value = "select"; }}><Icon n="close" size={17} /></button>
      </div>
      <div class="seg cm-seg">
        <button class={show === "open" ? "on" : ""} onClick={() => setShow("open")}>Open{open ? ` · ${open}` : ""}</button>
        <button class={show === "done" ? "on" : ""} onClick={() => setShow("done")}>Resolved</button>
        <button class={show === "all" ? "on" : ""} onClick={() => setShow("all")}>All</button>
      </div>
      <div class="cm-list">
        {draft && (
          <div class="cm-card focus">
            <div class="cm-who"><Person name={me()} /><b class="small">{me()}</b><span class="tiny muted grow" style={{ textAlign: "right" }}>page {draft.page + 1} · {fileFor(draft.fileId)?.name}</span></div>
            <textarea class="field" autoFocus value={text} placeholder="Your comment..." onInput={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) post(); if (e.key === "Escape") commentsOpen.value = { ...st, draft: null }; }} />
            <div class="row" style={{ justifyContent: "flex-end" }}>
              <button class="btn plain small" onClick={() => { commentsOpen.value = { ...st, draft: null }; setText(""); }}>Cancel</button>
              <button class="btn small" disabled={!text.trim() || busy} onClick={post}>Comment</button>
            </div>
          </div>
        )}
        {!list ? <div class="spinner" /> : !shown.length && !draft ? (
          <div class="cm-empty"><Icon n="comment" size={26} /><p class="small muted">{show === "done" ? "No comment is resolved yet." : <>No comments{show === "open" ? " to answer" : ""}. Press <b>Comment</b>, then click on the page: a note with your name and the date, that colleagues can answer. They are saved inside the PDF.</>}</p></div>
        ) : shown.map(c => <Thread key={c.file.id + ":" + c.num} c={c} focus={st.focus === c.num && (!st.fileId || st.fileId === c.file.id)} refIt={focusRef}
          onGo={() => go(c)} onReply={(t) => reply(c, t)} onResolve={(on) => resolve(c, on)} onDelete={() => del(c)} busy={busy} many={pdfs.length > 1} />)}
      </div>
      {void readMode}
    </aside>
  );
}

function Thread({ c, focus, refIt, onGo, onReply, onResolve, onDelete, busy, many }) {
  const [t, setT] = useState("");
  const send = () => { if (!t.trim()) return; onReply(t.trim()); setT(""); };
  return (
    <div class={"cm-card" + (focus ? " focus" : "") + (c.done ? " done" : "")} ref={focus ? refIt : null} onClick={(e) => { if (!/TEXTAREA|BUTTON|INPUT/.test(e.target.tagName) && !e.target.closest("button")) onGo(); }}>
      <div class="cm-who">
        <Person name={c.author} /><b class="small ellipsis">{c.author || "Someone"}</b><span class="tiny muted">{when(c.modified)}</span>
        <span class="grow" />
        <button class="ib" title={c.done ? "Open it again" : "Resolve: it is done"} onClick={() => onResolve(!c.done)}><Icon n={c.done ? "undo" : "check"} size={16} /></button>
        <button class="ib" title="More" onClick={(e) => openMenu(e, [{ label: "Go to its page", icon: "right", run: onGo }, "-", { label: "Delete the comment", icon: "trash", danger: true, run: onDelete }])}><Icon n="more" size={16} /></button>
      </div>
      <div class="cm-text">{c.contents}</div>
      <div class="tiny muted cm-where">{many ? c.file.name + " · " : ""}page {c.page + 1}{c.done ? " · resolved" : ""}</div>
      {c.replies.map((r, i) => (
        <div key={i} class="cm-reply">
          <div class="cm-who"><Person name={r.author} /><b class="small ellipsis">{r.author || "Someone"}</b><span class="tiny muted">{when(r.modified)}</span></div>
          <div class="cm-text">{r.contents}</div>
        </div>
      ))}
      {(focus || c.replies.length > 0) && !c.done && (
        <div class="cm-replybox">
          <textarea class="field" rows={1} value={t} placeholder="Reply..." onInput={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button class="btn small" disabled={!t.trim() || busy} onClick={send} title="Reply (Enter)"><Icon n="right" size={15} /></button>
        </div>
      )}
    </div>
  );
}
