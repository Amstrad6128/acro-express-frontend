import { useEffect, useRef, useCallback, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { API_URL, getAuth } from "../services/api";

export function useLobbyHub() {
  const connectionRef = useRef(null);
  const [players, setPlayers] = useState([]);
  const [messages, setMessages] = useState([]);

  const connect = useCallback(async () => {
    if (connectionRef.current) return;
    const auth = getAuth();
    if (!auth) return;

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
      await connection.invoke("JoinLobby", auth.username);
      connectionRef.current = connection;
    } catch (err) {
      console.error("LobbyHub connection failed:", err);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn) return;
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