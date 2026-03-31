// src/services/api.js
// -------------------------------------------------------------
// BASE URL
// -------------------------------------------------------------
const DEFAULT = import.meta?.env?.VITE_API_BASE;
const FALLBACK =
  window?.location?.hostname === "localhost"
    ? "http://localhost:5158"
    : "https://api.acro.express";

export const API_URL = (DEFAULT || FALLBACK).replace(/\/$/, "");

// -------------------------------------------------------------
// Small helpers
// -------------------------------------------------------------
async function j(res) {
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${txt || res.statusText}`);
  }
  // Try JSON first, fall back to text for plain string responses
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return text; }
}
export async function setTopic(roomId, topic) {
  const res = await authFetch(
    `${API_URL}/api/room/${encodeURIComponent(roomId)}/topic`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    }
  );
  return j(res);
}

// --- auth storage (localStorage) ---
const LS_TOKEN = "acro.token";
const LS_USERNAME = "acro.username";
const LS_USERID = "acro.userid";

export function getAuth() {
  return {
    token: localStorage.getItem(LS_TOKEN) || "",
    username: localStorage.getItem(LS_USERNAME) || "",
    userId: localStorage.getItem(LS_USERID) || "",
  };
}

export function setAuth({ token, username, userId }) {
  if (token) localStorage.setItem(LS_TOKEN, token);
  if (username) localStorage.setItem(LS_USERNAME, username);
  if (userId) localStorage.setItem(LS_USERID, userId);
}

export function clearAuth() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USERNAME);
  localStorage.removeItem(LS_USERID);
}

// Add Authorization header when we have a token
async function authFetch(url, options = {}) {
  const { token } = getAuth();
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

// -------------------------------------------------------------
// Health
// -------------------------------------------------------------
export async function fetchHealth() {
  const res = await fetch(`${API_URL}/healthz`, { method: "GET" });
  return j(res);
}

// -------------------------------------------------------------
// AUTH: register / login
// -------------------------------------------------------------
// body: { username, password }  → { userId, username, token }
export async function register(username, password) {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await j(res);
  // persist session
  setAuth({
    token: data.token,
    username: data.username,
    userId: data.userId,
  });
  return data;
}

export async function login(username, password) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await j(res);
  setAuth({
    token: data.token,
    username: data.username,
    userId: data.userId,
  });
  return data;
}

export function logout() {
  clearAuth();
}

// -------------------------------------------------------------
// ROOMS + GAME
// -------------------------------------------------------------
export async function createRoom(name = "Acro Room") {
  const payload = { name, maxPlayers: 16 };
  const res = await authFetch(`${API_URL}/api/room`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return j(res); // { id, name, ... }
}

export async function fetchRoomState(roomId) {
  const res = await fetch(
    `${API_URL}/api/room/${encodeURIComponent(roomId)}`,
    { method: "GET" }
  );
  if (res.status === 404) return { notFound: true };
  return j(res); // RoomStateDto
}

export async function startRound(roomId) {
  const { userId } = getAuth();
  const res = await authFetch(
    `${API_URL}/api/room/${encodeURIComponent(roomId)}/round/start`,
    { 
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorId: userId })
    }
  );
  return j(res);
}

// Minimal join: BE expects { id, nickname, score? }
// We’ll pass the logged-in username as nickname for now.
export async function joinRoom(roomId, player) {
  const res = await authFetch(
    `${API_URL}/api/room/${encodeURIComponent(roomId)}/join`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(player),
    }
  );
  return j(res);
}

export async function submitAcro(roomId, playerId, sentence) {
  const res = await authFetch(
    `${API_URL}/api/room/${encodeURIComponent(roomId)}/acro`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, sentence }),
    }
  );
  return j(res);
}

export async function startVoting(roomId) {
  const res = await authFetch(
    `${API_URL}/api/room/${encodeURIComponent(roomId)}/round/vote/start`,
    { method: "POST" }
  );
  return j(res);
}

export async function castVote(roomId, voterNickname, entryId) {
  const res = await authFetch(
    `${API_URL}/api/room/${encodeURIComponent(roomId)}/vote`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterNickname, entryId }),
    }
  );
  return j(res);
}

export async function scoreRound(roomId) {
  const res = await authFetch(
    `${API_URL}/api/room/${encodeURIComponent(roomId)}/round/score`,
    { method: "POST" }
  );
  return j(res); // { Nickname: Score, ... }
}

// --- minimal auth (no localStorage) ---
// add to src/services/api.js

export async function registerBasic(username, password) {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return j(res); // { userId, username, token }
}

export async function loginBasic(username, password) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return j(res); // { userId, username, token }
}

export async function fetchRooms() {
  const res = await fetch(`${API_URL}/api/room`);
  return j(res);
}

export async function leaveRoom(roomId, playerId) {
  const res = await authFetch(
    `${API_URL}/api/room/${encodeURIComponent(roomId)}/leave`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(playerId),
    }
  );
  return j(res);
}

