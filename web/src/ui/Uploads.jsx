// The panel in the corner while files go up to the Drive: how many, how far, each file ticked, what failed and why.
import { useEffect, useState } from "preact/hooks";
import { upq, cancelUploads, retryUpload, retryAll, clearUploads } from "../uploads.js";
import { openBook, store } from "../state.js";
import { Icon } from "./icons.jsx";
import { fmtSize } from "../util.js";
import { _t } from "../i18n.js";

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
  const where = store.value?.kind === "onedrive" ? _t("OneDrive") : store.value?.kind === "demo" ? _t("the example library") : _t("your Drive");
  const title = busy ? _t("Adding {0} of {1} · {2}%", Math.min(items.length, doneN + 1), items.length, pct)
    : bad.length ? _t("{0} file{1} not added", bad.length, bad.length === 1 ? "" : "s") : _t("{0} file{1} added", ok.length, ok.length === 1 ? "" : "s");
  return (
    <div class={"upq" + (small ? " small" : "") + (bad.length && !busy ? " hasbad" : "") + (!busy && !bad.length ? " alldone" : "")} role="status" aria-live="polite"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div class="upq-h">
        <span class={"upq-i" + (busy ? " spin" : "")}><Icon n={busy ? "upload" : bad.length ? "info" : "check"} size={16} /></span>
        <b class="grow ellipsis" title={_t("They go to {0}", where)}>{title}</b>
        <button class="ib" title={small ? _t("Show the files") : _t("Make it small")} onClick={() => setSmall(!small)}><Icon n={small ? "up" : "down"} size={15} /></button>
        {busy ? <button class="btn plain small" onClick={cancelUploads} title={_t("The files already added stay")}>{_t("Cancel")}</button>
          : <button class="ib" title={_t("Close")} onClick={clearUploads}><Icon n="close" size={15} /></button>}
      </div>
      <div class="upq-bar"><i style={{ width: (busy ? pct : 100) + "%" }} /></div>
      {!small && <div class="upq-list">
        {items.map(it => (
          <div key={it.key} class={"upq-r " + it.state}>
            <span class="upq-s">{it.state === "ok" ? <Icon n="check" size={14} /> : it.state === "bad" || it.state === "stop" ? <Icon n="x" size={14} /> : it.state === "up" ? <i class="sdot" /> : <Icon n="clock" size={13} />}</span>
            <span class="grow upq-n">
              <span class="ellipsis">{it.name}</span>
              <span class="tiny">{it.state === "up" ? _t("{0}% of {1}", it.size ? Math.round(100 * (it.sent || 0) / it.size) : 0, fmtSize(it.size)) : it.state === "wait" ? _t("Waiting · {0}", fmtSize(it.size)) : it.state === "ok" ? fmtSize(it.size) : it.error}</span>
            </span>
            {it.state === "ok" && it.fileId && <button class="btn plain small" onClick={() => openBook(it.bookId, it.fileId)}>{_t("Open")}</button>}
            {(it.state === "bad" || it.state === "stop") && <button class="btn plain small" onClick={() => retryUpload(it.key)}>{_t("Try again")}</button>}
          </div>
        ))}
      </div>}
      {!busy && bad.length > 1 && <div class="upq-f"><span class="tiny muted grow">{_t("The others are in. These can go again.")}</span><button class="btn small" onClick={retryAll}>{_t("Try them again")}</button></div>}
    </div>
  );
}
