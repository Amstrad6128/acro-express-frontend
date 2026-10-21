// Writing-time music made in the browser (Damon, 2026-10-20). No audio files: a small step sequencer with Web
// Audio oscillators and noise. Every theme knows the station's length: it keeps ONE steady tempo all the way (it
// starts part-way into its first bar so that the last bar ends exactly at 0), builds up as the time runs out
// without ever playing its beat faster, and ends exactly at 0. Melodies are generated from a fixed
// seed (so a theme sounds the same every time) and are original — "inspired by" means the style only.
//
// Themes: Chiptune (Damon's favourite), 70s Lounge (replaced Lo-fi: "pitchy, the bass sounds cheap"; keeps Lo-fi's
// ending), Jazzy shuffle (Damon "really likes" it; classy ending instead of "shave and a haircut"), Steam Express (a boogie
// shuffle with soft rail sounds, harmonica and boogie piano; no steam),
// Sunny Hills (inspired by classic Nintendo platformer music — KEEP IT
// ALWAYS, Damon's "masterpiece", but offline: not offered to players for now).
// Dropped for good: Turbo (Barry Leitch-style racing), Lo-fi, Sky Bossa (Damon: "not game material"), Tea Garden
// ("music to fall asleep to … not game material").
// Recorded samples (INSTRUMENTS, public/samples) are loaded only by themes that list "instruments"; none do now.
//
// playTheme(id, seconds, level, length) → Promise of { stop(), setLevel(level), endsAt (ms timestamp) }
//   seconds = seconds left in the station, length = the whole station (the theme comes in where it would be by now)

// One sound engine for all themes, switched on by the player's first click or key press (see unlockAudio).
// 2026-10-21: the sound goes straight to the speakers again. (From f0badc3 it went through an audio player element,
// like the Original song; that was not why players heard nothing — the browser waits for a click, and a new choice
// only started at the next station — and it was one more thing that could go wrong. Nobody plays on an iPhone.)
let ctx = null;
function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume().catch(() => { });
  return ctx;
}
const speakers = c => c.destination;
// Browsers only let a page make sound after the player clicked or typed, and the sound engine must be switched on
// during such a click. A station starts from the server, not from a click, so App.jsx calls this on every click and
// key press (2026-10-20: the music was silent in a real game because of this; the admin page worked because there
// every song started with a click).
// Safari only switches the engine on if a sound actually starts during the tap, so a tiny silent one is played.
export function unlockAudio() {
  try {
    const c = audioCtx();
    const b = c.createBuffer(1, 1, 22050), src = c.createBufferSource();
    src.buffer = b; src.connect(speakers(c)); src.start(0);
  } catch { /* no sound available */ }
}
const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);

// One second of white noise, reused for every drum hit
let noiseBuf = null;
function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// Where a sound goes: straight out, or placed left (-1) / right (+1) in stereo (2026-10-21, for the Remix's space)
function placed(c, out, pan) {
  if (!pan || !c.createStereoPanner) return out;
  const p = c.createStereoPanner(); p.pan.value = pan; p.connect(out); return p;
}
// A note: oscillator (+ optional vibrato) → (lowpass) → envelope → out. pan = stereo place; glide = start that many
// semitones away and slide into the note (a chip-style bend), in 60 ms
function tone(c, out, t, midi, dur, { type = "sine", vol = 0.2, attack = 0.005, detune = 0, lowpass = null, vibrato = 0, tremolo = 0, pan = 0, glide = 0 } = {}) {
  const o = c.createOscillator();
  o.type = type; o.detune.value = detune;
  if (glide) { o.frequency.setValueAtTime(hz(midi + glide), t); o.frequency.exponentialRampToValueAtTime(hz(midi), t + 0.06); }
  else o.frequency.setValueAtTime(hz(midi), t);
  if (vibrato) {                                                    // a gentle wobble in cents, after a short delay
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = 5.5; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(vibrato, t + Math.min(0.15, dur * 0.5));
    lfo.connect(depth); depth.connect(o.detune); lfo.start(t); lfo.stop(t + dur + 0.05);
  }
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
  let node = o;
  if (lowpass) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lowpass; o.connect(f); node = f; }
  if (tremolo) {                                                    // a gentle volume wobble (tremolo 0–1)
    const trem = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
    trem.gain.value = 1 - tremolo / 2; lfo.frequency.value = 4.8; depth.gain.value = tremolo / 2;
    lfo.connect(depth); depth.connect(trem.gain); lfo.start(t); lfo.stop(t + dur + 0.05);
    node.connect(trem); trem.connect(g);
  } else node.connect(g);
  g.connect(placed(c, out, pan));
  o.start(t); o.stop(t + dur + 0.05);
}
function kick(c, out, t, vol = 0.5, from = 140) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3);
}
// Noise through filters: hats (high), snares (mid), shakers, crackle. attack > 0 softens the start.
function hit(c, out, t, { vol = 0.1, dur = 0.05, hp = 7000, lp = null, attack = 0, pan = 0 } = {}) {
  const s = c.createBufferSource(); s.buffer = noise(c); s.loop = true;   // loops: a long swell outlasts the 1 s of noise
  const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
  s.connect(f);
  let node = f;
  if (lp) { const f2 = c.createBiquadFilter(); f2.type = "lowpass"; f2.frequency.value = lp; f.connect(f2); node = f2; }
  const g = c.createGain();
  if (attack > 0) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); }
  else g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
  node.connect(g); g.connect(placed(c, out, pan));
  s.start(t, Math.random() * 0.5); s.stop(t + dur + attack + 0.02);
}
// ── Recorded instruments (Damon, 2026-10-20: synthesized acoustic instruments sounded "boring and artificial") ──
// FluidR3 GM samples by Frank Wen (MIT licence), per-note MP3s from midi-js-soundfonts — see public/samples/CREDITS.txt.
// One note every three semitones; a note is played from the nearest sample, shifted (at most 1.5 semitones).
const INSTRUMENTS = {
  guitar: { dir: "acoustic_guitar_nylon", notes: ["C3", "Eb3", "Gb3", "A3", "C4", "Eb4", "Gb4", "A4"] },
  flute:  { dir: "flute", notes: ["A4", "C5", "Eb5", "Gb5", "A5", "C6"] },
  bass:   { dir: "acoustic_bass", notes: ["C2", "Eb2", "Gb2", "A2", "C3"] },
  epiano: { dir: "electric_piano_1", notes: ["C3", "Eb3", "Gb3", "A3", "C4", "Eb4", "Gb4", "A4", "C5", "Eb5", "Gb5", "A5"] },
  vibes:  { dir: "vibraphone", notes: ["A4", "C5", "Eb5", "Gb5", "A5", "C6"] },
  strings: { dir: "string_ensemble_1", notes: ["C4", "Eb4", "Gb4", "A4", "C5", "Eb5"] },
  fbass:  { dir: "electric_bass_finger", notes: ["C2", "Eb2", "Gb2", "A2", "C3"] },
  breath: { dir: "breath_noise", notes: ["C3", "C4"] },   // a recorded breath (tried as steam; unused now)
  piano:  { dir: "acoustic_grand_piano", notes: ["C2", "Eb2", "Gb2", "A2", "C3", "Eb3", "Gb3", "A3", "C4", "Eb4", "Gb4", "A4", "C5", "Eb5", "Gb5", "A5", "C6"] },
};
const PITCH = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const noteMidi = n => { const m = n.match(/^([A-G]b?)(\d)$/); return 12 * (Number(m[2]) + 1) + PITCH[m[1]]; };
const loading = {}, banks = {};
// Loads an instrument's samples once (the browser caches the files too)
function loadInstrument(c, key) {
  if (!loading[key]) {
    const ins = INSTRUMENTS[key];
    loading[key] = Promise.all(ins.notes.map(async n => {
      const r = await fetch(`/samples/${ins.dir}/${n}.mp3`);
      if (!r.ok) throw new Error(`sample ${ins.dir}/${n}: ${r.status}`);
      return { midi: noteMidi(n), buf: await c.decodeAudioData(await r.arrayBuffer()) };
    })).then(b => { banks[key] = b; return b; });
  }
  return loading[key];
}
// Plays a recorded note: the nearest sample at the right pitch, held for dur, then a short release
function sample(c, out, t, key, midi, dur, { vol = 0.3, attack = 0.004, release = 0.15, lowpass = null, human = false, offset = 0, pan = 0 } = {}) {
  const bank = banks[key];
  if (!bank) return;
  if (human) { vol *= 0.88 + Math.random() * 0.24; t += Math.random() * 0.012; }   // like a person playing
  let best = bank[0];
  for (const b of bank) if (Math.abs(b.midi - midi) < Math.abs(best.midi - midi)) best = b;
  const src = c.createBufferSource();
  src.buffer = best.buf;
  src.playbackRate.value = Math.pow(2, (midi - best.midi) / 12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  let node = src;
  if (lowpass) { const fl = c.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = lowpass; src.connect(fl); node = fl; }
  node.connect(g); g.connect(placed(c, out, pan));
  src.start(t, offset); src.stop(t + dur + release + 0.05);   // offset: start from a later point in the recording
}

// A soft reverb for themes that ask for it (th.space = how much of it, 0–1): a made-up room (2 s of noise dying
// away, the same every time), its brightness taken off so it sounds like air around the music, not a bathroom.
function makeSpace(c, amount) {
  const len = Math.floor(c.sampleRate * 2), ir = c.createBuffer(2, len, c.sampleRate), rnd = seeded(2026);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, 4); }
  const dark = c.createBiquadFilter(); dark.type = "lowpass"; dark.frequency.value = 4500;
  const conv = c.createConvolver(); conv.buffer = ir;
  const wet = c.createGain(); wet.gain.value = amount;
  dark.connect(conv); conv.connect(wet);
  return { input: dark, output: wet };
}
// A limiter after the loudness boost: catches the peaks just under the ceiling (no distortion), like a mastered track
function makeLimiter(c) {
  const l = c.createDynamicsCompressor();
  l.threshold.value = -4; l.knee.value = 0; l.ratio.value = 20; l.attack.value = 0.002; l.release.value = 0.12;
  return l;
}

// A small seeded random generator, so a theme's melody is the same every time
function seeded(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// A melody bar: notes at the given 16th positions, from the scale, leaning on the chord on strong positions.
// Generated once per bar index (8-bar phrases repeat, so the tune is memorable). rest = share of rests.
function melodyBar(seed, barIndex, positions, chord, scale, rest = 0.22) {
  const rng = seeded(seed * 1000 + (barIndex % 8));
  const notes = {};
  for (const p of positions) {
    if (rng() < rest) continue;
    notes[p] = p % 8 === 0 ? pick(rng, chord) + 12 : pick(rng, scale);
  }
  return notes;
}

// ── The themes ──────────────────────────────────────────────────
// step(c, out, s) is called for every 16th note. s: t (time), i (step), bar, pos (0–15 in the bar), p (0–1 progress
// through the station), chord, next (next bar's chord), d (16th length), late (the last 10 seconds), left (seconds
// left). Every theme has an audible final stretch (Damon: "the songs are supposed to help the passenger feel the
// passing of time without having to look at the clock"): busier from ~15 s left, building in the last ~5 s.
// ending(c, out, t, d): t = the end of the station (or, with endsEarly, the start of the last bar)
// ── Arranged songs (2026-10-21) ─────────────────────────────────
// Damon: "start from something from video games music and remix it or upgrade it for Express". Famous game tunes
// are copyrighted, so these are OLD PUBLIC-DOMAIN melodies, in our own simple arrangement (Damon: the hybrid was "too
// complex"): one melody, a bass, light drums, the train's rails and whistle (the Express's signature, Steam's
// sound Damon loved). Korobeiniki (the Russian folk song that became the Tetris theme), Funiculì, Funiculà (Denza,
// 1880: a song about a railway climbing up the mountain), The Entertainer (Joplin, 1902) and Gymnopédie No. 1
// (Satie, 1888). The tempo never changes. The song is laid out from the END of the station: its last phrase (the
// "final" bars, lifted a step for most) always lands on the last seconds, announced by the whistle; before it the
// song's sections repeat ("cycle"). Toots at 4 and 2 s, a soft swell, and the song's last chord at 0.
// A bar: { ch: chord, ch2: chord for its second half (optional), m: [[16th step, MIDI note, length in 16ths]…],
//   dbl: the bass voice doubles the tune an octave down, calm: drums lighter }. A chord: [bass root, [chord tones]].
function songTheme(cfg) {
  const steps = cfg.barSteps || 16;                                          // 16ths per bar (12 for 3/4 and 6/8)
  const half = steps / 2;
  return {
    name: cfg.name, offline: true, bpm: cfg.bpm, gain: cfg.gain, boost: cfg.boost, swing: cfg.swing || 0, seed: 1,
    instruments: cfg.instruments,
    prog: [{ root: 0, tones: [] }],                                          // (not used: the bars carry their chords)
    step(c, out, s) {
      const { t, d, left } = s;
      // where we are, counted back from the end of the station
      const back = s.bars * 16 - s.i - 1;                                   // 16ths before the last one
      const pos = steps - 1 - (back % steps), fromEnd = Math.floor(back / steps);
      const fin = cfg.final, cyc = cfg.cycle;
      const isFinal = fromEnd < fin.length;
      const bar = isFinal ? fin[fin.length - 1 - fromEnd] : cyc[cyc.length - 1 - ((fromEnd - fin.length) % cyc.length)];
      const lift = isFinal ? (cfg.lift || 0) : 0;
      const chord = bar.ch2 && pos >= half ? bar.ch2 : bar.ch;
      const root = chord[0] + lift, tones = chord[1].map(n => n + lift);
      const intro = s.i < 2 * steps && !isFinal;                             // the first couple of bars: no tune yet
      // the whistle: at the start, announcing the final phrase, and two toots at 4 and 2 s left
      if (s.first || (isFinal && fromEnd === fin.length - 1 && pos === 0)) THEMES.steam.whistle(c, out, t, d * 10);
      if ((left <= 4 && left + d > 4) || (left <= 2 && left + d > 2)) THEMES.steam.whistle(c, out, t, 0.35);
      // the rails: two soft thumps on each beat-group
      const beat2 = steps === 12 ? 6 : 8, clack = isFinal ? 1.25 : 1;
      if (pos === 0 || pos === 2) kick(c, out, t, 0.1 * clack, 110);
      if (pos === beat2 || pos === beat2 + 2) kick(c, out, t, 0.055 * clack, 150);
      // the bass and the chords
      const tri = (n, len, vol) => tone(c, out, t, n, d * len, { type: "triangle", vol, attack: 0.01, lowpass: 900 });
      const stab = (len, vol) => tones.forEach(n => tone(c, out, t, n, d * len, { type: "triangle", vol, attack: 0.006, lowpass: 2200 }));
      const felt = (n, len, vol) => sample(c, out, t, "piano", n, d * len, { vol, attack: 0.012, release: 0.4, lowpass: 1800, human: true });
      if (cfg.bass === "octaves") {                                           // Korobeiniki: the octave bass in eighths
        if (bar.calm) { if (pos % 8 === 0) tri(root, 7, 0.16); }
        else if (pos % 2 === 0) tri(root + (pos % 4 === 2 ? 12 : 0), 1.8, 0.15);
        if (pos % 8 === 4 && !intro) stab(2, bar.calm ? 0.018 : 0.024);
      } else if (cfg.bass === "stride") {                                     // The Entertainer: oom-pah
        if (pos === 0 || pos === 8) tri(root - (pos === 8 ? 5 : 0), 3, 0.17);
        if (pos === 4 || pos === 12) stab(2.5, 0.03);
      } else if (cfg.bass === "tarantella") {                                 // Funiculì (6/8): bass, chord, chord
        if (pos === 0 || pos === 6) tri(root + (pos === 6 ? 7 : 0), 3.5, 0.16);
        if (pos === 2 || pos === 4 || pos === 8 || pos === 10) stab(1.5, 0.022);
      } else if (cfg.bass === "gymno") {                                      // Gymnopédie (3/4): low note, then the chord
        if (pos === 0) felt(root, 11, 0.3);
        if (pos === 4) tones.forEach(n => felt(n, 8, 0.13));
      }
      if (intro) return;
      // light drums
      const dr = cfg.drums;
      if (dr === "march") {
        if (pos === 0 || (!bar.calm && pos === 8)) kick(c, out, t, 0.11, 120);
        if (!bar.calm && (pos === 4 || pos === 12)) hit(c, out, t, { vol: 0.07, dur: 0.1, hp: 1500, lp: 6000 });
        if (pos % 2 === 0) hit(c, out, t, { vol: bar.calm ? 0.012 : 0.022, dur: 0.03, hp: 8500 });
      } else if (dr === "rag") {
        if (pos === 4 || pos === 12) hit(c, out, t, { vol: 0.05, dur: 0.08, hp: 1800, lp: 6000 });
        if (pos % 2 === 0) hit(c, out, t, { vol: 0.018, dur: 0.03, hp: 8500 });
      } else if (dr === "six") {
        if (pos % 2 === 0) hit(c, out, t, { vol: pos % 6 === 0 ? 0.03 : 0.016, dur: 0.04, hp: 7500 });   // a tambourine-like shake
      }
      if (left <= 4 && left + d > 4) hit(c, out, t, { vol: 0.045, dur: 4, hp: 2500, lp: 9000, attack: 3.8 });
      // the tune
      for (const [at, n, len] of bar.m) {
        if (at !== pos) continue;
        const note = n + lift;
        if (cfg.lead === "vibes") sample(c, out, t, "vibes", note, d * len, { vol: 0.3, release: 0.6, human: true });
        else tone(c, out, t, note, d * (len <= 2 ? len * 0.7 : len * 0.95), { type: "square", vol: 0.05, attack: 0.006, lowpass: cfg.leadLP || 3200, vibrato: len >= 6 ? 8 : 0 });
        if (bar.dbl || isFinal) tone(c, out, t, note - 12, d * len * 0.9, { type: "triangle", vol: 0.05, attack: 0.008, lowpass: 2000 });
      }
    },
    ending(c, out, t) {
      const [r, tns] = cfg.end;
      THEMES.steam.whistle(c, out, t, 1.6);
      tone(c, out, t, r, 2, { type: "triangle", vol: 0.2, attack: 0.02 });
      tns.forEach(n => cfg.lead === "vibes" ? sample(c, out, t, "vibes", n, 2, { vol: 0.2, release: 1 })
        : tone(c, out, t, n, 1.8, { type: "square", vol: 0.022, attack: 0.02, lowpass: 2600 }));
    },
  };
}
// Chords used below: [bass root, tones]
const Am = [45, [57, 60, 64]], E7 = [40, [56, 62, 64]], Ech = [40, [56, 59, 64]], Dm = [38, [57, 62, 65]], Cmaj = [36, [55, 60, 64]];
// Korobeiniki (the Tetris tune), A minor. A = the famous 8 bars; B = the slow middle in half notes.
const KORO_A = [
  { ch: Am, m: [[0, 76, 4], [4, 71, 2], [6, 72, 2], [8, 74, 4], [12, 72, 2], [14, 71, 2]] },
  { ch: Am, m: [[0, 69, 4], [4, 69, 2], [6, 72, 2], [8, 76, 4], [12, 74, 2], [14, 72, 2]] },
  { ch: Ech, m: [[0, 71, 6], [6, 72, 2], [8, 74, 4], [12, 76, 4]] },
  { ch: Am, m: [[0, 72, 4], [4, 69, 4], [8, 69, 8]] },
  { ch: Dm, m: [[2, 74, 4], [6, 77, 2], [8, 81, 4], [12, 79, 2], [14, 77, 2]] },
  { ch: Cmaj, m: [[0, 76, 6], [6, 72, 2], [8, 76, 4], [12, 74, 2], [14, 72, 2]] },
  { ch: Ech, m: [[0, 71, 4], [4, 71, 2], [6, 72, 2], [8, 74, 4], [12, 76, 4]] },
  { ch: Am, m: [[0, 72, 4], [4, 69, 4], [8, 69, 4]] },
];
const KORO_B = [
  { ch: Am, calm: true, m: [[0, 76, 8], [8, 72, 8]] }, { ch: E7, calm: true, m: [[0, 74, 8], [8, 71, 8]] },
  { ch: Am, calm: true, m: [[0, 72, 8], [8, 69, 8]] }, { ch: Ech, calm: true, m: [[0, 68, 8], [8, 71, 8]] },
  { ch: Am, calm: true, m: [[0, 76, 8], [8, 72, 8]] }, { ch: E7, calm: true, m: [[0, 74, 8], [8, 71, 8]] },
  { ch: Am, calm: true, m: [[0, 72, 4], [4, 76, 4], [8, 81, 8]] }, { ch: Ech, calm: true, m: [[0, 80, 16]] },
];
// Funiculì, Funiculà — the chorus, F major, 6/8 (12 sixteenths a bar). From an ABC transcription on
// abcnotation.com ("Funiculi Funicula (1)").
const F_ = [41, [60, 65, 69]], C7 = [36, [58, 64, 67]], A7 = [45, [61, 64, 67]], Dmi = [38, [62, 65, 69]], Bb = [46, [62, 65, 70]];
const FUN = [
  { ch: C7, m: [[0, 76, 6], [6, 74, 2]] }, { ch: C7, m: [[0, 76, 6], [6, 74, 2]] },
  { ch: C7, m: [[0, 77, 4], [4, 76, 2], [6, 74, 4], [10, 77, 2]] }, { ch: F_, m: [[0, 76, 6], [6, 76, 2]] },
  { ch: C7, m: [[0, 76, 6], [6, 74, 2]] }, { ch: C7, m: [[0, 76, 6], [6, 74, 2]] },
  { ch: C7, m: [[0, 77, 4], [4, 76, 2], [6, 74, 4], [10, 77, 2]] }, { ch: F_, m: [[0, 72, 4], [4, 69, 2], [6, 69, 4], [10, 69, 2]] },
  { ch: F_, m: [[0, 69, 4], [4, 69, 2], [6, 69, 4], [10, 69, 2]] }, { ch: F_, m: [[0, 69, 4], [4, 69, 2], [6, 69, 4], [10, 69, 2]] },
  { ch: A7, m: [[0, 69, 4], [4, 69, 2], [6, 69, 4], [10, 69, 2]] }, { ch: Dmi, m: [[0, 77, 12]] },
  { ch: Bb, m: [[0, 79, 4], [4, 77, 2], [6, 74, 4], [10, 77, 2]] }, { ch: Dmi, m: [[0, 74, 4], [4, 69, 2], [6, 69, 4], [10, 70, 2]] },
  { ch: C7, m: [[0, 72, 4], [4, 70, 2], [6, 69, 4], [10, 67, 2]] }, { ch: F_, m: [[0, 65, 8]] },
];
// The Entertainer — the main strain, C major; each of our bars holds two 2/4 bars (the chord may change halfway)
const C_ = [36, [60, 64, 67]], G7 = [43, [59, 65, 67]], D7 = [38, [60, 66, 69]];
const ENT = [
  { ch: C_, m: [[0, 76, 1], [1, 84, 2], [3, 76, 1], [4, 84, 2], [6, 76, 1], [7, 84, 5], [12, 84, 1], [13, 86, 1], [14, 87, 1], [15, 88, 1]] },
  { ch: G7, ch2: C_, m: [[0, 84, 1], [1, 86, 1], [2, 88, 2], [4, 83, 1], [5, 86, 3], [8, 84, 4], [14, 74, 1], [15, 75, 1]] },
  { ch: C_, ch2: D7, m: [[0, 76, 1], [1, 84, 2], [3, 76, 1], [4, 84, 2], [6, 76, 1], [7, 84, 5], [12, 81, 1], [13, 79, 1], [14, 78, 1], [15, 81, 1]] },
  { ch: D7, ch2: G7, m: [[0, 84, 1], [1, 88, 2], [3, 86, 1], [4, 84, 1], [5, 81, 1], [6, 86, 2], [8, 86, 4], [14, 74, 1], [15, 75, 1]] },
];
// Gymnopédie No. 1 — 3/4 (12 sixteenths a bar), the chords swinging between Gmaj7 and Dmaj7
const Gm7 = [43, [59, 62, 66]], Dm7 = [38, [57, 61, 66]];
const GYM = [
  { ch: Gm7, m: [[4, 78, 4], [8, 81, 4]] }, { ch: Dm7, m: [[0, 79, 4], [4, 78, 4], [8, 73, 4]] },
  { ch: Gm7, m: [[0, 71, 4], [4, 73, 4], [8, 74, 4]] }, { ch: Dm7, m: [[0, 69, 12]] },
  { ch: Gm7, m: [[0, 66, 12]] }, { ch: Dm7, m: [] },
  { ch: Gm7, m: [[4, 78, 4], [8, 81, 4]] }, { ch: Dm7, m: [[0, 79, 4], [4, 78, 4], [8, 73, 4]] },
  { ch: Gm7, m: [[0, 71, 4], [4, 73, 4], [8, 74, 4]] }, { ch: Dm7, m: [[0, 69, 12]] },
  { ch: Gm7, m: [[0, 73, 12]] }, { ch: Dm7, m: [[0, 78, 12]] }, { ch: Gm7, m: [[0, 76, 12]] }, { ch: Dm7, m: [] },
];
const SONGS = {
  korobeiniki: songTheme({ name: "Korobeiniki", bpm: 112, gain: 1.25, boost: 4.5, bass: "octaves", drums: "march",
    cycle: [...KORO_A, ...KORO_A.map(b => ({ ...b, dbl: true })), ...KORO_B], final: KORO_A, lift: 2, end: [47, [71, 74, 78, 83]] }),
  funiculi: songTheme({ name: "Funiculì", bpm: 126, barSteps: 12, gain: 1.45, boost: 4.5, bass: "tarantella", drums: "six",
    cycle: [...FUN, ...FUN.map(b => ({ ...b, dbl: true }))], final: FUN.slice(8), lift: 2, end: [43, [67, 71, 74, 79]] }),
  entertainer: songTheme({ name: "Entertainer", bpm: 92, gain: 1.66, boost: 4.5, bass: "stride", drums: "rag", leadLP: 3600,
    cycle: [...ENT, ENT[0], ENT[1], ...ENT.map(b => ({ ...b, dbl: true })), ENT[0], ENT[1]], final: [ENT[2], ENT[3], ENT[0], ENT[1]], lift: 2, end: [38, [74, 78, 81, 86]] }),
  gymnopedie: songTheme({ name: "Gymnopédie", bpm: 88, barSteps: 12, gain: 2.6, boost: 4.5, bass: "gymno", drums: "none", lead: "vibes",
    instruments: ["piano", "vibes"], cycle: GYM, final: GYM.slice(6, 14), lift: 0, end: [43, [71, 74, 78, 83]] }),
};

const THEMES = {
  ...SONGS,   // the arranged public-domain songs above (offline until Damon picks)
  // Chiptune: square lead, arpeggios, triangle bass, 8-bit drums. I–V–vi–IV in C.
  chiptune: {
    // "Pixel": was "Chiptune" (Damon: "chip and cheap are similar words")
    name: "Pixel", bpm: 112,   // was 132 (Damon, 2026-10-21: "too fast")
    gain: 0.9, seed: 7, boost: 4.6,   // 3.5 → 4.6 (2026-10-21: after the slowdown it measured 1.8 LU under the Original; now level with it)
    prog: [{ root: 36, tones: [60, 64, 67] }, { root: 43, tones: [59, 62, 67] }, { root: 45, tones: [60, 64, 69] }, { root: 41, tones: [60, 65, 69] }],
    scale: [72, 74, 76, 79, 81, 84],
    step(c, out, s) {
      const { t, pos, p, chord, d, bar, left } = s;
      if (pos % 2 === 0) tone(c, out, t, chord.root + (pos % 4 === 2 ? 12 : 0) + 12, d * 1.7, { type: "triangle", vol: 0.22 });
      if (p > 0.12) tone(c, out, t, chord.tones[pos % 3] + 12, d * 0.9, { type: "square", vol: 0.035 });
      if (p > 0.25) {
        // final stretch (2026-10-21: the beat never doubles — 16th hats, a kick on every beat and a snare roll made
        // it sound faster): from 15 s left the hats get brighter with an open hat on the off-beats, and in the last
        // 4 s one long noise swell rises into the ending
        if (pos === 0 || pos === 8 || (p > 0.6 && pos === 10)) kick(c, out, t, 0.42);
        if (pos === 4 || pos === 12) hit(c, out, t, { vol: 0.14, dur: 0.11, hp: 1500, lp: 6500 });
        if (pos % 2 === 0) hit(c, out, t, { vol: left <= 15 ? 0.05 : 0.035, dur: 0.03, hp: 8500 });
        if (left <= 15 && pos % 4 === 2) hit(c, out, t, { vol: 0.03, dur: 0.12, hp: 7000 });
        if (left <= 4 && left + d > 4) hit(c, out, t, { vol: 0.07, dur: 4, hp: 1500, lp: 7000, attack: 3.8 });
      }
      if (p > 0.4) {
        const mel = melodyBar(this.seed, bar, [0, 2, 3, 6, 8, 10, 12, 14], chord.tones, this.scale);
        if (mel[pos] != null) tone(c, out, t, mel[pos] + (left <= 8 ? 12 : 0), d * 1.8, { type: "square", vol: 0.06 });
      }
    },
    // A gentle ending (Damon: the old one, with a kick and a crash, was "too strong … it doesn't fit the rest")
    ending(c, out, t) {
      [72, 76, 79].forEach((n, k) => tone(c, out, t + k * 0.12, n, 0.45, { type: "square", vol: 0.035, lowpass: 3500 }));
      [60, 64, 67, 72].forEach(n => tone(c, out, t + 0.36, n, 1.8, { type: "square", vol: 0.026, attack: 0.02, lowpass: 3000 }));
      tone(c, out, t + 0.36, 48, 1.8, { type: "triangle", vol: 0.2, attack: 0.02 });
    },
  },

  // 70s Lounge (Damon, 2026-10-20: replaced Lo-fi; Lo-fi's ending is kept, he loved it). Rebuilt on recorded
  // instruments (Damon: "should use real instruments as it sounds cheap … a bit flat, similar from end to end"):
  // Rhodes electric piano, vibraphone, strings, finger bass, with soft synthesized brushes. An arc: intro (keys and
  // bass only), the groove (brushes, a second keys stab, the vibraphone melody), a lift up a whole step with strings,
  // then the final stretch (bass in 8ths, hats picking up, strings swelling) into the ending.
  // A section: Cmaj9–Am9–Dm9–G13–Em7–A7–Dm9–G13; B section: Fmaj7–Fm7–Em7–A7–Dm9–G13–Cmaj9–G13.
  // 2026-10-20 (Damon: "way better sounding, although it's flat, like repeating the same thing forever"): the A/B
  // form, a new vibraphone melody every 8 bars, different Rhodes comping and hats in B, and a one-bar break (only the
  // Rhodes) just before the lift.
  lounge: {
    // offline: kept back (Damon unsure; its brushes sound "like a blip, like the needle of the pickup is broken")
    name: "70s Lounge", offline: true, bpm: 92, gain: 1.0, boost: 7.65, seed: 70, swing: 0.15, instruments: ["epiano", "vibes", "strings", "fbass"],
    prog: [{ root: 36, tones: [55, 59, 62, 64] }, { root: 45, tones: [55, 59, 60, 64] }, { root: 38, tones: [53, 57, 60, 64] }, { root: 43, tones: [53, 59, 64] },
           { root: 40, tones: [55, 59, 62, 64] }, { root: 45, tones: [55, 58, 61, 64] }, { root: 38, tones: [53, 57, 60, 64] }, { root: 43, tones: [53, 59, 64] },
           { root: 41, tones: [53, 57, 60, 64] }, { root: 41, tones: [53, 56, 60, 63] }, { root: 40, tones: [55, 59, 62, 64] }, { root: 45, tones: [55, 58, 61, 64] },
           { root: 38, tones: [53, 57, 60, 64] }, { root: 43, tones: [53, 59, 64] }, { root: 36, tones: [55, 59, 62, 64] }, { root: 43, tones: [53, 59, 64] }],
    step(c, out, s) {
      const { t, pos, p, chord, d, bar, next, left, bars } = s;
      const liftBar = Math.round(bars * 0.55);
      const intro = p < 0.15, lift = bar >= liftBar ? 2 : 0;    // the lift: up a whole step for the last part
      const brk = bar === liftBar - 1;                              // the break: only the Rhodes, then the lift
      const B = bar % 16 >= 8;                                      // the B section
      if (brk) {
        if (pos === 0) chord.tones.forEach((n, k) => sample(c, out, t + k * 0.04, "epiano", n, d * 15, { vol: 0.2, release: 0.6 }));
        if (pos === 0) sample(c, out, t, "fbass", chord.root, d * 15, { vol: 0.45, release: 0.3 });
        return;
      }
      // Rhodes: the chord on 1 (held through the intro), a softer stab on the "and" of 2, a little push later on
      const keys = (vol, len) => chord.tones.forEach((n, k) => sample(c, out, t + k * 0.012, "epiano", n + lift, len, { vol, release: 0.4, human: true }));
      if (!B || intro) {                                        // A: the chord on 1, a softer stab on the "and" of 2
        if (pos === 0) keys(intro ? 0.2 : 0.17, d * (intro ? 15 : 9));
        if (!intro && pos === 6) keys(0.1, d * 5);
      } else {                                                  // B: off-beat stabs on the "and" of 2 and 4
        if (pos === 2) keys(0.13, d * 3);
        if (pos === 6 || pos === 14) keys(0.11, d * 3);
      }
      if (p > 0.45 && pos === 14 && bar % 2 === 1 && !B) keys(0.08, d * 2);
      // finger bass (a note above C3 drops an octave: the samples end there)
      const fb = (n, len) => { const m = n + lift; sample(c, out, t, "fbass", m > 50 ? m - 12 : m, len, { vol: 0.5, release: 0.12, human: true }); };
      if (pos === 0) fb(chord.root, d * (intro ? 14 : 7));
      if (!intro) {
        if (pos === 8) fb(chord.root + 7, d * 3.5);
        if (pos === 12) fb(chord.root + 12, d * 1.8);
        if (pos === 14) fb(next.root + (next.root > chord.root ? -1 : 1), d * 1.8);
        if (left <= 12 && pos % 4 === 2) fb(chord.root + 7, d * 1.6);                 // final stretch: bass in 8ths
      }
      // brushes after the intro: a soft swish on every beat, a quiet hat, a gentle kick; hats pick up at the end
      if (!intro) {
        if (pos % 4 === 0) hit(c, out, t, { vol: 0.02, dur: 0.3, hp: 1500, lp: 5000, attack: 0.05 });
        if (pos === 4 || pos === 12 || (B && pos % 2 === 0) || (left <= 12 && pos % 2 === 0)) hit(c, out, t, { vol: 0.02, dur: 0.05, hp: 5000, lp: 8000, attack: 0.008 });
        if (pos === 0 || pos === 10) kick(c, out, t, 0.14, 80);
      }
      // strings from the lift, swelling in the last seconds
      if (lift && pos === 0)
        chord.tones.slice(0, 3).forEach(n => sample(c, out, t, "strings", n + 12 + lift, d * 15, { vol: left <= 8 ? 0.11 : 0.07, attack: 0.3, release: 0.6 }));
      // vibraphone melody: only the chord's own notes (kept in the vibraphone's range)
      if (p > 0.25) {
        const mel = melodyBar(this.seed + 13 * Math.floor(bar / 8), bar, B ? [2, 6, 8, 12, 14] : [0, 4, 6, 10, 12], chord.tones, chord.tones.map(n => n + 12), 0.35);   // a new melody every 8 bars
        if (mel[pos] != null) { const n = mel[pos] < 68 ? mel[pos] + 12 : mel[pos]; sample(c, out, t, "vibes", n + lift, d * 5, { vol: 0.22, release: 0.5, human: true }); }
      }
    },
    // Lo-fi's ending (Damon loved it), now on the Rhodes, in the lifted key: a long, soft Cmaj9 a step up and a low note
    ending(c, out, t) {
      [48, 52, 55, 59, 62].forEach((n, k) => sample(c, out, t + k * 0.08, "epiano", n + 12 + 2, 3.0, { vol: 0.17, release: 0.8 }));
      sample(c, out, t, "fbass", 38, 2.8, { vol: 0.5, release: 0.5 });
      [60, 64, 67].forEach(n => sample(c, out, t, "strings", n + 2 + 12, 2.6, { vol: 0.06, attack: 0.4, release: 0.8 }));
    },
  },

  // Jazzy shuffle: walking bass, ride cymbal, piano stabs, swung riffs. C6–A7–Dm7–G7. Ends with a short descending
  // run into a warm C6/9 chord and a soft cymbal swell (the "shave and a haircut" tag was too funny — Damon).
  jazzy: {
    name: "Jazz", offline: true, bpm: 148,   // offline 2026-10-21 (Damon's new line-up)
    gain: 0.95, boost: 5.25, seed: 33, swing: 0.33, endsEarly: true,
    prog: [{ root: 36, tones: [52, 55, 57, 60] }, { root: 45, tones: [55, 57, 61, 64] }, { root: 38, tones: [53, 57, 60, 62] }, { root: 43, tones: [53, 55, 59, 62] }],
    scale: [72, 74, 75, 76, 79, 81, 84],
    step(c, out, s) {
      const { t, pos, p, chord, d, bar, next, left } = s;
      const late = left <= 8;
      if (pos % 4 === 0) {                                          // walking bass: root, third, fifth, approach note
        const beat = pos / 4;
        const n = beat === 0 ? chord.root : beat === 1 ? chord.root + 4 : beat === 2 ? chord.root + 7 : next.root + (next.root > chord.root ? -1 : 1);
        tone(c, out, t, n, d * 3.6, { type: "triangle", vol: left <= 8 ? 0.34 : 0.3, lowpass: left <= 8 ? 1200 : 900 });
      }
      // (2026-10-21: the bass no longer doubles up into 8ths at the end — it sounded like speeding up; it gets a
      // little stronger and brighter instead)
      if (p > 0.08 && (pos === 0 || pos === 6 || (p > 0.55 && pos === 14)))   // Charleston-style piano stabs
        chord.tones.forEach(n => tone(c, out, t, n + 12, 0.16, { type: "triangle", vol: 0.04, lowpass: 3200 }));
      if (p > 0.2) {
        const lift = left <= 15 ? 1.35 : 1;                                                                                // final stretch: the same ride, louder
        if ([0, 4, 6, 8, 12, 14].includes(pos)) hit(c, out, t, { vol: (pos % 4 === 0 ? 0.045 : 0.03) * lift, dur: 0.22, hp: 6000 });   // ride
        if (pos === 4 || pos === 12) hit(c, out, t, { vol: 0.04, dur: 0.03, hp: 7500 });                                    // hi-hat foot
        if (pos % 4 === 0) kick(c, out, t, 0.14);                                                                           // feathered kick
        if (late && (pos === 4 || pos === 12)) hit(c, out, t, { vol: 0.05, dur: 0.1, hp: 1800, lp: 5000 });                 // brush on 2 and 4
        if (left <= 4 && left + d > 4) hit(c, out, t, { vol: 0.06, dur: 4, hp: 4000, attack: 3.6 });                       // cymbal swell into the ending
      }
      if (p > 0.35) {
        const mel = melodyBar(this.seed, bar, [0, 2, 4, 6, 8, 10, 14], chord.tones, this.scale);
        if (mel[pos] != null) tone(c, out, t, mel[pos] + (late ? 12 : 0), d * 1.6, { type: "triangle", vol: 0.07, lowpass: 4000 });
      }
    },
    // t = the start of the last bar (G7): bass walks down, a run G–E–D–C lands on the final chord exactly at 0
    ending(c, out, t, d) {
      const q = d * 4;
      [[0, 43], [1, 41], [2, 40], [3, 38]].forEach(([b, n]) => tone(c, out, t + b * q, n, q * 0.9, { type: "triangle", vol: 0.28, lowpass: 900 }));
      [[2, 79], [2.5, 76], [3, 74], [3.5, 72]].forEach(([b, n]) => tone(c, out, t + b * q, n, q * 0.5, { type: "triangle", vol: 0.07, lowpass: 4000 }));
      const end = t + 4 * q;
      [52, 55, 57, 62, 64].forEach((n, k) => tone(c, out, end + k * 0.015, n + 12, 2.2, { type: "triangle", vol: 0.045, attack: 0.01, lowpass: 3200 }));
      tone(c, out, end, 36, 2, { type: "triangle", vol: 0.3, lowpass: 900 });
      hit(c, out, end, { vol: 0.06, dur: 1.6, hp: 5000, attack: 0.25 });                                                    // cymbal swell
    },
  },

  // Steam Express (Damon, 2026-10-20: "like Jazzy or like Chiptune, inspired by air and by train sounds but stylized
  // and not loud, and steam"). A gentle boogie shuffle (the classic train-song swing) on a 12-bar blues in G, with
  // the railway turned into soft musical parts (no steam: dropped, Damon: "it kills the whole song"): a soft low
  // "clickety-clack" on the rails that doubles in the final stretch, with boogie piano stabs and the harmonica; a warm train
  // whistle (two notes sliding up) every 16 bars; a blues harmonica riff every 4 bars.
  // A walking boogie bass and a mellow chiptune-like melody (from a third of the way in). Ends on a long whistle.
  steam: {
    name: "Steam", bpm: 118, gain: 1.35, boost: 6.2,   // 5.3 → 6.2 (2026-10-21: quieter rails and bass, level with the Original again)
    seed: 1825, swing: 0.3,   // louder (Damon: "maybe too low in volume")
    prog: [{ root: 43, tones: [55, 59, 62, 65] }, { root: 43, tones: [55, 59, 62, 65] }, { root: 43, tones: [55, 59, 62, 65] }, { root: 43, tones: [55, 59, 62, 65] },
           { root: 48, tones: [55, 58, 60, 64] }, { root: 48, tones: [55, 58, 60, 64] }, { root: 43, tones: [55, 59, 62, 65] }, { root: 43, tones: [55, 59, 62, 65] },
           { root: 50, tones: [54, 57, 60, 62] }, { root: 48, tones: [55, 58, 60, 64] }, { root: 43, tones: [55, 59, 62, 65] }, { root: 50, tones: [54, 57, 60, 62] }],
    scale: [67, 69, 70, 71, 74, 76, 79],
    step(c, out, s) {
      const { t, pos, p, chord, d, late, bar, left } = s;
      // arriving: two short toots, at 4 and at 2 seconds left
      if ((left <= 4 && left + d > 4) || (left <= 2 && left + d > 2)) this.whistle(c, out, t, 0.4);
      // the whistle (reworked: Damon found the first version "unpleasant to the ear"): a warm two-note "whooo",
      // every 16 bars (and at the very start)
      if ((pos === 0 && bar % 16 === 0) || (s.first && bar === 0)) this.whistle(c, out, t, d * 12);
      // (No steam any more. Damon: "Just lose the steam … It kills the whole song" — the synthesized puffs and then a
      // recorded breath, steady or irregular, all sounded unnatural. The breath_noise samples stay, unused.)
      // clickety-clack: two soft low thumps on the rails, then a lighter pair halfway through the bar; from 15 s left
      // the wheels clack twice as often, harder from 7 s left
      // (2026-10-21: the wheels no longer clack twice as often at the end — it sounded like speeding up; louder instead)
      // (2026-10-21, Damon: "it has too much rhythm … give it more melody or blinking", "don't make it a circus":
      // the rails and the bass a step back, the tune in from the start and fuller, a few soft glints)
      const clack = left <= 7 ? 1.4 : left <= 15 ? 1.2 : 1;
      if (pos === 0 || pos === 2) kick(c, out, t, 0.085 * clack, 110);
      if (pos === 8 || pos === 10) kick(c, out, t, 0.04 * clack, 150);
      // final stretch, boogie piano: soft off-beat chord stabs from 15 s left
      if (left <= 15 && pos % 4 === 2)
        chord.tones.slice(1).forEach(n => tone(c, out, t, n + 12, d * 1.2, { type: "triangle", vol: 0.016, attack: 0.006, lowpass: 2400 }));
      // (the breezy pad and the wind swell are gone: their "voooo, voooo" every bar was unpleasant — Damon)
      // a blues harmonica, the classic train-song sound: a short two-note riff every 4 bars, mellow and quiet;
      // every bar from 15 s left, an octave higher from 8 s left
      if (p > 0.2 && (bar % 4 === 2 || left <= 15) && (pos === 0 || pos === 3)) {
        const pair = pos === 0 ? [chord.tones[1], chord.tones[2]] : [chord.tones[2], chord.tones[3]];
        pair.forEach(n => tone(c, out, t, n + (left <= 8 ? 24 : 12), d * (pos === 0 ? 2.5 : 4), { type: "square", vol: 0.011, attack: 0.03, lowpass: left <= 8 ? 2200 : 1500, vibrato: 12 }));
      }
      // walking boogie bass in swung 8ths: root, 3rd, 5th, 6th, b7, 6th, 5th, 3rd
      if (pos % 2 === 0) {                     // from the start too (the first seconds felt empty after the whistle)
        const steps = [0, 4, 7, 9, 10, 9, 7, 4];
        tone(c, out, t, chord.root + steps[pos / 2], d * 1.8, { type: "triangle", vol: 0.115, attack: 0.01, lowpass: 800 });
      }
      // a mellow chiptune-like melody (a soft square with the edges filtered off): from the first seconds now (was
      // a third of the way in), a little louder and more legato, so the tune leads and the rhythm follows
      if (p > 0.06) {
        const mel = melodyBar(this.seed, bar, [0, 3, 6, 8, 11, 14], chord.tones, this.scale, 0.3);
        if (mel[pos] != null) tone(c, out, t, mel[pos] + (late ? 12 : 0), d * 2.6, { type: "square", vol: 0.032, attack: 0.012, lowpass: 2200, vibrato: 6 });
      }
      // blinking: every other bar a soft high glint on the chord, two notes, like lights passing the window
      if (p > 0.12 && pos === 10 && bar % 2 === 1)
        [chord.tones[2], chord.tones[1]].forEach((n, k) => tone(c, out, t + k * d * 1.5, n + 24, d * 3, { type: "sine", vol: 0.02, attack: 0.004 }));
    },
    // A warm "whooo": two notes a sixth apart (G4 and E5), mellow triangle tones with the brightness filtered off,
    // sliding gently up from a tone below, with a slight wobble
    whistle(c, out, t, len) {
      [67, 76].forEach(n => {
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(440 * Math.pow(2, (n - 71) / 12), t);
        o.frequency.exponentialRampToValueAtTime(440 * Math.pow(2, (n - 69) / 12), t + 0.45);
        const lfo = c.createOscillator(), depth = c.createGain();
        lfo.frequency.value = 4.5; depth.gain.value = 9; lfo.connect(depth); depth.connect(o.detune); lfo.start(t); lfo.stop(t + len + 0.05);
        f.type = "lowpass"; f.frequency.value = 1300;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.02, t + 0.3);
        g.gain.setValueAtTime(0.02, t + len * 0.65);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.05);
      });
    },
    ending(c, out, t, d) {
      this.whistle(c, out, t, 1.8);
      [55, 59, 62, 64].forEach(n => tone(c, out, t, n + 12, 2.2, { type: "sine", vol: 0.03, attack: 0.04, lowpass: 2000 }));
      tone(c, out, t, 43, 2, { type: "triangle", vol: 0.16, attack: 0.02, lowpass: 700 });
    },
  },

  // Remix v4 (2026-10-21). The story so far: v1 "a nice try but not yet there"; v2 "much better"; v3 (felt piano,
  // Tiersen / Zimmer / Pope / Nintendo) "an interesting hybrid … go deeper into it so that it doesn't sound like
  // AI but has a more gamey feel. Playful but not for kids, it's all about atmosphere."
  // What made v3 sound machine-made: every note on the grid at the same strength, plain three-note chords, nothing
  // leaning, sliding or answering back, and a dry sound with no room around it. v4 goes after each of those, the way
  // grown-up-but-playful game music does (city-pop/jazz-flavoured game scores, Nintendo's evening tracks, Kondo's
  // Latin-tinged swing):
  //  - Groove: a light swing on the off-beats, a finger-bass riff that skips around the beat (with approach notes
  //    into each new chord) instead of walking on it, kick on 1 and a pushed "and of 2", ghost snares, and a short
  //    tom fill (in eighths, never faster) closing every 4 bars.
  //  - Colour: 7th and 9th chords on a felt piano that comps in syncopated stabs (city-pop style), and in A2 and
  //    the final lift the bittersweet Nintendo turn — the C bar slides from C major to C minor halfway.
  //  - Conversation: when the hook holds a note, a little three-note answer (a vibraphone) fills the gap.
  //  - Articulation: short notes staccato, long notes slide in (a chip bend) and get a late vibrato; a quiet
  //    stereo echo of the lead bounces to the other side.
  //  - Atmosphere: a soft reverb around everything (th.space), instruments placed left and right, the rails
  //    rocking between the speakers, a faint string pad in the bridge and the lift.
  // Kept: the Original's key (G), tempo (86 bpm) and chords (I–V–vi–IV), the hook from v2, the train (rails,
  // whistle), the form counted back from the end (intro → A → A2 → bridge → … → the last 4 bars lifted G → A, the
  // whistle announcing it), toots at 4 and 2 s, a warm chord at 0. The tempo never changes and the beat never
  // doubles. Offline until Damon has heard it.
  remix: {
    name: "Remix", offline: true, bpm: 86, gain: 1.5, seed: 86, boost: 7.1, swing: 0.12, space: 0.22,
    instruments: ["piano", "vibes", "fbass", "strings"],
    // Chords: bass root + a 7th/9th voicing for the felt piano (MIDI)
    prog: [{ root: 43, v: [59, 62, 66, 69] },     // Gmaj9 (B D F# A)
           { root: 42, v: [57, 62, 66, 69] },     // D/F# (bass F#)
           { root: 40, v: [55, 59, 62, 66] },     // Em9 (G B D F#)
           { root: 36, v: [59, 64, 67, 71] }],    // Cmaj7
    minorIV: { root: 36, v: [60, 63, 67, 69] },   // Cm6 — the Nintendo turn (2nd half of the C bar in A2 / the lift)
    progB: [{ root: 40, v: [55, 59, 62, 66] },    // Em9
            { root: 36, v: [59, 64, 67, 71] },    // Cmaj7
            { root: 45, v: [55, 60, 64, 67] },    // Am7
            { root: 38, v: [60, 64, 66, 69] }],   // D9 (C E F# A) → back to G
    // Melodies: [16th step in the 4 bars (0–63), MIDI note, length in 16ths]
    A: [[0, 74, 3], [3, 79, 3], [6, 83, 6], [12, 81, 2], [14, 79, 2],
        [16, 81, 6], [22, 78, 2], [24, 74, 8],
        [32, 76, 3], [35, 79, 3], [38, 83, 4], [42, 86, 2], [44, 84, 2], [46, 83, 2],
        [48, 79, 6], [54, 76, 2], [56, 79, 8]],
    A2: [[0, 74, 3], [3, 79, 3], [6, 83, 6], [12, 81, 2], [14, 79, 2],
         [16, 81, 6], [22, 78, 2], [24, 74, 8],
         [32, 76, 3], [35, 79, 3], [38, 83, 4], [42, 86, 2], [44, 84, 2], [46, 83, 2],
         [48, 79, 4], [52, 75, 4], [56, 74, 8]],                               // over the C → Cm turn: G, Eb, D
    B: [[0, 71, 8], [8, 76, 8],
        [16, 79, 12], [28, 76, 4],
        [32, 72, 8], [40, 76, 8],                                               // Am7: C, E
        [48, 86, 1], [49, 84, 1], [50, 83, 1], [51, 81, 1], [52, 79, 1], [53, 78, 1], [54, 76, 1], [55, 74, 1],
        [56, 72, 2], [58, 74, 6]],                                              // D9: the cascade into the hook
    // The answers (vibraphone) in the gaps of the hook: [step, MIDI]
    answers: { A: [[26, 78], [27, 81], [28, 86], [58, 83], [59, 86], [60, 91]], A2: [[26, 78], [27, 81], [28, 86]] },
    felt(c, out, t, n, len, vol, pan = 0) { sample(c, out, t, "piano", n, len, { vol, attack: 0.012, release: 0.35, lowpass: 1900, human: true, pan }); },
    step(c, out, s) {
      const { t, pos, p, d, bar, bars, left } = s;
      const k = Math.floor((bars - 1 - bar) / 4), inBar = 3 - ((bars - 1 - bar) % 4);
      const sec = k === 0 ? "F" : ["B", "A2", "A"][(k - 1) % 3];
      const intro = bar < 2 && sec !== "F";
      const lift = sec === "F" ? 2 : 0;
      const prog = sec === "B" ? this.progB : this.prog;
      // the C bar turns to C minor halfway in A2 and the lift
      const ch = (sec === "A2" || sec === "F") && inBar === 3 && pos >= 8 ? this.minorIV : prog[inBar];
      const next = prog[(inBar + 1) % 4];
      const root = ch.root + lift, v = ch.v.map(n => n + lift);
      const hum = () => (Math.random() - 0.5) * 0.012;                         // a few ms early or late, like a player
      // the whistle: at the start and announcing the lift; toots at 4 and 2 s left
      if (s.first || (sec === "F" && inBar === 0 && pos === 0)) THEMES.steam.whistle(c, out, t, d * 10);
      if ((left <= 4 && left + d > 4) || (left <= 2 && left + d > 2)) THEMES.steam.whistle(c, out, t, 0.35);
      // the rails, rocking softly from one speaker to the other
      const clack = sec === "F" ? 1.25 : 1;
      if (pos === 0 || pos === 2) hit(c, out, t, { vol: 0.05 * clack, dur: 0.05, hp: 180, lp: 900, pan: -0.5 });
      if (pos === 8 || pos === 10) hit(c, out, t, { vol: 0.035 * clack, dur: 0.05, hp: 250, lp: 1100, pan: 0.5 });
      if (pos === 0) kick(c, out, t, 0.1 * clack, 110);
      // intro and bridge: the felt piano breaks the chord in eighths (the Tiersen figure), the bass holds long notes
      if (intro || sec === "B") {
        if (pos === 0) this.felt(c, out, t, root + 12, d * 14, 0.2);
        if (pos % 2 === 0 && pos > 0) this.felt(c, out, t + hum(), v[[0, 1, 2, 3, 2, 1, 0][pos / 2 - 1]], d * 3, 0.1, 0.25);
        if (!intro && (pos === 0 || pos === 8)) sample(c, out, t, "fbass", root - (root > 50 ? 12 : 0) + (pos === 8 ? 7 : 0), d * 7, { vol: 0.42, release: 0.2, human: true });
        if (sec === "B" && pos === 0) v.slice(0, 3).forEach(n => sample(c, out, t, "strings", n + 12, d * 15, { vol: 0.035, attack: 0.6, release: 0.8 }));
        if (intro) return;
      } else {
        // the felt piano comps in syncopated stabs: on 1, the "and" of 2, and a short push on the "and" of 4
        if (pos === 0 || pos === 6) v.forEach((n, i) => this.felt(c, out, t + i * 0.008 + hum(), n, d * (pos === 0 ? 4 : 3), pos === 0 ? 0.13 : 0.1, -0.2));
        if (pos === 14 && inBar % 2 === 1) v.forEach((n, i) => this.felt(c, out, t + i * 0.008 + hum(), n, d * 1.5, 0.07, -0.2));
        // the finger-bass riff: root on 1, a ghost note, the octave pushed, the fifth, and an approach into the next chord
        const fb = (n, len, vol) => sample(c, out, t + hum(), "fbass", n > 50 ? n - 12 : n, d * len, { vol, release: 0.12, human: true });
        if (pos === 0) fb(root, 3, 0.5);
        if (pos === 3) fb(root, 1, 0.22);
        if (pos === 6) fb(root + 12, 2, 0.4);
        if (pos === 10) fb(root + 7, 3, 0.42);
        if (pos === 14) fb(next.root + lift + (next.root + lift > root ? -1 : 1), 2, 0.38);   // a half-step into the next root
        // drums (soft chip kit): kick on 1 and the pushed "and" of 2, snare on 2 and 4 with a ghost before 4,
        // swung closed hats, an open hat to close every other bar; a tom fill in eighths closing every 4 bars
        if (pos === 6) kick(c, out, t, 0.12, 120);
        if (pos === 4 || pos === 12) hit(c, out, t, { vol: 0.08, dur: 0.1, hp: 1500, lp: 6000, pan: 0.1 });
        if (pos === 11) hit(c, out, t, { vol: 0.02, dur: 0.05, hp: 1800, lp: 5000, pan: 0.1 });
        if (pos % 2 === 0) hit(c, out, t, { vol: pos % 4 === 2 ? 0.03 : 0.018, dur: 0.03, hp: 8500, pan: 0.35 });
        if (pos === 14 && inBar % 2 === 1) hit(c, out, t, { vol: 0.026, dur: 0.18, hp: 7000, pan: 0.35 });
        if (inBar === 3 && (pos === 12 || pos === 14)) kick(c, out, t, 0.09, pos === 12 ? 320 : 240);   // the fill
        // chip arpeggios through the chord in A2 and the lift (quiet, on the right)
        if ((sec === "A2" || sec === "F") && pos % 2 === 1) tone(c, out, t, v[(pos >> 1) % 4] + 12, d * 0.8, { type: "square", vol: 0.012, lowpass: 3800, pan: 0.45 });
        // the answers on the vibraphone, in the gaps of the hook
        for (const [at, n] of this.answers[sec === "F" ? "A2" : sec] || []) if (at === inBar * 16 + pos) sample(c, out, t, "vibes", n + lift, d * 3, { vol: 0.22, release: 0.5, human: true, pan: 0.4 });
      }
      // the strings in the lift: a soft swell under everything; a cymbal-like swell in the last 4 s
      if (sec === "F" && pos === 0) v.slice(0, 3).forEach(n => sample(c, out, t, "strings", n + 12, d * 15, { vol: 0.05, attack: 0.5, release: 0.6 }));
      if (left <= 4 && left + d > 4) hit(c, out, t, { vol: 0.045, dur: 4, hp: 2500, lp: 9000, attack: 3.8 });
      // the tune: the chip lead (or the vibraphone in the bridge). Short notes staccato; long ones slide in from a
      // half-step below with a late vibrato; a quiet echo answers from the other side
      const tune = this[sec === "F" ? "A2" : sec];
      const here = inBar * 16 + pos;
      for (const [at, n, len] of tune) {
        if (at !== here) continue;
        const note = n + lift, bright = 2600 + 2200 * p, tt = t + hum();
        if (sec === "B") { sample(c, out, tt, "vibes", note, d * Math.max(len, 2), { vol: len === 1 ? 0.2 : 0.28, release: 0.6, human: true }); continue; }
        const long = len >= 4;
        tone(c, out, tt, note, d * (long ? len * 0.95 : len * 0.6), { type: "square", vol: 0.045 * (0.92 + Math.random() * 0.16), attack: 0.008, lowpass: bright, vibrato: long ? 9 : 0, glide: long ? -1 : 0, pan: -0.1 });
        if (long) tone(c, out, tt + d * 3, note, d * Math.min(len, 6) * 0.7, { type: "square", vol: 0.012, attack: 0.01, lowpass: bright * 0.6, pan: 0.6 });
        if (sec === "F") this.felt(c, out, tt, note - 12, d * len, 0.18, -0.3);
      }
    },
    // At 0, in A: a chip run up, the whistle, and one warm Amaj9 on the felt piano and vibraphone, left to ring in the room
    ending(c, out, t) {
      [69, 73, 76, 80, 81].forEach((n, k) => tone(c, out, t + k * 0.07, n + 12, 0.18, { type: "square", vol: 0.03, lowpass: 4500, pan: (k - 2) * 0.2 }));
      const end = t + 0.35;
      THEMES.steam.whistle(c, out, end, 1.8);
      sample(c, out, end, "fbass", 33, 2.4, { vol: 0.45, release: 0.6 });
      [57, 61, 64, 68, 71].forEach((n, k) => this.felt(c, out, end + k * 0.03, n, 2.6, 0.2));
      sample(c, out, end + 0.15, "vibes", 88, 2.2, { vol: 0.2, release: 1 });
    },
  },

  // Skylight (2026-10-21) — a new theme from what was learned, not built on any of ours. Damon asked for one
  // "based not on what we have, but on your new knowledge".
  //  - One ostinato that never changes (Tiersen's left hand, Zimmer's engine): the felt piano breaking each chord
  //    in eighths at 96 bpm — calm (under ~100 bpm), but moving, never sleepy.
  //  - A signature voice (Pope: identity from one sound): a music-box vibraphone carries the tune.
  //  - The tune: groups of three over the duple beat (3+3+2), a fall, then one surprising leap up and a held note —
  //    the "rise and fall with one unusual leap" of catchy tunes. Bar 4 asks a question (A); A2 answers it (lands
  //    home). Few notes, lots of air (Jacob's Piano: simple and strong).
  //  - Harmony with a descending bass (D – C# – B – G: I – V/3 – vi – IV), warm and major; a bridge on
  //    Em – G – A – D whose last bar is a Tiersen cascade down into the theme.
  //  - Time is felt through layers (Zimmer), never through tempo: intro = piano alone; A = + the music box;
  //    A2 = + the felt piano doubling the tune below and soft strings; bridge = piano + strings, the music box rests;
  //    the last 4 bars = the tune lifted a whole step (D → E) with everything, a brush on 2 and 4, a high chime
  //    announcing it; chimes at 4 and 2 s; at 0 one quiet chord (Tiersen's way of ending).
  // Sections are counted back from the end (the lift always lands on the last 4 bars). Offline until Damon has heard it.
  skylight: {
    name: "Skylight", offline: true, bpm: 96, gain: 3.0, seed: 96, boost: 9.5, instruments: ["piano", "vibes", "strings"],
    prog: [{ root: 38, tones: [62, 66, 69] }, { root: 37, tones: [61, 64, 69] }, { root: 35, tones: [62, 66, 71] }, { root: 43, tones: [62, 67, 71] }],    // D A/C# Bm G
    progB: [{ root: 40, tones: [64, 67, 71] }, { root: 43, tones: [62, 67, 71] }, { root: 45, tones: [61, 64, 69] }, { root: 38, tones: [62, 66, 69] }],   // Em G A D
    A: [[0, 78, 3], [3, 76, 3], [6, 74, 2], [8, 81, 8],                        // D:  F#–E–D (3+3+2), up to A, held
        [16, 79, 3], [19, 78, 3], [22, 76, 2], [24, 73, 8],                     // A/C#: G–F#–E, C# held
        [32, 74, 3], [35, 76, 3], [38, 78, 2], [40, 83, 6], [46, 81, 2],        // Bm: D–E–F# rising, the leap to B, A
        [48, 79, 4], [52, 78, 4], [56, 76, 8]],                                 // G:  G–F#–E… a question
    A2: [[0, 78, 3], [3, 76, 3], [6, 74, 2], [8, 81, 8],
         [16, 79, 3], [19, 78, 3], [22, 76, 2], [24, 73, 8],
         [32, 74, 3], [35, 76, 3], [38, 78, 2], [40, 83, 6], [46, 81, 2],
         [48, 79, 3], [51, 78, 3], [54, 76, 2], [56, 74, 8]],                   // G: …answered, home on D
    B: [[0, 71, 8], [8, 79, 8],                                                 // Em: B, G
        [16, 78, 12], [28, 74, 4],                                              // G:  F# held (warm), D
        [32, 76, 8], [40, 73, 8],                                               // A:  E, C#
        [48, 86, 1], [49, 85, 1], [50, 83, 1], [51, 81, 1], [52, 79, 1], [53, 78, 1], [54, 76, 1], [55, 74, 1],
        [56, 73, 2], [58, 74, 6]],                                              // D:  the cascade, home to D
    felt(c, out, t, n, len, vol) { sample(c, out, t, "piano", n, len, { vol, attack: 0.012, release: 0.4, lowpass: 1800, human: true }); },
    box(c, out, t, n, len, vol) { sample(c, out, t, "vibes", n, len, { vol, release: 0.6, human: true }); },   // the music box
    step(c, out, s) {
      const { t, pos, d, bar, bars, left } = s;
      const k = Math.floor((bars - 1 - bar) / 4), inBar = 3 - ((bars - 1 - bar) % 4);
      const sec = k === 0 ? "F" : ["B", "A2", "A"][(k - 1) % 3];
      const intro = bar < 2 && sec !== "F";
      const lift = sec === "F" ? 2 : 0;
      const ch = (sec === "B" ? this.progB : this.prog)[inBar];
      const root = ch.root + lift, tones = ch.tones.map(n => n + lift);
      // the chime: a high music-box note announcing the last 4 bars; two more at 4 and 2 s left
      if (sec === "F" && inBar === 0 && pos === 0) { this.box(c, out, t, 88, d * 8, 0.22); this.box(c, out, t + d * 2, 95, d * 8, 0.16); }
      if ((left <= 4 && left + d > 4) || (left <= 2 && left + d > 2)) this.box(c, out, t, left > 3 ? 95 : 100, d * 6, 0.16);
      // the ostinato: the low root held, the chord broken in eighths (up, then over the top and back)
      if (pos === 0) this.felt(c, out, t, root + 12, d * 15, 0.22);
      if (pos % 2 === 0 && pos > 0) this.felt(c, out, t, [tones[0], tones[1], tones[2], tones[2] + 5, tones[2], tones[1], tones[0]][pos / 2 - 1], d * 3, 0.11);
      if (intro) return;
      // strings: a soft pad from A2 on (and in the bridge), swelling into the lift
      if ((sec === "A2" || sec === "B" || sec === "F") && pos === 0)
        tones.forEach(n => sample(c, out, t, "strings", n, d * 15, { vol: sec === "F" ? 0.08 : 0.05, attack: 0.5, release: 0.6 }));
      // a brush on 2 and 4, only in the last 4 bars (the pulse made audible at the end, not faster)
      if (sec === "F" && (pos === 4 || pos === 12)) hit(c, out, t, { vol: 0.03, dur: 0.25, hp: 2500, lp: 7000, attack: 0.03 });
      if (left <= 4 && left + d > 4) hit(c, out, t, { vol: 0.035, dur: 4, hp: 3000, attack: 3.8 });   // a soft cymbal swell
      // the tune: the music box (not in the bridge, where the felt piano sings it); in A2 and the lift the felt
      // piano doubles it an octave below
      const tune = this[sec === "F" ? "A2" : sec];
      const here = inBar * 16 + pos;
      for (const [at, n, len] of tune) {
        if (at !== here) continue;
        const note = n + lift;
        if (sec === "B") { this.felt(c, out, t, note, d * Math.max(len, 2), len === 1 ? 0.2 : 0.3); continue; }
        this.box(c, out, t, note, d * len, 0.3);
        if (sec === "A2" || sec === "F") this.felt(c, out, t, note - 12, d * len, 0.2);
      }
    },
    // At 0 (in E, the lifted key): one quiet chord on the felt piano with the music box on top, left to ring
    ending(c, out, t) {
      [40, 52, 59, 64, 68].forEach((n, k) => this.felt(c, out, t + k * 0.04, n, 3, 0.22));
      this.box(c, out, t + 0.2, 88, 2.5, 0.2);
    },
  },

  // Sunny Hills — inspired by classic Nintendo platformer music: a bouncy oom-pah (bass on 1 and 3, short chord
  // stabs on 2 and 4), a cheerful staccato square-wave melody with little grace notes, light NES-style noise drums,
  // chromatic colour chords (C–E7–F–Fm, C–A7–Dm7–G7). Ends on a quick "level clear" arpeggio.
  sunny: {
    // offline: Damon loves it but keeps it back for now ("always keep it, but we will not put it online now")
    name: "Sunny Hills", bpm: 138, gain: 0.9, seed: 91, swing: 0.1, offline: true,
    prog: [{ root: 36, tones: [60, 64, 67] }, { root: 40, tones: [59, 62, 64, 68] }, { root: 41, tones: [60, 65, 69] }, { root: 41, tones: [60, 65, 68] },
           { root: 36, tones: [60, 64, 67] }, { root: 45, tones: [61, 64, 67] }, { root: 38, tones: [60, 62, 65, 69] }, { root: 43, tones: [59, 62, 65, 67] }],
    scale: [72, 74, 76, 77, 79, 81, 84],
    step(c, out, s) {
      const { t, pos, p, chord, d, late, bar } = s;
      if (pos === 0 || pos === 8) tone(c, out, t, chord.root + (pos === 8 ? 7 : 0) + 12, d * 3, { type: "triangle", vol: 0.24 });   // oom
      if (pos === 4 || pos === 12) chord.tones.forEach(n => tone(c, out, t, n, d * 1.2, { type: "square", vol: 0.022 }));            // pah
      if (p > 0.2) {
        if (pos === 0 || pos === 8) hit(c, out, t, { vol: 0.07, dur: 0.06, hp: 300, lp: 1500 });                                  // NES-style low noise kick
        if (pos === 4 || pos === 12) hit(c, out, t, { vol: 0.07, dur: 0.07, hp: 2500, lp: 8000 });
        if (late && pos % 2 === 0) hit(c, out, t, { vol: 0.025, dur: 0.02, hp: 9000 });
      }
      if (p > 0.12) {
        const mel = melodyBar(this.seed, bar, [0, 3, 4, 6, 8, 10, 11, 12, 14], chord.tones, this.scale, 0.25);
        if (mel[pos] != null) {
          const n = mel[pos] + (late ? 12 : 0);
          if ((bar + pos) % 5 === 0) tone(c, out, t - 0.035, n - 2, 0.03, { type: "square", vol: 0.04 });                           // grace note
          tone(c, out, t, n, d * 1.1, { type: "square", vol: 0.055 });
        }
        if (late && pos % 2 === 1) tone(c, out, t, chord.tones[(pos >> 1) % chord.tones.length] + 24, d * 0.8, { type: "square", vol: 0.02 });   // sparkle arps
      }
    },
    ending(c, out, t) {
      [60, 64, 67, 72, 76, 79, 84].forEach((n, k) => tone(c, out, t + k * 0.055, n, 0.12, { type: "square", vol: 0.05 }));
      const end = t + 7 * 0.055;
      [72, 76, 79, 84].forEach(n => tone(c, out, end, n, 0.9, { type: "square", vol: 0.04 }));
      tone(c, out, end, 48, 0.9, { type: "triangle", vol: 0.26 });
      hit(c, out, end, { vol: 0.06, dur: 0.3, hp: 6000 });
    },
  },
};
// offline = kept, playable on the admin page, but not offered to players
// ── Recorded songs (2026-10-21) ─────────────────────────────────
// Three tracks Damon picked on Pixabay (by maksymmalko; Pixabay Content License: free to use in a game, no credit
// required, the files may not be sold or shared on their own). Played from the file so that the song's own ending
// lands at 0, like the Original. A song shorter than the station gets a stretch from its middle played twice (a
// loop exactly a whole number of bars long, where the sound at both ends matches: found by comparing the spectrum
// at every candidate pair); a longer one starts part-way in with a quick fade-in. song02 is only the last 100 s of
// the 4-minute original (cut at the MP3 frame level, 7.7 → 3.2 MB). Measured against the Original (LUFS-style at the
// game level): gain = the lift that makes them level with it. The last 10 seconds get a soft clock tick on every
// second, exactly when the game's timer changes (Damon: "something like clock ticking like World of Warships when
// the time runs out"). tail = seconds of the file after its final chord minus 1: the final chord lands 1 s before 0
// and rings into the end (measured from each file's last loud hit).
const FILE_SONGS = {
  cloudhopper: { name: "Cloud Hopper", url: "/music/song01.mp3", gain: 1.26, loop: [16.9, 23.134], tail: 3.6 },   // 79.6 s, 77 bpm
  joyride: { name: "Joyride", url: "/music/song02.mp3", gain: 1.22, tail: 2.5 },                                   // the last 100 s
  clearskies: { name: "Clear Skies", url: "/music/song03.mp3", gain: 1.08, loop: [28.8, 38.4], tail: 3 },
  // TURBO (Damon added it the same evening; by Alex Morgan on Pixabay): 146.9 s, only the last 100 s kept (4.7 → 3.2 MB);
  // much louder than the others (−12.4), so 0.57; it stops abruptly about 1 s before the file ends
  turbo: { name: "Turbo", url: "/music/song04.mp3", gain: 0.57, tail: 0.8 },        // 63.1 s, 100 bpm
};
const fileBuffers = {};
function loadFileSong(c, id) {
  if (!fileBuffers[id]) fileBuffers[id] = fetch(FILE_SONGS[id].url).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then(a => c.decodeAudioData(a)).catch(e => { delete fileBuffers[id]; throw e; });
  return fileBuffers[id];
}
// A clock tick: a short wooden click, "tick" and "tock" in turn
function clockTick(c, out, t, vol, tock) {
  tone(c, out, t, tock ? 89 : 94, 0.035, { type: "sine", vol, attack: 0.001 });
  hit(c, out, t, { vol: vol * 0.6, dur: 0.02, hp: 3000, lp: 9000 });
}
async function playFileSong(id, seconds, level) {
  const song = FILE_SONGS[id];
  const c = audioCtx();
  const endMs = Date.now() + seconds * 1000;                                // the end of the station, fixed
  if (c.state !== "running") {
    await new Promise(res => { const check = () => (c.state === "running" || Date.now() > endMs ? res() : setTimeout(check, 100)); check(); });
  }
  let buf;
  try { buf = await loadFileSong(c, id); } catch { return null; }
  const left = (endMs - Date.now()) / 1000;
  if (left < 3) return null;
  const out = c.createGain(); out.gain.value = level * song.gain;
  const lim = makeLimiter(c); out.connect(lim); lim.connect(speakers(c));
  const now = c.currentTime, stationEnd = now + left, end = stationEnd + (song.tail || 0);   // the file ends tail s after 0
  // the song's pieces in order: [0, loop end] + the loop again as often as needed + [loop end, the end]
  const D = buf.duration;
  let pieces = [[0, D]];
  const need = left + (song.tail || 0) + 0.5;
  if (song.loop && D < need) {
    const [ls, le] = song.loop, n = Math.ceil((need - D) / (le - ls));
    pieces = [[0, le], ...Array(n).fill([ls, le]), [le, D]];
  }
  const total = pieces.reduce((sum, [a, b]) => sum + b - a, 0);
  let at = end - total;                                                     // where the song would have started
  const XF = 0.015, sources = [];
  for (const [a, b] of pieces) {
    const st = at, en = at + (b - a); at = en;
    if (en <= now + 0.05) continue;                                         // already over
    const from = Math.max(st, now + 0.05), off = a + (from - st);
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = buf; src.connect(g); g.connect(out);
    const fadeIn = from > st + 0.001 ? 1.2 : XF;                            // a quick fade-in when starting part-way
    g.gain.setValueAtTime(0.0001, from); g.gain.linearRampToValueAtTime(1, from + fadeIn);
    if (b < D) { g.gain.setValueAtTime(1, en); g.gain.linearRampToValueAtTime(0.0001, en + XF); }   // a tiny crossfade at a join
    src.start(from, off, en - from + XF); sources.push(src);
  }
  // the clock: a tick on each of the last 10 seconds, a little louder towards 0
  for (let k = 10; k >= 1; k--) { const t = stationEnd - k; if (t > now + 0.05) clockTick(c, out, t, 0.05 + 0.05 * (1 - k / 10), k % 2 === 0); }
  return {
    endsAt: endMs,
    setLevel(v) { out.gain.setTargetAtTime(Math.max(0.0001, v * song.gain), c.currentTime, 0.1); },
    stop() {
      out.gain.setTargetAtTime(0.0001, c.currentTime, 0.08);
      sources.forEach(sr => { try { sr.stop(c.currentTime + 0.4); } catch { /* already stopped */ } });
      setTimeout(() => { try { out.disconnect(); } catch { /* gone */ } }, 600);
    },
  };
}

// The music list: the themes made here, then the recorded songs (offline = kept, playable on the admin page only)
export const THEME_LIST = [
  ...Object.entries(THEMES).map(([id, th]) => ({ id, name: th.name, offline: !!th.offline })),
  ...Object.entries(FILE_SONGS).map(([id, sg]) => ({ id, name: sg.name, offline: false })),
];

// The steady beat (Damon, 2026-10-21: the songs must not speed up or slow down). The tempo is always the theme's
// own bpm — it used to be nudged so a whole number of bars fitted the station, which made late starts up to 10%
// faster. Instead the theme starts part-way into its first bar, so its last bar still ends exactly at 0.
//   d = one 16th, total = 16ths up to the end, first = the first 16th that is played, stopAt = where the ending starts
function grid(th, seconds) {
  const d = 60 / th.bpm / 4;
  const bars = Math.max(1, Math.ceil(seconds / (16 * d)));
  const total = bars * 16;
  const first = total - Math.floor(seconds / d);
  const stopAt = (th.endsEarly ? bars - 1 : bars) * 16;
  return { d, bars, total, first: Math.min(first, stopAt), stopAt };
}
// The note information for 16th number i (see the list above the themes)
function stepInfo(th, i, g, t) {
  const pos = i % 16, bar = Math.floor(i / 16), left = (g.total - i) * g.d;
  return { t, i, bar, pos, d: g.d, p: i / g.total, chord: th.prog[bar % th.prog.length], next: th.prog[(bar + 1) % th.prog.length],
    late: left <= 10, left, bars: g.bars, first: i === g.first };
}
const swingOf = (th, pos, d) => (th.swing && pos % 4 === 2 ? d * th.swing * 2 : 0);

// async: a theme on recorded instruments first loads its samples (once)
// For measuring loudness (admin checks): schedules a whole theme at once into a given (offline) context, through the
// same master gain and compressor as playTheme. Render with c.startRendering().
export async function renderTheme(id, seconds, level, c) {
  const th = THEMES[id];
  if (th.instruments) await Promise.all(th.instruments.map(k => loadInstrument(c, k)));
  const master = c.createGain();
  master.gain.value = level * th.gain * 0.5;
  const comp = c.createDynamicsCompressor(), makeup = c.createGain(), limiter = makeLimiter(c);
  makeup.gain.value = th.boost || 1;   // per theme, measured to match the Classic song's loudness in the game
  master.connect(comp); comp.connect(makeup); makeup.connect(limiter); limiter.connect(speakers(c));
  if (th.space) { const sp = makeSpace(c, th.space); master.connect(sp.input); sp.output.connect(comp); }   // the theme's reverb
  const g = grid(th, seconds), end = 0.1 + seconds, at = i => end - (g.total - i) * g.d;   // 16th i's moment
  for (let i = g.first; i < g.stopAt; i++) th.step(c, master, stepInfo(th, i, g, at(i) + swingOf(th, i % 16, g.d)));
  th.ending(c, master, at(g.stopAt), g.d);
}

export async function playTheme(id, seconds, level, length = seconds) {
  if (FILE_SONGS[id]) return level > 0 ? playFileSong(id, seconds, level) : null;   // a recorded song
  const th = THEMES[id];
  if (!th || level <= 0) return null;
  const c = audioCtx();
  const endMs = Date.now() + seconds * 1000;   // the end of the station, fixed, whatever the waiting below takes
  // Not allowed to play yet (no click or key press on this page since it loaded, e.g. right after a refresh): wait
  // until the player's first click or key press switches the engine on; the theme then comes in where it would be
  if (c.state !== "running") {
    await new Promise(res => { const check = () => (c.state === "running" || Date.now() > endMs ? res() : setTimeout(check, 100)); check(); });
    if (endMs - Date.now() < 3000) return null;
  }
  if (th.instruments) await Promise.all(th.instruments.map(k => loadInstrument(c, k)));
  const master = c.createGain();
  master.gain.value = level * th.gain * 0.5;
  const comp = c.createDynamicsCompressor(), makeup = c.createGain(), limiter = makeLimiter(c);
  makeup.gain.value = th.boost || 1;   // per theme, measured to match the Classic song's loudness in the game
  master.connect(comp); comp.connect(makeup); makeup.connect(limiter); limiter.connect(speakers(c));
  if (th.space) { const sp = makeSpace(c, th.space); master.connect(sp.input); sp.output.connect(comp); }   // the theme's reverb

  // The theme's own steady tempo; the last 16th ends at 0 (endsEarly: the ending plays through the last bar).
  // Laid out over the WHOLE station, as if it had been playing since the start (Damon, 2026-10-21: a song chosen
  // mid-station should "resume from the same point in time", like the Original song): it comes in at the 16th it
  // would be on now, in the right part of the theme (intro, middle or final stretch).
  const g = grid(th, Math.max(length, seconds)), stopAt = g.stopAt, d = g.d;
  const end = c.currentTime + (endMs - Date.now()) / 1000, at = i => end - (g.total - i) * d;   // 16th i's moment
  let i = Math.max(g.first, Math.ceil(g.total - (end - c.currentTime - 0.05) / d));   // the first 16th still to come
  // Notes are written 2 s ahead (Damon, 2026-10-21: Pixel and Jazz "start normally and speed up"): a tab that isn't
  // in front gets its timers slowed to about once a second, and with only 0.2 s ahead the missed notes were then all
  // played at once, in a rush. A note whose moment has already passed is skipped, never rushed.
  const AHEAD = 2;
  const timer = setInterval(() => {
    while (i < stopAt && at(i) < c.currentTime + AHEAD) {
      const t = at(i) + swingOf(th, i % 16, d);
      if (t >= c.currentTime - 0.02) th.step(c, master, stepInfo(th, i, g, t));   // too late for this note: skipped, never rushed
      i++;
    }
    if (i >= stopAt) {
      clearInterval(timer);
      th.ending(c, master, at(stopAt), d);
      setTimeout(() => { try { master.disconnect(); } catch { } }, (end - c.currentTime) * 1000 + 5000);
    }
  }, 25);
  return {
    endsAt: endMs,
    setLevel(v) { master.gain.setTargetAtTime(v * th.gain * 0.5, c.currentTime, 0.1); },
    stop() {
      clearInterval(timer);
      master.gain.setTargetAtTime(0.0001, c.currentTime, 0.08);
      setTimeout(() => { try { master.disconnect(); } catch { } }, 600);
    },
  };
}
