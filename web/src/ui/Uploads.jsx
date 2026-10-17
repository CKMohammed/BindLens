// The panel in the corner while files go up to the Drive: how many, how far, each file ticked, what failed and why.
import { useEffect, useState } from "preact/hooks";
import { upq, cancelUploads, retryUpload, retryAll, clearUploads } from "../uploads.js";
import { openBook, store } from "../state.js";
import { Icon } from "./icons.jsx";
import { fmtSize } from "../util.js";

export function UploadPanel() {
  const { items, hidden } = upq.value;
  const [small, setSmall] = useState(false);
  const [hover, setHover] = useState(false);
  const busy = items.some(it => it.state === "up" || it.state === "wait");
  const bad = items.filter(it => it.state === "bad" || it.state === "stop");
  const ok = items.filter(it => it.state === "ok");
  // when everything went in, the panel goes by itself after a few seconds
  useEffect(() => {
    if (busy || bad.length || !items.length || hover) return;
    const t = setTimeout(clearUploads, 6000);
    return () => clearTimeout(t);
  }, [busy, bad.length, items.length, hover]);
  if (!items.length || hidden) return null;
  const size = items.reduce((a, it) => a + (it.size || 0), 0) || 1;
  const sent = items.reduce((a, it) => a + (it.state === "ok" ? it.size : Math.min(it.sent || 0, it.size || 0)), 0);
  const pct = Math.round(100 * sent / size);
  const doneN = ok.length + bad.length;
  const where = store.value?.kind === "onedrive" ? "OneDrive" : store.value?.kind === "demo" ? "the example library" : "your Drive";
  const title = busy ? `Adding ${Math.min(items.length, doneN + 1)} of ${items.length} · ${pct}%`
    : bad.length ? `${bad.length} file${bad.length === 1 ? "" : "s"} not added` : `${ok.length} file${ok.length === 1 ? "" : "s"} added`;
  return (
    <div class={"upq" + (small ? " small" : "") + (bad.length && !busy ? " hasbad" : "") + (!busy && !bad.length ? " alldone" : "")} role="status" aria-live="polite"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div class="upq-h">
        <span class={"upq-i" + (busy ? " spin" : "")}><Icon n={busy ? "upload" : bad.length ? "info" : "check"} size={16} /></span>
        <b class="grow ellipsis" title={`They go to ${where}`}>{title}</b>
        <button class="ib" title={small ? "Show the files" : "Make it small"} onClick={() => setSmall(!small)}><Icon n={small ? "up" : "down"} size={15} /></button>
        {busy ? <button class="btn plain small" onClick={cancelUploads} title="The files already added stay">Cancel</button>
          : <button class="ib" title="Close" onClick={clearUploads}><Icon n="close" size={15} /></button>}
      </div>
      <div class="upq-bar"><i style={{ width: (busy ? pct : 100) + "%" }} /></div>
      {!small && <div class="upq-list">
        {items.map(it => (
          <div key={it.key} class={"upq-r " + it.state}>
            <span class="upq-s">{it.state === "ok" ? <Icon n="check" size={14} /> : it.state === "bad" || it.state === "stop" ? <Icon n="x" size={14} /> : it.state === "up" ? <i class="sdot" /> : <Icon n="clock" size={13} />}</span>
            <span class="grow upq-n">
              <span class="ellipsis">{it.name}</span>
              <span class="tiny">{it.state === "up" ? `${it.size ? Math.round(100 * (it.sent || 0) / it.size) : 0}% of ${fmtSize(it.size)}` : it.state === "wait" ? `Waiting · ${fmtSize(it.size)}` : it.state === "ok" ? fmtSize(it.size) : it.error}</span>
            </span>
            {it.state === "ok" && it.fileId && <button class="btn plain small" onClick={() => openBook(it.bookId, it.fileId)}>Open</button>}
            {(it.state === "bad" || it.state === "stop") && <button class="btn plain small" onClick={() => retryUpload(it.key)}>Try again</button>}
          </div>
        ))}
      </div>}
      {!busy && bad.length > 1 && <div class="upq-f"><span class="tiny muted grow">The others are in. These can go again.</span><button class="btn small" onClick={retryAll}>Try them again</button></div>}
    </div>
  );
}
