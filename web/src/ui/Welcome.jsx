// The first time: a short tour of BindLens Web. And the licence, privacy and legal page.
import { useState } from "preact/hooks";
import { panel, setSetting, store } from "../state.js";
import { Dialog } from "./dialogs.jsx";
import { Icon } from "./icons.jsx";
import { _t } from "../i18n.js";

const close = () => { panel.value = null; };

const STEPS = [
  { icon: "book", title: _t("Your folders are books"), text: _t("Each book is a folder in the BindLens folder of your Google Drive. Every PDF, Word file, spreadsheet, photo and video in it is one book you scroll through, page after page. Folders inside a book are its sub-books.") },
  { icon: "highlighter", title: _t("Mark anything"), text: _t("Highlight, write, draw, add sticky notes, ticks, stamps and your signature. Change the PDF's own words, hide or erase private data, crop pages. The marks are saved inside the PDF in your Drive.") },
  { icon: "search", title: _t("Find it at once"), text: _t("Ctrl+K finds a book, a document or a word inside any of your documents, scanned ones too once their words are read.") },
  { icon: "reports", title: _t("Reports, row by row"), text: _t("Names, emails, phones, addresses, dates, amounts and tables come out exactly as they are written in your documents: copy them, or take them to Excel.") },
  { icon: "clock", title: _t("What needs you"), text: _t("The renewals, due dates and deadlines written in your documents, with your own reminders and calendars, in one list and a calendar.") },
  { icon: "drive", title: _t("Only your Drive"), text: _t("BindLens Web has no servers: it reads and saves straight in your Google Drive, and sees only the files it made or that you gave it. Nothing else of your Drive.") },
];

export function Welcome() {
  const [i, setI] = useState(0);
  const done = () => { setSetting("welcomed", true); try { localStorage.setItem("bl-welcomed", "1"); } catch (e) {} close(); };
  const st = STEPS[i];
  return (
    <Dialog title={_t("Welcome to BindLens")} icon="sparkle" onClose={done} cls="mid"
      foot={<>
        <span class="grow tiny muted">{i + 1} {_t("of")} {STEPS.length}</span>
        {i > 0 && <button class="btn plain" onClick={() => setI(i - 1)}>{_t("Back")}</button>}
        {i < STEPS.length - 1 ? <button class="btn" onClick={() => setI(i + 1)}>{_t("Next")}</button> : <button class="btn" onClick={done}>{_t("Start")}</button>}
      </>}>
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", minHeight: 150 }}>
        <span style={{ background: "var(--accent-soft)", color: "var(--accent)", borderRadius: 18, padding: 16, display: "flex", flex: "none" }}><Icon n={st.icon} size={34} /></span>
        <div>
          <h3 style={{ margin: "2px 0 8px", font: "700 20px var(--f-display)" }}>{st.title}</h3>
          <p style={{ margin: 0, lineHeight: 1.55 }}>{st.text}</p>
        </div>
      </div>
      <div class="row" style={{ justifyContent: "center", gap: 6, marginTop: 10 }}>
        {STEPS.map((_, k) => <button key={k} onClick={() => setI(k)} aria-label={_t("Step {0}", k + 1)} style={{ width: k === i ? 22 : 8, height: 8, borderRadius: 4, border: 0, background: k === i ? "var(--accent)" : "var(--line)", transition: "width .2s" }} />)}
      </div>
    </Dialog>
  );
}

export function shouldWelcome(settings) {
  if (settings.welcomed) return false;
  try { if (store.value?.kind === "demo" && localStorage.getItem("bl-welcomed")) return false; } catch (e) {}
  return true;
}

export function Legal() {
  return (
    <Dialog title={_t("Licence, privacy and legal")} icon="info" onClose={close} cls="mid">
      <h3 style={{ margin: "0 0 6px" }}>{_t("Licence")}</h3>
      <p class="small">{_t("BindLens is free software, made by Mohammed Chahboune Kadi, under the GNU Affero General Public License 3.0 (AGPL). You may use it, study it, change it and share it under that licence. The full source code of BindLens Web and of the Windows app is at")} <a href="https://github.com/CKMohammed/BindLens" target="_blank" rel="noopener">{_t("github.com/CKMohammed/BindLens")}</a>.</p>
      <p class="small">{_t("BindLens Web is built with MuPDF (Artifex Software, AGPL), Preact (MIT), SheetJS (Apache 2.0), ExcelJS (MIT), mammoth (BSD), JSZip (MIT) and Tesseract.js (Apache 2.0).")}</p>
      <h3 style={{ margin: "16px 0 6px" }}>{_t("Privacy")}</h3>
      <ul class="small" style={{ paddingLeft: 18, lineHeight: 1.55 }}>
        <li>{_t("BindLens Web has")} <b>{_t("no servers and no accounts of its own")}</b>{_t(". The app runs in your browser; you sign in with Google.")}</li>
        <li>{_t("It asks Google for one permission,")} <b>{_t("drive.file")}</b>{_t(": it can see and change only the files and folders it made (the BindLens folder and what is in it) or that you give it yourself. It cannot see the rest of your Drive.")}</li>
        <li>{_t("Your books, files and marks are saved in")} <b>{_t("your")}</b> {_t("Google Drive. The settings of your library (book colours, where you left off, reminders, statuses) are in the file \"BindLens library.json\" in the BindLens folder.")}</li>
        <li>{_t("To open books fast, this browser keeps copies of your files and of the words read from them. Settings, Clear the copies in this browser, takes them away; your Drive is not changed.")}</li>
        <li>{_t("Nobody else gets your documents: they go from your Drive to your browser and back. There is no tracking and no advertising.")}</li>
        <li>{_t("Reading the words of a scanned page downloads the reading engine (Tesseract) from a public network of files (jsDelivr) the first time. Add to Google Calendar opens Google Calendar with the date filled in.")}</li>
        <li>{_t("You can take BindLens's access away at any time in your Google Account, under Security, Third-party access.")}</li>
      </ul>
      <h3 style={{ margin: "16px 0 6px" }}>{_t("No warranty")}</h3>
      <p class="small">{_t("BindLens is given as it is, without any warranty, as the AGPL says. Keep copies of the documents that matter: Google Drive also keeps earlier versions of your files for about 30 days.")}</p>
      <p class="small" style={{ marginBottom: 0 }}><a href={import.meta.env.BASE_URL + "privacy.html"} target="_blank" rel="noopener">{_t("Privacy (full page)")}</a> · <a href={import.meta.env.BASE_URL + "terms.html"} target="_blank" rel="noopener">{_t("Terms of use")}</a></p>
    </Dialog>
  );
}
