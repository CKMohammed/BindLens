// The user's Google Drive: BindLens keeps everything in a folder called "BindLens" in their Drive. Each book is a
// folder inside it, each document a file in that folder. The library's own settings (book colours and order, where
// you left off, reminders...) are in "BindLens library.json" in that same folder. BindLens asks only for the
// "drive.file" permission: it sees only the files it made, or the ones the user gives it.
import { idb } from "../idb.js";
import { mimeOf } from "../util.js";

export const CLIENT_ID = "537962235577-p6sgr9cnbqvvv0v75a7jbpla1op629n7.apps.googleusercontent.com";
export const APP_ID = "537962235577"; // the Google Cloud project number (for the Drive picker)
export const PICKER_KEY = "";          // a browser API key for "Add from Drive" (set when there is one)
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const API = "https://www.googleapis.com/drive/v3";
const UP = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
const SETTINGS_NAME = "BindLens library.json";
const FIELDS = "id,name,mimeType,size,modifiedTime,md5Checksum,parents,trashed,version";

let gisLoaded = null;
export function loadGoogle() {
  if (gisLoaded) return gisLoaded;
  gisLoaded = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisLoaded = null; reject(new Error("Could not reach Google. Check the internet connection.")); };
    document.head.appendChild(s);
  });
  return gisLoaded;
}

export class DriveStore {
  constructor() {
    this.kind = "drive";
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
          if (google.accounts.oauth2.hasGrantedAllScopes && !google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) {
            reject(new Error("BindLens needs to use its own folder in your Google Drive. Sign in again and leave the Drive box ticked."));
            return;
          }
          this.token = r.access_token;
          this.expires = Date.now() + (Number(r.expires_in || 3600) - 120) * 1000;
          resolve();
        },
        error_callback: (e) => reject(new Error(e?.message || e?.type || "Sign-in was closed")),
      });
      this.tokenClient.requestAccessToken({ prompt: silent ? "" : undefined });
    });
    if (!this.user) {
      const about = await this.json(`${API}/about?fields=user(displayName,emailAddress,photoLink)`);
      this.user = { name: about.user.displayName, email: about.user.emailAddress, photo: about.user.photoLink };
      try { localStorage.setItem("bl_email", this.user.email); localStorage.setItem("bl_signed_in", "1"); } catch (e) {}
    }
  }

  signOut() {
    try { if (this.token) google.accounts.oauth2.revoke(this.token, () => {}); } catch (e) {}
    this.token = null;
    try { localStorage.removeItem("bl_signed_in"); } catch (e) {}
  }

  async fetch(url, opts = {}, retry = true) {
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
      throw new Error("Google Drive: " + msg);
    }
    return r;
  }

  async json(url, opts) { return (await this.fetch(url, opts)).json(); }

  q(s) { return encodeURIComponent(s); }

  async init() {
    // the BindLens folder: find it (BindLens made it before) or make it
    let id = null;
    const found = await this.json(`${API}/files?q=${this.q(`name='BindLens' and mimeType='${FOLDER}' and trashed=false and 'root' in parents`)}&fields=files(id,name)&spaces=drive`);
    if (found.files.length) id = found.files[0].id;
    if (!id) {
      const any = await this.json(`${API}/files?q=${this.q(`name='BindLens' and mimeType='${FOLDER}' and trashed=false`)}&fields=files(id,name)&spaces=drive`);
      if (any.files.length) id = any.files[0].id;
    }
    if (!id) id = (await this.createFolder("BindLens", null)).id;
    this.rootId = id;
  }

  // everything BindLens can see, in one go: the books (folders in BindLens) and their files
  async listAll() {
    const items = [];
    let page = "";
    do {
      const r = await this.json(`${API}/files?q=${this.q("trashed=false")}&fields=nextPageToken,files(${FIELDS})&pageSize=1000&spaces=drive${page ? "&pageToken=" + page : ""}`);
      items.push(...r.files);
      page = r.nextPageToken || "";
    } while (page);
    const books = items.filter(f => f.mimeType === FOLDER && (f.parents || []).includes(this.rootId));
    const ids = new Set(books.map(b => b.id));
    const files = items.filter(f => f.mimeType !== FOLDER && (f.parents || []).some(p => ids.has(p)))
      .map(f => this.norm(f));
    const settings = items.find(f => f.name === SETTINGS_NAME && (f.parents || []).includes(this.rootId));
    this.settingsId = settings ? settings.id : null;
    const loose = items.filter(f => f.mimeType !== FOLDER && f.name !== SETTINGS_NAME && (f.parents || []).includes(this.rootId))
      .map(f => this.norm(f));
    return {
      books: books.map(b => ({ id: b.id, name: b.name, modified: b.modifiedTime })),
      files, loose,
    };
  }

  norm(f) {
    const book = (f.parents || []).find(p => p !== this.rootId) || (f.parents || [])[0];
    return { id: f.id, name: f.name, mime: f.mimeType, size: f.size ? Number(f.size) : null, modified: f.modifiedTime,
      md5: f.md5Checksum || "", version: f.version || "", book };
  }

  async createFolder(name, parent) {
    return this.json(`${API}/files?fields=id,name,modifiedTime`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: parent ? [parent] : undefined }),
    });
  }

  async createBook(name) {
    const f = await this.createFolder(name, this.rootId);
    return { id: f.id, name: f.name, modified: f.modifiedTime };
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
    if (!loc) throw new Error("Google Drive did not start the upload");
    const r = await fetch(loc, { method: "PUT", headers: { "Content-Type": mime }, body: bytes });
    if (!r.ok) throw new Error("Google Drive: the upload stopped (" + r.status + ")");
    return r.json();
  }

  async write(file, bytes) {
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

  async create(bookId, name, bytes, mime) {
    mime = mime || mimeOf(name);
    const meta = { name, parents: [bookId] };
    let json;
    if (bytes.byteLength > 4 * 1024 * 1024) json = await this.resumable("POST", `${UP}/files?fields=${FIELDS}`, meta, bytes, mime);
    else {
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
      form.append("file", new Blob([bytes], { type: mime }));
      json = await (await this.fetch(`${UP}/files?uploadType=multipart&fields=${FIELDS}`, { method: "POST", body: form })).json();
    }
    const f = this.norm(json);
    if (bytes.byteLength < 60 * 1024 * 1024) idb.set("files", f.id + ":" + (f.md5 || f.modified), bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes);
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
    if (!this.settingsId) return {};
    try {
      const r = await this.fetch(`${API}/files/${this.settingsId}?alt=media`);
      return await r.json();
    } catch (e) {
      return {};
    }
  }

  async saveSettings(obj) {
    const body = JSON.stringify(obj, null, 1);
    if (this.settingsId) {
      await this.fetch(`${UP}/files/${this.settingsId}?uploadType=media`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body,
      });
    } else {
      const f = await this.create(this.rootId, SETTINGS_NAME, new TextEncoder().encode(body).buffer, "application/json");
      this.settingsId = f.id;
    }
  }

  webLink(file) { return `https://drive.google.com/file/d/${file.id}/view`; }
  folderLink(bookId) { return `https://drive.google.com/drive/folders/${bookId || this.rootId}`; }

  // "Add from Drive": the Google picker, for files the user already has in their Drive
  async pick(multiple = true) {
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
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false);
      let b = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(this.token)
        .setAppId(APP_ID)
        .setTitle("Add from your Google Drive")
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) resolve(data.docs.map(d => ({ id: d.id, name: d.name, mime: d.mimeType })));
          else if (data.action === google.picker.Action.CANCEL) resolve([]);
        });
      if (multiple) b = b.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
      if (PICKER_KEY) b = b.setDeveloperKey(PICKER_KEY);
      b.build().setVisible(true);
    });
  }

  async meta(id) {
    return this.norm(await this.json(`${API}/files/${id}?fields=${FIELDS}`));
  }
}
