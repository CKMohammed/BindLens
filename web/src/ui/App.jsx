import { useEffect } from "preact/hooks";
import { batch } from "@preact/signals";
import "../theme.js";
import { store, phase, errorText, settings, view, panel, toasts, locked, needsTap, reloadLibrary, toast, tool, fileId,
  currentBook, readMode, offline, narrow, saving, framePulse } from "../state.js";
import { DriveStore, loadGoogle } from "../store/drive.js";
import { DemoStore } from "../store/demo.js";
import { OneDriveStore, MS_CLIENT_ID } from "../store/onedrive.js";
import { Modals, Menu } from "./dialogs.jsx";
import { Home } from "./Home.jsx";
import { BookView } from "./BookView.jsx";
import { Panels } from "./Panels.jsx";
import { Lock } from "./Lock.jsx";
import { undo, redo, saveAll } from "../docs.js";
import { openPanel } from "../actions.js";
import { engineStarted } from "../engine/client.js";
import { Icon } from "./icons.jsx";
import { Pip } from "./Gallery.jsx";
import { FrameBar, frameBarOn } from "./FrameBar.jsx";
import { Band } from "./Band.jsx";
import { UploadPanel } from "./Uploads.jsx";
import { Logo } from "./Logo.jsx";
import { mix, brandOf } from "../util.js";
import { _t, _n, lang, LANGS, setLang } from "../i18n.js";

export const DEFAULT_FRAME = ["#111218", "#FF85C2", "#FFC83D", "#FF85C2", "#111218"];   // 1.0 calm: the logo's colours (ink, pink, gold)
export const AURORA_FRAME = ["#5B4FD6", "#8E5CC8", "#C2679F", "#D49A4A"];

function frameVars() {
  // the frame's colours, and the same colours very soft for the lava backgrounds (Home, sign-in, reading mode)
  const f = settings.value.frame || {};
  const br = brandOf(settings.value);
  const c = br && br.frame !== false ? br.frameColors : f.colors && f.colors.length >= 2 ? f.colors : DEFAULT_FRAME;
  const style = {};
  // the institution's colours on the buttons and highlights
  if (br && br.ui !== false) Object.assign(style, { "--accent": br.accent, "--accent2": mix(br.accent, "#FFFFFF", 0.2), "--accent-soft": br.soft, "--btn": br.btn, "--btn-hover": mix(br.btn, "#FFFFFF", 0.12) });
  for (let i = 0; i < 5; i++) {
    style["--c" + (i + 1)] = c[i % c.length];
    style["--l" + (i + 1)] = mix(c[i % c.length], "#FFFFFF", 0.74);
  }
  style["--speed"] = (f.speed || 60) + "s";
  // the bar of the browser on a phone (and of the installed app) in the frame's colour
  try { const m = document.querySelector('meta[name="theme-color"]'); if (m && m.content !== c[0]) m.content = c[0]; } catch (e) {}
  return style;
}

function Frame() {
  const f = settings.value.frame || {};
  return (
    <div class={"frame" + (f.still ? " still" : "")}>
      <div class="lava" /><div class="lava b" />
    </div>
  );
}

async function startWith(s, { tour = true } = {}) {
  phase.value = "loading";
  try {
    // no network: open the library this browser kept the last time (what you change goes up later)
    if (s.cloud && navigator.onLine === false && s.canStartOffline && s.canStartOffline()) {
      s.startOffline();
      offline.value = { on: true, waiting: s.waiting().length };
    } else {
      if (s.cloud) await s.signIn(false);
      await s.init();
    }
    if (s.queue) s.onQueue = (n) => { offline.value = { on: s.offline || navigator.onLine === false, waiting: n }; };
    store.value = s;
    settings.value = (await s.loadSettings()) || {};
    await reloadLibrary();
    batch(() => {
      if (settings.value.pin) locked.value = true;
      view.value = "home";
      phase.value = "ready";
    });
    import("../notify.js").then(n => n.startNotifications()).catch(() => {});
    if (s.cloud && s.waiting && s.waiting().length && !s.offline) backOnline(s);
    if (tour) {
      const { shouldWelcome } = await import("./Welcome.jsx");
      if (shouldWelcome(settings.value)) panel.value = { type: "welcome" };
    }
    if (s.cloud) {
      s.onNeedSignIn = () => new Promise((resolve) => {
        needsTap.value = async () => {
          try { await s.signIn(true); needsTap.value = null; resolve(); }
          catch (e) { toast(_t("Sign-in did not finish: ") + e.message, "bad"); }
        };
      });
    }
  } catch (e) {
    console.error(e);
    batch(() => { errorText.value = String(e.message || e); phase.value = "start"; });
  }
}

// the network is back: sign in again with a click, then what waited goes up to the Drive
async function backOnline(s) {
  const go = async () => {
    try {
      if (!s.token || Date.now() > s.expires || s.offline) { s.offline = false; await s.signIn(true); if (!s.settingsId) await s.init(); }
      needsTap.value = null;
      const n = await s.flush();
      offline.value = { on: false, waiting: 0 };
      await reloadLibrary();
      toast(n ? _t("Back online: {0} document{1} saved in your Drive.", n, n === 1 ? "" : "s") : _t("Back online."), "ok");
    } catch (e) { toast(_t("Not yet: ") + e.message, "bad"); }
  };
  if (s.token && Date.now() < s.expires && !s.offline) { go(); return; }
  go.title = _t("Back online"); go.text = s.waiting().length ? _n(s.waiting().length, "{0} document changed offline waits to go up to your Drive. Click to sign in again and save.", "{0} documents changed offline wait to go up to your Drive. Click to sign in again and save.") : _t("Click to sign in again with Google and go on.");
  go.ok = _t("Save to my Drive");
  needsTap.value = go;
}
if (typeof window !== "undefined") {
  window.addEventListener("online", () => { const s = store.value; if (s && s.cloud && (s.offline || (s.waiting && s.waiting().length))) backOnline(s); });
  window.addEventListener("offline", () => { const s = store.value; if (s && s.cloud) { s.offline = true; offline.value = { on: true, waiting: s.waiting ? s.waiting().length : 0 }; } });
}

// the Microsoft logo (four squares)
const MS = () => (
  <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><path fill="#F25022" d="M1 1h9v9H1z" /><path fill="#7FBA00" d="M11 1h9v9h-9z" /><path fill="#00A4EF" d="M1 11h9v9H1z" /><path fill="#FFB900" d="M11 11h9v9h-9z" /></svg>
);

const G = () => (
  <svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" /></svg>
);

function Start() {
  const back = (() => { try { return localStorage.getItem("bl_signed_in") === "1" ? localStorage.getItem("bl_email") : null; } catch (e) { return null; } })();
  const backMs = (() => { try { return !!MS_CLIENT_ID && localStorage.getItem("bl_cloud") === "onedrive" && !!back; } catch (e) { return false; } })();
  useEffect(() => { loadGoogle().catch(() => {}); engineStarted().catch(() => {}); }, []);
  const busy = phase.value === "loading";
  const from = (() => { try { return new URLSearchParams(location.search).get("start") || ""; } catch (e) { return ""; } })();   // from bindlens.com
  return (
    <div class="start">
      <div class="card">
        <Logo size={96} />
        <h1>Bind<span>Lens</span> Web</h1>
        <p>{_t("Your documents, bound into books. Read, mark and find anything, from any computer or phone. Everything is saved in your own Google Drive")}{MS_CLIENT_ID ? _t(" or OneDrive") : ""}.</p>
        {busy ? <><div class="spinner" /><p class="small">{_t("Opening your library...")}</p></> : <>
          <button class={"gbtn" + (from === "google" ? " callout" : "")} onClick={() => startWith(backMs ? new OneDriveStore() : new DriveStore())}>
            {backMs ? <MS /> : <G />}{back ? <span>{_t("Continue as")} {back}</span> : <span>{_t("Sign in with Google")}</span>}
          </button>
          {MS_CLIENT_ID && !back && <div style={{ marginTop: 10 }}><button class={"gbtn ms" + (from === "microsoft" ? " callout" : "")} onClick={() => startWith(new OneDriveStore())}><MS /><span>{_t("Sign in with Microsoft (OneDrive)")}</span></button></div>}
          {back && <div style={{ marginTop: 10 }}><button class="btn plain small" onClick={() => { try { localStorage.removeItem("bl_email"); localStorage.removeItem("bl_signed_in"); localStorage.removeItem("bl_cloud"); localStorage.removeItem("bl_ms"); } catch (e) {} location.reload(); }}>{_t("Use another account")}</button></div>}
          <div class="or">{_t("or")}</div>
          <button class="btn ghost" onClick={() => startWith(new DemoStore())}>{_t("Try it with an example library")}</button>
          {errorText.value && <p class="small" style={{ color: "var(--bad)", marginTop: 16 }}>{errorText.value}</p>}
          <p class="fine">{_t("BindLens sees only the files it makes or that you give it, in a folder called")} <b>{_t("BindLens")}</b> {_t("in your Drive")}{MS_CLIENT_ID ? _t(" (in OneDrive: Apps/BindLens)") : ""}{_t(". Nothing goes to our servers: we have none.")} <a href={import.meta.env.BASE_URL + "privacy.html"} target="_blank" rel="noopener">{_t("Privacy")}</a> · <a href={import.meta.env.BASE_URL + "terms.html"} target="_blank" rel="noopener">{_t("Terms")}</a> · <a href="/" target="_blank">{_t("bindlens.com")}</a></p>
          <div class="langpick" role="group" aria-label="Language / Idioma">{LANGS.map(([k, l]) => <button key={k} class={lang === k ? "on" : ""} onClick={() => setLang(k)}>{l}</button>)}</div>
        </>}
      </div>
    </div>
  );
}

function Toasts() {
  return <div class="toasts">{toasts.value.map(t => <div key={t.id} class={"toast " + t.kind}>{t.text}</div>)}</div>;
}

function NeedsTap() {
  const f = needsTap.value;
  if (!f) return null;
  return (
    <div class="scrim">
      <div class="dialog" style={{ width: "min(420px,100%)" }}>
        <div class="dh"><Icon n={f.title ? "wifi" : "lock"} size={22} style={{ color: "var(--accent)" }} /><h2>{f.title || _t("Still there?")}</h2></div>
        <div class="db"><p style={{ margin: 0 }}>{f.text || _t("Google asks BindLens to check it is still you every hour. Click to keep working.")}</p></div>
        <div class="df">{f.title && <button class="btn plain" onClick={() => { needsTap.value = null; }}>{_t("Later")}</button>}<button class="btn" onClick={f}>{f.ok || _t("Keep working")}</button></div>
      </div>
    </div>
  );
}

export function App() {
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.has("demo")) startWith(new DemoStore(), { tour: false });
    const key = (e) => {
      if (phase.value !== "ready" || locked.value) return;
      const mod = e.ctrlKey || e.metaKey;
      const inField = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); openPanel("find"); return; }
      if (inField) return;
      if (mod && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      else if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveAll().then(() => toast(_t("Saved in your Drive."), "ok")); }
      else if (mod && e.key.toLowerCase() === "r") { e.preventDefault(); openPanel("reports"); }
      else if (mod && e.key.toLowerCase() === "p" && view.value === "book") { e.preventDefault(); openPanel("print"); }
      else if (mod && e.key === ",") { e.preventDefault(); openPanel("settings"); }
      else if (e.key === "F1") { e.preventDefault(); openPanel("help"); }
      else if (mod && e.key === "/") { e.preventDefault(); openPanel("keys"); }
      else if (mod && e.key.toLowerCase() === "u" && view.value === "book") { e.preventDefault(); import("./Aloud.jsx").then(a => a.toggleAloud()); }
      else if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); openPanel("study"); }
      else if (e.key === "F6" && view.value === "book") { e.preventDefault(); readMode.value = !readMode.value; }
      else if (e.key === "Escape" && readMode.value && !panel.value) { readMode.value = false; }
      else if (mod && e.key.toLowerCase() === "e" && view.value === "book") { e.preventDefault(); tool.value = "edit"; toast(_t("Click the line of text to change.")); }
      else if (e.key === "F2" && view.value === "book" && !panel.value) {
        e.preventDefault();
        import("../docs.js").then(({ fileFor }) => { const f = fileFor(fileId.value); const b = currentBook.value; if (f && b) import("../actions.js").then(a => a.renameFile(b, f)); });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const ready = phase.value === "ready";
  // with a PIN, nothing of the library is on the screen (or in the page) before the four digits
  const shut = ready && locked.value, open = ready && !locked.value;
  const lava = !ready;                        // 1.0 calm: the soft colours only on the sign-in page
  const still = !!(settings.value.frame || {}).still;
  return (
    <div class={"shell" + (ready && frameBarOn() ? " withbar" : "") + (ready && !narrow.value ? " withtop" : "") + (saving.value.n > 0 ? " saving" : "") + (framePulse.value ? " pulse" : "")} style={frameVars()}>
      <Frame />
      <div class="titlebar" aria-hidden="true"><span>Bind<b>Lens</b></span></div>
      {open && !narrow.value && <Band />}
      <div class={"window" + (lava ? " lavabg" : "") + (still ? " stillbg" : "")}>
        {!ready ? <Start /> : shut ? null : view.value === "book" ? <BookView /> : <Home />}
      </div>
      {open && <FrameBar />}
      {open && panel.value && <Panels />}
      {open && <Pip />}
      {open && <UploadPanel />}
      {shut && <Lock />}
      <Modals />
      <Menu />
      <NeedsTap />
      <Toasts />
    </div>
  );
}
