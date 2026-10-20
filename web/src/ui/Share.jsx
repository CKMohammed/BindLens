// Share a book with colleagues: Google Drive shares the book's folder (and the files in it) and sends them an email.
// They open it in BindLens Web with Add > A book shared with me; what one marks, the others see.
import { useEffect, useState } from "preact/hooks";
import { panel, books, store, toast, logChange } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { BookTile } from "./bookicons.jsx";
import { bookMeta } from "../state.js";
import { _t } from "../i18n.js";

const close = () => { panel.value = null; };
const ROLES = [["reader", _t("Can see")], ["commenter", _t("Can comment")], ["writer", _t("Can change")]];

export function Share({ id }) {
  const book = books.value.find(b => b.id === id);
  const s = store.value;
  const [people, setPeople] = useState(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("writer");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const can = s.kind === "drive" && s.permissions;
  const load = () => s.permissions(id).then(setPeople).catch((e) => { setPeople([]); toast(_t("Google Drive: ") + e.message, "bad"); });
  useEffect(() => { if (can) load(); }, [id]);
  if (!book) return null;
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const send = async () => {
    setBusy(true);
    try {
      await s.share(id, email.trim(), role, msg.trim() || _t("I shared the book \"{0}\" with you. Open it in BindLens Web (bindlens.com/app): Add > A book shared with me.", book.name));
      logChange(_t("Shared the book with ") + email.trim(), book.name);
      toast(_t("\"{0}\" is shared with {1}. Google sends them an email.", book.name, email.trim()), "ok", 5000);
      setEmail(""); setMsg("");
      load();
    } catch (e) { toast(_t("It could not be shared: ") + e.message, "bad", 6000); }
    setBusy(false);
  };
  const stop = async (p) => {
    try { await s.unshare(id, p.id); logChange(_t("Stopped sharing the book with {0}", p.emailAddress || p.displayName), book.name); load(); }
    catch (e) { toast(_t("Google Drive: ") + e.message, "bad"); }
  };
  return (
    <Dialog title={_t("Share with a colleague")} icon="share" onClose={close} cls="mid">
      <div class="row" style={{ marginBottom: 12 }}>
        <BookTile book={book} meta={{ ...bookMeta(book.id), tstyle: "flat" }} size={34} />
        <div class="grow"><b>{book.name}</b><div class="small muted">{book.files.length} {_t("documents")}{book.shared ? _t(" · shared with you") : ""}</div></div>
      </div>
      {!can ? <p class="small">{s.kind === "demo" ? _t("In the example library nothing is shared. Sign in with Google to share your own books.") : _t("Sharing from BindLens works with Google Drive. In OneDrive, share the folder Apps/BindLens/") + book.name + _t(" from OneDrive itself.")}</p> : <>
        <div class="share-add">
          <input class="field" type="email" value={email} placeholder={_t("Their email, e.g. aoife@college.ie")} onInput={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && ok) send(); }} />
          <select class="field" value={role} onChange={(e) => setRole(e.target.value)} style={{ flex: "0 0 150px" }}>
            {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <textarea class="field" style={{ minHeight: 60, marginTop: 8 }} value={msg} placeholder={_t("A message (optional)")} onInput={(e) => setMsg(e.target.value)} />
        <div class="row" style={{ marginTop: 8 }}>
          <span class="grow tiny muted">{_t("\"Can change\": they can add files and mark the pages. Marks are saved in the PDFs, so everyone sees them.")}</span>
          <button class="btn" disabled={!ok || busy} onClick={send}><Icon n="share" size={16} />{_t("Share")}</button>
        </div>
        <div class="ap-sec" style={{ marginTop: 16 }}>{_t("Who has it")}</div>
        {!people ? <div class="spinner" /> : (
          <div class="share-list">
            {people.map(p => (
              <div key={p.id} class="share-p">
                <span class="avatar">{p.photoLink ? <img src={p.photoLink} alt="" referrerpolicy="no-referrer" /> : (p.displayName || p.emailAddress || "?").slice(0, 1).toUpperCase()}</span>
                <span class="grow" style={{ minWidth: 0 }}><b class="small ellipsis" style={{ display: "block" }}>{p.displayName || p.emailAddress || (p.type === "anyone" ? _t("Anyone with the link") : p.type)}</b>
                  {p.emailAddress && p.displayName && <span class="tiny muted">{p.emailAddress}</span>}</span>
                <span class="tiny muted">{p.role === "owner" ? _t("Owner") : (ROLES.find(r => r[0] === p.role) || [0, p.role])[1]}</span>
                {p.role !== "owner" && <button class="ib" title={_t("Stop sharing with them")} onClick={() => stop(p)}><Icon n="close" size={16} /></button>}
              </div>
            ))}
          </div>
        )}
        <p class="tiny muted" style={{ marginTop: 12 }}>{_t("They open it in BindLens Web with")} <b>{_t("Add > A book shared with me")}</b>{_t(", or in Google Drive under \"Shared with me\".")}</p>
      </>}
    </Dialog>
  );
}
