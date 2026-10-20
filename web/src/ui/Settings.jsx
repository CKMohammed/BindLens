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
import { _t, loc, lang, LANGS, setLang } from "../i18n.js";

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

// the institution's logo: made small (for the reports), and its two main colours proposed
async function readLogo(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 360 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext("2d");
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  // the colours that are neither white, black nor grey, counted in buckets
  const count = new Map();
  for (let i = 0; i < px.length; i += 16) {
    const [r, gr, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
    if (a < 200) continue;
    const mx = Math.max(r, gr, b), mn = Math.min(r, gr, b);
    if (mx - mn < 28 || mx < 30 || mn > 235) continue;
    const key = (r >> 4) << 8 | (gr >> 4) << 4 | (b >> 4);
    const e = count.get(key) || [0, 0, 0, 0];
    e[0] += r; e[1] += gr; e[2] += b; e[3]++;
    count.set(key, e);
  }
  const hex = (e) => "#" + [e[0], e[1], e[2]].map(v => Math.round(v / e[3]).toString(16).padStart(2, "0")).join("");
  const top = [...count.values()].sort((a, b) => b[3] - a[3]);
  const c1 = top[0] ? hex(top[0]) : null;
  // the second: the most common one that is clearly different from the first
  const far = (e) => { const [r, g2, b] = [e[0] / e[3], e[1] / e[3], e[2] / e[3]]; const h = parseInt(c1.slice(1), 16); return Math.abs(r - (h >> 16)) + Math.abs(g2 - ((h >> 8) & 255)) + Math.abs(b - (h & 255)) > 120; };
  const c2e = c1 ? top.find(far) : null;
  return { logo: c.toDataURL("image/png"), c1, c2: c2e ? hex(c2e) : null };
}

// Colours: the BindLens colours of the logo, or the institution's - on the frame, the buttons and the reports
function Colours() {
  const b = settings.value.brand || {};
  const set = (ch) => setSetting("brand", { ...b, ...ch });
  const br = brandOf(settings.value);
  return (
    <>
      <h3 style={{ margin: "4px 0 8px", font: "700 16px var(--f-display)" }}>{_t("Colours")}</h3>
      <div class="grid2">
        <button class={"cardopt brandopt" + (!b.on ? " on" : "")} onClick={() => set({ on: false })}>
          <span class="bo-sw">{["#111218", "#FF85C2", "#FFC83D"].map(c => <i key={c} style={{ background: c }} />)}</span>
          <span><b>{_t("BindLens")}</b><small>{_t("The colours of the logo: ink, pink and gold")}</small></span>
        </button>
        <button class={"cardopt brandopt" + (b.on ? " on" : "")} onClick={() => set({ on: true, c1: b.c1 || "#00573F", c2: b.c2 || "#C9A227" })}>
          <span class="bo-sw">{[b.c1 || "#00573F", b.c2 || "#C9A227"].map((c, i) => <i key={i} style={{ background: c }} />)}</span>
          <span><b>{_t("Your institution's colours")}</b><small>{_t("Your college's or company's colours on the frame, the buttons and the reports")}</small></span>
        </button>
      </div>
      {b.on && <div class="brandform">
        <label class="small">{_t("Its name (at the top of your reports)")}<input class="field" value={b.name || ""} placeholder={_t("e.g. Atlantic Technological University")} onInput={(e) => set({ name: e.target.value.slice(0, 80) })} /></label>
        <div class="row wrap" style={{ gap: 10 }}>
          {b.logo ? <img class="brandlogo" src={b.logo} alt={_t("Logo")} /> : <span class="brandlogo empty"><Icon n="image" size={20} /></span>}
          <button class="btn ghost small" onClick={async () => {
            const { pickFiles } = await import("../actions.js");
            const [f] = await pickFiles({ accept: "image/png,image/jpeg,image/webp,image/svg+xml", multiple: false });
            if (!f) return;
            try {
              const r = await readLogo(f);
              set({ logo: r.logo, ...(r.c1 ? { c1: r.c1 } : {}), ...(r.c2 ? { c2: r.c2 } : {}) });
              toast(r.c1 ? _t("The logo is in, and its colours are proposed below. Change them if you like.") : _t("The logo is in. Choose its colours below."), "ok", 5000);
            } catch (e) { toast(_t("BindLens could not read that picture."), "bad"); }
          }}><Icon n="upload" size={15} />{b.logo ? _t("Another logo...") : _t("Its logo... (BindLens proposes its colours)")}</button>
          {b.logo && <button class="btn plain small" onClick={() => set({ logo: "" })}>{_t("Take the logo off")}</button>}
        </div>
        <div class="row wrap" style={{ gap: 16 }}>
          <label class="row small">{_t("Main colour")} <input type="color" value={b.c1 || "#00573F"} onInput={(e) => set({ c1: e.target.value })} /></label>
          <label class="row small">{_t("Second colour")} <input type="color" value={b.c2 || "#C9A227"} onInput={(e) => set({ c2: e.target.value })} /></label>
          {br && br.accent.toLowerCase() !== (b.c1 || "").toLowerCase() && <span class="tiny muted">{_t("Buttons and words use it a little darker, so they read well:")} <i class="bo-dot" style={{ background: br.accent }} /></span>}
        </div>
        <div class="row wrap" style={{ gap: 18 }}>
          <label class="chk small"><input type="checkbox" checked={b.frame !== false} onChange={(e) => set({ frame: e.target.checked })} />{_t("The frame")}</label>
          <label class="chk small"><input type="checkbox" checked={b.ui !== false} onChange={(e) => set({ ui: e.target.checked })} />{_t("Buttons and highlights")}</label>
          <label class="chk small"><input type="checkbox" checked={b.reports !== false} onChange={(e) => set({ reports: e.target.checked })} />{_t("Reports (PDF): its name and colours at the top")}</label>
        </div>
      </div>}
    </>
  );
}

// four groups, one place for each thing
const GROUPS = [["look", () => _t("Look"), "palette"], ["inst", () => _t("Your institution"), "book"], ["privacy", () => _t("Privacy and PIN"), "lock"], ["account", () => _t("Account"), "settings"]];

export function Settings() {
  const f = settings.value.frame || {};
  const colors = f.colors && f.colors.length ? f.colors : DEFAULT_FRAME;
  const brandFrame = !!brandOf(settings.value) && settings.value.brand.frame !== false;
  // choosing the frame's own colours takes the institution's off the frame (they stay on the buttons and reports)
  const setFrame = (change) => { if (brandFrame && change.colors) setSetting("brand", { ...settings.value.brand, frame: false }); setSetting("frame", { ...f, colors, ...change }); };
  const s = store.value;
  const [g, setG] = useState(panel.value?.group || "look");
  return (
    <Dialog title={_t("Settings")} icon="settings" onClose={close} cls="mid">
      <div class="seg setgroups" role="tablist">
        {GROUPS.map(([k, l, ic]) => <button key={k} role="tab" aria-selected={g === k} class={g === k ? "on" : ""} onClick={() => setG(k)}><Icon n={ic} size={14} />{l()}</button>)}
      </div>
      {g === "look" && <>
      <h3 style={{ margin: "4px 0 8px", font: "700 16px var(--f-display)" }}>{_t("The frame round the window")}</h3>
      <p class="small muted" style={{ marginTop: 0 }}>{brandOf(settings.value) && settings.value.brand.frame !== false ? _t("The frame has your institution's colours now (above). Choose other colours for it here, or untick \"The frame\" above.") : _t("The colours that flow round the window.")}</p>
      <div class="grid2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
        {PRESETS.map(p => {
          const on = !brandFrame && JSON.stringify(p.colors) === JSON.stringify(colors);
          return (
            <button key={p.name} class={"cardopt" + (on ? " on" : "")} onClick={() => setFrame({ colors: p.colors })} style={{ flexDirection: "column", gap: 8 }}>
              <span style={{ height: 22, width: "100%", borderRadius: 8, background: `linear-gradient(90deg, ${p.colors.join(",")})` }} />
              <b>{_t(p.name)}</b>
            </button>
          );
        })}
      </div>
      <div class="row wrap" style={{ marginTop: 14, gap: 12 }}>
        <span class="small muted">{_t("Your own colours:")}</span>
        {colors.map((c, i) => (
          <input key={i} type="color" value={c} title={_t("Colour {0}", i + 1)} style={{ width: 38, height: 32, border: 0, background: "none", padding: 0 }}
            onInput={(e) => { const n = [...colors]; n[i] = e.target.value; setFrame({ colors: n }); }} />
        ))}
      </div>
      <div class="row wrap" style={{ marginTop: 12, gap: 18 }}>
        <label class="chk"><input type="checkbox" checked={!!f.still} onChange={(e) => setFrame({ still: e.target.checked })} />{_t("Keep the colours still")}</label>
        <label class="row small">{_t("Speed")}
          <input type="range" min="6" max="60" value={66 - (f.speed || 22)} onInput={(e) => setFrame({ speed: 66 - Number(e.target.value) })} />
        </label>
        <button class="btn plain small" onClick={() => { setSetting("frame", {}); }}>{_t("Back to the BindLens colours")}</button>
      </div>

      <h3 style={{ margin: "22px 0 8px", font: "700 16px var(--f-display)" }}>{_t("View")}</h3>
      <div class="row wrap" style={{ gap: 12, marginBottom: 10 }}>
        <span class="small muted">{_t("Language")}</span>
        <div class="seg">
          {LANGS.map(([k, l]) => <button key={k} class={lang === k ? "on" : ""} onClick={() => setLang(k)}>{l}</button>)}
        </div>
        <span class="tiny muted">{_t("BindLens starts again in the language you choose. Your documents do not change.")}</span>
      </div>
      <div class="row wrap" style={{ gap: 12, marginBottom: 10 }}>
        <span class="small muted">{_t("Light or dark")}</span>
        <div class="seg">
          {[["light", _t("Light"), "sun"], ["dark", _t("Dark"), "moon"], ["auto", _t("As the computer"), "settings"]].map(([k, l, ic]) => (
            <button key={k} class={(settings.value.theme || "light") === k ? "on" : ""} onClick={() => setSetting("theme", k)}><Icon n={ic} size={14} />{l}</button>
          ))}
        </div>
        <span class="tiny muted">{_t("The pages stay as paper; Night pages (Read) darkens them too.")}</span>
      </div>
      <div class="row wrap" style={{ gap: 18, marginBottom: 10 }}>
        <label class="chk"><input type="checkbox" checked={!!settings.value.fast} onChange={(e) => setSetting("fast", e.target.checked)} />{_t("Fast: nothing moves (no animations, the frame still)")}</label>
        <label class="chk"><input type="checkbox" checked={!!settings.value.ribbonNames} onChange={(e) => setSetting("ribbonNames", e.target.checked)} />{_t("Show the names under the tools")}</label>
      </div>
      <div class="row wrap" style={{ gap: 18 }}>
        <label class="chk"><input type="checkbox" checked={!settings.value.hideRail} onChange={(e) => setSetting("hideRail", !e.target.checked)} />{_t("The small icons on the frame (the tools to mark, Reports, Scan...). Off: the tools go back to the top bar")}</label>
        {installPrompt.value && <button class="btn soft small" onClick={installApp}><Icon n="download" size={16} />{_t("Install BindLens as an app")}</button>}
      </div>
      </>}
      {g === "inst" && <Colours />}
      {g === "privacy" && <>
      <h3 style={{ margin: "4px 0 8px", font: "700 16px var(--f-display)" }}>{_t("Notifications and offline")}</h3>
      <label class="chk small"><input type="checkbox" checked={!!settings.value.notify} onChange={async (e) => {
        const n = await import("../notify.js");
        if (e.target.checked) { if (await n.turnOn()) { setSetting("notify", true); setTimeout(() => { n.startNotifications(); n.checkNow(); }, 300); toast(_t("BindLens tells you what needs you today and tomorrow."), "ok"); } }
        else setSetting("notify", false);
      }} />{_t("Tell me what needs me today and tomorrow (a notification on this computer or phone, while BindLens is open or installed as an app)")}</label>
      <p class="small muted" style={{ margin: "8px 0 0" }}>{_t("BindLens works without a network too, once it has been opened here: the documents you opened are kept in this browser, and what you change offline goes up to your")} {s.cloud || _t("Drive")} {_t("when the network is back.")}</p>

      <h3 style={{ margin: "22px 0 8px", font: "700 16px var(--f-display)" }}>{_t("PIN")}</h3>
      <div class="row wrap">
        <span class="grow small muted">{settings.value.pin ? _t("BindLens asks for your PIN when it opens.") : _t("Lock BindLens with a four-digit PIN on a shared computer.")}</span>
        <button class="btn soft small" onClick={() => { panel.value = { type: "pin" }; }}><Icon n="lock" size={16} />{settings.value.pin ? _t("Change the PIN") : _t("Choose a PIN")}</button>
        {settings.value.pin && <button class="btn plain small" onClick={() => { setSetting("pin", null); toast(_t("The PIN is off.")); }}>{_t("Take the PIN off")}</button>}
      </div>

      <h3 style={{ margin: "22px 0 8px", font: "700 16px var(--f-display)" }}>{_t("Consultation mode")}</h3>
      <div class="row wrap">
        <span class="grow small muted">{_t("This computer only for reading and searching (a reception desk, a library, a meeting room). A code starts it and the same code leaves it.")}</span>
        <button class="btn soft small" onClick={() => { panel.value = { type: "consult" }; }}><Icon n="read" size={16} />{_t("Start consultation mode")}</button>
      </div>

      <h3 style={{ margin: "22px 0 8px", font: "700 16px var(--f-display)" }}>{_t("What BindLens changed")}</h3>
      {!(settings.value.log || []).length ? <p class="small muted" style={{ margin: 0 }}>{_t("Nothing yet. Every change BindLens makes in your Drive (files added, renamed, moved, marks saved) is written down here.")}</p> : (
        <div class="rep-out" style={{ maxHeight: 220 }}>
          <table class="rows">
            <tbody>{(settings.value.log || []).slice(0, 120).map((l, i) => (
              <tr key={i}><td class="small" style={{ whiteSpace: "nowrap" }}>{new Date(l.at).toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                <td class="small"><b>{l.what}</b> {l.name}{l.book ? <span class="muted"> · {l.book}</span> : ""}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      </>}
      {g === "account" && <>
      <h3 style={{ margin: "4px 0 8px", font: "700 16px var(--f-display)" }}>{_t("Account")}</h3>
      {s.cloud ? <>
        <p class="small" style={{ margin: "0 0 8px" }}>{s.kind === "onedrive" ? _t("Signed in as {0}. Your books are in the {1} folder of your OneDrive.", <b>{s.user?.email}</b>, <b>Apps/BindLens</b>) : _t("Signed in as {0}. Your books are in the {1} folder of your Google Drive.", <b>{s.user?.email}</b>, <b>BindLens</b>)}</p>
        <div class="row wrap">
          <a class="btn soft small" href={s.folderLink()} target="_blank" rel="noopener"><Icon n="drive" size={16} />{_t("Open the folder in")} {s.kind === "onedrive" ? _t("OneDrive") : _t("Drive")}</a>
          <button class="btn plain small" onClick={async () => { await idb.clear("files"); await idb.clear("text"); toast(_t("The copies kept in this browser are gone. Your {0} is unchanged.", s.cloud)); }}>{_t("Clear the copies in this browser")}</button>
          <button class="btn plain small" onClick={signOut}><Icon n="logout" size={16} />{_t("Sign out")}</button>
        </div>
      </> : <p class="small">{_t("This is the example library: what you change here is not saved.")} <a href="#" onClick={(e) => { e.preventDefault(); signOut(); }}>{_t("Sign in with Google")}</a> {_t("to keep your own books.")}</p>}

      <Doing />

      <h3 style={{ margin: "22px 0 8px", font: "700 16px var(--f-display)" }}>{_t("About")}</h3>
      <p class="small muted" style={{ margin: 0 }}>{_t("BindLens Web 1.0 · made by Mohammed Chahboune Kadi. Free software under the GNU AGPL 3.0: the source is at")} <a href="https://github.com/CKMohammed/BindLens" target="_blank" rel="noopener">{_t("github.com/CKMohammed/BindLens")}</a>{_t(". Pages are drawn with MuPDF (Artifex, AGPL).")}</p>
      <div class="row wrap" style={{ marginTop: 8 }}>
        <button class="btn plain small" onClick={() => { panel.value = { type: "legal" }; }}><Icon n="info" size={16} />{_t("Licence, privacy and legal")}</button>
        <button class="btn plain small" onClick={() => { panel.value = { type: "welcome" }; }}><Icon n="sparkle" size={16} />{_t("Show the tour again")}</button>
      </div>
      </>}
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
      <b>{_t("What BindLens is doing:")} </b>
      {indexed.running ? _t("reading the words of your library, so Find and Reports are quick ({0} of {1} files)", indexed.n, indexed.of) : _t("nothing in the background now")}
      {sv.n ? _t(" · saving {0} document{1}", sv.n, sv.n === 1 ? "" : "s") : sv.last ? _t(" · everything is saved ({0})", new Date(sv.last).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })) : ""}.
    </p>
  );
}

export function Pin() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const ok = /^\d{4}$/.test(a) && a === b;
  const save = async () => {
    setSetting("pin", await pinHash(a));
    toast(_t("Your PIN is set. BindLens asks for it every time it opens."), "ok", 4500);
    close();
  };
  return (
    <Dialog title={settings.value.pin ? _t("Change the PIN") : _t("Choose a PIN")} icon="lock" onClose={close}
      foot={<>
        {settings.value.pin && <button class="btn plain" onClick={() => { close(); locked.value = true; }}>{_t("Lock now")}</button>}
        <span class="grow" />
        <button class="btn plain" onClick={close}>{_t("Cancel")}</button>
        <button class="btn" disabled={!ok} onClick={save}>{_t("Save the PIN")}</button>
      </>}>
      <p class="small muted" style={{ marginTop: 0 }}>{_t("Four digits. If you forget it, you take it off by signing in with Google again.")}</p>
      <div class="grid2">
        <label class="small">{_t("PIN")}<input class="field" inputMode="numeric" maxLength={4} type="password" value={a} onInput={(e) => setA(e.target.value.replace(/\D/g, ""))} /></label>
        <label class="small">{_t("The PIN again")}<input class="field" inputMode="numeric" maxLength={4} type="password" value={b} onInput={(e) => setB(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter" && ok) save(); }} /></label>
      </div>
      {b.length === 4 && a !== b && <p class="small" style={{ color: "var(--bad)" }}>{_t("The two PINs are not the same.")}</p>}
    </Dialog>
  );
}

const HELP = [
  ["book", _t("Books"), _t("A book is a folder in your Google Drive, inside the BindLens folder. Every PDF, Word file, spreadsheet, photo and video in it is one book you scroll through. Make one with + on Home or in the Library.")],
  ["upload", _t("Add files"), _t("Drag files onto the window, or use Add files. From the Library you can also add files that are already in your Drive (From my Drive).")],
  ["highlighter", _t("Mark"), _t("Choose a tool on the frame at the right of the window (on a phone: the tool button at the top): the highlighter, the pen, text, a sticky note, shapes, a tick or a cross, stamps and your signature. Your marks are saved inside the PDF in your Drive, so any PDF program shows them. Ctrl+Z undoes.")],
  ["select", _t("Change a mark"), _t("With the arrow, click a mark to choose it: drag it, give it another colour or take it off (Delete). Double-click a text or a sticky note to change its words.")],
  ["edit", _t("Change the text"), _t("The pencil with a line changes the words of the PDF itself, in the same size and a similar font. Click a line, type, press Enter.")],
  ["search", _t("Find"), _t("Ctrl+K finds a book, a document, a word inside any document, or something to do. The Search tab in the Library finds a word in this book and shows every place.")],
  ["reports", _t("Reports"), _t("Reports take out the rows as they are: names, emails, phones, addresses, dates, amounts, and every table with its columns. Rows with a name or value gives every row that has it, with its own columns; Rows as they look shows them as pictures, exactly as in the file. Copy them, download them for Excel or PDF, or save them in a book. Right-click a row for a reminder or the status of its file.")],
  ["clock", _t("What needs you"), _t("The dates in your documents that need something: renewals, due dates, 'valid until', deadlines. Add them to Google Calendar or Outlook with a click.")],
  ["camera", _t("Scan"), _t("On a phone, take photos of paper; on a computer, choose photos. BindLens straightens the page and makes a PDF in your book.")],
  ["print", _t("Print"), _t("Print opens the document in a new tab of your browser, where you print it with your printer.")],
  ["lock", _t("PIN"), _t("On a shared computer, lock BindLens with a four-digit PIN (Settings). A single book can have the PIN too: right-click the book, Lock it with the PIN.")],
  ["read", _t("Reading mode"), _t("Read opens a calm view with the contents beside the page, the date and the time. Read aloud reads the pages to you.")],
  ["star", _t("Study cards"), _t("Your highlights and notes of a book become cards to review: the words on the front, where they come from on the back.")],
  ["type", _t("Scanned pages"), _t("A scanned PDF has no words, only a picture. In the Pages button, Read the words of this page makes it searchable; then you can also change its words.")],
  ["video", _t("Videos"), _t("Videos play inside the book. In a corner keeps one playing small while you read; you can move it.")],
  ["list", _t("What BindLens changed"), _t("Settings lists every change BindLens made in your Drive: files added, renamed, moved, marks saved.")],
  ["drive", _t("Your Drive"), _t("BindLens has no servers: it reads and saves straight in your Google Drive and sees only the files it made or that you gave it. You can open the same books in the BindLens folder of your Drive.")],
  ["book", _t("Sub-books"), _t("A folder inside a book is a sub-book: its files are part of the book, under its name. Make one with + Sub-book in the Files tab, or add a whole folder from your computer. Right-click a sub-book to open it on its own.")],
  ["check", _t("Status"), _t("Mark a file Pending, Checked, Signed, Done, Urgent or Waiting (right-click it, Status), then show only the files with one status.")],
  ["rect", _t("Hide or erase text"), _t("In the shapes menu: a white box hides the PDF's own text (you can take it off again); Erase the text for good takes private data out of the PDF so nobody can find or copy it.")],
  ["grid", _t("Pages and copies"), _t("Right-click a file: save some pages as a new PDF, split it into single pages, add pages from another PDF, a watermark, make it smaller, a copy with a password or read-only. The book's menu saves the whole book as one PDF.")],
  ["clock", _t("Earlier versions"), _t("Google Drive keeps the versions of a file. Right-click it, Earlier versions: open a copy of one, or go back to it. Pages you take out are kept too (Deleted pages).")],
  ["edit", _t("Edit a written page"), _t("A page written in BindLens opens in Write again: Pages button, Edit this written page.")],
  ["addpage", _t("Add pages"), _t("Add (top bar) > Pages to this document: blank, lined, squared or dotted paper the size of your page; pages from a file (PDF, photos, Word, Excel, PowerPoint); pages of another document; a written page; a scan. Choose where: after this page, before it, at the start or the end.")],
  ["word", _t("Write it in Google Docs"), _t("In Add pages, Google Docs, Sheets or Slides open in a window beside BindLens. Write, come back, press Add these pages: they go into the PDF where you chose. Later, the page's menu opens it in Google again and brings its pages anew.")],
  ["template", _t("Templates"), _t("Add > New book from a template: an employee or student file, a client, a project, a thesis... with its sub-books and a checklist of the documents it needs.")],
  ["checklist", _t("Checklist"), _t("The Checklist tab of a book: the documents it needs. Tick one and say which document it is; BindLens suggests the document when its name fits.")],
  ["task", _t("Tasks"), _t("Things to do, for you or a colleague, with a date: on Home (Tasks) or about a page (the Pages button). Dated ones come up in What needs you; Send it by email gives it to a colleague.")],
  ["comment", _t("Comments"), _t("The comments icon on the frame: Comment, then click on the page. A note with your name and the date; colleagues reply under it and Resolve ticks it. They are PDF comments, inside the PDF.")],
  ["share", _t("Share a book"), _t("Right-click a book on Home > Share with a colleague: Google Drive shares its folder and sends them an email. They open it with Add > A book shared with me; what one marks, the others see.")],
  ["form", _t("Forms"), _t("A PDF form shows its boxes softly lit: type in them, tick them, choose from a list - on the page itself. A signature box asks for your signature.")],
  ["filter", _t("Find with filters"), _t("Ctrl+K, then the filters under the box: a book, a kind of file, a status, when it changed. With no words, it lists the documents that fit.")],
  ["hourglass", _t("Countdowns"), _t("On Home, What needs you > Count down: the days to an audit, exams, the end of a contract. From What needs you, the hourglass counts down to any date found in your documents.")],
  ["wifi", _t("Offline"), _t("Once opened, BindLens works without a network: the documents you opened are kept in this browser, and what you change goes up to your Drive when the network is back.")],
  ["palette", _t("Your colours"), _t("Settings > Colours: the BindLens colours of the logo, or your institution's colours on the frame, the buttons and the reports.")],
  ["file", _t("Files it shows"), _t("PDF, Word, Excel, PowerPoint, OpenDocument (.odt .ods .odp), RTF, e-mails (.eml), CSV and text files, photos, videos, music and e-books. Word, Excel and PowerPoint look close to the original; right-click one, Show it as it looks, and Google draws it exactly (old .doc and .ppt files always go that way).")],
];

export function Help() {
  return (
    <Dialog title={_t("How BindLens Web works")} icon="help" onClose={close} cls="mid">
      {HELP.map(([icon, t, d]) => (
        <div key={t} class="row" style={{ alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <span style={{ background: "var(--accent-soft)", color: "var(--accent)", borderRadius: 10, padding: 7, display: "flex" }}><Icon n={icon} /></span>
          <div><b>{t}</b><div class="small muted">{d}</div></div>
        </div>
      ))}
      <div class="row wrap" style={{ marginBottom: 8 }}>
        <button class="btn soft small" onClick={() => { panel.value = { type: "welcome" }; }}><Icon n="sparkle" size={16} />{_t("Show the tour again")}</button>
        <button class="btn plain small" onClick={() => { panel.value = { type: "legal" }; }}><Icon n="info" size={16} />{_t("Licence, privacy and legal")}</button>
      </div>
      <p class="small muted">{_t("Keys: Ctrl+K find · Ctrl+Z undo · Ctrl+Y redo · Ctrl+R reports · Ctrl+P print · ← → pages · V select · P pen · H highlighter · T text · N sticky note · E eraser.")}</p>
    </Dialog>
  );
}
