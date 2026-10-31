// Choose a folder of your OneDrive: it becomes a book, where it is (nothing is copied)
import { useEffect, useState } from "preact/hooks";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { panel, store } from "../state.js";
import { linkOneDriveFolder } from "../actions.js";
import { _t } from "../i18n.js";

export function OneDrivePick() {
  const [path, setPath] = useState([{ id: "root", name: "OneDrive" }]);
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const here = path[path.length - 1];
  const close = () => { panel.value = null; };
  useEffect(() => {
    setList(null); setErr("");
    store.value.folders(here.id).then(setList).catch(e => setErr(e.message || String(e)));
  }, [here.id]);
  const choose = async (fo) => { close(); await linkOneDriveFolder(fo); };
  return (
    <Dialog title={_t("A folder from my OneDrive")} icon="drive" onClose={close} cls="mid"
      foot={<>{path.length > 1 && <button class="btn plain" onClick={() => setPath(path.slice(0, -1))}><Icon n="left" size={16} />{_t("Back")}</button>}
        <span class="grow" />
        {here.id !== "root" && <button class="btn" onClick={() => choose(here)}><Icon n="book" size={16} />{_t("Make \"{0}\" a book", here.name)}</button>}</>}>
      <p class="small muted" style={{ marginTop: 0 }}>{path.map(p => p.name).join("  ›  ")}</p>
      {err && <p class="small" style={{ color: "var(--bad,#B3261E)" }}>{_t("OneDrive did not answer:")} {err}</p>}
      {!list && !err && <div class="spinner" />}
      {list && !list.length && <p class="small muted">{_t("No folders here. Use the button below to make this folder a book.")}</p>}
      {list && list.map(fo => (
        <div key={fo.id} class="row od-row">
          <button class="btn plain grow" style={{ justifyContent: "flex-start" }} onClick={() => setPath([...path, fo])}>
            <Icon n="book" size={16} /><span class="ellipsis">{fo.name}</span><span class="tiny muted">{fo.count}</span></button>
          <button class="btn small ghost" onClick={() => choose(fo)}>{_t("Make it a book")}</button>
        </div>
      ))}
    </Dialog>
  );
}
