// The user's Google Drive: BindLens keeps everything in a folder called "BindLens" in their Drive. Each book is a
// folder inside it, each document a file in that folder. The library's own settings (book colours and order, where
// you left off, reminders...) are in "BindLens library.json" in that same folder. BindLens asks only for the
// "drive.file" permission: it sees only the files it made, or the ones the user gives it.
import { idb } from "../idb.js";
import { mimeOf } from "../util.js";
import { _t } from "../i18n.js";

export const CLIENT_ID = "537962235577-p6sgr9cnbqvvv0v75a7jbpla1op629n7.apps.googleusercontent.com";
export const APP_ID = "537962235577"; // the Google Cloud project number (for the Drive picker)
export const PICKER_KEY = "AIzaSyDH4g7NE_v7U8CuQ55bFrWgWx-JjS2gwno"; // browser API key for "Add from Drive" (Picker only; bindlens.com + docs.google.com)
const FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";   // 1.0: the settings, hidden (not in your Drive)
const SCOPE = FILE_SCOPE + " " + APPDATA_SCOPE;
const API = "https://www.googleapis.com/drive/v3";
const UP = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
const SETTINGS_NAME = "BindLens library.json";
const FIELDS = "id,name,mimeType,size,modifiedTime,md5Checksum,parents,trashed,version,shortcutDetails";
const SHORTCUT = "application/vnd.google-apps.shortcut";

let gisLoaded = null;
export function loadGoogle() {
  if (gisLoaded) return gisLoaded;
  gisLoaded = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisLoaded = null; reject(new Error(_t("Could not reach Google. Check the internet connection."))); };
    document.head.appendChild(s);
  });
  return gisLoaded;
}

export class DriveStore {
  constructor() {
    this.kind = "drive";
    this.cloud = "Google Drive";
    this.canPick = true;
    this.token = null;
    this.expires = 0;
    this.user = null;
    this.rootId = null;
    this.settingsId = null;
    this.tokenClient = null;
    this.onNeedSignIn = null; // the app shows a "keep working" button when the hour is up
  }

  async signIn(silent = false) {
    await loadGoogle();
    const hint = localStorage.getItem("bl_email") || undefined;
    await new Promise((resolve, reject) => {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        login_hint: hint,
        hint,
        callback: (r) => {
          if (r.error) { reject(new Error(r.error_description || r.error)); return; }
          const has = (sc) => !google.accounts.oauth2.hasGrantedAllScopes || google.accounts.oauth2.hasGrantedAllScopes(r, sc);
          this.appData = has(APPDATA_SCOPE);
          if (!has(FILE_SCOPE)) {
            reject(new Error(_t("BindLens needs to use its own folder in your Google Drive. Sign in again and leave the Drive box ticked.")));
            return;
          }
          this.token = r.access_token;
          this.expires = Date.now() + (Number(r.expires_in || 3600) - 120) * 1000;
          resolve();
        },
        error_callback: (e) => reject(new Error(e?.message || e?.type || _t("Sign-in was closed"))),
      });
      this.tokenClient.requestAccessToken({ prompt: silent ? "" : undefined });
    });
    if (!this.user) {
      const about = await this.json(`${API}/about?fields=user(displayName,emailAddress,photoLink)`);
      this.user = { name: about.user.displayName, email: about.user.emailAddress, photo: about.user.photoLink };
      try { localStorage.setItem("bl_email", this.user.email); localStorage.setItem("bl_signed_in", "1"); localStorage.setItem("bl_cloud", "drive"); localStorage.setItem("bl_user", JSON.stringify(this.user)); } catch (e) {}
    }
  }

  signOut() {
    try { if (this.token) google.accounts.oauth2.revoke(this.token, () => {}); } catch (e) {}
    this.token = null;
    try { localStorage.removeItem("bl_signed_in"); } catch (e) {}
  }

  async fetch(url, opts = {}, retry = true) {
    if (this.offline) throw new Error(_t("You are offline: BindLens does it when the network is back"));
    if (!this.token || Date.now() > this.expires) {
      if (this.onNeedSignIn) await this.onNeedSignIn();
      else await this.signIn(true);
    }
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + this.token } });
    if (r.status === 401 && retry) {
      this.token = null;
      return this.fetch(url, opts, false);
    }
    if (!r.ok) {
      let msg = r.status + "";
      try { const j = await r.json(); msg = j.error?.message || msg; } catch (e) {}
      throw new Error(_t("Google Drive: ") + msg);
    }
    return r;
  }

  async json(url, opts) { return (await this.fetch(url, opts)).json(); }

  q(s) { return encodeURIComponent(s); }

  async init() {
    // 1.0: BindLens makes no folder of its own. Your books are your own folders, where they are in your Drive (the ones
    // you add, and the ones you make with BindLens, in My Drive). A "BindLens" folder from before still works.
    let id = null;
    let saved = null;
    try { saved = localStorage.getItem("bl_root"); } catch (e) {}
    if (saved && saved !== "-") {
      try {
        const f = await this.json(`${API}/files/${saved}?fields=id,trashed,mimeType`);
        if (f && f.id && !f.trashed && f.mimeType === FOLDER) id = f.id;
      } catch (e) { /* gone or not ours any more */ }
    }
    if (!id) {
      try {
        const found = await this.json(`${API}/files?q=${this.q(`name='BindLens' and mimeType='${FOLDER}' and trashed=false`)}&fields=files(id,name)&spaces=drive`);
        if (found.files.length) id = found.files[0].id;
      } catch (e) {}
    }
    this.rootId = id;
    try { localStorage.setItem("bl_root", id || "-"); } catch (e) {}
    // My Drive itself (where new books and files from your computer go)
    try { this.myRoot = localStorage.getItem("bl_myroot") || null; } catch (e) {}
    if (!this.myRoot) {
      try { const r = await this.json(`${API}/files/root?fields=id`); if (r && r.id) { this.myRoot = r.id; localStorage.setItem("bl_myroot", r.id); } } catch (e) {}
    }
    // the library's settings file, so they are read before the books are shown. 1.0: it lives in the app's hidden
    // space of your Drive (you do not see it among your files); a visible one from before moves there once and goes
    const st = await this.json(`${API}/files?q=${this.q(`name='${SETTINGS_NAME}' and trashed=false`)}&fields=files(id,name,modifiedTime,parents)&orderBy=modifiedTime desc&spaces=drive`);
    const list = (st.files || []).sort((x, y) => ((y.parents || []).includes(id) ? 1 : 0) - ((x.parents || []).includes(id) ? 1 : 0));
    this.settingsId = list.length ? list[0].id : null;
    if (this.appData) {
      try {
        const hid = await this.json(`${API}/files?q=${this.q(`name='${SETTINGS_NAME}' and trashed=false`)}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&spaces=appDataFolder`);
        const old = this.settingsId;
        if (hid.files && hid.files.length) this.settingsId = hid.files[0].id;
        else if (old) {
          const body = await (await this.fetch(`${API}/files/${old}?alt=media`)).text();
          const f = await this.create("appDataFolder", SETTINGS_NAME, new TextEncoder().encode(body).buffer, "application/json", { keep: false });
          this.settingsId = f.id;
        } else this.settingsId = null;
        if (old && this.settingsId !== old) await this.trash(old);
        this.settingsHidden = true;
      } catch (e) { /* the hidden space is not there: the settings stay as they were */ }
    }
  }

  // everything BindLens can see, in one go: the books (folders in BindLens) and their files
  async listAll() {
    const ck = "list:" + (this.user?.email || "");
    if (this.offline) {
      const c = await idb.get("kv", ck);
      if (c) return c;
      throw new Error(_t("You are offline, and this library was not opened on this device before"));
    }
    const out = await this.listOnline();
    idb.set("kv", ck, out);
    return out;
  }

  async listOnline() {
    const items = [];
    let page = "";
    do {
      const r = await this.json(`${API}/files?q=${this.q("trashed=false")}&fields=nextPageToken,files(${FIELDS})&pageSize=1000&spaces=drive${page ? "&pageToken=" + page : ""}`);
      items.push(...r.files);
      page = r.nextPageToken || "";
    } while (page);
    // the books: the folders in BindLens, and the books colleagues shared with you (kept in your settings)
    const linked = new Set(this.linked || []);
    const own = new Set(this.own || []);
    const books = items.filter(f => f.mimeType === FOLDER && (((this.rootId && (f.parents || []).includes(this.rootId))) || linked.has(f.id)));
    const byId = new Map(items.map(f => [f.id, f]));
    const ids = new Set(books.map(b => b.id));
    // folders inside a book are its sub-books (as deep as they go): each one knows its book and its path
    const folders = new Map(items.filter(f => f.mimeType === FOLDER).map(f => [f.id, f]));
    const where = new Map(books.map(b => [b.id, { book: b.id, path: "" }]));
    const placeOf = (id, depth = 0) => {
      if (where.has(id)) return where.get(id);
      const f = folders.get(id);
      if (!f || depth > 12) return null;
      for (const p of f.parents || []) {
        const up = placeOf(p, depth + 1);
        if (up) { const v = { book: up.book, path: (up.path ? up.path + "/" : "") + f.name }; where.set(id, v); return v; }
      }
      return null;
    };
    const subs = [];
    for (const f of folders.values()) {
      if (ids.has(f.id) || f.id === this.rootId) continue;
      const w = placeOf(f.id);
      if (w) subs.push({ id: f.id, name: f.name, book: w.book, path: w.path });
    }
    const files = [];
    for (const f of items) {
      if (f.mimeType === FOLDER || f.name === SETTINGS_NAME) continue;
      const p = (f.parents || []).find(x => where.has(x) || placeOf(x));
      if (!p) continue;
      const w = where.get(p);
      if (f.mimeType === SHORTCUT) {
        // 1.0: a file of your Drive put in a book without copying it: the book shows the original (and marks go in it)
        const t = byId.get(f.shortcutDetails && f.shortcutDetails.targetId);
        if (t && !t.trashed && t.mimeType !== FOLDER && t.mimeType !== SHORTCUT) files.push({ ...this.norm(t), book: w.book, sub: w.path, parent: p, shortcut: f.id });
        continue;
      }
      files.push({ ...this.norm(f), book: w.book, sub: w.path, parent: p });
    }
    const settings = items.filter(f => f.name === SETTINGS_NAME && (this.settingsId ? f.id === this.settingsId : true))
      .sort((a, b) => (b.modifiedTime || "").localeCompare(a.modifiedTime || ""))[0];
    if (settings && !this.settingsHidden) this.settingsId = settings.id;
    const top = [this.rootId, this.myRoot].filter(Boolean);
    const loose = items.filter(f => f.mimeType !== FOLDER && f.mimeType !== SHORTCUT && f.name !== SETTINGS_NAME && (f.parents || []).some(x => top.includes(x)))
      .map(f => this.norm(f));
    return {
      books: books.map(b => ({ id: b.id, name: b.name, modified: b.modifiedTime, linked: linked.has(b.id), shared: linked.has(b.id) && !own.has(b.id), root: !!b.root })),
      files, loose, subs,
    };
  }

  norm(f) {
    const book = (f.parents || []).find(p => p !== this.rootId && p !== this.myRoot) || (f.parents || [])[0];
    return { id: f.id, name: f.name, mime: f.mimeType, size: f.size ? Number(f.size) : null, modified: f.modifiedTime,
      md5: f.md5Checksum || "", version: f.version || "", book, parent: book };
  }

  async createFolder(name, parent) {
    return this.json(`${API}/files?fields=id,name,modifiedTime`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: parent ? [parent] : undefined }),
    });
  }

  async createBook(name) {
    // 1.0: a new book is a folder in My Drive itself (not inside another folder)
    const f = await this.createFolder(name, null);
    return { id: f.id, name: f.name, modified: f.modifiedTime, own: true };
  }

  async rename(id, name) {
    return this.json(`${API}/files/${id}?fields=${FIELDS}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
  }

  async trash(id) {
    await this.fetch(`${API}/files/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
    });
  }

  async untrash(id) {
    await this.fetch(`${API}/files/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: false }),
    });
  }

  async move(id, fromBook, toBook) {
    const f = await this.json(`${API}/files/${id}?addParents=${toBook}&removeParents=${fromBook}&fields=${FIELDS}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    return this.norm(f);
  }

  // the earlier versions Google Drive keeps of a file (for about 30 days, or for ever when kept)
  async revisions(file) {
    const r = await this.json(`${API}/files/${file.id}/revisions?fields=revisions(id,modifiedTime,size,keepForever)&pageSize=200`);
    return (r.revisions || []).map(v => ({ id: v.id, modified: v.modifiedTime, size: v.size ? Number(v.size) : null, keep: !!v.keepForever })).reverse();
  }

  async readRevision(file, revId) {
    const r = await this.fetch(`${API}/files/${file.id}/revisions/${revId}?alt=media`);
    return r.arrayBuffer();
  }

  // a Word, Excel or PowerPoint file as it really looks: Google converts a copy, gives it back as a PDF, and the copy
  // is deleted straight away (the file itself is not changed)
  async googlePdf(file, kind) {
    const to = { word: "application/vnd.google-apps.document", excel: "application/vnd.google-apps.spreadsheet",
      powerpoint: "application/vnd.google-apps.presentation" }[kind];
    if (!to) throw new Error(_t("Google cannot show this kind of file"));
    const copy = await this.json(`${API}/files/${file.id}/copy?fields=id`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "BindLens (a moment) - " + file.name, mimeType: to, parents: this.rootId ? [this.rootId] : undefined }),
    });
    try {
      const r = await this.fetch(`${API}/files/${copy.id}/export?mimeType=application/pdf`);
      return await r.arrayBuffer();
    } finally {
      this.fetch(`${API}/files/${copy.id}`, { method: "DELETE" }).catch(() => {});
    }
  }

  officePdf(file) { return this.googlePdf(file, file.kind); }

  // out of BindLens, into "My Drive" (nothing is deleted)
  async release(id, from) {
    await this.fetch(`${API}/files/${id}?addParents=root&removeParents=${from}&fields=id`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}",
    });
  }

  async createSub(name, parent) {
    const f = await this.createFolder(name, parent);
    return { id: f.id, name: f.name };
  }

  async read(file) {
    const key = file.id + ":" + (file.md5 || file.modified || "");
    const cached = await idb.get("files", key);
    if (cached) return cached.slice(0);
    let r;
    if ((file.mime || "").startsWith("application/vnd.google-apps")) {
      // a Google Doc / Sheet / Slides given to BindLens: read it as a PDF
      r = await this.fetch(`${API}/files/${file.id}/export?mimeType=application/pdf`);
    } else {
      r = await this.fetch(`${API}/files/${file.id}?alt=media`);
    }
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 60 * 1024 * 1024) idb.set("files", key, buf.slice(0));
    return buf;
  }

  // big files (over 4 MB) go up in a "resumable" upload, the way Google wants them; small ones in one request
  async resumable(method, url, meta, bytes, mime) {
    const start = await this.fetch(url + (url.includes("?") ? "&" : "?") + "uploadType=resumable", {
      method, headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime,
        "X-Upload-Content-Length": String(bytes.byteLength) },
      body: JSON.stringify(meta || {}),
    });
    const loc = start.headers.get("Location") || start.headers.get("location");
    if (!loc) throw new Error(_t("Google Drive did not start the upload"));
    const r = await fetch(loc, { method: "PUT", headers: { "Content-Type": mime }, body: bytes });
    if (!r.ok) throw new Error(_t("Google Drive: the upload stopped (") + r.status + ")");
    return r.json();
  }

  async write(file, bytes) {
    if (this.offline || (typeof navigator !== "undefined" && navigator.onLine === false)) return this.queue(file, bytes);
    try { return await this.writeOnline(file, bytes); }
    catch (e) { if (/Failed to fetch|NetworkError|offline/i.test(e.message || "")) return this.queue(file, bytes); throw e; }
  }

  // ---- offline: the changes wait in this browser, and go up when the network is back
  async queue(file, bytes) {
    const copy = bytes.slice ? bytes.slice(0) : bytes;
    await idb.set("kv", "outbox:" + file.id, { id: file.id, name: file.name, mime: file.mime, bytes: copy, at: Date.now() });
    idb.set("files", file.id + ":" + (file.md5 || file.modified || ""), copy);
    const list = new Set(JSON.parse(localStorage.getItem("bl_outbox") || "[]")); list.add(file.id);
    try { localStorage.setItem("bl_outbox", JSON.stringify([...list])); } catch (e) {}
    this.onQueue && this.onQueue(list.size);
    return { ...file };
  }

  waiting() { try { return JSON.parse(localStorage.getItem("bl_outbox") || "[]"); } catch (e) { return []; } }

  async flush() {
    let n = 0;
    for (const id of this.waiting()) {
      const it = await idb.get("kv", "outbox:" + id);
      if (it) { await this.writeOnline({ id: it.id, name: it.name, mime: it.mime }, it.bytes); n++; }
      await idb.del("kv", "outbox:" + id);
      const left = this.waiting().filter(x => x !== id);
      try { localStorage.setItem("bl_outbox", JSON.stringify(left)); } catch (e) {}
    }
    const ck = "settings:" + (this.user?.email || "");
    const s = await idb.get("kv", "pending" + ck);
    if (s) await this.saveSettings(s);
    return n;
  }

  // start without a network, from what this browser kept the last time
  canStartOffline() { try { return !!(localStorage.getItem("bl_user") && localStorage.getItem("bl_root")); } catch (e) { return false; } }
  startOffline() {
    this.offline = true;
    this.user = JSON.parse(localStorage.getItem("bl_user"));
    { const r0 = localStorage.getItem("bl_root"); this.rootId = r0 && r0 !== "-" ? r0 : null; this.myRoot = localStorage.getItem("bl_myroot") || null; }
  }

  async writeOnline(file, bytes) {
    const mime = file.mime || mimeOf(file.name);
    let json;
    if (bytes.byteLength > 4 * 1024 * 1024) json = await this.resumable("PATCH", `${UP}/files/${file.id}?fields=${FIELDS}`, {}, bytes, mime);
    else json = await (await this.fetch(`${UP}/files/${file.id}?uploadType=media&fields=${FIELDS}`, {
      method: "PATCH", headers: { "Content-Type": mime }, body: bytes,
    })).json();
    const f = this.norm(json);
    if (bytes.byteLength < 60 * 1024 * 1024) idb.set("files", f.id + ":" + (f.md5 || f.modified), bytes.slice ? bytes.slice(0) : bytes);
    return f;
  }

  // a request that says how far the bytes have gone (fetch cannot), and stops if nothing moves for a minute
  async tokenNow() {
    if (!this.token || Date.now() > this.expires) {
      if (this.onNeedSignIn) await this.onNeedSignIn();
      else await this.signIn(true);
    }
    return this.token;
  }
  xhr(method, url, { headers = {}, body = null, onProgress = null, signal = null, auth = true } = {}) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open(method, url);
      for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
      if (auth) x.setRequestHeader("Authorization", "Bearer " + this.token);
      let last = Date.now(), stalled = false;
      const dog = setInterval(() => { if (Date.now() - last > 60000) { stalled = true; x.abort(); } }, 5000);
      x.upload.onprogress = (e) => { last = Date.now(); if (onProgress && e.lengthComputable) onProgress(e.loaded, e.total); };
      const end = () => clearInterval(dog);
      x.onload = () => { end(); resolve({ status: x.status, text: x.responseText, header: (n) => x.getResponseHeader(n) }); };
      x.onerror = () => { end(); reject(new Error(_t("Failed to fetch: the network stopped"))); };
      x.onabort = () => { end(); reject(stalled ? new Error(_t("The upload stopped: nothing moved for a minute (is the network there?)")) : Object.assign(new Error(_t("Stopped")), { name: "AbortError" })); };
      if (signal) { if (signal.aborted) { end(); reject(Object.assign(new Error(_t("Stopped")), { name: "AbortError" })); return; } signal.addEventListener("abort", () => x.abort(), { once: true }); }
      x.send(body);
    });
  }
  driveError(r) { let msg = String(r.status); try { msg = JSON.parse(r.text).error.message || msg; } catch (e) {} return new Error(_t("Google Drive: ") + msg); }

  async create(bookId, name, bytes, mime, opt = {}) {
    if (this.offline) throw new Error(_t("You are offline: new files can be added when the network is back"));
    mime = mime || mimeOf(name);
    const meta = { name, parents: bookId ? [bookId] : undefined };       // no book: My Drive itself
    const { onProgress = null, signal = null } = opt;
    let json;
    if (bytes.byteLength > 4 * 1024 * 1024) {
      // big files: Google gives an address for the bytes, then they go up with their progress
      const start = await this.fetch(`${UP}/files?fields=${FIELDS}&uploadType=resumable`, {
        method: "POST", signal, headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime, "X-Upload-Content-Length": String(bytes.byteLength) },
        body: JSON.stringify(meta),
      });
      const loc = start.headers.get("Location") || start.headers.get("location");
      if (!loc) throw new Error(_t("Google Drive did not start the upload"));
      const r = await this.xhr("PUT", loc, { headers: { "Content-Type": mime }, body: bytes, onProgress, signal, auth: false });
      if (r.status >= 300) throw new Error(_t("Google Drive: the upload stopped (") + r.status + ")");
      json = JSON.parse(r.text);
    } else {
      const form = () => {
        const fd = new FormData();
        fd.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
        fd.append("file", new Blob([bytes], { type: mime }));
        return fd;
      };
      await this.tokenNow();
      let r = await this.xhr("POST", `${UP}/files?uploadType=multipart&fields=${FIELDS}`, { body: form(), onProgress, signal });
      if (r.status === 401) { this.token = null; await this.tokenNow(); r = await this.xhr("POST", `${UP}/files?uploadType=multipart&fields=${FIELDS}`, { body: form(), onProgress, signal }); }
      if (r.status >= 300) throw this.driveError(r);
      json = JSON.parse(r.text);
    }
    if (!bookId && json.parents && json.parents[0] && !this.myRoot) { this.myRoot = json.parents[0]; try { localStorage.setItem("bl_myroot", this.myRoot); } catch (e) {} }
    const f = this.norm(json);
    // a copy in this browser opens it at once - only for files that are not big (a big copy is slow to keep)
    if (bytes.byteLength < (opt.keep === false ? 0 : 20 * 1024 * 1024)) idb.set("files", f.id + ":" + (f.md5 || f.modified), bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes);
    return f;
  }

  async copy(file, bookId, name) {
    const f = await this.json(`${API}/files/${file.id}/copy?fields=${FIELDS}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || file.name, parents: [bookId] }),
    });
    return this.norm(f);
  }

  async loadSettings() {
    const ck = "settings:" + (this.user?.email || "");
    const waiting = await idb.get("kv", "pending" + ck);
    if (this.offline) return waiting || (await idb.get("kv", ck)) || {};
    if (waiting) return waiting;                 // changed offline, not saved yet: it goes up in a moment
    const s = await this.loadSettingsOnline();
    idb.set("kv", ck, s);
    return s;
  }

  async loadSettingsOnline() {
    if (!this.settingsId) return {};
    try {
      const r = await this.fetch(`${API}/files/${this.settingsId}?alt=media`);
      return await r.json();
    } catch (e) {
      return {};
    }
  }

  async saveSettings(obj) {
    const ck = "settings:" + (this.user?.email || "");
    if (this.offline) { await idb.set("kv", "pending" + ck, obj); return; }
    await this.saveSettingsOnline(obj);
    idb.set("kv", ck, obj);
    idb.del("kv", "pending" + ck);
  }

  async saveSettingsOnline(obj) {
    const body = JSON.stringify(obj, null, 1);
    if (this.settingsId) {
      await this.fetch(`${UP}/files/${this.settingsId}?uploadType=media`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body,
      });
    } else {
      const f = await this.create(this.settingsHidden || this.appData ? "appDataFolder" : (this.rootId || null), SETTINGS_NAME, new TextEncoder().encode(body).buffer, "application/json");
      this.settingsId = f.id;
    }
  }

  webLink(file) { return `https://drive.google.com/file/d/${file.id}/view`; }
  folderLink(bookId) { return bookId || this.rootId ? `https://drive.google.com/drive/folders/${bookId || this.rootId}` : "https://drive.google.com/drive/my-drive"; }

  // 1.0: a file of your Drive in a book without copying it (a shortcut: the original stays where it is)
  async createShortcut(targetId, parent, name) {
    return this.json(`${API}/files?fields=${FIELDS}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: SHORTCUT, parents: [parent], shortcutDetails: { targetId } }),
    });
  }

  // "Add from Drive": the Google picker, for files the user already has in their Drive
  async pick(multiple = true, opts = {}) {
    await new Promise((res, rej) => {
      if (window.google?.picker) return res();
      const s = document.createElement("script");
      s.src = "https://apis.google.com/js/api.js";
      s.onload = () => window.gapi.load("picker", { callback: res, onerror: rej });
      s.onerror = rej;
      document.head.appendChild(s);
    });
    if (!this.token || Date.now() > this.expires) await this.signIn(true);
    return new Promise((resolve) => {
      // folders: only folders are shown, and a folder can be chosen; or the files inside one folder
      let view;
      if (opts.shared) view = new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(FOLDER).setOwnedByMe(false);
      else if (opts.folders) view = new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(FOLDER);
      else {
        view = new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false);
        if (opts.parent) view = view.setParent(opts.parent);
      }
      let b = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(this.token)
        .setAppId(APP_ID)
        .setTitle(opts.title || _t("Add from your Google Drive"))
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) resolve(data.docs.map(d => ({ id: d.id, name: d.name, mime: d.mimeType })));
          else if (data.action === google.picker.Action.CANCEL) resolve([]);
        });
      if (multiple) b = b.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
      if (PICKER_KEY) b = b.setDeveloperKey(PICKER_KEY);
      b.build().setVisible(true);
    });
  }

  // a new Google Doc, Sheet or Slides: BindLens makes it, so the "drive.file" permission lets it open and export it
  async createGoogle(kind, name, parent) {
    const mime = { doc: "application/vnd.google-apps.document", sheet: "application/vnd.google-apps.spreadsheet",
      slides: "application/vnd.google-apps.presentation" }[kind];
    const f = await this.json(`${API}/files?fields=${FIELDS}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: mime, parents: parent || this.rootId ? [parent || this.rootId] : undefined }),
    });
    return this.norm(f);
  }

  // a Word / Excel / PowerPoint file uploaded as a Google Doc / Sheet / Slides (Google converts it)
  async createConverted(parent, name, bytes, srcMime, kind) {
    const to = { doc: "application/vnd.google-apps.document", sheet: "application/vnd.google-apps.spreadsheet", slides: "application/vnd.google-apps.presentation" }[kind];
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify({ name, mimeType: to, parents: parent || this.rootId ? [parent || this.rootId] : undefined })], { type: "application/json" }));
    form.append("file", new Blob([bytes], { type: srcMime }));
    const json = await (await this.fetch(`${UP}/files?uploadType=multipart&fields=${FIELDS}`, { method: "POST", body: form })).json();
    return this.norm(json);
  }

  async exportPdf(id) {
    const r = await this.fetch(`${API}/files/${id}/export?mimeType=application/pdf`);
    return r.arrayBuffer();
  }

  editLink(kind, id) {
    return { doc: `https://docs.google.com/document/d/${id}/edit`, sheet: `https://docs.google.com/spreadsheets/d/${id}/edit`,
      slides: `https://docs.google.com/presentation/d/${id}/edit` }[kind];
  }

  // sharing a book (a folder) with colleagues: Google sends them an email; the files inside are shared with it
  async permissions(id) {
    const r = await this.json(`${API}/files/${id}/permissions?fields=permissions(id,type,role,emailAddress,displayName,photoLink,deleted)`);
    return (r.permissions || []).filter(p => !p.deleted);
  }

  async share(id, email, role, message) {
    return this.json(`${API}/files/${id}/permissions?sendNotificationEmail=true${message ? "&emailMessage=" + encodeURIComponent(message) : ""}&fields=id`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user", role, emailAddress: email }),
    });
  }

  async unshare(id, permId) {
    await this.fetch(`${API}/files/${id}/permissions/${permId}`, { method: "DELETE" });
  }

  async meta(id) {
    return this.norm(await this.json(`${API}/files/${id}?fields=${FIELDS}`));
  }

  // what is inside a folder of the Drive, when Google lets BindLens see it (with the "drive.file" permission
  // BindLens sees only what you chose or made with it, so this can come back empty)
  async inside(folderId) {
    const out = [];
    let page = null;
    do {
      const r = await this.json(`${API}/files?q=${this.q(`'${folderId}' in parents and trashed=false`)}&fields=nextPageToken,files(${FIELDS})&pageSize=1000&spaces=drive${page ? "&pageToken=" + page : ""}`);
      for (const f of r.files || []) out.push({ ...this.norm(f), parent: folderId });
      page = r.nextPageToken;
    } while (page);
    return out;
  }
}
