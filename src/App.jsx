import { useEffect, useState, useCallback, useRef } from "react";
import { Routes, Route, useParams, useNavigate } from "react-router-dom";
import { fetchHealth, createRoom, joinRoom, startRound, submitAcro, castVote, getAuth, doneVoting, API_URL, topicGo, kickVote, fetchPassenger, searchPassengers } from "./services/api";
import { useSignalR } from "./hooks/useSignalR";
import { useLobbyHub } from "./hooks/useLobbyHub";
import { usePm, openPm, closePm, sendPm, setPmDraft, dismissPmToast, setPmChime } from "./pm";

// ── Design tokens ──────────────────────────────────────────────
// ── Colour schemes ─────────────────────────────────────────────
// Each player picks one with the swatches in the header (saved in their browser).
// Every colour name below becomes a CSS variable (--c-bgApp, --c-brand, …); C points at those
// variables, so switching a scheme recolours the whole page at once without a reload.
// onBrand = text colour on a "brand" (button) background; bgGradient = optional sky behind the page.
// pattern / patternSize = optional tiny background pattern; letterShadow = shadow of the big letters.
// Tiny background patterns (Damon: minimal, barely visible). An SVG drawn into a CSS url(); the
// palettes without one (Nightfall, Daybreak) keep the faint rain from index.css.
// Gradient patterns need a fixed tile size (e.g. "4000px 28px"): with "auto" they stopped partway across the page.
function svgPattern(w, h, body) {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`;
}
// The rain from index.css, at a chosen strength (Midnight: stronger, so it can be seen)
const RAIN_DROPS = [[22,24],[68,82],[104,46],[142,121],[186,61],[224,144],[262,96],[291,38],[41,176],[83,232],[127,189],[165,257],[207,214],[246,281],[286,205],[61,294]];
function rainPattern(opacity) {
  return svgPattern(320, 320, `<g stroke='#c8d2e6' stroke-opacity='${opacity}' stroke-width='1.2' stroke-linecap='round'>${RAIN_DROPS.map(([x, y]) => `<line x1='${x}' y1='${y}' x2='${x + 4}' y2='${y + 7}'/>`).join("")}</g>`);
}
const THEMES = {
  midnight: {  // Midnight — the original night ride. 2026-10-16: stronger rain, brighter quiet text and
               // dark text on the coral buttons (white on coral was only 2.9:1) — Damon kept it as the default
    name: "Midnight",
    bgApp: "#070b14", bgPanel: "#151D33", bgPanel2: "#1C2540", border: "#2F3D63",
    textPrimary: "#F5F6FA", textSecond: "#D3D9E8", textMuted: "#AEB8D2",
    brand: "#FF7A6B", brandHover: "#FF8E80", onBrand: "#1A0E0C",
    teal: "#8FD0DE", tealLight: "#A8DDE8", lavender: "#C4C0F0", ivory: "#F2E6D8",
    success: "#5CC09D", navy2: "#24314D", navy3: "#2C3B5F", bgGradient: "none",
    danger: "#8B2020", dangerHover: "#A52828",
    fieldLine: "#3A4A72", focusLine: "#8FD0DE",
    pattern: rainPattern(0.2),
  },
  // 2026-10-16: genuinely different palettes (Damon: "not a remake of the existing ones"). Each has its own
  // tiny background pattern, barely visible. Checked: body text ≥ 4.5:1 on panels, big letters ≥ 3:1.
  // 2026-10-18: Notebook, Blueprint, Marigold and Paper Ticket retired (Damon); saved choices move on in loadThemeKey.
  // Names are times of the day (Damon), except Neon and Phosphor. The keys (e.g. "sakura") stay as they were,
  // so players' saved choices and the palette stats keep working; only the names shown changed.
  ember: {  // Last Light (was Ember, renamed 2026-10-18) — the last glow of a campfire at night: charcoal, orange flame, golden names, a few drifting sparks
    name: "Last Light",
    bgApp: "#1C1410", bgPanel: "#2A1D16", bgPanel2: "#33241B", border: "#5A3A28",
    textPrimary: "#FBEEE0", textSecond: "#E8D5C2", textMuted: "#C9AD94",
    brand: "#FF8A3D", brandHover: "#FF9E5C", onBrand: "#1C1410",
    teal: "#FFD166", tealLight: "#FFDD8A", lavender: "#E8A0BF", ivory: "#FFE7C7",
    success: "#9CCB7A", navy2: "#3D2A1F", navy3: "#4A3326", bgGradient: "none",
    danger: "#A8322A", dangerHover: "#BF4034",
    fieldLine: "#6B4A35", focusLine: "#FFD166",
    pattern: svgPattern(90, 90, "<g fill='#ff8a3d'><circle cx='14' cy='72' r='1' fill-opacity='0.2'/><circle cx='57' cy='30' r='0.8' fill-opacity='0.16'/><circle cx='78' cy='66' r='0.7' fill-opacity='0.13'/></g>"),
    patternSize: "90px 90px",
  },
  neon: {  // Neon — synthwave: hot pink letters, electric cyan, neon yellow, faint sparkles
    name: "Neon",
    bgApp: "#1A1028", bgPanel: "#261838", bgPanel2: "#2E1D44", border: "#4A2F66",
    textPrimary: "#F5EAFF", textSecond: "#DCCBF0", textMuted: "#B9A3D4",
    brand: "#FF4FA3", brandHover: "#FF6FB5", onBrand: "#1A1028",
    teal: "#3EF0FF", tealLight: "#7AF5FF", lavender: "#C9A0FF", ivory: "#FFE45E",
    success: "#5CFFA8", navy2: "#3A2556", navy3: "#472E69", bgGradient: "none",
    danger: "#A3204F", dangerHover: "#BA2A5E",
    fieldLine: "#5A3A7C", focusLine: "#3EF0FF",
    pattern: svgPattern(60, 60, "<path d='M30 26v8M26 30h8' stroke='#ff4fa3' stroke-opacity='0.14' stroke-width='1'/>"),
    patternSize: "60px 60px",
  },
  phosphor: {  // Phosphor — an old green-screen terminal, with faint scanlines
    name: "Phosphor",
    bgApp: "#050D07", bgPanel: "#0B1A0F", bgPanel2: "#102214", border: "#1F5C2C",
    textPrimary: "#9DFF9F", textSecond: "#86E68A", textMuted: "#5FCF6A",
    brand: "#B6FF6B", brandHover: "#CCFF94", onBrand: "#050D07",
    teal: "#D4FFD6", tealLight: "#E8FFE9", lavender: "#7DFFC8", ivory: "#B6FF6B",
    success: "#5FCF6A", navy2: "#133A1C", navy3: "#1A4A25", bgGradient: "none",
    danger: "#8A2D1E", dangerHover: "#A33826",
    fieldLine: "#2E7A3E", focusLine: "#9DFF9F",
    pattern: "repeating-linear-gradient(rgba(157,255,159,0.03) 0 1px, transparent 1px 3px)",
    patternSize: "4000px 3px", letterShadow: "0 0 10px rgba(182,255,107,0.35)",
  },
  sakura: {  // First Light (was Sakura) — the pale pink of dawn: deep rose letters, jade names, a few falling petals
    name: "First Light", gold: "#8C6400",   // gold: a darker gold for golden names on this light palette
    bgApp: "#F8DFE6", bgPanel: "#FFF7F9", bgPanel2: "#FCEBF0", border: "#E9B6C6",
    textPrimary: "#3B1F2B", textSecond: "#52303F", textMuted: "#7A5566",
    brand: "#C2185B", brandHover: "#D32F6E", onBrand: "#FFFFFF",
    teal: "#1A6B5D", tealLight: "#1F7A6A", lavender: "#7B4A9E", ivory: "#3B1F2B",
    success: "#2E7D4F", navy2: "#F6D5DF", navy3: "#F5D2DD", bgGradient: "none",
    danger: "#9E1F45", dangerHover: "#B3264F",
    fieldLine: "#DDA2B5", focusLine: "#C2185B",
    pattern: svgPattern(110, 110, "<g fill='#c2185b' fill-opacity='0.09'><ellipse cx='22' cy='28' rx='3' ry='1.6' transform='rotate(30 22 28)'/><ellipse cx='80' cy='82' rx='2.6' ry='1.4' transform='rotate(-20 80 82)'/></g>"),
    patternSize: "110px 110px", letterShadow: "2px 2px 0px rgba(120,20,60,0.15)",
  },
  nightfall: { // Nightfall — mossy olive greens with a lime glow, from Damon's "Mossy hollow" palette
                // (#636B2F moss, #BAC095 sage, #D4DE95 lime, #3D4127 olive) plus a deeper olive background
    name: "Nightfall",
    bgApp: "#23261A", bgPanel: "#3D4127", bgPanel2: "#474C2E", border: "#636B2F",
    textPrimary: "#F4F6E6", textSecond: "#E1E5C8", textMuted: "#BAC095",
    brand: "#D4DE95", brandHover: "#E0E9A6", onBrand: "#2A2E14",
    teal: "#D4DE95", tealLight: "#E4ECB0", lavender: "#B9A0D8", ivory: "#F1EFD8",   // lavender = plum accent
    success: "#A8C766", navy2: "#474C2E", navy3: "#565D2B", bgGradient: "none",
    danger: "#9A3B22", dangerHover: "#B04A2E",
    fieldLine: "#B9A0D8", focusLine: "#B9A0D8",   // purple outlines (Damon)
  },
  daybreak: {  // Daybreak — from Damon's Midjourney picture: sky blue, cloud lavender,
               // salmon towers, teal domes, a pink horizon at dawn
    name: "Daybreak",
    bgApp: "#4A78A3", bgPanel: "#2F4A75", bgPanel2: "#385786", border: "#7184B8",
    textPrimary: "#FFF6EC", textSecond: "#E6E8F6", textMuted: "#BCC3E2",
    brand: "#F2967C", brandHover: "#F8AA93", onBrand: "#22304F",
    teal: "#86D0D2", tealLight: "#A9E0E1", lavender: "#CFCCF3", ivory: "#FFF1E3",
    success: "#74CDAC", navy2: "#385786", navy3: "#42639A",
    bgGradient: "linear-gradient(180deg, #4A78A3 0%, #6E8FC2 62%, #C9A3C2 86%, #EDA79F 100%)",
    danger: "#A8455A", dangerHover: "#BC566B",
    fieldLine: "#7184B8", focusLine: "#86D0D2",
  },
  // 2026-10-18: five more like Daybreak (Damon: its mid-tone sky with dark boxes is the favourite).
  // bgText = quiet text that sits right on the page background (tagline, restart notice): lighter than textMuted,
  // which is made for the dark boxes and would be hard to read on a mid-tone sky.
  // bgApp = the darker "inset" colour (text boxes, list rows); the page itself shows the sky in bgGradient.
  goldenhour: {  // Golden Hour — a warm apricot evening sky, plum boxes, gold letters
    name: "Golden Hour",
    bgApp: "#8A5440", bgPanel: "#3B2433", bgPanel2: "#46293C", border: "#8A5A6E",
    textPrimary: "#FFF4E8", textSecond: "#F1DCCF", textMuted: "#D6B6A8", bgText: "#FFF4E8",
    brand: "#FFC46B", brandHover: "#FFD28C", onBrand: "#3B2433",
    teal: "#9EE0D0", tealLight: "#BDEBE0", lavender: "#F0B8D0", ivory: "#FFE9CC",
    success: "#9CD6A0", navy2: "#4E2F43", navy3: "#5A3750",
    bgGradient: "linear-gradient(180deg, #B06F48 0%, #C4855A 60%, #D49C6C 100%)",
    danger: "#A33A3A", dangerHover: "#B84848",
    fieldLine: "#8A5A6E", focusLine: "#FFC46B",
  },
  lagoon: {  // High Noon (was Lagoon) — clear teal midday water, deep teal boxes, coral letters, sunny yellow names
    name: "High Noon",
    bgApp: "#2A6B71", bgPanel: "#133A45", bgPanel2: "#184654", border: "#4F8E99",
    textPrimary: "#F2FBF9", textSecond: "#D6ECEA", textMuted: "#B2D6D3", bgText: "#F2FBF9",
    brand: "#FF9F7A", brandHover: "#FFB496", onBrand: "#133A45",
    teal: "#FFE08A", tealLight: "#FFEAA8", lavender: "#C7D2FF", ivory: "#FFF4E0",
    success: "#8FE0B0", navy2: "#1C5161", navy3: "#225C6D",
    bgGradient: "linear-gradient(180deg, #3A8790 0%, #5FA9A6 100%)",
    danger: "#A8404A", dangerHover: "#BC4E58",
    fieldLine: "#4F8E99", focusLine: "#FFE08A",
  },
  dusk: {  // Dusk — a violet sky turning rose, aubergine boxes, orange letters
    name: "Dusk",
    bgApp: "#6A5690", bgPanel: "#2A2140", bgPanel2: "#33284D", border: "#6E5C96",
    textPrimary: "#FBF5FF", textSecond: "#E6DDF2", textMuted: "#BFB2D6", bgText: "#FBF5FF",
    brand: "#FFB86B", brandHover: "#FFC98C", onBrand: "#2A2140",
    teal: "#8FE3D4", tealLight: "#B0EDE2", lavender: "#F5B8D8", ivory: "#FFE9D6",
    success: "#8FD9A8", navy2: "#3A2E58", navy3: "#433564",
    bgGradient: "linear-gradient(180deg, #6F5F96 0%, #9A7FAE 65%, #D09A9A 100%)",
    danger: "#A8455A", dangerHover: "#BC566B",
    fieldLine: "#6E5C96", focusLine: "#8FE3D4",
  },
  overcast: {  // Grey Morning (was Overcast, renamed 2026-10-18) — a soft slate-grey morning, charcoal boxes, yellow letters (no gradient)
    name: "Grey Morning",
    bgApp: "#56636F", bgPanel: "#263039", bgPanel2: "#2E3944", border: "#5A6A7A",
    textPrimary: "#F4F6F8", textSecond: "#DCE2E8", textMuted: "#B4BEC8", bgText: "#F4F6F8",
    brand: "#F2C94C", brandHover: "#F6D670", onBrand: "#263039",
    teal: "#7FD1C7", tealLight: "#A3E0D8", lavender: "#C9C2F0", ivory: "#FFF3D6",
    success: "#8BD3A0", navy2: "#34414D", navy3: "#3C4A58",
    bgGradient: "linear-gradient(#7D8B99, #7D8B99)",   // flat: the page stays mid-grey
    danger: "#A8455A", dangerHover: "#BC566B",
    fieldLine: "#5A6A7A", focusLine: "#F2C94C",
  },
  meadow: {  // Afternoon (was Meadow) — sage-green fields, forest boxes, peach letters, buttercup names
    name: "Afternoon",
    bgApp: "#52703F", bgPanel: "#22331F", bgPanel2: "#2A3E26", border: "#5E7D4F",
    textPrimary: "#F6FAEE", textSecond: "#E0EAD2", textMuted: "#BACDA6", bgText: "#F6FAEE",
    brand: "#FFB07A", brandHover: "#FFC296", onBrand: "#22331F",
    teal: "#FFE38A", tealLight: "#FFEDAE", lavender: "#E3C2F0", ivory: "#FFF6E0",
    success: "#A8E08A", navy2: "#314A2C", navy3: "#385533",
    bgGradient: "linear-gradient(180deg, #688D58 0%, #86A46C 100%)",
    danger: "#A8453A", dangerHover: "#BC5446",
    fieldLine: "#5E7D4F", focusLine: "#FFE38A",
  },
};
// The order in the Express Colors menu: the new mid-tone palettes follow Daybreak
const THEME_KEYS = ["midnight", "ember", "neon", "phosphor", "sakura", "nightfall", "daybreak", "goldenhour", "lagoon", "dusk", "overcast", "meadow"];
const COLOR_NAMES = ["bgApp", "bgPanel", "bgPanel2", "border", "textPrimary", "textSecond", "textMuted",
  "brand", "brandHover", "onBrand", "teal", "tealLight", "lavender", "ivory", "success", "navy2", "navy3",
  "danger", "dangerHover",    // danger = red for actions like Log out
  "fieldLine", "focusLine"];   // outlines of text boxes (fieldLine) and of the main boxes/buttons (focusLine)
// C.brand → "var(--c-brand)" and so on
const C = Object.fromEntries(COLOR_NAMES.map(n => [n, `var(--c-${n})`]));

// The palette this browser chose last time (Midnight if none or unknown)
function loadThemeKey() {
  try {
    let k = localStorage.getItem("acro.theme");
    if (k === "lamplight") k = "nightfall";   // the green palette's old name — keep the player's choice
    // Palettes retired on 2026-10-16 → the nearest new one, so nobody's choice is lost
    // and on 2026-10-18 (Notebook, Blueprint, Marigold retired; bluehour went to Blueprint, now to Lagoon)
    k = { twilight: "neon", moonrise: "neon", afterglow: "ember", bluehour: "lagoon", aurora: "midnight",
          notebook: "sakura", paperticket: "sakura", blueprint: "lagoon", marigold: "goldenhour" }[k] || k;   // Paper Ticket → First Light (both light)
    return THEMES[k] ? k : "midnight";
  } catch { return "midnight"; }
}
// The big letters in Honk: their outline (and the square Honk draws behind each letter) is painted in the
// exact colour of the sky behind them, so it disappears into the page (Damon, 2026-10-18). The sky is a
// gradient fixed to the window (index.css), so its colour depends on how far down the letters are: the train
// page measures that (0 = top of the window, 1 = bottom) and calls setBigLetterSky.
let currentTheme = null;     // the palette in use (set by applyTheme)
let bigLetterSpot = 0.2;     // where the big letters are, as a share of the window height
// The colour of a palette's sky at "f" (0–1): reads the stops of its bgGradient ("#hex 62%", or no % = evenly
// spread) and mixes the two around f. No gradient → its bgApp.
function skyColorAt(t, f) {
  const stops = [...(t.bgGradient || "").matchAll(/#([0-9A-Fa-f]{6})s*(d+(?:.d+)?%)?/g)];
  if (stops.length === 0) return t.bgApp;
  const pts = stops.map((m, i) => ({ rgb: [0, 2, 4].map(j => parseInt(m[1].slice(j, j + 2), 16)), at: m[2] ? parseFloat(m[2]) / 100 : i / Math.max(1, stops.length - 1) }));
  if (f <= pts[0].at) return "#" + stops[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (f <= pts[i].at) {
      const k = (f - pts[i - 1].at) / ((pts[i].at - pts[i - 1].at) || 1);   // how far between the two stops
      return "#" + pts[i - 1].rgb.map((v, j) => Math.round(v + (pts[i].rgb[j] - v) * k).toString(16).padStart(2, "0")).join("");
    }
  }
  return "#" + stops[stops.length - 1][1];
}
// Writes the "--acro-big" palette: fill = the letters colour, outline = the sky at "spot"
function setBigLetterSky(spot) {
  bigLetterSpot = Math.min(1, Math.max(0, spot));
  const t = currentTheme; if (!t) return;
  const sky = skyColorAt(t, bigLetterSpot);
  let tag = document.getElementById("acro-big-palette");
  if (!tag) { tag = document.createElement("style"); tag.id = "acro-big-palette"; document.head.appendChild(tag); }
  const rule = `@font-palette-values --acro-big { font-family: 'Honk'; override-colors: ${[sky, sky, t.brand, t.brand, t.brand, t.brand, t.brand, t.brand].map((c, i) => `${i} ${c}`).join(", ")}; }`;
  if (tag.textContent !== rule) tag.textContent = rule;   // only when the colour changed (this runs on every render)
}

// Puts a scheme's colours into the CSS variables on <html> and remembers the choice
function applyTheme(key) {
  const t = THEMES[key] || THEMES.midnight;
  const root = document.documentElement;
  for (const n of COLOR_NAMES) root.style.setProperty(`--c-${n}`, t[n]);
  root.style.setProperty("--c-bgGradient", t.bgGradient);
  // No pattern of its own → the CSS fallback (the faint rain in index.css)
  if (t.pattern) { root.style.setProperty("--c-pattern", t.pattern); root.style.setProperty("--c-patternSize", t.patternSize || "320px 320px"); root.style.setProperty("--c-patternAttach", t.patternAttach || "scroll"); }
  else { root.style.removeProperty("--c-pattern"); root.style.removeProperty("--c-patternSize"); root.style.removeProperty("--c-patternAttach"); }
  root.style.setProperty("--c-letterShadow", t.letterShadow || "3px 3px 0px rgba(0,0,0,0.5)");
  // Quiet text on the page background (the tagline): the palette's own bgText, otherwise textMuted as before
  root.style.setProperty("--c-bgText", t.bgText || t.textMuted);
  // Gold for golden names (afool): bright on the dark palettes, darker on the light one so it stays readable
  root.style.setProperty("--c-gold", t.gold || "#FFD24A");
  // The logo's colours. Honk is a colour font with 8 colours of its own: 0 = drop shadow, 1 = outline and
  // inner lines, 2–7 = the fill from top to bottom. We repaint them in the palette's colours (Damon,
  // 2026-10-18): fill = the accent (teal), outline + shadow = the box colour. The rule is rewritten on every
  // palette change; the logo always uses the palette name "--acro-logo".
  let logoStyle = document.getElementById("acro-logo-palette");
  if (!logoStyle) { logoStyle = document.createElement("style"); logoStyle.id = "acro-logo-palette"; document.head.appendChild(logoStyle); }
  // Two palettes: "--acro-logo" (accent fill: logo, titles, the timer) and "--acro-letters" (letters colour:
  // the big letters in Honk, and the timer's last 10 seconds). Outline + shadow = the box colour in both.
  const honkPalette = (name, fill) => `@font-palette-values ${name} { font-family: 'Honk'; override-colors: ${[t.bgPanel, t.bgPanel, fill, fill, fill, fill, fill, fill].map((c, i) => `${i} ${c}`).join(", ")}; }`;
  // Button palettes (Honk on buttons, Damon 2026-10-18): the text colour as fill, the button's own background
  // as the outline colour, so Honk's inner lines look cut out of the letters (a palette can't use CSS variables,
  // so each button colour gets its own palette, rebuilt here with the palette's real colours)
  const honkOn = (name, fill, bg) => `@font-palette-values ${name} { font-family: 'Honk'; override-colors: ${[bg, bg, fill, fill, fill, fill, fill, fill].map((c, i) => `${i} ${c}`).join(", ")}; }`;
  logoStyle.textContent = [honkPalette("--acro-logo", t.teal), honkPalette("--acro-letters", t.brand), honkPalette("--acro-gold", t.gold || "#FFD24A"),
    honkOn("--acro-btn", t.onBrand, t.brand),            // main buttons (Submit, Send, + New Sky Train …)
    honkOn("--acro-btn2", t.teal, t.navy2),              // quiet buttons (← Grand Sky Station, My Sky Passport …)
    honkOn("--acro-btn-pm", t.lavender, t.navy2),        // Send in private chat
    honkOn("--acro-btn-danger", "#FFF8F6", t.danger),    // Leave the station
  ].join("\n");
  currentTheme = t;                // for setBigLetterSky
  setBigLetterSky(bigLetterSpot);  // the big letters' outline in this palette's sky colour
  try { localStorage.setItem("acro.theme", key); } catch { /* private mode: just not remembered */ }
  // Tells an open train page the palette changed, so it reports it to the server (palette stats, useSignalR.js)
  window.dispatchEvent(new CustomEvent("acro-theme", { detail: key }));
}
applyTheme(loadThemeKey());   // before the first render, so the page never flashes the wrong colours

// ── Big letters font (Damon, 2026-10-18) ───────────────────────
// Each player picks the font of the big letters (and the timer): Bowlby One SC (the original) or Honk (the
// logo's font). (Bungee was tried as a third choice on 2026-10-18 and removed: Damon didn't like it.) Saved in the browser; picked in the Express Colors menu. Works through CSS variables on <html>,
// so the letters and the timer change at once:
//   --lf-family  font of the big letters      --lf-shadow  their shadow (Honk has its own, so none)
//   --tf-family  font of the timer            --tf-weight  its weight
//   --lf-scale / --lf-lh  size factor and line height of the big letters (Honk's capitals are smaller)
const LETTER_FONTS = { bowlby: "Bowlby", honk: "Honk" };   // key → name shown in the menu
function loadLetterFont() {
  try { const k = localStorage.getItem("acro.letterFont"); return LETTER_FONTS[k] ? k : "bowlby"; } catch { return "bowlby"; }
}
function applyLetterFont(key) {
  const root = document.documentElement.style;
  if (key === "honk") {
    root.setProperty("--lf-family", "'Honk', 'Bowlby One SC', serif");
    root.setProperty("--lf-shadow", "none");
    root.setProperty("--tf-family", "'Honk', " + NUM_FONT);
    root.setProperty("--tf-weight", "400");   // Honk has one weight; bold would be faked and smudgy
    root.setProperty("--lf-scale", "1.4");    // Honk's capitals are smaller: 1.4× to look as big as Bowlby's
    root.setProperty("--lf-lh", "0.72");      // …in the same height (1 ÷ 1.4), so nothing below moves
  } else {   // Bowlby: the original look (the variables are removed, so every style uses its own fallback)
    for (const v of ["--lf-family", "--lf-shadow", "--tf-family", "--tf-weight", "--lf-scale", "--lf-lh"]) root.removeProperty(v);
  }
  try { localStorage.setItem("acro.letterFont", key); } catch { /* private mode: just not remembered */ }
}

// ── Sound settings ─────────────────────────────────────────────
// One switch and one volume for all game sounds (song, second tune, drumroll), saved in the
// browser. Applied as a volume factor on top of the game's own fades — the game's own "muted"
// (the song plays silently after you submit) is left alone.
function loadSound() {
  try {
    const s = JSON.parse(localStorage.getItem("acro.sound") || "null");
    if (s && typeof s.on === "boolean" && typeof s.volume === "number") return s;
  } catch { /* ignore */ }
  return { on: true, volume: 1 };   // default: sound on, full volume (as before)
}
let soundSettings = loadSound();
// The factor every game sound is multiplied by (0 = silent)
function soundGain() { return soundSettings.on ? soundSettings.volume : 0; }
// Saves new settings and tells the room to update the sounds that are playing now
function setSoundSettings(next) {
  soundSettings = next;
  try { localStorage.setItem("acro.sound", JSON.stringify(next)); } catch { /* ignore */ }
  window.dispatchEvent(new Event("acro-sound-change"));
}

// A small header button that opens a menu underneath it (used by "Express Colors" and "Sound").
// Closes when you click outside it or press Escape.
function HeaderMenu({ label, children, width = 230 }) {
  const [open, setOpen] = useState(false);
  // Phones (narrow screens): the menu opens as a panel in the middle of the screen, always fully
  // visible with big rows — under the button it could end up partly off-screen (Sandy, 2026-10-12)
  const [sheet, setSheet] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    // "pointerdown" = a mouse press OR a finger tap (mousedown wasn't reliable on every phone)
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const toggle = () => {
    setSheet(window.innerWidth < 600);   // decide each time it opens (the phone may have been turned)
    setOpen(o => !o);
  };
  const panel = { background: C.bgPanel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", boxShadow: "0 12px 32px rgba(0,0,0,0.35)", textAlign: "left" };
  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button onClick={toggle} aria-expanded={open}
        style={{ background: C.bgPanel2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.textPrimary, cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: "6px 12px", whiteSpace: "nowrap" }}>
        {label} <span style={{ color: C.textMuted, fontSize: 11, marginLeft: 2 }}>▾</span>
      </button>
      {open && !sheet && (
        // Computer: a small menu right under the button
        <div style={{ ...panel, position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 85 /* above message pop-ups (80) */, width }}>
          {children(() => setOpen(false), false)}
        </div>
      )}
      {open && sheet && (
        // Phone: a dimmed screen with the menu centred near the top; tapping the dim area closes it
        <div onPointerDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 85, background: "rgba(0,0,0,0.45)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "10vh" }}>
          <div style={{ ...panel, width: "min(320px, calc(100vw - 32px))", padding: "14px 14px", fontSize: 16, maxHeight: "75vh", overflowY: "auto" }}>
            {children(() => setOpen(false), true)}
          </div>
        </div>
      )}
    </div>
  );
}

// "Express Colors: Midnight ▾" — pick a palette; the page recolours at once (Damon: no settings page)
function ThemePicker() {
  const [current, setCurrent] = useState(loadThemeKey);
  const [letterFont, setLetterFont] = useState(loadLetterFont);   // "bowlby" or "honk"
  return (
    <HeaderMenu label={<>Express Colors: <span style={{ color: C.teal, fontWeight: 600 }}>{THEMES[current].name}</span></>}>
      {(close, big) => (
        <>
          <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 8 }}>Pick a look for your screen. Only you see it.</div>
          {THEME_KEYS.map(key => {
            const t = THEMES[key];
            const active = key === current;
            return (
              <button key={key} onClick={() => { applyTheme(key); setCurrent(key); close(); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: active ? C.navy3 : "transparent", border: "none", borderRadius: 6, color: C.textPrimary, cursor: "pointer", fontSize: big ? 17 : 15, fontFamily: "inherit", padding: big ? "12px 10px" : "6px 8px", textAlign: "left" }}>   {/* big = phone panel: rows easy to tap */}
                {/* a dot in the palette's own colours: its background with its accent as the rim */}
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: t.bgApp, border: `2px solid ${t.brand}`, flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: active ? 700 : 400 }}>{t.name}</span>
                {active && <span style={{ color: C.teal }}>✓</span>}
              </button>
            );
          })}
          {/* The big letters' font (and the timer's): Bowlby or Honk. Each button shows "B T V" in its own font */}
          <div style={{ color: C.textMuted, fontSize: 13, margin: "10px 0 6px", borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>Big letters</div>
          <div style={{ display: "flex", gap: 8 }}>
            {Object.entries(LETTER_FONTS).map(([key, name]) => {
              const active = key === letterFont;
              return (
                <button key={key} onClick={() => { applyLetterFont(key); setLetterFont(key); }}
                  style={{ flex: 1, background: active ? C.navy3 : "transparent", border: `1px solid ${active ? C.teal : C.border}`, borderRadius: 8, color: C.textPrimary, cursor: "pointer", fontFamily: "inherit", fontSize: big ? 16 : 14, padding: big ? "10px 6px" : "6px 6px" }}>
                  <span style={{
                    honk: { fontFamily: "'Honk', serif", fontSize: 20, color: C.brand, fontPalette: "--acro-big", fontVariationSettings: "'SHLN' 0, 'MORF' 15" },
                    bowlby: { fontFamily: "'Bowlby One SC', serif", fontSize: 18, color: C.brand },
                  }[key]}>B T V</span>
                  <div style={{ fontSize: 12, marginTop: 2, fontWeight: active ? 700 : 400 }}>{name}{active ? " ✓" : ""}</div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </HeaderMenu>
  );
}

// "Sound: 70% ▾" (or "Sound: Off") — volume slider and a Mute / Unmute button for all game sounds
function SoundControl() {
  const [st, setSt] = useState(soundSettings);
  const change = (next) => { setSoundSettings(next); setSt(next); };
  const pct = Math.round(st.volume * 100);
  return (
    <HeaderMenu width={210} label={<>Sound: <span style={{ color: C.teal, fontWeight: 600 }}>{st.on ? `${pct}%` : "Off"}</span></>}>
      {() => (
        <>
          <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 8 }}>Music and sound effects</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="range" min="0" max="100" step="5" value={pct} aria-label="Volume"
              onChange={e => change({ on: true, volume: Number(e.target.value) / 100 })}
              style={{ flex: 1, accentColor: "var(--c-teal)" }} />
            <span style={{ color: C.textSecond, fontSize: 13, width: 36, textAlign: "right" }}>{pct}%</span>
          </div>
          <button onClick={() => change({ ...st, on: !st.on })}
            style={{ marginTop: 10, width: "100%", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.textPrimary, cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: "5px 8px" }}>
            {st.on ? "Mute" : "Unmute"}
          </button>
        </>
      )}
    </HeaderMenu>
  );
}

// ── Reusable styled components ─────────────────────────────────
const Panel = ({ children, style = {}, className = "" }) => (
  <div className={className} style={{ background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 12, ...style }}>
    {children}
  </div>
);

// Button text in Honk (Damon, 2026-10-18), no shadow. palette = the Honk
// colours for this button's colours (made in applyTheme): main buttons "--acro-btn"; others pass their own.
// fontSize 32: Honk's capitals are short, so it needs a much bigger size than the old 16 to fill the button
// (Damon: 27 was still too small for the frame). Less padding above and below keeps the buttons about as tall.
const honkButton = { fontFamily: "'Honk', 'Nunito', sans-serif", fontWeight: 400, fontSize: 32, fontVariationSettings: "'SHLN' 0, 'MORF' 15", lineHeight: 0.95 };
const Btn = ({ children, onClick, color = C.brand, hoverColor = C.brandHover, style = {}, disabled = false, palette = "--acro-btn" }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? hoverColor : color,
        color: C.onBrand,   // readable on the scheme's brand colour
        border: "none",
        borderRadius: 8,
        padding: "3px 14px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        ...honkButton, fontPalette: palette,
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
        padding: "3px 14px",
        cursor: "pointer",
        ...honkButton, fontPalette: "--acro-btn2",   // teal on the quiet button colour
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
      border: `1px solid ${C.fieldLine}`,
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

// ── Private messages ───────────────────────────────────────────
// A soft two-note chime for a new private message (follows the Sound setting; silent when muted)
let pmAudioCtx = null;
function playPmChime() {
  const gain = soundGain();
  if (gain <= 0) return;
  try {
    pmAudioCtx = pmAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = pmAudioCtx, t = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const start = t + i * 0.12;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.25 * gain, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(start); o.stop(start + 0.4);
    });
  } catch { /* no sound available */ }
}
setPmChime(playPmChime);

// The private chat: one tab per person you're talking with (Damon). Switching tabs keeps every
// conversation and anything half-typed; ✕ closes a tab but the conversation comes back when reopened.
// Used in the lobby and in the room.
function PrivateChatPanel({ style = {}, listMaxHeight }) {
  const pm = usePm();
  const me = getAuth()?.username;
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const active = pm.active;
  const messages = active ? (pm.convos[active] || []) : [];
  // Keep the newest message in view (scrolls only the message list)
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, active]);
  // Put the cursor in the box when the player opens or switches a tab themselves — not when a
  // message arrives (that would take the cursor out of the acro box mid-typing)
  const seenFocus = useRef(pm.focus);
  useEffect(() => {
    if (pm.focus !== seenFocus.current) { seenFocus.current = pm.focus; inputRef.current?.focus(); }
  }, [pm.focus]);
  if (!active) return null;
  const draft = pm.drafts[active] || "";
  const send = () => sendPm(active, draft);
  return (
    <Panel style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 0, borderColor: C.lavender, ...style }}>
      {/* Tabs — many tabs wrap onto a second line (a scrolling row showed stray scrollbars — Damon) */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 2, padding: "8px 10px 0", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: C.lavender, textTransform: "uppercase", letterSpacing: "0.1em", alignSelf: "center", margin: "0 6px 4px 4px", flexShrink: 0 }}>Private</span>
        {pm.tabs.map(name => {
          const on = name === active;
          const unread = pm.unread[name] || 0;
          return (
            <div key={name} style={{ display: "flex", alignItems: "center", flexShrink: 0, background: on ? C.bgApp : "transparent", borderTop: `1px solid ${on ? C.lavender : "transparent"}`, borderLeft: `1px solid ${on ? C.lavender : "transparent"}`, borderRight: `1px solid ${on ? C.lavender : "transparent"}`, borderRadius: "8px 8px 0 0", marginBottom: -1 }}>
              <button onClick={() => openPm(name)} title={`Chat with ${name}`}
                style={{ background: "none", border: "none", color: on ? C.textPrimary : C.textSecond, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: on ? 700 : 400, padding: "6px 2px 6px 10px", whiteSpace: "nowrap" }}>
                {name}
                {unread > 0 && <span style={{ marginLeft: 6, background: C.brand, color: C.onBrand, fontSize: 11, borderRadius: 999, padding: "1px 6px" }}>{unread}</span>}
              </button>
              <button onClick={() => closePm(name)} title={`Close the chat with ${name}`} aria-label={`Close the chat with ${name}`}
                style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "4px 8px 4px 6px" }}>×</button>
            </div>
          );
        })}
      </div>
      <div ref={listRef} style={{ flex: 1, minHeight: 0, maxHeight: listMaxHeight, overflowY: "auto", padding: "8px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
        {messages.length === 0 ? (
          <p style={{ color: C.textMuted, fontSize: 15, margin: 0 }}>Start a private conversation with {active}...</p>
        ) : messages.map(m => (
          <div key={m.id} style={{ fontSize: 15, overflowWrap: "anywhere" }}>
            <span style={{ color: String(m.fromName).toLowerCase() === String(me).toLowerCase() ? C.teal : C.lavender, fontWeight: 600 }}>{m.fromName}: </span>
            <span style={{ color: C.textSecond }}>{m.message}</span>
          </div>
        ))}
      </div>
      {pm.error && <div style={{ padding: "0 16px 6px", color: C.brand, fontSize: 13 }}>{pm.error}</div>}
      <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
        <input
          ref={inputRef}
          id="privateChatInput"
          maxLength={1000}
          style={{ flex: 1, minWidth: 0, background: C.bgApp, border: `1px solid ${C.fieldLine}`, borderRadius: 8, padding: "8px 12px", color: C.textPrimary, fontSize: 15, outline: "none", fontFamily: "inherit" }}
          placeholder={`Message ${active}...`}
          value={draft}
          onChange={e => setPmDraft(active, e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
        />
        <Btn color={C.navy2} hoverColor={C.navy3} palette="--acro-btn-pm" style={{ color: C.lavender, border: `1px solid ${C.lavender}` }} onClick={send}>Send</Btn>
      </div>
    </Panel>
  );
}

// "✉ Fran (2): see you next station! · Reply ✕" — one pop-up per person whose conversation isn't on
// screen, stacked (oldest on top). A 2nd message from the same person updates their pop-up. At most 3
// are shown; more people → "+ N more people · Show". Reply opens that tab and closes its pop-up.
function PmToast() {
  const pm = usePm();
  const list = pm.toasts || [];
  if (list.length === 0) return null;
  const shown = list.slice(0, 3), hidden = list.slice(3);
  const card = { boxSizing: "border-box", background: C.bgPanel2, border: `1px solid ${C.lavender}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.4)", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 };
  return (
    <div style={{ position: "fixed", top: 52, left: "50%", transform: "translateX(-50%)", zIndex: 80, width: "min(440px, calc(100vw - 32px))", display: "flex", flexDirection: "column", gap: 8 }}>
      {shown.map(t => (
        <div key={t.name} role="status" style={card}>
          <span style={{ fontSize: 18, color: C.lavender }}>✉</span>
          <div style={{ flex: 1, minWidth: 0, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span style={{ color: C.lavender, fontWeight: 700 }}>{t.name}{t.count > 1 ? ` (${t.count})` : ""}:</span>{" "}
            <span style={{ color: C.textSecond, fontStyle: "italic" }}>{t.text}</span>
          </div>
          <Btn onClick={() => openPm(t.name)} style={{ padding: "4px 12px", fontSize: 14 }}>Reply</Btn>
          <button onClick={() => dismissPmToast(t.name)} aria-label={`Close the message from ${t.name}`} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 16, padding: 4 }}>✕</button>
        </div>
      ))}
      {hidden.length > 0 && (
        <div role="status" style={card}>
          <span style={{ fontSize: 18, color: C.lavender }}>✉</span>
          <div style={{ flex: 1, fontSize: 15, color: C.textSecond }}>+ {hidden.length} more {hidden.length === 1 ? "person" : "people"}</div>
          <Btn onClick={() => openPm(hidden[0].name)} style={{ padding: "4px 12px", fontSize: 14 }}>Show</Btn>
        </div>
      )}
    </div>
  );
}

// ── Server restarts ───────────────────────────────────────────
// Heroku restarts the server about once a day (24 h after the last start, plus up to 216 minutes).
// Announced restarts are fine (Lichess does it); surprise ones annoy (Damon). The window comes from
// api/status (startedAtUtc); soon = from 15 minutes before the window until its end.
function useRestartWindow() {
  const [win, setWin] = useState(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/status`);
        const d = await res.json();
        if (!stop && d?.startedAtUtc) {
          const start = new Date(d.startedAtUtc).getTime();
          setWin({ from: new Date(start + 24 * 3600e3), to: new Date(start + 24 * 3600e3 + 216 * 60e3) });
        }
      } catch { /* try again later */ }
    };
    load();
    const iv = setInterval(load, 10 * 60e3);
    return () => { stop = true; clearInterval(iv); };
  }, []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 60e3); return () => clearInterval(iv); }, []);
  if (!win) return null;
  const soon = now >= win.from.getTime() - 15 * 60e3 && now <= win.to.getTime();
  const fmt = d => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return { ...win, soon, text: `Daily server restart expected between ${fmt(win.from)} and ${fmt(win.to)}. Your game will continue.` };
}

// "Server restarting — back in a few seconds" when the server says it is going down
function RestartBanner() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let t;
    const show = () => { setOn(true); clearTimeout(t); t = setTimeout(() => setOn(false), 45000); };
    window.addEventListener("acro-server-restarting", show);
    return () => { window.removeEventListener("acro-server-restarting", show); clearTimeout(t); };
  }, []);
  if (!on) return null;
  return (
    <div role="status" style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 95, background: C.bgPanel2, color: C.textPrimary, border: `1px solid ${C.teal}`, padding: "8px 18px", borderRadius: 999, fontSize: 15, fontWeight: 600, boxShadow: "0 6px 20px rgba(0,0,0,0.4)", maxWidth: "calc(100% - 32px)", textAlign: "center" }}>
      Server restarting — back in a few seconds. Your game is safe.
    </div>
  );
}

// Golden names (Damon, 2026-10-18): afool joked his name should be gold, so it is — everywhere names are shown.
// --c-gold is set per palette (a darker gold on the light First Light). goldName(name) = the extra style, or {}.
const GOLDEN_NAMES = ["afool"];
const isGolden = name => GOLDEN_NAMES.includes(String(name || "").toLowerCase());
const goldName = name => (isGolden(name) ? { color: "var(--c-gold)", fontWeight: 700 } : {});

// A player's name you can click. One rule everywhere (Damon asked for it clear, 2026-10-18; like Discord, Slack
// and Twitch): a click opens the player's Sky Passport card, whose main button is Message. Kicking is never a
// click: only "/kp name" in Sky Train Chat. ("profile" is kept for older calls; it no longer changes anything.)
function NameLink({ name, style }) {
  if (!name) return <span style={style}>{name}</span>;
  const go = () => openProfile(name);
  return (
    <span role="button" tabIndex={0} title={`${name}: Sky Passport and Message`}
      onClick={e => { e.stopPropagation(); go(); }}
      onKeyDown={e => { if (e.key === "Enter") go(); }}
      style={{ cursor: "pointer", ...style, ...goldName(name) }}>{name}</span>
  );
}

// "👥 Online 12 ▾" on a Sky Train: everyone online and where they are — at the Grand Sky Station or on
// which train. Click a name to message them. Refreshes every 15 s (api/online).
function OnlineButton() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/online`, { headers: { Authorization: `Bearer ${getAuth()?.token}` } });
        if (res.ok && !stop) setData(await res.json());
      } catch { /* try again next time */ }
    };
    load();
    const iv = setInterval(load, 15000);
    return () => { stop = true; clearInterval(iv); };
  }, []);
  const me = String(getAuth()?.username || "").toLowerCase();
  const total = data ? new Set([...data.station, ...data.trains.flatMap(t => t.players)].map(n => n.toLowerCase())).size : null;
  const group = (title, names, close, big) => (
    <div key={title} style={{ marginBottom: 8 }}>
      <div style={{ color: C.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", margin: "6px 0 2px" }}>{title}</div>
      {names.length === 0 && <div style={{ color: C.textMuted, fontSize: 14, fontStyle: "italic" }}>Nobody</div>}
      {names.map(n => n.toLowerCase() === me ? (
        <div key={n} style={{ color: C.textSecond, fontSize: big ? 17 : 15, padding: big ? "8px 8px" : "3px 8px" }}>{n} <span style={{ color: C.teal }}>(you)</span></div>
      ) : (
        <button key={n} onClick={() => { openPm(n); close(); }} title={`Message ${n}`}
          style={{ display: "flex", justifyContent: "space-between", width: "100%", background: "transparent", border: "none", borderRadius: 6, color: C.textPrimary, cursor: "pointer", fontFamily: "inherit", fontSize: big ? 17 : 15, padding: big ? "8px 8px" : "3px 8px", textAlign: "left" }}>
          <span>{n}</span><span style={{ color: C.lavender }} aria-hidden>✉</span>
        </button>
      ))}
    </div>
  );
  return (
    <HeaderMenu width={260} label={<>
      <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true" style={{ display: "inline-block", verticalAlign: "-2px", marginRight: 6 }}>
        <circle cx="5.5" cy="4" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M1 13c0-2.6 2-4.4 4.5-4.4S10 10.4 10 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="11.5" cy="4.6" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M11.2 8.7c2.2 0 3.8 1.6 3.8 3.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>Online{total !== null && <span style={{ color: C.teal, fontWeight: 600 }}> {total}</span>}</>}>
      {(close, big) => (
        <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
          <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 4 }}>Click a name to send a private message.</div>
          {!data ? <div style={{ color: C.textMuted, fontSize: 14 }}>Loading…</div> : (
            <>
              {group("Grand Sky Station", data.station, close, big)}
              {data.trains.map(t => group(`🚆 ${t.name}`, t.players, close, big))}
            </>
          )}
        </div>
      )}
    </HeaderMenu>
  );
}

// ── How to play (was How to play, then How to ride; back to How to play on 2026-10-18, Damon) ────────────────────────────────────────────────
// The rules, written from what the server really does (letters, times, scoring — Services/RoundTimerService.cs
// and Utils/AcroRules.cs). Special topics as explained by Sandy (2026-10-12). Opens over the page.
// Titles in the logo's font, Honk (Damon, 2026-10-18): same colours and settings as the logo (accent fill,
// box-colour outline, shadow 41, Honk's own bulge 15; see applyTheme). Only for titles on the boxes
// (bgPanel), where the outline colour matches the background. Fredoka is the stand-in while Honk loads.
const honkTitle = { fontFamily: "'Honk', Fredoka, sans-serif", fontWeight: 400, color: C.teal, fontPalette: "--acro-logo", fontVariationSettings: "'SHLN' 41, 'MORF' 15", lineHeight: 1.15 };

// Smaller titles: Honk too (Damon, 2026-10-18 — Lilita One was tried and removed: it looked like Bungee).
// Kept at 24 px and more, since Honk gets blurry when small. Same look as honkTitle.
const smallTitle = honkTitle;

function RulesSection({ icon, title, children }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 28, ...smallTitle }}>
        {/* the emoji keeps the normal font (Honk has no emoji) */}
        <span aria-hidden style={{ marginRight: 8, fontFamily: "Fredoka, sans-serif" }}>{icon}</span>{title}
      </h3>
      <div style={{ color: C.textSecond, fontSize: 15, lineHeight: 1.5 }}>{children}</div>
    </section>
  );
}
const ex = { color: C.teal, fontStyle: "italic" };      // examples
const rulesList = { margin: "4px 0 0", paddingLeft: 20, listStyle: "disc" };   // bullets (the page resets lists)

function HowToPlay({ winScore = 30 }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button onClick={() => setOpen(true)}
        // In the accent colour, so new passengers spot it (Damon, 2026-10-18)
        style={{ background: C.navy2, border: `1px solid ${C.teal}`, borderRadius: 8, color: C.teal, fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: "6px 12px", whiteSpace: "nowrap" }}>
        How to play
      </button>
      {open && (
        // Dimmed page; tapping outside the panel closes it
        <div onPointerDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.55)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "5vh 16px", boxSizing: "border-box", textAlign: "left" }}>
          <div role="dialog" aria-label="How to play" style={{ background: C.bgPanel, border: `1px solid ${C.teal}`, borderRadius: 14, width: "min(640px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 16px 48px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
              <h2 style={{ margin: 0, fontSize: 38, ...honkTitle }}>How to play</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: "16px 20px 4px" }}>
              <RulesSection icon="🚉" title="All aboard!">
                Acro Express is a word game. Board a Sky Train at the Grand Sky Station and travel from station to station.
                At every station you get a few letters: make a phrase from them, everyone votes for their favourite,
                and the first passenger to reach <b style={{ color: C.textPrimary }}>{winScore} points</b> wins the journey.
              </RulesSection>
              <RulesSection icon="✍️" title="Write your acro">
                <ul style={rulesList}>
                  <li>A topic is shown, then the letters — for example <b style={{ color: C.textPrimary }}>B T V</b>.</li>
                  <li>Write one word for each letter, in order: <span style={ex}>"Bring The Volcano"</span>.</li>
                  <li>No extra words — not even little ones like "the" or "of". Symbols like + = &gt; &amp; are fine; they don't count as words.</li>
                  <li>Stations get longer as you travel: 3 letters, then 4, 5, 6 and 7, then back to 3.</li>
                  <li>You have about a minute (a little more for longer acros). Press Enter or Submit — you can change it until the time is up.</li>
                  <li>Time ran out while you were still typing? A valid acro is entered for you.</li>
                </ul>
              </RulesSection>
              <RulesSection icon="🗳️" title="Vote">
                <ul style={rulesList}>
                  <li>All acros appear without names. Pick your favourite (or "None of the above"), then press Done Voting.</li>
                  <li>You can't vote for your own.</li>
                  <li>Vote for what you truly think is the funniest, cleverest or best fit for the topic.</li>
                </ul>
              </RulesSection>
              <RulesSection icon="⭐" title="Points">
                <ul style={rulesList}>
                  <li><b style={{ color: C.textPrimary }}>1 point</b> for every vote your acro gets.</li>
                  <li>The <b style={{ color: C.textPrimary }}>winning acro</b> gets a bonus of <b style={{ color: C.textPrimary }}>1 point per letter</b> (5 letters = +5).</li>
                  <li>You <b style={{ color: C.textPrimary }}>voted for the winner</b>? +1.</li>
                  <li><b style={{ color: C.textPrimary }}>Speed bonus +1</b> for the fastest acro that got at least one vote.</li>
                  <li>Same number of votes? The acro sent first wins.</li>
                  <li>Identical acros are shown once, and everyone who wrote it shares the votes.</li>
                </ul>
              </RulesSection>
              <RulesSection icon="🎯" title="Topics">
                The winner of a station picks the topic for the next one. No topic in time? It's "General Acro".
              </RulesSection>
              <RulesSection icon="🎭" title="Special topics">
                Sometimes the topic is a special challenge — your acro still has to fit the letters.
                <ul style={rulesList}>
                  <li><b style={{ color: C.textPrimary }}>Word Bank</b> — every letter of the 2nd and 3rd words must also be in the 1st word. <span style={ex}>P A S → "Pastries Ape Sit"</span></li>
                  <li><b style={{ color: C.textPrimary }}>Word &gt; Chain</b> — each word goes with the next one; put &gt; between the words. <span style={ex}>F T D → "Fire &gt; Truck &gt; Driver"</span></li>
                  <li><b style={{ color: C.textPrimary }}>Rhyme</b> — use words that rhyme. <span style={ex}>F C S → "Fat Cat Sat"</span></li>
                  <li><b style={{ color: C.textPrimary }}>A + B = C</b> — the first word plus the second word makes the third. <span style={ex}>S F S → "Sun + Flower = Sunflower"</span></li>
                  <li><b style={{ color: C.textPrimary }}>Pander</b> — make your acro about someone on the train. Be nice… or at least funny.</li>
                </ul>
                <div style={{ marginTop: 6 }}>Tip: put spaces around &gt; + and = so they don't stick to a word ("Fire&gt;Truck" counts as one word).</div>
              </RulesSection>
              <RulesSection icon="🏁" title="Final Stop">
                When someone reaches {winScore}, the highest score wins the journey. After a 30-second break the next journey starts by itself.
              </RulesSection>
              <RulesSection icon="💬" title="Tips">
                Click a name to send a private message. To vote someone off a train, type <b style={{ color: C.textPrimary }}>/kp name</b> in Sky Train Chat. Change your colours under Express Colors, and your sound under Sound.
              </RulesSection>
            </div>
            <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, textAlign: "right" }}>
              <Btn onClick={() => setOpen(false)}>All aboard!</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Station Log ────────────────────────────────────────────────
// What's new and what was fixed, like a diary (Damon, 2026-10-16). The admin writes entries; players
// comment and react. Page at /log; each entry has its own link (/log#<id>).
const LOG_SEEN_KEY = "acro.logSeen";   // newest entry this browser has seen (for the NEW mark)
function logSeen() { try { return Number(localStorage.getItem(LOG_SEEN_KEY) || 0); } catch { return 0; } }
function authHeaders(json) {
  const t = getAuth()?.token;
  return { ...(json ? { "Content-Type": "application/json" } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const logDate = d => new Date(d).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });

// Plain text: lines starting with "- " become bullet points, other lines paragraphs
function LogBody({ text }) {
  const out = []; let list = [];
  const flush = () => {
    if (list.length) out.push(<ul key={out.length} style={{ margin: "6px 0", paddingLeft: 22, listStyle: "disc" }}>{list.map((l, i) => <li key={i} style={{ margin: "3px 0" }}>{l}</li>)}</ul>);
    list = [];
  };
  for (const line of String(text).split(/\r?\n/)) {
    if (/^\s*-\s+/.test(line)) list.push(line.replace(/^\s*-\s+/, ""));
    else { flush(); if (line.trim()) out.push(<p key={out.length} style={{ margin: "6px 0" }}>{line}</p>); }
  }
  flush();
  return <div style={{ color: C.textSecond, fontSize: 15, lineHeight: 1.55 }}>{out}</div>;
}

function LogEntryCard({ e, isAdmin, loggedIn, onRemoved }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState(null);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const [reactions, setReactions] = useState(e.reactions || {});
  const [mine, setMine] = useState(e.mine || []);
  const [count, setCount] = useState(e.comments || 0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open || comments !== null) return;
    fetch(`${API_URL}/api/log/${e.id}/comments`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []).then(setComments).catch(() => setComments([]));
  }, [open]);
  // Opened from a shared link (/log#<id>): open this entry and scroll to it
  useEffect(() => {
    if (window.location.hash === `#${e.id}`) { setOpen(true); setTimeout(() => document.getElementById(e.id)?.scrollIntoView({ block: "start" }), 100); }
  }, []);
  const react = async (emoji) => {
    if (!loggedIn) return;
    const r = await fetch(`${API_URL}/api/log/${e.id}/react`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({ emoji }) });
    if (!r.ok) return;
    const d = await r.json();
    setReactions(x => ({ ...x, [emoji]: d.count }));
    setMine(m => d.on ? [...m, emoji] : m.filter(x => x !== emoji));
  };
  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    const r = await fetch(`${API_URL}/api/log/${e.id}/comments`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({ body }) });
    const t = await r.text();
    if (!r.ok) { setErr(t || "Couldn't post your comment."); return; }
    setComments(c => [...(c || []), JSON.parse(t)]);
    setCount(n => n + 1);
    setDraft(""); setErr("");
  };
  const hide = async (cid) => {
    const r = await fetch(`${API_URL}/api/log/comments/${cid}/hide`, { method: "POST", headers: authHeaders() });
    if (r.ok) { const d = await r.json(); setComments(cs => cs.map(c => c.id === cid ? { ...c, hidden: d.hidden } : c)); setCount(n => n + (d.hidden ? -1 : 1)); }
  };
  const remove = async () => {
    if (!window.confirm(`Remove "${e.title}" from the Station Log?`)) return;
    const r = await fetch(`${API_URL}/api/log/${e.id}`, { method: "DELETE", headers: authHeaders() });
    if (r.ok) onRemoved();
  };
  const copyLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/log#${e.id}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => { });
  };
  const small = { background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 13, padding: 4 };
  return (
    <Panel style={{ padding: "16px 20px", scrollMarginTop: 16 }}>
      <div id={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 28, ...smallTitle }}>{e.title}</h2>   {/* Honk, like the How to play sections */}
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: C.textMuted, fontSize: 13 }}>{logDate(e.createdAtUtc)}</span>
          <button onClick={copyLink} style={small} title="Copy a link to this entry">{copied ? "Copied" : "Link"}</button>
          {isAdmin && <button onClick={remove} style={{ ...small, color: C.brand }}>Remove</button>}
        </span>
      </div>
      <LogBody text={e.body} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {Object.keys(reactions).map(emoji => {
          const on = mine.includes(emoji);
          return (
            <button key={emoji} onClick={() => react(emoji)} title={loggedIn ? "React" : "Log in to react"} aria-pressed={on}
              style={{ background: on ? C.navy3 : C.bgApp, border: `1px solid ${on ? C.teal : C.border}`, borderRadius: 999, color: C.textPrimary, cursor: loggedIn ? "pointer" : "default", fontFamily: "inherit", fontSize: 14, padding: "3px 10px" }}>
              {emoji} <span style={{ fontVariantNumeric: "tabular-nums", color: C.textSecond }}>{reactions[emoji] || 0}</span>
            </button>
          );
        })}
        <button onClick={() => setOpen(o => !o)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.teal, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600 }}>
          {open ? "Hide comments" : count === 0 ? "Comment" : `${count} comment${count === 1 ? "" : "s"}`}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {comments === null && <p style={{ margin: 0, color: C.textMuted, fontSize: 14 }}>Loading…</p>}
          {comments && comments.length === 0 && <p style={{ margin: 0, color: C.textMuted, fontSize: 14 }}>No comments yet. Be the first.</p>}
          {comments && comments.map(c => (
            <div key={c.id} style={{ fontSize: 15, opacity: c.hidden ? 0.5 : 1, overflowWrap: "anywhere" }}>
              <span style={{ color: C.teal, fontWeight: 600 }}>{c.name}</span>
              <span style={{ color: C.textMuted, fontSize: 12, marginLeft: 6 }}>{logDate(c.createdAtUtc)}</span>
              {isAdmin && <button onClick={() => hide(c.id)} style={{ ...small, marginLeft: 6 }}>{c.hidden ? "Show" : "Hide"}</button>}
              <div style={{ color: C.textSecond }}>{c.hidden ? <i>(hidden)</i> : null} {c.body}</div>
            </div>
          ))}
          {loggedIn ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input id={`comment-${e.id}`} maxLength={1000} value={draft} onChange={ev => { setDraft(ev.target.value); setErr(""); }}
                onKeyDown={ev => { if (ev.key === "Enter") send(); }} placeholder="Write a comment..."
                style={{ flex: 1, minWidth: 0, background: C.bgApp, border: `1px solid ${C.fieldLine}`, borderRadius: 8, padding: "8px 12px", color: C.textPrimary, fontSize: 15, outline: "none", fontFamily: "inherit" }} />
              <Btn onClick={send}>Post</Btn>
            </div>
          ) : <p style={{ margin: 0, color: C.textMuted, fontSize: 14 }}>Log in at the Grand Sky Station to comment.</p>}
          {err && <p style={{ margin: 0, color: C.brand, fontSize: 14, fontWeight: 600 }}>{err}</p>}
        </div>
      )}
    </Panel>
  );
}

function StationLog() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const loggedIn = !!getAuth()?.token;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [formErr, setFormErr] = useState("");
  const load = async () => {
    try {
      const r = await fetch(`${API_URL}/api/log`, { headers: authHeaders() });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setData(d);
      const newest = d.entries?.[0];
      if (newest) { try { localStorage.setItem(LOG_SEEN_KEY, String(new Date(newest.createdAtUtc).getTime())); } catch { } }
    } catch { setErr("Couldn't load the Station Log. Try again in a moment."); }
  };
  useEffect(() => { load(); }, []);
  const post = async () => {
    const r = await fetch(`${API_URL}/api/log`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({ title, body }) });
    if (!r.ok) { setFormErr((await r.text()) || "Couldn't post."); return; }
    setTitle(""); setBody(""); setFormErr("");
    load();
  };
  const field = { width: "100%", boxSizing: "border-box", background: C.bgApp, border: `1px solid ${C.fieldLine}`, borderRadius: 8, padding: "8px 12px", color: C.textPrimary, fontSize: 15, outline: "none", fontFamily: "inherit" };
  return (
    <div style={{ minHeight: "100vh", color: C.textPrimary, padding: "24px 16px 48px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 40, ...honkTitle }}>Station Log</h1>   {/* Honk, the size of the logo */}
            <p style={{ margin: "4px 0 0", color: "var(--c-bgText)", fontSize: 15 }}>What's new on the Acro Express, and what we fixed. Comment and react — we read everything.</p>
          </div>
          <BtnSecondary onClick={() => navigate("/")}>← Grand Sky Station</BtnSecondary>
        </div>
        {data?.isAdmin && (
          <Panel style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, borderColor: C.teal }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 16, color: C.teal }}>New entry</h2>
              {/* Admin only: which palettes the players use (2026-10-18) */}
              <BtnSecondary onClick={() => navigate("/admin/palettes")}>Palette stats</BtnSecondary>
            </div>
            <input id="logTitle" value={title} onChange={ev => setTitle(ev.target.value)} maxLength={120} placeholder="Title, e.g. Tonight's fixes" style={field} />
            <textarea id="logBody" value={body} onChange={ev => setBody(ev.target.value)} rows={6} placeholder={"What's new?\n- Lines starting with a dash become bullet points"} style={{ ...field, resize: "vertical" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Btn onClick={post}>Post to the Station Log</Btn>
              {formErr && <span style={{ color: C.brand, fontSize: 14 }}>{formErr}</span>}
            </div>
          </Panel>
        )}
        {err && <p style={{ color: C.brand }}>{err}</p>}
        {!data && !err && <p style={{ color: C.textMuted }}>Loading…</p>}
        {data?.entries?.map(e => <LogEntryCard key={e.id} e={e} isAdmin={data.isAdmin} loggedIn={loggedIn} onRemoved={load} />)}
      </div>
      <Footer />
    </div>
  );
}

// Palette stats (admin only, Damon 2026-10-18): how many stations were played with each Express Colors
// palette, by whom. The server only answers the admin; everyone else gets "Admin only."
function PaletteStats() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);          // the period shown: last 7 / 30 / 365 days
  const [data, setData] = useState(null);        // the server's answer
  const [err, setErr] = useState("");            // error text, if any
  useEffect(() => {
    setData(null); setErr("");
    fetch(`${API_URL}/api/admin/theme-stats?days=${days}`, { headers: authHeaders() })
      .then(async r => {
        if (r.status === 403) throw new Error("This page is for the admin only.");
        if (!r.ok) throw new Error("Couldn't load the stats. Try again in a moment.");
        setData(await r.json());
      })
      .catch(e => setErr(e.message));
  }, [days]);
  // All stations with a known palette, to work out each palette's share
  const total = data?.themes?.reduce((sum, t) => sum + t.stations, 0) || 0;
  // Palettes nobody used in the period still get a row (with 0), so you can see what isn't used
  const rows = data ? [
    ...data.themes,
    ...THEME_KEYS.filter(k => !data.themes.some(t => t.theme === k)).map(k => ({ theme: k, stations: 0, players: 0, names: [], lastUsedUtc: null })),
  ] : [];
  return (
    <div style={{ minHeight: "100vh", color: C.textPrimary, padding: "24px 16px 48px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Nunito', sans-serif", fontSize: 30, fontWeight: 800, color: C.brand }}>Palette stats</h1>
            <p style={{ margin: "4px 0 0", color: "var(--c-bgText)", fontSize: 15 }}>Stations played with each Express Colors palette (one per player per station). Only you see this page.</p>
          </div>
          <BtnSecondary onClick={() => navigate("/log")}>← Station Log</BtnSecondary>
        </div>
        {/* The period */}
        <div style={{ display: "flex", gap: 8 }}>
          {[7, 30, 365].map(d => (
            <button key={d} onClick={() => setDays(d)}
              style={{ background: d === days ? C.brand : C.bgPanel, color: d === days ? C.onBrand : C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
              {d === 365 ? "Last year" : `Last ${d} days`}
            </button>
          ))}
        </div>
        {err && <p style={{ color: C.brand }}>{err}</p>}
        {!data && !err && <p style={{ color: "var(--c-bgText)" }}>Loading…</p>}
        {data && (
          <Panel style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.map(t => {
              const th = THEMES[t.theme];                                    // undefined for a retired palette
              const share = total ? Math.round(t.stations / total * 100) : 0;  // % of all known stations
              return (
                <div key={t.theme}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* the same dot as in the Express Colors menu */}
                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: th?.bgApp || "transparent", border: `2px solid ${th?.brand || C.textMuted}`, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontWeight: 700 }}>{th?.name || `${t.theme} (retired)`}</span>
                    <span style={{ color: C.textSecond, fontSize: 14 }}>{t.stations} stations · {t.players} {t.players === 1 ? "player" : "players"} · {share}%</span>
                  </div>
                  {/* a bar for the share */}
                  <div style={{ height: 8, borderRadius: 4, background: C.bgApp, margin: "6px 0 4px" }}>
                    <div style={{ width: `${share}%`, height: "100%", borderRadius: 4, background: th?.brand || C.teal }} />
                  </div>
                  {t.names.length > 0 && (
                    <div style={{ color: C.textMuted, fontSize: 13 }}>
                      {t.names.map(n => `${n.name} (${n.stations})`).join(", ")}
                      {t.lastUsedUtc && ` · last used ${new Date(t.lastUsedUtc).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                    </div>
                  )}
                </div>
              );
            })}
            {data.unknown > 0 && (
              <div style={{ color: C.textMuted, fontSize: 13 }}>{data.unknown} stations in this period have no palette recorded (played before 18 Oct 2026, or from a page that hadn't reloaded yet).</div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

// ── House Rules, Privacy and the footer (2026-10-18) ───────────
// Written in train words so the game stays playful. Not legal advice: Damon may have the texts checked.
// Contact = a private message to the admin in the game (no email address yet).
const ADMIN_NAME = "TylerDurden";   // who players write to
const LEGAL_UPDATED = "18 October 2026";   // change when the texts below change

// "© 2026 Acro Express™ · House Rules · Privacy" — a plain line (no frame, Damon 2026-10-18) at the bottom of
// the station, the Station Log and these pages. compact = less space around it (the station fills the window).
function Footer({ compact }) {
  const navigate = useNavigate();
  const link = { background: "none", border: "none", padding: 0, color: "var(--c-bgText)", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" };
  return (
    // A soft shadow keeps the quiet text readable on every sky (Daybreak's pink horizon included)
    <footer style={{ flexShrink: 0, textAlign: "center", padding: compact ? "8px 16px 10px" : "24px 16px 28px", color: "var(--c-bgText)", fontSize: 13, textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}>
      © {new Date().getFullYear()} Acro Express™ · <button style={link} onClick={() => navigate("/rules")}>House Rules</button>
      {" · "}<button style={link} onClick={() => navigate("/privacy")}>Privacy</button>
    </footer>
  );
}

// Shared layout of the House Rules and Privacy pages
function LegalPage({ title, intro, children }) {
  const navigate = useNavigate();
  useEffect(() => { window.scrollTo(0, 0); }, []);   // open at the top
  return (
    <div style={{ minHeight: "100vh", color: C.textPrimary, padding: "24px 16px 0", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 40, ...honkTitle }}>{title}</h1>
            <p style={{ margin: "4px 0 0", color: "var(--c-bgText)", fontSize: 15 }}>{intro} Last updated {LEGAL_UPDATED}.</p>
          </div>
          <BtnSecondary onClick={() => navigate("/")}>← Grand Sky Station</BtnSecondary>
        </div>
        <Panel style={{ padding: "18px 20px 4px" }}>{children}</Panel>
      </div>
      <Footer />
    </div>
  );
}

function HouseRules() {
  return (
    <LegalPage title="House Rules" intro="The rules of the ride, for every passenger.">
      <RulesSection icon="🎫" title="Your ticket">
        Acro Express is free to play. By riding you agree to these House Rules. Passengers should be 13 or older;
        younger passengers can ride with a parent's OK.
      </RulesSection>
      <RulesSection icon="😊" title="Be a good passenger">
        <ul style={rulesList}>
          <li>Be kind. Cheeky acros are part of the fun; being cruel to a real person is not.</li>
          <li>No hate, threats or harassment, in acros, chat or private messages.</li>
          <li>Keep personal details private, yours and everyone else's: no addresses, phone numbers or photos.</li>
          <li>No spam, no advertising, no pretending to be someone else.</li>
          <li>One Sky Passport per person. Don't use bots or tricks to win.</li>
        </ul>
      </RulesSection>
      <RulesSection icon="🚦" title="When someone breaks the rules">
        Passengers can vote someone off a train. The admin can remove messages, comments and Sky Passports that break
        these rules, and can block a passenger from the game.
      </RulesSection>
      <RulesSection icon="✍️" title="Your acros">
        Your acros are yours. By playing, you let Acro Express show them in the game: in the results, on your
        Sky Passport, in the Station Log, and in future features such as a Hall of Fame.
      </RulesSection>
      <RulesSection icon="™️" title="The name and the look">
        Acro Express, its logo, pictures, music and code belong to Acro Express. Acro Express is an independent
        game, inspired by the classic acronym games; it is not linked to any other game or company.
      </RulesSection>
      <RulesSection icon="🛠️" title="As it is">
        We do our best to keep every line running, but the game comes as it is: trains can be late, servers restart,
        and we may change or stop features. We are not responsible for what passengers write.
      </RulesSection>
      <RulesSection icon="✉️" title="Questions">
        Send a private message to {ADMIN_NAME} in the game. If we change these rules, the date at the top changes
        and we mention it in the Station Log.
      </RulesSection>
    </LegalPage>
  );
}

function Privacy() {
  return (
    <LegalPage title="Privacy" intro="What we keep about you, why, and for how long. Short version: only what the game needs.">
      <RulesSection icon="🧳" title="What we keep">
        <ul style={rulesList}>
          <li><b style={{ color: C.textPrimary }}>Your Sky Passport:</b> your passenger name and your password, stored scrambled (hashed) so nobody can read it, not even us.</li>
          <li><b style={{ color: C.textPrimary }}>Your game:</b> your acros, votes, points and stations, for your Sky Passport stats; acros that weren't accepted, to improve the rules; which colours you play with.</li>
          <li><b style={{ color: C.textPrimary }}>Your messages:</b> see "Chats" below; Station Log comments and reactions.</li>
          <li><b style={{ color: C.textPrimary }}>Your login:</b> a login code (stored scrambled) that keeps you signed in for 30 days.</li>
        </ul>
        We don't ask for your real name, email, age or location.
      </RulesSection>
      <RulesSection icon="💬" title="Chats">
        <ul style={rulesList}>
          <li><b style={{ color: C.textPrimary }}>Grand Sky Station Chat</b> is public: everyone at the station sees it. It is deleted after one day.</li>
          <li><b style={{ color: C.textPrimary }}>Sky Train Chat</b> is seen by everyone on that train. It isn't stored: it's gone when it scrolls away.</li>
          <li><b style={{ color: C.textPrimary }}>Private messages</b> are between the two of you. We keep the last 50 messages of each conversation so you can read them again.</li>
          <li>The admin doesn't read private messages. If a passenger reports a problem, the admin may look at the messages involved, only to deal with it.</li>
          <li>Anything you write in public can be seen, and copied, by other passengers. Think before you share.</li>
        </ul>
      </RulesSection>
      <RulesSection icon="🌐" title="Your connection">
        Like every website, our servers see your IP address when you connect. We only use it for a minute to stop
        password guessing, and we don't store it. Our hosting companies (Heroku for the server, Vercel for the
        pages) keep short technical logs.
      </RulesSection>
      <RulesSection icon="🍪" title="No tracking, no cookies">
        No ads, no tracking, no selling your data, no cookies. Your browser remembers your login, colours, sound
        and open chats in its own storage, on your device only. All fonts come from our own site.
      </RulesSection>
      <RulesSection icon="🔑" title="Your rights">
        You can ask to see the data we have about you, to correct it, or to delete your Sky Passport. Send a private
        message to {ADMIN_NAME}. If you live in the EU, you can also contact your data protection authority.
      </RulesSection>
    </LegalPage>
  );
}

// ── Sky Leaderboard (Damon, 2026-10-18) ─────────────────────────
// Ideas from other games: Wordle's personal stats, Duolingo's weekly leagues and Game Center's recurring boards
// (a fresh start each week/month), podiums for the top three, and minimums before percentages count (Board Game
// Arena). Six boards, each ranking one kind of passenger. Numbers from GET api/leaderboard (LeaderboardController).
// Every name opens the Sky Passport card, like everywhere else.
const LB_PERIODS = [["week", "This week"], ["month", "This month"], ["all", "All time"]];
const pct = (a, b) => (b > 0 ? a / b : 0);                       // a share, 0 when there's nothing to share
const pctText = v => `${Math.round(v * 100)}%`;
// The boards: what they rank (value), how it's shown (show), and who qualifies (ok) — percentages need enough stations
const LB_BOARDS = [
  { id: "champions", icon: "🏆", name: "Champions", sub: "Journeys won", unit: "journeys won",
    value: p => p.journeysWon + pct(p.journeysWon, p.journeys) / 100 + p.stationsWon / 1e6, show: p => p.journeysWon, ok: p => p.journeys > 0 },
  { id: "masters", icon: "🚉", name: "Station Masters", sub: "Station win %", unit: "stations won",
    value: p => pct(p.stationsWon, p.stations), show: p => pctText(pct(p.stationsWon, p.stations)), ok: (p, d) => p.stations >= d.minStations },
  { id: "favourites", icon: "💬", name: "Crowd Favourites", sub: "Votes per station", unit: "votes per station",
    value: p => pct(p.votes, p.stations), show: p => pct(p.votes, p.stations).toFixed(1), ok: (p, d) => p.stations >= d.minStations },
  { id: "golden", icon: "🎫", name: "Golden Tickets", sub: "Acros with 5+ votes", unit: "golden tickets",
    value: p => p.goldenTickets + p.votes / 1e6, show: p => p.goldenTickets, ok: p => p.goldenTickets > 0 },
  { id: "express", icon: "⚡", name: "Express Riders", sub: "Speed bonuses", unit: "speed bonuses",
    value: p => p.speedBonuses + p.stations / 1e6, show: p => p.speedBonuses, ok: p => p.speedBonuses > 0 },
  { id: "eyes", icon: "👁️", name: "Sharp Eyes", sub: "Voted for the winner %", unit: "picked the winner",
    value: p => pct(p.votedForWinner, p.voted), show: p => pctText(pct(p.votedForWinner, p.voted)), ok: (p, d) => p.voted >= d.minStations },
];

function SkyLeaderboard() {
  const navigate = useNavigate();
  const me = String(getAuth()?.username || "").toLowerCase();
  const [period, setPeriod] = useState("month");
  const [boardId, setBoardId] = useState("champions");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setData(null); setErr("");
    fetch(`${API_URL}/api/leaderboard?period=${period}`, { headers: authHeaders() })
      .then(async r => { if (r.status === 401) throw new Error("Log in to see the Sky Leaderboard."); if (!r.ok) throw new Error(); setData(await r.json()); })
      .catch(e => setErr(e.message || "Couldn't load the Sky Leaderboard. Try again in a moment."));
  }, [period]);
  const board = LB_BOARDS.find(b => b.id === boardId);
  const periodName = LB_PERIODS.find(p => p[0] === period)[1];
  // The ranking: passengers who qualify for this board, best first; equal values share a rank
  const ranked = data ? data.players.filter(p => board.ok(p, data)).sort((a, b) => board.value(b) - board.value(a)) : [];
  const ranks = []; ranked.forEach((p, i) => ranks.push(i > 0 && board.value(p) === board.value(ranked[i - 1]) ? ranks[i - 1] : i + 1));
  const myEntry = data?.players.find(p => p.name.toLowerCase() === me);
  const myRank = ranked.findIndex(p => p.name.toLowerCase() === me);
  const podium = ranked.slice(0, 3);
  const medal = [C.ivory, C.textSecond, C.brand];     // 1st, 2nd, 3rd: the palette's warm, silver-ish and accent colours
  const nameBtn = (name, style) => (
    <button onClick={() => openProfile(name)} title={`${name}: Sky Passport and Message`}
      style={{ background: "none", border: "none", padding: 0, color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left", ...style, ...goldName(name) }}>{name}</button>
  );
  const th = { textAlign: "left", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.teal, fontWeight: 700, padding: "8px 10px", borderBottom: `1px solid ${C.border}` };
  const td = { padding: "8px 10px", borderBottom: `1px solid ${C.border}` };
  const num = { textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <div style={{ minHeight: "100vh", color: C.textPrimary, padding: "14px 16px 0", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Title, the period, back to the station */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 44, ...honkTitle }}>Sky Leaderboard</h1>
            <span style={{ color: "var(--c-bgText)", fontSize: 15 }}>Who rules the rails {period === "all" ? "of all time" : period === "week" ? "this week" : "this month"}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {LB_PERIODS.map(([k, label]) => (
              <button key={k} onClick={() => setPeriod(k)}
                style={{ border: `1px solid ${period === k ? C.brand : C.border}`, background: period === k ? C.brand : C.navy2, color: period === k ? C.onBrand : C.textSecond, borderRadius: 999, padding: "6px 14px", fontWeight: 700, fontSize: 14, fontFamily: "inherit", cursor: "pointer" }}>{label}</button>
            ))}
            <BtnSecondary onClick={() => navigate("/")} style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 15, padding: "6px 14px", marginLeft: 6 }}>← Grand Sky Station</BtnSecondary>
          </div>
        </div>

        {/* The six boards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
          {LB_BOARDS.map(b => (
            <button key={b.id} onClick={() => setBoardId(b.id)}
              style={{ textAlign: "left", padding: "9px 12px", borderRadius: 12, background: C.bgPanel2, border: `1px solid ${b.id === boardId ? C.teal : C.border}`, boxShadow: b.id === boardId ? `inset 0 0 0 1px ${C.teal}` : "none", color: C.textPrimary, cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{b.icon} {b.name}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{b.sub}</div>
            </button>
          ))}
        </div>

        {err && <Panel style={{ padding: 16 }}><p style={{ margin: 0, color: C.brand }}>{err}</p></Panel>}
        {!data && !err && <p style={{ color: "var(--c-bgText)" }}>Loading…</p>}
        {data && (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
            <Panel style={{ padding: 0, overflow: "hidden", gridColumn: "span 2", minWidth: 0 }}>
              {ranked.length === 0 ? (
                <p style={{ margin: 0, padding: 20, color: C.textMuted }}>
                  No one on this board yet {period === "all" ? "" : periodName.toLowerCase()}.
                  {["masters", "favourites", "eyes"].includes(boardId) && ` It counts from ${data.minStations} stations.`}
                </p>
              ) : (
                <>
                  {/* Podium: the top three, the winner in the middle and highest */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr 1fr", gap: 10, alignItems: "end", padding: "14px 14px 0" }}>
                    {[1, 0, 2].map(i => {
                      const p = podium[i];
                      if (!p) return <div key={i} />;
                      return (
                        <div key={i} style={{ textAlign: "center", minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><AvatarSquare name={p.name} size={i === 0 ? 64 : 52} /></div>
                          <div style={{ borderRadius: "12px 12px 0 0", padding: "10px 8px 12px", background: C.bgPanel2, border: `1px solid ${i === 0 ? medal[0] : C.border}`, borderBottom: "none", minHeight: [150, 122, 108][i], boxSizing: "border-box" }}>
                            <div style={{ ...honkTitle, fontSize: i === 0 ? 40 : 32, color: medal[i] }}>{ranks[i]}</div>
                            <div style={{ fontWeight: 800, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameBtn(p.name)}</div>
                            <div style={{ fontSize: 12, color: C.textMuted }}>{p.level}</div>
                            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{board.show(p)} <span style={{ fontSize: 12, fontWeight: 400, color: C.textMuted }}>{board.unit}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* The full ranking: the board's number first, then the context */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 560 }}>
                      <thead><tr>
                        <th style={th}>#</th><th style={th}>Passenger</th><th style={{ ...th, ...num }}>{board.sub}</th>
                        <th style={{ ...th, ...num }}>Journeys</th><th style={{ ...th, ...num }}>Stations</th><th style={{ ...th, ...num }}>Stations won</th><th style={{ ...th, ...num }}>Points / station</th>
                      </tr></thead>
                      <tbody>
                        {ranked.map((p, i) => {
                          const isMe = p.name.toLowerCase() === me;
                          return (
                            <tr key={p.name} style={{ background: isMe ? C.navy2 : "transparent" }}>
                              <td style={{ ...td, width: 40, fontWeight: 800, fontSize: 16, color: i < 3 ? medal[i] : (isMe ? C.teal : C.textPrimary) }}>{ranks[i]}</td>
                              <td style={td}><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><AvatarSquare name={p.name} size={26} />{nameBtn(p.name, { fontWeight: 600 })}{isMe && <span style={{ color: C.teal }}>(you)</span>}</span></td>
                              <td style={{ ...td, ...num, fontWeight: 800, color: C.teal }}>{board.show(p)}</td>
                              <td style={{ ...td, ...num }}>{p.journeysWon}/{p.journeys}</td>
                              <td style={{ ...td, ...num }}>{p.stations}</td>
                              <td style={{ ...td, ...num }}>{p.stationsWon}</td>
                              <td style={{ ...td, ...num }}>{pct(p.points, p.stations).toFixed(1)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: "8px 12px 10px", fontSize: 12, color: C.textMuted }}>
                    Percentages count from {data.minStations} stations{period === "all" ? "" : ` ${periodName.toLowerCase()}`}, so one lucky win can't top a board. Journeys: won / ridden to the Final Stop.
                  </div>
                </>
              )}
            </Panel>

            {/* My period: Wordle-style personal numbers, and the best acro of the period */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <Panel style={{ padding: 14 }}>
                <div style={{ fontSize: 24, ...honkTitle }}>{period === "all" ? "My Journey" : period === "week" ? "My Week" : "My Month"}</div>
                {!myEntry ? (
                  <div style={{ fontSize: 14, color: C.textMuted, marginTop: 6 }}>You haven't played a station {period === "all" ? "yet" : periodName.toLowerCase()}. Board a Sky Train!</div>
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: C.textMuted }}>{myEntry.name} · {myEntry.level}
                      {myRank >= 0 && <span style={{ marginLeft: 6, fontSize: 12, padding: "2px 8px", borderRadius: 999, background: C.navy2, color: C.success, fontWeight: 700 }}>#{ranks[myRank]} {board.name}</span>}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                      {[[myEntry.stations, "Stations played"], [pctText(pct(myEntry.stationsWon, myEntry.stations)), "Station win %"], [myEntry.bestStreak, "Best win streak"], [myEntry.goldenTickets, "Golden tickets"]].map(([n, l]) => (
                        <div key={l} style={{ background: C.bgApp, borderRadius: 10, padding: 8, textAlign: "center" }}>
                          <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{n}</div>
                          <div style={{ fontSize: 12, color: C.textMuted }}>{l}</div>
                        </div>
                      ))}
                    </div>
                    {/* How many votes my acros got: 0, 1, 2, 3, 4, 5+ (the tallest bar highlighted) */}
                    <div style={{ fontSize: 13, color: C.textSecond, marginTop: 12 }}>Votes per acro</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 64, marginTop: 6 }}>
                      {myEntry.votesHist.map((n, i) => {
                        const maxN = Math.max(1, ...myEntry.votesHist);
                        return (
                          <div key={i} style={{ flex: 1, textAlign: "center" }}>
                            <div title={`${n} acro${n === 1 ? "" : "s"}`} style={{ height: Math.max(3, Math.round(48 * n / maxN)), background: n === maxN && n > 0 ? C.brand : C.navy3, borderRadius: "4px 4px 0 0" }} />
                            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{i === 5 ? "5+" : i}</div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </Panel>
              <Panel style={{ padding: 14 }}>
                <div style={{ fontSize: 22, ...honkTitle }}>{period === "all" ? "Acro of All Time" : period === "week" ? "Acro of the Week" : "Acro of the Month"}</div>
                {data.acroOfPeriod ? (
                  <>
                    <div style={{ fontSize: 18, marginTop: 6 }}>“{data.acroOfPeriod.sentence}”</div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                      {data.acroOfPeriod.letters.split("").join(" ")} · {data.acroOfPeriod.topic} · {data.acroOfPeriod.votes} vote{data.acroOfPeriod.votes === 1 ? "" : "s"} · by {nameBtn(data.acroOfPeriod.by, { color: C.teal })}
                    </div>
                  </>
                ) : <div style={{ fontSize: 14, color: C.textMuted, marginTop: 6 }}>No votes yet {periodName.toLowerCase()}.</div>}
              </Panel>
            </div>
          </div>
        )}
      </div>
      <Footer />
      <PassengerCard />
    </div>
  );
}

// "Station Log" button in the lobby header, with NEW when there's an entry this browser hasn't seen
function StationLogButton() {
  const navigate = useNavigate();
  const [hasNew, setHasNew] = useState(false);
  useEffect(() => {
    fetch(`${API_URL}/api/log`).then(r => r.json()).then(d => {
      const n = d.entries?.[0];
      if (n && new Date(n.createdAtUtc).getTime() > logSeen()) setHasNew(true);
    }).catch(() => { });
  }, []);
  return (
    <button onClick={() => navigate("/log")}
      style={{ background: C.bgPanel2, border: `1px solid ${hasNew ? C.teal : C.border}`, borderRadius: 8, color: C.textPrimary, cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: "6px 12px", whiteSpace: "nowrap" }}>
      Station Log{hasNew && <span style={{ marginLeft: 6, background: C.teal, color: C.bgApp, fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "1px 6px" }}>NEW</span>}
    </button>
  );
}

// ── Sky Passport (player profiles) ─────────────────────────────────
// Built from the stats recorded since 2026-10-12. Quick card at the Grand Sky Station (click a name),
// full page at /passenger/<name>. No avatar for now (Damon, 2026-10-16). Not on trains: during a
// journey a name opens a private chat / the passenger menu instead.
const openProfile = name => window.dispatchEvent(new CustomEvent("acro-open-profile", { detail: name }));
const monthYear = d => new Date(d).toLocaleDateString([], { month: "long", year: "numeric" });
// "Good morning" … by the time on the player's own device (passengers play from all over the world)
function greeting(name) {
  const h = new Date().getHours();
  const part = h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${name}`;
}
const passWhere = p => p.where === "train" ? <>On <b>{p.trainName}</b></> : p.where === "station" ? "At the Grand Sky Station" : "Offline";

function PassStat({ n, label }) {
  return (
    <div style={{ background: C.bgApp, borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums", color: C.textPrimary }}>{n}</div>
      <div style={{ fontSize: 12, color: C.textMuted }}>{label}</div>
    </div>
  );
}
function AcroQuote({ a, big }) {
  return (
    <div style={{ borderLeft: `3px solid ${C.teal}`, padding: "2px 0 2px 12px" }}>
      <div style={{ fontFamily: "Fredoka, sans-serif", fontSize: big ? 20 : 17, color: C.ivory }}>"{a.sentence}"</div>
      <div style={{ fontSize: 13, color: C.textMuted }}>
        {a.letters.split("").join(" ")} · {a.topic} · <span style={{ color: C.teal }}>{a.votes} vote{a.votes === 1 ? "" : "s"}</span>{a.won ? " · won the station" : ""}
      </div>
    </div>
  );
}
function PassHeader({ p, big }) {
  return (
    <div>
      {/* The name in Honk, in the letters colour (Damon, 2026-10-18) */}
      <div style={{ ...honkTitle, fontSize: big ? 46 : 36, color: isGolden(p.name) ? "var(--c-gold)" : C.brand, fontPalette: isGolden(p.name) ? "--acro-gold" : "--acro-letters", lineHeight: 1.05, overflowWrap: "anywhere" }}>{p.name}</div>
      <div style={{ color: C.textSecond, fontSize: 15, marginTop: 2 }}>
        <b style={{ color: C.teal }}>{p.level}</b> · on board since {monthYear(p.memberSince)}
      </div>
      <div style={{ fontSize: 14, color: p.where === "offline" ? C.textMuted : C.success, marginTop: 2 }}>● <span style={{ color: C.textSecond }}>{passWhere(p)}</span></div>
    </div>
  );
}

// Quick card — opens when a name is clicked (station and trains). inTrain: no button that leaves the train
function PassengerCard({ inTrain = false }) {
  const navigate = useNavigate();
  const [name, setName] = useState(null);
  const [p, setP] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const open = e => { setName(e.detail); setP(null); setErr(""); };
    window.addEventListener("acro-open-profile", open);
    return () => window.removeEventListener("acro-open-profile", open);
  }, []);
  useEffect(() => {
    if (!name) return;
    fetchPassenger(name).then(setP).catch(e => setErr(String(e.message || "").replace(/^\d{3}:\s*/, "") || "Couldn't load the Sky Passport."));
    const onKey = e => { if (e.key === "Escape") setName(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [name]);
  if (!name) return null;
  const me = String(getAuth()?.username || "").toLowerCase() === String(name).toLowerCase();
  return (
    <div onPointerDown={e => { if (e.target === e.currentTarget) setName(null); }}
      style={{ position: "fixed", inset: 0, zIndex: 88, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "10vh 16px", boxSizing: "border-box" }}>
      <div role="dialog" aria-label={`Sky Passport of ${name}`} style={{ background: C.bgPanel, border: `1px solid ${C.teal}`, borderRadius: 14, width: "min(400px, 100%)", padding: 18, boxShadow: "0 16px 48px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          {p ? <PassHeader p={p} /> : <div style={{ color: C.textMuted }}>{err || "Loading…"}</div>}
          <button onClick={() => setName(null)} aria-label="Close" style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        {p && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              <PassStat n={p.journeys} label="Journeys" />
              <PassStat n={p.journeysWon} label="Won" />
              <PassStat n={p.stationsWon} label="Stations won" />
            </div>
            {p.bestAcro
              ? <div><div style={{ fontSize: 13, color: C.textMuted, marginBottom: 4 }}>Best acro</div><AcroQuote a={p.bestAcro} /></div>
              : <div style={{ fontSize: 14, color: C.textMuted }}>No votes yet — the best acro shows here.</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!me && <Btn onClick={() => { openPm(p.name); setName(null); }}>✉ Message</Btn>}
              {!inTrain && <BtnSecondary onClick={() => { setName(null); navigate(`/passenger/${encodeURIComponent(p.name)}`); }}>Open Sky Passport →</BtnSecondary>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Full page — /passenger/<name>
function PassengerPage() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  useEffect(() => {
    setP(null); setErr("");
    if (!getAuth()?.token) { setErr("Log in at the Grand Sky Station to see Sky Passports."); return; }
    fetchPassenger(name).then(setP).catch(e => setErr(String(e.message || "").replace(/^\d{3}:\s*/, "") || "Couldn't load the Sky Passport."));
  }, [name]);
  useEffect(() => {
    if (!q.trim()) { setFound([]); return; }
    const t = setTimeout(() => searchPassengers(q.trim()).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  const me = String(getAuth()?.username || "").toLowerCase() === String(name).toLowerCase();
  const maxPts = p ? Math.max(1, ...p.last10.map(s => s.points)) : 1;
  return (
    <div style={{ minHeight: "100vh", color: C.textPrimary, padding: "24px 16px 48px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>Sky Passport</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", position: "relative" }}>
            <input id="passengerSearch" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a passenger"
              style={{ width: 200, background: C.bgApp, border: `1px solid ${C.fieldLine}`, borderRadius: 8, padding: "7px 12px", color: C.textPrimary, fontSize: 15, outline: "none", fontFamily: "inherit" }} />
            {found.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 20, marginTop: 4, width: 200, background: C.bgPanel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: 4 }}>
                {found.map(n => (
                  <button key={n} onClick={() => { setQ(""); navigate(`/passenger/${encodeURIComponent(n)}`); }}
                    style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", color: C.textPrimary, cursor: "pointer", fontFamily: "inherit", fontSize: 15, padding: "5px 8px", borderRadius: 6 }}>{n}</button>
                ))}
              </div>
            )}
            <BtnSecondary onClick={() => navigate("/")}>← Grand Sky Station</BtnSecondary>
          </div>
        </div>
        {err && <Panel style={{ padding: 20 }}><p style={{ margin: 0, color: C.textSecond }}>{err}</p></Panel>}
        {!p && !err && <p style={{ color: C.textMuted }}>Loading…</p>}
        {p && (
          <>
            <Panel style={{ padding: 20, borderColor: C.teal, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                <PassHeader p={p} big />
                {/* The private chat panel lives at the Grand Sky Station (and on trains) */}
                {!me && <Btn onClick={() => { openPm(p.name); navigate("/"); }}>✉ Message {p.name}</Btn>}
              </div>
              {/* Level progress: every station played counts */}
              <div>
                <div style={{ height: 8, borderRadius: 4, background: C.bgApp }}>
                  <div style={{ width: `${Math.round(p.levelProgress * 100)}%`, height: 8, borderRadius: 4, background: C.teal }} />
                </div>
                <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
                  {p.nextLevel ? `${p.stationsToNext} station${p.stationsToNext === 1 ? "" : "s"} to ${p.nextLevel}` : "Top level reached"}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))", gap: 8 }}>
                <PassStat n={p.journeys} label="Journeys" />
                <PassStat n={p.journeysWon} label="Journeys won" />
                <PassStat n={p.stations} label="Stations" />
                <PassStat n={p.stationsWon} label="Stations won" />
                <PassStat n={p.pointsPerStation} label="Points / station" />
                <PassStat n={p.votes} label="Votes received" />
                <PassStat n={p.speedBonuses} label="Speed bonuses" />
              </div>
            </Panel>

            <Panel style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 28, ...smallTitle }}>Top acros</h2>   {/* Honk (2026-10-18) */}
              {p.topAcros.length === 0 ? <p style={{ margin: 0, color: C.textMuted }}>No votes yet — the best acros show here.</p>
                : p.topAcros.map((a, i) => <AcroQuote key={i} a={a} big={i === 0} />)}
            </Panel>

            <Panel style={{ padding: 20 }}>
              <h2 style={{ margin: "0 0 10px", fontSize: 28, ...smallTitle }}>Last 10 stations</h2>   {/* Honk */}
              {p.last10.length === 0 ? <p style={{ margin: 0, color: C.textMuted }}>No stations yet.</p> : (
                <>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 70 }}>
                    {p.last10.map((s, i) => (
                      <div key={i} title={`${s.letters} · ${s.points} point${s.points === 1 ? "" : "s"}${s.won ? " · won" : ""}`}
                        style={{ flex: 1, height: `${Math.max(6, Math.round(s.points / maxPts * 100))}%`, background: s.won ? C.teal : C.border, borderRadius: 3 }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>Points per station · teal = station won</div>
                </>
              )}
            </Panel>

            <Panel style={{ padding: 20 }}>
              <h2 style={{ margin: "0 0 10px", fontSize: 28, ...smallTitle }}>Stamps</h2>   {/* Honk */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {p.stamps.map(s => (
                  <div key={s.id} title={s.earned ? "Earned" : s.progress}
                    style={{ border: `1px solid ${s.earned ? C.teal : C.border}`, background: s.earned ? C.navy3 : C.bgApp, color: s.earned ? C.textPrimary : C.textMuted, borderRadius: 999, padding: "5px 12px", fontSize: 14 }}>
                    {s.earned ? "★ " : "☆ "}{s.name}{!s.earned && <span style={{ fontSize: 12 }}> · {s.progress}</span>}
                  </div>
                ))}
              </div>
            </Panel>
          </>
        )}
      </div>
      <PmToast />
    </div>
  );
}

// ── Lobby ──────────────────────────────────────────────────────
function Lobby() {
  const [status, setStatus] = useState("");   // "ok" / "down" once checked
  const [myPass, setMyPass] = useState(null);   // my Sky Passport, for the line under the greeting
  const [roomList, setRoomList] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState(() => {
    const saved = localStorage.getItem("acro.auth");
    return saved ? JSON.parse(saved) : null;
  });
  const navigate = useNavigate();
  const { players, messages, notices, sendMessage } = useLobbyHub(auth?.username);
  const pm = usePm();   // private messages (shared with the room)
  const restart = useRestartWindow();
  // Lobby chat shows only the current session: after 15 minutes without a message it starts fresh
  // (Fran, 2026-10-15). The server sends the same session as history.
  const [chatNow, setChatNow] = useState(Date.now());
  useEffect(() => { const iv = setInterval(() => setChatNow(Date.now()), 30000); return () => clearInterval(iv); }, []);
  const QUIET_MS = 15 * 60 * 1000;
  const lobbySession = (() => {
    if (messages.length === 0) return [];
    if (Math.max(chatNow, Date.now()) - new Date(messages[messages.length - 1].time).getTime() >= QUIET_MS) return [];
    let start = 0;
    for (let i = 1; i < messages.length; i++)
      if (new Date(messages[i].time) - new Date(messages[i - 1].time) >= QUIET_MS) start = i;
    return messages.slice(start);
  })();
  // The chat as shown: this session's messages plus the arrival lines ("Carlos arrived at the station")
  // from the same time — arrival lines don't keep the chat session going themselves
  const lobbyChat = (() => {
    const from = lobbySession.length ? new Date(lobbySession[0].time).getTime() : Math.max(chatNow, Date.now()) - QUIET_MS;
    const lines = notices.filter(n => n.time.getTime() >= from).map(n => ({ ...n, notice: true }));
    return [...lobbySession, ...lines].sort((a, b) => new Date(a.time) - new Date(b.time));
  })();
  const [chatInput, setChatInput] = useState("");
  const lobbyBottomRef = useRef(null);
  // Create Room: an inline name field instead of the browser's pop-up
  const [creating, setCreating] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [createError, setCreateError] = useState("");

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

  // My Sky Passport for the greeting ("Level · stations won"); quietly left out if it can't be loaded
  useEffect(() => {
    if (!auth?.username) { setMyPass(null); return; }
    fetchPassenger(auth.username).then(setMyPass).catch(() => setMyPass(null));
  }, [auth?.username]);

  useEffect(() => {
    const check = () => fetchHealth()
      .then(() => setStatus("ok"))
      .catch(() => setStatus("down"));
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
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

  // New line → scroll inside the chat box only (scrollIntoView moved the whole page, and arrival lines
  // would make it jump while someone reads the departures)
  useEffect(() => {
    const box = lobbyBottomRef.current?.parentElement;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [messages, notices]);

  // Phones: one column, smaller side margins — the two-column lobby was wider than the screen
  // and the whole page slid sideways (Sandy, 2026-10-12)
  const [phone, setPhone] = useState(() => window.innerWidth < 600);
  useEffect(() => {
    const onResize = () => setPhone(window.innerWidth < 600);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function cancelCreate() {
    setCreating(false); setNewRoomName(""); setCreateError("");
  }

  async function handleCreate() {
    const name = newRoomName.trim();
    if (!name) { setCreateError("Give your Sky Train a name."); return; }
    try {
      const data = await createRoom(name);
      const id = data?.id || data?.roomId;
      if (!id) throw new Error("No room id");
      navigate(`/room/${encodeURIComponent(id)}`);
    } catch (e) { setCreateError(`Couldn't start the Sky Train: ${String(e.message).replace(/^\d+:\s*/, "")}`); }   // without "409:"
  }

  // ── Grand Sky Station layout, v3 (Damon, 2026-10-18, after his example picture) ──
  // v3: one welcome bar (greeting + My Sky Passport + Leave the station); New Sky Train lives inside the board
  // (the first free platform row); "On the platform" 240px; 8px gaps; a name click always opens the Sky
  // Passport card (Message is its main button) — no separate ✉ shortcut.
  // Desktop: fills the window exactly, no page scrollbar. Order: header (logo + menus) → welcome strip →
  // "On the platform" (left) + Grand Sky Station Chat (right), which get all the height that is left →
  // Departures board (always 3 rows: free platforms fill the empty ones) → footer line.
  // Short windows and phones: the page scrolls instead, with fixed box heights.
  // Text is thin and quiet (Nunito); Honk only for the logo and the box titles. Buttons on this page use
  // Nunito at normal text size on small buttons (Damon: "New Sky Train and Send are huge").
  // Avatars: placeholder squares with the first letter.
  const [winH, setWinH] = useState(() => window.innerHeight);
  useEffect(() => { const on = () => setWinH(window.innerHeight); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  const fits = !phone && winH >= 720;   // tall enough to show everything without scrolling
  // Everyone online, with where they are: the station's list (players) plus the passengers aboard each train
  // (roomList). Someone aboard a train is shown aboard it, not twice.
  const aboard = roomList.flatMap(r => (r.playingNames || []).map(n => ({ name: n, where: `Aboard ${r.name}`, onTrain: true })));
  const aboardSet = new Set(aboard.map(a => a.name.toLowerCase()));
  const online = [
    ...players.filter(n => !aboardSet.has(String(n).toLowerCase())).map(n => ({ name: n, where: "On the platform", onTrain: false })),
    ...aboard,
  ];
  const [listOpen, setListOpen] = useState(true);   // phones: the "On the platform" list folded open or closed
  const sendLobby = () => { if (chatInput.trim()) { sendMessage(chatInput.trim()); setChatInput(""); } };   // Enter or Send
  const boxTitle = { margin: 0, fontSize: phone ? 24 : 28, ...smallTitle, display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" };   // Honk box titles, all the same size
  const smallBtn = { fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 15, lineHeight: 1.2, padding: "8px 16px", letterSpacing: 0, display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" };
  // Departures: the trains, then free platforms so the board always shows 3 rows — and always at least one
  // free platform, the row where you start a new Sky Train
  const used = new Set(roomList.map(r => r.platform));
  const freeNumbers = []; for (let n = 1; freeNumbers.length < Math.max(1, 3 - roomList.length); n++) if (!used.has(n)) freeNumbers.push(n);
  const boardCols = "76px minmax(0, 2.6fr) minmax(0, 0.8fr) minmax(0, 1.1fr) 132px";   // platform · train · aboard · status · button

  return (
    <div style={{ height: "100vh", overflowY: fits ? "hidden" : "auto", overflowX: "hidden", color: C.textPrimary, display: "flex", flexDirection: "column" }}>
      {/* Header: the logo, then the menus (on phones the menus go under the logo) */}
      <div style={{ flexShrink: 0, borderBottom: `1px solid ${C.border}`, padding: phone ? "10px 16px" : "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", rowGap: 8, columnGap: 16 }}>
        <h1 style={{ fontFamily: "'Honk', 'Nunito', sans-serif", fontSize: phone ? 38 : 46, fontWeight: 400, margin: 0, lineHeight: 1.05, color: C.teal, fontPalette: "--acro-logo", fontVariationSettings: "'SHLN' 41, 'MORF' 15" }}>
          Acro Express<sup style={{ fontFamily: "'Nunito', sans-serif", fontSize: 12, color: "var(--c-bgText)", marginLeft: 3, verticalAlign: "super" }}>™</sup>
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <StationLogButton />
          <HowToPlay winScore={roomList[0]?.winScore || 30} />
          <ThemePicker />
          {status && <span style={{ color: status === "ok" ? C.success : C.brand, fontSize: 14, whiteSpace: "nowrap" }}>● {status === "ok" ? "All lines running" : "Delays, reconnecting…"}</span>}
        </div>
      </div>

      <div style={{ flex: fits ? 1 : "none", minHeight: 0, width: "100%", maxWidth: 1400, margin: "0 auto", boxSizing: "border-box", padding: phone ? "8px 10px 0" : "8px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>

        {/* Not signed in: the sign-in box */}
        {!auth && (
          <Panel style={{ padding: 16 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, color: C.textPrimary, fontWeight: 600 }}>Sign in to play</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <Input placeholder="Passenger name" value={username} onChange={e => setUsername(e.target.value)} style={{ textAlign: "left" }} />
              <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ textAlign: "left" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={doRegister} style={smallBtn}>Get your Sky Passport</Btn>
              <BtnSecondary onClick={doLogin} style={smallBtn}>Log in</BtnSecondary>
            </div>
          </Panel>
        )}

        {/* Welcome bar (one box, Damon): the greeting; your Sky Passport and leaving on the right */}
        {auth && (
          <Panel style={{ flexShrink: 0, padding: "8px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <IconBadge><Icon name="user" /></IconBadge>
            <div style={{ fontSize: 16, flex: 1, minWidth: 160 }}>{greeting("")}<b style={{ color: C.teal }}>{auth.username}</b></div>
            <BtnSecondary onClick={() => navigate("/leaderboard")} style={smallBtn}>🏆 Sky Leaderboard</BtnSecondary>   {/* 2026-10-18 */}
            <BtnSecondary onClick={() => navigate(`/passenger/${encodeURIComponent(auth.username)}`)} style={smallBtn}><Icon name="ticket" size={18} /> My Sky Passport</BtnSecondary>
            <button onClick={doLogout} style={{ background: "none", border: "none", color: C.textMuted, fontFamily: "inherit", fontSize: 14, cursor: "pointer", padding: 4 }}>Leave the station</button>
          </Panel>
        )}

        {/* Heroku's daily restart, announced (shown from 15 minutes before the expected window) */}
        {auth && restart?.soon && (
          <p style={{ flexShrink: 0, margin: 0, color: "var(--c-bgText)", fontSize: 14, textAlign: "center" }}>ℹ {restart.text}</p>
        )}

        {/* Who's here (left) and the chat (right); private chats on the right when open.
            Desktop: takes all the height that's left. Phones: the chat first, then the list */}
        {auth && (
          <div style={{ flex: fits ? 1 : "none", minHeight: 0, display: "grid", gap: 8, height: fits ? undefined : (phone ? undefined : 440),
            gridTemplateColumns: phone ? "minmax(0, 1fr)" : (pm.active ? "290px minmax(0, 1.6fr) minmax(0, 1fr)" : "290px minmax(0, 1fr)") }}>
            <Panel style={{ padding: 14, display: "flex", flexDirection: "column", minHeight: 0, order: phone ? 2 : 0 }}>
              {/* Phones: tap the title to fold the list away */}
              <h2 onClick={phone ? () => setListOpen(o => !o) : undefined} style={{ ...boxTitle, marginBottom: phone && !listOpen ? 0 : 8, cursor: phone ? "pointer" : "default" }}>
                <Icon name="users" size={24} color={C.teal} /> On the platform ({online.length})
                {phone && <span style={{ marginLeft: "auto", fontFamily: "'Nunito', sans-serif", fontSize: 18, color: C.textMuted }}>{listOpen ? "▴" : "▾"}</span>}
              </h2>
              {phone && !listOpen ? null : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", flex: 1, minHeight: 0, maxHeight: phone ? 260 : undefined }}>
                  {online.map(o => {
                    const isMe = String(o.name).toLowerCase() === String(auth?.username).toLowerCase();
                    return (
                      // One rule everywhere: a click opens the player's Sky Passport card; Message is its main button
                      <li key={o.name} onClick={() => openProfile(o.name)} title={`${o.name}: Sky Passport and Message`}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 8, background: isMe ? C.navy2 : "transparent", cursor: "pointer" }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.success, flexShrink: 0 }} />
                        <AvatarSquare name={o.name} size={32} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <span style={goldName(o.name)}>{o.name}</span>{isMe && <span style={{ color: C.teal, fontWeight: 400 }}> (you)</span>}
                          </div>
                          <div style={{ fontSize: 13, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Online · {o.where}</div>
                        </div>
                        {/* Unread private messages from them */}
                        {(pm.unread[o.name] || 0) > 0 && <span style={{ background: C.brand, color: C.onBrand, fontSize: 11, borderRadius: 999, padding: "1px 6px" }}>{pm.unread[o.name]}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <Panel style={{ padding: 14, display: "flex", flexDirection: "column", minHeight: 0, order: phone ? 1 : 0 }}>
              <h2 style={{ ...boxTitle, marginBottom: 8 }}><Icon name="chat" size={24} color={C.teal} /> Grand Sky Station Chat</h2>
              {/* The messages scroll inside their own box; the input stays at the bottom */}
              <div style={{ flex: 1, minHeight: phone ? 260 : 0, maxHeight: phone ? 300 : undefined, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, padding: "8px 4px 4px 2px", marginBottom: 10, borderTop: `1px solid ${C.border}` }}>
                {lobbyChat.map((m, i) => m.notice ? (
                  // Arrival line: quiet, the name still clickable
                  <div key={i} style={{ fontSize: 13, color: C.textMuted, fontStyle: "italic" }}>
                    <NameLink profile name={m.username} style={{ color: C.textSecond }} /> {m.text} · {lobbyTime(m.time)}
                  </div>
                ) : (
                  // A message on one line (Damon: no avatar, not two lines): time · name: text — long text wraps
                  <div key={i} style={{ fontSize: 15, lineHeight: 1.4, overflowWrap: "anywhere" }}>
                    <span style={{ color: C.textMuted, fontSize: 12, marginRight: 8, fontVariantNumeric: "tabular-nums" }}>{lobbyTime(m.time)}</span>
                    <NameLink profile name={m.username} style={{ color: C.teal, fontWeight: 700 }} /><span style={{ color: C.teal, fontWeight: 700 }}>: </span>
                    <span style={{ color: C.textPrimary }}>{m.message}</span>
                  </div>
                ))}
                <div ref={lobbyBottomRef} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input id="lobbyChatInput" name="lobbyChatInput" value={chatInput} placeholder="Say hello on the platform..."
                  onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") sendLobby(); }}
                  style={{ flex: 1, minWidth: 0, background: C.bgApp, border: `1px solid ${C.fieldLine}`, borderRadius: 10, padding: "9px 14px", color: C.textPrimary, fontSize: 15, outline: "none", fontFamily: "inherit" }} />
                <Btn onClick={sendLobby} style={{ ...smallBtn, borderRadius: 10 }}><Icon name="send" size={17} /> Send</Btn>
              </div>
            </Panel>

            {/* Private messages — one tab per person (shown when a conversation is open) */}
            {!phone ? <PrivateChatPanel listMaxHeight={300} /> : <div style={{ order: 3 }}><PrivateChatPanel listMaxHeight={240} /></div>}
          </div>
        )}

        {/* Departures board, under the chat (Damon): always 3 rows — free platforms fill the empty ones */}
        {auth && (
          <Panel style={{ flexShrink: 0, padding: "12px 14px" }}>
            {/* Title only: starting a train happens in the board itself, on the first free platform (Damon:
                "New Sky Train and Start one should be one thing") */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <Icon name="train" size={30} color={C.teal} />
              <div>
                <h2 style={boxTitle}>Departures</h2>
                <div style={{ color: C.textSecond, fontSize: 14 }}>{roomList.length === 0 ? "Are you ready to play? Start a Sky Train!" : "Pick a train and hop on, or start your own."}</div>
              </div>
            </div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              {/* Column titles (not on phones: rows stack there) */}
              {!phone && (
                <div style={{ display: "grid", gridTemplateColumns: boardCols, gap: 12, padding: "6px 14px", fontSize: 11, color: C.teal, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
                  <span>Platform</span><span>Sky Train</span><span>Aboard</span><span>Status</span><span />
                </div>
              )}
              {/* Up to 3 rows show; more trains scroll inside the board */}
              <div style={{ maxHeight: fits ? 3 * 62 : undefined, overflowY: fits ? "auto" : "visible" }}>
                {roomList.map(room => {
                  const names = room.playingNames || [];
                  const away = room.awayNames || [];
                  const pill = room.gameOn ? { text: "On the move", color: C.success } : { text: "Boarding now", color: C.brand };
                  const board = () => navigate(`/room/${room.id}`);
                  return (
                    <div key={room.id} style={{ display: "grid", alignItems: "center", gap: 12, height: phone ? undefined : 62, boxSizing: "border-box", padding: phone ? "10px 12px" : "0 14px", borderBottom: `1px solid ${C.border}`,
                      gridTemplateColumns: phone ? "60px minmax(0, 1fr)" : boardCols }}>
                      <PlatformBox n={room.platform} />
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        {!phone && <Icon name="train" size={22} color={C.textSecond} />}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{room.name}</div>
                          <div style={{ fontSize: 13, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {room.gameOn && room.station > 0
                              ? <>Station {room.station}{room.leaderName && <> · leader <span style={{ color: C.teal }}>{room.leaderName}</span> {room.leaderScore} of {room.winScore || 30}</>}</>
                              : (names.length ? names.join(", ") : "No one aboard yet")}
                          </div>
                          {phone && (
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 14, color: C.textSecond, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="users" size={15} /> {names.length}</span>
                              <StatusPill {...pill} />
                              <Btn onClick={board} style={smallBtn}>Board →</Btn>
                            </div>
                          )}
                        </div>
                      </div>
                      {!phone && <span style={{ fontSize: 14, color: C.textSecond, display: "inline-flex", alignItems: "center", gap: 6 }} title={[...names, ...away.map(a => `${a} (away)`)].join(", ")}>
                        <Icon name="users" size={16} /> {names.length}{away.length > 0 && <span style={{ color: C.textMuted }}>+{away.length}</span>}</span>}
                      {!phone && <span><StatusPill {...pill} /></span>}
                      {!phone && <Btn onClick={board} style={{ ...smallBtn, justifyContent: "center" }}>{room.gameOn ? "Board now →" : "Board →"}</Btn>}
                    </div>
                  );
                })}
                {/* Free platforms. The first one is where you start a new Sky Train: its button opens the name
                    box right in the row. The others are quiet placeholders, so the board always has 3 rows */}
                {freeNumbers.map((n, i) => {
                  const rowStyle = { display: "grid", alignItems: "center", gap: 12, height: phone ? undefined : 62, boxSizing: "border-box", padding: phone ? "10px 12px" : "0 14px", borderBottom: `1px solid ${C.border}`,
                    gridTemplateColumns: phone ? "60px minmax(0, 1fr)" : boardCols };
                  if (i > 0) return (
                    <div key={`free-${n}`} style={{ ...rowStyle, opacity: 0.5 }}>
                      <PlatformBox n={n} free />
                      <div style={{ fontSize: 14, color: C.textMuted, fontStyle: "italic" }}>Free platform</div>
                    </div>
                  );
                  return (
                    <div key={`free-${n}`} style={{ ...rowStyle, gridTemplateColumns: phone ? "60px minmax(0, 1fr)" : "76px minmax(0, 1fr) auto" }}>
                      <PlatformBox n={n} free />
                      {creating ? (
                        // Naming the new train, right here on its platform
                        <div style={{ gridColumn: phone ? "2" : "2 / 4", minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input autoFocus maxLength={80} placeholder="Name your Sky Train..." value={newRoomName}
                              onChange={e => { setNewRoomName(e.target.value); setCreateError(""); }}
                              onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") cancelCreate(); }}
                              style={{ flex: 1, minWidth: 0, background: C.bgApp, border: `2px solid ${C.focusLine}`, borderRadius: 8, padding: "7px 12px", color: C.textPrimary, fontSize: 15, outline: "none", fontFamily: "inherit" }} />
                            <Btn onClick={handleCreate} style={smallBtn}>Create</Btn>
                            <BtnSecondary onClick={cancelCreate} style={smallBtn}>Cancel</BtnSecondary>
                          </div>
                          {createError && <div style={{ marginTop: 4, fontSize: 13, color: C.brand }}>{createError}</div>}
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 14, color: C.textMuted, fontStyle: "italic" }}>Free platform · start your own Sky Train here</div>
                          <Btn onClick={() => setCreating(true)} style={{ ...smallBtn, justifyContent: "center", gridColumn: phone ? "2" : undefined, justifySelf: phone ? "start" : undefined }}>
                            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> New Sky Train
                          </Btn>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>
        )}

        <Footer compact />   {/* © + House Rules + Privacy, a plain line under the station */}
        <PmToast />
        <RestartBanner />
        <PassengerCard inTrain />   {/* the card a name click opens, without a link that leaves the train */}
        <PassengerCard />
      </div>
    </div>
  );
}

// A placeholder square for a passenger (avatars are parked): their first letter, in one of the palette's
// accent colours chosen from the name, so the same person always gets the same colour
function AvatarSquare({ name, size = 36 }) {
  const accents = [C.teal, C.brand, C.lavender, C.success, C.ivory];
  let h = 0; for (const ch of String(name || "?")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;   // the same name → the same number
  const color = accents[h % accents.length];
  return (
    <div aria-hidden style={{ flexShrink: 0, width: size, height: size, borderRadius: 8, background: C.navy3, border: `1.5px solid ${color}`, color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.45, fontFamily: "'Nunito', sans-serif" }}>
      {String(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}

// A small coloured status label: "● Boarding now" / "● On the move"
function StatusPill({ text, color }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: C.navy2, color, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />{text}
    </span>
  );
}

// The platform number in a box, like a station sign ("01"); "free" = a quiet dashed box
function PlatformBox({ n, free }) {
  return (
    <div style={{ width: 56, height: 44, borderRadius: 9, border: `1.5px ${free ? "dashed" : "solid"} ${free ? C.border : C.teal}`, background: C.bgApp, display: "flex", alignItems: "center", justifyContent: "center", ...smallTitle, fontSize: 24, color: free ? C.textMuted : C.teal }}>
      {n > 0 ? String(n).padStart(2, "0") : "–"}
    </div>
  );
}

// A round badge for an icon (the welcome strip)
function IconBadge({ children }) {
  return (
    <div aria-hidden style={{ flexShrink: 0, width: 40, height: 40, borderRadius: "50%", border: `1.5px solid ${C.teal}`, color: C.teal, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
  );
}

// Small line icons, drawn here (no icon package): train, user, users, chat, send, ticket.
// Thin strokes in the current text colour (or "color"), like the example picture.
function Icon({ name, size = 20, color = "currentColor" }) {
  const paths = {
    train: <><rect x="5" y="3" width="14" height="13" rx="3" /><path d="M5 10h14M9 20l-2 2M15 20l2 2M8 16l-1 4h10l-1-4" /><circle cx="9" cy="13" r="0.6" /><circle cx="15" cy="13" r="0.6" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.3c2 .7 3.5 2.6 3.5 5.7" /></>,
    chat: <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z" />,
    send: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></>,
    ticket: <><path d="M3 7a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4z" /><path d="M14 5v14" strokeDasharray="2 2" /></>,
  };
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {paths[name]}
    </svg>
  );
}

// ── Voting Screen ──────────────────────────────────────────────
// One font for every number in the game (timers, round number, scores) —
// plain and bold, like the AcroChallenge countdown
const NUM_FONT = "'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
applyLetterFont(loadLetterFont());   // the player's big-letters font, before the first render (needs NUM_FONT above)

// Compares two ids (Guids) safely: ignores case and null/undefined.
// The backend sends Guids as lowercase strings, but localStorage values or older
// payloads may differ in case — a plain === check let players see their own entry.
// Room screen fit (see `view` in Room): the size the room layout needs, and the smallest
// scale before it switches to a scrolling page.
const ROOM_FIT_W = 1000;   // CSS px wide
const ROOM_FIT_H = 640;    // CSS px tall
const ROOM_MIN_SCALE = 0.7;
function measureRoomView() {
  const w = window.innerWidth, h = window.innerHeight;          // includes zoom and Windows scaling
  const fit = Math.min(1, w / ROOM_FIT_W, h / ROOM_FIT_H);       // 1 = fits as it is
  if (fit >= ROOM_MIN_SCALE)
    return { scale: fit, scroll: false, w: w / fit, h: h / fit }; // laid out at w×h, then shrunk to the window
  return { scale: 1, scroll: true, w, h };                        // too small: normal size, page scrolls
}

// Time shown before a lobby message: "21:14" today, "Yesterday 21:14", or "11 Oct 21:14"
function lobbyTime(date) {
  if (!(date instanceof Date) || isNaN(date)) return "";
  const hm = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(date); day.setHours(0, 0, 0, 0);
  const daysAgo = Math.round((today - day) / 86400000);
  if (daysAgo === 0) return hm;
  if (daysAgo === 1) return `Yesterday ${hm}`;
  return `${date.toLocaleDateString([], { day: "numeric", month: "short" })} ${hm}`;
}

function sameId(a, b) {
  // Missing ids never match — prevents undefined === undefined being "true"
  if (!a || !b) return false;
  // Normalise both sides to lowercase strings before comparing
  return a.toString().toLowerCase() === b.toString().toLowerCase();
}

function VotingScreen({ roomId, entries, myPlayerId, onVoted, onVoteCast, timer, maxTimer, topic }) {
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
      // Tell the room which acro I picked, so the results can highlight it
      onVoteCast?.(entries.find(e => e.id === entryId)?.sentence ?? null);
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
      onVoteCast?.(null); // blank vote — nothing to highlight in the results
    } catch (e) { alert(`Vote failed: ${e.message}`); }
  }

  // Lock in the vote and close the overlay. Tells the server too: voting ends
  // early only when every player has clicked "Done Voting".
  function handleDoneVoting() {
    const a = getAuth();
    doneVoting(roomId, a.username).catch(() => { });
    setSubmitted(true);
    if (onVoted) onVoted();
    setClosed(true);
  }

  if (closed) return null;

  const auth = getAuth();
  // Only keep real entry objects (with an id) — plain strings can't be voted on,
  // because the vote would go out with no entry id and be counted as a blank vote.
  // Then hide the player's own entry from the voting list.
  const visibleEntries = (entries || []).filter(e =>
    e && typeof e === "object" && e.id &&
    // Hide if I'm the author — or one of the authors, when identical acros were merged
    !sameId(e.playerId, auth?.userId) &&
    !(e.playerIds || []).some(pid => sameId(pid, auth?.userId))
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 520, background: C.bgPanel, border: `1px solid ${C.brand}`, borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ margin: 0, fontSize: 20, color: C.ivory, fontFamily: "Fredoka, sans-serif" }}>{textPair.title}</h2>
          {/* The round's topic — players asked "what was the topic?" while voting */}
          {topic && (
            <div style={{ margin: "10px 0 0", textAlign: "center" }}>
              <div style={{ fontSize: 12, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>Topic</div>
              <div style={{ fontSize: 34, ...smallTitle, overflowWrap: "anywhere" }}>{topic}</div>   {/* Honk (Damon, 2026-10-18) */}
            </div>
          )}
          {selected && selected !== "blank" && !submitted && (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: C.textMuted }}>
              You can change your vote until you click "Done Voting".
            </p>
          )}
        </div>

        {/* Entry list */}
        {/* maxHeight follows the screen height (was a fixed 380px, which only fit ~4 entries) */}
        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
          {visibleEntries.length === 0 ? (
            <p style={{ color: C.textMuted, fontSize: 15, textAlign: "center" }}>No entries to vote on at this station...</p>
          ) : (
            visibleEntries.map((entry) => {
              // sameId() returns false for missing ids, so only the clicked entry lights up
              const isSelected = sameId(selected, entry.id);
              return (
                // Key by entry id so React doesn't mix up buttons between rounds
                <button key={entry.id}
                  onClick={() => handleSelect(entry.id)}
                  disabled={submitted}
                  style={{
                    width: "100%", textAlign: "left", padding: "12px 16px",
                    background: isSelected ? `color-mix(in srgb, ${C.brand} 13%, transparent)` : C.bgPanel2,
                    border: `1px solid ${isSelected ? C.brand : C.border}`,
                    borderRadius: 10, color: isSelected ? C.ivory : C.textSecond,
                    fontSize: 16, cursor: submitted ? "not-allowed" : "pointer",
                    opacity: submitted && !isSelected ? 0.6 : 1,
                    fontFamily: "inherit", transition: "all 0.15s"
                  }}>
                  {entry.sentence}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 24px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "center", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Blank vote option */}
          {!submitted && (
            <button
              onClick={handleBlankVote}
              style={{
                background: selected === "blank" ? `color-mix(in srgb, ${C.textMuted} 13%, transparent)` : "transparent",
                border: `1px solid ${selected === "blank" ? C.textMuted : C.border}`,
                borderRadius: 8, padding: "6px 14px", fontSize: 14,
                color: selected === "blank" ? C.textPrimary : C.textMuted,
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
              }}>
              None of the above
            </button>
          )}

          {/* Voting countdown — number only (no bar), red in the last 10 seconds */}
          {timer !== null && timer > 0 && (
            <span style={{ fontSize: 32, fontWeight: 700, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums", color: timer <= 10 ? C.brand : C.ivory, lineHeight: 1 }}>{timer}</span>
          )}

          {/* Done voting button */}
          <BtnSecondary onClick={handleDoneVoting}>Done Voting</BtnSecondary>
        </div>
      </div>
    </div>
  );
}

// ── Results Screen ─────────────────────────────────────────────
function ResultsScreen({ scores, winningAcro, entries, players, round, topic, onClose, myVote, votes, myName, details }) {
  const sorted = Object.entries(scores || {}).sort((a, b) => b[1] - a[1]);
  const anyPoints = sorted.some(([, s]) => s > 0);

  const entryByNickname = {};
  (entries || []).forEach(e => {
    // All authors of this entry (several when identical acros were merged)
    const authorIds = e.playerIds?.length ? e.playerIds : [e.playerId];
    authorIds.forEach(pid => {
      const player = (players || []).find(p => sameId(p.id, pid));
      if (player) entryByNickname[player.nickname] = e.sentence;
    });
  });
  const winners = sorted.filter(([name, score]) => !!winningAcro && entryByNickname[name] === winningAcro && score > 0).map(([n, sc]) => ({ name: n, score: sc }));
  const votedWinner = new Set(details?.votedWinner || []);
  const iVoted = !!myVote;

  // The winner explained in words (AcroChallenge: "The high scorer was … who received 3 votes …")
  let summary = null;
  if (winners.length > 0 && details) {
    const w = winners[0];
    const n = details.winnerVotes || 0;
    const speedForWinner = details.speedBonus && winners.some(x => x.name === details.speedBonus);
    const parts = [`${n} vote${n === 1 ? "" : "s"}`];
    if (details.letterBonus) parts.push(`${details.letterBonus} letter bonus`);
    if (speedForWinner) parts.push("1 speed bonus");
    const who = winners.map(x => x.name).join(" and ");
    summary = <>
      <b style={{ color: C.textPrimary }}>{who}</b> won{winners.length > 1 ? " (same acro)" : ""} with {n} vote{n === 1 ? "" : "s"}: {parts.join(" + ")} = <b style={{ color: C.textPrimary }}>{w.score} points</b>.
      {details.speedBonus && !speedForWinner && <> Speed bonus +1: <b style={{ color: C.textPrimary }}>{details.speedBonus}</b>.</>}
    </>;
  }

  const cell = { padding: "3px 10px", lineHeight: 1.25, borderBottom: `1px solid ${C.border}`, textAlign: "left" };   // compact rows (AcroChallenge): 14 fit
  const youVotedLine = `2px solid ${C.teal}`;
  return (
    <Panel style={{ padding: "10px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 28, ...smallTitle }}>   {/* Honk (Damon, 2026-10-18) */}
          Station {round}{topic ? ` – ${topic}` : ""}
        </h2>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* The symbols, in words (AcroChallenge's legend) — next to the title to save a line */}
          {anyPoints && (
            <span style={{ color: C.textMuted, fontSize: 12, textAlign: "right" }}>
              🏆 station winner · <span style={{ color: C.success, fontWeight: 800 }}>✓</span> voted for the winner (+1){iVoted && <> · <span style={{ border: youVotedLine, borderRadius: 4, padding: "0 4px" }}>outlined</span> = your vote</>}
            </span>
          )}
          <button onClick={onClose} title="Close" style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1 }}>×</button>
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ color: C.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              <th style={cell}>Name</th>
              {votes && <th style={{ ...cell, textAlign: "center", width: 64 }}>Votes</th>}
              <th style={{ ...cell, textAlign: "center", width: 70 }}>Points</th>
              <th style={cell}>Acro</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(([name, score]) => {
              const isWinner = winners.some(w => w.name === name);
              // The acro I voted for: a teal OUTLINE around the row + a "your vote" tag (Acrophobia's box)
              const isMyVote = iVoted && entryByNickname[name] === myVote;
              const edge = isMyVote ? youVotedLine : undefined;
              const td = (extra, first, last) => ({
                ...cell, ...extra,
                borderTop: edge || "none", borderBottom: edge || cell.borderBottom,
                borderLeft: first && edge ? edge : undefined, borderRight: last && edge ? edge : undefined,
              });
              return (
                <tr key={name} style={{
                  // The winner: a warm row with a bar on the left (AcroChallenge's trophy row) — never teal
                  background: isWinner ? `color-mix(in srgb, ${C.brand} 22%, transparent)` : "transparent",
                  boxShadow: isWinner ? `inset 4px 0 0 ${C.brand}` : "none",
                }}>
                  <td style={td({ color: isWinner ? C.textPrimary : C.textSecond, fontWeight: isWinner ? 700 : 400, whiteSpace: "nowrap" }, true, false)}>
                    {/* One fixed slot before the name: 🏆 winner, ✓ voted for the winner (+1) */}
                    <span style={{ display: "inline-block", width: 22, textAlign: "center", fontSize: 13, lineHeight: 1 }}
                      title={isWinner ? "Station winner" : votedWinner.has(name) ? "Voted for the winner (+1)" : undefined}>
                      {isWinner ? "🏆" : votedWinner.has(name) ? <span style={{ color: C.success, fontWeight: 800 }}>✓</span> : ""}
                    </span>
                    {name}
                    {name === myName && <span style={{ marginLeft: 6, fontWeight: 400, color: C.teal }}>(you)</span>}
                  </td>
                  {votes && <td style={td({ textAlign: "center", color: isWinner ? C.textPrimary : C.textSecond, fontWeight: 700, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums" })}>{votes[name] ?? 0}</td>}
                  <td style={td({ textAlign: "center", color: isWinner ? C.brand : C.teal, fontWeight: 700, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums" })}>{score}</td>
                  <td style={td({ color: isWinner ? C.ivory : C.textSecond, fontStyle: "italic", fontWeight: isWinner ? 700 : 400 }, false, true)}>
                    {entryByNickname[name] || "—"}
                    {isMyVote && <span style={{ marginLeft: 8, fontStyle: "normal", fontWeight: 700, fontSize: 11, color: C.teal, border: `1px solid ${C.teal}`, borderRadius: 999, padding: "0 6px", whiteSpace: "nowrap" }}>your vote</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!anyPoints ? (
        <p style={{ margin: "8px 0 0", color: C.textMuted, fontSize: 14 }}>No points were awarded at this station.</p>
      ) : (
        <>
          {summary && <p style={{ margin: "4px 0 0", color: C.textSecond, fontSize: 14 }}>{summary}</p>}
        </>
      )}
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
  // The acro I voted for this round (null = no vote / blank) — highlighted in the results
  const [myVote, setMyVote] = useState(null);
  const [phase, setPhase] = useState("Waiting");
  const [currentRound, setCurrentRound] = useState(1);
  const [letters, setLetters] = useState([]);
  const [entries, setEntries] = useState([]);
  const [scores, setScores] = useState({});
  const [winningAcro, setWinningAcro] = useState(null);
  // Votes each player's acro got in the last round (nickname -> votes); null = server didn't send them
  const [roundVotes, setRoundVotes] = useState(null);
  const [resultDetails, setResultDetails] = useState(null);   // ✓ voters, bonuses (results screen)
  const [timer, setTimer] = useState(null);
  const [submittedAcro, setSubmittedAcro] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  // Why the last acro wasn't accepted (shown under the input; cleared when typing)
  const [acroError, setAcroError] = useState("");
  const draftTimerRef = useRef(null);
  const [currentTopic, setCurrentTopic] = useState("");

  const [roomMessages, setRoomMessages] = useState([]);
  const [roomChatInput, setRoomChatInput] = useState("");
  const chatBottomRef = useRef(null);

  const [creatorId, setCreatorId] = useState(null);
  const [gameWinner, setGameWinner] = useState(null); // null = no game over, object = { name, message }
  // Seconds until the server starts the next game by itself (null = no countdown running).
  // It keeps counting below 0: from 0 to -10 we wait for the server, after that the
  // New Game button comes back in case the automatic start didn't happen.
  const [nextGameIn, setNextGameIn] = useState(null);
  useEffect(() => {
    if (nextGameIn === null || nextGameIn <= -10) return;            // no countdown, or gave up waiting
    const t = setTimeout(() => setNextGameIn(n => (n === null ? null : n - 1)), 1000); // one second later
    return () => clearTimeout(t);                                      // stop if it changes meanwhile
  }, [nextGameIn]);
  const [resultsClosed, setResultsClosed] = useState(false); // × on the results panel

  const [maxTimer, setMaxTimer] = useState(60); // tracks initial timer value for the progress bar
  const [topicRequested, setTopicRequested] = useState(false);
  // True when the topic prompt is for round 1 (Start Game / New Game), false when the round winner sets it
  const [topicForFirstRound, setTopicForFirstRound] = useState(false);
  const [topicDraft, setTopicDraft] = useState("");
  // Waits 8 s after the results appear before opening the winner's topic prompt
  const topicPromptTimerRef = useRef(null);
  // Error from the server when the topic is refused (e.g. too short)
  const [topicError, setTopicError] = useState("");
  const [topicTimer, setTopicTimer] = useState(null);
  // The topic the winner set — it can still be changed until GO! or the clock runs out (Sandy)
  const [topicSetValue, setTopicSetValue] = useState(null);
  const [topicGoing, setTopicGoing] = useState(false);
  // The first topic starts the journey (no Start button — Damon): a 5-second "Departing in…"
  // countdown with Change, then the server starts Station 1 with it
  const [firstTopicDraft, setFirstTopicDraft] = useState("");
  const [firstTopicError, setFirstTopicError] = useState("");
  const [departIn, setDepartIn] = useState(null);
  const [departTopic, setDepartTopic] = useState("");
  const restart = useRestartWindow();
  const restartAnnouncedRef = useRef(null);

  // Private messages: tabs, unread counts and history are shared with the lobby (src/pm.js)
  const pm = usePm();
  // Passenger scores frozen during voting and the drumroll, so the new totals
  // don't show before the results are revealed (null = show live scores)
  const [frozenScores, setFrozenScores] = useState(null);
  const playersRef = useRef([]);
  // When each player's leaving was last announced (id → time), so it shows once, not 2–3 times
  const leftAnnouncedRef = useRef({});
  // Players in the last Passengers list we saw (lower-case ids); null until the room first loads
  const knownPlayersRef = useRef(null);
  // When each player's arrival was last announced (id → time), so it shows once
  const joinAnnouncedRef = useRef({});
  // "<name> has joined the room." — announced when a new name appears in Passengers.
  // Comparing lists (instead of using the PlayerJoined event) means a reconnect after a
  // network blip doesn't announce the player again: they never left the list.
  useEffect(() => {
    const list = state.data?.players;
    if (!list) return;                                              // room not loaded (or closed)
    const ids = list.map(p => String(p.id).toLowerCase());
    if (knownPlayersRef.current === null) {                         // first load: everyone already here
      knownPlayersRef.current = new Set(ids);
      return;
    }
    for (const p of list) {
      const id = String(p.id).toLowerCase();
      if (knownPlayersRef.current.has(id)) continue;                // was here already
      if (sameId(p.id, auth?.userId)) continue;                     // don't announce yourself
      const lastTime = joinAnnouncedRef.current[id];
      if (!lastTime || Date.now() - lastTime > 30000) {             // once per 30 s, like the leave message
        joinAnnouncedRef.current[id] = Date.now();
        postSystemMessage(`${p.nickname} has boarded.`);
      }
    }
    knownPlayersRef.current = new Set(ids);                         // remember for the next comparison
  }, [state.data]);
  // Room screen size. The window size the browser reports already includes browser zoom and
  // Windows display scaling, so zooming in is the same as a smaller window.
  // - Big enough (about 1000×640): the room is drawn normally.
  // - Smaller: the whole room shrinks proportionally to fit (scale), like a game window, so
  //   nothing is cut off or covered (Deb and Acronymist lost the acro box / chat at high zoom).
  // - Below 70% it would be too small to read: the room becomes a normal scrolling page instead.
  const [view, setView] = useState(measureRoomView);
  useEffect(() => {
    const onResize = () => setView(measureRoomView());   // re-measure when the window or zoom changes
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Narrow (phones, very heavy zoom): the topic moves from the top right to under the letters,
  // and Passengers / chats are stacked. view.w is the width the room is laid out at.
  const isNarrow = view.w < 900;
  // Short (under 800px tall, e.g. Windows display scale 125%): smaller header, timer and letters
  const isShort = view.h < 800;

  // Refs
  const myDraftRef = useRef("");
  const lettersRef = useRef(null);       // the big letters' row: measured for the Honk outline colour (setBigLetterSky)
  const lastDraftSentRef = useRef("");   // the draft the server holds (sent again after a restart)
  const doneVotedRef = useRef(false);    // clicked "Done Voting" at this station (sent again after a restart)
  // Where the big letters are on screen → their Honk outline in the sky colour right there (setBigLetterSky).
  // Measured after every render and on window resize; only rewrites the palette when the colour changes.
  useEffect(() => {
    const measure = () => {
      const el = lettersRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.height > 0) setBigLetterSky((r.top + r.height / 2) / window.innerHeight);   // middle of the letters
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });
  const submittedAcroRef = useRef(null);
  const handleSubmitAcroRef = useRef(null);
  const audioRef = useRef(null);      // tune 1 — plays during submission
  const audio2Ref = useRef(null);     // tune 2 — plays after submission until voting
  const votingAudioRef = useRef(null); // drumroll
  const songTimeoutRef = useRef(null); // delayed start of the writing song (long rounds)
  const topicRequestedRef = useRef(false);
  // Mirrors `phase` so refreshRoomState (run from a setInterval) always reads the
  // current phase — the interval closure otherwise keeps the phase from first render
  const phaseRef = useRef("Waiting");
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  // Chat scroll containers — we scroll these directly instead of scrollIntoView,
  // which also scrolled the whole page down every time a message arrived
  const chatListRef = useRef(null);
  // Live connection: "connected" or "reconnecting" (shows a banner)
  const [connStatus, setConnStatus] = useState("connected");
  // Short private notice, e.g. "Acro not entered. It needed 3 words: B T V" (null = none)
  const [notice, setNotice] = useState(null);
  // Players who have submitted this round (lower-case ids) — names turn teal in Passengers
  const [submittedIds, setSubmittedIds] = useState([]);
  const noticeTimerRef = useRef(null);
  // The 3-second room check can't reach the server (also shows the banner)
  const [pollFailing, setPollFailing] = useState(false);
  // The room loaded at least once — after that, a failed check keeps the room on screen
  const roomLoadedRef = useRef(false);
  // The room no longer exists on the server (everyone left, or closed after 5 minutes)
  const [roomClosed, setRoomClosed] = useState(false);
  // Vote to kick: removed from this train by a passenger vote (back when the journey ends)
  const [kicked, setKicked] = useState(false);
  const [kickVotes, setKickVotes] = useState({});      // targetId → { votes, needed } (shown in Passengers)
  const [myKicks, setMyKicks] = useState([]);           // targetIds I voted to kick
  // Last known room name, so the title never falls back to "Room #<id>"
  const roomNameRef = useRef("");
  // Set while leaving with Back to Lobby, so the poll below doesn't join the room again
  const leavingRef = useRef(false);
  // When the poll last re-joined us (so it doesn't try more than every 5 s)
  const lastRejoinRef = useRef(0);

  // 🔊 / volume changed in the header: apply it to the sounds playing at this moment
  useEffect(() => {
    const onSound = () => {
      for (const a of [audioRef.current, audio2Ref.current, votingAudioRef.current])
        if (a) a.volume = soundGain();
    };
    window.addEventListener("acro-sound-change", onSound);
    return () => window.removeEventListener("acro-sound-change", onSound);
  }, []);

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
    // Someone submitted (or changed) an acro: the server sends everyone who has submitted so far
    onSubmittedPlayers: useCallback((ids) => {
      setSubmittedIds((ids || []).map(x => String(x).toLowerCase()));
    }, []),
    // From the server, to this player only: the unsent acro couldn't be entered at time-up.
    // Shown as a banner for 10 seconds, and as a line in my own chat.
    onAcroNotEntered: useCallback((message) => {
      setNotice(message);
      postSystemMessage(message);
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(null), 10000);
    }, []),
    // From useSignalR: the live connection dropped ("reconnecting") or works again ("connected")
    onConnectionChange: useCallback((status) => setConnStatus(status), []),
    // 4th argument (topic) is new — the backend now sends it with every RoundStarted
    onRoundStarted: useCallback((roundNumber, lettersStr, seconds, topic) => {
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
      lastDraftSentRef.current = "";   // a new station: nothing to send again after a restart yet
      doneVotedRef.current = false;
      setAcroError("");
      setMyVote(null); // new round — forget last round's vote
      clearTimeout(topicPromptTimerRef.current); // a round started — no topic prompt pending any more
      setNextGameIn(null); // a round has started — no game-over countdown any more
      setSubmittedIds([]); // nobody has submitted yet in the new round
      // Show this round's topic next to the acro input.
      // Before, this line cleared the topic — but TopicSet arrives just BEFORE
      // RoundStarted, so the topic was wiped the moment the round began.
      if (typeof topic === "string") setCurrentTopic(topic);
      setCurrentRound(roundNumber);
      // One chat line per round with the topic in it (before, the topic had its own line,
      // which left less room for real chat on short screens)
      postSystemMessage(typeof topic === "string" && topic.trim()
        ? `Leaving for Station ${roundNumber} — Topic: "${topic}"`
        : `Leaving for Station ${roundNumber}.`);
      setMaxTimer(seconds);

      if (!topicRequestedRef.current) {
        setTimeout(() => {
          // Into "Your Acro" — unless the player is in the middle of a chat message (then it moves
          // there as soon as they send it, see sendRoomMessage)
          const activeEl = document.activeElement;
          const typingChat = (activeEl?.id === "chatInput" || activeEl?.id === "privateChatInput") && activeEl.value.trim() !== "";
          if (!typingChat) {
            document.getElementById("acroInput")?.focus();
          }
        }, 100);
      }

      // Stop all previous audio cleanly
      // Stop all previous audio cleanly
      if (votingAudioRef.current) { votingAudioRef.current.pause(); votingAudioRef.current = null; }
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }

      const audio = new Audio("/AcroExpress_tunes.m4a");
      audio.loop = false;
      audio.volume = soundGain();   // the player's sound setting (🔊 and slider in the header)
      audioRef.current = audio;

      // The song lasts ~92 seconds and its ending must land on 0: every round
      // (56–84 s) skips the right amount of its beginning, with a quick fade-in.
      // (If a round is ever longer than the song, the song starts later instead.)
      const SONG_SECONDS = 91.9; // extended version (30-second build-up intro + the original song)
      const skipSeconds = Math.max(0, SONG_SECONDS - (seconds || 0));
      if (skipSeconds > 0) audio.currentTime = skipSeconds;

      const startSong = () => {
        // Round already over (or a new one started) — don't play a stale song
        if (audioRef.current !== audio) return;
        // Submitted during the quiet lead-in → the song runs silently, as after any submit
        if (submittedAcroRef.current) audio.muted = true;
        // Fade in over 1.5 s when not starting from the very beginning
        if (skipSeconds > 0) {
          audio.volume = 0;
          let v = 0;
          const fade = setInterval(() => {
            v = Math.min(1, v + 0.1);
            audio.volume = v * soundGain();   // fade up to the player's volume, not to full
            if (v >= 1) clearInterval(fade);
          }, 150);
        }
        audio.play().catch(() => {
          const unlockAndPlay = () => {
            audio.play().catch(() => { });
            window.removeEventListener("click", unlockAndPlay);
            window.removeEventListener("keydown", unlockAndPlay);
          };
          window.addEventListener("click", unlockAndPlay);
          window.addEventListener("keydown", unlockAndPlay);
        });
      };

      // Longer rounds: wait, so the song's ending still lines up with 0
      const delayMs = Math.max(0, ((seconds || 0) - SONG_SECONDS) * 1000);
      if (songTimeoutRef.current) clearTimeout(songTimeoutRef.current);
      songTimeoutRef.current = null;
      if (delayMs > 0) songTimeoutRef.current = setTimeout(startSong, delayMs);
      else startSong();
    }, []),

    // Restored: this handler was accidentally deleted in the May 22 music fix.
    // Without it the voting screen only appeared via the 3s poll, which sent
    // plain sentence strings (no ids) — causing the all-highlighted voting,
    // blank votes (so nobody scored), and players seeing their own entry.
    onVotingStarted: useCallback((acroEntries, votingSeconds) => {
      // Stop all music when voting starts
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }
      // Entry objects: { id, sentence, playerId }
      setEntries(acroEntries || []);
      setPhase("Voting");
      // Freeze the Passengers scores until the results are revealed
      setFrozenScores(Object.fromEntries(playersRef.current.map(p => [p.id, p.score])));
      // Voting countdown for the progress bar
      setTimer(votingSeconds || 20);
      setMaxTimer(votingSeconds || 20);
    }, []),

    onTopicRequested: useCallback((creatorUserId) => {
      // A new game is starting — leave the Game Over screen (hides the New Game button,
      // so nobody else clicks it and gets a "round already in progress" error)
      setGameWinner(null);
      setNextGameIn(null); // the new game is starting — stop the countdown
      setPhase(prev => (prev === "GameOver" || prev === "Paused" ? "Starting" : prev));
      // sameId ignores case differences between the backend Guid and localStorage
      if (sameId(auth?.userId, creatorUserId)) {
        setTopicForFirstRound(true); // a new game always starts at round 1 (3 letters)
        setTopicRequested(true);
        topicRequestedRef.current = true;
        setTopicTimer(25);
      } else {
        postSystemMessage("Waiting for the host to set a topic...");
      }
    }, [auth]),

    // roundVotesMap (4th) = votes per player's acro — sent by newer servers only
    // details (5th, new): who voted for the winner, letter bonus, winner's votes, speed bonus
    onRoundEnded: useCallback((roundScores, winning, winnerPlayerId, roundVotesMap, details) => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }

      // Voting is over (time ran out, or everyone voted) — close the voting screen
      // straight away and show "Counting votes" during the drumroll
      setPhase("Tallying");
      setTimer(null);

      const drumroll = new Audio("/AcroExpress_drumroll.m4a");
      drumroll.volume = soundGain();   // the player's sound setting
      votingAudioRef.current = drumroll;
      drumroll.play().catch(() => { });

      setTimeout(() => {
        setScores(roundScores || {});
        setRoundVotes(roundVotesMap || null);
        setResultDetails(details || null);
        setWinningAcro(winning);
        setPhase("Results");
        setTimer(null);
        setResultsClosed(false);
        // Reveal: Passengers now show the new totals
        setFrozenScores(null);

        // Round winner picks the next topic (sameId ignores Guid case differences) — but only
        // after everyone has had 8 seconds with the results. The prompt then REPLACES the results
        // for the winner (they never show together). The server waits 40 s, enough for this.
        if (sameId(auth?.userId, winnerPlayerId)) {
          clearTimeout(topicPromptTimerRef.current);
          topicPromptTimerRef.current = setTimeout(() => {
            setTopicForFirstRound(false); // topic for the round after the one that just ended
            setTopicRequested(true);
            topicRequestedRef.current = true;
            setTopicTimer(25);
          }, 8000);
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
      // Hide the last round's letters and countdown on the game over screen
      setLetters([]);
      setTimer(null);
      setFrozenScores(null);
      setNextGameIn(30); // the server starts the next game after a 30-second break
      setPhase("GameOver");
    }, []),

    // Several rounds in a row without any acros — the server paused the game
    onGamePaused: useCallback(() => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }
      setPhase("Paused");
      setTimer(null);
      setLetters([]);
      setFrozenScores(null);
      postSystemMessage("Game paused: no acros for 3 rounds in a row. Choose a topic to continue.");
    }, []),

    onTopicSet: useCallback((topic) => {
      setTopicSetValue(null);
      setTopicGoing(false);
      setDepartIn(null);
      setFirstTopicDraft("");
      setFirstTopicError("");
      setTopicRequested(false);
      topicRequestedRef.current = false;
      setTopicDraft("");
      setTopicTimer(null);
      setCurrentTopic(topic);
      // No chat line here — RoundStarted (sent right after this) posts the round and topic together
    }, []),

    onRoomMessage: useCallback((nickname, message) => {
      setRoomMessages(prev => [...prev, { nickname, message, time: new Date() }]);
    }, []),

    // A vote to kick: "You voted to kick …" on your own screen, "A vote to kick … was cast" for everyone
    // else — the passenger it's about sees it too (Damon)
    onKickVote: useCallback((m) => {
      setKickVotes(prev => {
        const next = { ...prev };
        if (m.votes > 0) next[String(m.targetId).toLowerCase()] = { votes: m.votes, needed: m.needed }; else delete next[String(m.targetId).toLowerCase()];
        return next;
      });
      if (sameId(m.voterId, auth?.userId)) {
        setMyKicks(prev => m.added ? [...prev, String(m.targetId).toLowerCase()] : prev.filter(t => t !== String(m.targetId).toLowerCase()));
        postSystemMessage(m.added ? `You voted to kick "${m.target}".` : `You took back your vote to kick "${m.target}".`);
      } else {
        postSystemMessage(m.added ? `A vote to kick "${m.target}" was cast (${m.votes} of ${m.needed} needed).`
          : `A vote to kick "${m.target}" was taken back (${m.votes} of ${m.needed}).`);
      }
    }, [auth]),

    onPlayerKicked: useCallback((m) => {
      setKickVotes(prev => { const next = { ...prev }; delete next[String(m.targetId).toLowerCase()]; return next; });
      setMyKicks(prev => prev.filter(t => t !== String(m.targetId).toLowerCase()));
      if (sameId(m.targetId, auth?.userId)) { leavingRef.current = true; setKicked(true); return; }
      postSystemMessage(`"${m.target}" was removed from the train by a passenger vote.`);
      refreshRoomState();
    }, [auth]),

    onPlayerJoined: useCallback((playerId) => {
      refreshRoomState();
    }, []),

    onPlayerLeft: useCallback((leftId) => {
      refreshRoomState();
      // The server can announce the same departure up to 3 times, sometimes with a
      // connection id instead of the player id. Only announce players we know, once per 30 s.
      const leaver = playersRef.current.find(p => sameId(p.id, leftId));
      const lastTime = leaver ? leftAnnouncedRef.current[leaver.id] : 0;
      // Not about yourself: if the server removed you, the page joins you again straight away
      if (leaver && !sameId(leaver.id, auth?.userId) && (!lastTime || Date.now() - lastTime > 30000)) {
        leftAnnouncedRef.current[leaver.id] = Date.now(); // remember, so the repeats are skipped
        postSystemMessage(`${leaver.nickname} got off the train.`);
      }
    }, []),

    onChatMessage: useCallback(() => { }, []),
  };

  const { disconnect, connectionRef } = useSignalR(id, signalRHandlers);

  // Keep the newest chat message in view by scrolling only the chat box itself.
  // (scrollIntoView also scrolled the whole page — the "screen scrolls down" bug)
  useEffect(() => {
    const el = chatListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [roomMessages]);

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

  // Vote to kick (or take the vote back) — only by typing "/kp name" or "/kick name" in Sky Train Chat
  async function voteKick(name) {
    try {
      const r = await kickVote(id, name);
      if (r?.kicked) refreshRoomState();
    } catch (e) {
      postSystemMessage(String(e.message || "").replace(/^\d{3}:\s*/, "") || "Couldn't vote.");
    }
  }

  async function sendRoomMessage() {
    const text = roomChatInput.trim();
    if (!text || !auth) return;
    // "/kick name" (or AcroChallenge's "/kp name") votes to kick instead of chatting
    const cmd = text.match(/^\/(kick|kp)\s+(.+)$/i);
    if (cmd) { setRoomChatInput(""); voteKick(cmd[2].trim()); return; }
    try {
      const conn = connectionRef.current;
      if (conn) {
        await conn.invoke("SendRoomMessage", id, auth.username, text);
        setRoomChatInput("");
        // Writing time and no acro yet: the message is sent, so on to "Your Acro"
        if (phaseRef.current === "Submitting" && !submittedAcroRef.current && !topicRequestedRef.current)
          setTimeout(() => document.getElementById("acroInput")?.focus(), 50);
      }
    } catch (e) { console.error(e); }
  }

  async function handleLeaveRoom() {
    leavingRef.current = true;   // leaving on purpose — the poll must not join us again
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
    joinRoom(id, { id: auth.userId, nickname: auth.username, score: 0 }).catch(e => {
      console.warn(e);
      if (String(e?.message || "").includes("passenger vote")) { leavingRef.current = true; setKicked(true); }
    });
  }, [id]);

  async function refreshRoomState() {
    try {
      const { fetchRoomState } = await import("./services/api");
      const data = await fetchRoomState(id);
      // The room no longer exists → show "This room has closed" instead of an empty room
      // (keeps the last good room data; before, the title became "Room #<id>")
      if (data?.notFound) { setRoomClosed(true); return; }
      if (data?.name) roomNameRef.current = data.name;      // remember the name
      roomLoadedRef.current = true;
      setPollFailing(false);                                 // the server answers again
      setState({ loading: false, error: null, data });

      // Self-heal: the room exists but we're not in Passengers any more — removed as "away"
      // after a dropped connection, a server restart, or a second tab that was closed.
      // Join again, so chat, topics and acros work for us again (the server gives the score
      // back if it's the same game). Not while leaving, and at most every 5 seconds.
      const me = auth?.userId;
      if (me && !leavingRef.current && Array.isArray(data?.players)
          && !data.players.some(p => sameId(p.id, me))
          && Date.now() - lastRejoinRef.current > 5000) {
        lastRejoinRef.current = Date.now();
        joinRoom(id, { id: me, nickname: auth.username, score: 0 }).catch(e => {
          console.warn("Re-join failed:", e);
          if (String(e?.message || "").includes("passenger vote")) { leavingRef.current = true; setKicked(true); return; }
          // 401 = the server no longer knows our login (it restarted) — go to the login screen
          // instead of staying in a room we can't play in
          if (String(e?.message || "").startsWith("401")) { localStorage.removeItem("acro.auth"); navigate("/"); }
        });
        // Also join the live updates again, in case this connection lost the room group
        connectionRef.current?.invoke("JoinRoom", id, String(me)).catch(() => { });
      }
      if (data?.letters) setLetters(typeof data.letters === "string" ? data.letters.split("") : data.letters);

      // If server says Voting but frontend missed the SignalR event — force it.
      // phaseRef (not `phase`) because this runs from a setInterval with a stale closure,
      // which made this block re-run every 3 seconds and overwrite the real entries.
      // (not during "Tallying"/"Results": the round is already over, the server just
      //  hasn't saved it yet — forcing Voting here would reopen the voting screen)
      if (data?.phase === "Voting" && !["Voting", "Tallying", "Results"].includes(phaseRef.current)) {
        setPhase("Voting");
        setFrozenScores(prev => prev ?? Object.fromEntries((data.players || []).map(p => [p.id, p.score])));
        // votingEntries = objects with ids; the old `entries` were plain strings
        setEntries(data.votingEntries || []);
        // Use the server's remaining time when available
        const secs = data.secondsRemaining || 20;
        setTimer(secs);
        setMaxTimer(secs);
      }

      // Fallback for the topic label in case TopicSet/RoundStarted was missed
      if (data?.phase === "Submitting" && data?.currentTopic) setCurrentTopic(data.currentTopic);
      // Who has submitted (also after a page reload, or if an update was missed)
      if (data?.phase === "Submitting" && Array.isArray(data?.submittedPlayerIds))
        setSubmittedIds(data.submittedPlayerIds.map(x => String(x).toLowerCase()));

      setPhase(prev => {
        // "GameOver" is kept too — otherwise the poll replaced it within 3s and the winner panel vanished
        if (prev === "Submitting" || prev === "Voting" || prev === "Tallying" || prev === "Results" || prev === "GameOver" || prev === "Paused") return prev;
        return data?.phase || prev;
      });
    } catch (err) {
      // Server unreachable (restart, network blip): keep the room on screen with "Reconnecting…"
      // and keep checking every 3 s. Only a room that never loaded shows the error page.
      // (Before, one failed check replaced the whole room with "Error: Failed to fetch".)
      if (roomLoadedRef.current) setPollFailing(true);
      else setState({ loading: false, error: String(err?.message || err), data: null });
    }
  }

  useEffect(() => {
    refreshRoomState();
    const iv = setInterval(refreshRoomState, 3000);
    return () => clearInterval(iv);
  }, [id]);

  useEffect(() => {
    if (timer === null || timer <= 0) return;
    const iv = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          clearInterval(iv);
          // (No auto-submit here any more: the server collects unsent acros at time-up,
          //  from what the player typed — see saveDraft below.)
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [timer]);

  // Sends what the player is typing to the server (a moment after they stop typing),
  // so a valid acro is still entered if the time runs out before they press Submit
  function saveDraft(text, immediately = false) {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    lastDraftSentRef.current = text;   // what the server holds — sent again after a restart (below)
    const send = () => connectionRef.current?.invoke("SaveDraft", text).catch(() => { });
    if (immediately) send();
    else draftTimerRef.current = setTimeout(send, 250);
  }

  // Back after a lost connection or a server restart (useSignalR sends "acro-rejoined"): the server may
  // have forgotten the unsent draft and "Done Voting", so send them again (2026-10-17)
  useEffect(() => {
    const onRejoined = () => {
      if (phaseRef.current === "Submitting" && lastDraftSentRef.current.trim())
        connectionRef.current?.invoke("SaveDraft", lastDraftSentRef.current).catch(() => { });
      if (phaseRef.current === "Voting" && doneVotedRef.current)
        doneVoting(id, auth?.username).catch(() => { });
    };
    window.addEventListener("acro-rejoined", onRejoined);
    return () => window.removeEventListener("acro-rejoined", onRejoined);
  }, [id, auth?.username, connectionRef]);

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
        audio2Ref.current.volume = soundGain();   // the player's sound setting
        audio2Ref.current.play().catch(() => { });
        setTimeout(() => document.getElementById("chatInput")?.focus(), 100);
        return;
      }
      await submitAcro(id, auth.userId, text);
      setAcroError("");
      saveDraft("", true);   // submitted — nothing left to collect
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
      audio2Ref.current.volume = soundGain();   // the player's sound setting
      audio2Ref.current.play().catch(() => { });
      setTimeout(() => document.getElementById("chatInput")?.focus(), 100);
    } catch (e) {
      // Show the server's reason under the input, e.g. "Word 2 ("apple") should start with V."
      // (the error text arrives as "400: <reason>")
      const reason = (e.message || "").replace(/^\d{3}:\s*/, "").replace(/^"|"$/g, "");
      setAcroError(reason || "That acro wasn't accepted.");
    }
  }

  handleSubmitAcroRef.current = handleSubmitAcro;

  // Sends the topic from the prompt. Needs at least 2 letters or digits (same rule as the server,
  // which refuses shorter ones too) — "l" and "s" were accepted by accident before.
  async function submitTopic() {
    const topic = topicDraft.trim();
    if ((topic.match(/[\p{L}\p{N}]/gu) || []).length < 2) {
      setTopicError("The topic needs at least 2 letters.");
      return;
    }
    try {
      const { setTopic } = await import("./services/api");
      await setTopic(id, topic);
      // Not started yet: it can be changed until GO! or the clock runs out (Sandy)
      setTopicSetValue(topic);
      setTopicDraft("");
      setTopicError("");
    } catch (e) {
      // Show the server's reason (the error text arrives as "400: <reason>")
      setTopicError((e.message || "").replace(/^\d{3}:\s*/, "") || "The topic wasn't accepted.");
    }
  }

  // GO! — start the next station now with the topic that was set
  async function goTopic() {
    setTopicGoing(true);
    try { await topicGo(id); }
    catch (e) { setTopicGoing(false); setTopicError((e.message || "").replace(/^\d{3}:\s*/, "") || "Couldn't start the station."); }
  }

  // The first topic: checked, then "Departing in 5…" (Change stops it), then the journey starts
  function startDeparture() {
    const t = firstTopicDraft.trim();
    if ((t.match(/[\p{L}\p{N}]/gu) || []).length < 2) { setFirstTopicError("The topic needs at least 2 letters."); return; }
    setFirstTopicError("");
    setDepartTopic(t);
    setDepartIn(5);
  }
  useEffect(() => {
    if (departIn === null) return;
    if (departIn <= 0) {
      (async () => {
        try { await startRound(id, departTopic); }
        catch (e) {
          setDepartIn(null);
          setFirstTopicDraft(departTopic);
          setFirstTopicError((e.message || "").replace(/^\d{3}:\s*/, "") || "Couldn't depart.");
        }
      })();
      return;
    }
    const t = setTimeout(() => setDepartIn(d => (d === null ? null : d - 1)), 1000);
    return () => clearTimeout(t);
  }, [departIn]);

  // Heroku's daily restart, announced once in the train chat when its window is near
  useEffect(() => {
    if (restart?.soon && restartAnnouncedRef.current !== restart.from.getTime()) {
      restartAnnouncedRef.current = restart.from.getTime();
      postSystemMessage(restart.text);
    }
  }, [restart?.soon]);

  // The room closed: stop the music and close the live connection
  useEffect(() => {
    if (!roomClosed) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }
    if (votingAudioRef.current) { votingAudioRef.current.pause(); votingAudioRef.current = null; }
    disconnect();
  }, [roomClosed]);

  // Not when the train turned out to be closed: then the "has left service" screen below shows
  // (opening a link to a closed train used to stay on "Boarding..." forever)
  if (state.loading && !roomClosed) return <div style={{ minHeight: "100vh", background: C.bgApp, color: C.textPrimary, padding: 24 }}>Boarding...</div>;
  if (state.error) return (
    <div style={{ minHeight: "100vh", background: C.bgApp, color: C.textPrimary, padding: 24 }}>
      <p style={{ color: C.brand }}>Error: {state.error}</p>
      <Btn onClick={() => navigate("/")}>← Grand Sky Station</Btn>
    </div>
  );
  // The room was deleted on the server while this page was open
  // Removed by a passenger vote
  if (kicked) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, color: C.textPrimary }}>
      <Panel style={{ padding: 32, textAlign: "center", maxWidth: 480, borderColor: C.brand }}>
        <h2 style={{ margin: "0 0 12px", fontFamily: "Fredoka, sans-serif", fontSize: 26, color: C.ivory }}>
          You were removed from this train by a passenger vote
        </h2>
        <p style={{ margin: "0 0 24px", color: C.textSecond, fontSize: 16 }}>
          You can board it again when this journey ends — or board another train now.
        </p>
        <Btn onClick={() => navigate("/")}>← Grand Sky Station</Btn>
      </Panel>
    </div>
  );
  if (roomClosed) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, color: C.textPrimary }}>
      <Panel style={{ padding: 32, textAlign: "center", maxWidth: 480, borderColor: C.teal }}>
        <h2 style={{ margin: "0 0 12px", fontFamily: "Fredoka, sans-serif", fontSize: 26, color: C.ivory }}>
          {roomNameRef.current ? `"${roomNameRef.current}" has left service` : "This Sky Train has left service"}
        </h2>
        <p style={{ margin: "0 0 24px", color: C.textSecond, fontSize: 16 }}>
          Everyone left, or your connection was lost for a while.
        </p>
        <Btn onClick={() => navigate("/")}>← Grand Sky Station</Btn>
      </Panel>
    </div>
  );

  const data = state.data || {};
  const players = data.players || [];
  playersRef.current = players;
  // Score shown in Passengers — frozen during voting/drumroll, live otherwise
  const shownScore = p => (frozenScores && frozenScores[p.id] !== undefined ? frozenScores[p.id] : p.score);
  // Station shown in the header: 0 before the first round of a game (waiting, or the first topic
  // being chosen), otherwise the current round's number. During the round winner's topic prompt
  // it stays on the station just reached — the prompt itself says "Next up: Station N+1".
  const firstTopicPending = topicRequested && topicForFirstRound;
  const headerStation = phase === "Waiting" || phase === "Starting" || firstTopicPending ? 0 : currentRound;
  // The station the topic prompt is for
  const nextStation = topicForFirstRound ? 1 : currentRound + 1;
  // Phase title shown in the header (replaces the technical "Phase: Submitting")
  // (The round winner's topic prompt replaces the results after 8 s, so it comes first)
  const phaseTitle =
    topicRequested || phase === "Starting" ? "Choosing the topic"
    : phase === "Results" || phase === "Ended" ? "Results"
    : phase === "Submitting" ? "Write your acro"
    : phase === "Voting" ? "Voting"
    : phase === "Tallying" ? "Counting votes"
    : phase === "GameOver" ? "Final Stop"
    : phase === "Paused" ? "Paused"
    : "Waiting to start";
  // Topic is shown while players are writing their acros
  const showTopic = !!currentTopic && phase === "Submitting" && !topicRequested;
  // Stage sizes — compact versions on short windows. Used both by the elements and by the
  // stage height formula below, so the formula always matches what is drawn.
  // Compact (Sandy, 2026-10-15: use the space above the letters and in the acro box for more chat lines).
  // The letters keep their size.
  const stagePad = isShort ? "clamp(2px, 0.5vh, 10px)" : "clamp(4px, 1vh, 16px)";      // space above and below the letters
  const timerGap = "clamp(2px, 0.8vh, 8px)";                                            // between the timer and the letters
  const ACRO_BOX = 76;                                                                   // the acro box + its line + margin (no panel)
  const timerSize = isShort ? "clamp(28px, 5vh, 46px)" : "clamp(28px, 6vh, 46px)";     // countdown number
  const letterSize = isShort ? "clamp(2.5rem, 9vh, 6rem)" : "clamp(3rem, 11vh, 6rem)"; // the big letters
  const stageHeight = `calc(2 * ${stagePad} + ${timerSize} + ${timerGap} + ${letterSize} + ${ACRO_BOX}px)`;
  // Results showing: the stage may grow to fit all passengers (option C, Damon 2026-10-16)
  const resultsGrow = phase === "Results" && !resultsClosed && !topicRequested;
  // Topic: label and topic on one line (compact header)
  const topicBlock = (align) => (
    // marginTop: a little space under the Grand Sky Station button (Damon, 2026-10-18: too close)
    <div style={{ textAlign: align, maxWidth: 460, margin: align === "center" ? "0 auto" : "6px 0 0" }}>
      <span style={{ fontSize: 14, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginRight: 8 }}>Topic</span>
      {/* The topic in Honk (was Fredoka; Damon: a different font) */}
      <span style={{ fontSize: isShort ? 30 : 36, ...smallTitle, overflowWrap: "anywhere" }}>{currentTopic}</span>
    </div>
  );
  // Who chooses the first topic: whoever started the Sky Train, or the first passenger on board if
  // they're gone. The first topic starts the journey (there's no Start button any more).
  const onBoard = players.filter(p => p.isConnected !== false);
  const conductor = onBoard.find(p => sameId(p.id, data.ownerId)) || onBoard[0] || null;
  const iAmConductor = !!conductor && sameId(conductor.id, auth?.userId);
  const showFirstTopic = !topicRequested && ((phase === "Waiting" && !(data.currentRoundNumber > 0)) || phase === "Paused"
    || (phase === "GameOver" && nextGameIn !== null && nextGameIn <= -10));

  return (
    // Wide side margins on desktop (like AcroChallenge), tighter on phones
    // The page fills the window exactly: header on top, the stage takes whatever space is left,
    // and Passengers + chats are pinned to the bottom, so they never move between phases
    // Fit mode: laid out at view.w × view.h and shrunk with `zoom`, so it fills the window exactly.
    // Scroll mode (window too small even at 70%): normal height, the page scrolls with a scrollbar.
    <div style={{ height: view.scroll ? "auto" : view.h, minHeight: view.scroll ? "100vh" : undefined, zoom: view.scale, boxSizing: "border-box", overflow: view.scroll ? "visible" : "hidden", display: "flex", flexDirection: "column", color: C.textPrimary, padding: isNarrow ? 16 : "clamp(8px, 1.5vh, 16px) 64px" }}>

      {/* Private notice (e.g. acro not entered) — bold and short, above everything for 10 s */}
      {notice && (
        <div style={{ position: "fixed", top: 52, left: "50%", transform: "translateX(-50%)", zIndex: 60, background: C.brand, color: C.onBrand, padding: "8px 18px", borderRadius: 10, fontSize: 16, fontWeight: 700, boxShadow: "0 6px 20px rgba(0,0,0,0.4)", maxWidth: "calc(100% - 32px)", textAlign: "center" }}>
          {notice}
        </div>
      )}

      {/* Live connection lost — shown until it works again (it keeps trying by itself) */}
      {(connStatus === "reconnecting" || pollFailing) && (
        <div style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 60, background: C.brand, color: C.onBrand, padding: "6px 16px", borderRadius: 999, fontSize: 14, fontWeight: 600, boxShadow: "0 6px 20px rgba(0,0,0,0.4)" }}>
          Reconnecting…
        </div>
      )}

      {/* Voting overlay */}
      {phase === "Voting" && (
        <VotingScreen roomId={id} entries={entries.length > 0 ? entries : (data.entries || [])} myPlayerId={auth?.userId} onVoted={() => { doneVotedRef.current = true; }} onVoteCast={setMyVote} timer={timer} maxTimer={maxTimer} topic={currentTopic} />)}

      {/* Header */}
      {/* minHeight keeps room for the topic (top right), so the header is the same height with or without it.
          Short windows: 86px (smaller topic and gap) instead of 104px */}
      <div style={{ flexShrink: 0, minHeight: isNarrow ? 0 : (isShort ? 64 : 76), display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: "clamp(2px, 0.8vh, 10px)" }}>
        <div>
          {/* The logo, then the train's name, both in Honk (Damon, 2026-10-18). On the left: the right side is
              full (menus, Grand Sky Station, the topic). Same line, so the stage below doesn't move.
              The name is in the logo font with the "letters" colours, so the two are told apart */}
          <h1 style={{ margin: 0, display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 10 }}>
            {/* Bigger on 2026-10-18 (Damon: too small) */}
            <span style={{ fontSize: isShort ? 30 : 34, ...honkTitle }}>Acro Express</span>
            <span style={{ fontSize: isShort ? 24 : 28, ...smallTitle, color: C.brand, fontPalette: "--acro-letters" }}>› {data.name || roomNameRef.current || "Sky Train"}</span>
          </h1>
          {/* div instead of p — a <div> (the timer) inside a <p> is invalid HTML */}
          {/* "Station 2 · Results", in Honk (Damon, 2026-10-18). "First to 30 wins" was removed here
              (Damon: not necessary; How to play still says it) */}
          <div style={{ margin: "4px 0 0", fontSize: isShort ? 30 : 34, ...smallTitle, whiteSpace: "nowrap" }}>   {/* one line, never "Write your / acro" */}
            {/* Rounds are stations: a game travels Station 0 → 1 → 2 … → Final Stop (round N = Station N) */}
            Station {headerStation}
            {/* What's happening now, in words (first step towards the "Departure Board" announcer) */}
            {" · "}{phaseTitle}
            {/* The timer moved to the centre, above the letters */}
          </div>
        </div>
        {/* Gap between the buttons and the topic: 6px on short windows, 16px otherwise */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: isShort ? 4 : 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {/* "Express Colors" and "Sound" menus — change them any time, even mid-game */}
            <OnlineButton />
            <HowToPlay winScore={data.winScore || 30} />
            <ThemePicker />
            <SoundControl />
            {/* After a game ends the room is back in Waiting, so a new game can be started */}
            {/* Hidden during the 30-second break after a game — the next game starts by itself */}
            {/* Not while the first topic is being chosen: round 1 already exists then (currentRoundNumber > 0)
                — clicking it gave "round already in progress" */}
            {/* No Start / New Game button: the first topic starts the journey (Damon, 2026-10-16) */}
            <BtnSecondary onClick={handleLeaveRoom} style={{ border: `1px solid ${C.focusLine}` }}>← Grand Sky Station</BtnSecondary>
          </div>
          {/* Topic — top right, under Back to Lobby (on phones it sits under the letters) */}
          {showTopic && !isNarrow && topicBlock("right")}
        </div>
      </div>

      {/* Stage — always the height the writing phase needs (timer + letters + acro box), in every phase, so the boxes below never move. Passengers and the
          chats get all the remaining space. On short screens the stage shrinks and scrolls inside.
          scrollbarWidth "none" hides the scrollbar (rounding made a 1px overflow show one) — the wheel still scrolls.
          flex "0 0": the stage never shrinks, so the acro box is never pushed out of sight (Deb lost it). */}
      {/* Scroll mode: the stage is as tall as its contents (the topic under the letters included),
          because the page scrolls anyway — nothing inside it can be cut off or covered. */}
      <div style={{ flex: view.scroll ? "0 0 auto" : (resultsGrow ? "0 1 auto" : `0 0 ${stageHeight}`), minHeight: resultsGrow && !view.scroll ? stageHeight : 0, overflowY: view.scroll ? "visible" : "auto", scrollbarWidth: (phase === "Results" && !resultsClosed) || topicRequested ? "thin" : "none", display: "flow-root" }}>
      {/* (scrollbar: hidden normally, slim while results are shown, in case a long list doesn't fit) */}

      {/* Round results and the winner's topic prompt — inside the stage, where the letters are
          (like Acrophobia). Before, they floated over the page and covered "Round N" in the header.
          Never both at once: results first; for the round winner the topic prompt replaces them. */}
      {((phase === "Results" && !resultsClosed) || topicRequested) && (
        <div style={{ marginBottom: 4 }}>
          {phase === "Results" && !resultsClosed && !topicRequested && (
            <div>
            <ResultsScreen scores={scores} winningAcro={winningAcro} entries={entries} players={players}
              round={currentRound} topic={currentTopic} onClose={() => setResultsClosed(true)} myVote={myVote}
              votes={roundVotes} myName={auth?.username} details={resultDetails} />
            </div>
          )}
          {topicRequested && (
        <div>
        <Panel style={{ padding: 20, borderColor: C.teal, textAlign: "center" }}>
          <h2 style={{ margin: "0 0 8px", fontFamily: "Fredoka, sans-serif", fontSize: 22, color: C.teal }}>
            {/* The topic is chosen BEFORE the round (station) it belongs to — the round starts with the countdown */}
            Next up: Station <span style={{ fontFamily: NUM_FONT }}>{nextStation}</span>
          </h2>
          <p style={{ margin: "0 0 16px", color: C.textMuted, fontSize: 15 }}>
            {topicSetValue
              ? <>The station starts when the clock runs out{topicTimer > 0 && <> (<span style={{ color: C.ivory, fontWeight: 700 }}>{topicTimer}s</span>)</>} — or press GO!</>
              : <>Set the topic — you have <span style={{ color: C.ivory, fontWeight: 700 }}>{topicTimer}s</span>, or it defaults to General Acro.</>}
          </p>
          {/* Letters go 3,4,5,6,7 and repeat — same rule as the server (3 + (round - 1) % 5).
              Round 1 always has 3; otherwise currentRound is the round that just ended, so the next one has 3 + (currentRound % 5) */}
          <p style={{ margin: "0 0 16px", color: C.textSecond, fontSize: 16 }}>
            <span style={{ color: C.brand, fontWeight: 700, fontFamily: NUM_FONT }}>{topicForFirstRound ? 3 : 3 + (currentRound % 5)}</span> letters
          </p>
          {topicSetValue ? (
            // Set, not started: change it, or GO! now
            <div style={{ display: "flex", gap: 8, maxWidth: 500, margin: "0 auto", alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 18, color: C.textSecond }}>Topic: <b style={{ color: C.teal, fontFamily: "Fredoka, sans-serif" }}>{topicSetValue}</b></span>
              <BtnSecondary onClick={() => { setTopicDraft(topicSetValue); setTopicSetValue(null); setTimeout(() => document.getElementById("topicInput")?.focus(), 50); }}>Change</BtnSecondary>
              <Btn onClick={goTopic} disabled={topicGoing} style={{ whiteSpace: "nowrap", fontWeight: 800 }}>{topicGoing ? "Departing…" : "GO!"}</Btn>
            </div>
          ) : (
          <div style={{ display: "flex", gap: 8, maxWidth: 500, margin: "0 auto" }}>
            {/* No autoFocus: the cursor stays where it is (Sandy typed "ty" in chat, Enter set it as the
                topic). The box is highlighted instead; the player clicks into it. */}
            <input
              id="topicInput"
              className="acro-pulse"
              style={{ flex: 1, minWidth: 0, background: C.bgApp, border: `2px solid ${C.teal}`, borderRadius: 8, padding: "7px 12px", color: C.textPrimary, fontSize: 16, outline: "none", fontFamily: "inherit", textAlign: "center" }}
              placeholder="Click here and type a topic..."
              value={topicDraft}
              onChange={e => { setTopicDraft(e.target.value); setTopicError(""); }}
              onKeyDown={e => { if (e.key === "Enter") submitTopic(); }}
            />
            {/* nowrap: "Set Topic" stays on one line */}
            <Btn onClick={submitTopic} style={{ whiteSpace: "nowrap" }}>Set Topic</Btn>
          </div>
          )}
          {/* Why the topic wasn't accepted (e.g. "l" — at least 2 letters) */}
          {topicError && <p style={{ margin: "10px 0 0", color: C.brand, fontSize: 14, fontWeight: 600 }}>{topicError}</p>}
        </Panel>
        </div>
          )}
        </div>
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
            {/* Countdown during the break; "Departing…" while the server starts it; the old hint if it didn't */}
            {nextGameIn > 0 ? `The next journey starts in ${nextGameIn}s`
              : nextGameIn !== null && nextGameIn > -10 ? "Departing…"
              : "Choose a topic below to start the next journey."}
          </p>
        </Panel>
      )}

      {/* The first topic starts the journey — no Start button (Damon, 2026-10-16) */}
      {showFirstTopic && (
        <Panel style={{ padding: 16, marginBottom: 8, borderColor: C.teal, textAlign: "center" }}>
          {!iAmConductor ? (
            <p style={{ color: C.textMuted, margin: 0, fontSize: 16 }}>
              {conductor ? <>Waiting for <b style={{ color: C.textPrimary }}>{conductor.nickname}</b> to choose the first topic…</> : "Waiting for passengers…"}
            </p>
          ) : departIn !== null ? (
            <>
              <h2 style={{ margin: "0 0 6px", fontFamily: "Fredoka, sans-serif", fontSize: 24, color: C.teal }}>
                Departing in <span style={{ fontFamily: NUM_FONT }}>{Math.max(departIn, 0)}</span>…
              </h2>
              <p style={{ margin: "0 0 10px", color: C.textSecond, fontSize: 16 }}>First topic: <b style={{ color: C.teal }}>{departTopic}</b></p>
              <BtnSecondary onClick={() => { setDepartIn(null); setFirstTopicDraft(departTopic); }}>Change</BtnSecondary>
            </>
          ) : (
            <>
              <h2 style={{ margin: "0 0 6px", fontFamily: "Fredoka, sans-serif", fontSize: 22, color: C.teal }}>
                {phase === "Paused" ? "Choose a topic to continue" : "Everyone on board? Choose the first topic to depart"}
              </h2>
              <p style={{ margin: "0 0 12px", color: C.textMuted, fontSize: 15 }}>Type a topic and press Enter — the journey starts.</p>
              <div style={{ display: "flex", gap: 8, maxWidth: 500, margin: "0 auto" }}>
                <input
                  id="firstTopicInput"
                  style={{ flex: 1, minWidth: 0, background: C.bgApp, border: `2px solid ${C.teal}`, borderRadius: 8, padding: "7px 12px", color: C.textPrimary, fontSize: 16, outline: "none", fontFamily: "inherit", textAlign: "center" }}
                  placeholder="First topic, e.g. Trains"
                  value={firstTopicDraft}
                  onChange={e => { setFirstTopicDraft(e.target.value); setFirstTopicError(""); }}
                  onKeyDown={e => { if (e.key === "Enter") startDeparture(); }}
                />
                <Btn onClick={startDeparture} style={{ whiteSpace: "nowrap" }}>Depart</Btn>
              </div>
              {firstTopicError && <p style={{ margin: "10px 0 0", color: C.brand, fontSize: 14, fontWeight: 600 }}>{firstTopicError}</p>}
            </>
          )}
        </Panel>
      )}

      {/* Letters */}
      {letters.length > 0 && !topicRequested && phase !== "Results" && phase !== "GameOver" && (
        <div style={{ textAlign: "center", padding: `${stagePad} 0` }}>
          {/* Countdown — number only, centred above the letters, red in the last 10 seconds.
              The line is always there; when the timer has ended it is only made invisible, so the
              letters below keep their place (before, they jumped up when the timer ended). */}
          {/* Font: the player's big-letters choice (--tf-family: Honk, or the plain number font). In Honk the
              colour comes from its palette: accent normally, letters colour in the last 10 seconds */}
          <div style={{ fontSize: timerSize, fontWeight: "var(--tf-weight, 700)", fontFamily: `var(--tf-family, ${NUM_FONT})`, fontVariantNumeric: "tabular-nums", color: timer !== null && timer <= 10 ? C.brand : C.teal, fontPalette: timer !== null && timer <= 10 ? "--acro-letters" : "--acro-logo", fontVariationSettings: "'SHLN' 0, 'MORF' 15", lineHeight: 1, marginBottom: timerGap, visibility: timer !== null && timer > 0 ? "visible" : "hidden" }}>
            {/* "0" keeps the line one number tall while it is hidden */}
            {timer !== null && timer > 0 ? timer : 0}
          </div>
          <div ref={lettersRef} style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {letters.map((l, i) => (
              <span key={i} style={{
                fontFamily: "var(--lf-family, 'Bowlby One SC', serif)",   // the player's choice: Bowlby (default) or Honk
                // smaller on short laptop screens (even smaller on short windows). Honk's capitals are smaller than
                // Bowlby's, so with Honk the size is ×1.4 (--lf-scale) and the line height ÷1.4 (--lf-lh): the
                // letters look as big as Bowlby's while taking the same height, so the acro box doesn't move
                fontSize: `calc(${letterSize} * var(--lf-scale, 1))`,
                lineHeight: "var(--lf-lh, 1)",
                color: C.brand,
                fontPalette: "--acro-big", fontVariationSettings: "'SHLN' 0, 'MORF' 15",   // only used by Honk; outline in the background colour; no shadow (Damon: confusing on lighter backgrounds)
                textShadow: "var(--lf-shadow, var(--c-letterShadow))",   // per palette: softer on the light ones; none with Honk (it has its own)
                fontWeight: 400
              }}>
                {l}
              </span>
            ))}
          </div>
          {showTopic && isNarrow && <div style={{ marginTop: 16 }}>{topicBlock("center")}</div>}
        </div>
      )}

      {/* Acro input */}

      {phase === "Submitting" && !topicRequested && (
        // Just the box and its button under the letters — no panel and no "Your Acro" title around it
        // (Damon, 2026-10-16: no frame within a frame; like Acrophobia's single entry bar). The placeholder
        // says what to do. One small line under it keeps its height: the reason an acro wasn't accepted,
        // or "on its way" — so nothing moves.
        <div style={{ marginBottom: 6 }}>
          {submittedAcro && !isEditing ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0, background: C.bgPanel, border: `2px solid ${C.teal}`, borderRadius: 10, padding: "8px 14px", color: C.teal, fontWeight: 600, textAlign: "center", fontSize: 19, overflowWrap: "anywhere" }}>
                {submittedAcro}
              </div>
              <Btn color={C.navy2} hoverColor={C.navy3} palette="--acro-btn2" style={{ color: C.teal, border: `1px solid ${C.teal}` }} onClick={() => {
                setMyDraft(submittedAcro);
                setIsEditing(true);
                // Pause tune 2 and unmute tune 1 when editing
                if (audio2Ref.current) { audio2Ref.current.pause(); }
                if (audioRef.current) audioRef.current.muted = false;
              }}>Edit</Btn>
            </div>
          ) : (
            // alignItems "stretch": Submit (and Cancel) as tall as the acro box (Damon, 2026-10-18)
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <input
                id="acroInput"
                // Scroll mode: bring the acro box into the middle of the screen when it is clicked
                onFocus={e => { if (view.scroll) e.target.scrollIntoView({ block: "center", behavior: "smooth" }); }}
                // On the page itself now (no panel), so it takes the panel colour to read as a field
                style={{ flex: 1, minWidth: 0 /* may get narrower than its default, so Submit fits on phones */, background: C.bgPanel, border: `2px solid ${C.focusLine}`, borderRadius: 10, padding: "8px 14px", color: C.textPrimary, fontSize: 19, outline: "none", fontFamily: "inherit", textAlign: "center" }}
                placeholder="Type your acro and press Enter"
                value={myDraft}
                onChange={e => {
                  setMyDraft(e.target.value);
                  myDraftRef.current = e.target.value;
                  setAcroError("");
                  saveDraft(e.target.value);
                }}
                onKeyDown={e => { if (e.key === "Enter") handleSubmitAcro(); }}
              />
              <Btn onClick={handleSubmitAcro} style={{ borderRadius: 10, fontSize: 36, padding: "0 18px" }}>{isEditing ? "Update" : "Submit"}</Btn>
              {isEditing && <BtnSecondary onClick={() => { setIsEditing(false); setAcroError(""); saveDraft("", true); }}>Cancel</BtnSecondary>}
            </div>
          )}
          {/* The reason an acro wasn't accepted, short and bold ("Use 3 words, one for each letter: B T V"),
              or "Your entry is on its way." */}
          <p style={{ margin: "3px 0 0", minHeight: 18, lineHeight: "18px", textAlign: "center", fontSize: acroError ? 15 : 13, color: acroError ? C.brand : C.textMuted, fontWeight: acroError ? 700 : 400 }}>
            {submittedAcro && !isEditing ? "Your entry is on its way."
              // On a small panel-coloured label: readable on every palette now that there is no panel behind it
              : acroError ? <span style={{ background: C.bgPanel, borderRadius: 6, padding: "1px 8px" }}>{acroError}</span> : ""}
          </p>
        </div>
      )}

      {/* Results and the topic prompt are floating panels now (see the top of this return) */}

      {/* Waiting / Paused: the first-topic panel above (it starts the journey) */}

      </div>

      {/* Bottom: players | chat | private chat.
          Gets all the height the stage leaves (never below 170px). The stage keeps its full height,
          so the acro box always stays visible — short windows get the compact stage instead.
          Scroll mode: a fixed comfortable height (380px) instead; when narrow, the boxes are stacked
          (Passengers, Room Chat, private chat) and each chat gets 360px. */}
      <div style={{
        flex: view.scroll ? "0 0 auto" : (resultsGrow ? "1 0 215px" : "1 0 260px"),
        minHeight: resultsGrow ? 215 : 260,   // Train Chat: about 8 lines (Sandy, Fran); ~6 while the results show
        height: view.scroll && !isNarrow ? 380 : undefined,
        display: "grid",
        gridTemplateRows: isNarrow ? undefined : "minmax(0, 1fr)",
        gridAutoRows: isNarrow ? "auto" : undefined,
        gridTemplateColumns: isNarrow ? "1fr" : (pm.active ? "minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1.4fr)" : "1fr 3fr"),
        gap: 16
      }}>

        {/* Players */}
        {/* Stacked (narrow): at most 200px tall, scrolls inside when there are many passengers */}
        <Panel style={{ padding: 16, minHeight: 0, maxHeight: isNarrow ? 200 : undefined, overflowY: "auto", boxSizing: "border-box" }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 14, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            List of Passengers   {/* was "Passengers" (Damon, 2026-10-18) */}
            {/* While writing: how many of the connected players have submitted (like Acrophobia) */}
            {phase === "Submitting" && (
              <span style={{ marginLeft: 8, color: C.teal, textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
                · {players.filter(p => p.isConnected !== false && submittedIds.includes(String(p.id).toLowerCase())).length} of {players.filter(p => p.isConnected !== false).length} submitted
              </span>
            )}
          </h2>
          {players.length === 0 ? (
            <p style={{ color: C.textMuted, fontSize: 15, margin: 0 }}>No passengers yet</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {[...players].sort((a, b) => shownScore(b) - shownScore(a)).map(p => (
                <li key={p.id}
                  title={`${p.nickname}: Sky Passport and Message`}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, padding: "4px 8px", background: C.bgApp, borderRadius: 6, cursor: p.id !== auth?.userId ? "pointer" : "default" }}
                  // One click opens their Sky Passport card (Message is its main button), like everywhere else.
                  // Kicking is never mixed in here (Damon, 2026-10-18): only "/kp name" in Sky Train Chat
                  onClick={() => openProfile(p.nickname)}>
                  {/* Left side: a fixed tick column, then the name — the ✓ sits outside the name in its own
                      16px column, so names never move when someone submits (Damon's request) */}
                  <span style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                  <span title={phase === "Submitting" && submittedIds.includes(String(p.id).toLowerCase()) ? "Submitted" : undefined}
                    style={{ width: 16, flexShrink: 0, color: C.teal, fontWeight: 700 }}>
                    {phase === "Submitting" && submittedIds.includes(String(p.id).toLowerCase()) ? "✓" : ""}
                  </span>
                  {/* Submitted this round (while writing): name in teal */}
                  <span style={{ color: p.isConnected === false ? C.textMuted : (phase === "Submitting" && submittedIds.includes(String(p.id).toLowerCase()) ? C.teal : C.textSecond), fontWeight: phase === "Submitting" && submittedIds.includes(String(p.id).toLowerCase()) ? 700 : 400, opacity: p.isConnected === false ? 0.6 : 1 }}>
                    <span style={goldName(p.nickname)}>{p.nickname}</span>
                    {p.id === auth?.userId && <span style={{ color: C.teal, marginLeft: 4 }}>(you)</span>}
                    {/* Window closed / connection lost — removed after about 10 seconds */}
                    {p.isConnected === false && <span style={{ marginLeft: 4, fontStyle: "italic" }}>(away)</span>}
                    {(pm.unread[p.nickname] || 0) > 0 && (
                      <span style={{ marginLeft: 6, background: C.brand, color: C.onBrand, fontSize: 10, borderRadius: 999, padding: "1px 6px" }}>
                        {pm.unread[p.nickname]}
                      </span>
                    )}
                    {/* Votes to kick this passenger, for everyone to see (the passenger too) */}
                    {kickVotes[String(p.id).toLowerCase()] && (
                      <span title="Votes to kick" style={{ marginLeft: 6, color: C.brand, fontSize: 12, fontWeight: 700 }}>
                        kick {kickVotes[String(p.id).toLowerCase()].votes}/{kickVotes[String(p.id).toLowerCase()].needed}
                      </span>
                    )}
                  </span>
                  </span>
                  <span style={{ color: C.teal, fontWeight: 700, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums" }}>{shownScore(p)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Room chat */}
        {/* Stacked (narrow): a fixed 360px so the messages and the input are always visible */}
        <Panel style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 0, height: isNarrow ? 360 : undefined }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
            <h2 style={{ margin: 0, fontSize: 14, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Sky Train Chat</h2>   {/* was "Train Chat" (Damon, 2026-10-18) */}
          </div>
          <div ref={chatListRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
            {roomMessages.length === 0 ? (
              <p style={{ color: C.textMuted, fontSize: 15, margin: 0 }}>No messages yet...</p>
            ) : (
              roomMessages.map((m, i) => (
                m.system ? (
                  <div key={i} style={{ fontSize: isShort ? 13 : 14, lineHeight: 1.35, color: C.textMuted, fontStyle: "italic", textAlign: "center", padding: "1px 0" }}>{m.message}</div>
                ) : (
                  <div key={i} style={{ fontSize: isShort ? 14 : 15, lineHeight: 1.35 }}>
                    <NameLink name={m.nickname} style={{ color: C.teal, fontWeight: 600 }} /><span style={{ color: C.teal, fontWeight: 600 }}>: </span>
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
              style={{ flex: 1, background: C.bgApp, border: `1px solid ${C.fieldLine}`, borderRadius: 8, padding: "8px 12px", color: C.textPrimary, fontSize: 15, outline: "none", fontFamily: "inherit" }}
              placeholder="Say something..."
              value={roomChatInput}
              onChange={e => setRoomChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") sendRoomMessage(); }}
            />
            <Btn onClick={sendRoomMessage}>Send</Btn>
          </div>
        </Panel>

        {/* Private messages — one tab per person (shared with the lobby) */}
        <PrivateChatPanel style={{ height: isNarrow ? 360 : undefined }} />
      </div>
      <PmToast />
        <RestartBanner />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/log" element={<StationLog />} />
      <Route path="/admin/palettes" element={<PaletteStats />} />
      <Route path="/leaderboard" element={<SkyLeaderboard />} />
      <Route path="/rules" element={<HouseRules />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/passenger/:name" element={<PassengerPage />} />
      <Route path="/room/:id" element={<Room />} />
    </Routes>
  );
}
