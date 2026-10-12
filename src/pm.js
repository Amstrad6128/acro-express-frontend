// Private messages — one store shared by the lobby and the room, so open conversations (tabs),
// unread counts and half-typed messages stay the same when moving between them (Damon, 2026-10-12).
// Messages are kept on the server (the last 50 per pair), so a refresh loses nothing.
import { useEffect, useSyncExternalStore } from "react";
import { API_URL, getAuth } from "./services/api";

const SESSION_KEY = "acro.pm";        // open tabs, the tab on screen, drafts — per browser tab
const BASE_TITLE = document.title || "Acro Express";

let state = {
  convos: {},   // other player's name -> messages, oldest first
  tabs: [],     // names with an open tab, in the order they were opened
  active: null, // the tab on screen (null = panel closed)
  unread: {},   // name -> number of messages not seen yet
  drafts: {},   // name -> what was typed but not sent
  toasts: [],   // pop-ups, one per sender: { name, count, text } — oldest first (Damon: a 2nd sender
                //   used to replace the 1st pop-up)
  error: "",    // last sending problem, shown under the box
  focus: 0,     // goes up when the player opens a tab → the panel focuses the message box
};
let loadedFor = null;   // the login the history was loaded for
let unseenWhileAway = 0;    // messages that came while this browser tab was in the background
let chime = () => { };      // the "new message" sound (set by App.jsx, follows the Sound setting)
const listeners = new Set();

// Restore the tabs of this browser tab (they survive moving between lobby and room, and refresh)
try {
  const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  if (saved) state = { ...state, tabs: saved.tabs || [], active: saved.active || null, drafts: saved.drafts || {}, unread: saved.unread || {} };
} catch { /* ignore */ }

function emit() {
  state = { ...state };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ tabs: state.tabs, active: state.active, drafts: state.drafts, unread: state.unread }));
  } catch { /* ignore */ }
  document.title = unseenWhileAway > 0 ? `(${unseenWhileAway}) ${BASE_TITLE}` : BASE_TITLE;
  listeners.forEach(l => l());
}

// Back on this browser tab → the "(1)" in the title goes
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && unseenWhileAway > 0) { unseenWhileAway = 0; emit(); }
});

const sameName = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

// Adds a message to its conversation (no duplicates). Returns who it's with, or null if already there.
function add(m) {
  const me = getAuth()?.username;
  const mine = sameName(m.fromName, me);
  const other = mine ? m.toName : m.fromName;
  const key = Object.keys(state.convos).find(k => sameName(k, other)) || other;
  const list = state.convos[key] || [];
  if (list.some(x => x.id === m.id)) return null;
  const next = [...list, m].sort((a, b) => new Date(a.sentAtUtc) - new Date(b.sentAtUtc)).slice(-50);
  state.convos = { ...state.convos, [key]: next };
  return { other: key, mine };
}

// A message arrived live (event "PrivateMessage" from either connection)
export function receivePm(m) {
  const r = add(m);
  if (!r) return;
  if (!r.mine) {
    const { other } = r;
    if (!state.tabs.some(t => sameName(t, other))) state.tabs = [...state.tabs, other];   // new tab, no switch
    if (!state.active) state.active = other;                       // nothing open → show this one
    if (!sameName(state.active, other)) {
      state.unread = { ...state.unread, [other]: (state.unread[other] || 0) + 1 };
      // Their pop-up: a new one, or the existing one updated ("Fran (2)" + the latest text)
      const i = state.toasts.findIndex(t => sameName(t.name, other));
      state.toasts = i >= 0
        ? state.toasts.map((t, j) => j === i ? { ...t, count: t.count + 1, text: m.message } : t)
        : [...state.toasts, { name: other, count: 1, text: m.message }];
    }
    if (document.hidden) unseenWhileAway++;
    chime();
  }
  emit();
}

// The history from the server (after a refresh, or entering the lobby / a room)
export async function loadPms(force = false) {
  const auth = getAuth();
  if (!auth?.token) return;
  if (!force && loadedFor === auth.token) return;
  loadedFor = auth.token;
  try {
    const res = await fetch(`${API_URL}/api/pm`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) return;
    for (const m of await res.json()) add(m);
    emit();
  } catch { /* offline — live messages still arrive */ }
}

export async function sendPm(name, text) {
  const auth = getAuth();
  text = (text || "").trim();
  if (!text || !auth?.token) return false;
  try {
    const res = await fetch(`${API_URL}/api/pm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ to: name, message: text }),
    });
    const body = await res.text();
    if (!res.ok) { state.error = body || "Couldn't send."; emit(); return false; }
    add(JSON.parse(body));
    state.drafts = { ...state.drafts, [name]: "" };
    state.error = "";
    emit();
    return true;
  } catch {
    state.error = "Couldn't send — check your connection.";
    emit();
    return false;
  }
}

// Opens (or switches to) the conversation with this player
export function openPm(name) {
  if (!name) return;
  const existing = state.tabs.find(t => sameName(t, name));
  const key = existing || name;
  if (!existing) state.tabs = [...state.tabs, key];
  state.active = key;
  state.unread = { ...state.unread, [key]: 0 };
  state.toasts = state.toasts.filter(t => !sameName(t.name, key));   // their pop-up goes
  state.error = "";
  state.focus++;
  emit();
}

// Closes a tab — the conversation itself is kept and comes back when it's opened again
export function closePm(name) {
  state.tabs = state.tabs.filter(t => !sameName(t, name));
  if (sameName(state.active, name)) state.active = state.tabs[state.tabs.length - 1] || null;
  state.unread = { ...state.unread, [name]: 0 };
  emit();
}

export function setPmDraft(name, text) { state.drafts = { ...state.drafts, [name]: text }; emit(); }
export function dismissPmToast(name) { state.toasts = state.toasts.filter(t => !sameName(t.name, name)); emit(); }
export function setPmChime(fn) { chime = fn || (() => { }); }

// For components: the current private-message state; loads the history once per login
export function usePm() {
  const snap = useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => state);
  useEffect(() => { loadPms(); }, []);
  return snap;
}
