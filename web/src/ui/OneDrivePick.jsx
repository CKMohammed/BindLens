// From my OneDrive: a folder becomes a book, or single files (PDFs, pictures, Excel...) go into a book - all where they are, nothing is copied
import { useEffect, useState } from "preact/hooks";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { panel, store } from "../state.js";
import { linkOneDriveFolder, linkOneDriveFiles } from "../actions.js";
import { _t } from "../i18n.js";

const OK = /\.(pdf|png|jpe?g|gif|webp|bmp|tiff?|heic|xlsx|xlsm|xls|csv|ods|docx|doc|odt|txt|md|pptx|ppt|odp|rtf|html?|eml|json)$/i;

export function OneDrivePick() {
  const into = panel.value && panel.value.book;
  const [path, setPath] = useState([{ id: "root", name: "OneDrive" }]);
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(new Map());
  const here = path[path.length - 1];
  const close = () => { panel.value = null; };
  useEffect(() => {
    setList(null); setErr("");
    store.value.folders(here.id, true).then(setList).catch(e => setErr(e.message || String(e)));
  }, [here.id]);
  const chooseFolder = async (fo) => { close(); await linkOneDriveFolder(fo); };
  const flip = (f) => { const m = new Map(sel); if (m.has(f.id)) m.delete(f.id); else m.set(f.id, f); setSel(m); };
  const addFiles = async () => { const files = [...sel.values()]; close(); await linkOneDriveFiles(files, into); };
  const files = (list || []).filter(x => x.file && OK.test(x.name));
  const folders = (list || []).filter(x => !x.file);
  return (
    <Dialog title={_t("From my OneDrive")} icon="drive" onClose={close} cls="mid"
      foot={<>{path.length > 1 && <button class="btn plain" onClick={() => setPath(path.slice(0, -1))}><Icon n="left" size={16} />{_t("Back")}</button>}
        <span class="grow" />
        {sel.size > 0 ? <button class="btn" onClick={addFiles}><Icon n="plus" size={16} />{sel.size === 1 ? _t("Add 1 file") : _t("Add {0} files", sel.size)}</button>
          : here.id !== "root" && !into && <button class="btn" onClick={() => chooseFolder(here)}><Icon n="book" size={16} />{_t("Make \"{0}\" a book", here.name)}</button>}</>}>
      <p class="small muted" style={{ marginTop: 0 }}>{path.map(p => p.name).join("  ›  ")}</p>
      {err && <p class="small" style={{ color: "var(--bad,#B3261E)" }}>{_t("OneDrive did not answer:")} {err}</p>}
      {!list && !err && <div class="spinner" />}
      {list && !folders.length && !files.length && <p class="small muted">{_t("Nothing to add here.")}</p>}
      {folders.map(fo => (
        <div key={fo.id} class="row od-row">
          <button class="btn plain grow" style={{ justifyContent: "flex-start" }} onClick={() => setPath([...path, fo])}>
            <Icon n="book" size={16} /><span class="ellipsis">{fo.name}</span><span class="tiny muted">{fo.count}</span></button>
          {!into && <button class="btn small ghost" onClick={() => chooseFolder(fo)}>{_t("Make it a book")}</button>}
        </div>
      ))}
      {files.map(f => (
        <label key={f.id} class={"row od-row od-file" + (sel.has(f.id) ? " on" : "")}>
          <input type="checkbox" checked={sel.has(f.id)} onChange={() => flip(f)} />
          <Icon n={/\.(xlsx|xlsm|xls|csv|ods)$/i.test(f.name) ? "table" : "file"} size={16} /><span class="ellipsis grow">{f.name}</span>
        </label>
      ))}
    </Dialog>
  );
}
