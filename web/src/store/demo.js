// The example library: try BindLens without signing in. The books come with the page (demo/manifest.json);
// everything you change stays in this browser tab and is gone when you close it.
import { uid } from "../util.js";
import { _t } from "../i18n.js";

export class DemoStore {
  constructor() {
    this.kind = "demo";
    this.user = { name: _t("Example library"), email: "" };
    this.books = [];
    this.files = [];
    this.data = new Map();
    this.subs = [];             // folders inside books: {id, name, parent}
    this.versions = new Map();  // file id -> [{id, modified, size, bytes}]
    this.settings = {};
    this.rootId = "demo-root";
    this.base = import.meta.env.BASE_URL + "demo/";
  }

  async signIn() {}
  signOut() {}

  async init() {
    // the example library stands on two named shelves, as an office or a university would use it
    const SHELF_OF = { Clients: "Office & administration", Contracts: "Office & administration", Insurance: "Office & administration",
      "Invoices 2026": "Office & administration", "Meeting notes": "Office & administration", Projects: "Office & administration",
      "Taxes 2025": "Office & administration", "Lecture notes": "University", "Research papers": "University", Thesis: "University" };
    const r = await fetch(this.base + "manifest.json");
    const m = await r.json();
    const now = new Date().toISOString();
    const looks = {};                    // some example books show their own icon (as you can choose in "Icon and colour")
    for (const b of m.books) {
      const id = "b-" + uid();
      this.books.push({ id, name: _t(b.name + "@@book"), modified: now });
      if (b.icon) looks[id] = { icon: b.icon, tstyle: b.tstyle || "3d" };
      const shelf = SHELF_OF[b.name];
      if (shelf) looks[id] = { ...(looks[id] || {}), shelf: _t(shelf) };
      for (const f of b.files) {
        this.files.push({ id: "f-" + uid(), name: f.name, mime: f.mime, size: f.size, modified: now, md5: "", book: id,
          parent: id, path: f.path });
      }
    }
    const soon = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
    this.settings = { ...(m.settings || {}), books: looks, shelves: [_t("Office & administration"), _t("University")],
      countdowns: [{ id: "cd1", text: _t("Thesis submission"), date: soon }] };
  }

  placeOf(id) {
    if (this.books.some(b => b.id === id)) return { book: id, path: "" };
    const s = this.subs.find(x => x.id === id);
    if (!s) return null;
    const up = this.placeOf(s.parent);
    return up && { book: up.book, path: (up.path ? up.path + "/" : "") + s.name };
  }

  async listAll() {
    const subs = this.subs.map(s => ({ id: s.id, name: s.name, ...this.placeOf(s.id) })).filter(s => s.book);
    const files = this.files.map(f => { const w = this.placeOf(f.parent || f.book); return w && { ...f, book: w.book, sub: w.path, parent: f.parent || f.book }; }).filter(Boolean);
    return { books: this.books.map(b => ({ ...b })), files, loose: [], subs };
  }

  async release(id) { return this.trash(id); }

  async createSub(name, parent) {
    const s = { id: "s-" + uid(), name, parent };
    this.subs.push(s);
    return { id: s.id, name };
  }

  async revisions(file) {
    return (this.versions.get(file.id) || []).map(v => ({ id: v.id, modified: v.modified, size: v.size })).reverse();
  }

  async readRevision(file, revId) {
    const v = (this.versions.get(file.id) || []).find(x => x.id === revId);
    return v.bytes.slice(0);
  }

  async createBook(name) {
    const b = { id: "b-" + uid(), name, modified: new Date().toISOString() };
    this.books.push(b);
    return { ...b };
  }

  async rename(id, name) {
    const b = this.books.find(x => x.id === id) || this.subs.find(x => x.id === id);
    if (b) { b.name = name; return { ...b }; }
    const f = this.files.find(x => x.id === id);
    if (f) { f.name = name; f.modified = new Date().toISOString(); return { ...f }; }
  }

  async trash(id) {
    const gone = new Set([id]);
    let more = true;
    while (more) { more = false; for (const s of this.subs) if (gone.has(s.parent) && !gone.has(s.id)) { gone.add(s.id); more = true; } }
    this.books = this.books.filter(b => b.id !== id);
    this.subs = this.subs.filter(s => !gone.has(s.id));
    this.files = this.files.filter(f => f.id !== id && !gone.has(f.parent || f.book));
  }

  async untrash() {}

  async move(id, fromBook, toBook) {
    const f = this.files.find(x => x.id === id);
    const w = this.placeOf(toBook);
    f.parent = toBook;
    f.book = w ? w.book : toBook;
    return { ...f, sub: w ? w.path : "" };
  }

  async read(file) {
    if (this.data.has(file.id)) return this.data.get(file.id).slice(0);
    const f = this.files.find(x => x.id === file.id) || file;
    const r = await fetch(this.base + f.path);
    if (!r.ok) throw new Error(_t("Could not load ") + f.name);
    return r.arrayBuffer();
  }

  async write(file, bytes) {
    const buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    // keep the version before, like Google Drive does
    try {
      const before = await this.read(file);
      const list = this.versions.get(file.id) || [];
      if (!list.length) list.push({ id: "v-" + uid(), modified: file.modified || new Date().toISOString(), size: before.byteLength, bytes: before });
      list.push({ id: "v-" + uid(), modified: new Date().toISOString(), size: buf.byteLength, bytes: buf.slice(0) });
      this.versions.set(file.id, list.slice(-30));
    } catch (e) {}
    this.data.set(file.id, buf.slice(0));
    const f = this.files.find(x => x.id === file.id);
    f.size = buf.byteLength;
    f.modified = new Date().toISOString();
    f.md5 = uid();
    return { ...f };
  }

  async create(bookId, name, bytes, mime, opt = {}) {
    const buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    // the example library has no network: it shows the progress all the same, quickly
    if (opt.onProgress) for (let k = 1; k <= 4; k++) { if (opt.signal?.aborted) throw Object.assign(new Error(_t("Stopped")), { name: "AbortError" }); await new Promise(r => setTimeout(r, Math.min(400, 60 + buf.byteLength / 40000))); opt.onProgress(buf.byteLength * k / 4, buf.byteLength); }
    const w = this.placeOf(bookId);
    const f = { id: "f-" + uid(), name, mime, size: buf.byteLength, modified: new Date().toISOString(), md5: uid(), book: w ? w.book : bookId, parent: bookId, sub: w ? w.path : "" };
    this.files.push(f);
    this.data.set(f.id, buf.slice(0));
    return { ...f };
  }

  async copy(file, bookId, name) {
    const bytes = await this.read(file);
    return this.create(bookId, name || file.name, bytes, file.mime);
  }

  async loadSettings() { return JSON.parse(JSON.stringify(this.settings)); }
  async saveSettings(obj) { this.settings = JSON.parse(JSON.stringify(obj)); }

  webLink() { return ""; }
  folderLink() { return ""; }
  async pick() { return []; }
}
