// Locked with a PIN: on a shared computer, nobody opens BindLens without the four digits.
import { useEffect, useState } from "preact/hooks";
import { locked, settings, store, setSetting, toast } from "../state.js";
import { sha256 } from "../util.js";

export async function pinHash(pin) {
  return sha256("bindlens-pin:" + (store.value?.user?.email || "") + ":" + pin);
}

export function Lock() {
  const [pin, setPin] = useState("");
  const [bad, setBad] = useState(false);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 10000); return () => clearInterval(t); }, []);
  const press = async (d) => {
    const p = (pin + d).slice(0, 4);
    setPin(p);
    setBad(false);
    if (p.length === 4) {
      if (await pinHash(p) === settings.value.pin) locked.value = false;
      else { setBad(true); setTimeout(() => setPin(""), 400); }
    }
  };
  useEffect(() => {
    const k = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === "Backspace") setPin(p => p.slice(0, -1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  return (
    <div class="lock">
      <div style={{ textAlign: "center" }}>
        <img src={import.meta.env.BASE_URL + "icon.png"} alt="" style={{ width: 64, height: 64, borderRadius: 16, boxShadow: "0 0 0 2px #F2C85A" }} />
        <div class="clock" style={{ marginTop: 14 }}>{now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
        <div style={{ opacity: .8 }}>{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
        <p style={{ marginTop: 18, fontWeight: 700 }}>{bad ? "That PIN is not right. Try again." : "Type your PIN"}</p>
        <div class="dots">{[0, 1, 2, 3].map(i => <i key={i} class={i < pin.length ? "f" : ""} />)}</div>
        <div class="pad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "<"].map((d, i) => d === "" ? <span key={i} /> :
            <button key={i} onClick={() => d === "<" ? setPin(p => p.slice(0, -1)) : press(d)}>{d === "<" ? "⌫" : d}</button>)}
        </div>
        <p style={{ marginTop: 22, fontSize: 13, opacity: .8 }}>Forgot it? <a style={{ color: "#fff" }} href="#" onClick={async (e) => {
          e.preventDefault();
          try {
            await store.value.signIn(false);
            setSetting("pin", null);
            locked.value = false;
            toast("The PIN is off. You can choose a new one in Settings.");
          } catch (err) { toast("Google did not confirm it is you: " + err.message, "bad"); }
        }}>Check it is you with Google</a> and the PIN comes off.</p>
      </div>
    </div>
  );
}
