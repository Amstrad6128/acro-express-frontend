import { useEffect, useRef, useCallback } from "react";
import * as signalR from "@microsoft/signalr";
import { API_URL, getAuth } from "../services/api";

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
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    // ── Game events ──────────────────────────────────────
    connection.on("RoundStarted", (...args) => handlersRef.current.onRoundStarted?.(...args));
    connection.on("VotingStarted", (...args) => handlersRef.current.onVotingStarted?.(...args));
    connection.on("RoundEnded", (...args) => handlersRef.current.onRoundEnded?.(...args));
    connection.on("GameOver", (...args) => handlersRef.current.onGameOver?.(...args));
    connection.on("TopicSet", (...args) => handlersRef.current.onTopicSet?.(...args));
    connection.on("TopicRequested", (...args) => handlersRef.current.onTopicRequested?.(...args));

    // ── Chat events ──────────────────────────────────────
    connection.on("ReceiveRoomMessage", (...args) => handlersRef.current.onRoomMessage?.(...args));
    connection.on("ReceivePrivateMessage", (...args) => handlersRef.current.onPrivateMessage?.(...args));

    // ── Player events ────────────────────────────────────
    connection.on("PlayerJoined", (...args) => handlersRef.current.onPlayerJoined?.(...args));
    connection.on("PlayerLeft", (...args) => handlersRef.current.onPlayerLeft?.(...args));

    try {
      await connection.start();
      const auth = getAuth();
      await connection.invoke("JoinRoom", roomId, auth?.userId?.toString());
      connectionRef.current = connection;
      console.log("SignalR connected to room", roomId);
    } catch (err) {
      console.error("SignalR connection failed:", err);
    }
  }, [roomId]);

  const disconnect = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn) return;
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