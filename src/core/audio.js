// Small procedural (no asset files) sound system, browser-only — never
// imported by game/systems.js or game/combat.js directly, since those run
// on the Node.js multiplayer server too (see sim.onHit in main.js /
// server/rooms/GameRoom.js for how hit sounds reach here without leaking a
// browser API into the shared sim core, mirroring the existing sim.onFx
// pattern for visual effects).
let ctx = null, masterGain = null, musicGain = null, sfxGain = null, musicNodes = null;
// Solo calls playHit()/playHurt() straight from combat.js's onHit hook, once
// per damage() call — an AOE weapon connecting with a dozen enemies in one
// frame (very much the normal case once a run is a few minutes in) used to
// mean a dozen overlapping 100ms blips every frame, which reads to the ear
// as one continuous drone/buzz rather than discrete hits. Rate-limit here,
// at the single shared choke point, so it's fixed for solo's direct calls
// and multiplayer's already-per-tick-coalesced broadcast alike.
const MIN_HIT_INTERVAL = 0.06;
let lastHitAt = -Infinity, lastHurtAt = -Infinity;

function ensureCtx() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = ctx.createGain();
  musicGain = ctx.createGain();
  sfxGain = ctx.createGain();
  // A dozen overlapping hit blips plus the music drone can sum to a peak
  // above 1.0 with nothing else in the chain — the destination just clips
  // that silently, which is what "harsh"/"painful" digital distortion
  // actually sounds like. One limiter here is a single, permanent fix for
  // that regardless of how many sources happen to stack in a given frame.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8; limiter.knee.value = 6; limiter.ratio.value = 12;
  limiter.attack.value = 0.003; limiter.release.value = 0.15;
  musicGain.connect(masterGain); sfxGain.connect(masterGain); masterGain.connect(limiter); limiter.connect(ctx.destination);
  return ctx;
}

// Call from a user-gesture handler (autoplay policy) with the current
// settings.vol — see main.js's startAudioOnce().
export function initAudio(vol) {
  ensureCtx();
  if (ctx.state === 'suspended') ctx.resume();
  setMasterVolume(vol.master); setMusicVolume(vol.music); setSfxVolume(vol.sfx);
}
export function setMasterVolume(v) { if (masterGain) masterGain.gain.value = v; }
export function setMusicVolume(v) { if (musicGain) musicGain.gain.value = v; }
export function setSfxVolume(v) { if (sfxGain) sfxGain.gain.value = v; }

// Short synthesized impact blip — no sample needed, just a pitch-dropping
// square wave with a fast decay envelope.
export function playHit() {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (t - lastHitAt < MIN_HIT_INTERVAL) return;
  lastHitAt = t;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  osc.connect(gain); gain.connect(sfxGain);
  osc.start(t); osc.stop(t + 0.1);
}
// Lower, longer thud for the local/party players getting hit — distinct
// from playHit() so the two are tellable apart by ear.
export function playHurt() {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (t - lastHurtAt < MIN_HIT_INTERVAL) return;
  lastHurtAt = t;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(90, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  gain.gain.setValueAtTime(0.4, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(gain); gain.connect(sfxGain);
  osc.start(t); osc.stop(t + 0.22);
}

// Ambient placeholder "music" — a soft sustained drone (no composed track
// exists), built from a few detuned oscillators each with its own slow LFO
// on detune so the chord breathes instead of sitting perfectly static.
export function startMusic() {
  if (!ctx || musicNodes) return;
  const notes = [110, 130.81, 164.81, 196]; // A2 C3 E3 G3
  musicNodes = notes.map((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = i % 2 ? 'sine' : 'triangle';
    o.frequency.value = f;
    g.gain.value = 0.04;
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 0.05 + i * 0.02;
    lfoGain.gain.value = 2.5;
    lfo.connect(lfoGain); lfoGain.connect(o.detune);
    o.connect(g); g.connect(musicGain);
    o.start(); lfo.start();
    return { o, lfo };
  });
}
export function stopMusic() {
  if (!musicNodes) return;
  for (const n of musicNodes) { try { n.o.stop(); n.lfo.stop(); } catch (e) { /* already stopped */ } }
  musicNodes = null;
}
// Some platforms suspend the context again on window blur/minimize (not
// just before the very first gesture) — cheap to re-resume opportunistically
// on later interaction too instead of assuming the first unlock sticks forever.
export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
// Chest-open reward cue — a short ascending three-note chime, distinct in
// character from the impact blips so it reads as "reward" not "combat".
export function playReward() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
  notes.forEach((f, i) => {
    const start = t + i * 0.07;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = f;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
    osc.connect(gain); gain.connect(sfxGain);
    osc.start(start); osc.stop(start + 0.36);
  });
}
