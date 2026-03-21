import { useEffect, useRef, useCallback } from "react";
import * as signalR from "@microsoft/signalr";
import { API_URL, getAuth } from "../services/api";

export function useSignalR(roomId, handlers = {}) {
  const connectionRef = useRef(null);

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
    if (handlers.onRoundStarted)
      connection.on("RoundStarted", handlers.onRoundStarted);

    if (handlers.onVotingStarted)
      connection.on("VotingStarted", handlers.onVotingStarted);

    if (handlers.onRoundEnded)
      connection.on("RoundEnded", handlers.onRoundEnded);

    if (handlers.onGameOver)
      connection.on("GameOver", handlers.onGameOver);

    // Topic set by round winner — triggers next round
    if (handlers.onTopicSet)
      connection.on("TopicSet", handlers.onTopicSet);

    // ── Chat events ──────────────────────────────────────
    // Legacy chat handler
    if (handlers.onChatMessage)
      connection.on("ReceiveChatMessage", handlers.onChatMessage);

    // Room public chat
    if (handlers.onRoomMessage)
      connection.on("ReceiveRoomMessage", handlers.onRoomMessage);

    // Private chat — registered once only
    if (handlers.onPrivateMessage)
      connection.on("ReceivePrivateMessage", handlers.onPrivateMessage);

    // ── Player events ────────────────────────────────────
    if (handlers.onPlayerJoined)
      connection.on("PlayerJoined", handlers.onPlayerJoined);

    if (handlers.onPlayerLeft)
      connection.on("PlayerLeft", handlers.onPlayerLeft);

    // Topic requested — creator needs to set topic before round begins
if (handlers.onPlayerLeft)
      connection.on("PlayerLeft", handlers.onPlayerLeft);

    // Topic requested — creator needs to set topic before round begins
    if (handlers.onTopicRequested)
      connection.on("TopicRequested", handlers.onTopicRequested);

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

  // Clean disconnect when leaving room
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

    // Handle browser X button / tab close
    const handleBeforeUnload = () => {
      disconnect();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      disconnect();
    };
  }, [connect, disconnect]);

  // Export both disconnect and connectionRef
  // connectionRef lets Room component invoke hub methods directly
  return { disconnect, connectionRef };
}