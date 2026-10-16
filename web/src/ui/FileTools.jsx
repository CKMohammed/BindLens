// Panels for one document: its earlier versions (kept by Google Drive), the pages taken out (to put them back),
// and a copy with a password or that cannot be changed.
import { useEffect, useState } from "preact/hooks";
import { panel, store, toast, patchFile, logChange, books } from "../state.js";
import { Dialog, confirm } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { fileFor, getDoc, call, reopen, saveAll, notifyChanged } from "../docs.js";
import { deletedPages, putPageBack, keepNew } from "../filetools.js";
import { scrollTo } from "./Viewer.jsx";
import { baseName, fmtSize, download } from "../util.js";

const close = () => { panel.value = null; };
const when = (t) => new Date(t).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const bookOf = (file) => books.value.find(b => b.files.some(f => f.id === file.id));

export function Versions({ fileId }) {
  const file = fileFor(fileId);
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!file) return;
    saveAll().then(() => store.value.revisions(file)).then(setList).catch(e => setErr(e.message));
  }, [fileId]);
  if (!file) return null;
  const copyOf = async (v) => {
    setBusy(true);
    try {
      const buf = await store.value.readRevision(file, v.id);
      const stamp = new Date(v.modified).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/[/:]/g, ".");
      await keepNew(bookOf(file), file, `${baseName(file.name)} (${stamp}).${file.name.split(".").pop()}`, new Uint8Array(buf), "Made a copy of an earlier version");
    } catch (e) { toast("Could not open that version: " + e.message, "bad"); }
    setBusy(false);
  };
  const goBack = async (v) => {
    if (!(await confirm("Go back to this version?", `"${file.name}" becomes as it was on ${when(v.modified)}. The version you have now stays in this list, so you can come back to it.`, { ok: "Go back to it" }))) return;
    setBusy(true);
    try {
      const buf = await store.value.readRevision(file, v.id);
      const f = await store.value.write(file, buf);
      patchFile({ ...f, kind: file.kind });
      await reopen({ ...file, ...f });
      notifyChanged(file.id, "pages");
      logChange("Went back to an earlier version of", file.name);
      toast(`"${file.name}" is as it was on ${when(v.modified)}.`, "ok", 5000);
      close();
    } catch (e) { toast("Could not go back: " + e.message, "bad"); }
    setBusy(false);
  };
  return (
    <Dialog title={`Earlier versions of "${file.name}"`} icon="clock" onClose={close} cls="mid">
      <p class="small muted" style={{ marginTop: 0 }}>{store.value.cloud ? `${store.value.cloud} keeps the earlier versions of a file (Google Drive for about 30 days). Open a copy of one, or make the file as it was.` : "In the example library, the versions are kept while this tab is open."}</p>
      {err ? <p class="small" style={{ color: "var(--bad)" }}>{err}</p> : !list ? <div class="spinner" /> : list.length < 2 ? <p class="muted">There are no earlier versions yet. Every time BindLens saves your marks, the version before is kept.</p> : (
        <div class="rep-out" style={{ maxHeight: "50vh" }}>
          <table class="rows">
            <tbody>{list.map((v, i) => (
              <tr key={v.id}>
                <td><b>{when(v.modified)}</b>{i === 0 && <span class="chipst ok" style={{ marginLeft: 8 }}>Now</span>}<div class="tiny muted">{fmtSize(v.size)}</div></td>
                <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                  <button class="btn plain small" disabled={busy} onClick={() => copyOf(v)}><Icon n="copy" size={16} />A copy</button>
                  {i > 0 && <button class="btn soft small" disabled={busy} onClick={() => goBack(v)}><Icon n="undo" size={16} />Go back to it</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}

function DelThumb({ bytes }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url = null, alive = true;
    (async () => {
      const key = "thumb:" + Math.random().toString(36).slice(2);
      try {
        await call("open", key, bytes.slice(0), "application/pdf", "x.pdf");
        const png = await call("pagePng", key, 0, 0.25);
        url = URL.createObjectURL(new Blob([png], { type: "image/png" }));
        if (alive) setSrc(url);
      } catch (e) {}
      call("close", key).catch(() => {});
    })();
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, []);
  return src ? <img src={src} alt="" style={{ width: 90, boxShadow: "var(--shadow2)", borderRadius: 3, background: "#fff" }} /> : <div style={{ width: 90, height: 120, background: "var(--panel2)", borderRadius: 3 }} />;
}

export function Deleted({ fileId }) {
  const file = fileFor(fileId);
  const [list, setList] = useState(null);
  useEffect(() => { if (file) deletedPages(file).then(setList); }, [fileId]);
  if (!file) return null;
  return (
    <Dialog title={`Pages taken out of "${file.name}"`} icon="trash" onClose={close} cls="mid">
      <p class="small muted" style={{ marginTop: 0 }}>The pages you take out are kept here, in this browser, so you can put them back.</p>
      {!list ? <div class="spinner" /> : !list.length ? <p class="muted">No pages were taken out of this document.</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 14 }}>
          {list.map((it, i) => (
            <div key={it.at + ":" + i} style={{ textAlign: "center" }}>
              <DelThumb bytes={it.bytes} />
              <div class="tiny muted">Page {it.page + 1} · {when(it.at)}</div>
              <button class="btn soft small" style={{ marginTop: 4 }} onClick={async () => {
                const at = await putPageBack(file, it, i);
                setList(await deletedPages(file));
                scrollTo.value = { fileId: file.id, page: at };
              }}><Icon n="undo" size={16} />Put it back</button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

export function Protect({ fileId, readOnly: ro0 = false }) {
  const file = fileFor(fileId);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [ro, setRo] = useState(ro0);
  const [busy, setBusy] = useState(false);
  if (!file) return null;
  const ok = (pw ? pw === pw2 : true) && (pw || ro);
  const make = async (where) => {
    setBusy(true);
    try {
      await saveAll();
      const d = await getDoc(file);
      const u8 = await call("protectedCopy", d.key, pw, "", ro);
      const name = `${baseName(file.name)} (${pw ? "password" : "read-only"}).pdf`;
      if (where === "download") download(u8, name, "application/pdf");
      else await keepNew(bookOf(file), file, name, u8, pw ? "Made a copy with a password" : "Made a read-only copy", { askWhere: false });
      toast(pw ? "The copy asks for the password to open. Keep the password safe: it cannot be got back." : "The copy cannot be changed in PDF programs that respect it.", "ok", 6000);
      close();
    } catch (e) { toast("Could not make the copy: " + e.message, "bad"); }
    setBusy(false);
  };
  return (
    <Dialog title="Copy with a password" icon="lock" onClose={close}
      foot={<><button class="btn plain" onClick={close}>Cancel</button><span class="grow" />
        <button class="btn soft" disabled={!ok || busy} onClick={() => make("download")}><Icon n="download" size={17} />Download the copy</button>
        <button class="btn" disabled={!ok || busy} onClick={() => make("book")}>Save it in the book</button></>}>
      <p class="small muted" style={{ marginTop: 0 }}>A copy of "{file.name}" with its marks. The file itself stays as it is.</p>
      <div class="grid2">
        <label class="small">Password to open it (or leave it empty)<input class="field" type="password" value={pw} onInput={(e) => setPw(e.target.value)} /></label>
        <label class="small">The password again<input class="field" type="password" value={pw2} onInput={(e) => setPw2(e.target.value)} /></label>
      </div>
      {pw && pw2 && pw !== pw2 && <p class="small" style={{ color: "var(--bad)" }}>The two passwords are not the same.</p>}
      <label class="chk" style={{ marginTop: 12 }}><input type="checkbox" checked={ro} onChange={(e) => setRo(e.target.checked)} />Read-only: it can be read, printed and copied from, but not changed</label>
    </Dialog>
  );
}
