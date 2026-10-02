import { useEffect, useRef, useCallback, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { API_URL, getAuth } from "../services/api";

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
      .withUrl(`${API_URL}/lobbyhub`)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    connection.off("LobbyPlayers");
    connection.off("LobbyPlayerJoined");
    connection.off("LobbyPlayerLeft");
    connection.off("ReceiveLobbyMessage");

    connection.on("LobbyPlayers", (playerList) => {
      setPlayers(playerList);
    });

    connection.on("LobbyPlayerJoined", (username) => {
      setPlayers(prev => [...new Set([...prev, username])]);
    });

    connection.on("LobbyPlayerLeft", (username) => {
      setPlayers(prev => prev.filter(p => p !== username));
    });

    connection.on("ReceiveLobbyMessage", (username, message) => {
      setMessages(prev => [...prev, { username, message, time: new Date() }]);
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