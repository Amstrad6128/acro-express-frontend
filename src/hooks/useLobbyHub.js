import { useEffect, useRef, useCallback, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { API_URL, getAuth, fetchRooms } from "../services/api";
import { receivePm } from "../pm";

// Arrival lines in the station chat (Damon, 2026-10-16): "Carlos arrived at the station", "Carlos boarded
// Late Night Acros", "Carlos left the station". Only on this page (not stored), never your own, each person's
// arriving and leaving at most once a minute, and a leave waits 15 s — a page refresh makes no line.
const NOTICE_GAP_MS = 60 * 1000;
const LEAVE_WAIT_MS = 15 * 1000;

// username: the logged-in player's name — the lobby connection is made only once
// someone is logged in (before, visitors on the login screen showed as a blank name)
export function useLobbyHub(username) {
  const connectionRef = useRef(null);
  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [notices, setNotices] = useState([]);   // { username, text, time } — arrival lines
  const playersRef = useRef([]);                 // the list as it is now, for the leave timers
  const lastNoticeRef = useRef({});              // name → when it last got a line
  const leaveTimersRef = useRef({});             // name → pending "left" timer
  useEffect(() => { playersRef.current = players; }, [players]);
  const addNotice = useCallback((name, text, kind) => {
    const key = `${kind}:${name.toLowerCase()}`;   // arriving and leaving each at most once a minute
    if (Date.now() - (lastNoticeRef.current[key] || 0) < NOTICE_GAP_MS) return;
    lastNoticeRef.current[key] = Date.now();
    setNotices(prev => [...prev, { username: name, text, time: new Date() }].slice(-30));
  }, []);

  const connect = useCallback(async () => {
    if (connectionRef.current) return;
    if (!username) return;

    const connection = new signalR.HubConnectionBuilder()
      // The login token: the server takes the player's name from it (not from what the page sends)
      .withUrl(`${API_URL}/lobbyhub`, { accessTokenFactory: () => getAuth()?.token })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    connection.off("LobbyPlayers");
    connection.off("LobbyPlayerJoined");
    connection.off("LobbyPlayerLeft");
    connection.off("ReceiveLobbyMessage");
    connection.off("LobbyHistory");
    connection.off("PrivateMessage");
    // Private messages reach you in the lobby too (shared with the room — src/pm.js)
    connection.on("PrivateMessage", (m) => receivePm(m));
    connection.off("ServerRestarting");
    connection.on("ServerRestarting", () => window.dispatchEvent(new Event("acro-server-restarting")));

    connection.on("LobbyPlayers", (playerList) => {
      setPlayers(playerList);
    });

    connection.on("LobbyPlayerJoined", (name) => {
      const timer = leaveTimersRef.current[name];
      if (timer) { clearTimeout(timer); delete leaveTimersRef.current[name]; }   // back within 15 s: no lines
      else if (name.toLowerCase() !== username.toLowerCase() && !playersRef.current.includes(name))
        addNotice(name, "arrived at the station", "in");   // not for another tab of someone already here
      setPlayers(prev => [...new Set([...prev, name])]);
    });

    connection.on("LobbyPlayerLeft", (name) => {
      setPlayers(prev => prev.filter(p => p !== name));
      if (name.toLowerCase() === username.toLowerCase()) return;
      clearTimeout(leaveTimersRef.current[name]);
      leaveTimersRef.current[name] = setTimeout(async () => {
        delete leaveTimersRef.current[name];
        if (playersRef.current.includes(name)) return;
        // Boarded a train? Then say which one
        let train = null;
        try {
          const rooms = await fetchRooms();
          train = (rooms || []).find(r => [...(r.playingNames || []), ...(r.awayNames || [])].includes(name))?.name || null;
        } catch { /* just "left" */ }
        addNotice(name, train ? `boarded ${train}` : "left the station", "out");
      }, LEAVE_WAIT_MS);
    });

    // sentAtUtc (3rd, new) = when the server stored it; older servers don't send it
    connection.on("ReceiveLobbyMessage", (username, message, sentAtUtc) => {
      setMessages(prev => [...prev, { username, message, time: sentAtUtc ? new Date(sentAtUtc) : new Date() }]);
    });

    // The last 100 stored lobby messages, sent when we enter the lobby (oldest first)
    connection.on("LobbyHistory", (history) => {
      setMessages((history || []).map(m => ({ username: m.username, message: m.message, time: new Date(m.sentAtUtc) })));
    });

    try {
      await connection.start();
      await connection.invoke("JoinLobby", username);
      connectionRef.current = connection;
    } catch (err) {
      console.error("LobbyHub connection failed:", err);
    }
  }, [username, addNotice]);

  const disconnect = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn) return;
    setPlayers([]);
    for (const t of Object.values(leaveTimersRef.current)) clearTimeout(t);   // no lines after leaving the page
    leaveTimersRef.current = {};
    try { await conn.stop(); } catch (e) {}
    connectionRef.current = null;
  }, []);

  const sendMessage = useCallback(async (message) => {
    const conn = connectionRef.current;
    const auth = getAuth();
    if (!conn || !auth) return;
    await conn.invoke("SendLobbyMessage", auth.username, message);
  }, []);

  useEffect(() => {
    connect();
    window.addEventListener("beforeunload", disconnect);
    return () => {
      window.removeEventListener("beforeunload", disconnect);
      disconnect();
    };
  }, [connect, disconnect]);

  return { players, messages, notices, sendMessage };
}