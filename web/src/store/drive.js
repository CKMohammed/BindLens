// The user's Google Drive: BindLens keeps everything in a folder called "BindLens" in their Drive. Each book is a
// folder inside it, each document a file in that folder. The library's own settings (book colours and order, where
// you left off, reminders...) are in "BindLens library.json" in that same folder. BindLens asks only for the
// "drive.file" permission: it sees only the files it made, or the ones the user gives it.
import { idb } from "../idb.js";
import { mimeOf } from "../util.js";

export const CLIENT_ID = "537962235577-p6sgr9cnbqvvv0v75a7jbpla1op629n7.apps.googleusercontent.com";
export const APP_ID = "537962235577"; // the Google Cloud project number (for the Drive picker)
export const PICKER_KEY = "AIzaSyDH4g7NE_v7U8CuQ55bFrWgWx-JjS2gwno"; // browser API key for "Add from Drive" (Picker only; bindlens.com + docs.google.com)
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
      try { localStorage.setItem("bl_email", this.user.email); localStorage.setItem("bl_signed_in", "1"); localStorage.setItem("bl_cloud", "drive"); } catch (e) {}
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
    // the library's settings file, so they are read before the books are shown
    const st = await this.json(`${API}/files?q=${this.q(`name='${SETTINGS_NAME}' and '${id}' in parents and trashed=false`)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&spaces=drive`);
    this.settingsId = st.files && st.files.length ? st.files[0].id : null;
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
    // the books: the folders in BindLens, and the books colleagues shared with you (kept in your settings)
    const linked = new Set(this.linked || []);
    const books = items.filter(f => f.mimeType === FOLDER && ((f.parents || []).includes(this.rootId) || linked.has(f.id)));
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
      if (ids.has(f.id)) continue;
      const w = placeOf(f.id);
      if (w) subs.push({ id: f.id, name: f.name, book: w.book, path: w.path });
    }
    const files = [];
    for (const f of items) {
      if (f.mimeType === FOLDER) continue;
      const p = (f.parents || []).find(x => where.has(x) || placeOf(x));
      if (!p) continue;
      const w = where.get(p);
      files.push({ ...this.norm(f), book: w.book, sub: w.path, parent: p });
    }
    const settings = items.filter(f => f.name === SETTINGS_NAME && (f.parents || []).includes(this.rootId))
      .sort((a, b) => (b.modifiedTime || "").localeCompare(a.modifiedTime || ""))[0];
    if (settings) this.settingsId = settings.id;
    const loose = items.filter(f => f.mimeType !== FOLDER && f.name !== SETTINGS_NAME && (f.parents || []).includes(this.rootId))
      .map(f => this.norm(f));
    return {
      books: books.map(b => ({ id: b.id, name: b.name, modified: b.modifiedTime, shared: linked.has(b.id) })),
      files, loose, subs,
    };
  }

  norm(f) {
    const book = (f.parents || []).find(p => p !== this.rootId) || (f.parents || [])[0];
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
    if (!to) throw new Error("Google cannot show this kind of file");
    const copy = await this.json(`${API}/files/${file.id}/copy?fields=id`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "BindLens (a moment) - " + file.name, mimeType: to, parents: [this.rootId] }),
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
        .setTitle(opts.title || "Add from your Google Drive")
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
      body: JSON.stringify({ name, mimeType: mime, parents: [parent || this.rootId] }),
    });
    return this.norm(f);
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
