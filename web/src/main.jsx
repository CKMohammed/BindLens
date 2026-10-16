import { render } from "preact";
import "./styles.css";
import { App } from "./ui/App.jsx";
import { toast } from "./state.js";

// anything that goes wrong is said in a line at the bottom, not lost
window.addEventListener("unhandledrejection", (e) => {
  const m = String(e.reason?.message || e.reason || "");
  if (!m || /AbortError|The user aborted/i.test(m)) return;
  console.error(e.reason);
  toast("Something did not work: " + m, "bad", 6000);
});

render(<App />, document.getElementById("app"));
