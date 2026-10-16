// Share a book with colleagues: Google Drive shares the book's folder (and the files in it) and sends them an email.
// They open it in BindLens Web with Add > A book shared with me; what one marks, the others see.
import { useEffect, useState } from "preact/hooks";
import { panel, books, store, toast, logChange } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { BookTile } from "./bookicons.jsx";
import { bookMeta } from "../state.js";

const close = () => { panel.value = null; };
const ROLES = [["reader", "Can see"], ["commenter", "Can comment"], ["writer", "Can change"]];

export function Share({ id }) {
  const book = books.value.find(b => b.id === id);
  const s = store.value;
  const [people, setPeople] = useState(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("writer");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const can = s.kind === "drive" && s.permissions;
  const load = () => s.permissions(id).then(setPeople).catch((e) => { setPeople([]); toast("Google Drive: " + e.message, "bad"); });
  useEffect(() => { if (can) load(); }, [id]);
  if (!book) return null;
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const send = async () => {
    setBusy(true);
    try {
      await s.share(id, email.trim(), role, msg.trim() || `I shared the book "${book.name}" with you. Open it in BindLens Web (bindlens.com/app): Add > A book shared with me.`);
      logChange("Shared the book with " + email.trim(), book.name);
      toast(`"${book.name}" is shared with ${email.trim()}. Google sends them an email.`, "ok", 5000);
      setEmail(""); setMsg("");
      load();
    } catch (e) { toast("It could not be shared: " + e.message, "bad", 6000); }
    setBusy(false);
  };
  const stop = async (p) => {
    try { await s.unshare(id, p.id); logChange("Stopped sharing the book with " + (p.emailAddress || p.displayName), book.name); load(); }
    catch (e) { toast("Google Drive: " + e.message, "bad"); }
  };
  return (
    <Dialog title="Share with a colleague" icon="share" onClose={close} cls="mid">
      <div class="row" style={{ marginBottom: 12 }}>
        <BookTile book={book} meta={{ ...bookMeta(book.id), tstyle: "flat" }} size={34} />
        <div class="grow"><b>{book.name}</b><div class="small muted">{book.files.length} documents{book.shared ? " · shared with you" : ""}</div></div>
      </div>
      {!can ? <p class="small">{s.kind === "demo" ? "In the example library nothing is shared. Sign in with Google to share your own books." : "Sharing from BindLens works with Google Drive. In OneDrive, share the folder Apps/BindLens/" + book.name + " from OneDrive itself."}</p> : <>
        <div class="share-add">
          <input class="field" type="email" value={email} placeholder="Their email, e.g. aoife@college.ie" onInput={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && ok) send(); }} />
          <select class="field" value={role} onChange={(e) => setRole(e.target.value)} style={{ flex: "0 0 150px" }}>
            {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <textarea class="field" style={{ minHeight: 60, marginTop: 8 }} value={msg} placeholder="A message (optional)" onInput={(e) => setMsg(e.target.value)} />
        <div class="row" style={{ marginTop: 8 }}>
          <span class="grow tiny muted">"Can change": they can add files and mark the pages. Marks are saved in the PDFs, so everyone sees them.</span>
          <button class="btn" disabled={!ok || busy} onClick={send}><Icon n="share" size={16} />Share</button>
        </div>
        <div class="ap-sec" style={{ marginTop: 16 }}>Who has it</div>
        {!people ? <div class="spinner" /> : (
          <div class="share-list">
            {people.map(p => (
              <div key={p.id} class="share-p">
                <span class="avatar">{p.photoLink ? <img src={p.photoLink} alt="" referrerpolicy="no-referrer" /> : (p.displayName || p.emailAddress || "?").slice(0, 1).toUpperCase()}</span>
                <span class="grow" style={{ minWidth: 0 }}><b class="small ellipsis" style={{ display: "block" }}>{p.displayName || p.emailAddress || (p.type === "anyone" ? "Anyone with the link" : p.type)}</b>
                  {p.emailAddress && p.displayName && <span class="tiny muted">{p.emailAddress}</span>}</span>
                <span class="tiny muted">{p.role === "owner" ? "Owner" : (ROLES.find(r => r[0] === p.role) || [0, p.role])[1]}</span>
                {p.role !== "owner" && <button class="ib" title="Stop sharing with them" onClick={() => stop(p)}><Icon n="close" size={16} /></button>}
              </div>
            ))}
          </div>
        )}
        <p class="tiny muted" style={{ marginTop: 12 }}>They open it in BindLens Web with <b>Add &gt; A book shared with me</b>, or in Google Drive under "Shared with me".</p>
      </>}
    </Dialog>
  );
}
