// Settings (the frame's colours, PIN, account), the PIN dialog and Help.
import { useState, useEffect } from "preact/hooks";
import { panel, settings, setSetting, store, locked, toast, saving } from "../state.js";
import { indexed } from "../docs.js";
import { installPrompt, installApp } from "../install.js";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { DEFAULT_FRAME, AURORA_FRAME } from "./App.jsx";
import { idb } from "../idb.js";
import { pinHash } from "./Lock.jsx";
import { signOut } from "../actions.js";
import { brandOf } from "../util.js";

const PRESETS = [
  { name: "BindLens", colors: DEFAULT_FRAME },
  { name: "Aurora", colors: AURORA_FRAME },
  { name: "Lava", colors: ["#7C5CFF", "#FF3D9A", "#F0562A", "#F2C85A", "#3E7BFF"] },
  { name: "Gold", colors: ["#8A6A1E", "#D4AF37", "#F2C85A", "#FFF1B8", "#B8892A"] },
  { name: "Ocean", colors: ["#0B5FA5", "#18A0C9", "#5BD4D9", "#2E6FE0", "#7C5CFF"] },
  { name: "Forest", colors: ["#1F6B45", "#3FB28F", "#A3D977", "#2B8A3E", "#F2C85A"] },
  { name: "Sunset", colors: ["#F0562A", "#FF8A3D", "#F2C85A", "#FF3D9A", "#B23CFF"] },
  { name: "Berry", colors: ["#8E2DE2", "#FF3D9A", "#C2185B", "#7C5CFF", "#4A00E0"] },
  { name: "Calm", colors: ["#9AA5C4", "#C9D2E8", "#E8E2F7", "#B7C8E0", "#A79CD6"] },
  { name: "Night", colors: ["#1E1C2B", "#3A2E7A", "#6C5CFF", "#1E1C2B", "#2B2440"] },
];

const close = () => { panel.value = null; };

// Colours: the BindLens colours of the logo, or the institution's - on the frame, the buttons and the reports
function Colours() {
  const b = settings.value.brand || {};
  const set = (ch) => setSetting("brand", { ...b, ...ch });
  const br = brandOf(settings.value);
  return (
    <>
      <h3 style={{ margin: "4px 0 8px", font: "700 16px var(--f-display)" }}>Colours</h3>
      <div class="grid2">
        <button class={"cardopt brandopt" + (!b.on ? " on" : "")} onClick={() => set({ on: false })}>
          <span class="bo-sw">{["#111218", "#FF85C2", "#FFC83D"].map(c => <i key={c} style={{ background: c }} />)}</span>
          <span><b>BindLens</b><small>The colours of the logo: ink, pink and gold</small></span>
        </button>
        <button class={"cardopt brandopt" + (b.on ? " on" : "")} onClick={() => set({ on: true, c1: b.c1 || "#00573F", c2: b.c2 || "#C9A227" })}>
          <span class="bo-sw">{[b.c1 || "#00573F", b.c2 || "#C9A227"].map((c, i) => <i key={i} style={{ background: c }} />)}</span>
          <span><b>Your institution's colours</b><small>Your college's or company's colours on the frame, the buttons and the reports</small></span>
        </button>
      </div>
      {b.on && <div class="brandform">
        <label class="small">Its name (at the top of your reports)<input class="field" value={b.name || ""} placeholder="e.g. Atlantic Technological University" onInput={(e) => set({ name: e.target.value.slice(0, 80) })} /></label>
        <div class="row wrap" style={{ gap: 16 }}>
          <label class="row small">Main colour <input type="color" value={b.c1 || "#00573F"} onInput={(e) => set({ c1: e.target.value })} /></label>
          <label class="row small">Second colour <input type="color" value={b.c2 || "#C9A227"} onInput={(e) => set({ c2: e.target.value })} /></label>
          {br && br.accent.toLowerCase() !== (b.c1 || "").toLowerCase() && <span class="tiny muted">Buttons and words use it a little darker, so they read well: <i class="bo-dot" style={{ background: br.accent }} /></span>}
        </div>
        <div class="row wrap" style={{ gap: 18 }}>
          <label class="chk small"><input type="checkbox" checked={b.frame !== false} onChange={(e) => set({ frame: e.target.checked })} />The frame</label>
          <label class="chk small"><input type="checkbox" checked={b.ui !== false} onChange={(e) => set({ ui: e.target.checked })} />Buttons and highlights</label>
          <label class="chk small"><input type="checkbox" checked={b.reports !== false} onChange={(e) => set({ reports: e.target.checked })} />Reports (PDF): its name and colours at the top</label>
        </div>
      </div>}
    </>
  );
}

export function Settings() {
  const f = settings.value.frame || {};
  const colors = f.colors && f.colors.length ? f.colors : DEFAULT_FRAME;
  const setFrame = (change) => setSetting("frame", { ...f, colors, ...change });
  const s = store.value;
  return (
    <Dialog title="Settings" icon="settings" onClose={close} cls="mid">
      <Colours />
      <h3 style={{ margin: "22px 0 8px", font: "700 16px var(--f-display)" }}>The frame round the window</h3>
      <p class="small muted" style={{ marginTop: 0 }}>{brandOf(settings.value) && settings.value.brand.frame !== false ? "The frame has your institution's colours now (above). Choose other colours for it here, or untick \"The frame\" above." : "The colours that flow round the window."}</p>
      <div class="grid2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
        {PRESETS.map(p => {
          const on = JSON.stringify(p.colors) === JSON.stringify(colors);
          return (
            <button key={p.name} class={"cardopt" + (on ? " on" : "")} onClick={() => setFrame({ colors: p.colors })} style={{ flexDirection: "column", gap: 8 }}>
              <span style={{ height: 22, width: "100%", borderRadius: 8, background: `linear-gradient(90deg, ${p.colors.join(",")})` }} />
              <b>{p.name}</b>
            </button>
          );
        })}
      </div>
      <div class="row wrap" style={{ marginTop: 14, gap: 12 }}>
        <span class="small muted">Your own colours:</span>
        {colors.map((c, i) => (
          <input key={i} type="color" value={c} title={`Colour ${i + 1}`} style={{ width: 38, height: 32, border: 0, background: "none", padding: 0 }}
            onInput={(e) => { const n = [...colors]; n[i] = e.target.value; setFrame({ colors: n }); }} />
        ))}
      </div>
      <div class="row wrap" style={{ marginTop: 12, gap: 18 }}>
        <label class="chk"><input type="checkbox" checked={!!f.still} onChange={(e) => setFrame({ still: e.target.checked })} />Keep the colours still</label>
        <label class="row small">Speed
          <input type="range" min="6" max="60" value={66 - (f.speed || 22)} onInput={(e) => setFrame({ speed: 66 - Number(e.target.value) })} />
        </label>
        <button class="btn plain small" onClick={() => { setSetting("frame", {}); }}>Back to the BindLens colours</button>
      </div>

      <h3 style={{ margin: "22px 0 8px", font: "700 16px var(--f-display)" }}>View</h3>
      <div class="row wrap" style={{ gap: 18 }}>
        <label class="chk"><input type="checkbox" checked={!settings.value.hideRail} onChange={(e) => setSetting("hideRail", !e.target.checked)} />The quick bar on the right of a book</label>
        {installPrompt.value && <button class="btn soft small" onClick={installApp}><Icon n="download" size={16} />Install BindLens as an app</button>}
      </div>
      <Doing />

      <h3 style={{ margin: "22px 0 8px", font: "700 16px var(--f-display)" }}>Notifications and offline</h3>
      <label class="chk small"><input type="checkbox" checked={!!settings.value.notify} onChange={async (e) => {
        const n = await import("../notify.js");
        if (e.target.checked) { if (await n.turnOn()) { setSetting("notify", true); setTimeout(() => { n.startNotifications(); n.checkNow(); }, 300); toast("BindLens tells you what needs you today and tomorrow.", "ok"); } }
        else setSetting("notify", false);
      }} />Tell me what needs me today and tomorrow (a notification on this computer or phone, while BindLens is open or installed as an app)</label>
      <p class="small muted" style={{ margin: "8px 0 0" }}>BindLens works without a network too, once it has been opened here: the documents you opened are kept in this browser, and what you change offline goes up to your {s.cloud || "Drive"} when the network is back.</p>

      <h3 style={{ margin: "22px 0 8px", font: "700 16px var(--f-display)" }}>PIN</h3>
      <div class="row wrap">
        <span class="grow small muted">{settings.value.pin ? "BindLens asks for your PIN when it opens." : "Lock BindLens with a four-digit PIN on a shared computer."}</span>
        <button class="btn soft small" onClick={() => { panel.value = { type: "pin" }; }}><Icon n="lock" size={16} />{settings.value.pin ? "Change the PIN" : "Choose a PIN"}</button>
        {settings.value.pin && <button class="btn plain small" onClick={() => { setSetting("pin", null); toast("The PIN is off."); }}>Take the PIN off</button>}
      </div>

      <h3 style={{ margin: "22px 0 8px", font: "700 16px var(--f-display)" }}>Account</h3>
      {s.cloud ? <>
        <p class="small" style={{ margin: "0 0 8px" }}>Signed in as <b>{s.user?.email}</b>. Your books are in {s.kind === "onedrive" ? <>the <b>Apps/BindLens</b> folder of your OneDrive</> : <>the <b>BindLens</b> folder of your Google Drive</>}.</p>
        <div class="row wrap">
          <a class="btn soft small" href={s.folderLink()} target="_blank" rel="noopener"><Icon n="drive" size={16} />Open the folder in {s.kind === "onedrive" ? "OneDrive" : "Drive"}</a>
          <button class="btn plain small" onClick={async () => { await idb.clear("files"); await idb.clear("text"); toast(`The copies kept in this browser are gone. Your ${s.cloud} is unchanged.`); }}>Clear the copies in this browser</button>
          <button class="btn plain small" onClick={signOut}><Icon n="logout" size={16} />Sign out</button>
        </div>
      </> : <p class="small">This is the example library: what you change here is not saved. <a href="#" onClick={(e) => { e.preventDefault(); signOut(); }}>Sign in with Google</a> to keep your own books.</p>}

      <h3 style={{ margin: "22px 0 8px", font: "700 16px var(--f-display)" }}>What BindLens changed</h3>
      {!(settings.value.log || []).length ? <p class="small muted" style={{ margin: 0 }}>Nothing yet. Every change BindLens makes in your Drive (files added, renamed, moved, marks saved) is written down here.</p> : (
        <div class="rep-out" style={{ maxHeight: 220 }}>
          <table class="rows">
            <tbody>{(settings.value.log || []).slice(0, 120).map((l, i) => (
              <tr key={i}><td class="small" style={{ whiteSpace: "nowrap" }}>{new Date(l.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                <td class="small"><b>{l.what}</b> {l.name}{l.book ? <span class="muted"> · {l.book}</span> : ""}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <h3 style={{ margin: "22px 0 8px", font: "700 16px var(--f-display)" }}>About</h3>
      <p class="small muted" style={{ margin: 0 }}>BindLens Web 1.0 · made by Mohammed Chahboune Kadi. Free software under the GNU AGPL 3.0: the source is at <a href="https://github.com/CKMohammed/BindLens" target="_blank" rel="noopener">github.com/CKMohammed/BindLens</a>. Pages are drawn with MuPDF (Artifex, AGPL).</p>
      <div class="row wrap" style={{ marginTop: 8 }}>
        <button class="btn plain small" onClick={() => { panel.value = { type: "legal" }; }}><Icon n="info" size={16} />Licence, privacy and legal</button>
        <button class="btn plain small" onClick={() => { panel.value = { type: "welcome" }; }}><Icon n="sparkle" size={16} />Show the tour again</button>
      </div>
    </Dialog>
  );
}

// what BindLens is doing in the background (reading the words of the library, saving)
function Doing() {
  const [, setV] = useState(0);
  useEffect(() => { const f = () => setV(x => x + 1); indexed.listeners.add(f); const t = setInterval(f, 1500); return () => { indexed.listeners.delete(f); clearInterval(t); }; }, []);
  const sv = saving.value;
  return (
    <p class="small muted" style={{ margin: "10px 0 0" }}>
      <b>What BindLens is doing: </b>
      {indexed.running ? `reading the words of your library, so Find and Reports are quick (${indexed.n} of ${indexed.of} files)` : "nothing in the background now"}
      {sv.n ? ` · saving ${sv.n} document${sv.n === 1 ? "" : "s"}` : sv.last ? ` · everything is saved (${new Date(sv.last).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })})` : ""}.
    </p>
  );
}

export function Pin() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const ok = /^\d{4}$/.test(a) && a === b;
  const save = async () => {
    setSetting("pin", await pinHash(a));
    toast("Your PIN is set. BindLens asks for it every time it opens.", "ok", 4500);
    close();
  };
  return (
    <Dialog title={settings.value.pin ? "Change the PIN" : "Choose a PIN"} icon="lock" onClose={close}
      foot={<>
        {settings.value.pin && <button class="btn plain" onClick={() => { close(); locked.value = true; }}>Lock now</button>}
        <span class="grow" />
        <button class="btn plain" onClick={close}>Cancel</button>
        <button class="btn" disabled={!ok} onClick={save}>Save the PIN</button>
      </>}>
      <p class="small muted" style={{ marginTop: 0 }}>Four digits. If you forget it, you take it off by signing in with Google again.</p>
      <div class="grid2">
        <label class="small">PIN<input class="field" inputMode="numeric" maxLength={4} type="password" value={a} onInput={(e) => setA(e.target.value.replace(/\D/g, ""))} /></label>
        <label class="small">The PIN again<input class="field" inputMode="numeric" maxLength={4} type="password" value={b} onInput={(e) => setB(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter" && ok) save(); }} /></label>
      </div>
      {b.length === 4 && a !== b && <p class="small" style={{ color: "var(--bad)" }}>The two PINs are not the same.</p>}
    </Dialog>
  );
}

const HELP = [
  ["book", "Books", "A book is a folder in your Google Drive, inside the BindLens folder. Every PDF, Word file, spreadsheet, photo and video in it is one book you scroll through. Make one with + on Home or in the Library."],
  ["upload", "Add files", "Drag files onto the window, or use Add files. From the Library you can also add files that are already in your Drive (From my Drive)."],
  ["highlighter", "Mark", "Choose a tool at the top: the highlighter, the pen, text, a sticky note, shapes, a tick or a cross, stamps and your signature. Your marks are saved inside the PDF in your Drive, so any PDF program shows them. Ctrl+Z undoes."],
  ["select", "Change a mark", "With the arrow, click a mark to choose it: drag it, give it another colour or take it off (Delete). Double-click a text or a sticky note to change its words."],
  ["edit", "Change the text", "The pencil with a line changes the words of the PDF itself, in the same size and a similar font. Click a line, type, press Enter."],
  ["search", "Find", "Ctrl+K finds a book, a document, a word inside any document, or something to do. The Search tab in the Library finds a word in this book and shows every place."],
  ["reports", "Reports", "Reports take out the rows as they are: names, emails, phones, addresses, dates, amounts, and every table with its columns. Rows with a name or value gives every row that has it, with its own columns; Rows as they look shows them as pictures, exactly as in the file. Copy them, download them for Excel or PDF, or save them in a book. Right-click a row for a reminder or the status of its file."],
  ["clock", "What needs you", "The dates in your documents that need something: renewals, due dates, 'valid until', deadlines. Add them to Google Calendar or Outlook with a click."],
  ["camera", "Scan", "On a phone, take photos of paper; on a computer, choose photos. BindLens straightens the page and makes a PDF in your book."],
  ["print", "Print", "Print opens the document in a new tab of your browser, where you print it with your printer."],
  ["lock", "PIN", "On a shared computer, lock BindLens with a four-digit PIN (Settings). A single book can have the PIN too: right-click the book, Lock it with the PIN."],
  ["read", "Reading mode", "Read opens a calm view with the contents beside the page, the date and the time. Read aloud reads the pages to you."],
  ["star", "Study cards", "Your highlights and notes of a book become cards to review: the words on the front, where they come from on the back."],
  ["type", "Scanned pages", "A scanned PDF has no words, only a picture. In the Pages button, Read the words of this page makes it searchable; then you can also change its words."],
  ["video", "Videos", "Videos play inside the book. In a corner keeps one playing small while you read; you can move it."],
  ["list", "What BindLens changed", "Settings lists every change BindLens made in your Drive: files added, renamed, moved, marks saved."],
  ["drive", "Your Drive", "BindLens has no servers: it reads and saves straight in your Google Drive and sees only the files it made or that you gave it. You can open the same books in the BindLens folder of your Drive."],
  ["book", "Sub-books", "A folder inside a book is a sub-book: its files are part of the book, under its name. Make one with + Sub-book in the Files tab, or add a whole folder from your computer. Right-click a sub-book to open it on its own."],
  ["check", "Status", "Mark a file Pending, Checked, Signed, Done, Urgent or Waiting (right-click it, Status), then show only the files with one status."],
  ["rect", "Hide or erase text", "In the shapes menu: a white box hides the PDF's own text (you can take it off again); Erase the text for good takes private data out of the PDF so nobody can find or copy it."],
  ["grid", "Pages and copies", "Right-click a file: save some pages as a new PDF, split it into single pages, add pages from another PDF, a watermark, make it smaller, a copy with a password or read-only. The book's menu saves the whole book as one PDF."],
  ["clock", "Earlier versions", "Google Drive keeps the versions of a file. Right-click it, Earlier versions: open a copy of one, or go back to it. Pages you take out are kept too (Deleted pages)."],
  ["edit", "Edit a written page", "A page written in BindLens opens in Write again: Pages button, Edit this written page."],
  ["addpage", "Add pages", "Add (top bar) > Pages to this document: blank, lined, squared or dotted paper the size of your page; pages from a file (PDF, photos, Word, Excel, PowerPoint); pages of another document; a written page; a scan. Choose where: after this page, before it, at the start or the end."],
  ["word", "Write it in Google Docs", "In Add pages, Google Docs, Sheets or Slides open in a window beside BindLens. Write, come back, press Add these pages: they go into the PDF where you chose. Later, the page's menu opens it in Google again and brings its pages anew."],
  ["template", "Templates", "Add > New book from a template: an employee or student file, a client, a project, a thesis... with its sub-books and a checklist of the documents it needs."],
  ["checklist", "Checklist", "The Checklist tab of a book: the documents it needs. Tick one and say which document it is; BindLens suggests the document when its name fits."],
  ["task", "Tasks", "Things to do, for you or a colleague, with a date: on Home (Tasks) or about a page (the Pages button). Dated ones come up in What needs you; Send it by email gives it to a colleague."],
  ["comment", "Comments", "The comments icon on the frame: Comment, then click on the page. A note with your name and the date; colleagues reply under it and Resolve ticks it. They are PDF comments, inside the PDF."],
  ["share", "Share a book", "Right-click a book on Home > Share with a colleague: Google Drive shares its folder and sends them an email. They open it with Add > A book shared with me; what one marks, the others see."],
  ["form", "Forms", "A PDF form shows its boxes softly lit: type in them, tick them, choose from a list - on the page itself. A signature box asks for your signature."],
  ["filter", "Find with filters", "Ctrl+K, then the filters under the box: a book, a kind of file, a status, when it changed. With no words, it lists the documents that fit."],
  ["hourglass", "Countdowns", "On Home, What needs you > Count down: the days to an audit, exams, the end of a contract. From What needs you, the hourglass counts down to any date found in your documents."],
  ["wifi", "Offline", "Once opened, BindLens works without a network: the documents you opened are kept in this browser, and what you change goes up to your Drive when the network is back."],
  ["palette", "Your colours", "Settings > Colours: the BindLens colours of the logo, or your institution's colours on the frame, the buttons and the reports."],
  ["file", "Files it shows", "PDF, Word, Excel, PowerPoint, OpenDocument (.odt .ods .odp), RTF, e-mails (.eml), CSV and text files, photos, videos, music and e-books. Word, Excel and PowerPoint look close to the original; right-click one, Show it as it looks, and Google draws it exactly (old .doc and .ppt files always go that way)."],
];

export function Help() {
  return (
    <Dialog title="How BindLens Web works" icon="help" onClose={close} cls="mid">
      {HELP.map(([icon, t, d]) => (
        <div key={t} class="row" style={{ alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <span style={{ background: "var(--accent-soft)", color: "var(--accent)", borderRadius: 10, padding: 7, display: "flex" }}><Icon n={icon} /></span>
          <div><b>{t}</b><div class="small muted">{d}</div></div>
        </div>
      ))}
      <div class="row wrap" style={{ marginBottom: 8 }}>
        <button class="btn soft small" onClick={() => { panel.value = { type: "welcome" }; }}><Icon n="sparkle" size={16} />Show the tour again</button>
        <button class="btn plain small" onClick={() => { panel.value = { type: "legal" }; }}><Icon n="info" size={16} />Licence, privacy and legal</button>
      </div>
      <p class="small muted">Keys: Ctrl+K find · Ctrl+Z undo · Ctrl+Y redo · Ctrl+R reports · Ctrl+P print · ← → pages · V select · P pen · H highlighter · T text · N sticky note · E eraser.</p>
    </Dialog>
  );
}
