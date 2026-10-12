import { useEffect, useState, useCallback, useRef } from "react";
import { Routes, Route, useParams, useNavigate } from "react-router-dom";
import { fetchHealth, createRoom, joinRoom, startRound, submitAcro, castVote, getAuth, doneVoting } from "./services/api";
import { useSignalR } from "./hooks/useSignalR";
import { useLobbyHub } from "./hooks/useLobbyHub";

// ── Design tokens ──────────────────────────────────────────────
// ── Colour schemes ─────────────────────────────────────────────
// Each player picks one with the swatches in the header (saved in their browser).
// Every colour name below becomes a CSS variable (--c-bgApp, --c-brand, …); C points at those
// variables, so switching a scheme recolours the whole page at once without a reload.
// onBrand = text colour on a "brand" (button) background; bgGradient = optional sky behind the page.
const THEMES = {
  midnight: {  // Midnight — the original night ride
    name: "Midnight",
    bgApp: "#070b14", bgPanel: "#131A2E", bgPanel2: "#1A233B", border: "#2B3758",
    textPrimary: "#F3F4F8", textSecond: "#C7CEE0", textMuted: "#94A0BE",
    brand: "#F26A5E", brandHover: "#FF7A6B", onBrand: "#FFF8F6",
    teal: "#6FB7C8", tealLight: "#8FD0DE", lavender: "#B7B3E6", ivory: "#F2E6D8",
    success: "#4FAF8F", navy2: "#24314D", navy3: "#2C3B5F", bgGradient: "none",
    danger: "#8B2020", dangerHover: "#A52828",
  },
  twilight: {  // Twilight — the same sky just after sunset, less dark (Fran)
    name: "Twilight",
    // Brighter text, accents and borders for more contrast; the background stays as it was (Damon)
    bgApp: "#232B3F", bgPanel: "#2E3852", bgPanel2: "#36415E", border: "#6274A6",
    textPrimary: "#F7F8FC", textSecond: "#E4E8F2", textMuted: "#C2CADF",
    brand: "#F27D6E", brandHover: "#FF8E7F", onBrand: "#FFFFFF",
    teal: "#94DCE8", tealLight: "#B2E6EF", lavender: "#D4D0F7", ivory: "#FFF4E8",
    success: "#5CC09D", navy2: "#36415E", navy3: "#414D70", bgGradient: "none",
    danger: "#A63A3A", dangerHover: "#BC4A4A",
  },
  nightfall: { // Nightfall — mossy olive greens with a lime glow, from Damon's "Mossy hollow" palette
                // (#636B2F moss, #BAC095 sage, #D4DE95 lime, #3D4127 olive) plus a deeper olive background
    name: "Nightfall",
    bgApp: "#23261A", bgPanel: "#3D4127", bgPanel2: "#474C2E", border: "#636B2F",
    textPrimary: "#F4F6E6", textSecond: "#E1E5C8", textMuted: "#BAC095",
    brand: "#D4DE95", brandHover: "#E0E9A6", onBrand: "#2A2E14",
    teal: "#D4DE95", tealLight: "#E4ECB0", lavender: "#C9D0A8", ivory: "#F1EFD8",
    success: "#A8C766", navy2: "#474C2E", navy3: "#565D2B", bgGradient: "none",
    danger: "#9A3B22", dangerHover: "#B04A2E",
  },
  daybreak: {  // Daybreak — from Damon's Midjourney picture: sky blue, cloud lavender,
               // salmon towers, teal domes, a pink horizon at dawn
    name: "Daybreak",
    bgApp: "#4A78A3", bgPanel: "#2F4A75", bgPanel2: "#385786", border: "#7184B8",
    textPrimary: "#FFF6EC", textSecond: "#E6E8F6", textMuted: "#BCC3E2",
    brand: "#F2967C", brandHover: "#F8AA93", onBrand: "#22304F",
    teal: "#86D0D2", tealLight: "#A9E0E1", lavender: "#CFCCF3", ivory: "#FFF1E3",
    success: "#74CDAC", navy2: "#385786", navy3: "#42639A",
    bgGradient: "linear-gradient(180deg, #4A78A3 0%, #6E8FC2 62%, #C9A3C2 86%, #EDA79F 100%)",
    danger: "#A8455A", dangerHover: "#BC566B",
  },
};
const THEME_KEYS = ["midnight", "twilight", "nightfall", "daybreak"];
const COLOR_NAMES = ["bgApp", "bgPanel", "bgPanel2", "border", "textPrimary", "textSecond", "textMuted",
  "brand", "brandHover", "onBrand", "teal", "tealLight", "lavender", "ivory", "success", "navy2", "navy3",
  "danger", "dangerHover"];   // danger = red for actions like Log out
// C.brand → "var(--c-brand)" and so on
const C = Object.fromEntries(COLOR_NAMES.map(n => [n, `var(--c-${n})`]));

// The palette this browser chose last time (Midnight if none or unknown)
function loadThemeKey() {
  try {
    let k = localStorage.getItem("acro.theme");
    if (k === "lamplight") k = "nightfall";   // the green palette's old name — keep the player's choice
    return THEMES[k] ? k : "midnight";
  } catch { return "midnight"; }
}
// Puts a scheme's colours into the CSS variables on <html> and remembers the choice
function applyTheme(key) {
  const t = THEMES[key] || THEMES.midnight;
  const root = document.documentElement;
  for (const n of COLOR_NAMES) root.style.setProperty(`--c-${n}`, t[n]);
  root.style.setProperty("--c-bgGradient", t.bgGradient);
  try { localStorage.setItem("acro.theme", key); } catch { /* private mode: just not remembered */ }
}
applyTheme(loadThemeKey());   // before the first render, so the page never flashes the wrong colours

// ── Sound settings ─────────────────────────────────────────────
// One switch and one volume for all game sounds (song, second tune, drumroll), saved in the
// browser. Applied as a volume factor on top of the game's own fades — the game's own "muted"
// (the song plays silently after you submit) is left alone.
function loadSound() {
  try {
    const s = JSON.parse(localStorage.getItem("acro.sound") || "null");
    if (s && typeof s.on === "boolean" && typeof s.volume === "number") return s;
  } catch { /* ignore */ }
  return { on: true, volume: 1 };   // default: sound on, full volume (as before)
}
let soundSettings = loadSound();
// The factor every game sound is multiplied by (0 = silent)
function soundGain() { return soundSettings.on ? soundSettings.volume : 0; }
// Saves new settings and tells the room to update the sounds that are playing now
function setSoundSettings(next) {
  soundSettings = next;
  try { localStorage.setItem("acro.sound", JSON.stringify(next)); } catch { /* ignore */ }
  window.dispatchEvent(new Event("acro-sound-change"));
}

// A small header button that opens a menu underneath it (used by "Express Colors" and "Sound").
// Closes when you click outside it or press Escape.
function HeaderMenu({ label, children, width = 230 }) {
  const [open, setOpen] = useState(false);
  // Phones (narrow screens): the menu opens as a panel in the middle of the screen, always fully
  // visible with big rows — under the button it could end up partly off-screen (Sandy, 2026-10-12)
  const [sheet, setSheet] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    // "pointerdown" = a mouse press OR a finger tap (mousedown wasn't reliable on every phone)
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const toggle = () => {
    setSheet(window.innerWidth < 600);   // decide each time it opens (the phone may have been turned)
    setOpen(o => !o);
  };
  const panel = { background: C.bgPanel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", boxShadow: "0 12px 32px rgba(0,0,0,0.35)", textAlign: "left" };
  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button onClick={toggle} aria-expanded={open}
        style={{ background: C.bgPanel2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.textPrimary, cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: "6px 12px", whiteSpace: "nowrap" }}>
        {label} <span style={{ color: C.textMuted, fontSize: 11, marginLeft: 2 }}>▾</span>
      </button>
      {open && !sheet && (
        // Computer: a small menu right under the button
        <div style={{ ...panel, position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 70, width }}>
          {children(() => setOpen(false), false)}
        </div>
      )}
      {open && sheet && (
        // Phone: a dimmed screen with the menu centred near the top; tapping the dim area closes it
        <div onPointerDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.45)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "15vh" }}>
          <div style={{ ...panel, width: "min(320px, calc(100vw - 32px))", padding: "14px 14px", fontSize: 16 }}>
            {children(() => setOpen(false), true)}
          </div>
        </div>
      )}
    </div>
  );
}

// "Express Colors: Midnight ▾" — pick a palette; the page recolours at once (Damon: no settings page)
function ThemePicker() {
  const [current, setCurrent] = useState(loadThemeKey);
  return (
    <HeaderMenu label={<>Express Colors: <span style={{ color: C.teal, fontWeight: 600 }}>{THEMES[current].name}</span></>}>
      {(close, big) => (
        <>
          <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 8 }}>Pick a look for your screen. Only you see it.</div>
          {THEME_KEYS.map(key => {
            const t = THEMES[key];
            const active = key === current;
            return (
              <button key={key} onClick={() => { applyTheme(key); setCurrent(key); close(); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: active ? C.navy3 : "transparent", border: "none", borderRadius: 6, color: C.textPrimary, cursor: "pointer", fontSize: big ? 17 : 15, fontFamily: "inherit", padding: big ? "12px 10px" : "6px 8px", textAlign: "left" }}>   {/* big = phone panel: rows easy to tap */}
                {/* a dot in the palette's own colours: its background with its accent as the rim */}
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: t.bgApp, border: `2px solid ${t.brand}`, flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: active ? 700 : 400 }}>{t.name}</span>
                {active && <span style={{ color: C.teal }}>✓</span>}
              </button>
            );
          })}
        </>
      )}
    </HeaderMenu>
  );
}

// "Sound: 70% ▾" (or "Sound: Off") — volume slider and a Mute / Unmute button for all game sounds
function SoundControl() {
  const [st, setSt] = useState(soundSettings);
  const change = (next) => { setSoundSettings(next); setSt(next); };
  const pct = Math.round(st.volume * 100);
  return (
    <HeaderMenu width={210} label={<>Sound: <span style={{ color: C.teal, fontWeight: 600 }}>{st.on ? `${pct}%` : "Off"}</span></>}>
      {() => (
        <>
          <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 8 }}>Music and sound effects</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="range" min="0" max="100" step="5" value={pct} aria-label="Volume"
              onChange={e => change({ on: true, volume: Number(e.target.value) / 100 })}
              style={{ flex: 1, accentColor: "var(--c-teal)" }} />
            <span style={{ color: C.textSecond, fontSize: 13, width: 36, textAlign: "right" }}>{pct}%</span>
          </div>
          <button onClick={() => change({ ...st, on: !st.on })}
            style={{ marginTop: 10, width: "100%", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.textPrimary, cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: "5px 8px" }}>
            {st.on ? "Mute" : "Unmute"}
          </button>
        </>
      )}
    </HeaderMenu>
  );
}

// ── Reusable styled components ─────────────────────────────────
const Panel = ({ children, style = {}, className = "" }) => (
  <div className={className} style={{ background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 12, ...style }}>
    {children}
  </div>
);

const Btn = ({ children, onClick, color = C.brand, hoverColor = C.brandHover, style = {}, disabled = false }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? hoverColor : color,
        color: C.onBrand,   // readable on the scheme's brand colour
        border: "none",
        borderRadius: 8,
        padding: "6px 14px",
        fontSize: 16,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        fontFamily: "inherit",
        transition: "background 0.15s",
        ...style
      }}>
      {children}
    </button>
  );
};

const BtnSecondary = ({ children, onClick, style = {} }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? C.navy3 : C.navy2,
        color: C.teal,
        border: `1px solid ${C.teal}`,
        borderRadius: 8,
        padding: "6px 14px",
        fontSize: 16,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background 0.15s",
        ...style
      }}>
      {children}
    </button>
  );
};


const Input = ({ id, value, onChange, onKeyDown, placeholder, type = "text", style = {}, autoFocus = false }) => (
  <input
    id={id}
    type={type}
    value={value}
    onChange={onChange}
    onKeyDown={onKeyDown}
    placeholder={placeholder}
    autoFocus={autoFocus}
    style={{
      background: C.bgApp,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: "8px 12px",
      color: C.textPrimary,
      fontSize: 16,
      outline: "none",
      width: "100%",
      fontFamily: "inherit",
      textAlign: "center",
      ...style
    }}
  />
);

// ── Lobby ──────────────────────────────────────────────────────
function Lobby() {
  const [status, setStatus] = useState("loading...");
  const [roomList, setRoomList] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState(() => {
    const saved = localStorage.getItem("acro.auth");
    return saved ? JSON.parse(saved) : null;
  });
  const navigate = useNavigate();
  const { players, messages, sendMessage } = useLobbyHub(auth?.username);
  const [chatInput, setChatInput] = useState("");
  const lobbyBottomRef = useRef(null);
  // Create Room: an inline name field instead of the browser's pop-up
  const [creating, setCreating] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [createError, setCreateError] = useState("");

  async function doRegister() {
    try {
      const { register } = await import("./services/api");
      const data = await register(username.trim(), password);
      localStorage.setItem("acro.auth", JSON.stringify(data));
      setAuth(data); setUsername(""); setPassword("");
    } catch (e) { alert(e.message || e); }
  }

  async function doLogin() {
    try {
      const { login } = await import("./services/api");
      const data = await login(username.trim(), password);
      localStorage.setItem("acro.auth", JSON.stringify(data));
      setAuth(data); setUsername(""); setPassword("");
    } catch (e) { alert(e.message || e); }
  }

  function doLogout() {
    localStorage.removeItem("acro.auth");
    setAuth(null);
  }

  useEffect(() => {
    fetchHealth()
      .then(d => setStatus(`API: ${d.status}`))
      .catch(e => setStatus(`Error: ${e.message}`));
  }, []);

  useEffect(() => {
    async function loadRooms() {
      try {
        const { fetchRooms } = await import("./services/api");
        const rooms = await fetchRooms();
        setRoomList(rooms || []);
      } catch (e) { console.error(e); }
    }
    loadRooms();
    const iv = setInterval(loadRooms, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    lobbyBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Phones: one column, smaller side margins — the two-column lobby was wider than the screen
  // and the whole page slid sideways (Sandy, 2026-10-12)
  const [phone, setPhone] = useState(() => window.innerWidth < 600);
  useEffect(() => {
    const onResize = () => setPhone(window.innerWidth < 600);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function cancelCreate() {
    setCreating(false); setNewRoomName(""); setCreateError("");
  }

  async function handleCreate() {
    const name = newRoomName.trim();
    if (!name) { setCreateError("Give your room a name."); return; }
    try {
      const data = await createRoom(name);
      const id = data?.id || data?.roomId;
      if (!id) throw new Error("No room id");
      navigate(`/room/${encodeURIComponent(id)}`);
    } catch (e) { setCreateError(`Couldn't create the room: ${e.message}`); }
  }

  return (
    <div style={{ height: "100vh", overflowY: "auto", overflowX: "hidden", color: C.textPrimary }}>
      {/* flexWrap: on phones the title gets the first line and the menu + status move below it,
          instead of being squeezed and cut off (the page used to shift sideways) */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", rowGap: 10, columnGap: 16, ...(phone && { padding: "12px 16px" }) }}>
        <h1 style={{ fontFamily: "'Nunito', sans-serif", fontSize: 30, fontWeight: 800, color: C.brand, margin: 0, letterSpacing: "-0.5px" }}>Acro Express</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <ThemePicker />
          <span style={{ color: C.textMuted, fontSize: 15 }}>{status}</span>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: phone ? "16px 16px" : "24px 24px" }}>

        {auth && (
          <Panel style={{ padding: "16px 20px", marginBottom: 20, borderColor: C.teal }}>
            <p style={{ color: C.teal, fontWeight: 600, margin: 0 }}>Welcome aboard Acro Express.</p>
            <p style={{ color: C.textSecond, fontSize: 15, margin: "4px 0 0" }}>
              This is the first public stop on the journey. A working version with more style, features, and surprises still to come.
            </p>
          </Panel>
        )}

        <Panel style={{ padding: 16, marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16, color: C.textPrimary }}>
            {auth ? `Welcome, ${auth.username}!` : "Sign in to play"}
          </h2>
          {auth ? (
            <Btn onClick={doLogout} color={C.danger} hoverColor={C.dangerHover} style={{ color: "#FFF8F6" }}>Log out</Btn>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <Input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} style={{ textAlign: "left" }} />
                <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ textAlign: "left" }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={doRegister}>Register</Btn>
                <BtnSecondary onClick={doLogin}>Log in</BtnSecondary>
              </div>
            </>
          )}
        </Panel>

        {auth && <Panel style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, color: C.textPrimary }}>Game Rooms</h2>
            {!creating && <Btn onClick={() => setCreating(true)}>+ Create Room</Btn>}
          </div>
          {creating && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  autoFocus
                  maxLength={80} // up to 80 characters (was 40) — same limit as the server
                  placeholder="Name your room..."
                  value={newRoomName}
                  onChange={e => { setNewRoomName(e.target.value); setCreateError(""); }}
                  onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") cancelCreate(); }}
                  style={{ flex: 1, background: C.bgApp, border: `2px solid ${C.teal}`, borderRadius: 8, padding: "8px 12px", color: C.textPrimary, fontSize: 16, outline: "none", fontFamily: "inherit" }}
                />
                <Btn onClick={handleCreate}>Create</Btn>
                <BtnSecondary onClick={cancelCreate}>Cancel</BtnSecondary>
              </div>
              {createError && <p style={{ margin: "6px 0 0", fontSize: 14, color: C.brand }}>{createError}</p>}
            </div>
          )}
          {roomList.length === 0 ? (
            <p style={{ color: C.textMuted, fontSize: 15, margin: 0 }}>No rooms yet. Create one!</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {roomList.map(room => (
                <div key={room.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bgApp, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
                  {/* minWidth 0: long name lists wrap instead of pushing the Join button off the row */}
                  <div style={{ minWidth: 0, flex: 1, marginRight: 12 }}>
                    <p style={{ margin: 0, fontWeight: 600, color: C.textPrimary }}>{room.name}</p>
                    {/* Is a game going on, how far, who leads (Sandy, Deb) */}
                    <p style={{ margin: "2px 0 0", fontSize: 14, color: C.textSecond }}>
                      {room.gameOn ? (
                        <>
                          <span style={{ color: C.success }}>●</span> <span style={{ fontWeight: 600 }}>Game on</span>
                          {room.station > 0 && <> · Station <span style={{ fontFamily: NUM_FONT }}>{room.station}</span></>}
                          {room.leaderName && <> · leader <span style={{ color: C.teal, fontWeight: 600 }}>{room.leaderName}</span> <span style={{ fontFamily: NUM_FONT }}>{room.leaderScore}</span> of <span style={{ fontFamily: NUM_FONT }}>{room.winScore || 30}</span></>}
                        </>
                      ) : (
                        <><span style={{ color: C.textMuted }}>○</span> Waiting for players</>
                      )}
                    </p>
                    {/* Everyone in the room — friends can see where their friends are */}
                    <p style={{ margin: "2px 0 0", fontSize: 14, color: C.textMuted, overflowWrap: "anywhere" }}>
                      {(room.playingNames || []).length > 0 && <span style={{ color: C.textSecond }}>{room.playingNames.join(", ")}</span>}
                      {(room.awayNames || []).length > 0 && <>{(room.playingNames || []).length > 0 && ", "}<span style={{ fontStyle: "italic" }}>{room.awayNames.map(n => `${n} (away)`).join(", ")}</span></>}
                      {(room.playingNames || []).length + (room.awayNames || []).length > 0 && " · "}
                      {(room.playingNames || []).length} {room.gameOn ? "playing" : "here"}
                    </p>
                  </div>
                  <BtnSecondary onClick={() => navigate(`/room/${room.id}`)}>{room.gameOn ? "Join game" : "Join"}</BtnSecondary>
                </div>
              ))}
            </div>
          )}
        </Panel>}

        {auth && (
          <div style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 3fr)", gap: 16 }}>
            <Panel style={{ padding: 16 }}>
              <h2 style={{ margin: "0 0 10px", fontSize: 14, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Online Players ({players.length})
              </h2>
              {players.length === 0 ? (
                <p style={{ color: C.textMuted, fontSize: 15, margin: 0 }}>No one else here yet</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                  {players.map((p, i) => (
                    <li key={i} style={{ fontSize: 15, color: C.textSecond, padding: "4px 8px", background: C.bgApp, borderRadius: 6 }}>
                      <span style={{ color: C.success }}>●</span> {p}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel style={{ padding: 16, display: "flex", flexDirection: "column" }}>
              <h2 style={{ margin: "0 0 10px", fontSize: 14, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Lobby Chat
              </h2>
              <div style={{ flex: 1, overflowY: "auto", maxHeight: 180, display: "flex", flexDirection: "column", gap: 2, marginBottom: 10 }}>
                {messages.length === 0 ? (
                  <p style={{ color: C.textMuted, fontSize: 15, margin: 0 }}>No messages yet</p>
                ) : (
                  messages.map((m, i) => (
                    <div key={i} style={{ fontSize: 15 }}>
                      {/* When it was written — lobby messages are kept, so they can be from yesterday */}
                      <span style={{ color: C.textMuted, fontSize: 12, marginRight: 6, fontVariantNumeric: "tabular-nums" }}>{lobbyTime(m.time)}</span>
                      <span style={{ color: C.teal, fontWeight: 600 }}>{m.username}: </span>
                      <span style={{ color: C.textSecond }}>{m.message}</span>
                    </div>
                  ))
                )}
                <div ref={lobbyBottomRef} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="lobbyChatInput"
                  name="lobbyChatInput"
                  style={{ flex: 1, minWidth: 0, background: C.bgApp, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.textPrimary, fontSize: 15, outline: "none", fontFamily: "inherit" }}
                  placeholder="Say something..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && chatInput.trim()) { sendMessage(chatInput.trim()); setChatInput(""); } }}
                />
                <Btn onClick={() => { if (chatInput.trim()) { sendMessage(chatInput.trim()); setChatInput(""); } }}>Send</Btn>
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Voting Screen ──────────────────────────────────────────────
// One font for every number in the game (timers, round number, scores) —
// plain and bold, like the AcroChallenge countdown
const NUM_FONT = "'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";

// Compares two ids (Guids) safely: ignores case and null/undefined.
// The backend sends Guids as lowercase strings, but localStorage values or older
// payloads may differ in case — a plain === check let players see their own entry.
// Room screen fit (see `view` in Room): the size the room layout needs, and the smallest
// scale before it switches to a scrolling page.
const ROOM_FIT_W = 1000;   // CSS px wide
const ROOM_FIT_H = 640;    // CSS px tall
const ROOM_MIN_SCALE = 0.7;
function measureRoomView() {
  const w = window.innerWidth, h = window.innerHeight;          // includes zoom and Windows scaling
  const fit = Math.min(1, w / ROOM_FIT_W, h / ROOM_FIT_H);       // 1 = fits as it is
  if (fit >= ROOM_MIN_SCALE)
    return { scale: fit, scroll: false, w: w / fit, h: h / fit }; // laid out at w×h, then shrunk to the window
  return { scale: 1, scroll: true, w, h };                        // too small: normal size, page scrolls
}

// Time shown before a lobby message: "21:14" today, "Yesterday 21:14", or "11 Oct 21:14"
function lobbyTime(date) {
  if (!(date instanceof Date) || isNaN(date)) return "";
  const hm = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(date); day.setHours(0, 0, 0, 0);
  const daysAgo = Math.round((today - day) / 86400000);
  if (daysAgo === 0) return hm;
  if (daysAgo === 1) return `Yesterday ${hm}`;
  return `${date.toLocaleDateString([], { day: "numeric", month: "short" })} ${hm}`;
}

function sameId(a, b) {
  // Missing ids never match — prevents undefined === undefined being "true"
  if (!a || !b) return false;
  // Normalise both sides to lowercase strings before comparing
  return a.toString().toLowerCase() === b.toString().toLowerCase();
}

function VotingScreen({ roomId, entries, myPlayerId, onVoted, onVoteCast, timer, maxTimer, topic }) {
  const [submitted, setSubmitted] = useState(false); // true after "I'm done voting" is clicked
  const [selected, setSelected] = useState(null);    // the currently selected entry id
  const [closed, setClosed] = useState(false);

  const [textPair] = useState(() => {
    const pairs = [
      { title: "🗳️ Which one is your favorite?" },
      { title: "🗳️ The platform is open for voting" },
      { title: "🗳️ Now presenting the entries" },
    ];
    return pairs[Math.floor(Math.random() * pairs.length)];
  });

  // Selecting an entry sends the vote immediately but allows changing
  // until the player clicks "I'm done voting"
  async function handleSelect(entryId) {
    if (submitted) return; // locked after submitting
    try {
      const auth = getAuth();
      // Always send the vote — backend handles re-voting by replacing old vote
      await castVote(roomId, auth.username, entryId);
      setSelected(entryId);
      // Tell the room which acro I picked, so the results can highlight it
      onVoteCast?.(entries.find(e => e.id === entryId)?.sentence ?? null);
    } catch (e) { alert(`Vote failed: ${e.message}`); }
  }

  // Blank vote — player abstains, sends Guid.Empty to backend
  async function handleBlankVote() {
    if (submitted) return;
    try {
      const auth = getAuth();
      // Guid.Empty signals a blank vote on the backend
      await castVote(roomId, auth.username, "00000000-0000-0000-0000-000000000000");
      setSelected("blank");
      onVoteCast?.(null); // blank vote — nothing to highlight in the results
    } catch (e) { alert(`Vote failed: ${e.message}`); }
  }

  // Lock in the vote and close the overlay. Tells the server too: voting ends
  // early only when every player has clicked "Done Voting".
  function handleDoneVoting() {
    const a = getAuth();
    doneVoting(roomId, a.username).catch(() => { });
    setSubmitted(true);
    if (onVoted) onVoted();
    setClosed(true);
  }

  if (closed) return null;

  const auth = getAuth();
  // Only keep real entry objects (with an id) — plain strings can't be voted on,
  // because the vote would go out with no entry id and be counted as a blank vote.
  // Then hide the player's own entry from the voting list.
  const visibleEntries = (entries || []).filter(e =>
    e && typeof e === "object" && e.id &&
    // Hide if I'm the author — or one of the authors, when identical acros were merged
    !sameId(e.playerId, auth?.userId) &&
    !(e.playerIds || []).some(pid => sameId(pid, auth?.userId))
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 520, background: C.bgPanel, border: `1px solid ${C.brand}`, borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ margin: 0, fontSize: 20, color: C.ivory, fontFamily: "Fredoka, sans-serif" }}>{textPair.title}</h2>
          {/* The round's topic — players asked "what was the topic?" while voting */}
          {topic && (
            <div style={{ margin: "10px 0 0", textAlign: "center" }}>
              <div style={{ fontSize: 12, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>Topic</div>
              <div style={{ fontSize: 24, color: C.teal, fontWeight: 700, fontFamily: "Fredoka, sans-serif", lineHeight: 1.2, overflowWrap: "anywhere" }}>{topic}</div>
            </div>
          )}
          {selected && selected !== "blank" && !submitted && (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: C.textMuted }}>
              You can change your vote until you click "Done Voting".
            </p>
          )}
        </div>

        {/* Entry list */}
        {/* maxHeight follows the screen height (was a fixed 380px, which only fit ~4 entries) */}
        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
          {visibleEntries.length === 0 ? (
            <p style={{ color: C.textMuted, fontSize: 15, textAlign: "center" }}>No entries to vote on at this station...</p>
          ) : (
            visibleEntries.map((entry) => {
              // sameId() returns false for missing ids, so only the clicked entry lights up
              const isSelected = sameId(selected, entry.id);
              return (
                // Key by entry id so React doesn't mix up buttons between rounds
                <button key={entry.id}
                  onClick={() => handleSelect(entry.id)}
                  disabled={submitted}
                  style={{
                    width: "100%", textAlign: "left", padding: "12px 16px",
                    background: isSelected ? `color-mix(in srgb, ${C.brand} 13%, transparent)` : C.bgPanel2,
                    border: `1px solid ${isSelected ? C.brand : C.border}`,
                    borderRadius: 10, color: isSelected ? C.ivory : C.textSecond,
                    fontSize: 16, cursor: submitted ? "not-allowed" : "pointer",
                    opacity: submitted && !isSelected ? 0.6 : 1,
                    fontFamily: "inherit", transition: "all 0.15s"
                  }}>
                  {entry.sentence}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 24px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "center", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Blank vote option */}
          {!submitted && (
            <button
              onClick={handleBlankVote}
              style={{
                background: selected === "blank" ? `color-mix(in srgb, ${C.textMuted} 13%, transparent)` : "transparent",
                border: `1px solid ${selected === "blank" ? C.textMuted : C.border}`,
                borderRadius: 8, padding: "6px 14px", fontSize: 14,
                color: selected === "blank" ? C.textPrimary : C.textMuted,
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
              }}>
              None of the above
            </button>
          )}

          {/* Voting countdown — number only (no bar), red in the last 10 seconds */}
          {timer !== null && timer > 0 && (
            <span style={{ fontSize: 32, fontWeight: 700, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums", color: timer <= 10 ? C.brand : C.ivory, lineHeight: 1 }}>{timer}</span>
          )}

          {/* Done voting button */}
          <BtnSecondary onClick={handleDoneVoting}>Done Voting</BtnSecondary>
        </div>
      </div>
    </div>
  );
}

// ── Results Screen ─────────────────────────────────────────────
function ResultsScreen({ scores, winningAcro, entries, players, round, topic, onClose, myVote, votes, myName }) {
  const sorted = Object.entries(scores || {}).sort((a, b) => b[1] - a[1]);
  const anyPoints = sorted.some(([, s]) => s > 0);

  const entryByNickname = {};
  (entries || []).forEach(e => {
    // All authors of this entry (several when identical acros were merged)
    const authorIds = e.playerIds?.length ? e.playerIds : [e.playerId];
    authorIds.forEach(pid => {
      const player = (players || []).find(p => sameId(p.id, pid));
      if (player) entryByNickname[player.nickname] = e.sentence;
    });
  });

  // One table, one column (like AcroChallenge): Name | Points | Acro.
  // The winning entry is shown by colour — no separate "winning entry" box.
  const cell = { padding: "6px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "left" };   // a bit more compact (was 8px)
  return (
    <Panel style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h2 style={{ margin: 0, color: C.teal, fontFamily: "Fredoka, sans-serif", fontSize: 20 }}>
          Station <span style={{ fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums" }}>{round}</span>{topic ? ` – ${topic}` : ""}
        </h2>
        <button onClick={onClose} title="Close" style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
          <thead>
            <tr style={{ color: C.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              <th style={cell}>Name</th>
              {/* Votes the acro got (sent by the server since 2026-10-12; hidden if missing) */}
              {votes && <th style={{ ...cell, textAlign: "center", width: 70 }}>Votes</th>}
              <th style={{ ...cell, textAlign: "center", width: 80 }}>Points</th>
              <th style={cell}>Acro</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(([name, score]) => {
              // Winner = wrote the winning acro (several authors if identical acros were merged)
              const isWinner = !!winningAcro && entryByNickname[name] === winningAcro && score > 0;
              // The acro this player voted for (Sandy: "when I look at the box, I can never remember")
              const isMyVote = !!myVote && entryByNickname[name] === myVote;
              const colour = isWinner ? C.brand : C.textSecond;
              // My vote: a teal ribbon across the whole row — name, points and acro — so I remember
              // who wrote it too (only I see my own vote). Dark text on the ribbon.
              const onRibbon = isMyVote ? C.bgApp : null;
              return (
                <tr key={name} title={isMyVote ? "Your vote" : undefined} style={{
                  background: isMyVote ? C.teal : (isWinner ? `color-mix(in srgb, ${C.brand} 10%, transparent)` : "transparent"),
                  // The winner keeps a coral bar on the left, also when the row is my vote
                  boxShadow: isWinner ? `inset 4px 0 0 ${C.brand}` : "none"
                }}>
                  <td style={{ ...cell, color: onRibbon || colour, fontWeight: isWinner || isMyVote ? 700 : 400 }}>
                    {/* ⭐ = round winner, (you) = my own row */}
                    {isWinner && <span title="Station winner" style={{ marginRight: 6 }}>⭐</span>}
                    {name}
                    {name === myName && <span style={{ marginLeft: 6, fontWeight: 400, color: onRibbon || C.teal }}>(you)</span>}
                  </td>
                  {votes && <td style={{ ...cell, textAlign: "center", color: onRibbon || C.textSecond, fontWeight: 700, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums" }}>{votes[name] ?? 0}</td>}
                  <td style={{ ...cell, textAlign: "center", color: onRibbon || (isWinner ? C.brand : C.teal), fontWeight: 700, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums" }}>{score}</td>
                  <td style={{ ...cell, color: onRibbon || (isWinner ? C.ivory : C.textSecond), fontStyle: "italic", fontWeight: isMyVote ? 700 : 400 }}>{entryByNickname[name] || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!anyPoints && (
        <p style={{ margin: "10px 0 0", color: C.textMuted, fontSize: 14 }}>No points were awarded at this station.</p>
      )}
    </Panel>
  );
}

// ── Room ───────────────────────────────────────────────────────
function Room() {
  const { id } = useParams();
  const navigate = useNavigate();
  const auth = JSON.parse(localStorage.getItem("acro.auth") || "null");

  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [myDraft, setMyDraft] = useState("");
  // The acro I voted for this round (null = no vote / blank) — highlighted in the results
  const [myVote, setMyVote] = useState(null);
  const [phase, setPhase] = useState("Waiting");
  const [currentRound, setCurrentRound] = useState(1);
  const [letters, setLetters] = useState([]);
  const [entries, setEntries] = useState([]);
  const [scores, setScores] = useState({});
  const [winningAcro, setWinningAcro] = useState(null);
  // Votes each player's acro got in the last round (nickname -> votes); null = server didn't send them
  const [roundVotes, setRoundVotes] = useState(null);
  const [timer, setTimer] = useState(null);
  const [submittedAcro, setSubmittedAcro] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  // Why the last acro wasn't accepted (shown under the input; cleared when typing)
  const [acroError, setAcroError] = useState("");
  const draftTimerRef = useRef(null);
  const [currentTopic, setCurrentTopic] = useState("");

  const [roomMessages, setRoomMessages] = useState([]);
  const [roomChatInput, setRoomChatInput] = useState("");
  const chatBottomRef = useRef(null);

  const [creatorId, setCreatorId] = useState(null);
  const [gameWinner, setGameWinner] = useState(null); // null = no game over, object = { name, message }
  // Seconds until the server starts the next game by itself (null = no countdown running).
  // It keeps counting below 0: from 0 to -10 we wait for the server, after that the
  // New Game button comes back in case the automatic start didn't happen.
  const [nextGameIn, setNextGameIn] = useState(null);
  useEffect(() => {
    if (nextGameIn === null || nextGameIn <= -10) return;            // no countdown, or gave up waiting
    const t = setTimeout(() => setNextGameIn(n => (n === null ? null : n - 1)), 1000); // one second later
    return () => clearTimeout(t);                                      // stop if it changes meanwhile
  }, [nextGameIn]);
  const [resultsClosed, setResultsClosed] = useState(false); // × on the results panel

  const [maxTimer, setMaxTimer] = useState(60); // tracks initial timer value for the progress bar
  const [topicRequested, setTopicRequested] = useState(false);
  // True when the topic prompt is for round 1 (Start Game / New Game), false when the round winner sets it
  const [topicForFirstRound, setTopicForFirstRound] = useState(false);
  const [topicDraft, setTopicDraft] = useState("");
  // Waits 8 s after the results appear before opening the winner's topic prompt
  const topicPromptTimerRef = useRef(null);
  // Error from the server when the topic is refused (e.g. too short)
  const [topicError, setTopicError] = useState("");
  const [topicTimer, setTopicTimer] = useState(null);

  const [privateChat, setPrivateChat] = useState(null);
  // Every private conversation, keyed by the other player's nickname.
  // Messages are stored here even while that chat is closed, so the first message
  // isn't lost and double-clicking a name no longer wipes the conversation.
  const [privateHistory, setPrivateHistory] = useState({});
  const privateChatRef = useRef(null);
  useEffect(() => { privateChatRef.current = privateChat; }, [privateChat]);
  // Passenger scores frozen during voting and the drumroll, so the new totals
  // don't show before the results are revealed (null = show live scores)
  const [frozenScores, setFrozenScores] = useState(null);
  const playersRef = useRef([]);
  // When each player's leaving was last announced (id → time), so it shows once, not 2–3 times
  const leftAnnouncedRef = useRef({});
  // Players in the last Passengers list we saw (lower-case ids); null until the room first loads
  const knownPlayersRef = useRef(null);
  // When each player's arrival was last announced (id → time), so it shows once
  const joinAnnouncedRef = useRef({});
  // "<name> has joined the room." — announced when a new name appears in Passengers.
  // Comparing lists (instead of using the PlayerJoined event) means a reconnect after a
  // network blip doesn't announce the player again: they never left the list.
  useEffect(() => {
    const list = state.data?.players;
    if (!list) return;                                              // room not loaded (or closed)
    const ids = list.map(p => String(p.id).toLowerCase());
    if (knownPlayersRef.current === null) {                         // first load: everyone already here
      knownPlayersRef.current = new Set(ids);
      return;
    }
    for (const p of list) {
      const id = String(p.id).toLowerCase();
      if (knownPlayersRef.current.has(id)) continue;                // was here already
      if (sameId(p.id, auth?.userId)) continue;                     // don't announce yourself
      const lastTime = joinAnnouncedRef.current[id];
      if (!lastTime || Date.now() - lastTime > 30000) {             // once per 30 s, like the leave message
        joinAnnouncedRef.current[id] = Date.now();
        postSystemMessage(`${p.nickname} has joined the room.`);
      }
    }
    knownPlayersRef.current = new Set(ids);                         // remember for the next comparison
  }, [state.data]);
  // Room screen size. The window size the browser reports already includes browser zoom and
  // Windows display scaling, so zooming in is the same as a smaller window.
  // - Big enough (about 1000×640): the room is drawn normally.
  // - Smaller: the whole room shrinks proportionally to fit (scale), like a game window, so
  //   nothing is cut off or covered (Deb and Acronymist lost the acro box / chat at high zoom).
  // - Below 70% it would be too small to read: the room becomes a normal scrolling page instead.
  const [view, setView] = useState(measureRoomView);
  useEffect(() => {
    const onResize = () => setView(measureRoomView());   // re-measure when the window or zoom changes
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Narrow (phones, very heavy zoom): the topic moves from the top right to under the letters,
  // and Passengers / chats are stacked. view.w is the width the room is laid out at.
  const isNarrow = view.w < 900;
  // Short (under 800px tall, e.g. Windows display scale 125%): smaller header, timer and letters
  const isShort = view.h < 800;
  const [privateChatInput, setPrivateChatInput] = useState("");
  const [unreadFrom, setUnreadFrom] = useState({});
  const privateChatBottomRef = useRef(null);

  // Refs
  const myDraftRef = useRef("");
  const submittedAcroRef = useRef(null);
  const handleSubmitAcroRef = useRef(null);
  const audioRef = useRef(null);      // tune 1 — plays during submission
  const audio2Ref = useRef(null);     // tune 2 — plays after submission until voting
  const votingAudioRef = useRef(null); // drumroll
  const songTimeoutRef = useRef(null); // delayed start of the writing song (long rounds)
  const topicRequestedRef = useRef(false);
  // Mirrors `phase` so refreshRoomState (run from a setInterval) always reads the
  // current phase — the interval closure otherwise keeps the phase from first render
  const phaseRef = useRef("Waiting");
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  // Chat scroll containers — we scroll these directly instead of scrollIntoView,
  // which also scrolled the whole page down every time a message arrived
  const chatListRef = useRef(null);
  // Live connection: "connected" or "reconnecting" (shows a banner)
  const [connStatus, setConnStatus] = useState("connected");
  // Short private notice, e.g. "Acro not entered. It needed 3 words: B T V" (null = none)
  const [notice, setNotice] = useState(null);
  // Players who have submitted this round (lower-case ids) — names turn teal in Passengers
  const [submittedIds, setSubmittedIds] = useState([]);
  const noticeTimerRef = useRef(null);
  // The 3-second room check can't reach the server (also shows the banner)
  const [pollFailing, setPollFailing] = useState(false);
  // The room loaded at least once — after that, a failed check keeps the room on screen
  const roomLoadedRef = useRef(false);
  // The room no longer exists on the server (everyone left, or closed after 5 minutes)
  const [roomClosed, setRoomClosed] = useState(false);
  // Last known room name, so the title never falls back to "Room #<id>"
  const roomNameRef = useRef("");
  // Set while leaving with Back to Lobby, so the poll below doesn't join the room again
  const leavingRef = useRef(false);
  // When the poll last re-joined us (so it doesn't try more than every 5 s)
  const lastRejoinRef = useRef(0);
  const privateChatListRef = useRef(null);

  // 🔊 / volume changed in the header: apply it to the sounds playing at this moment
  useEffect(() => {
    const onSound = () => {
      for (const a of [audioRef.current, audio2Ref.current, votingAudioRef.current])
        if (a) a.volume = soundGain();
    };
    window.addEventListener("acro-sound-change", onSound);
    return () => window.removeEventListener("acro-sound-change", onSound);
  }, []);

  // Unlock audio on first user interaction
  useEffect(() => {
    const unlock = () => {
      const a = new Audio();
      a.play().catch(() => { });
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  function postSystemMessage(text) {
    setRoomMessages(prev => [...prev, { nickname: "•", message: text, system: true, time: new Date() }]);
  }

  const signalRHandlers = {
    // Someone submitted (or changed) an acro: the server sends everyone who has submitted so far
    onSubmittedPlayers: useCallback((ids) => {
      setSubmittedIds((ids || []).map(x => String(x).toLowerCase()));
    }, []),
    // From the server, to this player only: the unsent acro couldn't be entered at time-up.
    // Shown as a banner for 10 seconds, and as a line in my own chat.
    onAcroNotEntered: useCallback((message) => {
      setNotice(message);
      postSystemMessage(message);
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(null), 10000);
    }, []),
    // From useSignalR: the live connection dropped ("reconnecting") or works again ("connected")
    onConnectionChange: useCallback((status) => setConnStatus(status), []),
    // 4th argument (topic) is new — the backend now sends it with every RoundStarted
    onRoundStarted: useCallback((roundNumber, lettersStr, seconds, topic) => {
      setLetters(typeof lettersStr === "string" ? lettersStr.split("") : lettersStr);
      setPhase("Submitting");
      setTimer(seconds);
      setEntries([]);
      setWinningAcro(null);
      setSubmittedAcro(null);
      submittedAcroRef.current = null;
      setIsEditing(false);
      setMyDraft("");
      myDraftRef.current = "";
      setAcroError("");
      setMyVote(null); // new round — forget last round's vote
      clearTimeout(topicPromptTimerRef.current); // a round started — no topic prompt pending any more
      setNextGameIn(null); // a round has started — no game-over countdown any more
      setSubmittedIds([]); // nobody has submitted yet in the new round
      // Show this round's topic next to the acro input.
      // Before, this line cleared the topic — but TopicSet arrives just BEFORE
      // RoundStarted, so the topic was wiped the moment the round began.
      if (typeof topic === "string") setCurrentTopic(topic);
      setCurrentRound(roundNumber);
      // One chat line per round with the topic in it (before, the topic had its own line,
      // which left less room for real chat on short screens)
      postSystemMessage(typeof topic === "string" && topic.trim()
        ? `Leaving for Station ${roundNumber} — Topic: "${topic}"`
        : `Leaving for Station ${roundNumber}.`);
      setMaxTimer(seconds);

      if (!topicRequestedRef.current) {
        setTimeout(() => {
          const activeEl = document.activeElement;
          const isChatFocused = activeEl?.id === "chatInput" || activeEl?.id === "privateChatInput";
          if (!isChatFocused) {
            document.getElementById("acroInput")?.focus();
          }
        }, 100);
      }

      // Stop all previous audio cleanly
      // Stop all previous audio cleanly
      if (votingAudioRef.current) { votingAudioRef.current.pause(); votingAudioRef.current = null; }
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }

      const audio = new Audio("/AcroExpress_tunes.m4a");
      audio.loop = false;
      audio.volume = soundGain();   // the player's sound setting (🔊 and slider in the header)
      audioRef.current = audio;

      // The song lasts ~92 seconds and its ending must land on 0: every round
      // (56–84 s) skips the right amount of its beginning, with a quick fade-in.
      // (If a round is ever longer than the song, the song starts later instead.)
      const SONG_SECONDS = 91.9; // extended version (30-second build-up intro + the original song)
      const skipSeconds = Math.max(0, SONG_SECONDS - (seconds || 0));
      if (skipSeconds > 0) audio.currentTime = skipSeconds;

      const startSong = () => {
        // Round already over (or a new one started) — don't play a stale song
        if (audioRef.current !== audio) return;
        // Submitted during the quiet lead-in → the song runs silently, as after any submit
        if (submittedAcroRef.current) audio.muted = true;
        // Fade in over 1.5 s when not starting from the very beginning
        if (skipSeconds > 0) {
          audio.volume = 0;
          let v = 0;
          const fade = setInterval(() => {
            v = Math.min(1, v + 0.1);
            audio.volume = v * soundGain();   // fade up to the player's volume, not to full
            if (v >= 1) clearInterval(fade);
          }, 150);
        }
        audio.play().catch(() => {
          const unlockAndPlay = () => {
            audio.play().catch(() => { });
            window.removeEventListener("click", unlockAndPlay);
            window.removeEventListener("keydown", unlockAndPlay);
          };
          window.addEventListener("click", unlockAndPlay);
          window.addEventListener("keydown", unlockAndPlay);
        });
      };

      // Longer rounds: wait, so the song's ending still lines up with 0
      const delayMs = Math.max(0, ((seconds || 0) - SONG_SECONDS) * 1000);
      if (songTimeoutRef.current) clearTimeout(songTimeoutRef.current);
      songTimeoutRef.current = null;
      if (delayMs > 0) songTimeoutRef.current = setTimeout(startSong, delayMs);
      else startSong();
    }, []),

    // Restored: this handler was accidentally deleted in the May 22 music fix.
    // Without it the voting screen only appeared via the 3s poll, which sent
    // plain sentence strings (no ids) — causing the all-highlighted voting,
    // blank votes (so nobody scored), and players seeing their own entry.
    onVotingStarted: useCallback((acroEntries, votingSeconds) => {
      // Stop all music when voting starts
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }
      // Entry objects: { id, sentence, playerId }
      setEntries(acroEntries || []);
      setPhase("Voting");
      // Freeze the Passengers scores until the results are revealed
      setFrozenScores(Object.fromEntries(playersRef.current.map(p => [p.id, p.score])));
      // Voting countdown for the progress bar
      setTimer(votingSeconds || 20);
      setMaxTimer(votingSeconds || 20);
    }, []),

    onTopicRequested: useCallback((creatorUserId) => {
      // A new game is starting — leave the Game Over screen (hides the New Game button,
      // so nobody else clicks it and gets a "round already in progress" error)
      setGameWinner(null);
      setNextGameIn(null); // the new game is starting — stop the countdown
      setPhase(prev => (prev === "GameOver" || prev === "Paused" ? "Starting" : prev));
      // sameId ignores case differences between the backend Guid and localStorage
      if (sameId(auth?.userId, creatorUserId)) {
        setTopicForFirstRound(true); // a new game always starts at round 1 (3 letters)
        setTopicRequested(true);
        topicRequestedRef.current = true;
        setTopicTimer(25);
      } else {
        postSystemMessage("Waiting for the host to set a topic...");
      }
    }, [auth]),

    // roundVotesMap (4th) = votes per player's acro — sent by newer servers only
    onRoundEnded: useCallback((roundScores, winning, winnerPlayerId, roundVotesMap) => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }

      // Voting is over (time ran out, or everyone voted) — close the voting screen
      // straight away and show "Counting votes" during the drumroll
      setPhase("Tallying");
      setTimer(null);

      const drumroll = new Audio("/AcroExpress_drumroll.m4a");
      drumroll.volume = soundGain();   // the player's sound setting
      votingAudioRef.current = drumroll;
      drumroll.play().catch(() => { });

      setTimeout(() => {
        setScores(roundScores || {});
        setRoundVotes(roundVotesMap || null);
        setWinningAcro(winning);
        setPhase("Results");
        setTimer(null);
        setResultsClosed(false);
        // Reveal: Passengers now show the new totals
        setFrozenScores(null);

        // Round winner picks the next topic (sameId ignores Guid case differences) — but only
        // after everyone has had 8 seconds with the results. The prompt then REPLACES the results
        // for the winner (they never show together). The server waits 40 s, enough for this.
        if (sameId(auth?.userId, winnerPlayerId)) {
          clearTimeout(topicPromptTimerRef.current);
          topicPromptTimerRef.current = setTimeout(() => {
            setTopicForFirstRound(false); // topic for the round after the one that just ended
            setTopicRequested(true);
            topicRequestedRef.current = true;
            setTopicTimer(25);
          }, 8000);
        }
      }, 4180);
    }, [auth]),

    onGameOver: useCallback((winner) => {
      // Stop all audio
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }
      if (votingAudioRef.current) { votingAudioRef.current.pause(); votingAudioRef.current = null; }

      // Pick a random station-themed winner message
      const msgs = [
        `⚡ ${winner}'s supernatural acro skills leave the whole station in awe.`,
        `🏆 Final stop: victory. ${winner} arrives first at glory.`,
        `🚂 ${winner} pulls into the winner's platform in style.`,
        `🎖️ Next station: triumph. ${winner} has arrived.`,
        `🚉 The signals are clear — ${winner} wins the game.`,
        `✨ ${winner} leaves the rest of the field behind and claims the line.`,
        `🌟 ${winner} takes the express route straight to victory.`,
        `🎉 Attention passengers: ${winner} is today's champion.`,
        `🔔 Please mind the gap between ${winner} and everyone else.`,
        `👑 ${winner} has officially taken command of the rails.`,
        `📣 Service update: ${winner} has arrived at greatness.`,
        `🚄 No delays, no doubt — ${winner} wins.`,
        `🥇 ${winner} makes a flawless arrival at the platform of champions.`,
        `🎟️ One ticket to glory, stamped and claimed by ${winner}.`
      ];

      // Show winner inline — players stay in the room
      setGameWinner({
        name: winner,
        message: msgs[Math.floor(Math.random() * msgs.length)]
      });
      // Hide the last round's letters and countdown on the game over screen
      setLetters([]);
      setTimer(null);
      setFrozenScores(null);
      setNextGameIn(30); // the server starts the next game after a 30-second break
      setPhase("GameOver");
    }, []),

    // Several rounds in a row without any acros — the server paused the game
    onGamePaused: useCallback(() => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }
      setPhase("Paused");
      setTimer(null);
      setLetters([]);
      setFrozenScores(null);
      postSystemMessage("Game paused: no acros for 3 rounds in a row. Press Start Game to continue.");
    }, []),

    onTopicSet: useCallback((topic) => {
      setTopicRequested(false);
      topicRequestedRef.current = false;
      setTopicDraft("");
      setTopicTimer(null);
      setCurrentTopic(topic);
      // No chat line here — RoundStarted (sent right after this) posts the round and topic together
    }, []),

    onPrivateMessage: useCallback((senderNickname, message) => {
      // Always keep the message — before, it was dropped if this chat wasn't open
      setPrivateHistory(prev => ({
        ...prev,
        [senderNickname]: [...(prev[senderNickname] || []), { nickname: senderNickname, message, time: new Date() }]
      }));
      // Red unread badge only if this conversation isn't the one on screen
      if (privateChatRef.current?.nickname !== senderNickname)
        setUnreadFrom(prev => ({ ...prev, [senderNickname]: (prev[senderNickname] || 0) + 1 }));
    }, []),

    onRoomMessage: useCallback((nickname, message) => {
      setRoomMessages(prev => [...prev, { nickname, message, time: new Date() }]);
    }, []),

    onPlayerJoined: useCallback((playerId) => {
      refreshRoomState();
    }, []),

    onPlayerLeft: useCallback((leftId) => {
      refreshRoomState();
      // The server can announce the same departure up to 3 times, sometimes with a
      // connection id instead of the player id. Only announce players we know, once per 30 s.
      const leaver = playersRef.current.find(p => sameId(p.id, leftId));
      const lastTime = leaver ? leftAnnouncedRef.current[leaver.id] : 0;
      // Not about yourself: if the server removed you, the page joins you again straight away
      if (leaver && !sameId(leaver.id, auth?.userId) && (!lastTime || Date.now() - lastTime > 30000)) {
        leftAnnouncedRef.current[leaver.id] = Date.now(); // remember, so the repeats are skipped
        postSystemMessage(`${leaver.nickname} has left the room.`);
      }
    }, []),

    onChatMessage: useCallback(() => { }, []),
  };

  const { disconnect, connectionRef } = useSignalR(id, signalRHandlers);

  // Keep the newest chat message in view by scrolling only the chat box itself.
  // (scrollIntoView also scrolled the whole page — the "screen scrolls down" bug)
  useEffect(() => {
    const el = chatListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [roomMessages]);
  useEffect(() => {
    const el = privateChatListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [privateHistory, privateChat]);

  // Topic countdown
  useEffect(() => {
    if (topicTimer === null || topicTimer <= 0) return;
    const iv = setInterval(() => {
      setTopicTimer(t => {
        if (t <= 1) { clearInterval(iv); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [topicTimer]);

  async function sendRoomMessage() {
    const text = roomChatInput.trim();
    if (!text || !auth) return;
    try {
      const conn = connectionRef.current;
      if (conn) { await conn.invoke("SendRoomMessage", id, auth.username, text); setRoomChatInput(""); }
    } catch (e) { console.error(e); }
  }

  async function sendPrivateMessage() {
    const text = privateChatInput.trim();
    if (!text || !auth || !privateChat) return;
    try {
      const conn = connectionRef.current;
      if (conn) {
        await conn.invoke("SendPrivateMessage", privateChat.userId, auth.username, text);
        const to = privateChat.nickname;
        setPrivateHistory(prev => ({ ...prev, [to]: [...(prev[to] || []), { nickname: auth.username, message: text, time: new Date() }] }));
        setPrivateChatInput("");
      }
    } catch (e) { console.error(e); }
  }

  async function handleLeaveRoom() {
    leavingRef.current = true;   // leaving on purpose — the poll must not join us again
    // Stop all audio
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }
    if (votingAudioRef.current) { votingAudioRef.current.pause(); votingAudioRef.current = null; }
    try {
      const { leaveRoom } = await import("./services/api");
      if (auth?.userId) await leaveRoom(id, auth.userId);
    } catch (e) { console.error(e); }
    await disconnect();
    navigate("/");
  }

  useEffect(() => {
    window.addEventListener("pagehide", handleLeaveRoom);
    return () => window.removeEventListener("pagehide", handleLeaveRoom);
  }, []);

  useEffect(() => {
    window.addEventListener("beforeunload", handleLeaveRoom);
    return () => window.removeEventListener("beforeunload", handleLeaveRoom);
  }, []);

  useEffect(() => {
    const handlePopState = async () => { await handleLeaveRoom(); };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!auth) { navigate("/"); return; }
    joinRoom(id, { id: auth.userId, nickname: auth.username, score: 0 }).catch(e => console.warn(e));
  }, [id]);

  async function refreshRoomState() {
    try {
      const { fetchRoomState } = await import("./services/api");
      const data = await fetchRoomState(id);
      // The room no longer exists → show "This room has closed" instead of an empty room
      // (keeps the last good room data; before, the title became "Room #<id>")
      if (data?.notFound) { setRoomClosed(true); return; }
      if (data?.name) roomNameRef.current = data.name;      // remember the name
      roomLoadedRef.current = true;
      setPollFailing(false);                                 // the server answers again
      setState({ loading: false, error: null, data });

      // Self-heal: the room exists but we're not in Passengers any more — removed as "away"
      // after a dropped connection, a server restart, or a second tab that was closed.
      // Join again, so chat, topics and acros work for us again (the server gives the score
      // back if it's the same game). Not while leaving, and at most every 5 seconds.
      const me = auth?.userId;
      if (me && !leavingRef.current && Array.isArray(data?.players)
          && !data.players.some(p => sameId(p.id, me))
          && Date.now() - lastRejoinRef.current > 5000) {
        lastRejoinRef.current = Date.now();
        joinRoom(id, { id: me, nickname: auth.username, score: 0 }).catch(e => {
          console.warn("Re-join failed:", e);
          // 401 = the server no longer knows our login (it restarted) — go to the login screen
          // instead of staying in a room we can't play in
          if (String(e?.message || "").startsWith("401")) { localStorage.removeItem("acro.auth"); navigate("/"); }
        });
        // Also join the live updates again, in case this connection lost the room group
        connectionRef.current?.invoke("JoinRoom", id, String(me)).catch(() => { });
      }
      if (data?.letters) setLetters(typeof data.letters === "string" ? data.letters.split("") : data.letters);

      // If server says Voting but frontend missed the SignalR event — force it.
      // phaseRef (not `phase`) because this runs from a setInterval with a stale closure,
      // which made this block re-run every 3 seconds and overwrite the real entries.
      // (not during "Tallying"/"Results": the round is already over, the server just
      //  hasn't saved it yet — forcing Voting here would reopen the voting screen)
      if (data?.phase === "Voting" && !["Voting", "Tallying", "Results"].includes(phaseRef.current)) {
        setPhase("Voting");
        setFrozenScores(prev => prev ?? Object.fromEntries((data.players || []).map(p => [p.id, p.score])));
        // votingEntries = objects with ids; the old `entries` were plain strings
        setEntries(data.votingEntries || []);
        // Use the server's remaining time when available
        const secs = data.secondsRemaining || 20;
        setTimer(secs);
        setMaxTimer(secs);
      }

      // Fallback for the topic label in case TopicSet/RoundStarted was missed
      if (data?.phase === "Submitting" && data?.currentTopic) setCurrentTopic(data.currentTopic);
      // Who has submitted (also after a page reload, or if an update was missed)
      if (data?.phase === "Submitting" && Array.isArray(data?.submittedPlayerIds))
        setSubmittedIds(data.submittedPlayerIds.map(x => String(x).toLowerCase()));

      setPhase(prev => {
        // "GameOver" is kept too — otherwise the poll replaced it within 3s and the winner panel vanished
        if (prev === "Submitting" || prev === "Voting" || prev === "Tallying" || prev === "Results" || prev === "GameOver" || prev === "Paused") return prev;
        return data?.phase || prev;
      });
    } catch (err) {
      // Server unreachable (restart, network blip): keep the room on screen with "Reconnecting…"
      // and keep checking every 3 s. Only a room that never loaded shows the error page.
      // (Before, one failed check replaced the whole room with "Error: Failed to fetch".)
      if (roomLoadedRef.current) setPollFailing(true);
      else setState({ loading: false, error: String(err?.message || err), data: null });
    }
  }

  useEffect(() => {
    refreshRoomState();
    const iv = setInterval(refreshRoomState, 3000);
    return () => clearInterval(iv);
  }, [id]);

  useEffect(() => {
    if (timer === null || timer <= 0) return;
    const iv = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          clearInterval(iv);
          // (No auto-submit here any more: the server collects unsent acros at time-up,
          //  from what the player typed — see saveDraft below.)
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [timer]);

  // Sends what the player is typing to the server (a moment after they stop typing),
  // so a valid acro is still entered if the time runs out before they press Submit
  function saveDraft(text, immediately = false) {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    const send = () => connectionRef.current?.invoke("SaveDraft", text).catch(() => { });
    if (immediately) send();
    else draftTimerRef.current = setTimeout(send, 250);
  }

  async function handleSubmitAcro() {
    const text = myDraftRef.current.trim();
    if (!text || !auth) return;
    try {
      if (isEditing && text === submittedAcro) {
        setIsEditing(false);
        if (audioRef.current) audioRef.current.muted = true;
        // Restart tune 2 after editing with no changes
        audio2Ref.current = new Audio("/AcroExpress_tunes_02.mp3");
        audio2Ref.current.loop = false;
        audio2Ref.current.volume = soundGain();   // the player's sound setting
        audio2Ref.current.play().catch(() => { });
        setTimeout(() => document.getElementById("chatInput")?.focus(), 100);
        return;
      }
      await submitAcro(id, auth.userId, text);
      setAcroError("");
      saveDraft("", true);   // submitted — nothing left to collect
      setSubmittedAcro(text);
      submittedAcroRef.current = text;
      setIsEditing(false);
      setMyDraft("");
      myDraftRef.current = "";
      // Mute tune 1 — it keeps playing silently as the timer
      if (audioRef.current) audioRef.current.muted = true;
      // Start tune 2 after submitting
      audio2Ref.current = new Audio("/AcroExpress_tunes_02.mp3");
      audio2Ref.current.loop = false;
      audio2Ref.current.volume = soundGain();   // the player's sound setting
      audio2Ref.current.play().catch(() => { });
      setTimeout(() => document.getElementById("chatInput")?.focus(), 100);
    } catch (e) {
      // Show the server's reason under the input, e.g. "Word 2 ("apple") should start with V."
      // (the error text arrives as "400: <reason>")
      const reason = (e.message || "").replace(/^\d{3}:\s*/, "").replace(/^"|"$/g, "");
      setAcroError(reason || "That acro wasn't accepted.");
    }
  }

  handleSubmitAcroRef.current = handleSubmitAcro;

  // Sends the topic from the prompt. Needs at least 2 letters or digits (same rule as the server,
  // which refuses shorter ones too) — "l" and "s" were accepted by accident before.
  async function submitTopic() {
    const topic = topicDraft.trim();
    if ((topic.match(/[\p{L}\p{N}]/gu) || []).length < 2) {
      setTopicError("The topic needs at least 2 letters.");
      return;
    }
    try {
      const { setTopic } = await import("./services/api");
      await setTopic(id, topic);
      setTopicRequested(false);
      setTopicDraft("");
      setTopicError("");
      setTopicTimer(null);
    } catch (e) {
      // Show the server's reason (the error text arrives as "400: <reason>")
      setTopicError((e.message || "").replace(/^\d{3}:\s*/, "") || "The topic wasn't accepted.");
    }
  }

  async function handleStartRound() {
    try {
      await startRound(id);
    } catch (e) { alert(`Start failed: ${e.message}`); }
  }

  // The room closed: stop the music and close the live connection
  useEffect(() => {
    if (!roomClosed) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }
    if (votingAudioRef.current) { votingAudioRef.current.pause(); votingAudioRef.current = null; }
    disconnect();
  }, [roomClosed]);

  if (state.loading) return <div style={{ minHeight: "100vh", background: C.bgApp, color: C.textPrimary, padding: 24 }}>Loading room...</div>;
  if (state.error) return (
    <div style={{ minHeight: "100vh", background: C.bgApp, color: C.textPrimary, padding: 24 }}>
      <p style={{ color: C.brand }}>Error: {state.error}</p>
      <Btn onClick={() => navigate("/")}>Back to Lobby</Btn>
    </div>
  );
  // The room was deleted on the server while this page was open
  if (roomClosed) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, color: C.textPrimary }}>
      <Panel style={{ padding: 32, textAlign: "center", maxWidth: 480, borderColor: C.teal }}>
        <h2 style={{ margin: "0 0 12px", fontFamily: "Fredoka, sans-serif", fontSize: 26, color: C.ivory }}>
          {roomNameRef.current ? `"${roomNameRef.current}" has closed` : "This room has closed"}
        </h2>
        <p style={{ margin: "0 0 24px", color: C.textSecond, fontSize: 16 }}>
          Everyone left, or your connection was lost for a while.
        </p>
        <Btn onClick={() => navigate("/")}>Back to Lobby</Btn>
      </Panel>
    </div>
  );

  const data = state.data || {};
  const players = data.players || [];
  playersRef.current = players;
  // Score shown in Passengers — frozen during voting/drumroll, live otherwise
  const shownScore = p => (frozenScores && frozenScores[p.id] !== undefined ? frozenScores[p.id] : p.score);
  // Messages of the open private chat (kept per person, survives closing/reopening)
  const privateMessages = privateChat ? (privateHistory[privateChat.nickname] || []) : [];
  // Station shown in the header: 0 before the first round of a game (waiting, or the first topic
  // being chosen), otherwise the current round's number. During the round winner's topic prompt
  // it stays on the station just reached — the prompt itself says "Next up: Station N+1".
  const firstTopicPending = topicRequested && topicForFirstRound;
  const headerStation = phase === "Waiting" || phase === "Starting" || firstTopicPending ? 0 : currentRound;
  // The station the topic prompt is for
  const nextStation = topicForFirstRound ? 1 : currentRound + 1;
  // Phase title shown in the header (replaces the technical "Phase: Submitting")
  // (The round winner's topic prompt replaces the results after 8 s, so it comes first)
  const phaseTitle =
    topicRequested || phase === "Starting" ? "Choosing the topic"
    : phase === "Results" || phase === "Ended" ? "Results"
    : phase === "Submitting" ? "Write your acro"
    : phase === "Voting" ? "Voting"
    : phase === "Tallying" ? "Counting votes"
    : phase === "GameOver" ? "Final Stop"
    : phase === "Paused" ? "Paused"
    : "Waiting to start";
  // Topic is shown while players are writing their acros
  const showTopic = !!currentTopic && phase === "Submitting" && !topicRequested;
  // Stage sizes — compact versions on short windows. Used both by the elements and by the
  // stage height formula below, so the formula always matches what is drawn.
  const stagePad = isShort ? "clamp(4px, 1vh, 24px)" : "clamp(4px, 2vh, 24px)";       // space above and below the letters
  const timerSize = isShort ? "clamp(28px, 5vh, 46px)" : "clamp(28px, 6vh, 46px)";     // countdown number
  const letterSize = isShort ? "clamp(2.5rem, 9vh, 6rem)" : "clamp(3rem, 11vh, 6rem)"; // the big letters
  const topicBlock = (align) => (
    <div style={{ textAlign: align }}>
      <div style={{ fontSize: 12, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>Topic</div>
      {/* Smaller topic on short windows so it fits in the shorter header */}
      {/* margin auto centres the 420px-wide topic box under the letters (it slipped to the left) */}
      <div style={{ fontSize: isShort ? 20 : 28, color: C.teal, fontWeight: 700, fontFamily: "Fredoka, sans-serif", lineHeight: 1.15, maxWidth: 420, overflowWrap: "anywhere", margin: align === "center" ? "0 auto" : undefined }}>{currentTopic}</div>
    </div>
  );

  return (
    // Wide side margins on desktop (like AcroChallenge), tighter on phones
    // The page fills the window exactly: header on top, the stage takes whatever space is left,
    // and Passengers + chats are pinned to the bottom, so they never move between phases
    // Fit mode: laid out at view.w × view.h and shrunk with `zoom`, so it fills the window exactly.
    // Scroll mode (window too small even at 70%): normal height, the page scrolls with a scrollbar.
    <div style={{ height: view.scroll ? "auto" : view.h, minHeight: view.scroll ? "100vh" : undefined, zoom: view.scale, boxSizing: "border-box", overflow: view.scroll ? "visible" : "hidden", display: "flex", flexDirection: "column", color: C.textPrimary, padding: isNarrow ? 16 : "clamp(12px, 3vh, 24px) 64px" }}>

      {/* Private notice (e.g. acro not entered) — bold and short, above everything for 10 s */}
      {notice && (
        <div style={{ position: "fixed", top: 52, left: "50%", transform: "translateX(-50%)", zIndex: 60, background: C.brand, color: C.onBrand, padding: "8px 18px", borderRadius: 10, fontSize: 16, fontWeight: 700, boxShadow: "0 6px 20px rgba(0,0,0,0.4)", maxWidth: "calc(100% - 32px)", textAlign: "center" }}>
          {notice}
        </div>
      )}

      {/* Live connection lost — shown until it works again (it keeps trying by itself) */}
      {(connStatus === "reconnecting" || pollFailing) && (
        <div style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 60, background: C.brand, color: C.onBrand, padding: "6px 16px", borderRadius: 999, fontSize: 14, fontWeight: 600, boxShadow: "0 6px 20px rgba(0,0,0,0.4)" }}>
          Reconnecting…
        </div>
      )}

      {/* Voting overlay */}
      {phase === "Voting" && (
        <VotingScreen roomId={id} entries={entries.length > 0 ? entries : (data.entries || [])} myPlayerId={auth?.userId} onVoted={() => { }} onVoteCast={setMyVote} timer={timer} maxTimer={maxTimer} topic={currentTopic} />)}

      {/* Header */}
      {/* minHeight keeps room for the topic (top right), so the header is the same height with or without it.
          Short windows: 86px (smaller topic and gap) instead of 104px */}
      <div style={{ flexShrink: 0, minHeight: isNarrow ? 0 : (isShort ? 86 : 104), display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "clamp(8px, 2vh, 24px)" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontFamily: "Fredoka, sans-serif", color: C.ivory }}>{data.name || roomNameRef.current || `Room #${id}`}</h1>
          {/* div instead of p — a <div> (the timer) inside a <p> is invalid HTML */}
          <div style={{ margin: "4px 0 0", fontSize: 15, color: C.textMuted }}>
            {/* Rounds are stations: a game travels Station 0 → 1 → 2 … → Final Stop (round N = Station N) */}
            Station <span style={{ color: C.teal, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums", fontSize: 28, fontWeight: 700 }}>{headerStation}</span>
            {/* What's happening now, in words (first step towards the "Departure Board" announcer) */}
            {" · "}<span style={{ color: C.ivory, fontFamily: "Fredoka, sans-serif", fontSize: 20, fontWeight: 600 }}>{phaseTitle}</span>
            {/* What wins the game (the number comes from the server); hidden on the winner screen */}
            {phase !== "GameOver" && (
              <span style={{ color: C.textMuted, fontSize: 14, marginLeft: 10, whiteSpace: "nowrap" }}>
                First to <span style={{ fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums" }}>{data.winScore || 30}</span> wins
              </span>
            )}
            {/* The timer moved to the centre, above the letters */}
          </div>
        </div>
        {/* Gap between the buttons and the topic: 6px on short windows, 16px otherwise */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: isShort ? 6 : 16 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {/* "Express Colors" and "Sound" menus — change them any time, even mid-game */}
            <ThemePicker />
            <SoundControl />
            {/* After a game ends the room is back in Waiting, so a new game can be started */}
            {/* Hidden during the 30-second break after a game — the next game starts by itself */}
            {/* Not while the first topic is being chosen: round 1 already exists then (currentRoundNumber > 0)
                — clicking it gave "round already in progress" */}
            {((phase === "Waiting" && !topicRequested && !(data.currentRoundNumber > 0)) || (phase === "GameOver" && (nextGameIn === null || nextGameIn <= -10)) || phase === "Paused") && <Btn onClick={handleStartRound}>{phase === "GameOver" ? "New Game" : "Start Game"}</Btn>}
            <BtnSecondary onClick={handleLeaveRoom}>← Back to Lobby</BtnSecondary>
          </div>
          {/* Topic — top right, under Back to Lobby (on phones it sits under the letters) */}
          {showTopic && !isNarrow && topicBlock("right")}
        </div>
      </div>

      {/* Stage — always the height the writing phase needs (timer + letters + acro box), in every phase, so the boxes below never move. Passengers and the
          chats get all the remaining space. On short screens the stage shrinks and scrolls inside.
          scrollbarWidth "none" hides the scrollbar (rounding made a 1px overflow show one) — the wheel still scrolls.
          flex "0 0": the stage never shrinks, so the acro box is never pushed out of sight (Deb lost it). */}
      {/* Scroll mode: the stage is as tall as its contents (the topic under the letters included),
          because the page scrolls anyway — nothing inside it can be cut off or covered. */}
      <div style={{ flex: view.scroll ? "0 0 auto" : `0 0 calc(2 * ${stagePad} + ${timerSize} + clamp(4px, 1.5vh, 12px) + ${letterSize} + 173px)`, minHeight: 0, overflowY: view.scroll ? "visible" : "auto", scrollbarWidth: (phase === "Results" && !resultsClosed) || topicRequested ? "thin" : "none", display: "flow-root" }}>
      {/* (scrollbar: hidden normally, slim while results are shown, in case a long list doesn't fit) */}

      {/* Round results and the winner's topic prompt — inside the stage, where the letters are
          (like Acrophobia). Before, they floated over the page and covered "Round N" in the header.
          Never both at once: results first; for the round winner the topic prompt replaces them. */}
      {((phase === "Results" && !resultsClosed) || topicRequested) && (
        <div style={{ marginBottom: 16 }}>
          {phase === "Results" && !resultsClosed && !topicRequested && (
            <div>
            <ResultsScreen scores={scores} winningAcro={winningAcro} entries={entries} players={players}
              round={currentRound} topic={currentTopic} onClose={() => setResultsClosed(true)} myVote={myVote}
              votes={roundVotes} myName={auth?.username} />
            </div>
          )}
          {topicRequested && (
        <div>
        <Panel style={{ padding: 20, borderColor: C.teal, textAlign: "center" }}>
          <h2 style={{ margin: "0 0 8px", fontFamily: "Fredoka, sans-serif", fontSize: 22, color: C.teal }}>
            {/* The topic is chosen BEFORE the round (station) it belongs to — the round starts with the countdown */}
            Next up: Station <span style={{ fontFamily: NUM_FONT }}>{nextStation}</span>
          </h2>
          <p style={{ margin: "0 0 16px", color: C.textMuted, fontSize: 15 }}>
            Set the topic — you have <span style={{ color: C.ivory, fontWeight: 700 }}>{topicTimer}s</span>, or it defaults to General Acro.
          </p>
          {/* Letters go 3,4,5,6,7 and repeat — same rule as the server (3 + (round - 1) % 5).
              Round 1 always has 3; otherwise currentRound is the round that just ended, so the next one has 3 + (currentRound % 5) */}
          <p style={{ margin: "0 0 16px", color: C.textSecond, fontSize: 16 }}>
            <span style={{ color: C.brand, fontWeight: 700, fontFamily: NUM_FONT }}>{topicForFirstRound ? 3 : 3 + (currentRound % 5)}</span> letters
          </p>
          <div style={{ display: "flex", gap: 8, maxWidth: 500, margin: "0 auto" }}>
            <input
              id="topicInput"
              autoFocus
              // Slimmer than before (was 10px padding, 18px text) — the button takes the same height
              style={{ flex: 1, minWidth: 0, background: C.bgApp, border: `1px solid ${C.teal}`, borderRadius: 8, padding: "7px 12px", color: C.textPrimary, fontSize: 16, outline: "none", fontFamily: "inherit", textAlign: "center" }}
              placeholder="Type a topic..."
              value={topicDraft}
              onChange={e => { setTopicDraft(e.target.value); setTopicError(""); }}
              onKeyDown={e => { if (e.key === "Enter") submitTopic(); }}
            />
            {/* nowrap: "Set Topic" stays on one line */}
            <Btn onClick={submitTopic} style={{ whiteSpace: "nowrap" }}>Set Topic</Btn>
          </div>
          {/* Why the topic wasn't accepted (e.g. "l" — at least 2 letters) */}
          {topicError && <p style={{ margin: "10px 0 0", color: C.brand, fontSize: 14, fontWeight: 600 }}>{topicError}</p>}
        </Panel>
        </div>
          )}
        </div>
      )}


      {/* Game over — shown inline where letters normally appear */}
      {phase === "GameOver" && gameWinner && (
        <Panel style={{ padding: 32, marginBottom: 16, textAlign: "center", borderColor: C.teal }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: C.teal, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Final Stop
          </p>
          <h2 style={{ margin: "0 0 16px", fontFamily: "Fredoka, sans-serif", fontSize: 48, color: C.ivory, lineHeight: 1 }}>
            👑 {gameWinner.name}
          </h2>
          <p style={{ margin: "0 0 24px", fontSize: 18, color: C.textSecond, fontStyle: "italic" }}>
            {gameWinner.message}
          </p>
          <p style={{ margin: "0 0 24px", fontSize: 15, color: C.textMuted }}>
            {/* Countdown during the break; "Departing…" while the server starts it; the old hint if it didn't */}
            {nextGameIn > 0 ? `The next journey starts in ${nextGameIn}s`
              : nextGameIn !== null && nextGameIn > -10 ? "Departing…"
              : "Press New Game to start the next departure."}
          </p>
        </Panel>
      )}

      {/* Letters */}
      {letters.length > 0 && !topicRequested && phase !== "Results" && phase !== "GameOver" && (
        <div style={{ textAlign: "center", padding: `${stagePad} 0` }}>
          {/* Countdown — number only, centred above the letters, red in the last 10 seconds.
              The line is always there; when the timer has ended it is only made invisible, so the
              letters below keep their place (before, they jumped up when the timer ended). */}
          <div style={{ fontSize: timerSize, fontWeight: 700, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums", color: timer !== null && timer <= 10 ? C.brand : C.teal, lineHeight: 1, marginBottom: "clamp(4px, 1.5vh, 12px)", visibility: timer !== null && timer > 0 ? "visible" : "hidden" }}>
            {/* "0" keeps the line one number tall while it is hidden */}
            {timer !== null && timer > 0 ? timer : 0}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {letters.map((l, i) => (
              <span key={i} style={{
                fontFamily: "'Bowlby One SC', serif",
                fontSize: letterSize, // smaller on short laptop screens (even smaller on short windows)
                lineHeight: 1,
                color: C.brand,
                textShadow: `3px 3px 0px rgba(0,0,0,0.5)`,
                fontWeight: 400
              }}>
                {l}
              </span>
            ))}
          </div>
          {showTopic && isNarrow && <div style={{ marginTop: 16 }}>{topicBlock("center")}</div>}
        </div>
      )}

      {/* Acro input */}

      {phase === "Submitting" && !topicRequested && (
        // Clicking anywhere in this box puts the cursor in the acro field — players
        // were clicking the light box itself, thinking that was where to type
        <Panel style={{ padding: 16, marginBottom: 16, cursor: "text" }}
          onClick={e => {
            if (e.target.closest("button")) return; // let Submit/Edit/Cancel work normally
            document.getElementById("acroInput")?.focus();
          }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 20, color: C.textPrimary }}>Your Acro</h2>
            {/* The topic is now shown at the top right (or under the letters on phones) */}
          </div>
          {submittedAcro && !isEditing ? (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 15, color: C.textMuted }}>Your entry is on its way.</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1, background: C.bgApp, border: `1px solid ${C.teal}`, borderRadius: 8, padding: "10px 14px", color: C.teal, fontWeight: 600, textAlign: "center", fontSize: 20 }}>
                  {submittedAcro}
                </div>
                <Btn color={C.navy2} hoverColor={C.navy3} style={{ color: C.teal, border: `1px solid ${C.teal}` }} onClick={() => {
                  setMyDraft(submittedAcro);
                  setIsEditing(true);
                  // Pause tune 2 and unmute tune 1 when editing
                  if (audio2Ref.current) { audio2Ref.current.pause(); }
                  if (audioRef.current) audioRef.current.muted = false;
                }}>Edit</Btn>
              </div>
            </>
          ) : (
            <>
              {/* Why the acro wasn't accepted — shown in place of the hint, so the box never grows */}
              {/* Instructions are short and bold ("Use 3 words, one for each letter: B T V") — the player is in a hurry */}
              <p style={{ margin: "0 0 10px", fontSize: acroError ? 16 : 15, color: acroError ? C.brand : C.textMuted, fontWeight: acroError ? 700 : 400 }}>
                {acroError || "Type a sentence where each word starts with the letters above."}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="acroInput"
                  // Scroll mode: bring the acro box into the middle of the screen when it is clicked
                  onFocus={e => { if (view.scroll) e.target.scrollIntoView({ block: "center", behavior: "smooth" }); }}
                  // Clear teal border so the typing field stands out inside the lighter box
                  style={{ flex: 1, minWidth: 0 /* may get narrower than its default, so Submit fits on phones */, background: C.bgApp, border: `2px solid ${C.teal}`, borderRadius: 8, padding: "10px 14px", color: C.textPrimary, fontSize: 20, outline: "none", fontFamily: "inherit", textAlign: "center" }}
                  placeholder="Type your acro..."
                  value={myDraft}
                  onChange={e => {
                    setMyDraft(e.target.value);
                    myDraftRef.current = e.target.value;
                    setAcroError("");
                    saveDraft(e.target.value);
                  }}
                  onKeyDown={e => { if (e.key === "Enter") handleSubmitAcro(); }}
                />
                <Btn onClick={handleSubmitAcro}>{isEditing ? "Update" : "Submit"}</Btn>
                {isEditing && <BtnSecondary onClick={() => { setIsEditing(false); setAcroError(""); saveDraft("", true); }}>Cancel</BtnSecondary>}
              </div>
            </>
          )}
        </Panel>
      )}

      {/* Results and the topic prompt are floating panels now (see the top of this return) */}

      {/* Paused — no acros for several rounds */}
      {phase === "Paused" && (
        <Panel style={{ padding: 16, marginBottom: 16, textAlign: "center" }}>
          <p style={{ color: C.textMuted, margin: 0 }}>Game paused: no acros for 3 rounds in a row. Press Start Game to continue.</p>
        </Panel>
      )}

      {/* Waiting (not while the topic prompt for round 1 is open — it sits in the stage too) */}
      {phase === "Waiting" && !topicRequested && (
        <Panel style={{ padding: 16, marginBottom: 16, textAlign: "center" }}>
          <p style={{ color: C.textMuted, margin: 0 }}>Waiting for the game to start...</p>
        </Panel>
      )}

      </div>

      {/* Bottom: players | chat | private chat.
          Gets all the height the stage leaves (never below 170px). The stage keeps its full height,
          so the acro box always stays visible — short windows get the compact stage instead.
          Scroll mode: a fixed comfortable height (380px) instead; when narrow, the boxes are stacked
          (Passengers, Room Chat, private chat) and each chat gets 360px. */}
      <div style={{
        flex: view.scroll ? "0 0 auto" : "1 0 170px",
        minHeight: 170,
        height: view.scroll && !isNarrow ? 380 : undefined,
        display: "grid",
        gridTemplateRows: isNarrow ? undefined : "minmax(0, 1fr)",
        gridAutoRows: isNarrow ? "auto" : undefined,
        gridTemplateColumns: isNarrow ? "1fr" : (privateChat ? "1fr 2fr 1fr" : "1fr 3fr"),
        gap: 16
      }}>

        {/* Players */}
        {/* Stacked (narrow): at most 200px tall, scrolls inside when there are many passengers */}
        <Panel style={{ padding: 16, minHeight: 0, maxHeight: isNarrow ? 200 : undefined, overflowY: "auto", boxSizing: "border-box" }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 14, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Passengers
            {/* While writing: how many of the connected players have submitted (like Acrophobia) */}
            {phase === "Submitting" && (
              <span style={{ marginLeft: 8, color: C.teal, textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
                · {players.filter(p => p.isConnected !== false && submittedIds.includes(String(p.id).toLowerCase())).length} of {players.filter(p => p.isConnected !== false).length} submitted
              </span>
            )}
          </h2>
          {players.length === 0 ? (
            <p style={{ color: C.textMuted, fontSize: 15, margin: 0 }}>No passengers yet</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {[...players].sort((a, b) => shownScore(b) - shownScore(a)).map(p => (
                <li key={p.id}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, padding: "4px 8px", background: C.bgApp, borderRadius: 6, cursor: p.id !== auth?.userId ? "pointer" : "default" }}
                  onDoubleClick={() => {
                    if (p.id !== auth?.userId) {
                      // Opens (or re-opens) the chat — the history lives in privateHistory,
                      // so this no longer wipes earlier messages
                      setPrivateChat({ userId: p.id, nickname: p.nickname });
                      setUnreadFrom(prev => ({ ...prev, [p.nickname]: 0 }));
                    }
                  }}>
                  {/* Left side: a fixed tick column, then the name — the ✓ sits outside the name in its own
                      16px column, so names never move when someone submits (Damon's request) */}
                  <span style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                  <span title={phase === "Submitting" && submittedIds.includes(String(p.id).toLowerCase()) ? "Submitted" : undefined}
                    style={{ width: 16, flexShrink: 0, color: C.teal, fontWeight: 700 }}>
                    {phase === "Submitting" && submittedIds.includes(String(p.id).toLowerCase()) ? "✓" : ""}
                  </span>
                  {/* Submitted this round (while writing): name in teal */}
                  <span style={{ color: p.isConnected === false ? C.textMuted : (phase === "Submitting" && submittedIds.includes(String(p.id).toLowerCase()) ? C.teal : C.textSecond), fontWeight: phase === "Submitting" && submittedIds.includes(String(p.id).toLowerCase()) ? 700 : 400, opacity: p.isConnected === false ? 0.6 : 1 }}>
                    {p.nickname}
                    {p.id === auth?.userId && <span style={{ color: C.teal, marginLeft: 4 }}>(you)</span>}
                    {/* Window closed / connection lost — removed after about 10 seconds */}
                    {p.isConnected === false && <span style={{ marginLeft: 4, fontStyle: "italic" }}>(away)</span>}
                    {unreadFrom[p.nickname] > 0 && (
                      <span style={{ marginLeft: 6, background: C.brand, color: C.onBrand, fontSize: 10, borderRadius: 999, padding: "1px 6px" }}>
                        {unreadFrom[p.nickname]}
                      </span>
                    )}
                  </span>
                  </span>
                  <span style={{ color: C.teal, fontWeight: 700, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums" }}>{shownScore(p)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Room chat */}
        {/* Stacked (narrow): a fixed 360px so the messages and the input are always visible */}
        <Panel style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 0, height: isNarrow ? 360 : undefined }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
            <h2 style={{ margin: 0, fontSize: 14, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Room Chat</h2>
          </div>
          <div ref={chatListRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
            {roomMessages.length === 0 ? (
              <p style={{ color: C.textMuted, fontSize: 15, margin: 0 }}>No messages yet...</p>
            ) : (
              roomMessages.map((m, i) => (
                m.system ? (
                  <div key={i} style={{ fontSize: 14, color: C.textMuted, fontStyle: "italic", textAlign: "center", padding: "2px 0" }}>{m.message}</div>
                ) : (
                  <div key={i} style={{ fontSize: 15 }}>
                    <span style={{ color: C.teal, fontWeight: 600 }}>{m.nickname}: </span>
                    <span style={{ color: C.textSecond }}>{m.message}</span>
                  </div>
                )
              ))
            )}
            <div ref={chatBottomRef} />
          </div>
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
            <input
              id="chatInput"
              style={{ flex: 1, background: C.bgApp, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.textPrimary, fontSize: 15, outline: "none", fontFamily: "inherit" }}
              placeholder="Say something..."
              value={roomChatInput}
              onChange={e => setRoomChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") sendRoomMessage(); }}
            />
            <Btn onClick={sendRoomMessage}>Send</Btn>
          </div>
        </Panel>

        {/* Private chat */}
        {privateChat && (
          <Panel style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 0, height: isNarrow ? 360 : undefined, borderColor: C.lavender }}>
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 14, color: C.lavender, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Private · {privateChat.nickname}
              </h2>
              <button onClick={() => setPrivateChat(null)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <div ref={privateChatListRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
              {privateMessages.length === 0 ? (
                <p style={{ color: C.textMuted, fontSize: 15, margin: 0 }}>Start a private conversation...</p>
              ) : (
                privateMessages.map((m, i) => (
                  <div key={i} style={{ fontSize: 15 }}>
                    <span style={{ color: m.nickname === auth?.username ? C.teal : C.lavender, fontWeight: 600 }}>{m.nickname}: </span>
                    <span style={{ color: C.textSecond }}>{m.message}</span>
                  </div>
                ))
              )}
              <div ref={privateChatBottomRef} />
            </div>
            <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
              <input
                id="privateChatInput"
                style={{ flex: 1, background: C.bgApp, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.textPrimary, fontSize: 15, outline: "none", fontFamily: "inherit" }}
                placeholder={`Message ${privateChat.nickname}...`}
                value={privateChatInput}
                onChange={e => setPrivateChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") sendPrivateMessage(); }}
                autoFocus
              />
              <Btn color={C.navy2} hoverColor={C.navy3} style={{ color: C.lavender, border: `1px solid ${C.lavender}` }} onClick={sendPrivateMessage}>Send</Btn>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/room/:id" element={<Room />} />
    </Routes>
  );
}
