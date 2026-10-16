import { useEffect } from "preact/hooks";
import { batch } from "@preact/signals";
import { store, phase, errorText, settings, view, panel, toasts, locked, needsTap, reloadLibrary, toast, tool, fileId,
  currentBook } from "../state.js";
import { DriveStore, loadGoogle } from "../store/drive.js";
import { DemoStore } from "../store/demo.js";
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

export const DEFAULT_FRAME = ["#7C5CFF", "#FF3D9A", "#F0562A", "#F2C85A", "#3E7BFF"];

function Frame() {
  const f = settings.value.frame || {};
  const c = f.colors && f.colors.length >= 2 ? f.colors : DEFAULT_FRAME;
  const style = {};
  for (let i = 0; i < 5; i++) style["--c" + (i + 1)] = c[i % c.length];
  style["--speed"] = (f.speed || 22) + "s";
  return (
    <div class={"frame" + (f.still ? " still" : "")} style={style}>
      <div class="lava" /><div class="lava b" />
    </div>
  );
}

async function startWith(s, { tour = true } = {}) {
  phase.value = "loading";
  try {
    if (s.kind === "drive") await s.signIn(false);
    await s.init();
    store.value = s;
    settings.value = (await s.loadSettings()) || {};
    await reloadLibrary();
    batch(() => {
      if (settings.value.pin) locked.value = true;
      view.value = "home";
      phase.value = "ready";
    });
    if (tour) {
      const { shouldWelcome } = await import("./Welcome.jsx");
      if (shouldWelcome(settings.value)) panel.value = { type: "welcome" };
    }
    if (s.kind === "drive") {
      s.onNeedSignIn = () => new Promise((resolve) => {
        needsTap.value = async () => {
          try { await s.signIn(true); needsTap.value = null; resolve(); }
          catch (e) { toast("Sign-in did not finish: " + e.message, "bad"); }
        };
      });
    }
  } catch (e) {
    console.error(e);
    batch(() => { errorText.value = String(e.message || e); phase.value = "start"; });
  }
}

const G = () => (
  <svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" /></svg>
);

function Start() {
  const back = (() => { try { return localStorage.getItem("bl_signed_in") === "1" ? localStorage.getItem("bl_email") : null; } catch (e) { return null; } })();
  useEffect(() => { loadGoogle().catch(() => {}); engineStarted().catch(() => {}); }, []);
  const busy = phase.value === "loading";
  return (
    <div class="start">
      <div class="card">
        <img class="logo" src={import.meta.env.BASE_URL + "icon.png"} alt="" />
        <h1>Bind<span>Lens</span> Web</h1>
        <p>Your documents, bound into books. Read, mark and find anything, from any computer or phone. Everything is saved in your own Google Drive.</p>
        {busy ? <><div class="spinner" /><p class="small">Opening your library...</p></> : <>
          <button class="gbtn" onClick={() => startWith(new DriveStore())}>
            <G />{back ? <span>Continue as {back}</span> : <span>Sign in with Google</span>}
          </button>
          {back && <div style={{ marginTop: 10 }}><button class="btn plain small" onClick={() => { try { localStorage.removeItem("bl_email"); } catch (e) {} startWith(new DriveStore()); }}>Use another account</button></div>}
          <div class="or">or</div>
          <button class="btn ghost" onClick={() => startWith(new DemoStore())}>Try it with an example library</button>
          {errorText.value && <p class="small" style={{ color: "var(--bad)", marginTop: 16 }}>{errorText.value}</p>}
          <p class="fine">BindLens sees only the files it makes or that you give it, in a folder called <b>BindLens</b> in your Drive. Nothing goes to our servers: we have none. <a href={import.meta.env.BASE_URL + "privacy.html"} target="_blank" rel="noopener">Privacy</a> · <a href={import.meta.env.BASE_URL + "terms.html"} target="_blank" rel="noopener">Terms</a> · <a href="/" target="_blank">bindlens.com</a></p>
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
        <div class="dh"><Icon n="lock" size={22} style={{ color: "var(--accent)" }} /><h2>Still there?</h2></div>
        <div class="db"><p style={{ margin: 0 }}>Google asks BindLens to check it is still you every hour. Click to keep working.</p></div>
        <div class="df"><button class="btn" onClick={f}>Keep working</button></div>
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
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveAll().then(() => toast("Saved in your Drive.", "ok")); }
      else if (mod && e.key.toLowerCase() === "r") { e.preventDefault(); openPanel("reports"); }
      else if (mod && e.key.toLowerCase() === "p" && view.value === "book") { e.preventDefault(); openPanel("print"); }
      else if (mod && e.key === ",") { e.preventDefault(); openPanel("settings"); }
      else if (e.key === "F1") { e.preventDefault(); openPanel("help"); }
      else if (mod && e.key.toLowerCase() === "e" && view.value === "book") { e.preventDefault(); tool.value = "edit"; toast("Click the line of text to change."); }
      else if (e.key === "F2" && view.value === "book" && !panel.value) {
        e.preventDefault();
        import("../docs.js").then(({ fileFor }) => { const f = fileFor(fileId.value); const b = currentBook.value; if (f && b) import("../actions.js").then(a => a.renameFile(b, f)); });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const ready = phase.value === "ready";
  return (
    <div class="shell">
      <Frame />
      <div class="window">
        {!ready ? <Start /> : view.value === "book" ? <BookView /> : <Home />}
      </div>
      {ready && panel.value && <Panels />}
      {ready && <Pip />}
      {ready && locked.value && <Lock />}
      <Modals />
      <Menu />
      <NeedsTap />
      <Toasts />
    </div>
  );
}
