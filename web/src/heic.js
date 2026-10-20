// Photos from an iPhone (HEIC / HEIF) become JPEG as they come in, so every browser can show them and put them in a
// PDF. Safari reads HEIC itself; the others use heic2any (MIT, with libheif - LGPL), loaded only when needed.
import { toast } from "./state.js";
import { _t } from "./i18n.js";

export const isHeic = (f) => !!f && (/\.(heic|heif)$/i.test(f.name || "") || /image\/hei[cf]/i.test(f.type || ""));
const jpgName = (n) => (n || "photo").replace(/\.(heic|heif)$/i, "") + ".jpg";

async function viaCanvas(file) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d").drawImage(bmp, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.9));
  if (!blob) throw new Error("no jpeg");
  return blob;
}

export async function fromHeic(file) {
  let blob;
  try { blob = await viaCanvas(file); } catch (e) {
    const { default: heic2any } = await import("heic2any");
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    blob = Array.isArray(out) ? out[0] : out;
  }
  return new File([blob], jpgName(file.name), { type: "image/jpeg", lastModified: file.lastModified || Date.now() });
}

// the same list, with every HEIC photo as a JPEG (one that cannot be read stays as it is)
export async function fixHeic(files) {
  if (!files || !files.some(isHeic)) return files;
  toast(_t("Turning the iPhone photos (HEIC) into JPEG..."));
  return Promise.all(files.map(f => isHeic(f) ? fromHeic(f).catch(() => f) : f));
}
