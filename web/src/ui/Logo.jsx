// The BindLens logo, alive as in the Windows app: a golden light runs round it, the lens looks around now and then
// (and on hover), and circles while BindLens is busy saving.
import { saving } from "../state.js";

const K = Math.PI / 180;
const cx = 155.7, cy = 118.5, rr = 45.2;
const ARC = [[101, 78], [cx + rr * Math.cos(126 * K), 78]];
for (let i = 0; i < 25; i++) { const a = (126 + (234 - 126) * i / 24) * K; ARC.push([cx + rr * Math.cos(a), cy - rr * Math.sin(a)]); }
ARC.push([cx + rr * Math.cos(234 * K), 159], [101, 159]);
const ARC_D = "M" + ARC.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L");

export function Logo({ size = 54, title = "BindLens", still = false }) {
  const busy = saving.value.n > 0;
  return (
    <span class={"logo-wrap" + (busy ? " busy" : "") + (still ? " still" : "")} style={{ width: size + "px", height: size + "px" }} title={title}>
      <svg viewBox="18 18 220 220" width={size - 4} height={size - 4} aria-hidden="true">
        <defs>
          <clipPath id="bl-glass"><circle cx="153" cy="121" r="19" /></clipPath>
        </defs>
        <rect x="18" y="18" width="220" height="220" rx="52" fill="#111218" />
        <rect x="74" y="48" width="27" height="151" rx="3.3" fill="#FFFFFF" />
        {[80, 120, 160].map(y => <circle key={y} cx="87" cy={y} r="4.6" fill="#111218" />)}
        <path d={ARC_D} fill="none" stroke="#FF85C2" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round" />
        <rect x="99" y="165" width="65.5" height="12.5" rx="5.6" fill="#FFFFFF" />
        <rect x="99" y="180" width="70.5" height="8.5" rx="3.8" fill="#FFFFFF" />
        <rect x="99" y="191" width="76" height="8.5" rx="3.8" fill="#FFFFFF" />
        <g class="lens">
          <circle cx="153" cy="121" r="27" fill="none" stroke="#FFC83D" stroke-width="16" />
          <path d="M172.5 140.5 L196 164" stroke="#FFC83D" stroke-width="14" stroke-linecap="round" />
          <g clip-path="url(#bl-glass)"><g transform="rotate(45 153 121)"><rect class="glint" x="148" y="80" width="9" height="90" fill="#FFFFFF" /></g></g>
        </g>
      </svg>
    </span>
  );
}
