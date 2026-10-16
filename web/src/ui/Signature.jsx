// Your signature: draw it once (finger, pen or mouse), then put it on any page with the Signature tool.
import { useEffect, useRef, useState } from "preact/hooks";
import { panel, settings, setSetting, tool, toast } from "../state.js";
import { Dialog } from "./dialogs.jsx";

export function Signature() {
  const ref = useRef();
  const [has, setHas] = useState(false);
  const [color, setColor] = useState("#1B2A6B");
  const pts = useRef([]);
  const drawing = useRef(false);
  const close = () => { panel.value = null; };
  useEffect(() => {
    const c = ref.current;
    c.width = c.clientWidth * 2; c.height = c.clientHeight * 2;
  }, []);
  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return [(e.clientX - r.left) * 2, (e.clientY - r.top) * 2]; };
  const down = (e) => { ref.current.setPointerCapture(e.pointerId); drawing.current = true; pts.current = [pos(e)]; };
  const move = (e) => {
    if (!drawing.current) return;
    const p = pos(e);
    const ctx = ref.current.getContext("2d");
    const last = pts.current[pts.current.length - 1];
    ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
    pts.current.push(p);
    setHas(true);
  };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = ref.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); setHas(false); };
  const save = () => {
    const c = ref.current;
    // crop to the ink
    const ctx = c.getContext("2d");
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 10) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 <= x0) return;
    const pad = 8;
    const out = document.createElement("canvas");
    out.width = x1 - x0 + pad * 2; out.height = y1 - y0 + pad * 2;
    out.getContext("2d").drawImage(c, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
    const png = out.toDataURL("image/png");
    setSetting("signatures", [{ png, w: out.width, h: out.height }]);
    tool.value = "sign";
    toast("Click on a page to put your signature there.", "ok", 4000);
    close();
  };
  const old = (settings.value.signatures || [])[0];
  return (
    <Dialog title="Your signature" icon="sign" onClose={close} cls="mid"
      foot={<><button class="btn plain" onClick={clear}>Start again</button><span class="grow" />
        <button class="btn plain" onClick={close}>Cancel</button><button class="btn" disabled={!has} onClick={save}>Use this signature</button></>}>
      <p class="small muted" style={{ marginTop: 0 }}>Sign in the box with your finger, a pen or the mouse. It is kept in your Drive (in the BindLens settings), only for you.</p>
      <div class="row" style={{ marginBottom: 8 }}>
        {["#1B2A6B", "#1E1C2B", "#1C7ED6"].map(c => <button key={c} class="swatch" style={{ background: c, border: 0, outline: c === color ? "3px solid var(--accent)" : "" }} onClick={() => setColor(c)} />)}
      </div>
      <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up}
        style={{ width: "100%", height: 200, background: "#fff", borderRadius: 12, border: "1.5px dashed var(--line2)", touchAction: "none", cursor: "crosshair" }} />
      {old && <div class="row" style={{ marginTop: 10 }}><span class="small muted">Your signature now:</span><img src={old.png} alt="" style={{ height: 40, background: "#fff", borderRadius: 6 }} /></div>}
    </Dialog>
  );
}
