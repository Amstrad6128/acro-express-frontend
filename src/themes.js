// Writing-time music made in the browser (Damon, 2026-10-20). No audio files: a small step sequencer with Web
// Audio oscillators and noise. Every theme knows the station's length: the tempo is nudged so a whole number of
// bars fits, it builds up as the time runs out, and it ends exactly at 0. Melodies are generated from a fixed
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
// playTheme(id, seconds, level) → Promise of { stop(), setLevel(level), endsAt (ms timestamp) }

let ctx = null;
function audioCtx() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume().catch(() => { });
  return ctx;
}
// Browsers only let a page make sound after the player clicked or typed, and the sound engine must be switched on
// during such a click. A station starts from the server, not from a click, so App.jsx calls this on every click and
// key press (2026-10-20: the music was silent in a real game because of this; the admin page worked because there
// every song started with a click).
export function unlockAudio() { try { audioCtx(); } catch { /* no sound available */ } }
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

// A note: oscillator (+ optional vibrato) → (lowpass) → envelope → out
function tone(c, out, t, midi, dur, { type = "sine", vol = 0.2, attack = 0.005, detune = 0, lowpass = null, vibrato = 0, tremolo = 0 } = {}) {
  const o = c.createOscillator();
  o.type = type; o.frequency.setValueAtTime(hz(midi), t); o.detune.value = detune;
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
  g.connect(out);
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
function hit(c, out, t, { vol = 0.1, dur = 0.05, hp = 7000, lp = null, attack = 0 } = {}) {
  const s = c.createBufferSource(); s.buffer = noise(c);
  const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
  s.connect(f);
  let node = f;
  if (lp) { const f2 = c.createBiquadFilter(); f2.type = "lowpass"; f2.frequency.value = lp; f.connect(f2); node = f2; }
  const g = c.createGain();
  if (attack > 0) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); }
  else g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
  node.connect(g); g.connect(out);
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
function sample(c, out, t, key, midi, dur, { vol = 0.3, attack = 0.004, release = 0.15, lowpass = null, human = false, offset = 0 } = {}) {
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
  node.connect(g); g.connect(out);
  src.start(t, offset); src.stop(t + dur + release + 0.05);   // offset: start from a later point in the recording
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
const THEMES = {
  // Chiptune: square lead, arpeggios, triangle bass, 8-bit drums. I–V–vi–IV in C.
  chiptune: {
    // "Pixel": was "Chiptune" (Damon: "chip and cheap are similar words")
    name: "Pixel", bpm: 132, gain: 0.9, seed: 7, boost: 3.5,
    prog: [{ root: 36, tones: [60, 64, 67] }, { root: 43, tones: [59, 62, 67] }, { root: 45, tones: [60, 64, 69] }, { root: 41, tones: [60, 65, 69] }],
    scale: [72, 74, 76, 79, 81, 84],
    step(c, out, s) {
      const { t, pos, p, chord, d, bar, left } = s;
      if (pos % 2 === 0) tone(c, out, t, chord.root + (pos % 4 === 2 ? 12 : 0) + 12, d * 1.7, { type: "triangle", vol: 0.22 });
      if (p > 0.12) tone(c, out, t, chord.tones[pos % 3] + 12, d * 0.9, { type: "square", vol: 0.035 });
      if (p > 0.25) {
        // final stretch: a kick on every beat from 15 s left, 16th hats; a soft snare roll building in the last 4 s
        if (pos === 0 || pos === 8 || (p > 0.6 && pos === 10) || (left <= 15 && pos % 4 === 0)) kick(c, out, t, 0.42);
        if (pos === 4 || pos === 12) hit(c, out, t, { vol: 0.14, dur: 0.11, hp: 1500, lp: 6500 });
        if (pos % 2 === 0 || left <= 15) hit(c, out, t, { vol: 0.035, dur: 0.03, hp: 8500 });
        if (left <= 4) hit(c, out, t, { vol: 0.02 + 0.06 * (1 - left / 4), dur: 0.06, hp: 1500, lp: 6000 });
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
        if (pos === 4 || pos === 12 || (B && pos % 2 === 0) || (left <= 12 && pos % 2 === 0) || (left <= 6)) hit(c, out, t, { vol: left <= 6 ? 0.016 : 0.02, dur: 0.05, hp: 5000, lp: 8000, attack: 0.008 });
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
    name: "Jazz", bpm: 148, gain: 0.95, boost: 5.25, seed: 33, swing: 0.33, endsEarly: true,
    prog: [{ root: 36, tones: [52, 55, 57, 60] }, { root: 45, tones: [55, 57, 61, 64] }, { root: 38, tones: [53, 57, 60, 62] }, { root: 43, tones: [53, 55, 59, 62] }],
    scale: [72, 74, 75, 76, 79, 81, 84],
    step(c, out, s) {
      const { t, pos, p, chord, d, bar, next, left } = s;
      const late = left <= 8;
      if (pos % 4 === 0) {                                          // walking bass: root, third, fifth, approach note
        const beat = pos / 4;
        const n = beat === 0 ? chord.root : beat === 1 ? chord.root + 4 : beat === 2 ? chord.root + 7 : next.root + (next.root > chord.root ? -1 : 1);
        tone(c, out, t, n, d * (left <= 8 ? 1.8 : 3.6), { type: "triangle", vol: 0.3, lowpass: 900 });
      }
      // final stretch: from 8 s left the bass doubles up into 8ths (an octave above, in between)
      if (left <= 8 && pos % 4 === 2) tone(c, out, t, chord.root + 12, d * 1.8, { type: "triangle", vol: 0.2, lowpass: 900 });
      if (p > 0.08 && (pos === 0 || pos === 6 || (p > 0.55 && pos === 14)))   // Charleston-style piano stabs
        chord.tones.forEach(n => tone(c, out, t, n + 12, 0.16, { type: "triangle", vol: 0.04, lowpass: 3200 }));
      if (p > 0.2) {
        if ([0, 4, 6, 8, 12, 14].includes(pos) || (left <= 15 && pos % 2 === 0)) hit(c, out, t, { vol: pos % 4 === 0 ? 0.045 : 0.03, dur: 0.22, hp: 6000 });   // ride (every 8th from 15 s left)
        if (pos === 4 || pos === 12) hit(c, out, t, { vol: 0.04, dur: 0.03, hp: 7500 });                                    // hi-hat foot
        if (pos % 4 === 0) kick(c, out, t, 0.14);                                                                           // feathered kick
        if (left <= 4 ? true : (late && pos % 2 === 0)) hit(c, out, t, { vol: left <= 4 ? 0.03 + 0.05 * (1 - left / 4) : 0.05, dur: 0.08, hp: 1800, lp: 5000 });   // brushes pick up, then build
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
    name: "Steam", bpm: 118, gain: 1.35, boost: 5.3, seed: 1825, swing: 0.3,   // louder (Damon: "maybe too low in volume")
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
      if (pos === 0 && bar % 16 === 0) this.whistle(c, out, t, d * 12);
      // (No steam any more. Damon: "Just lose the steam … It kills the whole song" — the synthesized puffs and then a
      // recorded breath, steady or irregular, all sounded unnatural. The breath_noise samples stay, unused.)
      // clickety-clack: two soft low thumps on the rails, then a lighter pair halfway through the bar; from 15 s left
      // the wheels clack twice as often, harder from 7 s left
      if (pos === 0 || pos === 2) kick(c, out, t, 0.12, 110);
      if (pos === 8 || pos === 10) kick(c, out, t, 0.06, 150);
      if (left <= 15 && (pos === 4 || pos === 6 || pos === 12 || pos === 14)) kick(c, out, t, left <= 7 ? 0.07 : 0.045, 150);
      // final stretch, boogie piano: soft off-beat chord stabs from 15 s left, steady 8ths from 6 s left
      if (left <= 15 && (left <= 6 ? pos % 2 === 0 : pos % 4 === 2))
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
        tone(c, out, t, chord.root + steps[pos / 2], d * 1.8, { type: "triangle", vol: 0.14, attack: 0.01, lowpass: 800 });
      }
      if (left <= 6 && pos % 4 === 3) tone(c, out, t, chord.root + 12, d * 0.9, { type: "triangle", vol: 0.09, attack: 0.008, lowpass: 900 });   // quick pickups
      // a mellow chiptune-like melody (a soft square with the edges filtered off)
      if (p > 0.33) {
        const mel = melodyBar(this.seed, bar, [0, 3, 6, 8, 11, 14], chord.tones, this.scale, 0.3);
        if (mel[pos] != null) tone(c, out, t, mel[pos] + (late ? 12 : 0), d * 2, { type: "square", vol: 0.022, attack: 0.012, lowpass: 2000 });
      }
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
export const THEME_LIST = Object.entries(THEMES).map(([id, th]) => ({ id, name: th.name, offline: !!th.offline }));

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
  master.connect(comp); comp.connect(makeup); makeup.connect(limiter); limiter.connect(c.destination);
  const bars = Math.max(2, Math.round(seconds * th.bpm / 60 / 4));
  const barDur = seconds / bars, d = barDur / 16, total = bars * 16;
  const stopAt = (th.endsEarly ? bars - 1 : bars) * 16, t0 = 0.1;
  for (let i = 0; i < stopAt; i++) {
    const pos = i % 16, bar = Math.floor(i / 16);
    const swingDelay = th.swing && pos % 4 === 2 ? d * th.swing * 2 : 0;
    th.step(c, master, { t: t0 + i * d + swingDelay, i, bar, pos, d, p: i / total, chord: th.prog[bar % th.prog.length],
      next: th.prog[(bar + 1) % th.prog.length], late: (total - i) * d <= 10, left: (total - i) * d, bars });
  }
  th.ending(c, master, t0 + stopAt * d, d);
}

export async function playTheme(id, seconds, level) {
  const th = THEMES[id];
  if (!th || level <= 0) return null;
  const c = audioCtx();
  if (th.instruments) await Promise.all(th.instruments.map(k => loadInstrument(c, k)));
  const master = c.createGain();
  master.gain.value = level * th.gain * 0.5;
  const comp = c.createDynamicsCompressor(), makeup = c.createGain(), limiter = makeLimiter(c);
  makeup.gain.value = th.boost || 1;   // per theme, measured to match the Classic song's loudness in the game
  master.connect(comp); comp.connect(makeup); makeup.connect(limiter); limiter.connect(c.destination);

  // A whole number of bars in the station: the tempo moves a little so the last bar ends at 0
  const bars = Math.max(2, Math.round(seconds * th.bpm / 60 / 4));
  const barDur = seconds / bars, d = barDur / 16, total = bars * 16;
  // endsEarly: the ending plays through the last bar (its last note at 0); otherwise it starts at 0
  const stopAt = (th.endsEarly ? bars - 1 : bars) * 16;
  const t0 = c.currentTime + 0.1;
  let i = 0;
  const timer = setInterval(() => {
    while (i < stopAt && t0 + i * d < c.currentTime + 0.2) {
      const pos = i % 16, bar = Math.floor(i / 16);
      const swingDelay = th.swing && pos % 4 === 2 ? d * th.swing * 2 : 0;
      th.step(c, master, {
        t: t0 + i * d + swingDelay, i, bar, pos, d, p: i / total,
        chord: th.prog[bar % th.prog.length], next: th.prog[(bar + 1) % th.prog.length],
        late: (total - i) * d <= 10,
        left: (total - i) * d, bars,                                 // seconds left: every theme picks up in its final stretch
      });
      i++;
    }
    if (i >= stopAt) {
      clearInterval(timer);
      th.ending(c, master, t0 + stopAt * d, d);
      setTimeout(() => { try { master.disconnect(); } catch { } }, (seconds - (c.currentTime - t0)) * 1000 + 5000);
    }
  }, 25);
  return {
    endsAt: Date.now() + (seconds + 0.1) * 1000,
    setLevel(v) { master.gain.setTargetAtTime(v * th.gain * 0.5, c.currentTime, 0.1); },
    stop() {
      clearInterval(timer);
      master.gain.setTargetAtTime(0.0001, c.currentTime, 0.08);
      setTimeout(() => { try { master.disconnect(); } catch { } }, 600);
    },
  };
}
