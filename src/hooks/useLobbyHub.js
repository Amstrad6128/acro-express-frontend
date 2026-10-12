import { useEffect, useRef, useCallback, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { API_URL, getAuth } from "../services/api";
import { receivePm } from "../pm";

// username: the logged-in player's name — the lobby connection is made only once
// someone is logged in (before, visitors on the login screen showed as a blank name)
export function useLobbyHub(username) {
  const connectionRef = useRef(null);
  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);

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

    connection.on("LobbyPlayers", (playerList) => {
      setPlayers(playerList);
    });

    connection.on("LobbyPlayerJoined", (username) => {
      setPlayers(prev => [...new Set([...prev, username])]);
    });

    connection.on("LobbyPlayerLeft", (username) => {
      setPlayers(prev => prev.filter(p => p !== username));
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
  }, [username]);

  const disconnect = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn) return;
    setPlayers([]);
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

  return { players, messages, sendMessage };
}