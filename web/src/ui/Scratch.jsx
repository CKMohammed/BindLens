// The pencil of reading: draw on the screen to point at something - nothing is saved. It goes when the page
// changes, when you scroll, or when the pencil is put away (its icon again).
import { useEffect, useRef } from "preact/hooks";
import { fileId, pageNo } from "../state.js";
import { scratch } from "../consult.js";

const INKS = ["#C2337A", "#111218", "#E0A82E"];

export function Scratch() {
  const ref = useRef();
  const ink = INKS[0];
  const last = useRef(null);
  const clear = () => { const c = ref.current; if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height); };
  useEffect(() => {
    const c = ref.current;
    const fit = () => { const d = devicePixelRatio || 1; c.width = c.clientWidth * d; c.height = c.clientHeight * d; c.getContext("2d").setTransform(d, 0, 0, d, 0, 0); };
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);
  useEffect(clear, [fileId.value, pageNo.value]);
  const at = (e) => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = at(e); };
  const move = (e) => {
    if (!last.current) return;
    const g = ref.current.getContext("2d"), p = at(e);
    g.strokeStyle = ink; g.lineWidth = e.pointerType === "pen" ? 2 + 3 * (e.pressure || 0.5) : 3; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(...last.current); g.lineTo(...p); g.stroke();
    last.current = p;
  };
  const up = () => { last.current = null; };
  const wheel = (e) => { clear(); const pg = document.querySelector(".pages"); if (pg) pg.scrollBy(0, e.deltaY); };
  return (
    <>
      <canvas ref={ref} class="scratch" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} />
    </>
  );
}
