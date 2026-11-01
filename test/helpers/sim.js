/**
 * Closed-loop simulation helpers.
 *
 * A "player" is a function (snapshot, t) → volume in 0..1 (what loudness the virtual player produces now).
 * The volume is converted into a microphone RMS value (with noise) and fed into the real GameEngine,
 * whose state is fed back to the player on the next tick → closed loop.
 */
'use strict';

const config = require('../../src/js/config');
const { GameEngine } = require('../../src/js/gameEngine');
const { createStorage } = require('../../src/js/utils');

const FLOOR_RMS = 0.001; // ≈ -60 dB room noise

/** pseudo random generator with a seed, for reproducible noise */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Convert a desired normalised volume into the RMS the analyser expects (floor ≈ -60 dB). */
function volumeToRms(volume) {
  if (volume <= 0) return FLOOR_RMS;
  const db = -60 + config.audio.floorMargin + config.audio.dynamicRange * volume;
  return Math.pow(10, db / 20);
}

/** Generate a Float32Array frame of a sine wave with given RMS (to test the full sample path). */
function sineFrame(rms, n = 1024, freq = 220, sampleRate = 48000, phase = 0) {
  const a = rms * Math.SQRT2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = a * Math.sin(2 * Math.PI * freq * (i / sampleRate) + phase);
  return out;
}

/** Rhythmic, closed-loop controlled player: pulses on a beat and adapts loudness to the bubble size. */
function rhythmicPlayer(level, opts = {}) {
  const basePeriod = opts.period || 0.5;
  const duty = opts.duty || 0.55;
  const jitter = opts.jitter || 0; // relative random timing error per beat (human-like)
  const rand = rng(opts.seed || 3);
  const target = (level.target.minRadius + level.target.maxRadius) / 2;
  const b = config.bubble;
  let beatStart = 0;
  let period = basePeriod;
  return (snap, t) => {
    while (t >= beatStart + period) {
      beatStart += period;
      period = basePeriod * (1 + (rand() * 2 - 1) * jitter);
    }
    const phase = (t - beatStart) / period;
    if (phase > duty) return 0;
    const rhythm = snap.audio.rhythm;
    const r = snap.bubble.radius;
    const feedForward = (target - b.minRadius) / (b.radiusPerVolume * (1 + b.rhythmSizeBonus * rhythm));
    const v = feedForward + 0.35 * (target - r);
    // a sensible player starts gently and only blows harder once the rhythm is established
    const cap = Math.min(0.8, 0.45 + 0.4 * rhythm);
    return Math.min(cap, Math.max(0.22, v));
  };
}

/** Continuous player: one long unbroken sound at constant volume. */
function continuousPlayer(volume = 0.5) { return () => volume; }

/** Shouting player: silence then sudden maximum loudness. */
function shoutingPlayer() { return (snap, t) => (t < 1 ? 0.3 : 1); }

/** Erratic player: random on/off with random loudness. */
function erraticPlayer(seed = 7) {
  const r = rng(seed);
  let until = 0, vol = 0;
  return (snap, t) => {
    if (t >= until) { until = t + 0.08 + r() * 0.9; vol = r() < 0.5 ? 0 : 0.2 + r() * 0.6; }
    return vol;
  };
}

/** Silent player */
function silentPlayer() { return () => 0; }

/**
 * Run one level with a virtual player until it ends.
 * @returns {{passed:boolean, reason:string|null, elapsed:number, events:object, trace:Array}}
 */
function runLevel(levelIndex, player, opts = {}) {
  const dt = opts.dt || 1 / 60;
  const noise = rng(opts.seed || 42);
  const engine = opts.engine || new GameEngine({ storage: createStorage(null) });
  const events = {};
  // optional speaker echo of the game's own sfx (opts.echoDb at the mic) + the app's echo guard
  const durations = require('../../src/js/sfx').DURATIONS;
  let audibleUntil = 0;
  let t = 0;
  engine.on('*', (_p, evt) => {
    events[evt] = (events[evt] || 0) + 1;
    if (durations[evt]) audibleUntil = Math.max(audibleUntil, t + durations[evt]);
  });
  engine.loadLevel(levelIndex);
  engine.start();
  let snap = engine.snapshot();
  const trace = [];
  const maxT = (engine.level.timeLimit + 5);
  while (engine.state === 'playing' && t < maxT) {
    const vol = player(snap, t);
    const jitter = 1 + (noise() - 0.5) * 0.1;
    let rms = vol > 0 ? volumeToRms(vol) * jitter : FLOOR_RMS * (0.8 + noise() * 0.4);
    if (opts.echoDb !== undefined) {
      const audible = t < audibleUntil;
      if (audible) rms = Math.sqrt(rms * rms + Math.pow(10, opts.echoDb / 10));
      engine.analyzer.setEchoGuard(audible ? 1 : 0, dt);
    }
    snap = opts.useSamples ? engine.update(sineFrame(rms), dt) : engine.updateRms(rms, dt);
    t += dt;
    if (opts.trace && Math.round(t / dt) % 30 === 0) trace.push({ t, r: snap.bubble.radius, pos: snap.bubble.pos, rhythm: snap.audio.rhythm, hold: snap.eval && snap.eval.hold });
  }
  return {
    passed: engine.state === 'passed',
    reason: engine.failReason,
    elapsed: engine.result ? engine.result.elapsed : t,
    stars: engine.result && engine.result.stars,
    events, trace, engine
  };
}

module.exports = {
  FLOOR_RMS, rng, volumeToRms, sineFrame, runLevel,
  rhythmicPlayer, continuousPlayer, shoutingPlayer, erraticPlayer, silentPlayer
};
