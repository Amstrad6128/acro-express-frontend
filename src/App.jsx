import { useEffect, useState, useCallback, useRef } from "react";
import { Routes, Route, useParams, useNavigate } from "react-router-dom";
import { fetchHealth, createRoom, joinRoom, startRound, submitAcro, castVote, getAuth } from "./services/api";
import { useSignalR } from "./hooks/useSignalR";
import { useLobbyHub } from "./hooks/useLobbyHub";

// ── Design tokens ──────────────────────────────────────────────
const C = {
  bgApp: "#070b14",
  bgPanel: "#131A2E",
  bgPanel2: "#1A233B",
  border: "#2B3758",
  textPrimary: "#F3F4F8",
  textSecond: "#C7CEE0",
  textMuted: "#94A0BE",
  brand: "#F26A5E",
  brandHover: "#FF7A6B",
  teal: "#6FB7C8",
  tealLight: "#8FD0DE",
  lavender: "#B7B3E6",
  ivory: "#F2E6D8",
  success: "#4FAF8F",
  navy2: "#24314D",
  navy3: "#2C3B5F",
};

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
        color: "#FFF8F6",
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
  const { players, messages, sendMessage } = useLobbyHub();
  const [chatInput, setChatInput] = useState("");
  const lobbyBottomRef = useRef(null);

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

  async function handleCreate() {
    if (!auth) { alert("Please log in first!"); return; }
    const name = window.prompt("Name your room:", "");
    if (!name || !name.trim()) return;
    try {
      const data = await createRoom(name.trim());
      const id = data?.id || data?.roomId;
      if (!id) throw new Error("No room id");
      navigate(`/room/${encodeURIComponent(id)}`);
    } catch (e) { alert(`Error: ${e.message}`); }
  }

  return (
    <div style={{ height: "100vh", overflowY: "auto", color: C.textPrimary }}>
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontFamily: "'Nunito', sans-serif", fontSize: 30, fontWeight: 800, color: C.brand, margin: 0, letterSpacing: "-0.5px" }}>Acro Express</h1>
        <span style={{ color: C.textMuted, fontSize: 15 }}>{status}</span>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px" }}>

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
            <Btn onClick={doLogout} color="#8B2020" hoverColor="#A52828">Log out</Btn>
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
            <Btn onClick={handleCreate}>+ Create Room</Btn>
          </div>
          {roomList.length === 0 ? (
            <p style={{ color: C.textMuted, fontSize: 15, margin: 0 }}>No rooms yet. Create one!</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {roomList.map(room => (
                <div key={room.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bgApp, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, color: C.textPrimary }}>{room.name}</p>
                    <p style={{ margin: 0, fontSize: 14, color: C.textMuted }}>{room.playerCount}/{room.maxPlayers} players · {room.status}</p>
                  </div>
                  <BtnSecondary onClick={() => navigate(`/room/${room.id}`)}>Join</BtnSecondary>
                </div>
              ))}
            </div>
          )}
        </Panel>}

        {auth && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: 16 }}>
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
                  style={{ flex: 1, background: C.bgApp, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.textPrimary, fontSize: 15, outline: "none", fontFamily: "inherit" }}
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
function VotingScreen({ roomId, entries, myPlayerId, onVoted, timer, maxTimer }) {
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
    } catch (e) { alert(`Vote failed: ${e.message}`); }
  }

  // Lock in the vote and close the overlay
  function handleDoneVoting() {
    setSubmitted(true);
    if (onVoted) onVoted();
    setClosed(true);
  }

  if (closed) return null;

  const auth = getAuth();
  // Hide the player's own entry from the voting list
  const visibleEntries = entries.filter(e =>
    typeof e === "string" ? true : e.playerId?.toString() !== auth?.userId?.toString()
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 520, background: C.bgPanel, border: `1px solid ${C.brand}`, borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ margin: 0, fontSize: 20, color: C.ivory, fontFamily: "Fredoka, sans-serif" }}>{textPair.title}</h2>
          {selected && selected !== "blank" && !submitted && (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: C.textMuted }}>
              You can change your vote until you click "Done Voting".
            </p>
          )}
        </div>

        {/* Entry list */}
        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto" }}>
          {visibleEntries.length === 0 ? (
            <p style={{ color: C.textMuted, fontSize: 15, textAlign: "center" }}>No entries to vote on this round...</p>
          ) : (
            visibleEntries.map((entry, i) => (
              <button key={i}
                onClick={() => handleSelect(entry.id)}
                disabled={submitted}
                style={{
                  width: "100%", textAlign: "left", padding: "12px 16px",
                  background: selected === entry.id ? `${C.brand}22` : C.bgPanel2,
                  border: `1px solid ${selected === entry.id ? C.brand : C.border}`,
                  borderRadius: 10, color: selected === entry.id ? C.ivory : C.textSecond,
                  fontSize: 16, cursor: submitted ? "not-allowed" : "pointer",
                  opacity: submitted && selected !== entry.id ? 0.6 : 1,
                  fontFamily: "inherit", transition: "all 0.15s"
                }}>
                {typeof entry === "string" ? entry : entry.sentence}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 24px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "center", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Blank vote option */}
          {!submitted && (
            <button
              onClick={handleBlankVote}
              style={{
                background: selected === "blank" ? `${C.textMuted}22` : "transparent",
                border: `1px solid ${selected === "blank" ? C.textMuted : C.border}`,
                borderRadius: 8, padding: "6px 14px", fontSize: 14,
                color: selected === "blank" ? C.textPrimary : C.textMuted,
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
              }}>
              None of the above
            </button>
          )}

          {/* Timer */}
          {timer !== null && timer > 0 && (
            <div style={{ marginTop: 8, width: 220 }}>
              <div style={{ background: C.border, borderRadius: 999, height: 6, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  borderRadius: 999,
                  background: timer <= 10 ? C.brand : C.teal,
                  // Width shrinks as timer counts down — needs maxTimer to calculate percentage
                  width: `${(timer / maxTimer) * 100}%`,
                  transition: "width 1s linear, background 0.3s"
                }} />
              </div>
              <span style={{ fontSize: 13, color: C.textMuted, marginTop: 4, display: "block" }}>{timer}</span>
            </div>
          )}

          {/* Done voting button */}
          <BtnSecondary onClick={handleDoneVoting}>Done Voting</BtnSecondary>
        </div>
      </div>
    </div>
  );
}

// ── Results Screen ─────────────────────────────────────────────
function ResultsScreen({ scores, winningAcro, entries, players }) {
  const sorted = Object.entries(scores || {}).sort((a, b) => b[1] - a[1]);

  const entryByNickname = {};
  (entries || []).forEach(e => {
    const player = (players || []).find(p => p.id === e.playerId?.toString());
    if (player) entryByNickname[player.nickname] = e.sentence;
  });

  return (
    <Panel style={{ padding: 16 }}>
      <h2 style={{ margin: "0 0 12px", color: C.ivory, fontFamily: "Fredoka, sans-serif", fontSize: 20 }}>🏆 Round Results</h2>
      {winningAcro && (
        <div style={{ background: C.bgApp, border: `1px solid ${C.teal}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
          <p style={{ margin: 0, fontSize: 11, color: C.teal, textTransform: "uppercase", letterSpacing: "0.1em" }}>Winning Entry</p>
          <p style={{ margin: "4px 0 0", color: C.ivory, fontWeight: 600 }}>"{winningAcro}"</p>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {sorted.map(([name, score], i) => (
          <div key={name} style={{ display: "flex", alignItems: "center", background: C.bgApp, borderRadius: 6, padding: "8px 12px", gap: 12 }}>
            <span style={{ color: C.teal, fontWeight: 700, minWidth: 30 }}>{score}</span>
            <span style={{ color: C.textSecond, minWidth: 120 }}>{i === 0 ? "👑 " : `${i + 1}. `}{name}</span>
            <span style={{ color: C.ivory, fontStyle: "italic", fontSize: 17 }}>
              {entryByNickname[name] || ""}
            </span>
          </div>
        ))}
      </div>
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
  const [phase, setPhase] = useState("Waiting");
  const [currentRound, setCurrentRound] = useState(1);
  const [letters, setLetters] = useState([]);
  const [entries, setEntries] = useState([]);
  const [scores, setScores] = useState({});
  const [winningAcro, setWinningAcro] = useState(null);
  const [timer, setTimer] = useState(null);
  const [submittedAcro, setSubmittedAcro] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [currentTopic, setCurrentTopic] = useState("");

  const [roomMessages, setRoomMessages] = useState([]);
  const [roomChatInput, setRoomChatInput] = useState("");
  const chatBottomRef = useRef(null);

  const [creatorId, setCreatorId] = useState(null);
  const [gameWinner, setGameWinner] = useState(null); // null = no game over, object = { name, message }

  const [maxTimer, setMaxTimer] = useState(60); // tracks initial timer value for the progress bar
  const [topicRequested, setTopicRequested] = useState(false);
  const [topicDraft, setTopicDraft] = useState("");
  const [topicTimer, setTopicTimer] = useState(null);

  const [privateChat, setPrivateChat] = useState(null);
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
  const topicRequestedRef = useRef(false);

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
    onRoundStarted: useCallback((roundNumber, lettersStr, seconds) => {
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
      setCurrentTopic("");
      setCurrentRound(roundNumber);
      postSystemMessage(`Round ${roundNumber} has begun.`);
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

      // Stop all previous audio
      if (votingAudioRef.current) { votingAudioRef.current.pause(); votingAudioRef.current = null; }
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }

      // Try to play tune 1 — if blocked, play on next user gesture
      setTimeout(() => {
        const audio = new Audio("/AcroExpress_tunes.m4a");
        audio.loop = false;
        audioRef.current = audio;
        audio.play().catch(() => {
          // Autoplay blocked — wait for next click or keydown
          const playOnGesture = () => {
            audio.play().catch(() => { });
            window.removeEventListener("click", playOnGesture);
            window.removeEventListener("keydown", playOnGesture);
          };
          window.addEventListener("click", playOnGesture);
          window.addEventListener("keydown", playOnGesture);
        });
      }, 200);
    }, []),

    onVotingStarted: useCallback((acroEntries, votingSeconds) => {
      // Stop all music when voting starts
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }
      setEntries(acroEntries || []);
      setPhase("Voting");
      setTimer(votingSeconds || 20);
      setMaxTimer(votingSeconds || 20);
    }, []),

    onTopicRequested: useCallback((creatorUserId) => {
      if (auth?.userId === creatorUserId) {
        setTopicRequested(true);
        topicRequestedRef.current = true;
        setTopicTimer(15);
      } else {
        postSystemMessage("Waiting for the host to set a topic...");
      }
    }, [auth]),

    onRoundEnded: useCallback((roundScores, winning, winnerPlayerId) => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }

      const drumroll = new Audio("/AcroExpress_drumroll.m4a");
      votingAudioRef.current = drumroll;
      drumroll.play().catch(() => { });

      setTimeout(() => {
        setScores(roundScores || {});
        setWinningAcro(winning);
        setPhase("Results");
        setTimer(null);

        if (winnerPlayerId && auth?.userId === winnerPlayerId) {
          setTopicRequested(true);
          topicRequestedRef.current = true;
          setTopicTimer(15);
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
      setPhase("GameOver");
    }, []),

    onTopicSet: useCallback((topic) => {
      setTopicRequested(false);
      topicRequestedRef.current = false;
      setTopicDraft("");
      setTopicTimer(null);
      setCurrentTopic(topic);
      postSystemMessage(`Topic for this round: "${topic}"`);
    }, []),

    onPrivateMessage: useCallback((senderNickname, message) => {
      setPrivateChat(prev => {
        if (prev?.nickname === senderNickname) {
          return { ...prev, messages: [...prev.messages, { nickname: senderNickname, message, time: new Date() }] };
        }
        return prev;
      });
      setUnreadFrom(prev => ({ ...prev, [senderNickname]: (prev[senderNickname] || 0) + 1 }));
    }, []),

    onRoomMessage: useCallback((nickname, message) => {
      setRoomMessages(prev => [...prev, { nickname, message, time: new Date() }]);
    }, []),

    onPlayerJoined: useCallback((playerId) => {
      refreshRoomState();
    }, []),

    onPlayerLeft: useCallback(() => {
      refreshRoomState();
      postSystemMessage("A player has left the room.");
    }, []),

    onChatMessage: useCallback(() => { }, []),
  };

  const { disconnect, connectionRef } = useSignalR(id, signalRHandlers);

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [roomMessages]);
  useEffect(() => { privateChatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [privateChat?.messages]);

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
        setPrivateChat(prev => ({ ...prev, messages: [...prev.messages, { nickname: auth.username, message: text, time: new Date() }] }));
        setPrivateChatInput("");
      }
    } catch (e) { console.error(e); }
  }

  async function handleLeaveRoom() {
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
      setState({ loading: false, error: null, data });
      if (data?.letters) setLetters(typeof data.letters === "string" ? data.letters.split("") : data.letters);
      setPhase(prev => {
        if (prev === "Submitting" || prev === "Voting" || prev === "Results") return prev;
        return data?.phase || prev;
      });
    } catch (err) { setState({ loading: false, error: String(err?.message || err), data: null }); }
  }

  useEffect(() => {
    refreshRoomState();
    const iv = setInterval(refreshRoomState, 3000);
    return () => clearInterval(iv);
  }, [id]);

  useEffect(() => {
    if (timer === null || timer <= 0) return;
    const currentPhase = phase;
    const iv = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          clearInterval(iv);
          if (currentPhase === "Submitting" && myDraftRef.current.trim() && !submittedAcroRef.current) {
            handleSubmitAcroRef.current?.();
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [timer]);

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
        audio2Ref.current.play().catch(() => { });
        setTimeout(() => document.getElementById("chatInput")?.focus(), 100);
        return;
      }
      await submitAcro(id, auth.userId, text);
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
      audio2Ref.current.play().catch(() => { });
      setTimeout(() => document.getElementById("chatInput")?.focus(), 100);
    } catch (e) {
      if (e.message?.includes("SINGLE_LETTER")) {
        alert("😄 Come on, you can do better than that! Each word needs more than one letter.");
      } else {
        alert(`Submit failed: ${e.message}`);
      }
    }
  }

  handleSubmitAcroRef.current = handleSubmitAcro;

  async function handleStartRound() {
    try {
      await startRound(id);
    } catch (e) { alert(`Start failed: ${e.message}`); }
  }

  if (state.loading) return <div style={{ minHeight: "100vh", background: C.bgApp, color: C.textPrimary, padding: 24 }}>Loading room...</div>;
  if (state.error) return (
    <div style={{ minHeight: "100vh", background: C.bgApp, color: C.textPrimary, padding: 24 }}>
      <p style={{ color: C.brand }}>Error: {state.error}</p>
      <Btn onClick={() => navigate("/")}>Back to Lobby</Btn>
    </div>
  );

  const data = state.data || {};
  const players = data.players || [];

  return (
    <div style={{ height: "100vh", overflowY: "auto", color: C.textPrimary, padding: 24 }}>

      {/* Voting overlay */}
      {phase === "Voting" && (
        <VotingScreen roomId={id} entries={entries.length > 0 ? entries : (data.entries || [])} myPlayerId={auth?.userId} onVoted={() => { }} timer={timer} maxTimer={maxTimer} />)}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontFamily: "Fredoka, sans-serif", color: C.ivory }}>{data.name || `Room #${id}`}</h1>
          <p style={{ margin: "4px 0 0", fontSize: 15, color: C.textMuted }}>
            Round <span style={{ color: C.teal, fontFamily: "Fredoka, sans-serif", fontSize: 28, fontWeight: 700 }}>{currentRound}</span>
            {" · "}Phase: <span style={{ color: C.textPrimary, fontWeight: 600 }}>{phase}</span>
            {timer !== null && timer > 0 &&
              <div style={{ marginTop: 8, width: 220 }}>
                <div style={{ background: C.border, borderRadius: 999, height: 6, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    borderRadius: 999,
                    background: timer <= 10 ? C.brand : C.teal,
                    width: `${(timer / maxTimer) * 100}%`,
                    transition: "width 1s linear, background 0.3s"
                  }} />
                </div>
                <span style={{ fontSize: 13, color: C.textMuted, marginTop: 4, display: "block" }}>{timer}</span>
              </div>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {phase === "Waiting" && <Btn onClick={handleStartRound}>Start Game</Btn>}
          <BtnSecondary onClick={handleLeaveRoom}>← Back to Lobby</BtnSecondary>
        </div>
      </div>

      {/* Topic selection prompt */}
      {topicRequested && (
        <Panel style={{ padding: 20, marginBottom: 16, borderColor: C.teal, textAlign: "center" }}>
          <h2 style={{ margin: "0 0 8px", fontFamily: "Fredoka, sans-serif", fontSize: 22, color: C.teal }}>
            Set the topic for this round
          </h2>
          <p style={{ margin: "0 0 16px", color: C.textMuted, fontSize: 15 }}>
            You have <span style={{ color: C.ivory, fontWeight: 700 }}>{topicTimer}s</span> — or it defaults to General Acro.
          </p>
          <div style={{ display: "flex", gap: 8, maxWidth: 500, margin: "0 auto" }}>
            <input
              id="topicInput"
              autoFocus
              style={{ flex: 1, background: C.bgApp, border: `1px solid ${C.teal}`, borderRadius: 8, padding: "10px 14px", color: C.textPrimary, fontSize: 18, outline: "none", fontFamily: "inherit", textAlign: "center" }}
              placeholder="Type a topic..."
              value={topicDraft}
              onChange={e => setTopicDraft(e.target.value)}
              onKeyDown={async e => {
                if (e.key === "Enter" && topicDraft.trim()) {
                  const { setTopic } = await import("./services/api");
                  await setTopic(id, topicDraft.trim());
                  setTopicRequested(false);
                  setTopicDraft("");
                  setTopicTimer(null);
                }
              }}
            />
            <Btn onClick={async () => {
              if (topicDraft.trim()) {
                const { setTopic } = await import("./services/api");
                await setTopic(id, topicDraft.trim());
                setTopicRequested(false);
                setTopicDraft("");
                setTopicTimer(null);
              }
            }}>Set Topic</Btn>
          </div>
        </Panel>
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
            A new departure begins shortly. Stay on board.
          </p>
        </Panel>
      )}

      {/* Letters */}
      {letters.length > 0 && !topicRequested && phase !== "Results" && (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {letters.map((l, i) => (
              <span key={i} style={{
                fontFamily: "'Bowlby One SC', serif",
                fontSize: "6rem",
                lineHeight: 1,
                color: C.brand,
                textShadow: `3px 3px 0px rgba(0,0,0,0.5)`,
                fontWeight: 400
              }}>
                {l}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Acro input */}

      {phase === "Submitting" && !topicRequested && (
        <Panel style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 20, color: C.textPrimary }}>Your Acro</h2>
            {currentTopic && (
              <p style={{ margin: 0, fontSize: 20, color: C.teal, fontStyle: "italic", fontWeight: 600 }}>
                {currentTopic}
              </p>
            )}
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
              <p style={{ margin: "0 0 10px", fontSize: 15, color: C.textMuted }}>
                Type a sentence where each word starts with the letters above.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="acroInput"
                  style={{ flex: 1, background: C.bgApp, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.textPrimary, fontSize: 20, outline: "none", fontFamily: "inherit", textAlign: "center" }}
                  placeholder="Type your acro..."
                  value={myDraft}
                  onChange={e => { setMyDraft(e.target.value); myDraftRef.current = e.target.value; }}
                  onKeyDown={e => { if (e.key === "Enter") handleSubmitAcro(); }}
                />
                <Btn onClick={handleSubmitAcro}>{isEditing ? "Update" : "Submit"}</Btn>
                {isEditing && <BtnSecondary onClick={() => setIsEditing(false)}>Cancel</BtnSecondary>}
              </div>
            </>
          )}
        </Panel>
      )}

      {/* Results */}
      {phase === "Results" && (
        <div style={{ marginBottom: 16 }}>
          <ResultsScreen scores={scores} winningAcro={winningAcro} entries={entries} players={players} />
        </div>
      )}

      {/* Waiting */}
      {phase === "Waiting" && (
        <Panel style={{ padding: 16, marginBottom: 16, textAlign: "center" }}>
          <p style={{ color: C.textMuted, margin: 0 }}>Waiting for the game to start...</p>
        </Panel>
      )}

      {/* Bottom: players | chat | private chat */}
      <div style={{ display: "grid", gridTemplateColumns: privateChat ? "1fr 2fr 1fr" : "1fr 3fr", gap: 16 }}>

        {/* Players */}
        <Panel style={{ padding: 16 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 14, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Passengers</h2>
          {players.length === 0 ? (
            <p style={{ color: C.textMuted, fontSize: 15, margin: 0 }}>No passengers yet</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {[...players].sort((a, b) => b.score - a.score).map(p => (
                <li key={p.id}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, padding: "4px 8px", background: C.bgApp, borderRadius: 6, cursor: p.id !== auth?.userId ? "pointer" : "default" }}
                  onDoubleClick={() => {
                    if (p.id !== auth?.userId) {
                      setPrivateChat({ userId: p.id, nickname: p.nickname, messages: [] });
                      setUnreadFrom(prev => ({ ...prev, [p.nickname]: 0 }));
                    }
                  }}>
                  <span style={{ color: C.textSecond }}>
                    {p.nickname}
                    {p.id === auth?.userId && <span style={{ color: C.teal, marginLeft: 4 }}>(you)</span>}
                    {unreadFrom[p.nickname] > 0 && (
                      <span style={{ marginLeft: 6, background: C.brand, color: "#fff", fontSize: 10, borderRadius: 999, padding: "1px 6px" }}>
                        {unreadFrom[p.nickname]}
                      </span>
                    )}
                  </span>
                  <span style={{ color: C.teal, fontWeight: 700 }}>{p.score}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Room chat */}
        <Panel style={{ padding: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
            <h2 style={{ margin: 0, fontSize: 14, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Room Chat</h2>
          </div>
          <div style={{ overflowY: "auto", height: 200, padding: "8px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
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
          <Panel style={{ padding: 0, display: "flex", flexDirection: "column", borderColor: C.lavender }}>
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 14, color: C.lavender, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Private · {privateChat.nickname}
              </h2>
              <button onClick={() => setPrivateChat(null)} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", height: 200, padding: "8px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
              {privateChat.messages.length === 0 ? (
                <p style={{ color: C.textMuted, fontSize: 15, margin: 0 }}>Start a private conversation...</p>
              ) : (
                privateChat.messages.map((m, i) => (
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
