import { useEffect, useLayoutEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import { Routes, Route, useParams, useNavigate, useLocation } from "react-router-dom";
import { fetchHealth, createRoom, joinRoom, startRound, submitAcro, castVote, getAuth, doneVoting, API_URL, topicGo, kickVote, fetchPassenger, searchPassengers } from "./services/api";
import { useSignalR } from "./hooks/useSignalR";
import { useLobbyHub } from "./hooks/useLobbyHub";
import { usePm, openPm, closePm, sendPm, setPmDraft, dismissPmToast, setPmChime } from "./pm";
import { playTheme, THEME_LIST, unlockAudio, playHonk, playWhistle } from "./themes";

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
    name: "Midnight", gold: "#F2D49B",   // its own gold (2026-10-27)
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
  ember: {  // Last Light (was Ember, renamed 2026-10-18). Redone 2026-10-24 after Damon's 90s "Sound Corner" reference
           // (Habbo/Parego style): chocolate brown, warmer brown boxes with thin orange outlines, hot orange, cream
           // headings, tan labels, amber like the equaliser bars, and soft diagonal light beams behind everything. The brights
           // pushed up the same day (Damon: "undertoned compared to the Skyscraper theme")
    name: "Last Light", gold: "#FFD27A",   // its own gold (2026-10-27)
    bgApp: "#3A2517", bgPanel: "#5B3920", bgPanel2: "#66412A", border: "#E36A1E",
    textPrimary: "#FFF1D6", textSecond: "#F7C68A", textMuted: "#E0A866",
    brand: "#FF7300", brandHover: "#FF8C26", onBrand: "#2E1C10",
    teal: "#FFB21A", tealLight: "#FFC54D", lavender: "#F2DDB4", ivory: "#FFF1D6",
    success: "#BFD46E", navy2: "#4A2E1B", navy3: "#55351F",
    bgGradient: "linear-gradient(180deg, #3E2819 0%, #33200F 100%)",
    danger: "#B2391F", dangerHover: "#C9492B",
    fieldLine: "#B5662C", focusLine: "#FF7300",
    // the light beams: wide, faint, slanting wedges, like the rays behind the reference's keyboard
    pattern: svgPattern(900, 900, "<g fill='#c47a3e'><polygon points='120,0 260,0 -40,900 -180,900' fill-opacity='0.07'/><polygon points='430,0 520,0 300,900 210,900' fill-opacity='0.05'/><polygon points='700,0 860,0 700,900 540,900' fill-opacity='0.06'/></g>"),
    patternSize: "900px 900px", patternAttach: "fixed",
    letterShadow: "3px 3px 0px rgba(0,0,0,0.45)",
  },
  neon: {  // Neon — synthwave: hot pink letters, electric cyan, neon yellow, faint sparkles
    name: "Neon", gold: "#FFE45E",   // its own gold (2026-10-27)
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
    name: "Phosphor", gold: "#E6FF9E",   // its own gold (2026-10-27)
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
    goldMetal: "linear-gradient(180deg, #B8860B 0%, #8C6400 48%, #6B4A00 56%, #A87A10 100%)",
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
    name: "Nightfall", gold: "#E3C878",   // its own gold (2026-10-27)
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
    name: "Daybreak", gold: "#FFD7A8",   // its own gold (2026-10-27)
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
    name: "Golden Hour", gold: "#FFD99E",   // its own gold (2026-10-27)
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
    name: "High Noon", gold: "#FFC170",   // its own gold (2026-10-27)
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
    name: "Dusk", gold: "#FFD59A",   // its own gold (2026-10-27)
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
    name: "Grey Morning", gold: "#F2C94C",   // its own gold (2026-10-27)
    bgApp: "#56636F", bgPanel: "#263039", bgPanel2: "#2E3944", border: "#5A6A7A",
    textPrimary: "#F4F6F8", textSecond: "#DCE2E8", textMuted: "#B4BEC8", bgText: "#F4F6F8",
    brand: "#F2C94C", brandHover: "#F6D670", onBrand: "#263039",
    teal: "#7FD1C7", tealLight: "#A3E0D8", lavender: "#C9C2F0", ivory: "#FFF3D6",
    success: "#8BD3A0", navy2: "#34414D", navy3: "#3C4A58",
    bgGradient: "linear-gradient(#7D8B99, #7D8B99)",   // flat: the page stays mid-grey
    danger: "#A8455A", dangerHover: "#BC566B",
    fieldLine: "#5A6A7A", focusLine: "#F2C94C",
  },
  meadow: {  // Afternoon (was Meadow). Redone 2026-10-24 from Damon's Grand Sky Station picture (nobody used the old green
             // one). Third try the same day ("looks like Daybreak … fog everywhere, the contrast is too little"): its own
             // look from the picture's sunset — a deep blue sky sliding into a strong pink and orange glow, deep
             // indigo-violet boxes like the station's shadowed towers (darker than the sky, not navy-heavy), peach-orange
             // titles like the sunset, warm gold buttons like the loading bar, cream text like the logo. Then warmer (Damon: "too
             // cold"): more sunset than blue in the sky, warm plum boxes, dusty rose lines
    name: "Afternoon", gold: "#FFD57E",   // its own gold (2026-10-27)
    bgApp: "#7E5A9A", bgPanel: "#4E3366", bgPanel2: "#5A3C72", border: "#C08AAE",
    textPrimary: "#FFF5DE", textSecond: "#F4DDE8", textMuted: "#E0BFD2", bgText: "#FFF5DE",
    brand: "#FFC85C", brandHover: "#FFD57E", onBrand: "#3A2450",
    teal: "#FFAE7A", tealLight: "#FFC59E", lavender: "#D5C2FF", ivory: "#FFF1C4",
    success: "#9FE0B0", navy2: "#5E4078", navy3: "#6A4884",
    bgGradient: "linear-gradient(180deg, #4A64B4 0%, #8C84CA 24%, #D592BC 50%, #F5A58E 76%, #FFBF78 100%)",
    pattern: "none",
    danger: "#C2414B", dangerHover: "#D4525C",
    fieldLine: "#C08AAE", focusLine: "#FFC85C",
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
    // No palette chosen yet (2026-10-22, Damon: the default "should be something visually beautiful"; he picked Golden
    // Hour): brand-new visitors get Golden Hour; someone who has logged in here before keeps Midnight, the old default,
    // so a regular's screen doesn't suddenly change. Remembered, so it stays put afterwards.
    if (!k) {
      k = localStorage.getItem("acro.auth") ? "midnight" : "goldenhour";
      try { localStorage.setItem("acro.theme", k); } catch { /* private mode */ }
    }
    if (k === "lamplight") k = "nightfall";   // the green palette's old name — keep the player's choice
    // Palettes retired on 2026-10-16 → the nearest new one, so nobody's choice is lost
    // and on 2026-10-18 (Notebook, Blueprint, Marigold retired; bluehour went to Blueprint, now to Lagoon)
    k = { twilight: "neon", moonrise: "neon", afterglow: "ember", bluehour: "lagoon", aurora: "midnight",
          notebook: "sakura", paperticket: "sakura", blueprint: "lagoon", marigold: "goldenhour" }[k] || k;   // Paper Ticket → First Light (both light)
    return THEMES[k] ? k : "goldenhour";
  } catch { return "goldenhour"; }
}
// The big letters in Honk: their outline (and the square Honk draws behind each letter) is painted in the
// exact colour of the sky behind them, so it disappears into the page (Damon, 2026-10-18). The sky is a
// gradient fixed to the window (index.css), so its colour depends on how far down the letters are: the train
// page measures that (0 = top of the window, 1 = bottom) and calls setBigLetterSky.
let currentTheme = null;     // the palette in use (set by applyTheme)
let currentThemeKey = "midnight";   // its key, for palette names
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
// Writes the big letters' palette: fill = the letters colour, outline = the sky at "spot". Its name carries the
// sky colour and palette ("--acro-big-<key>-<hex>") and is chosen through the CSS variable --fp-big, so the browser
// repaints when it changes (it keeps an old palette on text already on screen if only the rule changes).
function setBigLetterSky(spot) {
  bigLetterSpot = Math.min(1, Math.max(0, spot));
  const t = currentTheme; if (!t) return;
  const sky = skyColorAt(t, bigLetterSpot);
  let tag = document.getElementById("acro-big-palette");
  if (!tag) { tag = document.createElement("style"); tag.id = "acro-big-palette"; document.head.appendChild(tag); }
  const name = `--acro-big-${currentThemeKey}-${sky.slice(1)}`;
  const rule = `@font-palette-values ${name} { font-family: 'Honk'; override-colors: ${[sky, sky, t.brand, t.brand, t.brand, t.brand, t.brand, t.brand].map((c, i) => `${i} ${c}`).join(", ")}; }`;
  if (tag.textContent !== rule) {   // only when the colour changed (this runs on every render)
    tag.textContent = rule;
    document.documentElement.style.setProperty("--fp-big", name);
  }
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
  // The page's background, remembered for the very first frame of the next visit: index.html paints it before the
  // game's code has loaded, so a refresh doesn't blink in the default dark colours first (2026-10-22)
  try { localStorage.setItem("acro.splash", JSON.stringify({ bgApp: t.bgApp, bgGradient: t.bgGradient, pattern: t.pattern || null, patternSize: t.patternSize || null, patternAttach: t.patternAttach || null })); } catch { /* private mode */ }
  // Quiet text on the page background (the tagline): the palette's own bgText, otherwise textMuted as before
  root.style.setProperty("--c-bgText", t.bgText || t.textMuted);
  // Gold (golden names, the next train, the crown, hints): each palette's own (2026-10-27, Damon: the one bright
  // yellow didn't match most palettes); darker on the light one so it stays readable
  root.style.setProperty("--c-gold", t.gold || "#FFD24A");
  // Metallic gold for golden names (Damon, 2026-10-20, option B): light at the top, darker in the middle, like a
  // coin. The light palette (a "gold" of its own) gets a darker metal so the name stays readable.
  // Made from the palette's own gold: lighter at the top, a darker band, light again (the light palette has its own)
  const g = t.gold || "#FFD24A";
  root.style.setProperty("--c-goldMetal", t.goldMetal ||
    `linear-gradient(180deg, color-mix(in srgb, ${g} 45%, white) 0%, ${g} 45%, color-mix(in srgb, ${g} 72%, black) 56%, color-mix(in srgb, ${g} 80%, white) 100%)`);
  // Honk's colours. Honk is a colour font with 8 colours of its own: 0 = drop shadow, 1 = outline and inner lines,
  // 2–7 = the fill from top to bottom. We repaint them in the palette's colours. Each Express Colors palette has
  // its OWN Honk palettes (named "--acro-logo-<key>" …), chosen through CSS variables (--fp-logo …): switching
  // palettes then switches to different Honk palettes and the browser repaints everything (2026-10-19 — with one
  // shared name it kept the old colours on text already on screen, e.g. the private chat).
  let logoStyle = document.getElementById("acro-logo-palette");
  if (!logoStyle) { logoStyle = document.createElement("style"); logoStyle.id = "acro-logo-palette"; document.head.appendChild(logoStyle); }
  // Four Honk palettes per Express Colors palette, outline + shadow = the box colour:
  //   logo    titles and the timer (accent fill)        mark  the "Acro Express" logo (the button colour, Damon)
  //   letters train name, timer's last 10 s (letters)   gold  golden names (afool)
  const honkPalette = (name, fill) => `@font-palette-values ${name}-${key} { font-family: 'Honk'; override-colors: ${[t.bgPanel, t.bgPanel, fill, fill, fill, fill, fill, fill].map((c, i) => `${i} ${c}`).join(", ")}; }`;
  // The logo in the button colour on every palette (Damon, 2026-10-19; Midnight first, then all)
  root.style.setProperty("--c-logo", t.brand);
  // dark: Honk on the button colour (START): dark letters, their shadow and inner lines in the button colour, so the
  // shapes stay crisp (with the box colour they melted into a dark smudge, 2026-10-24)
  const darkHonk = `@font-palette-values --acro-dark-${key} { font-family: 'Honk'; override-colors: ${[t.brand, t.brand, t.onBrand, t.onBrand, t.onBrand, t.onBrand, t.onBrand, t.onBrand].map((c, i) => `${i} ${c}`).join(", ")}; }`;
  logoStyle.textContent = [honkPalette("--acro-logo", t.teal), honkPalette("--acro-mark", t.brand), honkPalette("--acro-letters", t.brand), honkPalette("--acro-gold", t.gold || "#FFD24A"), darkHonk].join("\n");   // dark: Honk on the gold button
  for (const p of ["logo", "mark", "letters", "gold", "dark"]) root.style.setProperty(`--fp-${p}`, `--acro-${p}-${key}`);   // which ones are in use
  // the topic desk's picture: Golden Hour shows its own colours, every other palette tints it (2026-10-24)
  root.style.setProperty("--art-tint", key === "goldenhour" ? "0" : "0.9");
  // top and bottom of the tint: lavender into the main colour; Afternoon one plum all over (its gold at the bottom
  // looked strange, Damon)
  root.style.setProperty("--art-top", key === "meadow" ? t.bgApp : t.lavender);
  root.style.setProperty("--art-bottom", key === "meadow" ? t.bgApp : t.brand);
  currentThemeKey = key;
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
//   --tf-scale / --tf-lh  the same for the timer: its numbers as tall as the original timer's (Segoe UI bold), measured
//                         2026-10-21 (Damon: "Honk seems too small … Pixel is too big"): digits at 100px are 72px
//                         tall in Segoe UI, 59 in Honk (×1.22), 74 in Trueno (×0.97), 73 in Nunito ExtraBold (×0.99), 75 in Righteous (×0.96)
// Trueno = Trueno SemiBold (2026-10-22, replacing Titan One; Damon: "Trueno Semi Bold kicks ass"); Nunito = Nunito
// ExtraBold and Righteous (2026-10-22, replacing Russo One: "Russo and Trueno too similar"). (Pixel = Press Start 2P,
// Titan One and Russo One were tried and dropped: a saved choice of theirs falls back to Bowlby.)
// Measured at 100px against Bowlby's capitals (76) and Segoe UI's digits (72): family, letter size, timer size, weight
const EXTRA_FONTS = {
  trueno: { fam: "'Trueno'", lf: 1.07, tf: 0.97, w: 400 },        // capitals 71, digits 74
  nunito: { fam: "'Nunito'", lf: 1.055, tf: 0.99, w: 800 },       // capitals 72, digits 73
  righteous: { fam: "'Righteous'", lf: 1.07, tf: 0.96, w: 400 },  // capitals 71, digits 75
  // 2026-10-22 (Damon: "Direction is Barrio, but it's not the one. Add Bricolage Grotesque and Dela Gothic One")
  // 2026-10-24 (Damon): Goldman Bold replaces Bricolage Grotesque. Capitals 59, digits 59 (×1.29 / ×1.22 would match),
  // but it is wide: 1.15 keeps a 7-letter station from getting much wider than Bowlby's
  goldman: { fam: "'Goldman'", lf: 1.15, tf: 1.15, w: 700 },
  // 2026-10-24 (Damon): Michroma replaces Dela Gothic One. Capitals 75, digits 77 — but 35% wider than Bowlby, so its
  // letters are a little smaller (0.9) to keep a 7-letter station about as wide
  michroma: { fam: "'Michroma'", lf: 0.9, tf: 0.94, w: 400 },
};
const LETTER_FONTS = { bowlby: "Bowlby", honk: "Honk", trueno: "Trueno", nunito: "Nunito", righteous: "Righteous", goldman: "Goldman", michroma: "Michroma" };   // key → name shown in the menu
// No choice yet (2026-10-22, Damon: "I think Honk"): brand-new players get Honk; someone who has logged in here before
// keeps Bowlby, the old default, so a regular's letters don't suddenly change. (A saved choice that no longer exists,
// like "pixel" or "titan", goes back to Bowlby.)
function loadLetterFont() {
  try {
    const k = localStorage.getItem("acro.letterFont");
    if (!k) {                                             // decided once, then remembered (so signing up later doesn't change it)
      const d = localStorage.getItem("acro.auth") ? "bowlby" : "honk";
      localStorage.setItem("acro.letterFont", d);
      return d;
    }
    return LETTER_FONTS[k] ? k : "bowlby";
  } catch { return "honk"; }
}
function applyLetterFont(key) {
  const root = document.documentElement.style;
  if (key === "honk") {
    root.setProperty("--lf-family", "'Honk', 'Bowlby One SC', serif");
    root.setProperty("--lf-shadow", "none");
    root.setProperty("--tf-family", "'Honk', " + NUM_FONT);
    root.setProperty("--tf-weight", "400");   // Honk has one weight; bold would be faked and smudgy
    root.setProperty("--tf-scale", "1.4");     // 1.22 matched by measurement, but looked "too small" (Damon, 2026-10-22)
    root.setProperty("--tf-lh", "0.714");     // 1 ÷ 1.4: the timer line keeps its height, nothing below moves
    root.setProperty("--lf-scale", "1.55");   // Honk's capitals are smaller: 1.4× matched Bowlby; 1.55× = "a bit bigger" (Damon, 2026-10-20)
    root.setProperty("--lf-lh", "0.645");     // …in the same height (1 ÷ 1.55), so nothing below moves
  } else if (EXTRA_FONTS[key]) {
    const { fam, lf, tf, w } = EXTRA_FONTS[key];   // measured, see above
    root.setProperty("--lf-family", fam + ", 'Bowlby One SC', sans-serif");
    root.setProperty("--lf-weight", String(w));
    root.setProperty("--lf-shadow", "var(--c-letterShadow)");   // the palette's shadow, as with Bowlby
    root.setProperty("--tf-family", fam + ", " + NUM_FONT);
    root.setProperty("--tf-weight", String(w));   // the weight we have; a bolder one would be faked
    root.setProperty("--lf-scale", String(lf));
    root.setProperty("--lf-lh", (1 / lf).toFixed(3));   // the same line height, so nothing below moves
    root.setProperty("--tf-scale", String(tf));
    root.setProperty("--tf-lh", (1 / tf).toFixed(3));
  } else {   // Bowlby: the original look (the variables are removed, so every style uses its own fallback)
    for (const v of ["--lf-family", "--lf-weight", "--lf-shadow", "--tf-family", "--tf-weight", "--lf-scale", "--lf-lh", "--tf-scale", "--tf-lh"]) root.removeProperty(v);
    // …except the timer, a little smaller with Bowlby (Damon, 2026-10-22: "too big for the Bowlby font")
    root.setProperty("--tf-scale", "0.88");
    root.setProperty("--tf-lh", "1.136");     // 1 ÷ 0.88
  }
  try { localStorage.setItem("acro.letterFont", key); } catch { /* private mode: just not remembered */ }
  window.dispatchEvent(new CustomEvent("acro-letterfont", { detail: key }));   // the Colors menu shows the new choice
}
// Clicking the big letters switches to the next font (Damon, 2026-10-20: "a faster way to switch fonts")
function cycleLetterFont() {
  const keys = Object.keys(LETTER_FONTS), cur = loadLetterFont();
  applyLetterFont(keys[(keys.indexOf(cur) + 1) % keys.length]);
}

// ── Sound settings ─────────────────────────────────────────────
// One switch and one volume for all game sounds (song, second tune, drumroll), saved in the
// browser. Applied as a volume factor on top of the game's own fades — the game's own "muted"
// (the song plays silently after you submit) is left alone.
function loadSound() {
  try {
    const s = JSON.parse(localStorage.getItem("acro.sound") || "null");
    // buttons (2026-10-20): hover and click sounds on buttons; on unless the player switched them off
    if (s && typeof s.on === "boolean" && typeof s.volume === "number") return { buttons: true, music: "classic", ...s };
  } catch { /* ignore */ }
  return { on: true, volume: 1, buttons: true, music: "classic" };   // default: sound on, full volume, button sounds on, the original song
}
let soundSettings = loadSound();
// The factor every game sound is multiplied by (0 = silent)
function soundGain() { return soundSettings.on ? soundSettings.volume : 0; }
// Music choices for the writing time: the original song, then the themes made in the browser that are offered to
// players (themes.js marks the kept-back ones offline)
const MUSIC_CHOICES = [{ id: "classic", name: "Original" }, ...THEME_LIST.filter(th => !th.offline).map(th => ({ id: th.id, name: th.name }))];
// Stands in for the song's Audio element: the game only pauses it, mutes it (after you submit) and sets its volume
function themeAudio() {
  let player = null, muted = false, volume = 1, stopped = false;
  const apply = () => player?.setLevel(muted ? 0 : volume);
  return {
    attach(p) { player = p; if (stopped) p?.stop(); else apply(); },
    pause() { stopped = true; player?.stop(); },
    get muted() { return muted; }, set muted(m) { muted = m; apply(); },
    get volume() { return volume; }, set volume(v) { volume = v; apply(); },
  };
}
// The main theme while acros are written plays softer than the rest (Damon, 2026-10-20: "not so loud"; the newer
// sounds are more discreet): 55% of the player's volume
const THEME_LEVEL = 0.55;

// ── Final Stop celebration (Damon, 2026-10-20) ────────────────
// A short, bright fanfare made in the browser (no audio file): an arpeggio up, a chord, a little "ta-da".
// Not loud (14% before the player's own volume: 12% was too quiet, 20% too loud), silent when Sound is off. No high
// "sparkle" notes on top any more (Damon: "a bit too pitchy").
function playFanfare() {
  const g = soundGain();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!g || !AC) return;
  try {
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.14 * g;   // 20% was "a bit more loud than I would like" (Damon, 2026-10-20)
    master.connect(ctx.destination);
    const note = (at, freq, dur, type = "triangle", vol = 1) => {
      const o = ctx.createOscillator(), e = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      const t = ctx.currentTime + at;
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(e); e.connect(master); o.start(t); o.stop(t + dur + 0.05);
    };
    const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
    [[0, C5], [0.11, E5], [0.22, G5]].forEach(([at, f]) => note(at, f, 0.18));          // arpeggio up
    [C5, E5, G5, C6].forEach(f => note(0.34, f, 0.7, "triangle", 0.6));                 // the chord
    note(0.95, G5, 0.16); note(1.1, C6, 0.9);                                           // ta-da
    setTimeout(() => ctx.close().catch(() => { }), 3000);
  } catch { /* no sound is fine */ }
}

// Confetti over the whole page for about 6 seconds: a burst from the middle, then paper drifting down, in the
// palette's own colours. Skipped when the device asks for reduced motion.
function Confetti() {
  const ref = useRef(null);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    const css = getComputedStyle(document.documentElement);
    const colors = ["--c-brand", "--c-teal", "--c-gold", "--c-lavender", "--c-ivory", "--c-success"]
      .map(v => css.getPropertyValue(v).trim()).filter(Boolean);
    const resize = () => { cv.width = window.innerWidth; cv.height = window.innerHeight; };
    resize(); window.addEventListener("resize", resize);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const piece = (x, y, vx, vy) => ({ x, y, vx, vy, w: rnd(6, 11), h: rnd(9, 16), a: rnd(0, 6.3), va: rnd(-0.2, 0.2), sway: rnd(0, 6.3), c: colors[Math.floor(Math.random() * colors.length)] });
    const W = cv.width, H = cv.height;
    const parts = [
      ...Array.from({ length: 90 }, () => piece(W / 2 + rnd(-40, 40), H * 0.42, rnd(-7, 7), rnd(-11, -3))),   // the burst
      ...Array.from({ length: 140 }, () => piece(rnd(0, W), rnd(-H * 0.8, -10), rnd(-1, 1), rnd(1.5, 3.5))),  // paper rain
    ];
    const start = performance.now();
    let raf;
    const step = now => {
      const t = now - start;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalAlpha = t > 4800 ? Math.max(0, 1 - (t - 4800) / 1200) : 1;   // fade out at the end
      for (const p of parts) {
        p.vy = Math.min(p.vy + 0.12, 4.2);
        p.vx *= 0.985;
        p.x += p.vx + Math.sin(t / 350 + p.sway) * 0.7;
        p.y += p.vy;
        p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.scale(1, Math.cos(p.a * 1.7));
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < 6000) raf = requestAnimationFrame(step); else ctx.clearRect(0, 0, cv.width, cv.height);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} aria-hidden="true" style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 75 }} />;
}

// "A", "A and B", "A, B and C"
const listNames = names => names.length < 2 ? (names[0] || "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// A random winner line for the Final Stop; a tie at the top gets its own lines (Damon: still celebrate, a smart line)
function finalStopMessage(names) {
  const winner = names[0], all = listNames(names);
  const one = [
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
    `🎟️ One ticket to glory, stamped and claimed by ${winner}.`,
  ];
  const tie = [
    `📸 A photo finish: ${all} share the winner's platform.`,
    `🚉 Two trains, one platform: ${all} pull in side by side.`,
    `⚖️ The judges checked the tape twice. ${all} are joint champions.`,
    `🎟️ One ticket to glory, split ${names.length} ways: ${all}.`,
    `🔔 Attention passengers: we have a tie. ${all} share the crown.`,
    `👑 Not enough crowns to go round, so ${all} will have to share.`,
    `🤝 Same score, same glory: ${all} win together.`,
  ];
  const pool = names.length > 1 ? tie : one;
  return pool[Math.floor(Math.random() * pool.length)];
}

// The Final Stop: the winner's name like the logo of the palette (Damon, 2026-10-20: Honk in the logo's colours),
// co-winners side by side, the winner line, and a last line (the countdown on a train; a note in the admin preview).
// No box around it (Damon): it sits on the page background, so all text uses the colours made for that
// background: the logo's for the names; the main text colour with a halo in the background colour for the rest.
function FinalStopPanel({ names, message, children }) {
  // A soft halo in the palette's background colour keeps the lines readable over a sky gradient (Daybreak)
  const halo = { color: C.textPrimary, textShadow: "0 0 6px var(--c-bgApp), 0 0 12px var(--c-bgApp), 0 1px 2px var(--c-bgApp)" };
  return (
    <div style={{ padding: "6px 16px 14px", textAlign: "center" }}>
      <p style={{ margin: "0 0 6px", fontSize: 13, ...halo, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 700 }}>
        Final Stop
      </p>
      <div aria-hidden="true" style={{ fontSize: 34, lineHeight: 1 }}>👑</div>
      <h2 style={{ margin: "2px 0 8px", display: "flex", justifyContent: "center", alignItems: "baseline", flexWrap: "wrap", gap: "0 18px", fontWeight: 400 }}>
        {names.map((n, i, arr) => (
          <span key={n} style={{ display: "inline-flex", alignItems: "baseline", gap: 18 }}>
            <span style={{ ...honkTitle, color: "var(--c-logo)", fontPalette: "var(--fp-mark)", fontSize: arr.length > 1 ? 56 : 76, lineHeight: 1.05, overflowWrap: "anywhere" }}>{n}</span>
            {i < arr.length - 1 && <span style={{ fontSize: 30, ...halo }}>&amp;</span>}
          </span>
        ))}
      </h2>
      <p style={{ margin: "0 0 8px", fontSize: 19, ...halo, fontStyle: "italic", fontWeight: 600 }}>{message}</p>
      <p style={{ margin: 0, fontSize: 15, ...halo }}>{children}</p>
    </div>
  );
}

// The original song as a station plays it (to compare loudness on the admin page, Damon 2026-10-20): the game's level
// (THEME_LEVEL × the Music volume), starting at the point that makes its ending land on 0
function playOriginal(secs) {
  const a = new Audio("/AcroExpress_tunes.m4a");
  a.volume = Math.min(1, THEME_LEVEL * soundGain());
  const SONG_SECONDS = 91.9;
  a.currentTime = Math.max(0, SONG_SECONDS - secs);
  a.play().catch(() => { });
  return { endsAt: Date.now() + secs * 1000, stop() { a.pause(); } };
}

// Admin only (Damon, 2026-10-20): listen to the three new writing themes (src/themes.js) before players get a
// choice. Plays a whole station on this screen only, at the level the game uses for its theme, with a countdown.
function ThemeListening() {
  const [secs, setSecs] = useState(56);
  const [playing, setPlaying] = useState(null);   // { id, name, endsAt }
  const [left, setLeft] = useState(0);
  const playerRef = useRef(null);
  useEffect(() => () => playerRef.current?.stop(), []);
  useEffect(() => {
    if (!playing || playing.loading) return;
    const iv = setInterval(() => {
      const l = Math.max(0, Math.ceil((playing.endsAt - Date.now()) / 1000));
      setLeft(l);
      if (l <= 0) { clearInterval(iv); setTimeout(() => setPlaying(null), 2500); }
    }, 200);
    return () => clearInterval(iv);
  }, [playing]);
  // A theme on recorded instruments loads its samples first ("Loading…"); a newer click wins
  const playToken = useRef(0);
  const play = async th => {
    playerRef.current?.stop(); playerRef.current = null;
    const token = ++playToken.current;
    setPlaying({ ...th, loading: true }); setLeft(secs);
    let pl = null;
    try { pl = th.id === "original" ? playOriginal(secs) : await playTheme(th.id, secs, THEME_LEVEL * soundGain()); } catch (e) { console.error(e); }
    if (token !== playToken.current) { pl?.stop(); return; }
    playerRef.current = pl;
    setPlaying(pl ? { ...th, endsAt: pl.endsAt } : null);
  };
  const stop = () => { playerRef.current?.stop(); playerRef.current = null; setPlaying(null); };
  return (
    <Panel style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 17 }}>Listen to the songs</div>
        <div style={{ fontSize: 14, color: C.textMuted }}>A whole station of music, on your screen only, at the game's music level. It builds up as the time runs out and ends exactly at 0.{soundGain() <= 0 ? " Your Music is off: turn it on to listen." : ""}</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, color: C.textSecond }}>Station length</span>
        {[56, 70, 84].map(n => (   // the real station lengths (3, 5 and 7 letters)
          <button key={n} onClick={() => setSecs(n)}
            style={{ background: n === secs ? C.brand : C.bgPanel2, color: n === secs ? C.onBrand : C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>{n} s</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn onClick={() => play({ id: "original", name: "Original" })}>▶ Original</Btn>
        {/* only the songs players can pick (Damon, 2026-10-22: the kept-back ones "are just cluttering the place") */}
        {THEME_LIST.filter(th => !th.offline).map(th => <Btn key={th.id} onClick={() => play(th)}>▶ {th.name}</Btn>)}
        {playing && <BtnSecondary onClick={stop}>Stop</BtnSecondary>}
      </div>
      {playing && (playing.loading
        ? <div style={{ fontSize: 15, color: C.textMuted }}>Loading <b>{playing.name}</b>…</div>
        : <div style={{ fontSize: 15 }}>Playing <b>{playing.name}</b> · <span style={{ fontVariantNumeric: "tabular-nums", color: C.teal, fontWeight: 700 }}>{left} s</span> left</div>)}
    </Panel>
  );
}

// Admin only (Damon, 2026-10-20: "I can't check" the Final Stop without a whole journey): plays the celebration —
// confetti, fanfare, the panel — on this screen only. Nothing is sent to anyone.
function FinalStopPreview() {
  const [show, setShow] = useState(null);   // { names, message, at }
  const play = names => { setShow({ names, message: finalStopMessage(names), at: Date.now() }); playFanfare(); };
  const others = ["Sandy", "Frantique", "thedebbied_1", "TylerDurden"];
  const pick = () => others[Math.floor(Math.random() * others.length)];
  return (
    <>
    <Panel style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 17 }}>Preview the Final Stop</div>
        <div style={{ fontSize: 14, color: C.textMuted }}>Plays the winner celebration on your screen only. The fanfare follows your Sound setting.</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn onClick={() => play([pick()])}>One winner</Btn>
        <BtnSecondary onClick={() => play(["Sandy", "Frantique"])}>A tie</BtnSecondary>
        {show && <BtnSecondary onClick={() => setShow(null)}>Close</BtnSecondary>}
      </div>
    </Panel>
    {/* On the page background, like on a train (no box around it) */}
    {show && <Confetti key={show.at} />}
    {show && <FinalStopPanel names={show.names} message={show.message}>Preview: only you see this.</FinalStopPanel>}
    </>
  );
}
// Saves new settings and tells the room to update the sounds that are playing now
function setSoundSettings(next) {
  soundSettings = next;
  try { localStorage.setItem("acro.sound", JSON.stringify(next)); } catch { /* ignore */ }
  window.dispatchEvent(new Event("acro-sound-change"));
}

// Chat commands (2026-10-22, from AcroChallenge — Damon picked /?, /me, /mu and /pc; /eject votes on a train).
// say(line) shows a line to you alone. Returns true when the text was a command (so it isn't sent as a message);
// /me and /eject name return false: /me is a message everyone sees, and the train handles /eject itself.
const CHAT_HELP = [
  "Commands:",
  "/me waves → shows \"* yourname waves\"",
  "/pc name message → a private message",
  "/mu → music on or off",
  "/eject name → vote someone off the train (on a train)",
  "/? → this list",
];
function chatCommand(text, say, inTrain) {
  if (!text.startsWith("/")) return false;
  const [, cmd = "", rest = ""] = text.match(/^\/(\S*)\s*([\s\S]*)$/) || [];
  const c = cmd.toLowerCase(), r = rest.trim();
  if (c === "?" || c === "help") { CHAT_HELP.forEach(say); return true; }
  if (c === "me") { if (r) return false; say("Type /me and what you do, e.g. /me waves"); return true; }
  if (c === "mu") {
    const next = { ...soundSettings, on: !soundSettings.on };
    setSoundSettings(next);
    say(next.on ? "🔊 Music on." : "🔇 Music off.");
    return true;
  }
  if (c === "pc" || c === "pm") {
    // "/pc Sandy Hello!" (or AcroChallenge's "/pc Sandy\Hello!")
    const m = r.match(/^@?([A-Za-z0-9_]{3,20})\s*[\\\s]\s*([\s\S]+)$/);
    if (!m) { say("Type /pc name message, e.g. /pc Sandy Hello!"); return true; }
    openPm(m[1]); sendPm(m[1], m[2].trim());   // the private chat opens, then shows the message (or the error)
    return true;
  }
  if (c === "kick") { say("It's /eject now: type /eject name to vote someone off the train."); return true; }
  if (c === "eject") {
    if (!inTrain) { say("/eject works on a train: it votes someone off it."); return true; }
    if (!r) { say("Type /eject name to vote someone off the train."); return true; }
    return false;
  }
  say("Type /? for a list of commands.");
  return true;
}
// "/me waves" is shown as "* Sandy waves"
const meAction = message => (/^\/me\s+/i.test(message || "") ? message.replace(/^\/me\s+/i, "") : null);

// A small header button that opens a menu underneath it (used by "Colors" and "Music").
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

// "Colors: Midnight ▾" (was "Express Colors", renamed by Damon 2026-10-20) — pick a palette; the page recolours at once (Damon: no settings page)
function ThemePicker() {
  const [current, setCurrent] = useState(loadThemeKey);
  return (
    <HeaderMenu label={<>Colors: <span style={{ color: C.teal, fontWeight: 600 }}>{THEMES[current].name}</span></>}>
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
        </>
      )}
    </HeaderMenu>
  );
}

// "Letters: Bowlby ▾" — the font of the big letters and the timer, on the trains only (2026-10-22, moved out of
// Colors: Damon, "it only affects things there"). Clicking the letters themselves still picks the next font.
function LetterFontPicker() {
  const [letterFont, setLetterFont] = useState(loadLetterFont);
  useEffect(() => {
    const on = e => setLetterFont(e.detail);
    window.addEventListener("acro-letterfont", on);                 // a click on the letters changes it too
    return () => window.removeEventListener("acro-letterfont", on);
  }, []);
  return (
    <HeaderMenu width={240} label={<>Letters: <span style={{ color: C.teal, fontWeight: 600, display: "inline-grid", textAlign: "left" }}>
      {/* every name sits in the same cell, hidden, so the button is always as wide as the longest one and nothing next to
          it moves when the font changes (Damon, 2026-10-22) */}
      {Object.values(LETTER_FONTS).map(n => <span key={n} aria-hidden style={{ gridArea: "1 / 1", visibility: "hidden" }}>{n}</span>)}
      <span style={{ gridArea: "1 / 1" }}>{LETTER_FONTS[letterFont]}</span></span></>}>
      {(close, big) => (
        <>
          <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 8 }}>The font of the Express Server letters and the timer. Only you see it. (Or just click the letters.)</div>
          {/* The big letters' font (and the timer's): Bowlby, Honk, Trueno, Nunito or Righteous. Each button shows "A X P" in its own font (2026-10-24, Damon: was B T V) */}
          {/* one font per row, stacked like the floors of a building (Damon, 2026-10-22: not columns) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(LETTER_FONTS).map(([key, name]) => {
              const active = key === letterFont;
              return (
                <button key={key} onClick={() => { applyLetterFont(key); setLetterFont(key); }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", background: active ? C.navy3 : "transparent", border: `1px solid ${active ? C.teal : C.border}`, borderRadius: 8, color: C.textPrimary, cursor: "pointer", fontFamily: "inherit", fontSize: big ? 16 : 14, padding: big ? "8px 12px" : "5px 10px" }}>
                  <span style={{
                    honk: { fontFamily: "'Honk', serif", fontSize: 20, color: C.brand, fontPalette: "var(--fp-big)", fontVariationSettings: "'SHLN' 0, 'MORF' 15" },
                    bowlby: { fontFamily: "'Bowlby One SC', serif", fontSize: 18, color: C.brand },
                    trueno: { fontFamily: "'Trueno', sans-serif", fontSize: 18, color: C.brand },
                    nunito: { fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 18, color: C.brand },
                    righteous: { fontFamily: "'Righteous', sans-serif", fontSize: 18, color: C.brand },
                    goldman: { fontFamily: "'Goldman', sans-serif", fontWeight: 700, fontSize: 20, color: C.brand },
                    michroma: { fontFamily: "'Michroma', sans-serif", fontSize: 15, color: C.brand },
                  }[key]}>A X P</span>
                  <span style={{ fontSize: 13, fontWeight: active ? 700 : 400 }}>{name}{active ? " ✓" : ""}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </HeaderMenu>
  );
}

// "Music: 70% ▾" (or "Music: Off"; was "Sound", renamed by Damon 2026-10-20) — music choice, volume slider and a Mute / Unmute button for all game sounds
// The sound settings, kept in step with every menu and the /mu command
function useSoundSettings() {
  const [st, setSt] = useState(soundSettings);
  useEffect(() => {
    const on = () => setSt(soundSettings);                           // e.g. typed /mu in the chat
    window.addEventListener("acro-sound-change", on);
    return () => window.removeEventListener("acro-sound-change", on);
  }, []);
  return [st, next => { setSoundSettings(next); setSt(next); }];
}

// "Song: Turbo ▾" — which music plays while acros are written (Damon, 2026-10-23: separate from the volume). As
// wide as the longest song name, so nothing next to it moves.
function SongPicker() {
  const [st, change] = useSoundSettings();
  const current = MUSIC_CHOICES.find(m => m.id === (st.music || "classic")) || MUSIC_CHOICES[0];
  return (
    <HeaderMenu width={210} label={<>Song: <span style={{ color: C.teal, fontWeight: 600, display: "inline-grid", textAlign: "left" }}>
      {MUSIC_CHOICES.map(m => <span key={m.id} aria-hidden style={{ gridArea: "1 / 1", visibility: "hidden" }}>{m.name}</span>)}
      <span style={{ gridArea: "1 / 1" }}>{current.name}</span></span></>}>
      {() => (
        <>
          <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 6 }}>Your music while you write. It switches at once.</div>
          {MUSIC_CHOICES.map(m => {
            const on = current.id === m.id;
            return (
              <button key={m.id} onClick={() => change({ ...st, music: m.id })} aria-pressed={on}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: on ? C.navy3 : "transparent", border: "none", borderRadius: 6, color: C.textPrimary, cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: "5px 8px", textAlign: "left" }}>
                <span style={{ flex: 1, fontWeight: on ? 700 : 400 }}>{m.name}</span>
                {on && <span style={{ color: C.teal }}>✓</span>}
              </button>
            );
          })}
        </>
      )}
    </HeaderMenu>
  );
}

// "Volume: 70% ▾" (or "Volume: Off") — volume slider, Mute / Unmute for all game sounds, and the button sounds
function SoundControl() {
  const [st, change] = useSoundSettings();
  const pct = Math.round(st.volume * 100);
  return (
    <HeaderMenu width={210} label={<>Volume: <span style={{ color: C.teal, fontWeight: 600, display: "inline-grid", textAlign: "left" }}>
      {/* as wide as "100%" whatever it shows, so nothing next to it moves */}
      <span aria-hidden style={{ gridArea: "1 / 1", visibility: "hidden" }}>100%</span>
      <span style={{ gridArea: "1 / 1" }}>{st.on ? `${pct}%` : "Off"}</span></span></>}>
      {() => (
        <>
          <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 8 }}>Music and sound effects</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="range" min="0" max="100" step="5" value={pct} aria-label="Volume"
              onChange={e => change({ ...st, on: true, volume: Number(e.target.value) / 100 })}
              style={{ flex: 1, accentColor: "var(--c-teal)" }} />
            <span style={{ color: C.textSecond, fontSize: 13, width: 36, textAlign: "right" }}>{pct}%</span>
          </div>
          <button onClick={() => change({ ...st, on: !st.on })}
            style={{ marginTop: 10, width: "100%", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.textPrimary, cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: "5px 8px" }}>
            {st.on ? "Mute" : "Unmute"}
          </button>
          {/* Button sounds on their own switch: some players want the music without the clicks */}
          <button onClick={() => change({ ...st, buttons: st.buttons === false })} aria-pressed={st.buttons !== false}
            style={{ marginTop: 6, width: "100%", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: C.textPrimary, cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: "5px 8px" }}>
            Button sounds: <b style={{ color: st.buttons === false ? C.textMuted : C.teal }}>{st.buttons === false ? "Off" : "On"}</b>
          </button>
        </>
      )}
    </HeaderMenu>
  );
}

// A one-time hint under the header's menus (Damon, 2026-10-23: "I always have to explain about the colors and the
// music"): once per browser, until "Got it". Placed inside the menus' row (position: relative), it hangs right
// under them however they wrap; side: which end of the row it lines up with
function CustomizeHint({ side = "right" }) {
  const [show, setShow] = useState(() => { try { return !localStorage.getItem("acro.hint.customize"); } catch { return false; } });
  if (!show) return null;
  const done = () => { try { localStorage.setItem("acro.hint.customize", "1"); } catch { /* private mode */ } setShow(false); };
  return (
    <div role="note" style={{ position: "absolute", top: "calc(100% + 12px)", [side]: 0, width: 300, textAlign: "left", zIndex: 80, maxWidth: 300, background: C.brand, color: C.onBrand, borderRadius: 12, padding: "10px 14px", boxShadow: "0 10px 30px rgba(0,0,0,0.4)", fontWeight: 700, fontSize: 15 }}>
      <div style={{ position: "absolute", top: -7, [side]: 40, width: 14, height: 14, background: C.brand, transform: "rotate(45deg)" }} />
      🎨 Make it yours: pick your colors, letters and song up here.
      <div style={{ textAlign: "right", marginTop: 6 }}>
        <button onClick={done} style={{ background: C.onBrand, color: C.brand, border: "none", borderRadius: 999, padding: "3px 12px", fontFamily: "inherit", fontWeight: 800, cursor: "pointer" }}>Got it</button>
      </div>
    </div>
  );
}

// ── Reusable styled components ─────────────────────────────────
const Panel = ({ children, style = {}, className = "" }) => (
  <div className={className} style={{ background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 12, ...style }}>
    {children}
  </div>
);

// Button text: Nunito, bold, normal text size on a small button — the same on every button (Damon 2026-10-19:
// "either all the buttons Honk or not"; the station buttons were already Nunito). (Name kept from the Honk days.)
// (Damon: 27 was still too small for the frame). Less padding above and below keeps the buttons about as tall.
const honkButton = { fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 15, lineHeight: 1.2, padding: "8px 16px" };
const Btn = ({ children, onClick, color = C.brand, hoverColor = C.brandHover, style = {}, disabled = false }) => {
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
        ...honkButton,
        transition: "background 0.15s",
        ...style
      }}>
      {children}
    </button>
  );
};

// Countdowns always show two digits: 35 … 09 … 00 (Damon, 2026-10-24: "the 00 format. Everywhere like that")
const two = n => String(Math.max(0, Math.floor(Number(n) || 0))).padStart(2, "0");

// The acro bar (Damon, 2026-10-26): the box, the clock and Submit as one bar, segments in one frame like the
// leaderboard's This week / This month / All time; the frame takes the line colour (teal once the acro is in)
const acroBar = line => ({ display: "flex", alignItems: "stretch", border: `2px solid ${line}`, borderRadius: 10, overflow: "hidden", background: C.bgPanel });
const acroField = { flex: 1, minWidth: 0, background: "transparent", border: "none", borderRadius: 0, outline: "none", color: C.textPrimary, fontFamily: "inherit", textAlign: "center" };
const acroClock = { display: "flex", alignItems: "center", justifyContent: "center", borderLeft: `1px solid ${C.border}`, fontWeight: "var(--tf-weight, 700)", lineHeight: "var(--tf-lh, 1)", fontVariationSettings: "'SHLN' 0, 'MORF' 15", fontVariantNumeric: "tabular-nums" };
const acroButton = { borderRadius: 0, fontSize: 18, justifyContent: "center", border: "none" };

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
        ...honkButton,
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

// ── Button sounds (Damon, 2026-10-20) ─────────────────────────
// Made in the browser (no files), silent when Sound or Button sounds is off. Hover only with a real mouse (not on
// phones), at most one every 60 ms, and only when the pointer enters a new button. Every <button> and every
// clickable name (role="button") gets them; disabled buttons stay silent. The browser allows sound only after the
// first click, so hovers before that are silent. (Tried and dropped: bright "tick/pop" tones — "like a bell ring";
// filtered-noise taps — "crisp, like autumn leaves"; smooth sine styles Velvet/Bubble/Hum — "not even close"; then
// Damon tuned the hover himself on an admin mixer.)
// A pure sine tone that fades in gently (no hard start) and out again; notes = [from, to] pitches in Hz.
function uiSoft(notes, attack, dur, vol) {
  const gain = soundSettings.buttons === false ? 0 : soundGain();
  if (gain <= 0) return;
  try {
    pmAudioCtx = pmAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = pmAudioCtx;
    if (ctx.state === "suspended") ctx.resume().catch(() => { });
    const t = ctx.currentTime;
    for (const [from, to] of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(from, t);
      if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * gain, t + attack);   // fades in: nothing crisp
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    }
  } catch { /* no sound available */ }
}
// The two-step triangle "pop" for clicks (the first version, which Damon liked best once it was quieter)
function uiPop(steps, vol) {
  const gain = soundSettings.buttons === false ? 0 : soundGain();
  if (gain <= 0) return;
  try {
    pmAudioCtx = pmAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = pmAudioCtx;
    if (ctx.state === "suspended") ctx.resume().catch(() => { });
    const t = ctx.currentTime;
    for (const [at, freq, dur] of steps) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(vol * gain, t + at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t + at); o.stop(t + at + dur + 0.02);
    }
  } catch { /* no sound available */ }
}
// Final choice (Damon, 2026-10-20): the click = the first version's pop ("I really like the sound of click … on
// production. Just less loud": 0.12 → 0.06); the hover = what he tuned on the admin mixer (150 Hz, 40 ms fade-in,
// 80 ms, volume 0.032 → hover = 90% pitch, 80% length, 40% volume): a very low, soft hum.
// Then lower again ("at least X2 lower": 0.06 → 0.025, hover 0.0128), then up a bit (2026-10-21, Damon: "barely
// heard right now"): about +4 dB each, still under the 0.06 that was too loud; then a bit more the same evening
// ("a bit louder": 0.04 → 0.052, hover 0.02 → 0.026, about +2.3 dB)
const playClickPop = () => uiPop([[0, 620, 0.07], [0.035, 930, 0.09]], 0.052);
const playHoverTick = () => uiSoft([[135, 132]], 0.04, 0.064, 0.026);

(function installButtonSounds() {
  if (typeof document === "undefined") return;
  const target = e => {
    const el = e.target instanceof Element ? e.target.closest('button, [role="button"]') : null;
    return el && !el.disabled && el.getAttribute("aria-disabled") !== "true" ? el : null;
  };
  const canHover = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
  let last = 0;
  if (canHover) document.addEventListener("mouseover", e => {
    const el = target(e);
    if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;   // still inside the same button
    const now = performance.now();
    if (now - last < 60) return;
    last = now;
    playHoverTick();
  }, true);
  document.addEventListener("pointerdown", e => { if (e.button === 0 && target(e)) playClickPop(); }, true);
  // Switch the music engine on at any click or key press (see unlockAudio in themes.js)
  document.addEventListener("pointerdown", unlockAudio, true);
  document.addEventListener("keydown", unlockAudio, true);
})();

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
        <Btn color={C.navy2} hoverColor={C.navy3} style={{ color: C.lavender, border: `1px solid ${C.lavender}` }} onClick={send}>Send</Btn>
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
  const fmt = d => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
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

// Golden names (Damon, 2026-10-18): afool joked his name should be gold. Since 2026-10-20: in chat lines only.
// 2026-10-22: moved to "Myself" (afool's new name, Damon); afool's own name is plain again.
// --c-gold is set per palette (a darker gold on the light First Light). goldName(name) = the extra style, or {}.
const GOLDEN_NAMES = ["myself"];
const isGolden = name => GOLDEN_NAMES.includes(String(name || "").toLowerCase());
// Metallic: the gold gradient painted inside the letters (--c-goldMetal); --c-gold stays the plain colour for
// places that can't take a gradient (the Sky Pass title's colour font)
const goldName = name => (isGolden(name) ? {
  backgroundImage: "var(--c-goldMetal)", WebkitBackgroundClip: "text", backgroundClip: "text",
  color: "var(--c-gold)", WebkitTextFillColor: "transparent", fontWeight: 700,
} : {});

// A player's name you can click. One rule everywhere (Damon asked for it clear, 2026-10-18; like Discord, Slack
// and Twitch): a click opens the player's Sky Passport card, whose main button is Message. Kicking is never a
// click: only "/eject name" in Sky Train Chat. ("profile" is kept for older calls; it no longer changes anything.)
function NameLink({ name, style, gold = false }) {   // gold: golden names in gold (chat lines only)
  if (!name) return <span style={style}>{name}</span>;
  const go = el => openProfile(name, el);
  return (
    <span role="button" tabIndex={0} title={`Message ${name} or see their Sky Passport`}
      onClick={e => { e.stopPropagation(); go(e.currentTarget); }}
      onKeyDown={e => { if (e.key === "Enter") go(e.currentTarget); }}
      style={{ cursor: "pointer", ...style, ...(gold ? goldName(name) : {}) }}>{name}</span>
  );
}

// "👥 Online 12 ▾" on a Sky Train: everyone online and where they are — at the Grand Sky Station or on
// which train. Click a name to message them. Refreshes every 15 s (api/online).
// Who's online and where (api/online): { station: [names], trains: [{ name, players }] }, every 15 s
function useOnlineNow() {
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
  return data;
}

// On a train, under the passengers: who's at the Grand Sky Station and on other trains, so you can message them in
// one click (Damon, 2026-10-23: "message someone in the Grand Sky Station while they are on a Journey … easily")
function ElsewhereList({ trainName }) {
  const data = useOnlineNow();
  const me = String(getAuth()?.username || "").toLowerCase();
  if (!data) return null;
  const groups = [["At the Grand Sky Station", data.station],
    ...data.trains.filter(t => t.name !== trainName).map(t => [`🚆 ${t.name}`, t.players])]
    .map(([title, names]) => [title, names.filter(n => n.toLowerCase() !== me)]).filter(([, names]) => names.length);
  if (!groups.length) return null;
  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
      {groups.map(([title, names]) => (
        <div key={title} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{title}</div>
          {names.map(n => (
            <button key={n} onClick={e => openProfile(n, e.currentTarget)} title={`Message ${n}`}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "transparent", border: "none", borderRadius: 6, padding: "3px 8px", color: C.textSecond, cursor: "pointer", fontFamily: "inherit", fontSize: 14, textAlign: "left" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}</span><span style={{ color: C.lavender }} aria-hidden>✉</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function OnlineButton() {
  const data = useOnlineNow();
  const me = String(getAuth()?.username || "").toLowerCase();
  const total = data ? new Set([...data.station, ...data.trains.flatMap(t => t.players)].map(n => n.toLowerCase())).size : null;
  const group = (title, names, close, big) => (
    <div key={title} style={{ marginBottom: 8 }}>
      <div style={{ color: C.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", margin: "6px 0 2px" }}>{title}</div>
      {names.length === 0 && <div style={{ color: C.textMuted, fontSize: 14, fontStyle: "italic" }}>Nobody</div>}
      {names.map(n => n.toLowerCase() === me ? (
        <div key={n} style={{ color: C.textSecond, fontSize: big ? 17 : 15, padding: big ? "8px 8px" : "3px 8px" }}>{n}</div>
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
const honkTitle = { fontFamily: "'Honk', Fredoka, sans-serif", fontWeight: 400, color: C.teal, fontPalette: "var(--fp-logo)", fontVariationSettings: "'SHLN' 41, 'MORF' 15", lineHeight: 1.15 };

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

// The Sky Rank ladder (Damon, 2026-10-27): every rank, its Sky Miles and its line, from the server (api/ranks, the ladder
// lives in Utils/Ranks.cs). mine = the viewer's own rank, highlighted. Loaded once per visit.
let ranksCache = null;
function SkyRankLadder({ mine }) {
  const [ranks, setRanks] = useState(ranksCache);
  useEffect(() => {
    if (ranksCache) return;
    fetch(`${API_URL}/api/ranks`).then(r => r.ok ? r.json() : null).then(d => { if (d) { ranksCache = d; setRanks(d); } }).catch(() => { });
  }, []);
  if (!ranks) return <div style={{ fontSize: 14, color: C.textMuted }}>Loading…</div>;
  return (
    <div>
      <div style={{ fontSize: 14, color: C.textSecond, marginBottom: 8 }}>
        <b style={{ color: C.textPrimary }}>Sky Miles:</b> every point you win at a station with 3 or more passengers. The more you ride, the higher you climb.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {ranks.map(r => {
          const me = r.name === mine;
          return (
            <div key={r.name} style={{ display: "grid", gridTemplateColumns: "64px minmax(0, 1fr)", columnGap: 10, alignItems: "baseline", padding: "4px 8px", borderRadius: 6, background: me ? `color-mix(in srgb, ${C.teal} 14%, transparent)` : "transparent" }}>
              <span style={{ textAlign: "right", fontSize: 13, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>{r.from.toLocaleString()}</span>
              <span style={{ fontSize: 14, minWidth: 0 }}>
                <b style={{ color: me ? C.teal : C.textPrimary }}>{r.name}</b>
                <span style={{ color: C.textSecond }}> · {r.line}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// stations > 0: a journey of that many stations, the highest score wins; 0: the first to winScore (GameFormat on the server)
function HowToPlay({ winScore = 30, stations = 0 }) {
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
              {/* 2026-10-22: rewritten shorter and plainer (Damon: "make them more easy to understand and more simple";
                  the old "A valid acro is entered for you" sounded as if the game wrote one for you) */}
              <RulesSection icon="🚉" title="All aboard!">
                Each station gives you a few letters and a direction. Turn the letters into a funny phrase, then everyone votes.
                {stations > 0
                  ? <>After <b style={{ color: C.textPrimary }}>{stations} stations</b>, the most points wins the journey.</>
                  : <>The first to <b style={{ color: C.textPrimary }}>{winScore} points</b> wins the journey.</>}
              </RulesSection>
              <RulesSection icon="✍️" title="Write">
                <ul style={rulesList}>
                  <li>One word for each letter, in order: <b style={{ color: C.textPrimary }}>B T V</b> → <span style={ex}>"Bagpipes Terrify Vampires"</span>.</li>
                  <li>No extra words, not even "the" or "a". Symbols like + = &gt; &amp; are fine: they don't count as words.</li>
                  <li>You have about a minute. Press Enter to send it; you can change it until the time is up.</li>
                  <li>Still typing when the time runs out? If what you've typed already fits the letters, it counts.</li>
                  <li>Each station adds a letter: 3, 4, 5, 6, 7, then back to 3.</li>
                </ul>
              </RulesSection>
              <RulesSection icon="🗳️" title="Vote">
                <ul style={rulesList}>
                  <li>The acros appear without names. Pick the one you like best.</li>
                  <li>You can't vote for your own.</li>
                </ul>
              </RulesSection>
              <RulesSection icon="⭐" title="Points">
                <ul style={rulesList}>
                  <li><b style={{ color: C.textPrimary }}>+1</b> for every vote your acro gets.</li>
                  <li><b style={{ color: C.textPrimary }}>The winning acro</b>: +1 for every letter (5 letters = +5).</li>
                  <li><b style={{ color: C.textPrimary }}>You voted for the winner</b>: +1.</li>
                  <li><b style={{ color: C.textPrimary }}>The fastest acro</b> with at least one vote: +1.</li>
                  <li><b style={{ color: C.textPrimary }}>📖 Word of the week</b>: use it in your acro and get at least one vote: +1. A new word every Monday.</li>
                  <li>A tie? The acro sent first wins. The same acro twice? It's shown once and its writers share the votes.</li>
                </ul>
              </RulesSection>
              <RulesSection icon="🎫" title="Your Sky Passport">
                Your free player account: your passenger name, your stats, your best acros and your stamps. No email needed.
                Click your name at the station to see it.
              </RulesSection>
              <RulesSection icon="🎯" title="Directions">
                The direction is the station's topic: what your acro should be about. The winner of a station picks the
                next one. No direction in time? Then it's "General Acro".
                {/* Highball! explained (2026-10-25: players didn't know what it does; Fran and Debbie know it as a drink) */}
                <br />The chooser presses <b style={{ color: C.textPrimary }}>Highball!</b> to depart: the old railway signal for "clear to go".
              </RulesSection>
              <RulesSection icon="🎭" title="Special directions">
                Sometimes the direction is a special challenge — your acro still has to fit the letters.
                <ul style={rulesList}>
                  {/* 2026-10-24 (Damon): his specials; the 3-letter ones only come on 3-letter stations, Rhyme Time on 4 */}
                  <li><b style={{ color: C.textPrimary }}>Pander</b> — make your acro about someone on the train. Be nice… or at least funny.</li>
                  <li><b style={{ color: C.textPrimary }}>Rhyme Time</b> (4 letters) — make it rhyme. <span style={ex}>"Fat Cat Sat"</span></li>
                  <li><b style={{ color: C.textPrimary }}>Word Bank</b> (3 letters) — the 2nd and 3rd words use only letters from the 1st. <span style={ex}>P A S → "Pastries Ape Sit"</span></li>
                  <li><b style={{ color: C.textPrimary }}>Word &gt; Chain</b> (3 letters) — each word leads into the next; put &gt; between them. <span style={ex}>F T D → "Fire &gt; Truck &gt; Driver"</span></li>
                  <li><b style={{ color: C.textPrimary }}>Letter Link</b> (3 letters) — each word ends with the next letter. <span style={ex}>P A S → "Papa Always Slept"</span></li>
                  <li><b style={{ color: C.textPrimary }}>All Aboard</b> (3 letters) — every word uses every letter, twice if it comes twice. <span style={ex}>D A D → "Dad's Deadly Demand"</span></li>
                  <li><b style={{ color: C.textPrimary }}>A + B = C</b> (3 letters) — the 1st word plus the 2nd makes the 3rd. <span style={ex}>S F S → "Sun + Flower = Sunflower"</span></li>
                  <li><b style={{ color: C.textPrimary }}>A + B = C + D</b> (4 letters) — two plus two. <span style={ex}>"Peanut + Butter = Sticky + Fingers"</span></li>
                  <li><b style={{ color: C.textPrimary }}>Q (one word) and A</b> (5 letters) — a one-word question, then the answer. <span style={ex}>"Why? Because Cats Dance Daily"</span></li>
                  <li><b style={{ color: C.textPrimary }}>3 words, similar meaning</b> (3 letters) — three words that mean almost the same. <span style={ex}>"Big Huge Giant"</span></li>
                  <li><b style={{ color: C.textPrimary }}>Real word and its definition</b> — a real word followed by its dictionary-style definition (Zyngacita's). <span style={ex}>B F T L → "Ballet: Flowing Theatrical Leaps"</span></li>
                </ul>
                <div style={{ marginTop: 6 }}>Tip: put spaces around &gt; + and = so they don't stick to a word ("Fire&gt;Truck" counts as one word).</div>
              </RulesSection>
              <RulesSection icon="🏁" title="Final Stop">
                {stations > 0 ? `After station ${stations}, the highest score wins the journey; a tie at the top is a shared win.` : `When someone reaches ${winScore}, the highest score wins the journey.`} After a 30-second break the next journey starts by itself.
              </RulesSection>
              <RulesSection icon="🎖" title="Sky Ranks">
                <SkyRankLadder />
              </RulesSection>
              <RulesSection icon="🚂" title="When we play">
                Every day the regulars ride <b style={{ color: C.textPrimary }}>The Continental</b> at <b style={{ color: C.textPrimary }}>{scheduledTrain("continental", Date.now(), []).local}</b> and the <b style={{ color: C.textPrimary }}>Daily Express</b> at <b style={{ color: C.textPrimary }}>{nightExpress(Date.now(), []).local}</b>, your time: that's when the trains are fullest. You can start or join a train any other time too.
              </RulesSection>
              <RulesSection icon="💬" title="Tips">
                <ul style={rulesList}>
                  <li>Click a name to message that passenger: type and press Enter.</li>
                  <li>To vote someone off a train, type <b style={{ color: C.textPrimary }}>/eject name</b> in Sky Train Chat.</li>
                  <li>More chat commands: <b style={{ color: C.textPrimary }}>/me</b> waves, <b style={{ color: C.textPrimary }}>/pc name message</b> (private), <b style={{ color: C.textPrimary }}>/mu</b> (music on or off). Type <b style={{ color: C.textPrimary }}>/?</b> for the list.</li>
                  <li><b style={{ color: C.textPrimary }}>Colors</b>: the look of the station. <b style={{ color: C.textPrimary }}>Letters</b>: the font of the Express Server letters (or just click them).</li>
                  <li><b style={{ color: C.textPrimary }}>Music</b>: volume, button sounds, and your song while acros are written. It switches at once.</li>
                </ul>
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
    if (!window.confirm(`Remove "${e.title}" from Station News?`)) return;
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
    } catch { setErr("Couldn't load Station News. Try again in a moment."); }
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
            <h1 style={{ margin: 0, fontSize: 40, ...honkTitle }}>Station News</h1>   {/* Honk, the size of the logo. Was "Station Log" (Damon, 2026-10-27) */}
            <p style={{ margin: "4px 0 0", color: "var(--c-bgText)", fontSize: 15 }}>What's new on the Acro Express, and what we fixed. Comment and react — we read everything. On the rails since 16 August 2025.</p>
          </div>
          <BtnSecondary onClick={() => navigate("/")}>← Grand Sky Station</BtnSecondary>
        </div>
        {data?.isAdmin && (
          <Panel style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, borderColor: C.teal }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 16, color: C.teal }}>New entry</h2>
              {/* Admin only: which palettes the players use (2026-10-18) */}
              <div style={{ display: "flex", gap: 8 }}>
                <BtnSecondary onClick={() => navigate("/admin/numbers")}>Numbers</BtnSecondary>
                <BtnSecondary onClick={() => navigate("/admin/palettes")}>Palette stats</BtnSecondary>
              </div>
            </div>
            <input id="logTitle" value={title} onChange={ev => setTitle(ev.target.value)} maxLength={120} placeholder="Title, e.g. Tonight's fixes" style={field} />
            <textarea id="logBody" value={body} onChange={ev => setBody(ev.target.value)} rows={6} placeholder={"What's new?\n- Lines starting with a dash become bullet points"} style={{ ...field, resize: "vertical" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Btn onClick={post}>Post to Station News</Btn>
              {formErr && <span style={{ color: C.brand, fontSize: 14 }}>{formErr}</span>}
            </div>
          </Panel>
        )}
        {data?.isAdmin && <AdminPassengers />}
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
            <p style={{ margin: "4px 0 0", color: "var(--c-bgText)", fontSize: 15 }}>Stations played with each Colors palette (one per player per station), other players only: your own picks are left out. Only you see this page.</p>
          </div>
          <BtnSecondary onClick={() => navigate("/log")}>← Station News</BtnSecondary>
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
        {data && <FinalStopPreview />}
        {data && <ThemeListening />}
        {data && (
          <Panel style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.map(t => {
              const th = THEMES[t.theme];                                    // undefined for a retired palette
              const share = total ? Math.round(t.stations / total * 100) : 0;  // % of all known stations
              return (
                <div key={t.theme}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* the same dot as in the Colors menu */}
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
                      {t.lastUsedUtc && ` · last used ${new Date(t.lastUsedUtc).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`}
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

// Numbers (admin only, Damon 2026-10-21: "measure before building more"): per week, new passengers and how many
// of them played, came back within 7 days and finished 2+ games; players and games per week; the busiest hours and
// weekdays. All in Limassol time. Damon himself is left out of the player numbers. (api/admin/numbers)
// Admin only, in the Station Log under "New entry": everyone who registered, newest first, whether they play or
// not (Damon, 2026-10-26). Names of passengers who never played are dimmed; hover = signed up / stations / last
// played, in the viewer's own time. The newest 40, then "Show all". (api/admin/passengers)
function AdminPassengers() {
  const [rows, setRows] = useState(null);        // the server's answer
  const [err, setErr] = useState("");            // error text, if any
  const [all, setAll] = useState(false);         // showing everyone
  useEffect(() => {
    fetch(`${API_URL}/api/admin/passengers`, { headers: authHeaders() })
      .then(async r => { if (!r.ok) throw new Error("Couldn't load the passengers."); setRows(await r.json()); })
      .catch(e => setErr(e.message));
  }, []);
  const when = utc => new Date(utc).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const shown = rows ? (all ? rows : rows.slice(0, 40)) : [];
  return (
    <Panel style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, borderColor: C.teal }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 16, color: C.teal }}>Passengers</h2>
        {rows && <span style={{ fontSize: 14, color: C.textMuted }}>{rows.length} registered · {rows.filter(r => r.stations > 0).length} played · newest first</span>}
      </div>
      {err && <span style={{ color: C.brand, fontSize: 14 }}>{err}</span>}
      {!rows && !err && <span style={{ color: C.textMuted, fontSize: 14 }}>Loading…</span>}
      {rows && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 14 }}>
          {shown.map(r => (
            <span key={r.name} title={`Signed up ${when(r.signedUpUtc)} · ${r.stations ? `${r.stations} stations, last ${when(r.lastPlayedUtc)}` : "never played"}`}
              style={{ whiteSpace: "nowrap", color: r.stations ? C.textPrimary : C.textMuted }}>
              {r.name} <span style={{ fontSize: 12, color: C.textMuted }}>{new Date(r.signedUpUtc).toLocaleDateString([], { day: "numeric", month: "short" })}</span>
            </span>
          ))}
          {rows.length > 40 && <button onClick={() => setAll(v => !v)} style={{ background: "none", border: "none", padding: 0, color: C.teal, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600 }}>{all ? "Show fewer" : `Show all ${rows.length}`}</button>}
        </div>
      )}
    </Panel>
  );
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function NumbersPage() {
  const navigate = useNavigate();
  const [weeks, setWeeks] = useState(8);         // how many weeks back
  const [data, setData] = useState(null);        // the server's answer
  const [err, setErr] = useState("");            // error text, if any
  useEffect(() => {
    setData(null); setErr("");
    fetch(`${API_URL}/api/admin/numbers?weeks=${weeks}`, { headers: authHeaders() })
      .then(async r => {
        if (r.status === 403) throw new Error("This page is for the admin only.");
        if (!r.ok) throw new Error("Couldn't load the numbers. Try again in a moment.");
        setData(await r.json());
      })
      .catch(e => setErr(e.message));
  }, [weeks]);
  const pct = (a, b) => (b ? ` (${Math.round(a / b * 100)}%)` : "");
  const cell = { padding: "7px 8px", textAlign: "right", whiteSpace: "nowrap" };
  // A row of small bars (hours or weekdays), the tallest = full height
  const Bars = ({ values, labels }) => {
    const max = Math.max(1, ...values);
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
        {values.map((v, i) => (
          <div key={i} title={`${labels[i]}: ${v}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, height: "100%", justifyContent: "flex-end" }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>{v || ""}</span>
            <div style={{ width: "100%", height: `${v / max * 80}%`, minHeight: v ? 2 : 0, background: C.teal, borderRadius: 3 }} />
            <span style={{ fontSize: 11, color: C.textMuted }}>{labels[i]}</span>
          </div>
        ))}
      </div>
    );
  };
  const weekLabel = w => new Date(w + "T12:00:00").toLocaleDateString([], { day: "numeric", month: "short" });
  return (
    <div style={{ minHeight: "100vh", color: C.textPrimary, padding: "24px 16px 48px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Nunito', sans-serif", fontSize: 30, fontWeight: 800, color: C.brand }}>Numbers</h1>
            <p style={{ margin: "4px 0 0", color: "var(--c-bgText)", fontSize: 15 }}>How the Acro Express is growing. Home time, weeks from Monday. You are left out of the player numbers. Only you see this page.</p>
          </div>
          <BtnSecondary onClick={() => navigate("/log")}>← Station News</BtnSecondary>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[4, 8, 12].map(w => (
            <button key={w} onClick={() => setWeeks(w)}
              style={{ background: w === weeks ? C.brand : C.bgPanel, color: w === weeks ? C.onBrand : C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
              Last {w} weeks
            </button>
          ))}
        </div>
        {err && <p style={{ color: C.brand }}>{err}</p>}
        {!data && !err && <p style={{ color: "var(--c-bgText)" }}>Loading…</p>}
        {data && (
          <>
            {/* All time */}
            <Panel style={{ padding: 16, display: "flex", gap: 24, flexWrap: "wrap" }}>
              {[["Passengers signed up", data.totals.passengers], ["Played a station", data.totals.played], ["Played on 2+ days", data.totals.playedTwoDays]].map(([label, n]) => (
                <div key={label}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: C.teal }}>{n}</div>
                  <div style={{ fontSize: 13, color: C.textMuted }}>{label}</div>
                </div>
              ))}
            </Panel>
            {/* Week by week, newest first */}
            <Panel style={{ padding: 0, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ color: C.textMuted, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ ...cell, textAlign: "left" }}>Week of</th>
                    <th style={cell} title="Signed up that week">New passengers</th>
                    <th style={cell} title="New passengers who played at least one station">Played</th>
                    <th style={cell} title="Played again on another day within 7 days of their first station">Came back</th>
                    <th style={cell} title="Finished 2 or more games (so far)">2+ games</th>
                    <th style={cell} title="Everyone who played a station that week">Players</th>
                    <th style={cell} title="Games that reached the Final Stop">Games</th>
                    <th style={cell} title="Visitors (not signed in): visits · practice started · practice finished · signed up (counted from 22 Oct 2026)">Visitors</th>
                    <th style={cell} title="That week's Word of the Week: acros that used it (players)">📖 Word</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.weeks].reverse().map(w => (
                    <tr key={w.week} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ ...cell, textAlign: "left" }}>{weekLabel(w.week)}{!w.complete && <span style={{ color: C.textMuted }}> (so far)</span>}</td>
                      <td style={cell}>{w.newPassengers}</td>
                      <td style={cell}>{w.newPlayed}{pct(w.newPlayed, w.newPassengers)}</td>
                      <td style={cell}>{w.newCameBack}{pct(w.newCameBack, w.newPlayed)}</td>
                      <td style={cell}>{w.newTwoGames}{pct(w.newTwoGames, w.newPlayed)}</td>
                      <td style={cell}>{w.activePlayers}</td>
                      <td style={cell}>{w.gamesFinished}</td>
                      <td style={cell}>{w.visits} · {w.practiceStarts} · {w.practiceFinishes} · {w.signups}</td>
                      <td style={cell}>{w.word ? <>{w.word}: {w.wordUses}{w.wordPlayers ? ` (${w.wordPlayers})` : ""}</> : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <p style={{ margin: "-6px 0 0", color: "var(--c-bgText)", fontSize: 13 }}>
              Came back and 2+ games are counted among the new passengers who played. Stations are recorded from 12 Oct 2026, so earlier playing is missing. Visitors: visits · practice started · practice finished · signed up (visitors not signed in, counted from 22 Oct 2026).
            </p>
            {/* When people play */}
            <Panel style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 16, color: C.teal }}>Busiest hours (home time)</h2>
              <Bars values={data.hours} labels={data.hours.map((_, h) => String(h))} />
              <h2 style={{ margin: "8px 0 0", fontSize: 16, color: C.teal }}>Busiest days</h2>
              <Bars values={data.weekdays} labels={WEEKDAY_NAMES} />
              <div style={{ color: C.textMuted, fontSize: 13 }}>Player visits: one player playing in that hour (or on that day) counts once per day.</div>
            </Panel>
            {/* Where visitors come from (counted from 22 Oct 2026, api/track) */}
            <Panel style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, overflowX: "auto" }}>
              <h2 style={{ margin: 0, fontSize: 16, color: C.teal }}>Where visitors come from</h2>
              {data.sources?.length ? (
                <table style={{ borderCollapse: "collapse", fontSize: 14 }}>
                  <thead><tr style={{ color: C.textMuted }}>
                    <th style={{ ...cell, textAlign: "left" }}>Source</th><th style={cell}>Visits</th><th style={cell}>Practice</th><th style={cell}>Finished it</th><th style={cell}>Signed up</th>
                  </tr></thead>
                  <tbody>{data.sources.map(x => (
                    <tr key={x.source} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ ...cell, textAlign: "left" }}>{x.source === "player" ? "Players (signed in)" : x.source}</td>
                      <td style={cell}>{x.visits}</td><td style={cell}>{x.practiceStarts}</td><td style={cell}>{x.practiceFinishes}</td>
                      <td style={cell}>{x.signups}{x.visits ? pct(x.signups, x.visits) : ""}</td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : <div style={{ color: C.textMuted, fontSize: 14 }}>Nothing yet: counted from 22 Oct 2026.</div>}
              <div style={{ color: C.textMuted, fontSize: 13 }}>Visitors who aren't signed in, once per browser tab. Tag the links you post, e.g. acro.express/?from=reddit, to see each post here; untagged visits show the site that linked to us, or "direct". Only counts are kept: nothing about the person.</div>
            </Panel>
            {/* Where they play from: the time zone of their computer's clock (recorded from 21 Oct 2026) */}
            <Panel style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16, color: C.teal }}>Where they play from</h2>
              {data.zones?.length ? data.zones.map(z => {
                const parts = z.timeZone.split("/");                        // "Europe/London" → London (Europe)
                const place = parts.length > 1 ? `${parts[parts.length - 1].replace(/_/g, " ")} (${parts[0]})` : z.timeZone;
                const max = data.zones[0].players;
                return (
                  <div key={z.timeZone} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                    <span style={{ width: 200, flexShrink: 0 }}>{place}</span>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: C.bgApp }}>
                      <div style={{ width: `${z.players / max * 100}%`, height: "100%", borderRadius: 4, background: C.teal }} />
                    </div>
                    <span style={{ width: 80, textAlign: "right", color: C.textSecond }}>{z.players} {z.players === 1 ? "player" : "players"}</span>
                  </div>
                );
              }) : <div style={{ color: C.textMuted, fontSize: 14 }}>Nothing yet: recorded from 21 Oct 2026, as players play stations.</div>}
              <div style={{ color: C.textMuted, fontSize: 13 }}>The time zone each player's computer clock is set to (the city that names the zone, not where they are), the latest one per player in the period.</div>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

// ── The Practice Train (2026-10-22, Damon's spec) ─────────────────
// Newcomers play right away, alone, without signing up: three REAL past stations (their letters and topic, from
// the handpicked PRACTICE_STATIONS; first from api/practice, which was dropped the same day as too risky), with the game's look, timer, music and clock tick. A writing experience, not a competition: no
// voting, no scores, nothing stored. After each station: the acros real passengers wrote for it (no names; a ★ on the
// passengers' favourite). After three: an invitation to the Daily Express. 40 seconds a station (≈ 2 minutes).
const PRACTICE_SECONDS = 40;
// 21 stations handpicked from real games (2026-10-22, Damon: "if you use old acros there is a big risk … handpick
// 20 21"): broad topics only, and only the clean acros of each (no names, no insider jokes, no drink, weapons or
// death). ★ = the passengers' favourite at the time. Spelling kept as the passengers wrote it.
const PRACTICE_STATIONS = [
  { letters: "SMO", topic: "What's in your wallet?", acros: [["Six money orders.", 1], ["Stamps, money, opera-tickets"], ["Some money, obviously."]] },
  { letters: "CTS", topic: "What do you love to hate?", acros: [["Constantly talking strangers.", 1], ["Cars that smoke."], ["Creatures that scare."], ["Cauliflower that's stale."], ["China tea sets"]] },
  { letters: "WUT", topic: "Prehistoric age!", acros: [["Wandered upon Triceratops.", 1], ["Wandering undisturbed.... tyronassaurus"], ["We understand troglodytes"]] },
  { letters: "EOF", topic: "A + B = C", acros: [["Egg + Omelet = Fluffy", 1], ["End + Of = Finished"], ["Eleven + One = Fourteen?"]] },
  { letters: "EHC", topic: "Word > Chain", acros: [["Extra > Hard > Choices", 1], ["Egged > House > Cleaned"], ["Every > Hour > Chimed"]] },
  { letters: "LBU", topic: "A + B = C", acros: [["Life + Boat = Underwater", 1], ["Loathes + Books = Uneducated"], ["Love + Bacon = Uhhuh"]] },
  { letters: "BCHB", topic: "Rhyme it", acros: [["Beginning chores, housework bores.", 1], ["Banana cake, hearty bake"], ["Big Chuck's horse bucked."]] },
  { letters: "RBIR", topic: "I remember when...", acros: [["...rubber boots involved rain.", 1], ["...running backwards is reversed."], ["...real butter is requested."], ["....romance became interesting. Really?"]] },
  { letters: "CFDO", topic: "Rhyme", acros: [["Clothes fold, Dad's old.", 1], ["Cat's for dog odor."], ["Craving fall days overall."]] },
  { letters: "CHOQ", topic: "Things in a kid's schoolbag", acros: [["Crayons, homework (obviously), Quiche", 1], ["Coat Homework Orange Quotes"], ["Chalk, homework, oreos quickly"]] },
  { letters: "INTE", topic: "Rhyme", acros: [["It's neat & tasty, EAT!", 1], ["I'm near their ear."], ["It's new, that Ewe."]] },
  { letters: "ENCH", topic: "Strange hobby", acros: [["Evidently nerdy... collecting heirlooms", 1], ["Extra nighttime chanting HmmmHmmmHmmmm"], ["Exploring nostrils, cleaning happily."], ["Eating nine crocodile hatchlings."]] },
  { letters: "RISM", topic: "How I got fired", acros: [["Ran into supervisor's Maserati", 1], ["Requested insane salary, 1 million!"], ["Rushed into someone's Mercedes"]] },
  { letters: "EADN", topic: "What's for dinner?", acros: [["Enchiladas and drunken noodles.", 1], ["Eating a domino's now."], ["Eating at diner: noodles."], ["Egg and ..dunno, nothing?"]] },
  { letters: "MXIT", topic: "Word > Chain", acros: [["My > Xray > In > Tense", 1], ["Many > X's > Irritating > Temper"], ["Must > Xit > Into > Trouble"]] },
  { letters: "FPGR", topic: "What's for dinner?", acros: [["Fried potatoes, grilled rabbit.", 1], ["French potatoes, get ready!"], ["Fried Pickles, gobs ranch."]] },
  { letters: "ITOR", topic: "What's for dinner?", acros: [["Incredible T-bone over roasties.", 1], ["It's tomatoes & onion ratatouille"], ["I'm thinking of Ravioli's."]] },
  { letters: "POCFS", topic: "Words of wisdom", acros: [["Patience often cures frustrations strength.", 1], ["Panic often causes fear, surprise!!"], ["Put our children first, safely."]] },
  { letters: "MCRSC", topic: "Haunted houses", acros: [["Maybe Caspar's real, screaming creature.", 1], ["Mansion's creaking, really spooky cellars"], ["Mystical creatures request soul capture."], ["Made Casper roast some chicken."], ["Makes children really scared... chilling."]] },
  { letters: "HSBPS", topic: "Bad racehorse names", acros: [["\"Hop Stop\" \"Boring Pace\" \"Sleepy\"", 1], ["\"Hero Slacker\" \"Broken Pal\" \"Slowpoke\""], ["\"Happy Skipper\" \"Big Problem\" \"Slowpoke\""]] },
  { letters: "HMCCPB", topic: "Outer space adventure", acros: [["Hyperspace mission, chart cosmic planetary bodies.", 1], ["Hovering my craft carefully.... Pluto's beautiful!"]] },
];
// The special topics, in one line each (as in How to play), shown under the topic in the practice
// A station starts with its writing time, or first with the special topic explained (Damon, 2026-10-22)
const practiceStart = st => (st && specialTopicNote(st.topic) ? "intro" : "write");
// The special topics, one short game-style line each (Damon, 2026-10-24), shown under the topic: in the practice and
// during a station. Matched loosely, since players type them their own way ("word bank", "WordBank", "Word =>Chain").
function specialTopicNote(topic) {
  const t = String(topic || "").toLowerCase(), k = t.replace(/[^a-z0-9+=>]/g, "");
  if (k.startsWith("pander") && !k.includes("murder")) return "Make your acro about someone on the train. Be nice… or at least funny.";
  if (k.startsWith("rhyme") || k === "letsrhyme") return 'Make it rhyme! "Fat Cat Sat"';
  if (k.startsWith("wordbank")) return 'The 2nd and 3rd words use only letters from the 1st. PAS → "Pastries Ape Sit"';
  if (k.startsWith("word>chain") || k.startsWith("word=>chain") || k.startsWith("wordchain")) return 'Each word leads into the next: put > between them. "Fire > Truck > Driver"';
  if (k.startsWith("letterlink")) return 'Each word ends with the next letter. PAS → "Papa Always Slept"';
  if (k.startsWith("allaboard")) return 'Every word uses every letter, twice if it comes twice. DAD → "Dad\'s Deadly Demand"';   // Damon, 2026-10-27
  if (k.startsWith("a+b=c+d")) return 'Two plus two: "Peanut + Butter = Sticky + Fingers"';
  if (k.startsWith("a+b=c")) return 'The 1st word plus the 2nd makes the 3rd: "Sun + Flower = Sunflower"';
  if (k.startsWith("q(oneword)anda") || k.startsWith("qoneworda")) return 'A one-word question, then the answer: "Why? Because Cats Dance Daily"';
  if (k.startsWith("3wordssimilarmeaning")) return 'Three words that mean almost the same: "Big Huge Giant"';
  if (k.startsWith("realword")) return 'A real word followed by its dictionary-style definition. BFTL → "Ballet: Flowing Theatrical Leaps"';   // Zyngacita's, 2026-10-26
  return null;
}
// A ride: a 3-letter station, a 4-letter one, then a longer one, each picked at random; the acros shuffled
function practiceRide() {
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const by = test => PRACTICE_STATIONS.filter(st => test(st.letters.length));
  return [pick(by(l => l === 3)), pick(by(l => l === 4)), pick(by(l => l >= 5))].map(st => ({
    letters: st.letters, topic: st.topic,
    acros: st.acros.map(([text, won]) => ({ text, won: !!won })).sort(() => Math.random() - 0.5),
  }));
}
// The same rule as the server (AcroValidator): one word per letter, in order; a "word" has at least one letter
function practiceProblem(letters, text) {
  const words = text.trim().split(/\s+/).filter(w => /\p{L}/u.test(w));
  if (!words.length) return "Write one word for each letter.";
  if (words.length !== letters.length) return `Write ${letters.length} words, one for each letter (you have ${words.length}).`;
  for (let i = 0; i < letters.length; i++) {
    const first = words[i].match(/\p{L}/u)[0].toUpperCase();
    if (first !== letters[i]) return `Word ${i + 1} should start with ${letters[i]}.`;
  }
  return "";
}
// The player's song for a practice station: the Original (from the right spot, so it ends at 0) or a song made here
function startPracticeMusic(seconds) {
  const music = soundSettings.music || "classic";
  if (soundGain() <= 0) return { stop() { } };
  if (music !== "classic") {
    let pl = null, stopped = false;
    playTheme(music, seconds, THEME_LEVEL, seconds).then(p => { pl = p; if (stopped) p?.stop(); else p?.setLevel(THEME_LEVEL * soundGain()); }).catch(() => { });
    return { stop() { stopped = true; pl?.stop(); } };
  }
  const audio = new Audio("/AcroExpress_tunes.m4a");
  audio.volume = THEME_LEVEL * soundGain();
  try { audio.currentTime = Math.max(0, 91.9 - seconds); } catch { /* not ready: starts at 0 */ }
  audio.play().catch(() => { });
  return { stop() { audio.pause(); } };
}
// onClose: opened over the station (the station stays connected underneath); boarding: a train that is boarding now
// ({ id, name }), shown as a bar so nobody misses it while practising
function PracticeTrain({ onClose = null, boarding = null }) {
  const navigate = useNavigate();
  const leave = () => { musicRef.current?.stop(); if (onClose) onClose(); else navigate("/"); };
  const [stations, setStations] = useState(null);       // the three stations from the server
  const err = "";                                       // (the handpicked stations can't fail to load)
  const [n, setN] = useState(0);                         // which station (0–2); 3 = the end
  const [phase, setPhase] = useState("write");           // "write" → "reveal"
  const [left, setLeft] = useState(PRACTICE_SECONDS);
  const [text, setText] = useState("");
  const textRef = useRef("");                            // the latest text, for the timer's "time's up"
  const [mine, setMine] = useState([]);                  // the player's acro per station ("" = none)
  const [problem, setProblem] = useState("");
  const musicRef = useRef(null);
  const endRef = useRef(0);                              // when this station's writing time ends (for the Music menu)
  const inputRef = useRef(null);
  useEffect(() => {
    const ride = practiceRide();                          // the handpicked stations (no server call)
    setStations(ride); setPhase(practiceStart(ride[0]));
    track("practice_start");
    return () => musicRef.current?.stop();
  }, []);
  const st = stations?.[n];
  useEffect(() => { if (n === 3) track("practice_finish"); }, [n]);   // the end of the ride: all three stations done
  // each station: the timer and the music
  useEffect(() => {
    if (!st || phase !== "write") return;
    setLeft(PRACTICE_SECONDS); setText(""); textRef.current = ""; setProblem("");
    musicRef.current?.stop(); musicRef.current = startPracticeMusic(PRACTICE_SECONDS);
    setTimeout(() => inputRef.current?.focus(), 50);
    const end = Date.now() + PRACTICE_SECONDS * 1000;
    endRef.current = end;
    const iv = setInterval(() => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) { clearInterval(iv); finish(true); }
    }, 250);
    return () => clearInterval(iv);
  }, [st, phase]);   // eslint-disable-line react-hooks/exhaustive-deps
  // The Music menu changed (on/off, volume or song): restart the music for the time that's left, at the right point
  useEffect(() => {
    if (phase !== "write") return;
    const on = () => {
      const left = (endRef.current - Date.now()) / 1000;
      musicRef.current?.stop();
      musicRef.current = left > 3 ? startPracticeMusic(left) : null;
    };
    window.addEventListener("acro-sound-change", on);
    return () => window.removeEventListener("acro-sound-change", on);
  }, [phase]);
  // Send (Enter or the button) — or time's up: a valid acro still counts, like in the game
  const finish = (timeUp = false) => {
    const cur = textRef.current;
    const ok = cur.trim() && !practiceProblem(st.letters, cur);
    if (!timeUp && !ok) { setProblem(practiceProblem(st.letters, cur)); return; }
    setMine(m => { const c = [...m]; c[n] = ok ? cur.trim() : ""; return c; });
    musicRef.current?.stop();
    setPhase("reveal");
  };
  const next = () => { setN(x => x + 1); setPhase(practiceStart(stations?.[n + 1])); };
  const shell = children => (
    <div style={onClose
      ? { position: "fixed", inset: 0, zIndex: 86, overflowY: "auto", background: "var(--c-bgApp)", backgroundImage: "var(--c-bgGradient, none)", color: C.textPrimary, display: "flex", flexDirection: "column" }
      : { minHeight: "100vh", color: C.textPrimary, display: "flex", flexDirection: "column" }}>
      <div style={{ borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Honk', 'Nunito', sans-serif", fontSize: 34, color: "var(--c-logo)", fontPalette: "var(--fp-mark)", fontVariationSettings: "'SHLN' 41, 'MORF' 15", lineHeight: 1.05 }}>Acro Express</span>
          <span style={{ color: C.teal, fontWeight: 700 }}>🚂 Practice journey{st && n < 3 ? ` · Station ${n + 1} of 3` : ""}</span>
          {/* the letters' font, as on a train (Damon, 2026-10-22: "the practice font doesn't change") */}
          {/* make it yours, as on a train (Damon, 2026-10-23: Colors here too) */}
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "relative" }}>
            <ThemePicker />
            <LetterFontPicker />
            <SongPicker />
            <SoundControl />
            <CustomizeHint side="left" />
          </span>
          <BtnSecondary onClick={leave} style={{ padding: "6px 12px", fontSize: 14 }}>{onClose ? "Back to the station" : "Leave the practice"}</BtnSecondary>
        </div>
      </div>
      {/* a train started boarding while you practise */}
      {boarding && (
        <div style={{ background: C.brand, color: C.onBrand }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontWeight: 700 }}>
            <span>🚂 A Sky Train is boarding: {boarding.name}</span>
            <button onClick={() => { musicRef.current?.stop(); onClose?.(); navigate(`/room/${boarding.id}`); }}
              style={{ background: C.onBrand, color: C.brand, border: "none", borderRadius: 8, padding: "6px 14px", fontFamily: "inherit", fontWeight: 800, cursor: "pointer" }}>Board now →</button>
          </div>
        </div>
      )}
      <div style={{ flex: 1, width: "100%", maxWidth: 900, margin: "0 auto", padding: "16px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
  if (err) return shell(<Panel style={{ padding: 20 }}><p style={{ margin: 0 }}>{err}</p></Panel>);
  if (!stations) return shell(<p style={{ color: "var(--c-bgText)" }}>Boarding…</p>);
  // the end of the ride
  if (n >= 3) {
    const written = mine.filter(Boolean).length;
    return shell(
      <Panel style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14, textAlign: "center", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: 38, ...honkTitle }}>End of the line!</h1>
        <p style={{ margin: 0, color: C.textSecond, fontSize: 17 }}>You wrote {written} acro{written === 1 ? "" : "s"} on this journey.</p>
        {mine.map((m, i) => m && <div key={i} style={{ fontSize: 18 }}><span style={{ color: C.brand, letterSpacing: "0.1em", fontWeight: 800 }}>{stations[i].letters.split("").join(" ")}</span> · "{m}"</div>)}
        {/* Damon's closing message */}
        <p style={{ margin: "8px 0 0", fontSize: 19, color: C.textPrimary, fontWeight: 700 }}>Wonder how your acros would fare with the passengers?</p>
        <p style={{ margin: 0, fontSize: 17, color: C.textSecond }}>Join free (just a name and a password) and fly with us, every day: The Continental at {scheduledTrain("continental", Date.now(), []).local} or the Daily Express at {nightExpress(Date.now(), []).local}, your time.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
          <Btn onClick={leave}>{getAuth()?.token ? "Back to the Grand Sky Station" : "Join free"}</Btn>
          <BtnSecondary onClick={() => { const ride = practiceRide(); setStations(ride); setMine([]); setN(0); setPhase(practiceStart(ride[0])); track("practice_start"); }}>Another practice journey</BtnSecondary>
        </div>
      </Panel>
    );
  }
  const letters = st.letters.split("");
  // A special topic: explained first; the letters and the clock come when the player is ready
  if (phase === "intro") return shell(
    <Panel style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box", borderColor: C.teal }}>
      <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textMuted }}>🎭 Special direction</div>
      <div style={{ ...honkTitle, fontSize: 36, lineHeight: 1.15 }}>{st.topic}</div>
      <div style={{ fontSize: 18, color: C.textPrimary }}>{specialTopicNote(st.topic)}</div>
      <div style={{ fontSize: 15, color: C.textSecond }}>Your letters and the {PRACTICE_SECONDS} seconds start when you're ready.</div>
      <Btn autoFocus onClick={() => setPhase("write")}>I'm ready →</Btn>
    </Panel>
  );
  return shell(
    <>
      {/* the stage: topic, timer, letters — the game's look, in the player's own letter font */}
      <div style={{ textAlign: "center" }}>
        <div style={{ ...honkTitle, fontSize: 30, lineHeight: 1.15 }}>{st.topic}</div>
        {specialTopicNote(st.topic) && <div style={{ color: C.textSecond, fontSize: 15, marginTop: 4 }}>🎭 Special topic: {specialTopicNote(st.topic)}</div>}
        <div title="Click to change the letters' font" onClick={() => { cycleLetterFont(); inputRef.current?.focus(); }}
          style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 6, cursor: "pointer", userSelect: "none" }}>
          {letters.map((L, i) => (
            <span key={i} style={{ fontFamily: "var(--lf-family, 'Bowlby One SC', serif)", fontWeight: "var(--lf-weight, 400)", fontSize: "calc(clamp(3rem, 11vh, 6rem) * var(--lf-scale, 1))", lineHeight: "var(--lf-lh, 1)", color: C.brand, fontPalette: "var(--fp-big)", fontVariationSettings: "'SHLN' 0, 'MORF' 15", textShadow: "var(--lf-shadow, var(--c-letterShadow))" }}>{L}</span>
          ))}
        </div>
      </div>
      {phase === "write" ? (
        <form onSubmit={e => { e.preventDefault(); finish(false); }} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch", maxWidth: 640, width: "100%", margin: "0 auto" }}>
          <div style={acroBar(C.focusLine)}>
            <input ref={inputRef} value={text} onChange={e => { setText(e.target.value); textRef.current = e.target.value; setProblem(""); }} maxLength={300} className="acro-box" placeholder="Please write your expression and press Enter"
              style={{ ...acroField, padding: "12px 14px", fontSize: 18 }} />
            {/* the clock between the box and Submit, as on the train (Damon, 2026-10-26); with Honk, the palette's colours */}
            <div style={{ ...acroClock, flex: "0 0 clamp(52px, 13vw, 72px)", fontSize: "calc(30px * var(--tf-scale, 1))", fontFamily: `var(--tf-family, ${NUM_FONT})`, color: left <= 10 ? C.brand : C.teal, fontPalette: left <= 10 ? "var(--fp-letters)" : "var(--fp-logo)" }}>{two(left)}</div>
            <Btn style={{ ...acroButton, minWidth: "clamp(84px, 22vw, 110px)", padding: "0 12px" }}>Submit</Btn>   {/* submits the form (an onClick too would run it twice) */}
          </div>
          <div style={{ minHeight: 20, textAlign: "center", fontSize: 14, color: problem ? C.brand : C.textMuted }}>{problem || "One word for each letter, in order. Have fun with the direction!"}</div>
        </form>
      ) : (
        // the reveal: the player's acro, then what the passengers wrote for these letters (no names)
        <Panel style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, maxWidth: 640, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          <div style={{ fontSize: 13, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Your acro</div>
          <div style={{ fontSize: 19, color: mine[n] ? C.textPrimary : C.textMuted }}>{mine[n] ? `"${mine[n]}"` : "Time ran out! No problem, it's practice."}</div>
          <div style={{ fontSize: 13, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 8 }}>What the passengers wrote for these letters</div>
          {st.acros.map((a, i) => (
            <div key={i} style={{ fontSize: 17, color: C.textPrimary, display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ color: a.won ? "var(--c-gold, #FFC24A)" : C.textMuted, width: 16, flexShrink: 0 }}>{a.won ? "★" : "·"}</span>
              <span>"{a.text}"{a.won && <span style={{ color: C.textMuted, fontSize: 13 }}> · the passengers' favourite</span>}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <Btn onClick={next}>{n < 2 ? "Next station →" : "Finish the journey →"}</Btn>
          </div>
        </Panel>
      )}
    </>
  );
}

// ── House Rules, Privacy and the footer (2026-10-18) ───────────
// Written in train words so the game stays playful. Not legal advice: Damon may have the texts checked.
// Contact = a private message to the admin in the game (no email address yet).
const ADMIN_NAME = "TylerDurden";   // who players write to
const LEGAL_UPDATED = "21 October 2026";   // change when the texts below change

// Acro Express's birthday (Damon, 2026-10-22: "16/08/2025"): the first commit, 02:05 Cyprus time
const BIRTHDAY = { year: 2025, month: 8, day: 16 };
// Is it the birthday today, on the player's own calendar? → how many years old it turns (or 0)
function birthdayToday(now = new Date()) {
  const month = now.getMonth() + 1, day = now.getDate(), year = now.getFullYear();
  return month === BIRTHDAY.month && day === BIRTHDAY.day && year > BIRTHDAY.year ? year - BIRTHDAY.year : 0;
}

// "© 2025–2026 Acro Express™ · House Rules · Privacy" — a plain line (no frame, Damon 2026-10-18) at the bottom of
// the station, the Station Log and these pages. compact = less space around it (the station fills the window).
function Footer({ compact }) {
  const navigate = useNavigate();
  const link = { background: "none", border: "none", padding: 0, color: "var(--c-bgText)", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" };
  return (
    // A soft shadow keeps the quiet text readable on every sky (Daybreak's pink horizon included)
    <footer style={{ flexShrink: 0, textAlign: "center", padding: compact ? "8px 16px 10px" : "24px 16px 28px", color: "var(--c-bgText)", fontSize: 13, textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}>
      © {BIRTHDAY.year}–{new Date().getFullYear()} Acro Express™ · <button style={link} onClick={() => navigate("/rules")}>House Rules</button>
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
    <LegalPage title="House Rules" intro="The rules of the journey, for every passenger. The Acro Express has been running since 16 August 2025.">
      <RulesSection icon="🎫" title="Your ticket">
        Acro Express is free to play. By boarding you agree to these House Rules. Passengers should be 13 or older;
        younger passengers can fly with a parent's OK.
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
        Sky Passport, in Station News, and in future features such as a Hall of Fame.
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
        and we mention it in Station News.
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
          <li><b style={{ color: C.textPrimary }}>Your game:</b> your acros, votes, points and stations, for your Sky Passport stats; acros that weren't accepted, to improve the rules; which colours you play with; the time zone your computer's clock is set to (like "Europe/London", never your exact location), to plan game nights at good times.</li>
          <li><b style={{ color: C.textPrimary }}>Your messages:</b> see "Chats" below; Station News comments and reactions.</li>
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

// The winner's crown (Damon, 2026-10-25: "a crown icon … more abstract, more simple, more minimalistic"; it replaced
// a laurel wreath that wasn't clear on its own): three points on a band, in gold
function Crown({ size = 20, color = "var(--c-gold)" }) {
  return (
    <svg aria-label="first" role="img" width={size} height={size * 0.8} viewBox="0 0 20 16" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <path d="M1.5 4.5 L5.5 9 L10 1.5 L14.5 9 L18.5 4.5 L17 13 H3 Z" fill={color} />
      <rect x="3" y="14" width="14" height="2" rx="1" fill={color} />
    </svg>
  );
}

// The Sky Leaderboard (Damon, 2026-10-25): ONE table with every passenger and all their numbers side by side; a tab
// only changes the order (click Express Flyers and the speed-bonus kings go up, the rest move down). The columns in
// order of importance: points per station, journey win %, station win %, stations, speed bonuses (total points are
// not shown: "irrelevant"). The column titles are the buttons (2026-10-26; there was a row of tabs above); Station
// Masters (points per station) is the first. The numbers sit right next to the
// names (no stretching to the box's edge), as many passengers a page as fit the window, with Previous / Next (no scrolling).
// The percentages and the average count from data.minJourneys / data.minStations; below that a passenger shows "–"
// for that number, and on that tab comes after the ones who qualify, without a rank.
const LB_COLS = [
  { id: "masters", tab: "Station Masters", icon: "🥇", head: "Pts / station", motto: "The most points from every station.",
    value: p => pct(p.points, p.stations), show: p => pct(p.points, p.stations).toFixed(1), ok: (p, d) => p.stations >= d.minStations },
  { id: "champions", tab: "Champions", icon: "🏆", head: "Journey win %", motto: "Same rails. Different legends.",
    value: p => pct(p.journeysWon, p.journeys), show: p => pctText(pct(p.journeysWon, p.journeys)), ok: (p, d) => p.journeys >= d.minJourneys },
  { id: "winners", tab: "Station Winners", icon: "🎯", head: "Station win %", motto: "First at every platform.",
    value: p => pct(p.stationsWon, p.stations), show: p => pctText(pct(p.stationsWon, p.stations)), ok: (p, d) => p.stations >= d.minStations },
  // how many journeys (Damon, 2026-10-27), counted like the journey win %: 3+ passengers, 3+ stations played
  { id: "journeys", tab: "Long Haulers", icon: "🧳", head: "Journeys", motto: "Every journey, start to finish.",
    value: p => p.journeys, show: p => p.journeys, ok: () => true },
  { id: "riders", tab: "Frequent Flyers", icon: "🚉", head: "Stations", motto: "Always on board.",
    value: p => p.stations, show: p => p.stations, ok: () => true },
  { id: "express", tab: "Express Flyers", icon: "⚡", head: "Speed bonuses", motto: "Fast hands, sharp minds.",
    value: p => p.speedBonuses, show: p => p.speedBonuses, ok: () => true },
  // the rank (Damon, 2026-10-26: "Sky RANK is a new button/tab"): the rank's name, ordered by Sky Miles (all time,
  // whatever the period); a tie is the same Sky Miles, not the same rank
  { id: "rank", tab: "Sky Rank", icon: "🎖", head: "Sky Rank", motto: "The long climb to Legend of the Line.",
    value: p => p.skyMiles || 0, show: p => p.level, tie: p => p.skyMiles || 0, ok: () => true },
];
function SkyLeaderboard() {
  const navigate = useNavigate();
  const me = String(getAuth()?.username || "").toLowerCase();
  const [period, setPeriod] = useState("month");
  const [sortId, setSortId] = useState("masters");
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  // As many rows a page as fit the window, so the page never scrolls (Damon: "There is still scrolling up and down"):
  // from the top of the list to the window's bottom, less the pager, the note and the footer
  const listRef = useRef(null);
  const [perPage, setPerPage] = useState(15);
  useEffect(() => {
    const fit = () => {
      const el = listRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setPerPage(Math.max(6, Math.min(40, Math.floor((window.innerHeight - top - 150) / 34))));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [data]);
  // ...and if the page still ends up taller than the window (a longer header, a bigger font), a few rows fewer
  useEffect(() => {
    const over = document.documentElement.scrollHeight - window.innerHeight;
    if (over > 0 && perPage > 6) setPerPage(n => Math.max(6, n - Math.ceil(over / 34)));
  }, [perPage, data, sortId]);
  useEffect(() => {
    setData(null); setErr("");
    fetch(`${API_URL}/api/leaderboard?period=${period}`, { headers: authHeaders() })
      .then(async r => { if (r.status === 401) throw new Error("Log in to see the Sky Leaderboard."); if (!r.ok) throw new Error(); setData(await r.json()); })
      .catch(e => setErr(e.message || "Couldn't load the Sky Leaderboard. Try again in a moment."));
  }, [period]);
  useEffect(() => { setPage(0); }, [period, sortId, perPage]);
  const col = LB_COLS.find(c => c.id === sortId);
  const monthName = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const inWhen = period === "month" ? ` in ${monthName}` : period === "week" ? " this week" : "";
  // Everyone who played in the period: first those who qualify for this tab, best first; then the rest, in the same
  // order. The same number shown, the same rank; the rest have no rank.
  const players = data ? data.players.filter(p => p.stations > 0) : [];
  const ok = data ? players.filter(p => col.ok(p, data)).sort((a, b) => col.value(b) - col.value(a) || b.stations - a.stations) : [];
  const rest = data ? players.filter(p => !col.ok(p, data)).sort((a, b) => col.value(b) - col.value(a) || b.stations - a.stations) : [];
  const rows = [...ok, ...rest];
  const ranks = []; const same = (a, b) => (col.tie ? col.tie(a) === col.tie(b) : String(col.show(a)) === String(col.show(b)));
  ok.forEach((p, i) => ranks.push(i > 0 && same(p, ok[i - 1]) ? ranks[i - 1] : i + 1));
  const myIndex = rows.findIndex(p => p.name.toLowerCase() === me);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const shown = rows.slice(page * perPage, page * perPage + perPage);
  const gold = "var(--c-gold)";
  const grid = "30px minmax(130px, 180px) repeat(7, 108px)";   // rank, name, the seven columns (each wide enough for its button)
  const nameBtn = name => (
    <button onClick={e => openProfile(name, e.currentTarget)} title={`Message ${name} or see their Sky Passport`}
      style={{ background: "none", border: "none", padding: 0, color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</button>
  );
  const pageBtn = (label, to, on) => (
    <button onClick={() => on && setPage(to)} disabled={!on}
      style={{ background: "none", border: `1px solid ${on ? C.teal : C.border}`, borderRadius: 8, color: on ? C.teal : C.textMuted, padding: "6px 14px", fontWeight: 700, fontSize: 14, fontFamily: "inherit", cursor: on ? "pointer" : "default" }}>{label}</button>
  );

  return (
    <div style={{ minHeight: "100vh", color: C.textPrimary, padding: "18px 16px 0", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 44, lineHeight: 1.05, ...honkTitle }}>Sky Leaderboard</h1>
            <div style={{ color: "var(--c-bgText)", fontSize: 17, marginTop: 4 }}>{period === "month" ? `${monthName} standings` : period === "week" ? "This week's standings" : "All-time standings"}</div>
          </div>
          <BtnSecondary onClick={() => navigate("/")} style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 15, padding: "6px 14px" }}>← Grand Sky Station</BtnSecondary>
        </div>

        {/* The period */}
        <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 10, alignSelf: "flex-start", overflow: "hidden" }}>
          {LB_PERIODS.map(([k, label]) => (
            <button key={k} onClick={() => setPeriod(k)}
              style={{ border: "none", background: period === k ? gold : "transparent", color: period === k ? "#1B1A17" : C.textPrimary, padding: "8px clamp(10px, 3vw, 18px)", whiteSpace: "nowrap", fontWeight: 700, fontSize: "clamp(13px, 3.6vw, 15px)", fontFamily: "inherit", cursor: "pointer" }}>{label}</button>
          ))}
        </div>

        {err && <Panel style={{ padding: 16 }}><p style={{ margin: 0, color: C.brand }}>{err}</p></Panel>}
        {!data && !err && <p style={{ color: "var(--c-bgText)" }}>Loading…</p>}
        {data && (
          <Panel style={{ padding: "14px 14px 12px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", padding: "0 4px 10px" }}>
              <span style={{ fontSize: 28, ...honkTitle }}>{col.tab}</span>
              <span style={{ fontSize: 15, fontStyle: "italic", color: C.teal }}>{col.motto}</span>
              {myIndex >= 0 && Math.floor(myIndex / perPage) !== page && (
                <button onClick={() => setPage(Math.floor(myIndex / perPage))} style={{ marginLeft: "auto", background: "none", border: "none", color: C.teal, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  Your position{myIndex < ok.length ? `: #${ranks[myIndex]}` : ""} →
                </button>
              )}
            </div>
            {rows.length === 0 ? (
              <p style={{ margin: "4px 4px 8px", color: C.textMuted }}>No one has played a station yet{inWhen}.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <div ref={listRef} style={{ width: "max-content", minWidth: "100%" }}>
                  {/* the header: the tab's number in gold */}
                  <div style={{ display: "grid", gridTemplateColumns: grid, columnGap: 12, fontSize: 11, letterSpacing: "0.04em", whiteSpace: "nowrap", alignItems: "end", textTransform: "uppercase", fontWeight: 800, padding: "0 10px 6px", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.teal }}>#</span><span style={{ color: C.teal }}>Player</span>
                    {/* the titles are the buttons: click one to order the table by it (Damon, 2026-10-26: "I've been clicking
                        on the words above the top player … the two should merge"); no frames, the chosen one in gold */}
                    {LB_COLS.map(c => (
                      <button key={c.id} onClick={() => setSortId(c.id)} aria-pressed={c.id === sortId} title={`Order by ${c.head.toLowerCase()}: ${c.tab}`} className="lb-head"
                        style={{ width: "100%", boxSizing: "border-box", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", border: "none", borderRadius: 999, padding: "5px 4px", font: "inherit", letterSpacing: "0.02em", textTransform: "inherit", cursor: "pointer", whiteSpace: "nowrap",
                          background: c.id === sortId ? gold : `color-mix(in srgb, ${C.teal} 16%, transparent)`, color: c.id === sortId ? "#1B1A17" : C.textPrimary, transition: "background 0.15s" }}>
                        {/* real buttons, soft pills (Damon: "make them look like buttons, just not ugly ones"); the chosen one gold.
                            Each exactly as wide as its column, so they never overlap (a ▼ made the chosen one wider, 2026-10-26) */}
                        {c.head}
                      </button>
                    ))}
                  </div>
                  {shown.map((p, j) => {
                    const i = page * perPage + j, ranked = i < ok.length, first = ranked && ranks[i] === 1, isMe = i === myIndex;
                    return (
                      <div key={p.name} style={{ display: "grid", gridTemplateColumns: grid, columnGap: 12, alignItems: "center", padding: "6px 10px", lineHeight: 1.3, borderRadius: first || isMe ? 8 : 0,
                        background: first ? `color-mix(in srgb, ${gold} 16%, transparent)` : isMe ? `color-mix(in srgb, ${C.teal} 14%, transparent)` : "transparent",
                        borderBottom: first || isMe ? "none" : `1px solid ${C.border}` }}>
                        <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", color: first ? gold : ranked ? C.textPrimary : C.textMuted }}>{first ? <Crown size={20} /> : ranked ? String(ranks[i]).padStart(2, "0") : "–"}</span>
                        <span style={{ minWidth: 0, fontWeight: first || isMe ? 800 : 600, fontSize: 15 }}>{nameBtn(p.name)}</span>
                        {LB_COLS.map(c => {
                          const has = c.ok(p, data), on = c.id === sortId;
                          // below the minimum: the number in grey (it doesn't count for a rank yet); nothing played for it: "–"
                          const none = c.id === "champions" ? !p.journeys : !p.stations;
                          return <span key={c.id} title={c.id === "rank" ? `${(p.skyMiles || 0).toLocaleString()} Sky Miles` : !has && !none ? "Not enough played yet to count" : undefined} style={{ textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums", fontWeight: on && has ? 800 : 500, fontSize: on ? 16 : 14, color: !has ? C.textMuted : on ? (first ? gold : C.textPrimary) : C.textSecond, opacity: !has ? 0.7 : 1 }}>{none ? "–" : c.show(p)}</span>;
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* the pages */}
            {pages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 12 }}>
                {pageBtn("← Previous", page - 1, page > 0)}
                <span style={{ fontSize: 14, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>{page * perPage + 1}–{Math.min(rows.length, (page + 1) * perPage)} of {rows.length}</span>
                {pageBtn("Next →", page + 1, page < pages - 1)}
              </div>
            )}
            <div style={{ marginTop: 10, padding: "0 4px", fontSize: 12, color: C.textMuted }}>
              Click a column's title to order by it. Points per station and station win % count from {data.minStations} stations, journey win % from {data.minJourneys} journeys{inWhen} (a journey counts when you played 3 stations of it or more); before that the number is grey and has no rank.
            </div>
          </Panel>
        )}
      </div>
      <Footer />
      <PassengerCard />
    </div>
  );
}

// The Hall of Expressions (redesign, Damon 2026-10-25, after GPT's mock-up: "a collection you'd be proud to enter").
// An editorial layout: one featured expression on its own card, then the rest in one readable column, each with its
// direction (context), the line itself, its writer (attribution), then letters, date and votes (provenance).
// Three views: This month, All-time greats, The archive (every month, newest first; a month opens like This month).
// While a month runs its first line is only "featured this month"; once the month is over it is the Expression of the
// Month. Ranked by points (Damon: "count points", not votes; server: HallController). The admin's
// Hide buttons only show after "Manage" (so the Hall doesn't look like a moderation page).
function HallOfExpressions() {
  const navigate = useNavigate();
  const [view, setView] = useState({ tab: "month", monthKey: null });
  const [data, setData] = useState(null);
  const [months, setMonths] = useState(null);
  const [err, setErr] = useState("");
  const [all, setAll] = useState(false);          // "View all": the whole list, not just the first few
  const [manage, setManage] = useState(false);    // the admin's Hide buttons
  const load = () => {
    if (view.tab === "archive") {
      fetch(`${API_URL}/api/hall/months`, { headers: authHeaders() })
        .then(async r => { if (r.status === 401) throw new Error("Log in to visit the Hall of Expressions."); if (!r.ok) throw new Error(); setMonths((await r.json()).months); })
        .catch(e => setErr(e.message || "Couldn't open the archive. Try again in a moment."));
      return;
    }
    const q = view.tab === "all" ? "?period=all" : view.monthKey ? `?month=${view.monthKey}` : "";
    fetch(`${API_URL}/api/hall${q}`, { headers: authHeaders() })
      .then(async r => { if (r.status === 401) throw new Error("Log in to visit the Hall of Expressions."); if (!r.ok) throw new Error(); setData(await r.json()); })
      .catch(e => setErr(e.message || "Couldn't open the Hall. Try again in a moment."));
  };
  useEffect(() => { setErr(""); setData(null); setAll(false); load(); }, [view.tab, view.monthKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function hide(id) {
    await fetch(`${API_URL}/api/hall/${id}/hide`, { method: "POST", headers: authHeaders() }).catch(() => { });
    load();
  }
  const gold = "var(--c-gold)";
  // the writers, in Honk (Damon, 2026-10-25); two writers of the same line: each name opens its own passport
  const names = (by, size) => (
    <>{by.split(" & ").map((n, i) => (
      <span key={n}>{i > 0 && <span style={{ color: C.textMuted, fontSize: size * 0.7 }}> & </span>}<button onClick={e => openProfile(n, e.currentTarget)} title={`Message ${n} or see their Sky Passport`}
        style={{ background: "none", border: "none", padding: 0, ...honkTitle, fontSize: size, lineHeight: 1.15, cursor: "pointer" }}>{n}</button></span>
    ))}</>
  );
  const date = a => new Date(a.atUtc).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const letters = (l, color, size = 14) => <span style={{ fontFamily: "'Goldman', sans-serif", letterSpacing: "0.22em", fontSize: size, color }}>{l}</span>;
  const hideBtn = a => manage && (
    <button onClick={() => hide(a.id)} style={{ marginLeft: 10, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, color: C.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{a.hidden ? "Show in the Hall" : "Hide"}</button>
  );
  const tabs = [["month", "This month"], ["all", "All-time greats"], ["archive", "The archive"]];
  const tabOn = t => (t === "month" ? view.tab === "month" : view.tab === t);
  const featuredLabel = view.tab === "all" ? "The greatest so far" : data?.official ? "Expression of the Month" : "Featured this month";
  const list = data ? (all ? data.list : data.list.slice(0, 6)) : [];
  // ranks in the list: the same points, the same rank (the featured expression is 1)
  const listRank = [];
  if (data?.top) data.list.forEach((a, i) => { const prev = i === 0 ? data.top : data.list[i - 1]; listRank.push(a.points === prev.points ? (i === 0 ? 1 : listRank[i - 1]) : i + 2); });

  return (
    <div style={{ minHeight: "100vh", color: C.textPrimary, padding: "18px 16px 0", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 44, lineHeight: 1.05, ...honkTitle }}>Hall of Expressions</h1>
            <div style={{ color: "var(--c-bgText)", fontSize: 17, marginTop: 4 }}>Some words deserve to be remembered.</div>
          </div>
          <BtnSecondary onClick={() => navigate("/")} style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 15, padding: "6px 14px" }}>← Grand Sky Station</BtnSecondary>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            {tabs.map(([t, label]) => (
              <button key={t} onClick={() => setView({ tab: t, monthKey: null })}
                style={{ border: "none", background: tabOn(t) ? gold : "transparent", color: tabOn(t) ? "#1B1A17" : C.textPrimary, padding: "8px clamp(10px, 3vw, 18px)", whiteSpace: "nowrap", fontWeight: 700, fontSize: "clamp(13px, 3.6vw, 15px)", fontFamily: "inherit", cursor: "pointer" }}>{label}</button>
            ))}
          </div>
          {(data?.isAdmin) && <button onClick={() => setManage(m => !m)} style={{ marginLeft: "auto", background: "none", border: "none", color: manage ? C.teal : C.textMuted, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{manage ? "Done managing" : "Manage"}</button>}
        </div>

        {err && <Panel style={{ padding: 16 }}><p style={{ margin: 0, color: C.brand }}>{err}</p></Panel>}

        {/* The archive: every month, newest first */}
        {view.tab === "archive" && !err && (!months ? <p style={{ color: "var(--c-bgText)" }}>Loading…</p> : months.length === 0 ? (
          <p style={{ color: "var(--c-bgText)" }}>The archive is still empty.</p>
        ) : (
          <Panel style={{ padding: "4px 18px" }}>
            {months.map((m, i) => (
              <button key={m.monthKey} onClick={() => setView({ tab: "month", monthKey: m.monthKey })}
                style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: i > 0 ? `1px solid ${C.border}` : "none", padding: "16px 4px", color: C.textPrimary, cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 24, ...honkTitle }}>{m.month}</span>
                  <span style={{ fontSize: 14, color: C.textMuted }}>{m.count} expression{m.count === 1 ? "" : "s"}{m.official ? "" : " · this month"}</span>
                  <span style={{ marginLeft: "auto", color: C.teal, fontWeight: 700, fontSize: 14 }}>Open →</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700 }}>“{m.top.sentence}”</div>
                <div style={{ fontSize: 14, color: C.textMuted, marginTop: 2 }}>by {m.top.by}</div>
              </button>
            ))}
          </Panel>
        ))}

        {view.tab !== "archive" && !err && !data && <p style={{ color: "var(--c-bgText)" }}>Loading…</p>}
        {view.tab !== "archive" && data && (
          <>
            {view.monthKey && <button onClick={() => setView({ tab: "archive", monthKey: null })} style={{ alignSelf: "flex-start", marginTop: -6, background: "none", border: "none", color: C.teal, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>← The archive</button>}
            {!data.top ? (
              <p style={{ color: "var(--c-bgText)", fontSize: 16 }}>No expressions with votes yet {view.tab === "all" ? "" : `in ${data.month}`}. Board a Sky Train and write one!</p>
            ) : (
              <>
                {/* The featured expression: context, the line, the writer, then the details */}
                <div style={{ background: C.bgPanel, color: C.textPrimary, border: `2px solid ${gold}`, borderRadius: 16, padding: "24px clamp(16px, 5vw, 28px) 26px", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
                  <div style={{ fontSize: 13, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 800, color: gold, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Crown size={18} />{featuredLabel}{view.tab !== "all" && data.month && data.official ? ` · ${data.month}` : ""}</div>
                  {data.top.topic && <div style={{ fontSize: 15, marginTop: 16, color: C.textMuted }}>{data.top.topic}</div>}
                  <div style={{ fontSize: "clamp(24px, 6.4vw, 32px)", lineHeight: 1.25, fontWeight: 800, margin: "8px auto 0", maxWidth: "26ch" }}>“{data.top.sentence}”</div>
                  {/* the writer: big and in gold, being featured should mean something (Damon) */}
                  <div style={{ marginTop: 14 }}>{names(data.top.by, 40)}</div>
                  <div style={{ fontSize: 15, marginTop: 8, color: C.textMuted }}>
                    {letters(data.top.letters, C.textSecond, 15)} <span style={{ marginLeft: 8 }}>· {data.top.points} point{data.top.points === 1 ? "" : "s"} · {date(data.top)}</span>{hideBtn(data.top)}
                  </div>
                </div>

                {/* The rest, one readable column */}
                {data.list.length > 0 && (
                  <Panel style={{ padding: "14px 18px 4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                      <span style={{ fontSize: 14, letterSpacing: "0.14em", textTransform: "uppercase", color: C.teal, fontWeight: 800 }}>{view.tab === "all" ? "More all-time greats" : `More expressions from ${data.month}`}</span>
                      {data.list.length > 6 && <button onClick={() => setAll(a => !a)} style={{ background: "none", border: "none", color: C.textPrimary, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit" }}>{all ? "Show fewer" : "View all →"}</button>}
                    </div>
                    {list.map((a, i) => (
                      <div key={a.id} style={{ display: "grid", gridTemplateColumns: "clamp(28px, 8vw, 44px) 1fr auto", gap: "clamp(8px, 2.5vw, 14px)", alignItems: "center", padding: "16px 4px", borderBottom: i < list.length - 1 ? `1px solid ${C.border}` : "none", opacity: a.hidden ? 0.45 : 1 }}>
                        <span style={{ fontSize: "clamp(22px, 6vw, 30px)", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: listRank[i] <= 3 ? gold : C.textMuted, textAlign: "center" }}>{a.hidden ? "–" : listRank[i]}</span>
                        <div style={{ minWidth: 0 }}>
                          {a.topic && <div style={{ fontSize: 14, color: C.textMuted }}>{a.topic}</div>}
                          <div style={{ fontSize: "clamp(17px, 4.6vw, 21px)", lineHeight: 1.3, fontWeight: 700, marginTop: 2 }}>“{a.sentence}”</div>
                          <div style={{ marginTop: 4 }}>{names(a.by, 26)}</div>
                          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
                            {letters(a.letters, C.textSecond, 13)}<span style={{ marginLeft: 10 }}>· {date(a)}</span>{hideBtn(a)}
                          </div>
                        </div>
                        <span style={{ border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 12px", fontWeight: 800, fontSize: 15, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{a.points} pts</span>
                      </div>
                    ))}
                  </Panel>
                )}
              </>
            )}
          </>
        )}
      </div>
      <Footer />
      <PassengerCard />
    </div>
  );
}

// "📰 News" button in the lobby header (Station News), with a dot when there's a post this browser hasn't seen. The dot
// sits on the corner, so the button keeps its size (nothing moves when it appears)
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
    <button onClick={() => navigate("/log")} aria-label={hasNew ? "Station News: something new" : "Station News"}
      style={{ position: "relative", background: C.bgPanel2, border: `1px solid ${hasNew ? C.teal : C.border}`, borderRadius: 8, color: C.textPrimary, cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: "6px 12px", whiteSpace: "nowrap" }}>
      📰 News
      {hasNew && <span aria-hidden style={{ position: "absolute", top: -4, right: -4, width: 10, height: 10, borderRadius: "50%", background: C.teal, boxShadow: `0 0 0 2px ${C.bgApp}` }} />}
    </button>
  );
}

// ── Sky Passport (player profiles) ─────────────────────────────────
// Built from the stats recorded since 2026-10-12. Quick card at the Grand Sky Station (click a name),
// full page at /passenger/<name>. No avatar for now (Damon, 2026-10-16). Not on trains: during a
// journey a name opens a private chat / the passenger menu instead.
// at = the clicked element (or its box): the card opens right beside it (2026-10-22); without it, in the middle
const openProfile = (name, at) => window.dispatchEvent(new CustomEvent("acro-open-profile", {
  detail: { name, rect: at?.getBoundingClientRect ? at.getBoundingClientRect() : at || null },
}));
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
// ── The share card ──────────────────────────────────────────────
// "Acro Express" in Honk, in OUR colours, as a picture for the card. A canvas can't recolour a colour font (it has
// no font-palette), so the logo is drawn as a small SVG that carries the Honk font itself and the same palette the
// site's logo uses ("mark": 0 shadow and 1 outline = the box colour, 2–7 fill = the button colour), then copied onto
// the card like a photo.
let honkFontData = null;                                   // Honk as base64, fetched once
// shln: Honk's shadow length (the logo 41; the big letters 0, as on a train)
async function honkLogoImage(text, fill, edge, px, shln = 41) {
  if (!honkFontData) {
    const bytes = new Uint8Array(await (await fetch("/fonts/honk-v6-latin.woff2")).arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    honkFontData = btoa(bin);
  }
  const colors = [edge, edge, fill, fill, fill, fill, fill, fill].map((c, i) => `${i} ${c}`).join(", ");
  const w = Math.ceil(px * text.length * 0.8), h = Math.ceil(px * 1.45);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><style>` +
    `@font-face{font-family:HonkCard;src:url(data:font/woff2;base64,${honkFontData}) format("woff2");}` +
    `@font-palette-values --card{font-family:HonkCard;override-colors:${colors};}` +
    `text{font-family:HonkCard;font-size:${px}px;font-palette:--card;font-variation-settings:'SHLN' ${shln},'MORF' 15;}` +
    `</style><text x="50%" y="${Math.round(px * 1.05)}" text-anchor="middle">${text}</text></svg>`;
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  await img.decode();
  return img;
}
// A 1080 × 1080 picture of one acro, always in Golden Hour (the brand look, whatever the player's own colours are):
// the logo, then a Sky Train ticket (station winner, the letters, the topic, a tear line, the acro with each word's
// first letter in gold, who wrote it, the points in a badge), and where to play. No times. Returns a PNG Blob.
async function makeAcroCard({ letters, topic, acro, points, won, by }) {
  const W = 1080, c = document.createElement("canvas");
  c.width = W; c.height = W;
  const g = c.getContext("2d");
  // the fonts must be loaded before the canvas can draw with them
  await Promise.all(["48px 'Bowlby One SC'", "800 48px Nunito", "700 48px Nunito"].map(x => document.fonts.load(x).catch(() => { })));
  const P = THEMES.goldenhour;
  // the sky
  const sky = g.createLinearGradient(0, 0, 0, W);
  sky.addColorStop(0, "#B06F48"); sky.addColorStop(0.6, "#C4855A"); sky.addColorStop(1, "#D49C6C");
  g.fillStyle = sky; g.fillRect(0, 0, W, W);
  // The clouds: Damon's own picture (2026-10-23: "copy them if you can't draw them"), public/share/card-clouds.webp,
  // drawn under the logo (the sky above it stays ours). It is the card as he drew it, so our ticket and words cover
  // its own; its "Play free" words are first covered with patches of its clouds from just above them, soft-edged.
  try {
    const img = new Image();
    img.src = "/share/card-clouds.webp";
    await img.decode();
    const t = document.createElement("canvas"); t.width = img.width; t.height = img.height;
    const tg = t.getContext("2d");
    tg.drawImage(img, 0, 0);
    const p = document.createElement("canvas"); p.width = 560; p.height = 60;      // the patch: clouds under the ticket
    const pg = p.getContext("2d");
    pg.drawImage(t, 75, 566, 560, 60, 0, 0, 560, 60);
    pg.globalCompositeOperation = "destination-in";                               // soft top and bottom edges
    const fade = pg.createLinearGradient(0, 0, 0, 60);
    fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(0.1, "#000"); fade.addColorStop(0.9, "#000"); fade.addColorStop(1, "rgba(0,0,0,0)");
    pg.fillStyle = fade; pg.fillRect(0, 0, 560, 60);
    const side = pg.createLinearGradient(0, 0, 560, 0);                            // and soft sides
    side.addColorStop(0, "rgba(0,0,0,0)"); side.addColorStop(0.08, "#000"); side.addColorStop(0.92, "#000"); side.addColorStop(1, "rgba(0,0,0,0)");
    pg.fillStyle = side; pg.fillRect(0, 0, 560, 60);
    tg.drawImage(p, 75, 622); tg.drawImage(p, 75, 650);                           // over its words (rows 627–680)
    const sy = 111, k = W / t.height;                                             // from just under its logo
    g.drawImage(t, 0, sy, t.width, t.height - sy, 0, sy * k, W, W - sy * k);
  } catch { /* without the picture: the plain sky */ }
  g.textAlign = "center"; g.textBaseline = "alphabetic";

  // the logo, as on the site (Golden Hour: gold, with a plum outline and shadow)
  try {
    const logo = await honkLogoImage("Acro Express", P.brand, P.bgPanel, 104);
    g.drawImage(logo, (W - logo.width) / 2, 12);
  } catch {
    g.font = "96px 'Bowlby One SC', sans-serif"; g.fillStyle = P.brand; g.fillText("Acro Express", W / 2, 130);
  }

  // the ticket: a plum Sky Train ticket, with a notch on each side at the tear line
  // a few pixels bigger than the ticket in Damon's cloud picture, so its edge never shows around ours
  const X = 91, Y = 170, TW = W - 182, TH = 698, TEAR = 470;
  g.beginPath(); g.roundRect(X, Y, TW, TH, 34);
  g.fillStyle = P.bgPanel; g.fill();
  g.lineWidth = 3; g.strokeStyle = P.border; g.stroke();
  g.fillStyle = sky;                                       // the notches show the sky behind
  for (const x of [X, X + TW]) { g.beginPath(); g.arc(x, TEAR, 26, 0, Math.PI * 2); g.fill(); }
  g.save(); g.setLineDash([14, 12]); g.lineWidth = 3; g.strokeStyle = P.border;
  g.beginPath(); g.moveTo(X + 44, TEAR); g.lineTo(X + TW - 44, TEAR); g.stroke(); g.restore();

  // the top of the ticket: station winner, the letters, the topic
  g.font = "800 28px Nunito, sans-serif"; g.fillStyle = P.teal;
  g.fillText(won ? "🏆  STATION WINNER" : "🚂  SKY TRAIN TICKET", W / 2, 240);
  const L = String(letters || "").toUpperCase().split("").filter(ch => /[A-Z]/.test(ch));
  // the big letters in Honk (Damon, 2026-10-23), gold with a plum outline, as on a train
  const lSize = L.length > 6 ? 150 : 190;                // Honk's capitals are small: bigger than Bowlby was
  try {
    const big = await honkLogoImage(L.join(" "), P.brand, P.bgPanel, lSize, 0);
    g.drawImage(big, (W - big.width) / 2, 375 - lSize * 1.05);
  } catch {
    g.font = `${Math.round(lSize * 0.82)}px 'Bowlby One SC', sans-serif`; g.fillStyle = P.brand; g.fillText(L.join("  "), W / 2, 375);
  }
  g.font = "800 28px Nunito, sans-serif"; g.fillStyle = P.textMuted;
  const tp = String(topic || "General Acro");
  g.fillText(`TOPIC  ·  ${(tp.length > 44 ? tp.slice(0, 43) + "…" : tp).toUpperCase()}`, W / 2, 430);

  // the acro: as big as fits, the first letter of each word lit in gold. A short acro stays on one line (down to
  // 60 px); a longer one gets up to four lines
  const words = String(acro || "").trim().split(/\s+/);
  let size = 78, lines = [];
  const fit = maxLines => {
    for (size = 78; size >= (maxLines === 1 ? 60 : 38); size -= 2) {
      g.font = `800 ${size}px Nunito, sans-serif`;
      lines = []; let line = [];
      for (const w of words) {
        const t = [...line, w].join(" ");
        if (g.measureText(`“${t}”`).width > TW - 120 && line.length) { lines.push(line); line = [w]; } else line.push(w);
      }
      if (line.length) lines.push(line);
      if (lines.length <= maxLines) return true;
    }
    return false;
  };
  if (!fit(1)) fit(4);
  g.font = `800 ${size}px Nunito, sans-serif`; g.textAlign = "left";
  const lh = size * 1.2, mid = 625, top0 = mid - ((lines.length - 1) * lh) / 2 + size * 0.35;
  lines.forEach((ln, li) => {
    const pieces = [];                                     // [text, gold?]
    if (li === 0) pieces.push(["“", false]);
    ln.forEach((w, wi) => {
      const k = w.search(/[A-Za-z0-9]/);
      if (k < 0) pieces.push([w, false]);
      else { if (k > 0) pieces.push([w.slice(0, k), false]); pieces.push([w[k], true]); pieces.push([w.slice(k + 1), false]); }
      if (wi < ln.length - 1) pieces.push([" ", false]);
    });
    if (li === lines.length - 1) pieces.push(["”", false]);
    const width = pieces.reduce((sum, [t]) => sum + g.measureText(t).width, 0);
    let x = (W - width) / 2;
    for (const [t, gold] of pieces) { g.fillStyle = gold ? P.brand : P.ivory; g.fillText(t, x, top0 + li * lh); x += g.measureText(t).width; }
  });
  g.textAlign = "center";

  // who wrote it
  if (by) {
    g.font = "800 36px Nunito, sans-serif"; g.fillStyle = P.teal;
    g.fillText(`— ${by}`, W / 2, 750);
  }

  // the points, in a badge (what counts in the game)
  const n = Number(points) || 0;
  if (n) {
    const label = `★  ${n} point${n === 1 ? "" : "s"}`;
    g.font = "800 36px Nunito, sans-serif";
    const bw = g.measureText(label).width + 64;
    g.beginPath(); g.roundRect((W - bw) / 2, 786, bw, 58, 29);
    g.fillStyle = P.brand; g.fill();
    g.fillStyle = P.onBrand; g.fillText(label, W / 2, 827);
  }

  // where to play: plum on the cream clouds
  g.font = "800 44px Nunito, sans-serif"; g.fillStyle = P.bgPanel;
  g.fillText("Play free at acro.express", W / 2, 990);
  g.font = "700 30px Nunito, sans-serif"; g.fillStyle = P.navy3;
  g.fillText("The multiplayer acronym game. Can you beat this one?", W / 2, 1038);
  return new Promise(res => c.toBlob(res, "image/png"));
}
// Share it: the phone's share sheet (with the link, tagged so the Numbers page counts it), or a download
async function shareAcroCard(a) {
  const blob = await makeAcroCard(a);
  if (!blob) return;
  const name = `acro-express-${String(a.letters || "acro").replace(/[^A-Za-z]/g, "").toUpperCase() || "acro"}.png`;
  const file = new File([blob], name, { type: "image/png" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: "An acro from Acro Express. Can you beat it? https://acro.express/?from=share" });
      return;
    }
  } catch (e) { if (e?.name === "AbortError") return; }   // closed the share sheet: nothing more to do
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
// The small "Share" button next to an acro
function ShareAcroButton({ a, label = "Share" }) {
  const [busy, setBusy] = useState(false);
  return (
    <button onClick={async e => { e.stopPropagation(); setBusy(true); try { await shareAcroCard(a); } finally { setBusy(false); } }}
      data-hint="A picture of this acro, to send to friends" disabled={busy}
      style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 999, color: C.teal, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, padding: "1px 9px", whiteSpace: "nowrap", fontStyle: "normal" }}>
      📤 {busy ? "…" : label}
    </button>
  );
}

function AcroQuote({ a, big, share, by }) {
  return (
    <div style={{ borderLeft: `3px solid ${C.teal}`, padding: "2px 0 2px 12px" }}>
      <div style={{ fontFamily: "Fredoka, sans-serif", fontSize: big ? 20 : 17, color: C.ivory }}>"{a.sentence}"</div>
      <div style={{ fontSize: 13, color: C.textMuted }}>
        {a.letters.split("").join(" ")} · {a.topic} · <span style={{ color: C.teal }}>{a.points != null ? `${a.points} point${a.points === 1 ? "" : "s"} · ` : ""}{a.votes} vote{a.votes === 1 ? "" : "s"}</span>{a.won ? " · won the station" : ""}
        {share && <> <ShareAcroButton a={{ letters: a.letters, topic: a.topic, acro: a.sentence, points: a.points, won: a.won, by }} /></>}
      </div>
    </div>
  );
}
function PassHeader({ p, big }) {
  return (
    <div>
      {/* The name in Honk, in the letters colour (Damon, 2026-10-18) */}
      <div style={{ ...honkTitle, fontSize: big ? 46 : 36, color: C.brand, fontPalette: "var(--fp-letters)", lineHeight: 1.05, overflowWrap: "anywhere" }}>{p.name}</div>
      <div style={{ color: C.textSecond, fontSize: 15, marginTop: 2 }}>
        <b style={{ color: C.teal }}>{p.level}</b> · on board since {monthYear(p.memberSince)}
      </div>
      <div style={{ fontSize: 14, color: p.where === "offline" ? C.textMuted : C.success, marginTop: 2 }}>● <span style={{ color: C.textSecond }}>{passWhere(p)}</span></div>
    </div>
  );
}

// Quick card — opens when a name is clicked (station and trains). inTrain: no button that leaves the train.
// 2026-10-22 (Damon: "there is a UX conflict … it's not easy to message someone"): like Discord, Slack and Twitch,
// a small card RIGHT BESIDE the name (no dark full-screen box), showing the name at once, with the message box
// ready: type and press Enter, and the private chat opens with the message sent. The stats load in underneath.
function PassengerCard({ inTrain = false }) {
  const navigate = useNavigate();
  const [name, setName] = useState(null);
  const [rect, setRect] = useState(null);                  // where the clicked name is on screen
  const [p, setP] = useState(null);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");
  const cardRef = useRef(null);
  const sendingRef = useRef(false);   // a message on its way (no second send meanwhile)
  const [top, setTop] = useState(null);                    // measured: the card's top, kept inside the window
  useEffect(() => {
    const open = e => {
      const d = typeof e.detail === "string" ? { name: e.detail } : e.detail;
      setName(d.name); setRect(d.rect || null); setP(null); setErr(""); setText(""); setTop(null);
    };
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
  // Under the name if the card fits there, else above it, else as low as fits — never off the screen (2026-10-22:
  // at the station the list is low on the page and the card opened above it, its name and message box out of sight)
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el || !rect || window.innerWidth < 600) return;
    const h = el.offsetHeight, H = window.innerHeight;
    const t = rect.bottom + 6 + h <= H - 8 ? rect.bottom + 6 : rect.top - 6 - h >= 8 ? rect.top - 6 - h : Math.max(8, H - h - 8);
    if (t !== top) setTop(t);
  }, [name, p, err, rect, top]);   // again when the stats load in (the card grows)
  if (!name) return null;
  const me = String(getAuth()?.username || "").toLowerCase() === String(name).toLowerCase();
  const send = async () => {
    const t = text.trim();
    if (!t) { openPm(name); setName(null); return; }      // nothing typed: just open the chat
    if (sendingRef.current) return;                         // one on its way: not again
    sendingRef.current = true;
    const ok = await sendPm(name, t).finally(() => { sendingRef.current = false; });
    openPm(name);                                           // the chat shows the message (or the error)
    if (ok !== false) setName(null);
  };
  // Beside the name: under it (or above it when it's low on the screen), kept inside the window
  const W = Math.min(360, window.innerWidth - 16);
  const place = rect && window.innerWidth >= 600
    ? { left: Math.max(8, Math.min(rect.left, window.innerWidth - W - 8)), top: top ?? rect.bottom + 6, visibility: top == null ? "hidden" : "visible" }
    : { left: (window.innerWidth - W) / 2, top: "12vh" };
  return (
    <div onPointerDown={e => { if (e.target === e.currentTarget) setName(null); }}
      style={{ position: "fixed", inset: 0, zIndex: 88, background: rect ? "transparent" : "rgba(0,0,0,0.35)" }}>
      <div ref={cardRef} role="dialog" aria-label={`${name}`} style={{ position: "fixed", ...place, maxHeight: "calc(100vh - 16px)", overflowY: "auto", background: C.bgPanel, border: `1px solid ${C.teal}`, borderRadius: 14, width: W, boxSizing: "border-box", padding: 16, boxShadow: "0 16px 48px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          {p ? <PassHeader p={p} /> : <div style={{ ...honkTitle, fontSize: 32, color: C.brand, fontPalette: "var(--fp-letters)" }}>{name}</div>}
          <button onClick={() => setName(null)} aria-label="Close" style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        {/* The message box first: type and press Enter */}
        {!me && (
          <form onSubmit={e => { e.preventDefault(); send(); }} style={{ display: "flex", gap: 8 }}>
            <input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder={`Message ${name}…`} maxLength={500}
              style={{ flex: 1, minWidth: 0, background: C.bgApp, border: `2px solid ${C.focusLine}`, borderRadius: 8, padding: "8px 12px", color: C.textPrimary, fontSize: 15, outline: "none", fontFamily: "inherit" }} />
            {/* no onClick: the button submits the form; with both, Enter and Send sent every message twice (2026-10-26) */}
            <Btn style={{ padding: "6px 14px" }}>Send</Btn>
          </form>
        )}
        {err && <div style={{ color: C.textMuted, fontSize: 14 }}>{err}</div>}
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
            {!inTrain && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <BtnSecondary onClick={() => { setName(null); navigate(`/passenger/${encodeURIComponent(p.name)}`); }}>Open Sky Passport →</BtnSecondary>
              </div>
            )}
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
  const [ladderOpen, setLadderOpen] = useState(false);   // the whole Sky Rank ladder, under the rank
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
              {/* The rank and the way up: Sky Miles are the points of the games that count (2026-10-26; the ladder is
                  in the server's Utils/Ranks) */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                  {/* a click opens the whole ladder below, this rank highlighted (2026-10-27) */}
                  <button onClick={() => setLadderOpen(o => !o)} aria-expanded={ladderOpen} data-hint="See all the Sky Ranks"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 15, color: C.teal }}>
                    <b>{p.level}</b> <span style={{ fontSize: 12, color: C.textMuted }}>{ladderOpen ? "▲" : "▼"}</span>
                  </button>
                  <span style={{ fontSize: 14, color: C.textSecond, fontVariantNumeric: "tabular-nums" }}>{(p.skyMiles ?? 0).toLocaleString()} Sky Miles</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: C.bgApp }}>
                  <div style={{ width: `${Math.round(p.levelProgress * 100)}%`, height: 8, borderRadius: 4, background: C.teal }} />
                </div>
                <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
                  {p.nextLevel ? `${(p.milesToNext ?? 0).toLocaleString()} Sky Miles to ${p.nextLevel}` : "The top of the ladder: a Legend of the Line"}
                </div>
                {ladderOpen && <div style={{ marginTop: 10 }}><SkyRankLadder mine={p.level} /></div>}
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
                : p.topAcros.map((a, i) => <AcroQuote key={i} a={a} big={i === 0} share={me} by={p.name} />)}   {/* your own acros only */}
            </Panel>

            <Panel style={{ padding: 20 }}>
              <h2 style={{ margin: "0 0 10px", fontSize: 28, ...smallTitle }}>Last 10 stations</h2>   {/* Honk */}
              {p.last10.length === 0 ? <p style={{ margin: 0, color: C.textMuted }}>No stations yet.</p> : (
                // 2026-10-22 (Damon: "a place without numbers, the chart is not clear"): each bar shows its points on
                // top and its letters underneath, oldest on the left; a dashed line marks the average; won = teal ★
                (() => {
                  const avg = p.last10.reduce((sum, st) => sum + st.points, 0) / p.last10.length;
                  const H = 110;                                                   // the bars' area, px
                  return (
                    <>
                      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 6, height: H + 20, paddingTop: 4 }}>
                        {/* the average */}
                        <div style={{ position: "absolute", left: 0, right: 0, bottom: Math.round(avg / maxPts * H), borderTop: `1px dashed ${C.textMuted}`, opacity: 0.6 }} />
                        {p.last10.map((st, i) => (
                          <div key={i} title={`${st.letters.split("").join(" ")} · ${st.points} point${st.points === 1 ? "" : "s"}${st.won ? " · won the station" : ""} · ${new Date(st.atUtc).toLocaleDateString([], { day: "numeric", month: "short" })}`}
                            style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: st.won ? C.teal : C.textSecond, marginBottom: 3 }}>{st.won ? "★" : ""}{st.points}</span>
                            <div style={{ width: "100%", height: Math.max(3, Math.round(st.points / maxPts * H)), background: st.won ? C.teal : C.navy3 || C.border, border: `1px solid ${st.won ? C.teal : C.border}`, borderRadius: 4, boxSizing: "border-box" }} />
                          </div>
                        ))}
                      </div>
                      {/* the letters of each station, under its bar */}
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        {p.last10.map((st, i) => (
                          <span key={i} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 11, color: C.textMuted, letterSpacing: "0.05em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st.letters}</span>
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 12, color: C.textMuted, marginTop: 8 }}>
                        <span>← older · newer →</span>
                        <span>Points per station · <span style={{ color: C.teal }}>★ teal = won</span> · dashed line = average ({avg.toFixed(1)})</span>
                      </div>
                    </>
                  );
                })()
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
  const [username, setUsername] = useState(() => { try { return localStorage.getItem("acro.passport") || ""; } catch { return ""; } });   // a returning passenger's name, filled in
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState(() => {
    const saved = localStorage.getItem("acro.auth");
    return saved ? JSON.parse(saved) : null;
  });
  const navigate = useNavigate();
  const { players, messages, notices, sendMessage, rooms: pushedRooms } = useContext(StationContext);   // the shared station connection (App)
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
  const [localLines, setLocalLines] = useState([]);       // the answers to your chat commands, only on your screen
  const lobbyChat = (() => {
    const from = lobbySession.length ? new Date(lobbySession[0].time).getTime() : Math.max(chatNow, Date.now()) - QUIET_MS;
    const lines = [...notices.filter(n => n.time.getTime() >= from).map(n => ({ ...n, notice: true })),
      ...localLines];   // your command answers stay (this page only)
    return [...lobbySession, ...lines].sort((a, b) => new Date(a.time) - new Date(b.time));
  })();
  const [chatInput, setChatInput] = useState("");
  const lobbyBottomRef = useRef(null);
  // Create Room: an inline name field instead of the browser's pop-up
  const [creating, setCreating] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [createError, setCreateError] = useState("");

  // The sign-in card's state: which tab ("new" = get a Sky Passport, "login"), its message, busy while sending
  // Newcomers see "I'm new"; a browser that has had a passport opens on "I have a passport", with the name filled in
  // (Zyngacita, 2026-10-26: she always landed on "I'm new", even after logging out, and her browser filled her name and
  // password into the wrong form). The note "acro.passport" (the name) is kept when logging out.
  const passportName = (() => { try { return localStorage.getItem("acro.passport") || ""; } catch { return ""; } })();
  const [authMode, setAuthMode] = useState(passportName ? "login" : "new");
  useEffect(() => { if (auth?.username) try { localStorage.setItem("acro.passport", auth.username); } catch { /* private mode */ } }, [auth]);
  const [authMsg, setAuthMsg] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  // The server's answers, in friendly words (they used to pop up raw: "400: Username and password are required.")
  const friendlyAuthError = (e, mode) => {
    const m = String(e?.message || e || "");
    if (/required/i.test(m)) return "Type a passenger name and a password.";
    if (/3-20 chars/i.test(m)) return "Names are 3 to 20 letters, numbers or _ (no spaces).";
    if (/already taken/i.test(m)) return "That name is already taken. If it's yours, choose \"I have a passport\".";
    if (/invalid credentials/i.test(m)) return mode === "login" ? "That name and password don't match. Check the spelling, or choose \"I'm new\"." : m;
    if (/too many/i.test(m)) return "Too many tries. Wait a minute and try again.";
    if (/fetch|network|failed/i.test(m)) return "We can't reach the station right now. Try again in a moment.";
    return m.replace(/^\d{3}:\s*/, "");
  };
  async function doAuth(mode) {
    if (!username.trim() || !password) {
      // (Damon: "get your sky passport is not working if you just land and click it") — go to the empty box
      setAuthMsg(!username.trim() ? "First, pick a passenger name." : "Now choose a password.");
      document.getElementById(!username.trim() ? "welcomeName" : "welcomePass")?.focus();
      return;
    }
    setAuthBusy(true); setAuthMsg("");
    try {
      const api = await import("./services/api");
      const data = await (mode === "new" ? api.register : api.login)(username.trim(), password);
      if (mode === "new") track("signup");             // counted with the source the visit came from
      localStorage.setItem("acro.auth", JSON.stringify(data));
      try { localStorage.setItem("acro.passport", data.username || username.trim()); } catch { /* private mode */ }   // next time: "I have a passport"
      authChanged();   // the station connection logs in too
      setAuth(data); setUsername(""); setPassword("");
    } catch (e) { setAuthMsg(friendlyAuthError(e, mode)); }
    setAuthBusy(false);
  }
  // The practice ride, open over the station (you stay on the platform while you practise)
  const [practicing, setPracticing] = useState(false);
  // The latest Station Log post, for the Station Board
  const [latestLog, setLatestLog] = useState(null);       // { title, body } (the body for the news card)
  useEffect(() => {
    fetch(`${API_URL}/api/log`).then(r => r.json()).then(d => setLatestLog(d.entries?.[0] || null)).catch(() => { });
  }, []);
  // Who's around, for the welcome screen ("Right now: 3 passengers at the station")
  const [liveNow, setLiveNow] = useState(null);
  useEffect(() => {
    // also signed in: the Daily Express row needs to know if tonight's game was played (lastStationUtc)
    const load = () => {
      fetch(`${API_URL}/api/status`).then(r => r.json()).then(d => { setSchedule(d); setLiveNow(d); }).catch(() => { });
      loadSched();
    };
    load(); const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [auth]);
  // Games passengers scheduled (Regulars and up, 2026-10-26): { games, canSchedule, hasOne }
  const [sched, setSched] = useState({ games: [], canSchedule: false, hasOne: false });
  function loadSched() {
    fetch(`${API_URL}/api/schedule`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setSched(d); }).catch(() => { });
  }
  // the schedule form: name, day (0 = today … 6), time (local "HH:MM")
  const [schedForm, setSchedForm] = useState(null);
  const [schedErr, setSchedErr] = useState("");
  async function submitSched() {
    const { id, day, time } = schedForm;   // id: changing the time of that game
    const [hh, mm] = (time || "").split(":").map(Number);
    if (!time || Number.isNaN(hh)) { setSchedErr("Pick a time."); return; }
    const d = new Date(); d.setDate(d.getDate() + Number(day)); d.setHours(hh, mm || 0, 0, 0);   // in the player's own time
    const r = await fetch(`${API_URL}/api/schedule${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ startsAtUtc: d.toISOString() }) }).catch(() => null);
    if (!r) { setSchedErr("Couldn't reach the station. Try again."); return; }
    if (!r.ok) { setSchedErr((await r.text()) || "Couldn't schedule it."); return; }
    setSchedForm(null); setSchedErr(""); loadSched();
  }
  function editSched(g) {
    const d = new Date(g.departs), today = new Date(); today.setHours(0, 0, 0, 0);
    const day = Math.max(0, Math.min(6, Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / 86400000)));
    setSchedForm({ id: g.id, day, time: d.toTimeString().slice(0, 5) }); setSchedErr("");
  }
  async function cancelSched(id) {
    await fetch(`${API_URL}/api/schedule/${id}`, { method: "DELETE", headers: authHeaders() }).catch(() => { });
    loadSched();
  }
  // the "Later" row: which game it shows (it flips every 4 s), and whether the full list is open
  const [laterIdx, setLaterIdx] = useState(0);
  const [laterOpen, setLaterOpen] = useState(false);
  useEffect(() => { const iv = setInterval(() => setLaterIdx(i => i + 1), 4000); return () => clearInterval(iv); }, []);

  function doLogout() {
    localStorage.removeItem("acro.auth");
    authChanged();   // the station connection closes
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
    // Every 30 s as a backup only (was every 5 s): the server sends the list itself when trains change (below)
    const iv = setInterval(loadRooms, 30000);
    return () => clearInterval(iv);
  }, []);
  // The train list the server sent ("RoomsChanged"), the moment something changed
  useEffect(() => { if (pushedRooms) setRoomList(pushedRooms); }, [pushedRooms]);

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

  // A scheduled train's "Start it →": a Sky Train with its name (if someone started it a moment ago, the name is
  // taken: then board theirs)
  async function startScheduled(name) {
    try {
      const data = await createRoom(name);
      const id = data?.id || data?.roomId;
      if (!id) throw new Error("No room id");
      navigate(`/room/${encodeURIComponent(id)}`);
    } catch {
      const theirs = roomList.find(r => String(r.name || "").trim().toLowerCase() === name.toLowerCase());
      if (theirs) navigate(`/room/${encodeURIComponent(theirs.id)}`);
      else setCreateError(`Couldn't start ${name}. Try again in a moment.`);
    }
  }

// Names for a Sky Train started without a name (Damon's list, 2026-10-24)
const TRAIN_NAMES = ["The Zephyr", "The Starlight", "The Comet", "The Grand Limited", "The Daydream", "The Nightliner", "The Cloudliner", "The Wanderer"];
  async function handleCreate() {
    // No name (just Enter): one of Damon's train names, one that isn't in use (2026-10-24)
    const taken = new Set(roomList.map(r => String(r.name || "").trim().toLowerCase()));
    const free = TRAIN_NAMES.filter(n => !taken.has(n.toLowerCase()));
    const name = newRoomName.trim() || (free.length ? free[Math.floor(Math.random() * free.length)] : `${TRAIN_NAMES[Math.floor(Math.random() * TRAIN_NAMES.length)]} ${taken.size + 1}`);
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
  // Short desktop windows (Fran's 1686×769): the chat gets more room — the welcome bar moves into the header and
  // Departures shows only the real trains plus the "New Sky Train" row (no empty placeholder rows)
  const shortWin = !phone && winH < 850;
  // Everyone online, with where they are: the station's list (players) plus the passengers aboard each train
  // (roomList). Someone aboard a train is shown aboard it, not twice.
  // Aboard a train — but never you: this page is the station, so you're here (2026-10-24: TylerDurden showed "aboard aa"
  // while standing at the station, after leaving a train the train still counted him on)
  const meName = String(auth?.username || "").toLowerCase();
  const aboard = roomList.flatMap(r => (r.playingNames || []).filter(n => String(n).toLowerCase() !== meName).map(n => ({ name: n, where: `Aboard ${r.name}`, train: r.name, trainId: r.id, full: (r.playingNames || []).length + (r.awayNames || []).length >= 16, onTrain: true })));
  const aboardSet = new Set(aboard.map(a => a.name.toLowerCase()));
  const online = [
    ...players.filter(n => !aboardSet.has(String(n).toLowerCase())).map(n => ({ name: n, where: "On the platform", onTrain: false })),
    ...aboard,
  ];
  // you, always, at the station (the Express Server leaves out of the station list anyone a train still counts aboard)
  if (auth?.username && !online.some(o => String(o.name).toLowerCase() === meName)) online.unshift({ name: auth.username, where: "On the platform", onTrain: false });
  const [listOpen, setListOpen] = useState(true);   // phones: the "On the platform" list folded open or closed
  // Enter or Send; a chat command (/?, /mu, /pc …) is answered on your own screen instead
  const sendLobby = () => {
    const t = chatInput.trim();
    if (!t) return;
    setChatInput("");
    if (chatCommand(t, line => setLocalLines(ls => [...ls, { local: true, text: line, time: new Date() }]), false)) return;
    sendMessage(t);
  };
  const boxTitle = { margin: 0, fontSize: phone ? 24 : 28, ...smallTitle, display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" };   // Honk box titles, all the same size
  const smallBtn = { fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 15, lineHeight: 1.2, padding: "8px 16px", letterSpacing: 0, display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" };
  // The greeting and your buttons: in the welcome bar, or in the header on short windows
  const welcomeParts = auth && (
    <>
      {/* 2026-10-22 (Damon): no separate My Sky Passport button — your name opens it; the Sky Leaderboard moved up
          into the header; "Leave the station" is now "Log out" */}
      <div style={{ fontSize: 16, flex: shortWin ? "none" : 1, minWidth: shortWin ? 0 : 160, whiteSpace: "nowrap" }}>{greeting("")}
        <button data-hint="Your Sky Passport: your stats, your best acros and your stamps" onClick={() => navigate(`/passenger/${encodeURIComponent(auth.username)}`)}
          style={{ background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 700, color: C.teal, cursor: "pointer", textDecoration: "underline", textDecorationColor: "rgba(127,127,127,0.4)", textUnderlineOffset: 3 }}>
          {auth.username}</button>
      </div>
      {/* the practice ride, for every player (Damon, 2026-10-22: "it's cool and reminds the players of past games"; not
          under Departures, where it competed with the trains — its own button, explained) */}
      <span data-hint="Three stations from our past games to write acros for, on your own: then see what the passengers wrote. No scores, just fun" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <BtnSecondary onClick={() => setPracticing(true)} style={smallBtn}>🚂 Practice journey</BtnSecondary>
        {!phone && !shortWin && <span style={{ fontSize: 13, color: C.textMuted, whiteSpace: "nowrap" }}>try a solo warm-up session</span>}
      </span>
      <button data-hint="Log out on this computer" onClick={doLogout} style={{ background: "none", border: "none", color: C.textMuted, fontFamily: "inherit", fontSize: 14, cursor: "pointer", padding: 4, whiteSpace: "nowrap" }}>Log out</button>
    </>
  );
  // The Station Board's news (2026-10-22): the Daily Express, the latest Station Log post, who's here, a tip
  const dailyNow = scheduledTrains(Date.now(), roomList, liveNow?.lastStationUtc)[0];   // the next scheduled train
  const boardWord = useWordOfWeek();   // for the Station Board
  const bdayAge = birthdayToday();
  // confetti once per birthday per browser: decided when the page opens, remembered once you're at the station
  const [bdayConfetti] = useState(() => { try { return bdayAge > 0 && localStorage.getItem("acro.birthday") !== String(bdayAge); } catch { return false; } });
  useEffect(() => { if (auth && bdayConfetti) try { localStorage.setItem("acro.birthday", String(bdayAge)); } catch { /* private mode */ } }, [auth, bdayConfetti, bdayAge]);
  const movingTrains = roomList.filter(r => r.gameOn);
  const boardNews = [
    ...(bdayAge ? [{ key: "birthday", icon: "🎂", text: `Acro Express turns ${bdayAge} today! On the rails since 16 August 2025. Thank you for flying with us!`,
      title: `Acro Express turns ${bdayAge} today!`, detail: "Thank you for flying with us!" }] : []),
    { key: "daily", icon: "🚂", text: dailyNow.status.text === "On the move" ? `${dailyNow.name} is on the move: hop on!`
        : dailyNow.status.text === "Running a little late 🚂" ? `${dailyNow.name} is running a little late. Start it, or wait on the platform!`
        : `Next: ${dailyNow.name} at ${dailyNow.local} your time · ${dailyNow.mins < 0 ? untilText(dailyNow.mins) : "now"}`,
      title: "Our daily trains",
      detail: <>The Continental at <b style={{ color: C.textPrimary }}>{scheduledTrain("continental", Date.now(), []).local}</b> and the Daily Express at <b style={{ color: C.textPrimary }}>{nightExpress(Date.now(), []).local}</b>, every day, with the regulars. Hop on!</> },
    ...(latestLog ? [{ key: "log", icon: "📰", text: `Station News: ${latestLog.title}`, title: latestLog.title,
      // the post itself: its "- " lines as a list
      detail: <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {String(latestLog.body || "").split(/\r?\n/).filter(l => l.trim()).slice(0, 3).map((l, k) => l.startsWith("- ")
          ? <div key={k} style={{ display: "flex", gap: 8 }}><span style={{ color: C.teal }}>•</span><span>{l.slice(2)}</span></div>
          : <div key={k}>{l}</div>)}
      </div>,
      action: { label: "Read it all →", onClick: () => navigate("/log") } }] : []),
    { key: "who", icon: "👥", text: `${online.length} passenger${online.length === 1 ? "" : "s"} at the station · ${movingTrains.length} train${movingTrains.length === 1 ? "" : "s"} on the move`,
      title: "Who's around",
      detail: online.length ? online.map(o => o.name).join(", ") : "Nobody yet. Start a Sky Train!" },
    ...(boardWord ? [{ key: "word", icon: "📖", text: `Word of the week: ${boardWord.word.toUpperCase()}, ${boardWord.meaning}. Use it in an acro that gets a vote: +1!`,
      title: `Word of the week: ${boardWord.word}`,
      // short on the board's line, longer in the card (Damon, 2026-10-23)
      detail: <><span>{boardWord.more || `${boardWord.meaning[0].toUpperCase()}${boardWord.meaning.slice(1)}.`}</span>
        <div style={{ marginTop: 8 }}>Use it in an acro that gets a vote: <b style={{ color: C.textPrimary }}>+1 point</b>.</div></> }] : []),
    // news itself (Damon, 2026-10-23): the board's lines can be clicked. On the board until 6 November, then a tip
    ...(Date.now() < Date.UTC(2026, 10, 6) ? [{ key: "clickme", icon: "🆕", text: "New: click any line on this board to read more.", title: "Click the board", detail: "Every line on the Station Board opens like this." }] : []),
    { key: "tip", icon: "💡", text: BOARD_TIPS[Math.floor(Date.now() / 3600000) % BOARD_TIPS.length],   // a different tip every hour
      title: "Tip", detail: BOARD_TIPS[Math.floor(Date.now() / 3600000) % BOARD_TIPS.length].replace(/^Tip: (.)/, (m, c) => c.toUpperCase()) },
  ];
  // Departures: the trains, then free platforms so the board always shows 3 rows — and always at least one
  // free platform, the row where you start a new Sky Train
  const used = new Set(roomList.map(r => r.platform));
  const freeRows = shortWin ? 1 : Math.max(1, 1 - roomList.length);   // short windows: just the New Sky Train row (the two scheduled rows count among the 3)
  const scheduled = scheduledTrains(Date.now(), roomList, liveNow?.lastStationUtc);
  // Trains with passengers stand out (2026-10-25): a lit row, a pulsing dot, and who is aboard
  const aliveRow = { background: `color-mix(in srgb, ${C.teal} 10%, transparent)`, boxShadow: `inset 3px 0 0 ${C.success}` };
  const liveDot = <span className="acro-live" aria-hidden style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: C.success, marginRight: 7, verticalAlign: "middle", flexShrink: 0 }} />;
  const whoAboard = names => (names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} +${names.length - 3}`);
  // Players' scheduled games as board rows (the same shape as the daily trains), and all departures in time order
  const when = ms => {
    const d = new Date(ms), t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const today = new Date(); const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
    return d.toDateString() === today.toDateString() ? `today ${t}` : d.toDateString() === tomorrow.toDateString() ? `tomorrow ${t}` : `${d.toLocaleDateString([], { weekday: "short" })} ${t}`;
  };
  const sameTrain = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  const playerGames = (sched.games || []).map(g => {
    const departs = Date.parse(g.startsAtUtc), mins = (Date.now() - departs) / 60000;
    const room = roomList.find(r => sameTrain(r.name, g.name)) || null;
    const status = room ? (room.gameOn ? { text: "On the move", color: C.success } : { text: "Boarding now", color: C.brand })
      : mins < -30 ? { text: "Scheduled", color: C.teal } : mins < 0 ? { text: "Boarding soon", color: C.brand } : { text: "Departing now", color: C.brand };
    const label = String(g.name || "").replace(/^the\s+/i, "").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "SG";   // "The Zephyr" → ZE, like TC and DX
    return { key: g.id, id: g.id, kind: "player", name: g.name, label, departs, local: when(departs), status, room, canStart: !room && mins > -30, host: g.host, canCancel: g.canCancel };
  });
  const departures = [...scheduled.map(t => ({ ...t, kind: "daily" })), ...playerGames].sort((a, b) => (a.departs ?? Infinity) - (b.departs ?? Infinity));
  // how many departures get a fixed row: on a one-screen page the board keeps its 3 rows (the free platform, the trains
  // running, then departures; the chat above needs the height), elsewhere up to 4; the rest go in the "Later" row
  const runningCount = roomList.filter(room => !scheduled.some(t => t.room?.id === room.id && isScheduledName(room.name)) && !playerGames.some(g => g.room?.id === room.id)).length;
  const depSlots = fits ? Math.max(1, 2 - runningCount) : Math.max(2, 4 - runningCount);   // (the board: these, then LATER)
  // the busiest train with passengers, for the line under Departures
  const liveTrain = [...roomList].filter(r => (r.playingNames || []).length > 0).sort((a, b) => b.playingNames.length - a.playingNames.length)[0] || null;   // The Continental and the Daily Express (re-worked out on every refresh)
  const freeNumbers = []; for (let n = 1; freeNumbers.length < freeRows; n++) if (!used.has(n)) freeNumbers.push(n);
  const boardCols = "72px minmax(0, 2.6fr) 140px 64px minmax(0, 1fr) 170px";   // platform · train · departs · aboard · status · button
  // ── The Departures board's rows (Damon, 2026-10-26): one line each, the same columns for every train ─────────
  // platform (plain letters, no box) · the train (icon, name, a short note) · the departure time in its own box ·
  // aboard · status · the button. A row: { key, code, name, note, time, aboard, status, action, lit, hint }
  const rowGrid = { display: "grid", gridTemplateColumns: phone ? "40px minmax(0, 1fr) auto" : boardCols, gap: 12, alignItems: "center", height: phone ? undefined : 40, minHeight: phone ? 42 : undefined, boxSizing: "border-box", padding: phone ? "6px 12px" : "0 14px", borderBottom: `1px solid ${C.border}` };
  const nextRow = { background: "color-mix(in srgb, var(--c-gold) 9%, transparent)", boxShadow: "inset 3px 0 0 var(--c-gold)" };
  const codeStyle = free => ({ ...smallTitle, fontSize: 28, lineHeight: 1, color: free ? C.textMuted : C.teal });
  // the time: its own box with only the time in it, digits that don't jump; the day just before the box, outside it,
  // when it isn't today (Damon: "Day shouldn't be inside the clock"); "NOW" for a train running
  const timeBox = ms => {
    if (ms == null) return null;
    const d = new Date(ms), today = new Date().toDateString();
    const day = d.toDateString() === today ? "" : d.toLocaleDateString([], { weekday: "short" });
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
        <span style={{ width: 32, textAlign: "right", fontSize: 13, color: C.textMuted }}>{day}</span>
        <span style={{ display: "inline-flex", justifyContent: "center", minWidth: 92, boxSizing: "border-box", padding: "3px 9px", borderRadius: 6, background: C.bgApp, border: `1px solid ${C.border}`, fontFamily: "'Goldman', sans-serif", fontVariantNumeric: "tabular-nums", fontSize: 16, color: "var(--c-gold)" }}>
          {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
        </span>
      </span>
    );
  };
  const nowBox = <span style={{ display: "inline-flex", justifyContent: "center", minWidth: 92, marginLeft: 39, boxSizing: "border-box", padding: "3px 9px", borderRadius: 6, background: C.bgApp, border: `1px solid ${C.success}`, fontFamily: "'Goldman', sans-serif", fontSize: 15, color: C.success, letterSpacing: "0.1em" }}>NOW</span>;
  const linkBtn = (label, onClick, color = C.textSecond) => <button onClick={onClick} style={{ background: "none", border: "none", padding: 0, color, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>{label}</button>;
  const trainCell = r => (
    <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, whiteSpace: "nowrap" }}>
      <Icon name="train" size={20} color={C.textSecond} />
      {r.lit && liveDot}
      <b style={{ fontWeight: 600, fontSize: 15, flexShrink: 0, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</b>
      {r.note && <span style={{ fontSize: 13, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis" }}>· {r.note}</span>}
    </span>
  );
  const boardRow = r => (
    <div key={r.key} data-hint={r.hint} style={{ ...rowGrid, ...(r.lit ? aliveRow : r.next ? nextRow : {}) }}>
      {/* the next train: its platform code in gold (with the gold edge and "Next · in …"); no tag (Damon, 2026-10-26) */}
      <span style={{ ...codeStyle(false), ...(r.next ? { color: "var(--c-gold)", fontPalette: "var(--fp-gold)" } : {}) }}>{r.code}</span>
      <span style={{ minWidth: 0 }}>{trainCell(r)}</span>
      {phone ? <span style={{ display: "flex", gap: 8, alignItems: "center" }}>{r.time}{r.action}</span> : <>
        <span>{r.time}</span>
        <span style={{ fontSize: 14, color: C.textSecond, display: "inline-flex", alignItems: "center", gap: 5 }}>{r.aboard != null && <><Icon name="users" size={15} /> {r.aboard}</>}</span>
        <span>{r.status && <StatusPill {...r.status} />}</span>
        <span style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}>{r.action}</span>
      </>}
    </div>
  );
  // a train running now (one a player started)
  const runningRows = roomList.filter(room => !scheduled.some(t => t.room?.id === room.id && isScheduledName(room.name)) && !playerGames.some(g => g.room?.id === room.id)).map(room => {
    const names = room.playingNames || [], away = room.awayNames || [];
    const isFull = names.length + away.length >= 16;   // 16 passengers at most, away ones included, as the server counts
    return {
      key: room.id, code: String(room.platform || 0).padStart(2, "0"), name: room.name, lit: names.length > 0,
      note: names.length === 0 ? "no one aboard yet" : `${room.gameOn && room.station > 0 ? `Station ${room.station} · ` : ""}${whoAboard(names)}${room.gameOn ? "" : " · waiting to start"}`,
      time: nowBox, aboard: names.length + (away.length ? ` +${away.length}` : ""),
      status: isFull ? { text: "Full", color: C.textMuted } : room.gameOn ? { text: "On the move", color: C.success } : { text: "Boarding now", color: C.brand },
      action: isFull ? null : <Btn onClick={() => navigate(`/room/${room.id}`)} style={{ ...smallBtn, justifyContent: "center" }}>{room.gameOn ? "Board now →" : "Board →"}</Btn>,
      hint: room.gameOn ? "A game is on: board now and join in from the next station" : "Waiting for passengers: board and the game starts with the first direction",
    };
  });
  // the next train to leave: the first departure that hasn't started (Damon, 2026-10-26: "something that clearly shows
  // that this sky train is the one that arrives next"): a gold NEXT tag, a gold edge and a countdown
  const nextKey = departures.find(t => !t.room && t.departs != null && Date.now() - t.departs < 30 * 60000)?.key ?? null;
  // a departure: our daily trains and players' scheduled games, the same row
  const departureRow = t => {
    const aboard = t.room ? (t.room.playingNames || []) : [];
    const next = t.key === nextKey;
    const mins = t.departs != null ? (Date.now() - t.departs) / 60000 : null;
    return {
      key: t.key, code: t.label, name: t.name, lit: aboard.length > 0, next,
      note: aboard.length ? `${t.room.gameOn && t.room.station > 0 ? `Station ${t.room.station} · ` : ""}${whoAboard(aboard)}` : t.kind === "player" ? `by ${t.host}` : "every day",
      time: timeBox(t.departs), aboard: t.room ? aboard.length : null,
      status: next && mins < 0 ? { text: `Next · ${untilText(mins)}`, color: "var(--c-gold)" } : t.status,
      action: t.room ? <Btn onClick={() => navigate(`/room/${t.room.id}`)} style={{ ...smallBtn, justifyContent: "center" }}>Board now →</Btn>
        : t.canStart ? <span data-hint={`Start ${t.name}: everyone boards it from this row`} style={{ display: "contents" }}><Btn onClick={() => startScheduled(t.name)} style={{ ...smallBtn, justifyContent: "center" }}>Start it →</Btn></span>
        : t.kind === "player" && t.canCancel ? <>{linkBtn("Change time", () => editSched(t))}{linkBtn("Delete", () => cancelSched(t.id), C.textMuted)}</> : null,
      hint: t.kind === "player" ? `Scheduled by ${t.host}, shown in your own time` : "One of our daily games: every day at the same time, shown here in your own time",
    };
  };

  return (
    // Signed in on a big window: exactly one screen. Before signing in (the welcome screen) the page scrolls: on phones
    // it was cut off below the first screen (2026-10-22)
    <div style={{ height: auth || !phone ? "100vh" : undefined, minHeight: "100vh", overflowY: fits && auth ? "hidden" : "auto", overflowX: "hidden", color: C.textPrimary, display: "flex", flexDirection: "column" }}>
      {/* Header: the logo, then the menus (on phones the menus go under the logo) */}
      {/* the line runs edge to edge; the logo and menus sit in the same column as the panels below (Damon, 2026-10-22) */}
      <div style={{ flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", boxSizing: "border-box", padding: phone ? "10px 10px" : "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", rowGap: 8, columnGap: shortWin ? 20 : 16 }}>
        {/* No margin: the logo's dark outline box lines up with the panels' edge. (A -3px nudge, 2026-10-22, lined up the
            bright letter instead, but in most palettes the outline is visible and then stuck out to the left — Damon's
            screenshot in Dusk) */}
        <h1 style={{ fontFamily: "'Honk', 'Nunito', sans-serif", fontSize: phone ? 38 : (shortWin ? 40 : 46), fontWeight: 400, margin: 0, lineHeight: 1.05, color: "var(--c-logo)", fontPalette: "var(--fp-mark)", fontVariationSettings: "'SHLN' 41, 'MORF' 15" }}>
          Acro Express<sup style={{ fontFamily: "'Nunito', sans-serif", fontSize: 12, color: "var(--c-bgText)", marginLeft: 3, verticalAlign: "super" }}>™</sup>
        </h1>
        {/* Short windows: the greeting and your buttons sit here, next to the logo, instead of in their own bar */}
        {shortWin && auth && <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginRight: "auto" }}>{welcomeParts}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Before signing in only How to play (2026-10-22, Damon: colors and music "shouldn't even be a part of that
              screen"); the rest appears once you're aboard */}
          {/* (2026-10-22, Damon: the Station Log only as news on the Station Board; Music only on the trains, where the
              songs play — your settings carry over) */}
          {auth && <span data-hint="Sky Leaderboard: the champions of the week, the month and all time" style={{ display: "contents" }}>
            <button onClick={() => navigate("/leaderboard")} style={{ background: C.bgPanel2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.textPrimary, cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: "6px 12px", whiteSpace: "nowrap" }}>🏆 Sky Leaderboard</button></span>}
          {auth && <span data-hint="Station News: what's new on the Acro Express. Comment and react" style={{ display: "contents" }}><StationLogButton /></span>}
          {auth && <span data-hint="Hall of Expressions: the best lines written on the Sky Trains" style={{ display: "contents" }}>
            <button onClick={() => navigate("/hall")} style={{ background: C.bgPanel2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.textPrimary, cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: "6px 12px", whiteSpace: "nowrap" }}>🏛 Hall of Expressions</button></span>}
          <span data-hint="How to play: the rules, the points and the special directions" style={{ display: "contents" }}><HowToPlay winScore={roomList[0]?.winScore || 30} stations={roomList[0]?.stations || 0} /></span>
          {auth && <span data-hint="Colors: the look of the station and the trains. Only you see it" style={{ display: "contents" }}><ThemePicker /></span>}
          {/* ("All lines running" moved to the Station Board's right end, 2026-10-22: loose text broke the row of buttons) */}
        </div>
      </div>
      </div>
      {/* The Station Board: the news, and the explanation of whatever the mouse is over */}
      {/* the birthday: confetti once, the first time you're at the station that day */}
      {auth && bdayConfetti && <Confetti />}
      {auth && <StationBoard news={boardNews} status={status && <span data-hint={status === "ok" ? "Our server is up and the live connection works" : "The connection dropped: it reconnects by itself"} style={{ color: status === "ok" ? C.success : C.brand, fontSize: 13, whiteSpace: "nowrap" }}>● {status === "ok" ? "All lines running" : "Delays, reconnecting…"}</span>} />}

      <div style={{ flex: fits ? 1 : "none", minHeight: 0, width: "100%", maxWidth: 1400, margin: "0 auto", boxSizing: "border-box", padding: phone ? "8px 10px 0" : "8px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>

        {/* Not signed in: the welcome screen (2026-10-22) — what this is, how a station goes, when people play,
            who's here now (left); the Sky Passport card (right). Phones: stacked, the card first */}
        {!auth && (() => {
          const daily = nightExpress(Date.now(), []);
          const here = liveNow ? (liveNow.lobbyPlayers || 0) + (liveNow.playersInRooms || 0) : null;
          const tab = (mode, label) => (
            <button onClick={() => { setAuthMode(mode); setAuthMsg(""); }} aria-pressed={authMode === mode}
              style={{ flex: 1, padding: "10px 8px", fontFamily: "inherit", fontSize: 15, fontWeight: authMode === mode ? 700 : 500, cursor: "pointer",
                background: authMode === mode ? C.navy3 : "transparent", color: authMode === mode ? C.textPrimary : C.textMuted,
                border: "none", borderBottom: `2px solid ${authMode === mode ? C.teal : "transparent"}` }}>{label}</button>
          );
          const step = (n, title, body) => (
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ ...smallTitle, fontSize: 22, color: C.teal, minWidth: 22 }}>{n}</span>
              <div><div style={{ fontWeight: 700, color: C.textPrimary }}>{title}</div><div style={{ color: C.textSecond, fontSize: 15 }}>{body}</div></div>
            </div>
          );
          return (
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: phone ? "minmax(0, 1fr)" : "minmax(0, 1.25fr) minmax(320px, 1fr)", alignItems: "start", maxWidth: 1100, width: "100%", margin: "8px auto 0" }}>
              {/* What this is */}
              <Panel style={{ padding: phone ? 18 : 26, display: "flex", flexDirection: "column", gap: 16 }}>
                {/* phones: the explanation comes first (Damon: "nothing says what is this all about"); returning passengers jump down */}
                {phone && <button type="button" onClick={() => { setAuthMode("login"); setAuthMsg(""); setTimeout(() => document.getElementById("welcomeName")?.focus(), 50); }}
                  style={{ alignSelf: "flex-end", marginBottom: -8, background: "none", border: `1px solid ${C.border}`, borderRadius: 999, color: C.teal, fontFamily: "inherit", fontSize: 14, padding: "4px 12px", cursor: "pointer" }}>I have a passport · Log in ↓</button>}
                <div>
                  {/* Damon picked this text (option 1 of three, 2026-10-22; "a prompt of" → "a handful of") */}
                  <h2 style={{ margin: 0, fontSize: phone ? 30 : 40, ...honkTitle }}>Welcome aboard Acro Express!</h2>
                  <p style={{ margin: "8px 0 0", color: C.textSecond, fontSize: 17, lineHeight: 1.5 }}>
                    Get a handful of random letters. Turn them into unforgettable phrases. Vote for the ones that make you
                    smile, gasp, or wonder how anyone thought of that.
                  </p>
                  <p style={{ margin: "8px 0 0", color: C.textPrimary, fontSize: 17, fontWeight: 700 }}>First to {30} points wins the journey. Grab a seat!</p>
                </div>
                <AcroDemo />
                {/* the Practice Train: play right away, no sign-up (2026-10-22) */}
                <button onClick={() => navigate("/practice")} style={{ alignSelf: "flex-start", background: "transparent", border: `2px solid ${C.teal}`, borderRadius: 999, color: C.teal, fontFamily: "inherit", fontSize: 16, fontWeight: 700, padding: "9px 18px", cursor: "pointer" }}>🚂 Take a practice journey · 3 stations · 2 minutes</button>
                <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
                  {step("1", "Letters arrive", "And a direction.")}
                  {step("2", "Write a phrase", "One word per letter, about a minute.")}
                  {step("3", "Everyone votes", "No names shown. Funniest wins.")}
                </div>
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 6, fontSize: 15, color: C.textSecond }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="train" size={18} color={C.teal} /></span><span><b style={{ color: C.textPrimary }}>When we play:</b> every day, The Continental at <b style={{ color: C.teal }}>{scheduledTrain("continental", Date.now(), []).local}</b> and the Daily Express at <b style={{ color: C.teal }}>{daily.local}</b>, your time. You can also start a train any time.</span></div>
                  {here !== null && (
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="users" size={18} color={C.teal} /></span><span><b style={{ color: C.textPrimary }}>Right now:</b> {here === 0 ? "the station is quiet. Come back at " + daily.local + " for a full train!" : `${here} passenger${here === 1 ? "" : "s"} at the station.`}</span></div>
                  )}
                  <div>☁ Friendly regulars, no ads, nothing to download. We belong in the clouds™</div>
                </div>
              </Panel>
              {/* The Sky Passport card */}
              <Panel style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
                  {tab("new", "I'm new")}
                  {tab("login", "I have a passport")}
                </div>
                <form onSubmit={e => { e.preventDefault(); doAuth(authMode); }} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ color: C.textSecond, fontSize: 15 }}>
                    {authMode === "new" ? <>Join free: just pick a passenger name and a password. (Your player profile, with your stats and best acros, is called your <b style={{ color: C.textPrimary }}>Sky Passport</b>.)</> : "Welcome back! Type your passenger name and password."}
                  </div>
                  <label style={{ fontSize: 13, color: C.textMuted }}>Passenger name
                    <Input id="welcomeName" value={username} onChange={e => { setUsername(e.target.value); setAuthMsg(""); }} placeholder={authMode === "new" ? "e.g. SkyRider_7" : "Your passenger name"} style={{ textAlign: "left", marginTop: 4 }} autoFocus={!phone} />
                  </label>
                  {authMode === "new" && <div style={{ fontSize: 12, color: C.textMuted, marginTop: -4 }}>3 to 20 letters, numbers or _ · other players see it</div>}
                  <label style={{ fontSize: 13, color: C.textMuted }}>Password
                    <Input id="welcomePass" type="password" value={password} onChange={e => { setPassword(e.target.value); setAuthMsg(""); }} placeholder={authMode === "new" ? "Choose a password" : "Your password"} style={{ textAlign: "left", marginTop: 4 }} />
                  </label>
                  {authMsg && <div role="alert" style={{ color: C.brand, fontSize: 14 }}>{authMsg}</div>}
                  <button type="submit" disabled={authBusy}
                    style={{ marginTop: 4, padding: "12px 16px", borderRadius: 10, border: "none", background: C.brand, color: C.onBrand, fontFamily: "inherit", fontSize: 17, fontWeight: 700, cursor: authBusy ? "wait" : "pointer", opacity: authBusy ? 0.7 : 1 }}>
                    {authBusy ? "One moment…" : authMode === "new" ? "Join free & board" : "Log in & board"}
                  </button>
                  <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center" }}>
                    {authMode === "new" ? <>Free · no email · takes 10 seconds · passwords are stored scrambled. By joining you accept the <a href="/rules" style={{ color: C.teal }}>House Rules</a>.</>
                      : <>New here? Choose <button type="button" onClick={() => { setAuthMode("new"); setAuthMsg(""); }} style={{ background: "none", border: "none", padding: 0, color: C.teal, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>I'm new</button>.</>}
                  </div>
                </form>
              </Panel>
            </div>
          );
        })()}

        {/* Welcome bar (one box, Damon): the greeting; your Sky Passport and leaving on the right */}
        {auth && !shortWin && (
          <Panel style={{ flexShrink: 0, padding: "8px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <IconBadge><Icon name="user" /></IconBadge>
            {welcomeParts}
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
                {/* was "On the platform"; Arrivals, next to Departures (Damon, 2026-10-26: "plays nicely to A Rival"); how
                    many, at the right end of the title (not squeezed against the word) */}
                <Icon name="users" size={24} color={C.teal} /> Arrivals
                <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{online.length}</span>
                {phone && <span style={{ marginLeft: 8, fontFamily: "'Nunito', sans-serif", fontSize: 18, color: C.textMuted }}>{listOpen ? "▴" : "▾"}</span>}
              </h2>
              {phone && !listOpen ? null : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", flex: 1, minHeight: 0, maxHeight: phone ? 260 : undefined }}>
                  {online.map(o => {
                    const isMe = String(o.name).toLowerCase() === String(auth?.username).toLowerCase();
                    return (
                      // One rule everywhere: a click opens the player's Sky Passport card; Message is its main button
                      <li key={o.name} onClick={e => openProfile(o.name, e.currentTarget)} title={`Message ${o.name} or see their Sky Passport`}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 6px", borderRadius: 8, background: isMe ? C.navy2 : "transparent", cursor: "pointer" }}>
                        {/* one line per passenger (Damon, 2026-10-22: ready for many more players): a smaller avatar, the
                            name, and the train's name after it when they're aboard one (the full place is in the hover) */}
                        <AvatarSquare name={o.name} size={22} />
                        <div data-hint={`${o.name} · ${o.where}`} style={{ minWidth: 0, flex: 1, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span style={{ fontWeight: 600 }}>{o.name}</span>
                          {/* "· on The Comet", with the site's own train icon (was a 🚂 emoji and the bare name) */}
                          {o.onTrain && <span style={{ fontSize: 13, color: C.textMuted, whiteSpace: "nowrap" }}> · <span style={{ display: "inline-block", verticalAlign: "-2px" }}><Icon name="train" size={13} color={C.textMuted} /></span> on <span style={{ color: C.textSecond }}>{o.train}</span></span>}
                        </div>
                        {/* Unread private messages from them */}
                        {(pm.unread[o.name] || 0) > 0 && <span style={{ background: C.brand, color: C.onBrand, fontSize: 11, borderRadius: 999, padding: "1px 6px" }}>{pm.unread[o.name]}</span>}
                        {/* Board the same train (Damon, 2026-10-24: so a newcomer can join a friend in one click), unless it's full */}
                        {!isMe && o.onTrain && !o.full && <button onClick={e => { e.stopPropagation(); navigate(`/room/${o.trainId}`); }} data-hint={`Board ${o.train}, the train ${o.name} is on`}
                          style={{ background: C.brand, border: "none", borderRadius: 6, color: C.onBrand, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800, lineHeight: 1, padding: "4px 8px", flexShrink: 0 }}>Board</button>}
                        {/* one click straight to a private chat (2026-10-22) */}
                        {!isMe && <button onClick={e => { e.stopPropagation(); openPm(o.name); }} title={`Message ${o.name}`} aria-label={`Message ${o.name}`} data-hint={`Send ${o.name} a private message`}
                          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, color: C.teal, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "3px 5px", flexShrink: 0 }}>✉</button>}
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
                {lobbyChat.map((m, i) => m.local ? (
                  // the answer to your command: only you see it
                  <div key={i} style={{ fontSize: 13, color: C.textMuted, fontStyle: "italic" }}>{m.text}</div>
                ) : meAction(m.message) != null ? (
                  // "/me waves" → "* Sandy waves"
                  <div key={i} style={{ fontSize: 15, lineHeight: 1.4, overflowWrap: "anywhere", fontStyle: "italic", color: C.textSecond }}>
                    <span style={{ color: C.textMuted, fontSize: 12, marginRight: 8, fontStyle: "normal", fontVariantNumeric: "tabular-nums" }}>{lobbyTime(m.time)}</span>
                    * <NameLink profile gold name={m.username} style={{ color: C.teal, fontWeight: 700 }} /> {meAction(m.message)}
                  </div>
                ) : m.notice ? (
                  // Arrival line: quiet, the name still clickable
                  <div key={i} style={{ fontSize: 13, color: C.textMuted, fontStyle: "italic" }}>
                    <NameLink profile name={m.username} style={{ color: C.textSecond }} /> {m.text} · {lobbyTime(m.time)}
                  </div>
                ) : (
                  // A message on one line (Damon: no avatar, not two lines): time · name: text — long text wraps
                  <div key={i} style={{ fontSize: 15, lineHeight: 1.4, overflowWrap: "anywhere" }}>
                    <span style={{ color: C.textMuted, fontSize: 12, marginRight: 8, fontVariantNumeric: "tabular-nums" }}>{lobbyTime(m.time)}</span>
                    <NameLink profile gold name={m.username} style={{ color: C.teal, fontWeight: 700 }} /><span style={{ color: C.teal, fontWeight: 700 }}>: </span>
                    <span style={{ color: C.textPrimary }}>{m.message}</span>
                  </div>
                ))}
                <div ref={lobbyBottomRef} />
              </div>
              {/* one bar, like the acro bar (Damon, 2026-10-26) */}
              <div style={{ ...acroBar(C.fieldLine), borderWidth: 1, background: C.bgApp }}>
                <input id="lobbyChatInput" name="lobbyChatInput" value={chatInput} placeholder="Say hello on the platform..."
                  onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") sendLobby(); }}
                  style={{ ...acroField, textAlign: "left", padding: "9px 14px", fontSize: 15 }} />
                <Btn onClick={sendLobby} style={{ ...smallBtn, borderRadius: 0 }}><Icon name="send" size={17} /> Send</Btn>
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
              {/* the line beside the title, not under it (Damon, 2026-10-26: "shouldn't take up two lines") */}
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px 14px", flexWrap: "wrap", minWidth: 0 }}>
                <h2 style={boxTitle}>Departures</h2>
                {liveTrain ? (
                  // who is playing where, with the way in (2026-10-25)
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 15, color: C.textSecond }}>
                    <span>{liveDot}<b style={{ color: C.textPrimary }}>{liveTrain.playingNames.length <= 2 ? liveTrain.playingNames.join(" and ") : `${liveTrain.playingNames[0]} and ${liveTrain.playingNames.length - 1} others`}</b>
                      {" "}{liveTrain.playingNames.length === 1 ? "is" : "are"} {liveTrain.gameOn ? "playing" : "waiting for passengers"} on <b style={{ color: C.textPrimary }}>{liveTrain.name}</b></span>
                    {(liveTrain.playingNames.length + (liveTrain.awayNames || []).length) < 16 && <Btn onClick={() => navigate(`/room/${liveTrain.id}`)} style={smallBtn}>Board →</Btn>}
                  </div>
                ) : <div style={{ color: C.textSecond, fontSize: 14 }}>{roomList.length === 0 ? "Are you ready to play? Start a Sky Train!" : "Pick a train and hop on, or start your own."}</div>}
              </div>
              {/* on the right: schedule a game, and start one now (the "free platform" row is gone: vertical space, Damon 2026-10-26) */}
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                {auth && sched.canSchedule && !sched.hasOne && !schedForm && (
                  <button onClick={() => { setSchedForm({ id: null, day: 0, time: "" }); setSchedErr(""); }} data-hint="Schedule a game for later: it shows here for everyone, in their own time"
                    style={{ background: "none", border: "none", padding: 0, color: C.teal, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>📅 Schedule a game</button>
                )}
                {!creating && <span data-hint="Start your own Sky Train now and name it" style={{ display: "contents" }}>
                  <Btn onClick={() => setCreating(true)} style={{ ...smallBtn, justifyContent: "center" }}><span style={{ fontSize: 18, lineHeight: 1 }}>+</span> New Sky Train</Btn>
                </span>}
              </div>
            </div>
            {schedForm && auth && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10, padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.bgPanel2 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{schedForm.id ? "New time:" : "Schedule a game for"}</span>
                <select value={schedForm.day} onChange={e => setSchedForm(f => ({ ...f, day: e.target.value }))}
                  style={{ background: C.bgApp, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 8px", color: C.textPrimary, fontSize: 15, fontFamily: "inherit" }}>
                  {Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return <option key={i} value={i}>{i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}</option>; })}
                </select>
                <input type="time" step={900} value={schedForm.time} onChange={e => setSchedForm(f => ({ ...f, time: e.target.value }))}
                  style={{ background: C.bgApp, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 8px", color: C.textPrimary, fontSize: 15, fontFamily: "inherit", colorScheme: "dark" }} />
                <Btn onClick={submitSched} style={smallBtn}>{schedForm.id ? "Save" : "Schedule"}</Btn>
                <BtnSecondary onClick={() => { setSchedForm(null); setSchedErr(""); }} style={smallBtn}>Cancel</BtnSecondary>
                <div style={{ flexBasis: "100%", fontSize: 13, color: schedErr ? C.brand : C.textMuted }}>{schedErr || (schedForm.id ? "Your own time. Everyone sees it in theirs." : "Your own time. Everyone sees it in theirs; the train gets one of our names.")}</div>
              </div>
            )}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              {/* Column titles (not on phones) */}
              {!phone && (
                <div style={{ display: "grid", gridTemplateColumns: boardCols, gap: 12, alignItems: "center", padding: "6px 14px", fontSize: 11, color: C.teal, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
                  {/* each title over its content (Damon: "Departs, Aboard, Status don't align"): Departs centred over the clock
                      box (after the day's slot), Status over the pill's text */}
                  <span>Platform</span><span>Sky Train</span>
                  <span style={{ paddingLeft: 39 }}><span style={{ display: "inline-block", width: 92, textAlign: "center" }}>Departs</span></span>
                  <span>Aboard</span><span style={{ paddingLeft: 10 }}>Status</span><span />
                </div>
              )}
              {/* One line per train, the same for all of them (Damon, 2026-10-26: "the format should stay the same … all of the
                  departures should take up just one line … time is important for departures"): the free platform, the trains
                  running, the next departures (our daily trains and players' scheduled games alike), then the LATER row */}
              {creating && freeNumbers.slice(0, 1).map((n, i) => (
                <div key={`free-${n}`} style={{ ...rowGrid, opacity: i > 0 ? 0.5 : 1 }}>
                  <span style={codeStyle(true)}>{String(n).padStart(2, "0")}</span>
                  {i > 0 ? <span style={{ gridColumn: "2 / -1", fontSize: 14, color: C.textMuted, fontStyle: "italic" }}>Free platform</span>
                  : creating ? (
                    // Naming the new train, right here on its platform
                    <div style={{ gridColumn: "2 / -1", minWidth: 0, display: "flex", gap: 8, alignItems: "center" }}>
                      <input autoFocus maxLength={80} placeholder="Name your Sky Train, or just press Enter" value={newRoomName}
                        onChange={e => { setNewRoomName(e.target.value); setCreateError(""); }}
                        onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") cancelCreate(); }}
                        style={{ flex: 1, minWidth: 0, background: C.bgApp, border: `2px solid ${C.focusLine}`, borderRadius: 8, padding: "6px 12px", color: C.textPrimary, fontSize: 15, outline: "none", fontFamily: "inherit" }} />
                      <Btn onClick={handleCreate} style={smallBtn}>Create</Btn>
                      <BtnSecondary onClick={cancelCreate} style={smallBtn}>Cancel</BtnSecondary>
                      {createError && <span style={{ fontSize: 13, color: C.brand }}>{createError}</span>}
                    </div>
                  ) : (
                    <>
                      <span style={{ gridColumn: phone ? "2" : "2 / -2", fontSize: 14, color: C.textMuted, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Free platform · start your own Sky Train here</span>
                      <span data-hint="Start your own Sky Train on this platform and name it" style={{ display: "flex", justifyContent: "flex-end" }}>
                        <Btn onClick={() => setCreating(true)} style={{ ...smallBtn, justifyContent: "center" }}><span style={{ fontSize: 18, lineHeight: 1 }}>+</span> New Sky Train</Btn>
                      </span>
                    </>
                  )}
                </div>
              ))}
              {runningRows.map(boardRow)}
              {departures.slice(0, depSlots).map(departureRow).map(boardRow)}
              {/* the rest: one row that changes every 4 s like a split-flap departure board; a click opens them all */}
              {(() => {
                const rest = departures.slice(depSlots);
                if (rest.length === 0) return null;
                const i = laterIdx % rest.length, g = departureRow(rest[i]);
                return (
                  <>
                    <div role="button" tabIndex={0} onClick={() => setLaterOpen(o => !o)} onKeyDown={e => { if (e.key === "Enter") setLaterOpen(o => !o); }} aria-expanded={laterOpen}
                      data-hint="More departures later: click to see them all" style={{ ...rowGrid, cursor: "pointer" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", color: C.teal }}>LATER</span>
                      <span style={{ minWidth: 0 }}><SplitFlap flipKey={g.key} bg={C.bgPanel}>{trainCell(g)}</SplitFlap></span>
                      {!phone && <span><SplitFlap flipKey={g.key} bg={C.bgPanel} height={30}>{g.time}</SplitFlap></span>}
                      {!phone && <span />}
                      {!phone && <span style={{ fontSize: 13, color: C.textMuted }}>{rest.length > 1 ? `${i + 1} of ${rest.length}` : ""}</span>}
                      <span style={{ fontSize: 13, color: C.textSecond, textAlign: "right", whiteSpace: "nowrap" }}>{laterOpen ? "close ▲" : "see all ▼"}</span>
                    </div>
                    {laterOpen && rest.map(departureRow).map(boardRow)}
                  </>
                );
              })()}
            </div>
          </Panel>
        )}

        <Footer compact />   {/* © + House Rules + Privacy, a plain line under the station */}
        {practicing && <PracticeTrain onClose={() => setPracticing(false)} boarding={roomList.find(r => !r.gameOn && (r.playingNames || []).length > 0) || roomList.find(r => r.gameOn) || null} />}
        <PmToast />
        <RestartBanner />
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
// Counting visitors (2026-10-22, GROWTH.md: "see which posts bring players"). Where this visit came from: our own
// tag on a link we post (acro.express/?from=reddit), else the site that linked here (facebook.com), else "direct".
// Worked out once per browser tab and kept in sessionStorage (gone when the tab closes); the ?from= is then taken
// out of the address, so a link copied from it doesn't carry the tag on.
function visitSource() {
  try {
    const kept = sessionStorage.getItem("acro.from");
    if (kept) return kept;
    const url = new URL(window.location.href);
    let from = (url.searchParams.get("from") || url.searchParams.get("utm_source") || "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
    if (from) {
      url.searchParams.delete("from"); url.searchParams.delete("utm_source");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } else if (document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\./, "");
      if (!/(^|\.)acro\.express$|^localhost$/.test(host)) from = host.slice(0, 40);
    }
    from = from || "direct";
    sessionStorage.setItem("acro.from", from);
    return from;
  } catch { return "direct"; }
}
// One more on today's count for a step: "visit", "practice_start", "practice_finish", "signup". Signed-in players
// using the practice count as "player", apart from the visitors.
function track(kind) {
  const from = kind.startsWith("practice") && getAuth()?.token ? "player" : visitSource();
  fetch(`${API_URL}/api/track`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, from }), keepalive: true }).catch(() => { });
}
// A visit: someone not signed in opened the site (once per tab; the regulars' visits would blur the count)
try {
  if (!getAuth()?.token && !sessionStorage.getItem("acro.visited")) { sessionStorage.setItem("acro.visited", "1"); track("visit"); }
} catch { /* no sessionStorage: not counted */ }

// The Word of the Week (2026-10-22, Damon): a fun, little-known word; an acro that uses it and gets at least one vote
// earns +1. A new word every Monday (the server's list of 56, api/word). Asked once per page load.
let wordOfWeekPromise = null;
function useWordOfWeek() {
  const [w, setW] = useState(null);
  useEffect(() => {
    if (!wordOfWeekPromise) wordOfWeekPromise = fetch(`${API_URL}/api/word`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    let on = true;
    wordOfWeekPromise.then(d => { if (on) setW(d); });
    return () => { on = false; };
  }, []);
  return w;   // { word, meaning } or null
}

// The welcome screen's live demo (2026-10-22, Damon: the front door should be "exciting" and say "what this is all
// about"): real acros our passengers voted for (no names, nothing rude), played like a station — the topic, the
// letters dropping in one by one, the phrase writing itself word by word (each word's first letter lit), then the
// votes. One after another, forever. With "reduce motion" switched on, each one simply appears whole.
const DEMO_ACROS = [
  { topic: "Words on your tombstone", acro: "An Angel's Risen Skywards", votes: 3 },
  { topic: "A + B = C", acro: "Winning + Ticket = Millions", votes: 4 },
  { topic: "Rhyme", acro: "Clothes fold, Dad's old.", votes: 4 },
  { topic: "Thank you", acro: "Love now playing Acro Express!", votes: 4 },
];
function AcroDemo() {
  const calm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [n, setN] = useState(0);          // which acro
  const [t, setT] = useState(calm ? 999 : 0);   // ticks of 150 ms into it
  useEffect(() => {
    if (calm) { const iv = setInterval(() => setN(x => x + 1), 5000); return () => clearInterval(iv); }
    const iv = setInterval(() => setT(x => x + 1), 150);
    return () => clearInterval(iv);
  }, [calm]);
  const d = DEMO_ACROS[n % DEMO_ACROS.length];
  const words = d.acro.split(" ").filter(w => /[A-Za-z]/.test(w));          // the words that carry a letter ("+" doesn't)
  const letters = words.map(w => w.replace(/^[^A-Za-z]+/, "")[0].toUpperCase());
  const shownLetters = Math.min(letters.length, Math.floor(t / 2));          // a letter every 300 ms
  const wordsStart = letters.length * 2 + 4;
  const tokens = d.acro.split(" ");
  const shownTokens = Math.max(0, Math.min(tokens.length, Math.floor((t - wordsStart) / 3)));   // a word every 450 ms
  const votesAt = wordsStart + tokens.length * 3 + 3;
  const end = votesAt + 20;                                                  // 3 s to enjoy it
  useEffect(() => { if (!calm && t > end) { setT(0); setN(x => x + 1); } }, [t, end, calm]);
  return (
    <div aria-label={`Example: ${d.acro}`} style={{ background: "var(--c-bgApp)", border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", minHeight: 170, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: C.teal }}>A real station · direction: <span style={{ color: C.textPrimary, textTransform: "none", letterSpacing: 0 }}>{d.topic}</span></div>
      <div style={{ display: "flex", gap: 10, minHeight: 52 }}>
        {letters.map((L, i) => (
          <span key={n + "-" + i} style={{ fontFamily: "'Bowlby One SC', serif", fontSize: 44, lineHeight: 1, color: C.brand, textShadow: "0 3px 0 rgba(0,0,0,0.35)",
            opacity: i < shownLetters ? 1 : 0, transform: i < shownLetters ? "none" : "translateY(-14px)", transition: "opacity .25s, transform .25s" }}>{L}</span>
        ))}
      </div>
      <div style={{ fontSize: 22, color: C.textPrimary, minHeight: 30 }}>
        {tokens.slice(0, shownTokens).map((w, i) => {
          const k = w.search(/[A-Za-z]/);
          return <span key={i}>{k >= 0 ? <>{w.slice(0, k)}<span style={{ color: C.brand, fontWeight: 800 }}>{w[k]}</span>{w.slice(k + 1)}</> : w} </span>;
        })}
        {shownTokens < tokens.length && t >= wordsStart && <span style={{ color: C.teal }}>▍</span>}
      </div>
      <div style={{ minHeight: 28 }}>
        {t >= votesAt && <span style={{ display: "inline-block", background: C.teal, color: C.bgApp, fontWeight: 800, fontSize: 14, borderRadius: 999, padding: "4px 12px" }}>★ {d.votes} votes · won the station</span>}
      </div>
    </div>
  );
}

// The Daily Express (Damon, 2026-10-22): "we need somewhere to announce that there is a game at 11 PM usually".
// (First called "Night Express"; Damon: "it's not Night Express for people in the USA": 23:00 Limassol is the
// afternoon there. So: Daily Express, "every day", no moon.)
// A permanent first row in Departures, on platform 23. The game night is 23:00 Limassol time (Asia/Nicosia, so
// summer time is handled); each player sees it in their own time. Status: "Today" until 20 minutes before,
// "Boarding soon", "Departing now" for the first 10 minutes, then "Running a little late 🚂" while no game is on
// (Damon chose this over "Delayed"); "On the move" as soon as any train is playing. After 00:30 Limassol time it
// shows the next night.
// lastStationUtc (api/status): when the last station was played anywhere; played tonight → "Arrived 🏁"
// Tonight's Daily Express as a moment, from the server (api/status: dailyExpressUtc). The website holds no home time
// zone (Damon, 2026-10-23: a player worked out where he lives). Remembered in the browser, so the time shows at once
// on the next visit.
// 2026-10-23: two scheduled games (Damon): The Continental and the Daily Express. label = their platform.
const SCHEDULED = [
  { key: "continental", name: "The Continental", label: "TC", field: "continentalUtc" },
  { key: "daily", name: "Daily Express", label: "DX", field: "dailyExpressUtc" },
];
let scheduledAt = (() => { try { return JSON.parse(localStorage.getItem("acro.sched") || "{}") || {}; } catch { return {}; } })();
// The schedule's UTC offset at a moment, in minutes (New York: -240 in summer, -300 in winter; the trains follow US
// Eastern time since 2026-10-25). Only for rolling a remembered departure on when the server can't be reached; players
// are always shown their own time.
function homeOffset(ms) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(ms / 60000) * 60000) / 60000;
  } catch { return 0; }
}
function setSchedule(status) {
  let changed = false;
  for (const t of SCHEDULED) { const ms = Date.parse(status?.[t.field] || ""); if (ms) { scheduledAt[t.key] = ms; changed = true; } }
  if (changed) try { localStorage.setItem("acro.sched", JSON.stringify(scheduledAt)); } catch { /* private mode */ }
}
fetch(`${API_URL}/api/status`).then(r => r.json()).then(setSchedule).catch(() => { });
const isScheduledName = name => SCHEDULED.some(t => t.name.toLowerCase() === String(name || "").trim().toLowerCase());
// Both trains, the next to leave first
function scheduledTrains(now, rooms, lastStationUtc = null) {
  return SCHEDULED.map(t => scheduledTrain(t.key, now, rooms, lastStationUtc)).sort((a, b) => (a.departs ?? Infinity) - (b.departs ?? Infinity));
}
// The Daily Express (kept for the places that only need its time)
const nightExpress = (now, rooms, lastStationUtc = null) => scheduledTrain("daily", now, rooms, lastStationUtc);

function scheduledTrain(key, now, rooms, lastStationUtc = null) {
  const train = SCHEDULED.find(t => t.key === key);
  let departs = scheduledAt[key];
  if (!departs) return { ...train, local: "", status: { text: "Today", color: C.teal }, room: null, canStart: false, departs: null, mins: -9999 };   // not known yet
  // a remembered day: on to today's, at the same schedule time: across a clock change the next day is 23 or 25 hours
  // later, not 24
  while (now - departs > 90 * 60000) { const next = departs + 86400000; departs = next + (homeOffset(departs) - homeOffset(next)) * 60000; }
  const mins = (now - departs) / 60000;                                     // minutes since it left (negative = before)
  const local = new Date(departs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  // 2026-10-23: the train itself is a Sky Train named "Daily Express", started from this row from 30 minutes before
  // (open: until the row moves on to the next night at 00:30 Limassol time)
  const open = mins > -30;
  const daily = rooms.find(r => String(r.name || "").trim().toLowerCase() === train.name.toLowerCase());   // its own train
  const playing = daily?.gameOn ? daily : rooms.find(r => r.gameOn && !isScheduledName(r.name));
  const ranTonight = !!lastStationUtc && new Date(lastStationUtc).getTime() >= departs - 30 * 60000;
  let status;
  if (daily && !daily.gameOn) status = { text: "Boarding now", color: C.brand };
  else if (playing && mins > -30) status = { text: "On the move", color: C.success };
  else if (ranTonight && mins >= 0) status = { text: "Arrived 🏁", color: C.success };   // tonight's game was played
  else if (mins < -20) status = { text: "Today", color: C.teal };
  else if (mins < 0) status = { text: "Boarding soon", color: C.brand };
  else if (mins < 10) status = { text: "Departing now", color: C.brand };
  else status = { text: "Running a little late 🚂", color: C.gold || C.brand };
  const room = daily || (playing && open ? playing : null);   // the train to board
  return { ...train, local, status, room, canStart: open && !room, departs, mins };
}

// One tip on the Station Board, a different one every hour
const BOARD_TIPS = [
  "Tip: click a name to send that passenger a private message.",
  "Tip: click a line on the Station Board to read more.",
  "Tip: click the Express Server letters on a train to change their font.",
  "Tip: pick your song for the writing time in the Music menu. It switches at once.",
  "Tip: in a Word > Chain direction, put > between the words: Fire > Truck > Driver.",
  "Tip: identical acros are shown once, and everyone who wrote it shares the votes.",
  "Tip: the winner of a station picks the next direction.",
  "Tip: warm up with a practice journey: three stations from our past games, and what the passengers wrote.",
];
// "in 3 h 20 min" / "in 12 min"
const untilText = mins => { const m = Math.max(0, Math.round(-mins)); return m >= 60 ? `in ${Math.floor(m / 60)} h ${m % 60} min` : `in ${m} min`; };

// The hover strip (Damon, 2026-10-22: "an area of the UI that tells you something when you hover on buttons"): one
// quiet line in the header that explains whatever the mouse is over (anything inside an element with a data-hint),
// and otherwise shows "idle" (at the station: the connection status). Always in the same place, a fixed width so
// nothing moves, never covering anything. Mouse only: phones have no hover, so it is hidden on narrow screens.
// (2026-10-22: the first version sat in the header at a fixed width and cut longer hints off — Damon. Now the
// station has the Station Board below, and the train a small bar at the bottom, see HoverBar.)
function useHoverHint() {
  const [hint, setHint] = useState("");
  useEffect(() => {
    const over = e => { const el = e.target.closest?.("[data-hint]"); setHint(el ? el.getAttribute("data-hint") : ""); };
    document.addEventListener("mouseover", over);
    return () => document.removeEventListener("mouseover", over);
  }, []);
  return hint;
}

// The Station Board (Damon, 2026-10-22; his "Departure Board" idea of 2026-10-12: one voice for the game). A slim
// strip under the station's header, like the LED board of a real station. Normally it shows the news, one line at a
// time, changing every 7 seconds with a soft fade (not a scrolling ticker: calmer, and every line can be read whole):
// the Daily Express, what's new on the Station Log, who's here, a tip. When the mouse is over a button (anything
// with a data-hint), it shows that button's explanation in full instead, and goes back to the news afterwards.
// 2026-10-23 (Damon: "switch slower … click on the news to open a card with these news in more detail"): a line every
// 12 seconds; a click opens the news card under the board (that line in full at the top, then the rest of the news,
// each one clickable), and the board waits while the card is open.
// A news item: { key, icon, text (the board line), title, detail (the card's text), action: { label, onClick } }.
// status: the connection lamp ("● All lines running"), at the board's right end, like the status light of a real board
function StationBoard({ news, status = null }) {
  const hint = useHoverHint();
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(true);                 // false during the fade between two lines
  const [open, setOpen] = useState(null);                   // the key of the news shown in the card, or null
  useEffect(() => {
    if (news.length < 2 || open) return;                    // waits while the card is open
    const iv = setInterval(() => { setShown(false); setTimeout(() => { setI(x => x + 1); setShown(true); }, 350); }, 12000);
    return () => clearInterval(iv);
  }, [news.length, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const item = news.length ? news[i % news.length] : null;
  const line = hint ? { icon: "ⓘ", text: hint } : item;
  if (!line) return null;
  const top = open ? news.find(n => n.key === open) || null : null;
  return (
    <div style={{ flexShrink: 0, background: "var(--c-bgApp)", borderBottom: `1px solid ${C.border}`, position: "relative", zIndex: 60 }}>
    {/* the board's text sits in the same column as the panels (Damon, 2026-10-22) */}
    <div onClick={!hint && item ? () => setOpen(o => (o ? null : item.key)) : undefined} role={!hint ? "button" : undefined}
      style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", gap: 10, minHeight: 32, padding: window.innerWidth < 600 ? "4px 10px" : "4px 16px", boxSizing: "border-box",
        cursor: !hint ? "pointer" : "default" }}>
      {/* the board's lamp: teal for news, amber while explaining */}
      {/* its glow only to the right, so its left edge lines up with the panels (Damon, 2026-10-22) */}
      <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: hint ? "var(--c-gold, #FFC24A)" : C.teal, boxShadow: `4px 0 8px -2px ${hint ? "var(--c-gold, #FFC24A)" : C.teal}` }} />
      <span style={{ fontSize: 14, color: hint ? C.textPrimary : C.textSecond, letterSpacing: "0.02em", opacity: hint || shown ? 1 : 0, transition: hint ? "none" : "opacity 0.35s" }}>
        {line.icon && <span style={{ marginRight: 6 }}>{line.icon}</span>}{line.text}
        {!hint && <span style={{ color: C.teal, marginLeft: 8, fontSize: 13, whiteSpace: "nowrap" }}>{open ? "close ▴" : "more ▾"}</span>}
      </span>
      {status && <span style={{ marginLeft: "auto", paddingLeft: 12, flexShrink: 0 }}>{status}</span>}
    </div>
    {/* the news card: the clicked news in full, then the rest */}
    {top && (
      <>
        <div onPointerDown={() => setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 1 }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 2, pointerEvents: "none" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: window.innerWidth < 600 ? "6px 10px" : "6px 16px", boxSizing: "border-box" }}>
            <div role="dialog" aria-label="Station Board news" style={{ pointerEvents: "auto", width: "min(600px, 100%)", maxHeight: "70vh", overflowY: "auto", background: C.bgPanel, border: `1px solid ${C.teal}`, borderRadius: 14, boxShadow: "0 16px 48px rgba(0,0,0,0.5)", padding: 16, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 26, lineHeight: 1 }}>{top.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...smallTitle, fontSize: 24, lineHeight: 1.15 }}>{top.title || top.text}</div>
                  <div style={{ color: C.textSecond, fontSize: 15, marginTop: 6, lineHeight: 1.45 }}>{top.detail || top.text}</div>
                  {top.action && <div style={{ marginTop: 10 }}><Btn onClick={() => { setOpen(null); top.action.onClick(); }} style={{ padding: "6px 14px", fontSize: 14 }}>{top.action.label}</Btn></div>}
                </div>
                <button onClick={() => setOpen(null)} aria-label="Close" style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>✕</button>
              </div>
              {news.length > 1 && (
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textMuted, marginBottom: 2 }}>More on the board</div>
                  {news.filter(n => n.key !== top.key).map(n => (
                    <button key={n.key} onClick={() => setOpen(n.key)}
                      style={{ display: "flex", gap: 8, alignItems: "baseline", textAlign: "left", background: "none", border: "none", borderRadius: 8, padding: "6px 8px", color: C.textSecond, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
                      <span>{n.icon}</span><span style={{ flex: 1 }}>{n.title || n.text}</span><span style={{ color: C.teal }}>›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    )}
    </div>
  );
}

// On a train: the explanation of whatever the mouse is over, as a small bar at the bottom of the window, only
// while hovering (the train's layout is measured to fill the window, so nothing may push it around)
function HoverBar() {
  const hint = useHoverHint();
  if (!hint || window.innerWidth < 700) return null;
  return (
    <div style={{ position: "fixed", left: "50%", bottom: 10, transform: "translateX(-50%)", zIndex: 70, maxWidth: "min(720px, 92vw)",
      background: C.bgPanel2, border: `1px solid ${C.border}`, borderRadius: 999, padding: "6px 16px", fontSize: 14, color: C.textPrimary, boxShadow: "0 6px 20px rgba(0,0,0,0.35)", pointerEvents: "none" }}>
      <span style={{ color: "var(--c-gold, #FFC24A)", marginRight: 6 }}>ⓘ</span>{hint}
    </div>
  );
}

// A line of text that changes like a split-flap departure board (2026-10-26, Damon: "a cool train station animation, at
// least flip around the center of the line"): split at its middle, the old line's top half drops down, then the new
// line's bottom half falls into place. bg: the colour behind it (the flaps hide what's under them).
function SplitFlap({ children, flipKey, bg, height = 26 }) {
  const [shown, setShown] = useState({ key: flipKey, node: children });
  const [prev, setPrev] = useState(null);
  useEffect(() => {
    if (flipKey === shown.key) { setShown(x => ({ ...x, node: children })); return; }
    setPrev(shown.node);
    setShown({ key: flipKey, node: children });
    const t = setTimeout(() => setPrev(null), 520);
    return () => clearTimeout(t);
  }, [flipKey, children]);   // eslint-disable-line react-hooks/exhaustive-deps
  const layer = { position: "absolute", inset: 0, display: "flex", alignItems: "center", background: bg, whiteSpace: "nowrap", overflow: "hidden" };
  const top = { clipPath: "inset(0 0 50% 0)" }, bottom = { clipPath: "inset(50% 0 0 0)" };
  return (
    <span style={{ position: "relative", display: "block", height, perspective: 500, overflow: "hidden" }}>
      {/* the new line (its top half shows while the old top flaps away) */}
      <span style={{ ...layer, ...top }}>{shown.node}</span>
      {/* the old line's bottom half stays until the new bottom covers it */}
      <span style={{ ...layer, ...bottom }}>{prev ?? shown.node}</span>
      {prev != null && <span key={"t" + shown.key} className="flap-top" style={{ ...layer, ...top }}>{prev}</span>}
      {prev != null && <span key={"b" + shown.key} className="flap-bottom" style={{ ...layer, ...bottom }}>{shown.node}</span>}
      {/* the split, a hairline across the middle */}
      <span aria-hidden style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "rgba(0,0,0,0.35)" }} />
    </span>
  );
}

// tint: another colour for the box (players' scheduled games, 2026-10-26)
function PlatformBox({ n, free, tint }) {
  return (
    <div style={{ width: 56, height: 44, borderRadius: 9, border: `1.5px ${free ? "dashed" : "solid"} ${free ? C.border : tint || C.teal}`, background: tint ? `color-mix(in srgb, ${tint} 18%, ${C.bgApp})` : C.bgApp, display: "flex", alignItems: "center", justifyContent: "center", ...smallTitle, fontSize: 24, color: free ? C.textMuted : C.teal }}>
      {typeof n === "string" ? n : n > 0 ? String(n).padStart(2, "0") : "–"}
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

// All clocks are 24-hour (Damon, 2026-10-26: "05:00 is 5 AM and 17:00 is 5 PM"): hourCycle h23 everywhere
// Time shown before a lobby message: "21:14" today, "Yesterday 21:14", or "11 Oct 21:14"
function lobbyTime(date) {
  if (!(date instanceof Date) || isNaN(date)) return "";
  const hm = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
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

// The voting in the Sky Train Chat (Damon, 2026-10-27: "the voting … should take up the space of chat, temporarily"):
// true = at the top of the chat window, only as tall as it needs, the chat under it faded until you're done voting
// (option 3); false = the old window over the page. Not for everyone yet: on the local dev copy, and for players who
// opened the test link www.acro.express/?layout=chat (Damon, 2026-10-27: "a different link … to play/test it with real
// players"); it's remembered in that browser until ?layout=classic or the "classic layout" link in the chat.
// Only this player's screen changes, so testers and everyone else can share a train.
const VOTE_IN_CHAT = (() => {
  try {
    const want = new URLSearchParams(window.location.search).get("layout");
    if (want === "chat") localStorage.setItem("acro.layout", "chat");
    if (want === "classic") localStorage.removeItem("acro.layout");
    return import.meta.env.DEV || localStorage.getItem("acro.layout") === "chat";
  } catch { return import.meta.env.DEV; }
})();
// back to the classic layout (the test link's way out): forget the choice and reload this page without it
function leaveChatLayout() {
  try { localStorage.removeItem("acro.layout"); } catch { /* private mode */ }
  window.location.href = window.location.pathname;
}

// An acro with each word's first letter picked out, so it's easy to see how the letters were used
function AcroInitials({ text }) {
  return text.split(/(\s+)/).map((w, i) => /^\p{L}/u.test(w)
    ? <span key={i}><b style={{ color: C.brand }}>{w[0]}</b>{w.slice(1)}</span>
    : <span key={i}>{w}</span>);
}

function VotingScreen({ roomId, entries, myPlayerId, onVoted, onVoteCast, timer, maxTimer, topic, passengers = [], inline = false, names = true }) {
  const [submitted, setSubmitted] = useState(false); // true after "I'm done voting" is clicked
  const [selected, setSelected] = useState(null);    // the currently selected entry id
  const [closed, setClosed] = useState(false);

  const [textPair] = useState(() => {
    const pairs = [
      { title: "🗳️ Which one is your favorite?" },
      { title: "🗳️ The platform is open for voting" },
      { title: "🗳️ Now presenting the Expressions" },
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
    if (!inline) setClosed(true);   // inline it stays, locked, until the results
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

  if (inline) {
    // boxes (3 a row) when every expression is short; one per line when any is long. Decided by the longest one at
    // this station, once, so nothing changes while voting
    const long = visibleEntries.some(e => (e.sentence || "").length > 32);
    const card = (on, extra = {}) => ({
      width: "100%", textAlign: "left", padding: long ? "4px 12px" : "9px 12px", borderRadius: 10, fontFamily: "inherit", fontSize: long ? 15 : 16, lineHeight: 1.3,
      background: on ? `color-mix(in srgb, ${C.brand} 13%, transparent)` : C.bgPanel2,
      border: `1px solid ${on ? C.brand : C.border}`, color: on ? C.ivory : C.textSecond,
      cursor: submitted ? "default" : "pointer", opacity: submitted && !on ? 0.55 : 1, transition: "all 0.15s", ...extra,
    });
    return (
      <div style={{ flex: "0 1 auto", minHeight: 0, display: "flex", flexDirection: "column", borderBottom: `1px solid ${C.border}` }}>
        {/* title and direction on one line */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", padding: "10px 16px 6px" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: C.ivory }}>{textPair.title}</span>
          {topic && <span style={{ ...smallTitle, fontSize: 20, overflowWrap: "anywhere" }}>{topic}</span>}
        </div>
        {/* the expressions: as many rows as they need, scrolling inside only when there are very many */}
        <div style={{ minHeight: 0, overflowY: "auto", padding: "2px 16px 8px", display: "grid", gridTemplateColumns: long ? "repeat(auto-fill, minmax(min(420px, 100%), 1fr))" : "repeat(auto-fill, minmax(230px, 1fr))", gap: long ? "4px 8px" : 8 }}>
          {visibleEntries.length === 0
            ? <p style={{ gridColumn: "1 / -1", margin: 0, color: C.textMuted, fontSize: 15 }}>No expressions to vote on at this station...</p>
            : visibleEntries.map(entry => (
              <button key={entry.id} onClick={() => handleSelect(entry.id)} disabled={submitted} style={card(sameId(selected, entry.id))}>
                <AcroInitials text={entry.sentence} />
              </button>
            ))}
          {visibleEntries.length > 0 && (
            <button onClick={handleBlankVote} disabled={submitted}
              style={card(selected === "blank", { background: selected === "blank" ? `color-mix(in srgb, ${C.brand} 13%, transparent)` : "transparent", border: `1px ${selected === "blank" ? "solid" : "dashed"} ${selected === "blank" ? C.brand : C.border}`, fontStyle: "italic", color: selected === "blank" ? C.ivory : C.textMuted })}>
              None of the above
            </button>
          )}
        </div>
        {/* who is done, and Done Voting with its clock; the button keeps its size when it turns into "Voted" */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, padding: "6px 16px 10px" }}>
          {/* the names take the row; on a phone the button drops to the next line instead of squeezing them */}
          <div style={{ flex: "1 1 260px", minWidth: 0, display: "flex", flexWrap: "wrap", gap: "2px 12px", fontSize: 14 }}>
            {/* wide screens: just how many (the names and ticks are in the passenger list beside the chat); phones: the names */}
            {!names && passengers.length > 0 && <span style={{ color: C.textMuted, fontSize: 14 }}><b style={{ color: C.teal }}>{passengers.filter(p => p.done).length}</b> of {passengers.length} done voting</span>}
            {names && passengers.length > 0 && <span style={{ color: C.textMuted, fontSize: 13 }}>Done voting:</span>}
            {names && passengers.map(p => (
              <span key={p.id} title={p.done ? "Done voting" : "Still voting"} style={{ display: "inline-flex", alignItems: "center", color: p.done ? C.teal : C.textMuted, fontWeight: p.done ? 700 : 400, whiteSpace: "nowrap" }}>
                <span style={{ width: 14, flexShrink: 0 }}>{p.done ? "✓" : ""}</span>{p.name}
              </span>
            ))}
          </div>
          <BtnSecondary onClick={submitted ? undefined : handleDoneVoting} style={{ flexShrink: 0, minWidth: 176, justifyContent: "space-between", display: "inline-flex", alignItems: "center", gap: 12, padding: "4px 10px 4px 16px", opacity: submitted ? 0.7 : 1, cursor: submitted ? "default" : "pointer" }}>
            {submitted ? "✓ Voted" : "Done Voting"}
            <span style={{ ...honkTitle, display: "inline-block", width: 48, textAlign: "center", fontSize: 30, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: timer !== null && timer <= 10 ? C.brand : C.teal, fontPalette: timer !== null && timer <= 10 ? "var(--fp-letters)" : "var(--fp-logo)", fontVariationSettings: "'SHLN' 0, 'MORF' 15", visibility: timer !== null ? "visible" : "hidden" }}>{two(timer)}</span>
          </BtnSecondary>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 520, background: C.bgPanel, border: `1px solid ${C.brand}`, borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ margin: 0, fontSize: 20, color: C.ivory, fontFamily: "Fredoka, sans-serif" }}>{textPair.title}</h2>
          {/* The round's topic — players asked "what was the topic?" while voting */}
          {topic && (
            <div style={{ margin: "10px 0 0", textAlign: "center" }}>
              <div style={{ fontSize: 34, ...smallTitle, overflowWrap: "anywhere" }}>{topic}</div>   {/* Honk (Damon, 2026-10-18) */}
            </div>
          )}
          {/* Always takes its line, shown only once you picked one: before, it appeared on the first pick, the box grew,
              and (centred on the screen) all the acros jumped (Damon, 2026-10-23) */}
          <p style={{ margin: "6px 0 0", fontSize: 13, color: C.textMuted, visibility: selected && selected !== "blank" && !submitted ? "visible" : "hidden" }}>
            You can change your vote until you click "Done Voting".
          </p>
        </div>

        {/* Entry list */}
        {/* maxHeight follows the screen height (was a fixed 380px, which only fit ~4 entries) */}
        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
          {visibleEntries.length === 0 ? (
            <p style={{ color: C.textMuted, fontSize: 15, textAlign: "center" }}>No expressions to vote on at this station...</p>
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
          {/* "None of the above": the last option of the list, like the acros (Damon, 2026-10-24: not a box below) */}
          {visibleEntries.length > 0 && (
            <button onClick={handleBlankVote} disabled={submitted}
              style={{
                width: "100%", textAlign: "left", padding: "12px 16px",
                background: selected === "blank" ? `color-mix(in srgb, ${C.brand} 13%, transparent)` : "transparent",
                border: `1px ${selected === "blank" ? "solid" : "dashed"} ${selected === "blank" ? C.brand : C.border}`,
                borderRadius: 10, color: selected === "blank" ? C.ivory : C.textMuted, fontStyle: "italic",
                fontSize: 16, cursor: submitted ? "not-allowed" : "pointer",
                opacity: submitted && selected !== "blank" ? 0.6 : 1,
                fontFamily: "inherit", transition: "all 0.15s"
              }}>
              None of the above
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 24px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "center", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Who is done voting, by name (Zyngacita, 2026-10-26: "see exactly who voted and who didn't"): a ✓ and teal
              once they clicked Done Voting. The tick has its own slot, so names never move */}
          {passengers.length > 0 && (
            <div style={{ width: "100%", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 14px", fontSize: 14 }}>
              {/* the label says what the tick means (Damon: otherwise it could read as "voted for this acro") */}
              <span style={{ color: C.textMuted, fontSize: 13 }}>Done voting:</span>
              {passengers.map(p => (
                <span key={p.id} title={p.done ? "Done voting" : "Still voting"} style={{ display: "inline-flex", alignItems: "center", color: p.done ? C.teal : C.textMuted, fontWeight: p.done ? 700 : 400, whiteSpace: "nowrap" }}>
                  <span style={{ width: 14, flexShrink: 0 }}>{p.done ? "✓" : ""}</span>{p.name}
                </span>
              ))}
            </div>
          )}

          {/* Done Voting with the voting clock inside its frame, on the right (Damon, 2026-10-24). The clock: number only,
              red in the last 10 seconds, in Honk, two digits, stays on 00 when the time is up */}
          <BtnSecondary onClick={handleDoneVoting} style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "4px 10px 4px 16px" }}>
            Done Voting
            {timer !== null && (
              // a fixed-width slot: the button never changes size as the number changes
              <span style={{ ...honkTitle, display: "inline-block", width: 48, textAlign: "center", fontSize: 30, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: timer <= 10 ? C.brand : C.teal, fontPalette: timer <= 10 ? "var(--fp-letters)" : "var(--fp-logo)", fontVariationSettings: "'SHLN' 0, 'MORF' 15" }}>{two(timer)}</span>
            )}
          </BtnSecondary>
        </div>
      </div>
    </div>
  );
}

// The topic's font (Damon, 2026-10-24: "Leave it in Honk and give me a clickable option to change the font to
// decide"): a click on the topic switches Honk ↔ Nunito (2026-10-24: Fredoka dropped; Nunito smaller). Saved in the
// browser; every topic on the page follows. scale: its size next to Honk's.
const TOPIC_FONTS = {
  honk: { name: "Honk", style: smallTitle, scale: 1 },
  nunito: { name: "Nunito", style: { fontFamily: "'Nunito', sans-serif", fontWeight: 500, color: C.textPrimary }, scale: 0.72 },
};
function useTopicFont() {
  const [key, setKey] = useState(() => { try { const k = localStorage.getItem("acro.topicFont"); return TOPIC_FONTS[k] ? k : "honk"; } catch { return "honk"; } });
  useEffect(() => {
    const on = e => setKey(e.detail);
    window.addEventListener("acro-topicfont", on);
    return () => window.removeEventListener("acro-topicfont", on);
  }, []);
  const next = () => {
    const keys = Object.keys(TOPIC_FONTS), k = keys[(keys.indexOf(key) + 1) % keys.length];
    try { localStorage.setItem("acro.topicFont", k); } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent("acro-topicfont", { detail: k }));
  };
  return [TOPIC_FONTS[key], next];
}
// A topic in the chosen font; a click switches the font
function TopicText({ children, size }) {
  const [font, next] = useTopicFont();
  return (
    <span onClick={next} data-hint={`Direction font: ${font.name}. Click to try another`} style={{ ...font.style, fontSize: Math.round(size * font.scale), lineHeight: 1.15, cursor: "pointer", overflowWrap: "anywhere" }}>{children}</span>
  );
}

// "Expressions accepted" left of the letters (after Acrophobia, 2026-10-24): a light per passenger, lit for each acro in
// (Damon didn't like a ticket; no number, "the lights are enough"). It mirrors the DIRECTION on the other side of the
// letters: the label just above, right-aligned towards the letters, the lights in the letters' band.
function AnswersAccepted({ count, total, children, twoLines }) {
  const lights = Math.min(16, Math.max(total, count));
  return (
    <div style={{ position: "relative", maxWidth: 400 }} aria-label={`${count} of ${lights} expressions accepted`} aria-live="polite">
      {/* children: an invisible copy of the direction, so this box is exactly as wide as the direction box opposite */}
      <div aria-hidden style={{ height: 0, overflow: "hidden", visibility: "hidden" }}>{children}</div>
      <div style={{ position: "absolute", bottom: "100%", right: 0, marginBottom: 4, fontSize: 13, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", whiteSpace: "nowrap", textAlign: "right", lineHeight: 1.3 }}>
        {/* two lines on smaller screens, where one long line ran off the left edge */}
        Expressions{twoLines ? <br /> : " "}accepted
      </div>
      <div style={{ display: "flex", gap: 7, justifyContent: "flex-end", flexWrap: "wrap", maxWidth: 200, marginLeft: "auto" }} aria-hidden>
        {Array.from({ length: lights }, (_, i) => (
          <span key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: i < count ? C.teal : "transparent", border: `1.5px solid ${i < count ? C.teal : C.border}`, boxShadow: i < count ? `0 0 6px ${C.teal}` : "none", transition: "all 0.3s" }} />
        ))}
      </div>
    </div>
  );
}

// ── The topic desk (2026-10-24, after GPT's mock-up Damon liked) ─────────────
// One wide panel for choosing a topic (the creator's first topic and the winner's next one): quick topics on the
// left, the box and the big button in the middle, the topic as it will look on the right (the thin
// dividers between them went, Damon 2026-10-24). Behind it, Damon's picture (2026-10-24, public/art/topic-desk-2.webp, transparent sky): clouds, a platform and
// a station shelter with a lamp and the "0 STATION" sign. It spans the panel's full width, bottom-aligned (2026-10-24, Damon:
// "you didn't place it well" — the first try fitted it to the height and faded the clouds); the panel is tall enough for
// the shelter's roof and sign (the picture is 3:1, shown whole), the content left of the shelter.
function TopicDesk({ left, center, right, narrow, station, departing }) {
  // no lines between the parts any more (Damon, 2026-10-24: "We don't need these"); the empty 1px columns stay so the
  // layout doesn't move
  const divider = <div aria-hidden />;
  const layer = { position: "relative", zIndex: 1 };
  return (
    <div style={{
      position: "relative", overflow: "hidden", background: C.bgPanel,
      border: `1px solid ${C.border}`, borderRadius: 14, boxSizing: "border-box",
      // shorter than the whole 3:1 picture (Damon: "takes too much vertical space"): its bottom part, the top of the roof
      // cropped (the stage is the window less about 80 px of margins). 2026-10-24: a little more cropped (0.24 → 0.21),
      // the height goes to the chat panel below (Damon)
      minHeight: narrow ? undefined : "calc((100vw - 80px) * 0.21)",
      // clear of the shelter's posts (its roof only overhangs at the top) and above the platform
      padding: narrow ? "18px 16px" : "22px 21% 5% 36px", display: narrow ? "flex" : "grid", flexDirection: "column", gap: narrow ? 18 : 0,
      gridTemplateColumns: "minmax(0, 1.2fr) 1px minmax(0, 1.4fr) 1px minmax(0, 0.9fr)", columnGap: 28, alignItems: "center",
    }}>
      {/* the picture, its number and its tint in one group: it fades in when the desk appears, and slips away and fades
          out as the train departs (Highball!). It reaches past the panel's right edge (overscan: 80 px, 40 on phones),
          a little more than it moves (--depart), so its right edge never shows */}
      <div aria-hidden className={departing ? "acro-depart" : "acro-fade-in"}
        style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: narrow ? -40 : -80, pointerEvents: "none", "--depart": narrow ? "34px" : "68px" }}>
      {/* the picture: the full width, bottom-aligned */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "url(/art/topic-desk-2.webp)", backgroundRepeat: "no-repeat", backgroundPosition: "center bottom", backgroundSize: "100% auto", opacity: narrow ? 0.35 : 1 }} />
      {/* The sign's number: a box over the painted 0, in the sign's yellow, with the station number in Goldman. It lives
          in a layer with the picture's own shape (2000 x 667, bottom-aligned, full width), so the percentages are
          places in the picture: the painted 0 is at x 1756-1794, y 257-314 */}
      {station != null && (
        <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, aspectRatio: "2000 / 667", containerType: "inline-size", pointerEvents: "none", opacity: narrow ? 0.35 : 1 }}>
          <div style={{ position: "absolute", left: "87.4%", width: "2.75%", top: "37.5%", height: "10.5%", background: "#FBCD4F", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Goldman', sans-serif", fontWeight: 700, color: "#371C27", lineHeight: 1, fontSize: station > 9 ? "2.6cqw" : "3.8cqw", letterSpacing: station > 9 ? "-0.06em" : 0 }}>{station}</div>
        </div>
      )}
      {/* the picture in this palette's colours (Damon, 2026-10-24): a layer of the palette's colours that only changes the
          hue ("color" blending keeps the picture's light and shading), drawn only where the picture is (masked by it).
          Golden Hour, the picture's own palette, keeps the original (--art-tint 0) */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", mixBlendMode: "color", opacity: narrow ? 0 : "var(--art-tint, 0.9)",
        background: "linear-gradient(180deg, var(--art-top) 20%, var(--art-bottom) 85%)",
        WebkitMaskImage: "url(/art/topic-desk-2.webp)", maskImage: "url(/art/topic-desk-2.webp)", WebkitMaskSize: "100% auto", maskSize: "100% auto",
        WebkitMaskPosition: "center bottom", maskPosition: "center bottom", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat" }} />
      </div>
      <div style={{ ...layer, minWidth: 0, order: narrow ? 2 : 0 }}>{left}</div>
      {!narrow && <div style={{ ...layer, alignSelf: "stretch", display: "flex" }}>{divider}</div>}
      <div style={{ ...layer, minWidth: 0, textAlign: "center" }}>{center}</div>
      {!narrow && <div style={{ ...layer, alignSelf: "stretch", display: "flex" }}>{divider}</div>}
      <div style={{ ...layer, minWidth: 0, order: narrow ? 3 : 0 }}>{right}</div>
    </div>
  );
}
// Small caps above a piece of the desk ("EVERYONE ON BOARD?", "TOPIC")
const deskEyebrow = { fontSize: 15, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.16em" };
// Left: a compass, "PICK ONE · QUICK TOPICS", then the topics as outlined pills (the chosen one in gold)
function QuickTopics({ ideas, selected, onPick }) {
  if (!ideas.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start", maxWidth: 320, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
        <svg aria-hidden width="30" height="30" viewBox="0 0 30 30" fill="none" stroke={C.brand} strokeWidth="1.6">
          <circle cx="15" cy="15" r="12" /><path d="M15 3v3M15 24v3M3 15h3M24 15h3" strokeLinecap="round" />
          <path d="M19 11l-2.6 5.4L11 19l2.6-5.4z" fill={C.brand} stroke="none" />
        </svg>
        <div style={{ lineHeight: 1.25 }}>
          <div style={deskEyebrow}>Pick one</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.textPrimary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Quick directions</div>
        </div>
      </div>
      {ideas.map(t => {
        const on = selected === t;
        return (
          <button key={t} onClick={() => onPick(t)} aria-pressed={on}
            // the panel colour behind each pill, so they read clearly over the clouds of the picture
            style={{ background: on ? `color-mix(in srgb, ${C.brand} 22%, ${C.bgPanel})` : `color-mix(in srgb, ${C.bgPanel} 88%, transparent)`, border: `${on ? 2 : 1}px solid ${on ? C.brand : C.border}`, borderRadius: 999,
              padding: on ? "4px 15px" : "5px 16px", color: C.textPrimary, fontFamily: "inherit", fontSize: 15, fontWeight: 600, lineHeight: 1.3, cursor: "pointer", textAlign: "left", maxWidth: "100%", overflowWrap: "anywhere" }}>
            {t}
          </button>
        );
      })}
    </div>
  );
}
// Right: "TOPIC" and the topic as it will look
function TopicPreview({ topic, size, empty = "Yours shows here" }) {
  return (
    <div style={{ maxWidth: 360, margin: "0 auto" }}>
      {topic ? <TopicText size={size}>{topic}</TopicText> : <span style={{ fontSize: 16, color: C.textMuted, fontStyle: "italic" }}>{empty}</span>}
      {topic && specialTopicNote(topic) && <div style={{ fontSize: 14, color: C.textPrimary, marginTop: 6 }}>🎭 {specialTopicNote(topic)}</div>}
    </div>
  );
}
// The desk the other passengers see while someone chooses (2026-10-24): the same picture, who is choosing, the clock
// (none before the first station: the creator presses START), and the direction's place on the right
function WatchDesk({ name, eyebrow, timer, first, narrow, short, station }) {
  return (
    <TopicDesk narrow={narrow} station={station}
      left={null}
      center={<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={deskEyebrow}>{eyebrow}</div>
        <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 24, color: C.textPrimary }}>
          <span style={{ color: C.brand }}>{name || "Someone"}</span> is choosing the {first ? "first " : ""}direction…
        </div>
        {timer != null && <div style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 56, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: timer <= 5 ? C.brand : C.teal, visibility: timer > 0 ? "visible" : "hidden" }}>{two(timer)}</div>}
        <div style={{ fontSize: 13, color: C.textMuted }}>Get ready to write!</div>
      </div>}
      right={<TopicPreview topic="" size={short ? 28 : 32} empty="Coming up…" />} />
  );
}
// The topic box: wide, a gold line, a pencil at its right end
function DeskInput({ id, value, onChange, onEnter, placeholder, pulse }) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input id={id} className={pulse ? "acro-pulse" : undefined} maxLength={80} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter") onEnter(); }}
        style={{ width: "100%", boxSizing: "border-box", background: `color-mix(in srgb, ${C.bgApp} 55%, ${C.bgPanel})`, border: `2px solid ${C.focusLine}`, borderRadius: 10, padding: "12px 46px", color: C.textPrimary, fontSize: 19, outline: "none", fontFamily: "inherit", textAlign: "center" }} />
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill={C.textPrimary} style={{ position: "absolute", right: 16, top: "50%", marginTop: -9, opacity: 0.85 }}>
        <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm17.7-10.2a1 1 0 0 0 0-1.42l-2.33-2.33a1 1 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
      </svg>
    </div>
  );
}
// The big button: a word in Honk, dark on gold, with a ▶
// ready = false: the signal hasn't cleared yet (no direction): dimmed and not clickable; ready: lit, with a glow.
// flash: the moment it is pressed
// hint: the hover line, on a wrapper (a disabled button gets no mouse events, so the dim button lets the mouse through
// to the wrapper)
function DeskButton({ children, onClick, disabled, ready = true, flash, hint }) {
  const off = disabled || !ready;
  return (
    <span data-hint={hint} style={{ display: "inline-flex", cursor: off ? (disabled ? "wait" : "not-allowed") : undefined }}>
    <button onClick={onClick} disabled={off} className={flash ? "acro-highball" : undefined}
      style={{ pointerEvents: off ? "none" : "auto", ...smallTitle, color: C.onBrand, fontPalette: "var(--fp-dark)", fontVariationSettings: "'SHLN' 0, 'MORF' 15", background: C.brand, border: "none", borderRadius: 14,
        padding: "10px 40px", fontSize: 34, lineHeight: 1.1, cursor: disabled ? "wait" : ready ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: 14,
        opacity: ready ? 1 : 0.4, filter: ready ? "none" : "saturate(0.4)", transition: "opacity 0.35s, filter 0.35s, box-shadow 0.35s",
        boxShadow: ready ? `0 6px 18px rgba(0,0,0,0.3), 0 0 22px color-mix(in srgb, ${C.brand} 55%, transparent)` : "none" }}>
      {children}
      <svg aria-hidden width="16" height="18" viewBox="0 0 16 18"><path d="M1 1l14 8-14 8z" fill={C.onBrand} /></svg>
    </button>
    </span>
  );
}

// ── Results Screen ─────────────────────────────────────────────
// The station's results: everyone by points, each passenger's acro, and the winners (the authors of the winning acro
// who scored; several when identical acros were merged)
function stationResults(scores, winningAcro, entries, players) {
  const sorted = Object.entries(scores || {}).sort((a, b) => b[1] - a[1]);
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
  return { sorted, entryByNickname, winners };
}

// Damon's five lines for the station winner (2026-10-24), word for word; only the station number and the name change.
// The name always comes last, so each line is the words before it.
// "wins" is Damon's first mock (2026-10-24): the name on top, "WINS THE STATION!" under it (no number)
const STATION_CHEERS = ["wins", "applauds", "cheers for", "tips its hat to", "bows to", "is in awe of"];

// Left of the results, centred on them: "Station 1 applauds" and the winner's name in Honk. One line at random per
// station (the train page gives it a new key each station, so it picks again). streak: stations in a row this winner
// has won; from 2 on it is always "wins the station again!", from 3 "… again and again!"
// wow: the winner used the Word of the Week, "Sandy WoWs the station!" (Damon, 2026-10-26); it comes before the others
function StationCheer({ round, names, streak = 1, wow = false }) {
  const [picked] = useState(() => STATION_CHEERS[Math.floor(Math.random() * STATION_CHEERS.length)]);
  const cheer = wow || streak >= 2 ? "wins" : picked;
  const again = streak >= 3 ? " again and again" : streak === 2 ? " again" : "";
  if (!names.length) return null;
  const nameStyle = { ...smallTitle, fontSize: 34, lineHeight: 1.15, color: C.brand, overflowWrap: "anywhere" };
  if (cheer === "wins") return (
    <div style={{ textAlign: "center", padding: "8px 4px" }}>
      <div style={nameStyle}>{names.join(" & ")}</div>
      {wow
        ? <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 20, color: C.teal, marginTop: 4 }}>📖 {names.length > 1 ? "WoW" : "WoWs"} the station{again}!</div>
        : <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 18, color: C.teal, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 4 }}>{names.length > 1 ? "win" : "wins"} the station{again}!</div>}
    </div>
  );
  return (
    <div style={{ textAlign: "center", padding: "8px 4px" }}>
      <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 18, color: C.teal }}>Station {round} {cheer}</div>
      <div style={{ ...nameStyle, marginTop: 4 }}>{names.join(" & ")}!</div>
    </div>
  );
}

function ResultsScreen({ scores, winningAcro, entries, players, round, topic, onClose, myVote, votes, myName, details, letters, inline = false, narrow = false }) {
  const { sorted, entryByNickname, winners } = stationResults(scores, winningAcro, entries, players);
  const anyPoints = sorted.some(([, s]) => s > 0);
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
      {details.wordBonus?.length > 0 && <> 📖 Word of the week +1: <b style={{ color: C.textPrimary }}>{details.wordBonus.join(", ")}</b>.</>}
    </>;
  }

  const cell = { padding: "3px 10px", lineHeight: 1.25, borderBottom: `1px solid ${C.border}`, textAlign: "left" };   // compact rows (AcroChallenge): 14 fit
  const Wrap = inline ? "div" : Panel;
  if (inline) cell.padding = "2px 10px";   // in the chat window: 16 rows fit on Fran's screen
  const youVotedLine = `2px solid ${C.teal}`;
  return (
    // Its width comes from the train page: lined up with the panels below (Damon, 2026-10-24; before: at most 860 px, centred).
    // inline: at the top of the Sky Train Chat (VOTE_IN_CHAT), as tall as it needs, scrolling inside only if it must
    <Wrap style={inline ? { flex: "0 1 auto", minHeight: 0, overflowY: "auto", padding: "8px 16px", borderBottom: `1px solid ${C.border}` } : { padding: "10px 14px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: inline ? 0 : 4 }}>
        <h2 style={{ margin: 0, fontSize: inline ? 18 : 28, ...smallTitle }}>   {/* Honk (Damon, 2026-10-18) */}
          Station {round}{topic ? ` – ${topic}` : ""}
        </h2>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* The symbols, in words (AcroChallenge's legend) — next to the title to save a line */}
          {anyPoints && !narrow && (
            <span style={{ color: C.textMuted, fontSize: 12, textAlign: "right" }}>
              🏆 station winner · <span style={{ color: C.success, fontWeight: 800 }}>✓</span> voted for the winner (+1){iVoted && <> · <span style={{ border: youVotedLine, borderRadius: 4, padding: "0 4px" }}>outlined</span> = your vote</>}
            </span>
          )}
          {!inline && <button onClick={onClose} title="Close" style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1 }}>×</button>}
        </span>
      </div>
      {narrow ? (
        // Phones (2026-10-27): the name with the votes and points on one line, the expression full width under it
        <div style={{ display: "flex", flexDirection: "column" }}>
          {sorted.map(([name, score]) => {
            const isWinner = winners.some(w => w.name === name);
            const isMyVote = iVoted && entryByNickname[name] === myVote;
            return (
              <div key={name} style={{ padding: "4px 8px", borderBottom: `1px solid ${C.border}`, background: isWinner ? `color-mix(in srgb, ${C.brand} 22%, transparent)` : "transparent", boxShadow: isWinner ? `inset 4px 0 0 ${C.brand}` : "none", outline: isMyVote ? `2px solid ${C.teal}` : "none", outlineOffset: -2 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 14 }}>
                  <span style={{ width: 18, flexShrink: 0, textAlign: "center", fontSize: 13 }} title={isWinner ? "Station winner" : votedWinner.has(name) ? "Voted for the winner (+1)" : undefined}>
                    {isWinner ? "🏆" : votedWinner.has(name) ? <span style={{ color: C.success, fontWeight: 800 }}>✓</span> : ""}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isWinner ? C.textPrimary : C.textSecond, fontWeight: isWinner ? 700 : 400 }}>{name}</span>
                  {votes && <span style={{ fontSize: 12, color: C.textMuted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{votes[name] ?? 0} vote{(votes[name] ?? 0) === 1 ? "" : "s"}</span>}
                  <span style={{ minWidth: 52, textAlign: "right", fontWeight: 800, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums", color: isWinner ? C.brand : C.teal, whiteSpace: "nowrap" }}>{score} pts</span>
                </div>
                <div style={{ paddingLeft: 24, fontSize: 14, lineHeight: 1.3, fontStyle: "italic", color: isWinner ? C.ivory : C.textSecond, fontWeight: isWinner ? 700 : 400 }}>
                  {entryByNickname[name] || "—"}
                  {isMyVote && <span style={{ marginLeft: 8, fontStyle: "normal", fontWeight: 700, fontSize: 11, color: C.teal, border: `1px solid ${C.teal}`, borderRadius: 999, padding: "0 6px", whiteSpace: "nowrap" }}>your vote</span>}
                  {isWinner && myName && String(name).toLowerCase() === String(myName).toLowerCase() && <span style={{ marginLeft: 8 }}><ShareAcroButton a={{ letters: (letters || []).join(""), topic, acro: entryByNickname[name], points: score, won: true, by: name }} /></span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ color: C.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              <th style={cell}>Name</th>
              {votes && <th style={{ ...cell, textAlign: "center", width: 64 }}>Votes</th>}
              <th style={{ ...cell, textAlign: "center", width: 70 }}>Points</th>
              <th style={cell}>Expressions</th>
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
                  </td>
                  {votes && <td style={td({ textAlign: "center", color: isWinner ? C.textPrimary : C.textSecond, fontWeight: 700, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums" })}>{votes[name] ?? 0}</td>}
                  <td style={td({ textAlign: "center", color: isWinner ? C.brand : C.teal, fontWeight: 700, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums" })}>{score}</td>
                  <td style={td({ color: isWinner ? C.ivory : C.textSecond, fontStyle: "italic", fontWeight: isWinner ? 700 : 400 }, false, true)}>
                    {entryByNickname[name] || "—"}
                    {isMyVote && <span style={{ marginLeft: 8, fontStyle: "normal", fontWeight: 700, fontSize: 11, color: C.teal, border: `1px solid ${C.teal}`, borderRadius: 999, padding: "0 6px", whiteSpace: "nowrap" }}>your vote</span>}
                    {/* the winning acro, as a picture to send to friends (2026-10-23) */}
                    {/* only for the winner themselves: the card carries their name (Damon, 2026-10-23: "just the one who asks") */}
                    {isWinner && myName && String(name).toLowerCase() === String(myName).toLowerCase() && <span style={{ marginLeft: 8 }}><ShareAcroButton a={{ letters: (letters || []).join(""), topic, acro: entryByNickname[name], points: score, won: true, by: name }} /></span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      {!anyPoints ? (
        <p style={{ margin: "8px 0 0", color: C.textMuted, fontSize: 14 }}>No points were awarded at this station.</p>
      ) : (
        <>
          {summary && <p style={{ margin: "4px 0 0", color: C.textSecond, fontSize: 14 }}>{summary}</p>}
        </>
      )}
    </Wrap>
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
  // 4 topics from the Express Server's pool for the station winner to choose from (2026-10-24), that fit the next
  // station's letters (3 + the station number's place in 3,4,5,6,7)
  const [topicIdeas, setTopicIdeas] = useState([]);
  useEffect(() => {
    if (!topicRequested) return;
    const letters = topicForFirstRound ? 3 : 3 + (currentRound % 5);
    fetch(`${API_URL}/api/topics/suggest?n=4&letters=${letters}`).then(r => (r.ok ? r.json() : [])).then(list => setTopicIdeas(Array.isArray(list) ? list : [])).catch(() => setTopicIdeas([]));
  }, [topicRequested]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [topicDraft, setTopicDraft] = useState("");
  // Waits 8 s after the results appear before opening the winner's topic prompt
  const topicPromptTimerRef = useRef(null);
  // The Word of the Week, shown under the direction on ordinary stations (Damon, 2026-10-25: "We would like Word of
  // the week showing back into the room again")
  const roomWord = useWordOfWeek();
  // Every passenger's name by id, kept after they leave (the chooser may have just got off: "Someone is choosing…")
  const nameByIdRef = useRef({});
  // The station winner's streak (stations won in a row), for "wins the station again!" (Damon, 2026-10-24)
  const winStreakRef = useRef({ id: null, count: 0 });
  const [winStreak, setWinStreak] = useState(1);
  // The others watch the desk while someone chooses: { id, first } (first = the first station of a new game)
  const [watchChooser, setWatchChooser] = useState(null);
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
  const honkedRef = useRef(false);   // the creator already heard the horn at the end of the countdown
  // 4 topics from the Express Server's pool for the first topic too (2026-10-24)
  const [firstIdeas, setFirstIdeas] = useState([]);
  useEffect(() => {
    if (topicRequested || !["Waiting", "Paused", "GameOver"].includes(phase)) return;   // waiting for a first topic
    fetch(`${API_URL}/api/topics/suggest?n=4&letters=3`).then(r => (r.ok ? r.json() : [])).then(list => setFirstIdeas(Array.isArray(list) ? list : [])).catch(() => setFirstIdeas([]));
  }, [phase, topicRequested]);
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
  const stationEndRef = useRef(0);     // when the writing time ends (ms), so a song chosen mid-station fits the rest
  const musicNowRef = useRef(null);    // the music playing in this station ("classic" or a theme id)
  const stationLenRef = useRef(60);    // the whole writing time (s): a song chosen mid-station comes in where it would be
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
  const [votedIds, setVotedIds] = useState([]);   // clicked "Done Voting" at this station (Zyngacita, 2026-10-26)
  const [iVoted, setIVoted] = useState(false);    // I clicked "Done Voting" at this station: the chat stops being faded
  const noticeTimerRef = useRef(null);
  // The 3-second room check can't reach the server (also shows the banner)
  const [pollFailing, setPollFailing] = useState(false);
  // The room loaded at least once — after that, a failed check keeps the room on screen
  const roomLoadedRef = useRef(false);
  // The room no longer exists on the server (everyone left, or closed after 5 minutes)
  const [roomClosed, setRoomClosed] = useState(false);
  // Vote to kick: removed from this train by a passenger vote (back when the journey ends)
  const [kicked, setKicked] = useState(false);
  const [full, setFull] = useState(false);              // the train has 16 passengers already (2026-10-23)
  const [kickVotes, setKickVotes] = useState({});      // targetId → { votes, needed } (shown in Passengers)
  const [myKicks, setMyKicks] = useState([]);           // targetIds I voted to kick
  // Last known room name, so the title never falls back to "Room #<id>"
  const roomNameRef = useRef("");
  // Set while leaving with Back to Lobby, so the poll below doesn't join the room again
  const leavingRef = useRef(false);
  // When the poll last re-joined us (so it doesn't try more than every 5 s)
  const lastRejoinRef = useRef(0);

  // The writing-time music for the seconds that are left: the player's choice in the Music menu. Called when a
  // station starts and when the player picks another song during the writing time (it replaces the one playing).
  function startStationMusic(seconds) {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (songTimeoutRef.current) { clearTimeout(songTimeoutRef.current); songTimeoutRef.current = null; }
    const music = soundSettings.music || "classic";
    musicNowRef.current = MUSIC_CHOICES.some(m => m.id === music) ? music : "classic";   // an unknown choice: the song
    // A theme made in the browser instead of the original song: it fits the seconds left and ends at 0 by itself
    if (musicNowRef.current !== "classic") {
      const holder = themeAudio();
      holder.volume = THEME_LEVEL * soundGain();
      audioRef.current = holder;
      if (submittedAcroRef.current) holder.muted = true;
      playTheme(music, seconds || 60, THEME_LEVEL, stationLenRef.current)   // the holder sets the real volume (also 0 when muted)
        .then(pl => { if (audioRef.current !== holder) pl?.stop(); else holder.attach(pl); })
        .catch(() => { });
      return;
    }

    const audio = new Audio("/AcroExpress_tunes.m4a");
    audio.loop = false;
    audio.volume = THEME_LEVEL * soundGain();   // the player's sound setting, softer for the main theme
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
          audio.volume = v * THEME_LEVEL * soundGain();   // fade up to the theme's level, not to full
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
    if (delayMs > 0) songTimeoutRef.current = setTimeout(startSong, delayMs);
    else startSong();
  }

  // 🔊 / volume changed in the header: apply it to the sounds playing at this moment
  useEffect(() => {
    const onSound = () => {
      // Another song chosen during the writing time: switch now, for the seconds that are left (Damon, 2026-10-21:
      // "the music will not switch to a new theme even when I click it" — it used to wait for the next station)
      const music = soundSettings.music || "classic";
      if (phaseRef.current === "Submitting" && musicNowRef.current && music !== musicNowRef.current) {
        const left = (stationEndRef.current - Date.now()) / 1000;
        if (left > 3) { startStationMusic(left); return; }
      }
      if (audioRef.current) audioRef.current.volume = THEME_LEVEL * soundGain();   // the main theme stays softer
      for (const a of [audio2Ref.current, votingAudioRef.current])
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
    // Someone clicked "Done Voting": the server sends everyone who is done so far
    onVotedPlayers: useCallback((ids) => {
      setVotedIds((ids || []).map(x => String(x).toLowerCase()));
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
      // the journey begins: a train horn (the creator heard it already at the end of the countdown)
      if (Number(roundNumber) === 1) { if (!honkedRef.current) playHonk(soundGain()); honkedRef.current = false; }
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
      setIVoted(false);
      setAcroError("");
      setMyVote(null); // new round — forget last round's vote
      clearTimeout(topicPromptTimerRef.current); // a round started — no topic prompt pending any more
      setWatchChooser(null);
      setNextGameIn(null); // a round has started — no game-over countdown any more
      setSubmittedIds([]); // nobody has submitted yet in the new round
      setVotedIds([]);
      // Show this round's topic next to the acro input.
      // Before, this line cleared the topic — but TopicSet arrives just BEFORE
      // RoundStarted, so the topic was wiped the moment the round began.
      if (typeof topic === "string") setCurrentTopic(topic);
      setCurrentRound(roundNumber);
      // One chat line per round with the topic in it (before, the topic had its own line,
      // which left less room for real chat on short screens)
      // with the letter count (Sandy, 2026-10-24: "it shows how many above … but not in the chat here")
      const nLetters = (typeof lettersStr === "string" ? lettersStr : (lettersStr || []).join("")).length;
      postSystemMessage(typeof topic === "string" && topic.trim()
        ? `Leaving for Station ${roundNumber} · ${nLetters} letters — Direction: "${topic}"`
        : `Leaving for Station ${roundNumber} · ${nLetters} letters.`);
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

      stationEndRef.current = Date.now() + (seconds || 60) * 1000;
      stationLenRef.current = seconds || 60;
      startStationMusic(seconds);
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
      setVotedIds([]);   // nobody is done voting yet
      setIVoted(false);
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
      // a new game: whatever phase this page thought it was in (2026-10-24: a page that missed the game's end still
      // had station 9's letters, direction and "Your entry is on its way" under the desk), nothing of the old one stays
      setPhase(prev => (prev === "Waiting" ? prev : "Starting"));
      setLetters([]);
      setSubmittedAcro(null);
      submittedAcroRef.current = null;
      setEntries([]);
      setCurrentTopic("");
      // sameId ignores case differences between the backend Guid and localStorage
      if (sameId(auth?.userId, creatorUserId)) {
        setTopicForFirstRound(true); // a new game always starts at round 1 (3 letters)
        setTopicRequested(true);
        topicRequestedRef.current = true;
        setTopicTimer(35);
      } else {
        postSystemMessage("Waiting for the host to set a direction...");
        setWatchChooser({ id: creatorUserId, first: true });
        setTopicTimer(35);
      }
    }, [auth]),

    // roundVotesMap (4th) = votes per player's acro — sent by newer servers only
    // details (5th, new): who voted for the winner, letter bonus, winner's votes, speed bonus
    onRoundEnded: useCallback((roundScores, winning, winnerPlayerId, roundVotesMap, details) => {
      // the winner's streak: one more if they won the station before this one too, otherwise 1 (none: no winner)
      const prev = winStreakRef.current;
      winStreakRef.current = winnerPlayerId ? { id: winnerPlayerId, count: sameId(prev.id, winnerPlayerId) ? prev.count + 1 : 1 } : { id: null, count: 0 };
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
        // the Word of the Week, in the chat for everyone to see
        if (details?.wordBonus?.length) postSystemMessage(`📖 ${details.wordBonus.join(" and ")} used the word of the week, "${details.word}": +1!`);
        setWinningAcro(winning);
        setWinStreak(winStreakRef.current.count);
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
            setTopicTimer(35);
          }, 8000);
        } else if (winnerPlayerId) {
          clearTimeout(topicPromptTimerRef.current);
          topicPromptTimerRef.current = setTimeout(() => {
            setWatchChooser({ id: winnerPlayerId, first: false });
            setTopicTimer(35);
          }, 8000);
        }
      }, 4180);
    }, [auth]),

    // winners (2nd argument, new 2026-10-20): everyone tied at the top. One name = one winner; more = co-winners.
    onGameOver: useCallback((winner, winners) => {
      const names = Array.isArray(winners) && winners.length > 0 ? winners : [winner];
      setWatchChooser(null);
      winStreakRef.current = { id: null, count: 0 };   // a new journey starts a new streak
      // Stop all audio
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current = null; }
      if (votingAudioRef.current) { votingAudioRef.current.pause(); votingAudioRef.current = null; }

      // Show winner inline — players stay in the room
      setGameWinner({
        name: winner,
        names,
        message: finalStopMessage(names),
        at: Date.now(),                 // a new celebration each time (the confetti restarts)
      });
      playFanfare();
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
      setWatchChooser(null);
      setTimer(null);
      setLetters([]);
      setFrozenScores(null);
      postSystemMessage("Game paused: no acros for 3 rounds in a row. Choose a direction to continue.");
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
      setWatchChooser(null);
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
        postSystemMessage(m.added ? `You voted to eject "${m.target}".` : `You took back your vote to eject "${m.target}".`);
      } else {
        postSystemMessage(m.added ? `A vote to eject "${m.target}" was cast (${m.votes} of ${m.needed} needed).`
          : `A vote to eject "${m.target}" was taken back (${m.votes} of ${m.needed}).`);
      }
    }, [auth]),

    onPlayerKicked: useCallback((m) => {
      setKickVotes(prev => { const next = { ...prev }; delete next[String(m.targetId).toLowerCase()]; return next; });
      setMyKicks(prev => prev.filter(t => t !== String(m.targetId).toLowerCase()));
      if (sameId(m.targetId, auth?.userId)) { leavingRef.current = true; setKicked(true); return; }
      postSystemMessage(`"${m.target}" was removed from the train by a passenger vote.`);
      refreshRoomState();
    }, [auth]),

    // Late-arrival penalty (Damon, 2026-10-20): no mention of who else is in on the joke
    onLatePenalty: useCallback((m) => {
      postSystemMessage(`${m.name} was late to arrive: ${m.points} points deducted.`);
      refreshRoomState();
    }, []),

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
  // ...and when the box changes size (the direction desk appearing made it shorter, and the newest 2-3 lines slipped
  // out of view, 2026-10-24), as long as the player was at the newest line (not while reading back)
  useEffect(() => {
    const el = chatListRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let atBottom = true;
    const onScroll = () => { atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24; };
    const ro = new ResizeObserver(() => { if (atBottom) el.scrollTop = el.scrollHeight; });
    el.addEventListener("scroll", onScroll);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); };
  }, [state.loading]);

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

  // Vote to eject (or take the vote back) — only by typing "/eject name" in Sky Train Chat
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
    // Chat commands (/?, /mu, /pc …); only you see their answers
    if (chatCommand(text, postSystemMessage, true)) { setRoomChatInput(""); return; }
    // "/eject name" votes to eject instead of chatting (Damon 2026-10-22: /eject, and no /kick any more)
    const cmd = text.match(/^\/eject\s+(.+)$/i);
    if (cmd) { setRoomChatInput(""); voteKick(cmd[1].trim()); return; }
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
      if (String(e?.message || "").includes("is full")) { leavingRef.current = true; setFull(true); }   // 16 aboard
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
          if (String(e?.message || "").includes("is full")) { leavingRef.current = true; setFull(true); return; }
          // 401 = the server no longer knows our login (it restarted) — go to the login screen
          // instead of staying in a room we can't play in
          if (String(e?.message || "").startsWith("401")) { localStorage.removeItem("acro.auth"); authChanged(); navigate("/"); }
        });
        // Also join the live updates again, in case this connection lost the room group
        connectionRef.current?.invoke("JoinRoom", id, String(me)).catch(() => { });
      }
      if (data?.letters && data?.phase !== "Starting") setLetters(typeof data.letters === "string" ? data.letters.split("") : data.letters);
      // the station number too: after a refresh mid-journey the header said "Station 1" until the next station (2026-10-24)
      if (data?.currentRoundNumber > 0) setCurrentRound(data.currentRoundNumber);

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
      // ...and while voting, who is done voting
      if (data?.phase === "Voting" && Array.isArray(data?.votedPlayerIds))
        setVotedIds(data.votedPlayerIds.map(x => String(x).toLowerCase()));

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
  // value: a suggestion that was clicked (otherwise what was typed)
  async function submitTopic(value) {
    const topic = (typeof value === "string" ? value : topicDraft).trim();
    if ((topic.match(/[\p{L}\p{N}]/gu) || []).length < 2) {
      setTopicError("The direction needs at least 2 letters.");
      return;
    }
    try {
      const { setTopic } = await import("./services/api");
      await setTopic(id, topic);
      // Not started yet: it can be changed until GO! or the clock runs out (Sandy)
      setTopicSetValue(topic);
      setTopicDraft("");
      setTopicError("");
      return true;
    } catch (e) {
      // Show the server's reason (the error text arrives as "400: <reason>")
      setTopicError((e.message || "").replace(/^\d{3}:\s*/, "") || "The direction wasn't accepted.");
    }
  }

  // GO! — start the next station now with the topic that was set
  // The winner's Highball!: the whistle and the flash, then the station (Damon, 2026-10-24: "the GO! should be Highball!")
  // (2026-10-24: a quick direction only fills the box now; Highball! sends it and departs)
  function highballTopic() {
    const t = topicDraft.trim();
    if (topicGoing) return;
    if ((t.match(/[\p{L}\p{N}]/gu) || []).length < 2) { setTopicError("The direction needs at least 2 letters."); return; }
    playWhistle(soundGain());
    setTopicGoing(true);
    setHighballFlash(true);
    setTimeout(async () => {
      setHighballFlash(false);
      if (await submitTopic(t)) goTopic();
      else setTopicGoing(false);
    }, 600);
  }
  // A direction typed but not sent when the clock is about to run out: sent, so it isn't lost (the station then
  // starts with it when the clock runs out)
  useEffect(() => {
    if (!topicRequested || topicTimer !== 2 || topicGoing || topicSetValue) return;
    const t = topicDraft.trim();
    if ((t.match(/[\p{L}\p{N}]/gu) || []).length >= 2) submitTopic(t);
  }, [topicTimer]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function goTopic() {
    setTopicGoing(true);
    try { await topicGo(id); }
    catch (e) { setTopicGoing(false); setTopicError((e.message || "").replace(/^\d{3}:\s*/, "") || "Couldn't start the station."); }
  }

  // The first topic: checked, then "Departing in 5…" (Change stops it), then the journey starts
  // Highball!: the whistle and the flash, then the countdown from 5 (the button shows its flash for 0.6 s first)
  const [highballFlash, setHighballFlash] = useState(false);
  function startDeparture() {
    const t = firstTopicDraft.trim();
    if ((t.match(/[\p{L}\p{N}]/gu) || []).length < 2) { setFirstTopicError("The direction needs at least 2 letters."); return; }
    if (highballFlash) return;
    setFirstTopicError("");
    setDepartTopic(t);
    playWhistle(soundGain());
    setHighballFlash(true);
    setTimeout(() => { setHighballFlash(false); setDepartIn(5); }, 600);
  }
  useEffect(() => {
    if (departIn === null) return;
    if (departIn <= 0) {
      (async () => {
        // the horn, then the station (Damon, 2026-10-24); the others hear it when the station begins
        honkedRef.current = true;
        playHonk(soundGain());
        await new Promise(r => setTimeout(r, 1300));
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
          You were ejected from this train by a passenger vote
        </h2>
        <p style={{ margin: "0 0 24px", color: C.textSecond, fontSize: 16 }}>
          You can board it again when this journey ends — or board another train now.
        </p>
        <Btn onClick={() => navigate("/")}>← Grand Sky Station</Btn>
      </Panel>
    </div>
  );
  if (full) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, color: C.textPrimary }}>
      <Panel style={{ padding: 32, textAlign: "center", maxWidth: 480, borderColor: C.teal }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 30, ...smallTitle }}>This Sky Train is full</h2>
        <p style={{ margin: "0 0 24px", color: C.textSecond, fontSize: 16 }}>16 passengers already aboard. Board another one, or start your own!</p>
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
  for (const p of players) nameByIdRef.current[String(p.id).toLowerCase()] = p.nickname;
  const nameOf = pid => (pid ? nameByIdRef.current[String(pid).toLowerCase()] : undefined);
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
    topicRequested || phase === "Starting" ? "Choosing the direction"
    : phase === "Results" || phase === "Ended" ? "Results"
    : phase === "Submitting" ? "Accepting Expressions"   // (Damon, 2026-10-25; was "Write your acro")
    : phase === "Voting" ? "Voting"
    : phase === "Tallying" ? "Counting votes"
    : phase === "GameOver" ? "Final Stop"
    : phase === "Paused" ? "Paused"
    : "Waiting to start";
  // Topic is shown while players are writing their acros
  const showTopic = !!currentTopic && phase === "Submitting" && !topicRequested;
  // the ✓ in Passengers: who submitted (writing) or who is done voting (voting); none in other phases
  const tickIds = phase === "Submitting" ? submittedIds : phase === "Voting" ? votedIds : null;
  // the voting in the chat window (VOTE_IN_CHAT), and the chat faded under it until I'm done voting (option 3,
  // Damon 2026-10-27); my own lines stay bright, so I can see they were sent
  const votingInChat = VOTE_IN_CHAT && phase === "Voting";
  const chatFaded = votingInChat && !iVoted && !votedIds.includes(String(auth?.userId || "").toLowerCase());
  const fade = m => ({ opacity: chatFaded && m.nickname !== auth?.username ? 0.4 : 1, transition: "opacity 0.4s" });
  // ...and the results there too (Damon, 2026-10-27), while the stage shows the cheer and who chooses the next direction.
  // The stage is smaller meanwhile, so 16 passengers fit even on Fran's screen and a phone
  const resultsInChat = VOTE_IN_CHAT && phase === "Results" && !resultsClosed;
  const compactStage = votingInChat || (resultsInChat && !topicRequested && !watchChooser?.first);
  // Stage sizes — compact versions on short windows. Used both by the elements and by the
  // stage height formula below, so the formula always matches what is drawn.
  // Compact (Sandy, 2026-10-15: use the space above the letters and in the acro box for more chat lines).
  // The letters keep their size.
  const stagePad = isShort ? "clamp(2px, 0.5vh, 10px)" : "clamp(4px, 1vh, 16px)";      // space above and below the letters
  // between the letters and the acro box (Damon, 2026-10-24: "this is too little")
  const letterGap = isShort ? "clamp(8px, 2vh, 18px)" : "clamp(12px, 3vh, 28px)";
  const ACRO_BOX = 76;                                                                   // the acro box + its line + margin (no panel)
  // the countdown, between the acro box and Submit (Damon, 2026-10-26): its own fixed slot, so neither the box nor
  // the button moves as the numbers change; hidden (not removed) when the time is up
  const timerSlot = (
    <div aria-label="Time left" style={{ ...acroClock, flex: isNarrow ? "0 0 52px" : "0 0 72px", fontSize: "calc(30px * var(--tf-scale, 1))", fontFamily: `var(--tf-family, ${NUM_FONT})`, color: timer !== null && timer <= 10 ? C.brand : C.teal, fontPalette: timer !== null && timer <= 10 ? "var(--fp-letters)" : "var(--fp-logo)" }}>
      <span style={{ visibility: timer !== null && timer > 0 ? "visible" : "hidden" }}>{two(timer)}</span>
    </div>
  );
  const letterSize = votingInChat ? "clamp(2.2rem, 7vh, 3.6rem)" : isShort ? "clamp(2.5rem, 9vh, 6rem)" : "clamp(3rem, 11vh, 6rem)"; // the big letters (smaller while voting in the chat)
  // the direction above the letters (wide screens): its line, plus a line for a special direction's note
  const topicSize = isShort ? 34 : 44;
  const topicRow = `${Math.round(topicSize * 1.15) + 24}px`;
  const aboveLetters = isNarrow ? "0px" : topicRow;
  const stageHeight = !compactStage ? `calc(${stagePad} + ${letterGap} + ${aboveLetters} + ${letterSize} + ${ACRO_BOX}px)`
    : votingInChat ? `calc(${stagePad} + ${letterGap} + ${letterSize})`   // just the letters
    : "clamp(80px, 11vh, 120px)";                                          // the cheer and who chooses next
  // Results showing: the stage may grow to fit all passengers (option C, Damon 2026-10-16)
  // The stage grows for the results, and for the Final Stop celebration (the winner panel is taller than the letters)
  // Topic: label and topic on one line (compact header)
  // 2026-10-24: beside the letters (right), not in the header's corner — "you don't have to turn your head"
  const topicBlock = (align) => (
    <div style={{ textAlign: align, maxWidth: 520, margin: align === "center" ? "0 auto" : 0 }}>
      <TopicText size={isShort ? 28 : 34}>{currentTopic}</TopicText>
      {/* a special topic, in one line (2026-10-24) */}
      {specialTopicNote(currentTopic) ? <div style={{ fontSize: 14, color: C.textPrimary, marginTop: 2, maxWidth: 420 }}>🎭 {specialTopicNote(currentTopic)}</div>
        : roomWord && <div style={{ fontSize: 14, color: C.textMuted, marginTop: 2 }}>📖 Word of the week: <b style={{ color: C.textPrimary }}>{roomWord.word}</b> (+1)</div>}
      {/* (the Word of the Week line was here; Damon crossed it out, 2026-10-24: it's on the Station Board and in How to play) */}
    </div>
  );
  // Who chooses the first topic: whoever started the Sky Train, or the first passenger on board if
  // they're gone. The first topic starts the journey (there's no Start button any more).
  const onBoard = players.filter(p => p.isConnected !== false);
  const conductor = onBoard.find(p => sameId(p.id, data.ownerId)) || onBoard[0] || null;
  const iAmConductor = !!conductor && sameId(conductor.id, auth?.userId);
  const showFirstTopic = !topicRequested && ((phase === "Waiting" && !(data.currentRoundNumber > 0)) || phase === "Paused"
    || (phase === "GameOver" && nextGameIn !== null && nextGameIn <= -10));
  // The stage grows for the results, the Final Stop and both topic desks (2026-10-24: they were cut off)
  const resultsGrow = (phase === "Results" && !resultsClosed && !topicRequested && !VOTE_IN_CHAT) || (phase === "GameOver" && !!gameWinner) || topicRequested || !!watchChooser?.first || (showFirstTopic && !!conductor);

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

      {/* Voting overlay (only when the voting isn't in the chat window, VOTE_IN_CHAT) */}
      {phase === "Voting" && !VOTE_IN_CHAT && (
        <VotingScreen roomId={id} entries={entries.length > 0 ? entries : (data.entries || [])} myPlayerId={auth?.userId} onVoted={() => { doneVotedRef.current = true; }} onVoteCast={setMyVote} timer={timer} maxTimer={maxTimer} topic={currentTopic}
          passengers={players.filter(p => p.isConnected !== false).map(p => ({ id: p.id, name: p.nickname, done: votedIds.includes(String(p.id).toLowerCase()) }))} />)}

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
            <span style={{ fontSize: isShort ? 30 : 34, ...honkTitle, color: "var(--c-logo)", fontPalette: "var(--fp-mark)" }}>Acro Express</span>
            <span style={{ fontSize: isShort ? 24 : 28, ...smallTitle, color: C.brand, fontPalette: "var(--fp-letters)" }}>› {data.name || roomNameRef.current || "Sky Train"}</span>
          </h1>
          {/* div instead of p — a <div> (the timer) inside a <p> is invalid HTML */}
          {/* "Station 2 · Results": in Nunito since 2026-10-25 (Damon: in Honk the letters were too close together; it
              was Honk from 2026-10-18). "First to 30 wins" was removed here (not necessary; How to play still says it) */}
          <div style={{ margin: "4px 0 0", fontSize: isShort ? 22 : 25, fontFamily: "'Nunito', sans-serif", fontWeight: 800, color: C.teal, lineHeight: 1.2, whiteSpace: "nowrap" }}>   {/* one line, never "Write your / acro" */}
            {/* Rounds are stations: a game travels Station 0 → 1 → 2 … → Final Stop (round N = Station N) */}
            Station {headerStation}
            {/* "Station 7 of 10" in a journey of 10 stations (Zyngacita's format, 2026-10-27) */}
            {data?.stations > 0 && headerStation > 0 && ` of ${data.stations}`}
            {/* What's happening now, in words (first step towards the "Departure Board" announcer) */}
            {": "}{phaseTitle}   {/* "Station 3: Accepting Expressions" (Damon, 2026-10-25) */}
            {/* The timer moved to the centre, above the letters */}
          </div>
        </div>
        {/* Gap between the buttons and the topic: 6px on short windows, 16px otherwise */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: isShort ? 4 : 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", position: "relative" }}>
            <CustomizeHint />
            {/* "Colors" and "Music" menus — change them any time, even mid-game */}
            <span data-hint="Online: who is at the station and on the trains right now" style={{ display: "contents" }}><OnlineButton /></span>
            <span data-hint="How to play: the rules, the points and the special directions" style={{ display: "contents" }}><HowToPlay winScore={data.winScore || 30} stations={data.stations || 0} /></span>
            <span data-hint="Colors: the look of the train. Only you see it" style={{ display: "contents" }}><ThemePicker /></span>
            <span data-hint="Letters: the font of the Express Server letters and the timer (or click the letters)" style={{ display: "contents" }}><LetterFontPicker /></span>
            <span data-hint="Song: your music while you write (it switches at once)" style={{ display: "contents" }}><SongPicker /></span>
            <span data-hint="Volume: music and sounds, mute, button sounds" style={{ display: "contents" }}><SoundControl /></span>
            {/* After a game ends the room is back in Waiting, so a new game can be started */}
            {/* Hidden during the 30-second break after a game — the next game starts by itself */}
            {/* Not while the first topic is being chosen: round 1 already exists then (currentRoundNumber > 0)
                — clicking it gave "round already in progress" */}
            {/* No Start / New Game button: the first topic starts the journey (Damon, 2026-10-16) */}
            <span data-hint="Leave this train and go back to the Grand Sky Station" style={{ display: "contents" }}><BtnSecondary onClick={handleLeaveRoom} style={{ border: `1px solid ${C.focusLine}` }}>← Grand Sky Station</BtnSecondary></span>
          </div>
          {/* Topic — top right, under Back to Lobby (on phones it sits under the letters) */}
        </div>
      </div>

      {/* Stage — always the height the writing phase needs (timer + letters + acro box), in every phase, so the boxes below never move. Passengers and the
          chats get all the remaining space. On short screens the stage shrinks and scrolls inside.
          scrollbarWidth "none" hides the scrollbar (rounding made a 1px overflow show one) — the wheel still scrolls.
          flex "0 0": the stage never shrinks, so the acro box is never pushed out of sight (Deb lost it). */}
      {/* Scroll mode: the stage is as tall as its contents (the topic under the letters included),
          because the page scrolls anyway — nothing inside it can be cut off or covered. */}
      <div style={{ flex: view.scroll ? "0 0 auto" : (resultsGrow ? "0 1 auto" : `0 0 ${stageHeight}`), minHeight: resultsGrow && !view.scroll ? stageHeight : 0, overflowY: view.scroll ? "visible" : "auto", scrollbarWidth: ((phase === "Results" && !resultsClosed) || topicRequested) && !compactStage ? "thin" : "none", display: "flow-root" }}>
      {/* (scrollbar: hidden normally, slim while results are shown, in case a long list doesn't fit) */}

      {/* Round results and the winner's topic prompt — inside the stage, where the letters are
          (like Acrophobia). Before, they floated over the page and covered "Round N" in the header.
          Never both at once: results first; for the round winner the topic prompt replaces them. */}
      {((phase === "Results" && !resultsClosed) || topicRequested || watchChooser?.first) && (
        <div style={{ marginBottom: compactStage ? 0 : 4 }}>
          {phase === "Results" && !resultsClosed && !topicRequested && !watchChooser?.first && VOTE_IN_CHAT && (
            // the results are in the chat window: here only the cheer and who chooses the next direction, side by side
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px 48px", flexWrap: "wrap" }}>
              {(() => {
                const names = stationResults(scores, winningAcro, entries, players).winners.map(w => w.name);
                const wow = names.some(n => (resultDetails?.wordBonus || []).some(b => String(b).toLowerCase() === n.toLowerCase()));
                return <StationCheer key={currentRound} round={currentRound} streak={winStreak} names={names} wow={wow} />;
              })()}
              {watchChooser && !watchChooser.first && (
                <div style={{ textAlign: "center", fontSize: 15, color: C.textMuted }}>
                  <b style={{ color: C.textPrimary }}>{nameOf(watchChooser.id) || "The winner"}</b> is choosing the next direction
                  <div style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 30, lineHeight: 1.1, color: topicTimer <= 5 ? C.brand : C.teal, fontVariantNumeric: "tabular-nums", visibility: topicTimer > 0 ? "visible" : "hidden" }}>{two(topicTimer)}</div>
                </div>
              )}
            </div>
          )}
          {phase === "Results" && !resultsClosed && !topicRequested && !watchChooser?.first && !VOTE_IN_CHAT && (
            // lined up with the panels below: from the Sky Train Chat's left edge to the right edge (Damon's markup, 2026-10-24),
            // using the same columns as those panels
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: isNarrow ? "1fr" : (pm.active ? "minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1.4fr)" : "1fr 3fr") }}>
            {/* the station winner, left of the results and centred on them (Damon, 2026-10-24) */}
            <div style={{ gridColumn: "1", alignSelf: "center", minWidth: 0 }}>
              {(() => {
                const names = stationResults(scores, winningAcro, entries, players).winners.map(w => w.name);
                // a winner who used the Word of the Week: "WoWs the station!"
                const wow = names.some(n => (resultDetails?.wordBonus || []).some(b => String(b).toLowerCase() === n.toLowerCase()));
                return <StationCheer key={currentRound} round={currentRound} streak={winStreak} names={names} wow={wow} />;
              })()}
              {/* who chooses the next direction, with the clock; the results stay up meanwhile (Fran, 2026-10-24: "the
                  vote result screen disappears too fast") */}
              {watchChooser && !watchChooser.first && (
                <div style={{ textAlign: "center", marginTop: 10, fontSize: 15, color: C.textMuted }}>
                  <b style={{ color: C.textPrimary }}>{nameOf(watchChooser.id) || "The winner"}</b> is choosing the next direction
                  <div style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 30, lineHeight: 1.1, color: topicTimer <= 5 ? C.brand : C.teal, fontVariantNumeric: "tabular-nums", visibility: topicTimer > 0 ? "visible" : "hidden" }}>{two(topicTimer)}</div>
                </div>
              )}
            </div>
            <div style={{ gridColumn: isNarrow ? "1" : "2 / -1", minWidth: 0 }}>
            <ResultsScreen scores={scores} winningAcro={winningAcro} entries={entries} players={players}
              round={currentRound} topic={currentTopic} onClose={() => setResultsClosed(true)} myVote={myVote}
              votes={roundVotes} myName={auth?.username} details={resultDetails} letters={letters} />
            </div>
            </div>
          )}
          {watchChooser?.first && !topicRequested && (
            <WatchDesk narrow={isNarrow} name={nameOf(watchChooser.id)} station={watchChooser.first ? 1 : currentRound + 1}
              eyebrow={`Next up · Station ${watchChooser.first ? 1 : currentRound + 1} · ${watchChooser.first ? 3 : 3 + (currentRound % 5)} letters`}
              timer={topicTimer} short={isShort} />
          )}
          {topicRequested && (
        <div>
        {/* The station winner chooses the next topic, on the topic desk (GPT's structure, Damon 2026-10-24): quick topics
            on the left (a click fills the box), the clock, the box and Highball! in the middle, the topic as it will look on the
            right */}
        <TopicDesk narrow={isNarrow} station={nextStation}
          left={!topicGoing && <QuickTopics ideas={topicIdeas} selected={topicDraft} onPick={t => { setTopicDraft(t); setTopicError(""); }} />}
          center={<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            {/* The topic is chosen BEFORE the station it belongs to — the station starts with the countdown */}
            <div style={deskEyebrow}>Next up · Station {nextStation} · {topicForFirstRound ? 3 : 3 + (currentRound % 5)} letters</div>
            <div style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 56, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: topicTimer !== null && topicTimer <= 5 ? C.brand : C.teal, visibility: topicTimer > 0 ? "visible" : "hidden" }}>{two(topicTimer)}</div>
            {/* the box (a quick direction fills it) and Highball!, dark until there is a direction (as on the creator's desk).
                No autoFocus: the cursor stays where it is (Sandy typed "ty" in chat, Enter set it as the topic) */}
            <DeskInput id="topicInput" pulse value={topicDraft} placeholder="Write a direction, or pick one"
              onChange={v => { setTopicDraft(v); setTopicError(""); }} onEnter={highballTopic} />
            <DeskButton onClick={highballTopic} disabled={topicGoing && !highballFlash} flash={highballFlash}
              ready={(topicDraft.match(/[\p{L}\p{N}]/gu) || []).length >= 2}>Highball!</DeskButton>
            <div style={{ fontSize: 13, color: C.textMuted, marginTop: -4 }}>Give the signal to depart. No direction in time? The Express Server picks one.</div>
            {topicError && <p style={{ margin: 0, color: C.brand, fontSize: 14, fontWeight: 600 }}>{topicError}</p>}
          </div>}
          right={<TopicPreview topic={topicDraft.trim() || topicSetValue} size={isShort ? 28 : 32} />} />
        </div>
          )}
        </div>
      )}


      {/* Game over — shown inline where letters normally appear */}
      {phase === "GameOver" && gameWinner && <Confetti key={gameWinner.at} />}
      {phase === "GameOver" && gameWinner && (
        <FinalStopPanel names={gameWinner.names || [gameWinner.name]} message={gameWinner.message}>
          {/* Countdown during the break; "Departing…" while the server starts it; the old hint if it didn't */}
          {nextGameIn > 0 ? `The next journey starts in ${nextGameIn}s`
            : nextGameIn !== null && nextGameIn > -10 ? "Departing…"
            : "Choose a direction below to start the next journey."}
        </FinalStopPanel>
      )}

      {/* The first topic starts the journey — no Start button (Damon, 2026-10-16) */}
      {showFirstTopic && (!iAmConductor ? (conductor ? (
        <div style={{ marginBottom: 8 }}>
          <WatchDesk narrow={isNarrow} name={conductor.nickname} short={isShort} first station={phase === "Paused" ? currentRound + 1 : 1}
            eyebrow={phase === "Paused" ? "Ready to continue?" : "Everyone on board?"} />
        </div>
      ) : (
        <Panel style={{ padding: 16, marginBottom: 8, borderColor: C.teal, textAlign: "center" }}>
          <p style={{ color: C.textMuted, margin: 0, fontSize: 16 }}>Waiting for passengers…</p>
        </Panel>
      )) : (
        // the topic desk (GPT's structure, Damon 2026-10-24): a quick topic or your own, then START: a countdown from
        // 5, the horn, the first station. Choosing a topic doesn't start anything by itself.
        <div style={{ marginBottom: 8 }}>
        <TopicDesk narrow={isNarrow} station={phase === "Paused" ? currentRound + 1 : 1} departing={departIn !== null}
          left={departIn === null && <QuickTopics ideas={firstIdeas} selected={firstTopicDraft} onPick={t => { setFirstTopicDraft(t); setFirstTopicError(""); }} />}
          center={departIn !== null ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={deskEyebrow}>The journey begins in</div>
              <div key={departIn} className="acro-stretch" style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 64, lineHeight: 1, color: C.brand, fontVariantNumeric: "tabular-nums" }}>{two(departIn)}</div>
              <BtnSecondary onClick={() => { setDepartIn(null); setFirstTopicDraft(departTopic); }}>Change the direction</BtnSecondary>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <div>
                <div style={deskEyebrow}>{phase === "Paused" ? "Ready to continue?" : "Everyone on board?"}</div>
                <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 26, color: C.textPrimary, marginTop: 2 }}>{phase === "Paused" ? "Choose a direction" : "Choose the first direction"}</div>
              </div>
              <DeskInput id="firstTopicInput" value={firstTopicDraft} placeholder="Write a direction, or pick one"
                onChange={v => { setFirstTopicDraft(v); setFirstTopicError(""); }} onEnter={startDeparture} />
              {/* "Highball!": the railway signal to go (Damon, 2026-10-24: "It doesn't say start, it says Highball!") */}
              <DeskButton onClick={startDeparture} ready={(firstTopicDraft.match(/[\p{L}\p{N}]/gu) || []).length >= 2} flash={highballFlash}>Highball!</DeskButton>
              <div style={{ fontSize: 13, color: C.textMuted, marginTop: -4 }}>Give the signal to depart.</div>
              {firstTopicError && <p style={{ margin: 0, color: C.brand, fontSize: 14, fontWeight: 600 }}>{firstTopicError}</p>}
            </div>
          )}
          right={<TopicPreview topic={departIn !== null ? departTopic : firstTopicDraft.trim()} size={isShort ? 28 : 32} />} />
        </div>
      ))}

      {/* Letters */}
      {letters.length > 0 && !topicRequested && phase !== "Results" && phase !== "GameOver" && (
        <div style={{ padding: `${stagePad} 0 ${letterGap}` }}>
        {/* above the letters (wide screens): the direction, across the stage; its font switches with a click. The row
            keeps its height when there is no direction (voting), so the letters never move */}
        {!isNarrow && !votingInChat && (
          <div style={{ minHeight: topicRow, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", paddingBottom: 6, boxSizing: "border-box" }}>
            {showTopic && <>
              <TopicText size={currentTopic.length > 44 ? Math.round(topicSize * 0.8) : currentTopic.length > 32 ? Math.round(topicSize * 0.9) : topicSize}>{currentTopic}</TopicText>
              {specialTopicNote(currentTopic) ? <div style={{ fontSize: 14, color: C.textPrimary, marginTop: 2 }}>🎭 {specialTopicNote(currentTopic)}</div>
                : roomWord && <div title={`${roomWord.word}: ${roomWord.meaning}. Use it in an acro that gets a vote: +1`} style={{ fontSize: 14, color: C.textMuted, marginTop: 2 }}>📖 Word of the week: <b style={{ color: C.textPrimary }}>{roomWord.word}</b> (+1)</div>}
            </>}
          </div>
        )}
        <div style={{ display: isNarrow ? "block" : "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", columnGap: 32 }}>
        {/* left of the letters: how many acros are in (2026-10-24) */}
        {!isNarrow && <div style={{ justifySelf: "center", alignSelf: "end", height: `calc(${letterSize} * var(--lf-scale, 1) * var(--lf-lh, 1))`, display: "flex", alignItems: "center", minWidth: 0 }}>{phase === "Submitting" && (
          <AnswersAccepted count={submittedIds.length} total={players.filter(p => p.isConnected !== false).length} twoLines={view.w < 1250} />
        )}</div>}
        <div style={{ textAlign: "center" }}>
          <div ref={lettersRef} title="Click to change the letters' font"
            onClick={() => { cycleLetterFont(); document.getElementById("acroInput")?.focus(); }}
            style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", cursor: "pointer", userSelect: "none" }}>
            {letters.map((l, i) => (
              <span key={i} style={{
                fontFamily: "var(--lf-family, 'Bowlby One SC', serif)",   // the player's choice: Bowlby (default) or Honk
                // smaller on short laptop screens (even smaller on short windows). Honk's capitals are smaller than
                // Bowlby's, so with Honk the size is ×1.4 (--lf-scale) and the line height ÷1.4 (--lf-lh): the
                // letters look as big as Bowlby's while taking the same height, so the acro box doesn't move
                fontSize: `calc(${letterSize} * var(--lf-scale, 1))`,
                lineHeight: "var(--lf-lh, 1)",
                color: C.brand,
                fontPalette: "var(--fp-big)", fontVariationSettings: "'SHLN' 0, 'MORF' 15",   // only used by Honk; outline in the background colour; no shadow (Damon: confusing on lighter backgrounds)
                textShadow: "var(--lf-shadow, var(--c-letterShadow))",   // per palette: softer on the light ones; none with Honk (it has its own)
                fontWeight: "var(--lf-weight, 400)"                      // 800 for Nunito ExtraBold
              }}>
                {l}
              </span>
            ))}
          </div>
          {showTopic && isNarrow && <div style={{ marginTop: 16 }}>{topicBlock("center")}</div>}
        </div>
        {/* right of the letters (wide screens): kept free, opposite the lights; the clock moved down beside Submit
            (Damon, 2026-10-26: "the space where the timer was should be used to write something else") */}
        {!isNarrow && <div />}
        </div>
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
            <div style={acroBar(C.teal)}>
              <div style={{ ...acroField, padding: "8px 14px", color: C.teal, fontWeight: 600, fontSize: 19, overflowWrap: "anywhere", alignSelf: "center" }}>
                {submittedAcro}
              </div>
              {timerSlot}
              <Btn color={C.navy2} hoverColor={C.navy3} style={{ ...acroButton, color: C.teal, borderLeft: `1px solid ${C.border}`, padding: isNarrow ? "0 12px" : "0 20px", minWidth: isNarrow ? 84 : 120 }} onClick={() => {
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
              <div style={{ ...acroBar(C.focusLine), flex: 1, minWidth: 0 }}>
              <input
                id="acroInput"
                // Scroll mode: bring the acro box into the middle of the screen when it is clicked
                onFocus={e => { if (view.scroll) e.target.scrollIntoView({ block: "center", behavior: "smooth" }); }}
                // On the page itself now (no panel), so it takes the panel colour to read as a field
                style={{ ...acroField, padding: "8px 14px", fontSize: 19 }}
                className="acro-box" placeholder="Please write your expression and press Enter"
                value={myDraft}
                onChange={e => {
                  setMyDraft(e.target.value);
                  myDraftRef.current = e.target.value;
                  setAcroError("");
                  saveDraft(e.target.value);
                }}
                onKeyDown={e => { if (e.key === "Enter") handleSubmitAcro(); }}
              />
              {timerSlot}
              <Btn onClick={handleSubmitAcro} style={{ ...acroButton, padding: isNarrow ? "0 12px" : "0 20px", minWidth: isNarrow ? 84 : 120 }}>{isEditing ? "Update" : "Submit"}</Btn>
              </div>
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
            {/* ...and while voting, how many are done voting (Zyngacita, 2026-10-26) */}
            {tickIds && (
              <span style={{ marginLeft: 8, color: C.teal, textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
                · {players.filter(p => p.isConnected !== false && tickIds.includes(String(p.id).toLowerCase())).length} of {players.filter(p => p.isConnected !== false).length} {phase === "Voting" ? "done voting" : "submitted"}
              </span>
            )}
          </h2>
          {players.length === 0 ? (
            <p style={{ color: C.textMuted, fontSize: 15, margin: 0 }}>No passengers yet</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {[...players].sort((a, b) => shownScore(b) - shownScore(a)).map(p => (
                <li key={p.id}
                  title={`Message ${p.nickname} or see their Sky Passport`}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, padding: "4px 8px", background: C.bgApp, borderRadius: 6, cursor: p.id !== auth?.userId ? "pointer" : "default" }}
                  // One click opens their Sky Passport card (Message is its main button), like everywhere else.
                  // Ejecting is never mixed in here (Damon, 2026-10-18): only "/eject name" in Sky Train Chat
                  onClick={e => openProfile(p.nickname, e.currentTarget)}>
                  {/* Left side: a fixed tick column, then the name — the ✓ sits outside the name in its own
                      16px column, so names never move when someone submits (Damon's request) */}
                  <span style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                  <span title={tickIds?.includes(String(p.id).toLowerCase()) ? (phase === "Voting" ? "Done voting" : "Submitted") : undefined}
                    style={{ width: 16, flexShrink: 0, color: C.teal, fontWeight: 700 }}>
                    {tickIds?.includes(String(p.id).toLowerCase()) ? "✓" : ""}
                  </span>
                  {/* Submitted this round (while writing) / done voting (while voting): name in teal */}
                  <span style={{ color: p.isConnected === false ? C.textMuted : (tickIds?.includes(String(p.id).toLowerCase()) ? C.teal : C.textSecond), fontWeight: tickIds?.includes(String(p.id).toLowerCase()) ? 700 : 400, opacity: p.isConnected === false ? 0.6 : 1 }}>
                    <span>{p.nickname}</span>
                    {/* Window closed / connection lost — removed after about 10 seconds */}
                    {p.isConnected === false && <span style={{ marginLeft: 4, fontStyle: "italic" }}>(away)</span>}
                    {(pm.unread[p.nickname] || 0) > 0 && (
                      <span style={{ marginLeft: 6, background: C.brand, color: C.onBrand, fontSize: 10, borderRadius: 999, padding: "1px 6px" }}>
                        {pm.unread[p.nickname]}
                      </span>
                    )}
                    {/* Votes to kick this passenger, for everyone to see (the passenger too) */}
                    {kickVotes[String(p.id).toLowerCase()] && (
                      <span title="Votes to eject" style={{ marginLeft: 6, color: C.brand, fontSize: 12, fontWeight: 700 }}>
                        eject {kickVotes[String(p.id).toLowerCase()].votes}/{kickVotes[String(p.id).toLowerCase()].needed}
                      </span>
                    )}
                  </span>
                  </span>
                  <span style={{ color: C.teal, fontWeight: 700, fontFamily: NUM_FONT, fontVariantNumeric: "tabular-nums" }}>{shownScore(p)}</span>
                </li>
              ))}
            </ul>
          )}
          {/* the Grand Sky Station and the other trains, a click away (2026-10-23) */}
          <ElsewhereList trainName={data.name || roomNameRef.current} />
        </Panel>

        {/* Room chat */}
        {/* Stacked (narrow): a fixed 360px so the messages and the input are always visible */}
        <Panel style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: isNarrow ? 360 : 0, height: isNarrow && !votingInChat && !resultsInChat ? 360 : undefined }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
            <h2 style={{ margin: 0, fontSize: 14, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", display: "flex", alignItems: "baseline", gap: 10 }}>
              Sky Train Chat   {/* was "Train Chat" (Damon, 2026-10-18) */}
              {/* testers of the new layout: the way back (not on the local dev copy, where it's always on) */}
              {VOTE_IN_CHAT && !import.meta.env.DEV && (
                <button onClick={leaveChatLayout} title="You're trying the new layout: voting and results in the chat window"
                  style={{ marginLeft: "auto", background: "none", border: "none", padding: 0, color: C.textMuted, fontSize: 12, textTransform: "none", letterSpacing: 0, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
                  Back to the classic layout
                </button>
              )}
            </h2>
          </div>
          {votingInChat && (
            <VotingScreen inline names={isNarrow} roomId={id} entries={entries.length > 0 ? entries : (data.entries || [])} myPlayerId={auth?.userId}
              onVoted={() => { doneVotedRef.current = true; setIVoted(true); }} onVoteCast={setMyVote} timer={timer} maxTimer={maxTimer} topic={currentTopic}
              passengers={players.filter(p => p.isConnected !== false).map(p => ({ id: p.id, name: p.nickname, done: votedIds.includes(String(p.id).toLowerCase()) }))} />
          )}
          {resultsInChat && (
            <ResultsScreen inline narrow={isNarrow} scores={scores} winningAcro={winningAcro} entries={entries} players={players}
              round={currentRound} topic={currentTopic} onClose={() => setResultsClosed(true)} myVote={myVote}
              votes={roundVotes} myName={auth?.username} details={resultDetails} letters={letters} />
          )}
          <div ref={chatListRef} style={{ flex: 1, minHeight: votingInChat || resultsInChat ? 40 : 0, overflowY: "auto", padding: "8px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
            {roomMessages.length === 0 ? (
              <p style={{ color: C.textMuted, fontSize: 15, margin: 0 }}>No messages yet...</p>
            ) : (
              roomMessages.map((m, i) => (
                m.system ? (
                  <div key={i} style={{ fontSize: isShort ? 13 : 14, lineHeight: 1.35, color: C.textMuted, fontStyle: "italic", textAlign: "center", padding: "1px 0", ...fade(m) }}>{m.message}</div>
                ) : (
                  meAction(m.message) != null ? (
                    // "/me waves" → "* Sandy waves"
                    <div key={i} style={{ fontSize: isShort ? 14 : 15, lineHeight: 1.35, fontStyle: "italic", color: C.textSecond, ...fade(m) }}>
                      * <NameLink gold name={m.nickname} style={{ color: C.teal, fontWeight: 600 }} /> {meAction(m.message)}
                    </div>
                  ) : (
                  <div key={i} style={{ fontSize: isShort ? 14 : 15, lineHeight: 1.35, ...fade(m) }}>
                    <NameLink gold name={m.nickname} style={{ color: C.teal, fontWeight: 600 }} /><span style={{ color: C.teal, fontWeight: 600 }}>: </span>
                    <span style={{ color: C.textSecond }}>{m.message}</span>
                  </div>
                  )
                )
              ))
            )}
            <div ref={chatBottomRef} />
          </div>
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}` }}>
          {/* one bar, like the acro bar (Damon, 2026-10-26) */}
          <div style={{ ...acroBar(C.fieldLine), borderWidth: 1, background: C.bgApp }}>
            <input
              id="chatInput"
              style={{ ...acroField, textAlign: "left", padding: "8px 12px", fontSize: 15 }}
              placeholder="Say something..."
              value={roomChatInput}
              onChange={e => setRoomChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") sendRoomMessage(); }}
            />
            <Btn onClick={sendRoomMessage} style={{ borderRadius: 0 }}>Send</Btn>
          </div>
          </div>
        </Panel>

        {/* Private messages — one tab per person (shared with the lobby) */}
        <PrivateChatPanel style={{ height: isNarrow ? 360 : undefined }} />
      </div>
      <PmToast />
        <RestartBanner />
        <PassengerCard inTrain />
        <HoverBar />   {/* the explanation of whatever the mouse is over, at the bottom while hovering */}   {/* the card a passenger click opens, without a link that leaves the train */}
    </div>
  );
}

// The Grand Sky Station connection, shared by all of the station's pages (Damon 2026-10-19): before, opening the
// Sky Leaderboard or a Sky Passport closed it and you "left the station". Now it stays open on every page except a
// train (/room/…). The station page reads players, chat and arrival lines from here.
const StationContext = createContext({ players: [], messages: [], notices: [], sendMessage: () => { }, rooms: null });
const authChanged = () => window.dispatchEvent(new Event("acro-auth"));   // login / logout → the connection follows

export default function App() {
  const location = useLocation();
  const [authName, setAuthName] = useState(() => getAuth()?.username || null);   // who is logged in (null = nobody)
  useEffect(() => {
    const on = () => setAuthName(getAuth()?.username || null);
    window.addEventListener("acro-auth", on);
    return () => window.removeEventListener("acro-auth", on);
  }, []);
  const onTrain = location.pathname.startsWith("/room/");
  const station = useLobbyHub(onTrain ? null : authName);   // no name = not connected (on a train, or logged out)
  return (
    <StationContext.Provider value={station}>
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/log" element={<StationLog />} />
      <Route path="/admin/palettes" element={<PaletteStats />} />
      <Route path="/admin/numbers" element={<NumbersPage />} />
      <Route path="/leaderboard" element={<SkyLeaderboard />} />
      <Route path="/hall" element={<HallOfExpressions />} />
      <Route path="/practice" element={<PracticeTrain />} />
      <Route path="/rules" element={<HouseRules />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/passenger/:name" element={<PassengerPage />} />
      <Route path="/room/:id" element={<Room />} />
    </Routes>
    </StationContext.Provider>
  );
}
