// The user's OneDrive (Microsoft): BindLens keeps everything in its own app folder ("Apps/BindLens" in OneDrive).
// Each book is a folder there, each document a file. BindLens asks only for "Files.ReadWrite.AppFolder": it sees
// nothing else of the user's OneDrive. Sign-in: Microsoft's own page in a small window (OAuth with PKCE), no library.
import { idb } from "../idb.js";
import { mimeOf, shortName } from "../util.js";
import { _t } from "../i18n.js";

// the "Application (client) ID" of the BindLens app in Microsoft Entra (web/.env: VITE_MS_CLIENT_ID=...); empty = no OneDrive button
export const MS_CLIENT_ID = import.meta.env.VITE_MS_CLIENT_ID || "";
const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
const SCOPE = "Files.ReadWrite.AppFolder User.Read offline_access";
const G = "https://graph.microsoft.com/v1.0";
const SETTINGS_NAME = "BindLens library.json";
const SELECT = "id,name,size,lastModifiedDateTime,parentReference,folder,file,cTag,eTag,webUrl";

function b64url(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function redirectUri() { return location.origin + import.meta.env.BASE_URL + "ms.html"; }

export class OneDriveStore {
  constructor() {
    this.kind = "onedrive";
    this.cloud = "OneDrive";
    this.token = null;
    this.refresh = null;
    this.expires = 0;
    this.user = null;
    this.rootId = null;
    this.settingsId = null;
    this.onNeedSignIn = null;
  }

  // a small window with Microsoft's sign-in; it comes back to ms.html, which hands the code to this page
  async signIn() {
    if (!MS_CLIENT_ID) throw new Error(_t("OneDrive is not ready yet in BindLens Web"));
    try {
      const saved = JSON.parse(localStorage.getItem("bl_ms") || "null");
      if (saved && saved.refresh) { this.refresh = saved.refresh; if (await this.renew()) { await this.loadUser(); return; } }
    } catch (e) {}
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
    const url = `${AUTH}/authorize?client_id=${MS_CLIENT_ID}&response_type=code&response_mode=query&redirect_uri=${encodeURIComponent(redirectUri())}` +
      `&scope=${encodeURIComponent(SCOPE)}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256&prompt=select_account`;
    const w = window.open(url, "bl-ms", "width=520,height=680");
    if (!w) throw new Error(_t("The browser stopped the sign-in window. Allow pop-ups for bindlens.com and try again."));
    const code = await new Promise((resolve, reject) => {
      const done = (e) => {
        if (e.origin !== location.origin || !e.data || e.data.type !== "bl-ms") return;
        window.removeEventListener("message", done);
        clearInterval(t);
        if (e.data.state !== state) reject(new Error(_t("The sign-in did not match. Try again.")));
        else if (e.data.error) reject(new Error(e.data.error));
        else resolve(e.data.code);
      };
      window.addEventListener("message", done);
      const t = setInterval(() => { if (w.closed) { clearInterval(t); window.removeEventListener("message", done); reject(new Error(_t("The sign-in window was closed."))); } }, 800);
    });
    const r = await fetch(`${AUTH}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: MS_CLIENT_ID, grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: verifier, scope: SCOPE }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || _t("Microsoft did not sign you in"));
    this.setToken(j);
    await this.loadUser();
  }

  setToken(j) {
    this.token = j.access_token;
    this.expires = Date.now() + (j.expires_in || 3600) * 1000 - 60000;
    if (j.refresh_token) this.refresh = j.refresh_token;
    try { localStorage.setItem("bl_ms", JSON.stringify({ refresh: this.refresh })); } catch (e) {}
  }

  async renew() {
    if (!this.refresh) return false;
    const r = await fetch(`${AUTH}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: MS_CLIENT_ID, grant_type: "refresh_token", refresh_token: this.refresh, scope: SCOPE }) });
    if (!r.ok) { this.refresh = null; try { localStorage.removeItem("bl_ms"); } catch (e) {} return false; }
    this.setToken(await r.json());
    return true;
  }

  async loadUser() {
    const me = await this.json(`${G}/me?$select=displayName,mail,userPrincipalName`);
    this.user = { name: shortName(me.displayName || ""), email: me.mail || me.userPrincipalName || "" };
    try { localStorage.setItem("bl_email", this.user.email); localStorage.setItem("bl_signed_in", "1"); localStorage.setItem("bl_cloud", "onedrive"); } catch (e) {}
  }

  signOut() {
    this.token = null; this.refresh = null;
    try { localStorage.removeItem("bl_ms"); } catch (e) {}
  }

  async fetch(url, opts = {}, retry = true) {
    if (!this.token || Date.now() > this.expires) {
      if (!(await this.renew())) { if (this.onNeedSignIn) await this.onNeedSignIn(); else await this.signIn(); }
    }
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + this.token } });
    if (r.status === 401 && retry) { this.token = null; return this.fetch(url, opts, false); }
    if (!r.ok) {
      let msg = "OneDrive: " + r.status;
      try { const j = await r.json(); msg = j.error?.message || msg; } catch (e) {}
      throw new Error(msg);
    }
    return r;
  }

  async json(url, opts) { return (await this.fetch(url, opts)).json(); }

  norm(it) {
    const parent = it.parentReference?.id || null;
    return { id: it.id, name: it.name, mime: it.file?.mimeType || mimeOf(it.name), size: it.size ?? null,
      modified: it.lastModifiedDateTime, md5: (it.cTag || it.eTag || "").replace(/\W/g, "").slice(-24), book: parent, parent, web: it.webUrl };
  }

  async init() {
    const root = await this.json(`${G}/me/drive/special/approot?$select=id,name,webUrl`);
    this.rootId = root.id;
    this.rootUrl = root.webUrl;
  }

  async children(id) {
    const out = [];
    let url = `${G}/me/drive/items/${id}/children?$top=999&$select=${SELECT}`;
    while (url) { const j = await this.json(url); out.push(...j.value); url = j["@odata.nextLink"] || null; }
    return out;
  }

  async listAll() {
    const top = await this.children(this.rootId);
    const settings = top.filter(x => x.file && x.name === SETTINGS_NAME).sort((a, b) => (b.lastModifiedDateTime || "").localeCompare(a.lastModifiedDateTime || ""))[0];
    if (settings) this.settingsId = settings.id;
    const books = top.filter(x => x.folder);
    const files = [], subs = [];
    const walk = async (folder, book, path, depth) => {
      for (const it of await this.children(folder.id)) {
        if (it.folder) {
          if (depth > 10) continue;
          const p = (path ? path + "/" : "") + it.name;
          subs.push({ id: it.id, name: it.name, book: book.id, path: p });
          await walk(it, book, p, depth + 1);
        } else files.push({ ...this.norm(it), book: book.id, sub: path, parent: folder.id });
      }
    };
    for (const b of books) await walk(b, b, "", 0);
    const loose = top.filter(x => x.file && x.name !== SETTINGS_NAME).map(x => this.norm(x));
    return { books: books.map(b => ({ id: b.id, name: b.name, modified: b.lastModifiedDateTime })), files, loose, subs };
  }

  async createFolder(name, parent) {
    return this.json(`${G}/me/drive/items/${parent || this.rootId}/children`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }),
    });
  }

  async createBook(name) { const f = await this.createFolder(name, this.rootId); return { id: f.id, name: f.name, modified: f.lastModifiedDateTime }; }
  async createSub(name, parent) { const f = await this.createFolder(name, parent); return { id: f.id, name: f.name }; }

  async rename(id, name) {
    return this.json(`${G}/me/drive/items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  }

  async trash(id) { await this.fetch(`${G}/me/drive/items/${id}`, { method: "DELETE" }); }   // to the OneDrive recycle bin
  async untrash() {}

  async move(id, from, to) {
    const it = await this.json(`${G}/me/drive/items/${id}?$select=${SELECT}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentReference: { id: to } }),
    });
    return this.norm(it);
  }

  async release() { throw new Error(_t("BindLens can only use its own folder in OneDrive (Apps/BindLens)")); }

  async read(file) {
    const key = file.id + ":" + (file.md5 || file.modified || "");
    const cached = await idb.get("files", key);
    if (cached) return cached.slice(0);
    const r = await this.fetch(`${G}/me/drive/items/${file.id}/content`);
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 60 * 1024 * 1024) idb.set("files", key, buf.slice(0));
    return buf;
  }

  // over 4 MB: an upload session, in parts of 5 MB (a multiple of 320 KB, as OneDrive wants)
  async session(url, bytes, opt = {}) {
    const s = await this.json(url, { method: "POST", signal: opt.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }) });
    const size = bytes.byteLength, part = 320 * 1024 * 16;
    let last;
    for (let at = 0; at < size; at += part) {
      const end = Math.min(size, at + part);
      const r = await fetch(s.uploadUrl, { method: "PUT", signal: opt.signal, headers: { "Content-Range": `bytes ${at}-${end - 1}/${size}` }, body: bytes.slice(at, end) });
      if (!r.ok) throw new Error(_t("OneDrive: the upload stopped (") + r.status + ")");
      if (opt.onProgress) opt.onProgress(end, size);
      last = r;
    }
    return last.json();
  }

  async write(file, bytes) {
    let it;
    if (bytes.byteLength > 4 * 1024 * 1024) it = await this.session(`${G}/me/drive/items/${file.id}/createUploadSession`, bytes);
    else it = await this.json(`${G}/me/drive/items/${file.id}/content`, { method: "PUT", headers: { "Content-Type": file.mime || "application/octet-stream" }, body: bytes });
    const f = { ...this.norm(it), parent: file.parent, book: file.book };
    if (bytes.byteLength < 60 * 1024 * 1024) idb.set("files", f.id + ":" + (f.md5 || f.modified), bytes.slice ? bytes.slice(0) : bytes);
    return f;
  }

  async create(parentId, name, bytes, mime, opt = {}) {
    const path = `${G}/me/drive/items/${parentId}:/${encodeURIComponent(name)}:`;
    let it;
    if (bytes.byteLength > 4 * 1024 * 1024) it = await this.session(`${path}/createUploadSession`, bytes, opt);
    else it = await this.json(`${path}/content?@microsoft.graph.conflictBehavior=rename`, { method: "PUT", signal: opt.signal, headers: { "Content-Type": mime || mimeOf(name) }, body: bytes });
    if (opt.onProgress) opt.onProgress(bytes.byteLength, bytes.byteLength);
    const f = this.norm(it);
    if (bytes.byteLength < (opt.keep === false ? 0 : 20 * 1024 * 1024)) idb.set("files", f.id + ":" + (f.md5 || f.modified), bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes);
    return f;
  }

  async copy(file, bookId, name) { return this.create(bookId, name || file.name, await this.read(file), file.mime); }

  async loadSettings() {
    if (!this.settingsId) {
      try { const it = await this.json(`${G}/me/drive/special/approot:/${encodeURIComponent(SETTINGS_NAME)}?$select=id`); this.settingsId = it.id; } catch (e) { return {}; }
    }
    try { return await (await this.fetch(`${G}/me/drive/items/${this.settingsId}/content`)).json(); } catch (e) { return {}; }
  }

  async saveSettings(obj) {
    const body = JSON.stringify(obj, null, 1);
    const it = await this.json(`${G}/me/drive/items/${this.rootId}:/${encodeURIComponent(SETTINGS_NAME)}:/content`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body });
    this.settingsId = it.id;
  }

  async revisions(file) {
    const j = await this.json(`${G}/me/drive/items/${file.id}/versions`);
    return (j.value || []).map(v => ({ id: v.id, modified: v.lastModifiedDateTime, size: v.size ?? null }));
  }

  async readRevision(file, revId) {
    return (await this.fetch(`${G}/me/drive/items/${file.id}/versions/${revId}/content`)).arrayBuffer();
  }

  // Word, Excel, PowerPoint (also old .doc, .ppt, .rtf, .odt) as they really look: OneDrive gives them as PDF
  async officePdf(file) { return (await this.fetch(`${G}/me/drive/items/${file.id}/content?format=pdf`)).arrayBuffer(); }

  webLink(file) { return file.web || this.rootUrl || "https://onedrive.live.com/"; }
  folderLink() { return this.rootUrl || "https://onedrive.live.com/"; }
  async pick() { return []; }
  async meta(id) { return this.norm(await this.json(`${G}/me/drive/items/${id}?$select=${SELECT}`)); }
}
