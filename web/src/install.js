// "Install BindLens as an app": the browser's own install (Chrome, Edge), when it offers it.
import { signal } from "@preact/signals";
export const installPrompt = signal(null);
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt.value = e; });
  window.addEventListener("appinstalled", () => { installPrompt.value = null; });
}
export async function installApp() {
  const e = installPrompt.value;
  if (!e) return false;
  e.prompt();
  try { await e.userChoice; } catch (err) {}
  installPrompt.value = null;
  return true;
}
