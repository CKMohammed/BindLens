// The example library: try BindLens without signing in. The books come with the page (demo/manifest.json);
// everything you change stays in this browser tab and is gone when you close it.
import { uid } from "../util.js";

export class DemoStore {
  constructor() {
    this.kind = "demo";
    this.user = { name: "Example library", email: "" };
    this.books = [];
    this.files = [];
    this.data = new Map();
    this.settings = {};
    this.rootId = "demo-root";
    this.base = import.meta.env.BASE_URL + "demo/";
  }

  async signIn() {}
  signOut() {}

  async init() {
    const r = await fetch(this.base + "manifest.json");
    const m = await r.json();
    const now = new Date().toISOString();
    for (const b of m.books) {
      const id = "b-" + uid();
      this.books.push({ id, name: b.name, modified: now });
      for (const f of b.files) {
        this.files.push({ id: "f-" + uid(), name: f.name, mime: f.mime, size: f.size, modified: now, md5: "", book: id,
          path: f.path });
      }
    }
    this.settings = m.settings || {};
  }

  async listAll() {
    return { books: this.books.map(b => ({ ...b })), files: this.files.map(f => ({ ...f })), loose: [] };
  }

  async createBook(name) {
    const b = { id: "b-" + uid(), name, modified: new Date().toISOString() };
    this.books.push(b);
    return { ...b };
  }

  async rename(id, name) {
    const b = this.books.find(x => x.id === id);
    if (b) { b.name = name; return { ...b }; }
    const f = this.files.find(x => x.id === id);
    if (f) { f.name = name; f.modified = new Date().toISOString(); return { ...f }; }
  }

  async trash(id) {
    this.books = this.books.filter(b => b.id !== id);
    this.files = this.files.filter(f => f.id !== id && f.book !== id);
  }

  async untrash() {}

  async move(id, fromBook, toBook) {
    const f = this.files.find(x => x.id === id);
    f.book = toBook;
    return { ...f };
  }

  async read(file) {
    if (this.data.has(file.id)) return this.data.get(file.id).slice(0);
    const f = this.files.find(x => x.id === file.id) || file;
    const r = await fetch(this.base + f.path);
    if (!r.ok) throw new Error("Could not load " + f.name);
    return r.arrayBuffer();
  }

  async write(file, bytes) {
    const buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    this.data.set(file.id, buf.slice(0));
    const f = this.files.find(x => x.id === file.id);
    f.size = buf.byteLength;
    f.modified = new Date().toISOString();
    f.md5 = uid();
    return { ...f };
  }

  async create(bookId, name, bytes, mime) {
    const buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const f = { id: "f-" + uid(), name, mime, size: buf.byteLength, modified: new Date().toISOString(), md5: uid(), book: bookId };
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
