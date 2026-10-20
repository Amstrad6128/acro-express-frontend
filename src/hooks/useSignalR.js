import { useEffect, useRef, useCallback } from "react";
import * as signalR from "@microsoft/signalr";
import { API_URL, getAuth, joinRoom } from "../services/api";
import { receivePm } from "../pm";

// Wait before each reconnect attempt: right away, 2 s, 5 s, 10 s, then every 15 s — and never give up.
// (The default gave up after 4 tries, about 42 s, and the page silently stopped updating.)
const RETRY_POLICY = {
  nextRetryDelayInMilliseconds: (ctx) => [0, 2000, 5000, 10000][ctx.previousRetryCount] ?? 15000,
};

export function useSignalR(roomId, handlers = {}) {
  const connectionRef = useRef(null);
  const handlersRef = useRef(handlers);

  // Keep handlersRef current on every render
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const connect = useCallback(async () => {
    if (connectionRef.current) return;

    const { token } = getAuth();

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_URL}/gamehub`, {
        accessTokenFactory: () => token,
      })
      .withAutomaticReconnect(RETRY_POLICY)
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    // Wait up to 2 minutes to hear from the server (default 30 s): background tabs are slowed down by the browser
    // (Damon 2026-10-19). The server waits 2 minutes too.
    connection.serverTimeoutInMilliseconds = 2 * 60 * 1000;

    // ── Game events ──────────────────────────────────────
    connection.on("RoundStarted", (...args) => handlersRef.current.onRoundStarted?.(...args));
    connection.on("VotingStarted", (...args) => handlersRef.current.onVotingStarted?.(...args));
    connection.on("RoundEnded", (...args) => handlersRef.current.onRoundEnded?.(...args));
    connection.on("GameOver", (...args) => handlersRef.current.onGameOver?.(...args));
    connection.on("TopicSet", (...args) => handlersRef.current.onTopicSet?.(...args));
    connection.on("TopicRequested", (...args) => handlersRef.current.onTopicRequested?.(...args));
    connection.on("GamePaused", (...args) => handlersRef.current.onGamePaused?.(...args));
    // Sent only to this player: their unsent acro couldn't be entered at time-up
    connection.on("AcroNotEntered", (...args) => handlersRef.current.onAcroNotEntered?.(...args));
    // Who has submitted an acro this round (player ids only, never the acros)
    connection.on("SubmittedPlayers", (...args) => handlersRef.current.onSubmittedPlayers?.(...args));
    // Vote to kick: each vote (everyone sees it), and the passenger who was voted off
    connection.on("KickVote", (...args) => handlersRef.current.onKickVote?.(...args));
    connection.on("PlayerKicked", (...args) => handlersRef.current.onPlayerKicked?.(...args));
    // Late-arrival penalty: who lost points (the page posts the line)
    connection.on("LatePenalty", (...args) => handlersRef.current.onLatePenalty?.(...args));

    // ── Chat events ──────────────────────────────────────
    connection.on("ReceiveRoomMessage", (...args) => handlersRef.current.onRoomMessage?.(...args));
    // Private messages (stored on the server; tabs and unread counts live in src/pm.js).
    // The old "ReceivePrivateMessage" is only for pages opened before 2026-10-12, so it's not listened to.
    connection.on("PrivateMessage", (m) => receivePm(m));
    // The server is about to restart (daily, or a deploy) — App.jsx shows a short banner
    connection.on("ServerRestarting", () => window.dispatchEvent(new Event("acro-server-restarting")));

    // ── Player events ────────────────────────────────────
    connection.on("PlayerJoined", (...args) => handlersRef.current.onPlayerJoined?.(...args));
    connection.on("PlayerLeft", (...args) => handlersRef.current.onPlayerLeft?.(...args));

    // Reports which Express Colors palette this page shows — only for the admin's palette stats.
    // Sent after every (re)join, and again when the player picks another palette ("acro-theme" from applyTheme).
    const sendTheme = () => {
      let theme = "midnight";                                               // the default palette
      try { theme = localStorage.getItem("acro.theme") || "midnight"; } catch { /* private mode */ }
      connection.invoke("SetTheme", theme).catch(() => { });               // never stops the game if it fails
    };
    const onThemeChange = () => { if (connection.state === signalR.HubConnectionState.Connected) sendTheme(); };
    window.addEventListener("acro-theme", onThemeChange);
    connection.__onThemeChange = onThemeChange;                            // removed again in disconnect()

    // Tells the page whether the live connection works ("connected") or not ("reconnecting"),
    // so it can show a "Reconnecting…" banner
    const status = (s) => handlersRef.current.onConnectionChange?.(s);

    // Joins the room on this connection: the hub group (live updates) and the room itself
    // (Passengers; the server gives the score back if it's the same game)
    const joinEverything = async () => {
      const a = getAuth();
      await connection.invoke("JoinRoom", roomId, a?.userId?.toString());
      sendTheme();                                                          // the palette, for the admin's stats
      if (a?.userId) await joinRoom(roomId, { id: a.userId, nickname: a.username, score: 0 });
      // Back after a lost connection or a server restart: the page sends again what the server may have
      // forgotten (the unsent draft, Done Voting) — see "acro-rejoined" in App.jsx
      window.dispatchEvent(new Event("acro-rejoined"));
    };

    // Connection lost — the automatic reconnect (RETRY_POLICY) is trying again
    connection.onreconnecting(() => status("reconnecting"));

    // After an automatic reconnect the server sees a NEW connection, which isn't in the
    // room yet — re-join, otherwise no more game updates arrive and the inactivity
    // cleanup would treat the player as gone. The room join also covers the case where
    // the server removed us while we were disconnected (e.g. during a server restart).
    connection.onreconnected(async () => {
      try {
        await joinEverything();
      } catch (err) {
        console.error("SignalR re-join failed:", err);
      }
      status("connected");
    });

    // Starts the connection; on failure tries again every 5 s until it works.
    // firstTime: the page joins the room itself when it opens, so only the hub group is needed then.
    const startLoop = async (firstTime) => {
      if (connection.__stopped) return;                     // the page was left meanwhile
      try {
        await connection.start();
        if (firstTime) { await connection.invoke("JoinRoom", roomId, getAuth()?.userId?.toString()); sendTheme(); }
        else await joinEverything();
        status("connected");
        console.log("SignalR connected to room", roomId);
      } catch (err) {
        console.error("SignalR connection failed, trying again in 5 s:", err);
        status("reconnecting");
        setTimeout(() => startLoop(false), 5000);
      }
    };

    // The connection closed for good (e.g. the automatic reconnect was cut short) —
    // unless we closed it ourselves, start a new one
    connection.onclose(() => {
      if (connection.__stopped) return;
      status("reconnecting");
      setTimeout(() => startLoop(false), 5000);
    });

    // Remember the connection before starting, so a second connect() doesn't open another one
    connectionRef.current = connection;
    await startLoop(true);
  }, [roomId]);

  const disconnect = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn) return;
    conn.__stopped = true;   // we're closing it on purpose — don't reconnect
    if (conn.__onThemeChange) window.removeEventListener("acro-theme", conn.__onThemeChange);   // no more palette reports
    try {
      await conn.invoke("LeaveRoom", roomId);
      await conn.stop();
    } catch (err) {
      console.error("SignalR disconnect error:", err);
    }
    connectionRef.current = null;
  }, [roomId]);

  useEffect(() => {
    connect();

    const handleBeforeUnload = () => { disconnect(); };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      disconnect();
    };
  }, [connect, disconnect]);

  return { disconnect, connectionRef };
}