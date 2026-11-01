'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { VoiceAnalyzer, computeRms, rmsToDb, silentFrame } = require('../../src/js/audioAnalyzer');
const { volumeToRms, sineFrame, FLOOR_RMS } = require('../helpers/sim');

const DT = 1 / 60;

/** run a volume pattern function (t → volume) for `seconds`, return all frames */
function run(an, seconds, pattern) {
  const frames = [];
  for (let t = 0; t < seconds; t += DT) frames.push(an.processRms(volumeToRms(pattern(t)), DT));
  return frames;
}
const pulses = (period, duty = 0.5, vol = 0.5) => (t) => ((t % period) / period < duty ? vol : 0);

test('computeRms and rmsToDb', () => {
  assert.equal(computeRms(new Float32Array(0)), 0);
  assert.equal(computeRms(null), 0);
  assert.ok(Math.abs(computeRms(new Float32Array([1, -1, 1, -1])) - 1) < 1e-9);
  const s = sineFrame(0.1, 4800, 100);
  assert.ok(Math.abs(computeRms(s) - 0.1) < 1e-3);
  assert.ok(Math.abs(rmsToDb(1)) < 1e-9);
  assert.ok(Math.abs(rmsToDb(0.1) + 20) < 1e-9);
  assert.ok(rmsToDb(0) < -150);
});

test('silence produces zero volume, no activity', () => {
  const an = new VoiceAnalyzer();
  const f = run(an, 2, () => 0).pop();
  assert.ok(f.volume < 0.02);
  assert.equal(f.active, false);
  assert.equal(f.rhythm, 0);
  assert.ok(f.continuity < 0.01);
});

test('louder input gives higher volume (monotonic)', () => {
  const vols = [0.2, 0.4, 0.6, 0.8].map((v) => {
    const an = new VoiceAnalyzer();
    return run(an, 0.5, () => v).pop().volume;
  });
  for (let i = 1; i < vols.length; i++) assert.ok(vols[i] > vols[i - 1], vols.join(','));
  assert.ok(Math.abs(vols[1] - 0.4) < 0.05);
});

test('sample path (process) equals RMS path (processRms)', () => {
  const a = new VoiceAnalyzer(), b = new VoiceAnalyzer();
  for (let i = 0; i < 30; i++) {
    const rms = volumeToRms(0.5);
    const fa = a.process(sineFrame(rms, 2048, 200), DT);
    const fb = b.processRms(rms, DT);
    assert.ok(Math.abs(fa.volume - fb.volume) < 0.01);
  }
});

test('sensitivity scales the volume and is clamped', () => {
  const lo = new VoiceAnalyzer(); lo.setSensitivity(0.5);
  const hi = new VoiceAnalyzer(); hi.setSensitivity(2);
  const vLo = run(lo, 0.5, () => 0.3).pop().volume;
  const vHi = run(hi, 0.5, () => 0.3).pop().volume;
  assert.ok(vHi > vLo * 2);
  hi.setSensitivity(100); assert.equal(hi.sensitivity, 4);
  hi.setSensitivity('x'); assert.equal(hi.sensitivity, 1);
});

test('activity uses hysteresis and onsets fire on rising edges only', () => {
  const an = new VoiceAnalyzer();
  const frames = run(an, 3, pulses(0.5));
  const onsets = frames.filter((f) => f.onset).length;
  assert.equal(onsets, 6);
  assert.ok(frames.some((f) => f.active) && frames.some((f) => !f.active));
});

test('steady pulses produce a high rhythm and correct bpm', () => {
  const an = new VoiceAnalyzer();
  const f = run(an, 5, pulses(0.5)).pop();
  assert.ok(f.rhythm > 0.85, 'rhythm ' + f.rhythm);
  assert.ok(Math.abs(f.bpm - 120) < 3, 'bpm ' + f.bpm);
});

test('irregular pulses produce a low rhythm', () => {
  const an = new VoiceAnalyzer();
  const gaps = [0.2, 0.9, 0.3, 1.1, 0.25, 0.8, 0.35, 1.0, 0.22, 0.95];
  let next = 0, i = 0;
  const pattern = (t) => {
    if (t > next + gaps[i % gaps.length]) { next = t; i++; }
    return t - next < 0.12 ? 0.5 : 0;
  };
  const frames = run(an, 6, pattern);
  const maxRhythm = Math.max(...frames.slice(-120).map((f) => f.rhythm));
  assert.ok(maxRhythm < 0.4, 'rhythm ' + maxRhythm);
});

test('rhythm needs at least 3 intervals and fades after the beat stops', () => {
  const an = new VoiceAnalyzer();
  const f2 = run(an, 0.9, pulses(0.5)); // two onsets only
  assert.equal(f2.pop().rhythm, 0);
  const t0 = an.time; // continue the same beat grid
  run(an, 4, (t) => pulses(0.5)(t + t0));
  assert.ok(an.rhythm > 0.8, 'rhythm ' + an.rhythm);
  const after = run(an, 3, () => 0).pop();
  assert.ok(after.rhythm < 0.05, 'rhythm should fade, got ' + after.rhythm);
});

test('one long continuous sound kills rhythm and builds continuity + sustain', () => {
  const an = new VoiceAnalyzer();
  run(an, 4, pulses(0.5));
  const f = run(an, 4, () => 0.5).pop();
  assert.ok(f.rhythm < 0.05);
  assert.ok(f.continuity > 0.9);
  assert.ok(f.sustain > 3.5);
});

test('out-of-tempo intervals reset the rhythm history', () => {
  const an = new VoiceAnalyzer();
  const f = run(an, 6, pulses(1.8, 0.3)).pop(); // 1.8 s > maxBeatInterval
  assert.equal(f.rhythm, 0);
});

test('sudden loudness produces a surge, gentle ramps do not', () => {
  const an = new VoiceAnalyzer();
  run(an, 1, () => 0);
  const surge = Math.max(...run(an, 0.3, () => 1).map((f) => f.surge));
  assert.ok(surge > 0.8, 'surge ' + surge);

  const ramp = new VoiceAnalyzer();
  const s2 = Math.max(...run(ramp, 3, (t) => Math.min(1, t / 3)).map((f) => f.surge));
  assert.ok(s2 < 0.15, 'ramp surge ' + s2);
});

test('noise floor: adapts down quickly, creeps up slowly, calibrates fast', () => {
  const an = new VoiceAnalyzer();
  for (let i = 0; i < 60; i++) an.processRms(FLOOR_RMS / 10, DT); // 1 s of -80 dB
  assert.ok(Math.abs(an.floorDb + 80) < 0.5, 'floor ' + an.floorDb);
  const before = an.floorDb;
  run(an, 1, () => 0.6);
  assert.ok(an.floorDb - before < 1, 'floor must rise slowly');

  const cal = new VoiceAnalyzer();
  for (let i = 0; i < 90; i++) cal.observeAmbient(0.01, DT); // -40 dB room
  assert.ok(Math.abs(cal.floorDb + 40) < 1, 'calibrated floor ' + cal.floorDb);
  const f = cal.processRms(0.01, DT);
  assert.ok(f.volume < 0.05, 'room noise must read as silence after calibration');
});

test('reset keeps the floor unless hard', () => {
  const an = new VoiceAnalyzer();
  for (let i = 0; i < 90; i++) an.observeAmbient(0.01, DT);
  const fl = an.floorDb;
  an.reset();
  assert.equal(an.floorDb, fl);
  an.reset(true);
  assert.equal(an.floorDb, an.cfg.initialFloorDb);
});

test('dt is clamped and silentFrame has all fields', () => {
  const an = new VoiceAnalyzer();
  an.processRms(0.01, 10);
  assert.ok(an.time <= 0.25);
  const sf = silentFrame();
  for (const k of ['volume', 'active', 'continuity', 'sustain', 'rhythm', 'surge', 'bpm']) assert.ok(k in sf);
});

/* ---------- robustness against a "silent" but noisy room and speaker echo ---------- */
function noisyRoom(an, seconds, { meanDb = -50, varDb = 8, seed = 5 } = {}) {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const frames = [];
  for (let t = 0; t < seconds; t += DT) frames.push(an.processRms(Math.pow(10, (meanDb + (rand() * 2 - 1) * varDb) / 20), DT));
  return frames;
}

test('noise gate widens with fluctuating room noise, so the room alone never counts as sound', () => {
  const calm = new VoiceAnalyzer();
  for (let i = 0; i < 150; i++) calm.observeAmbient(Math.pow(10, -50 / 20), DT);
  noisyRoom(calm, 6, { varDb: 1 });
  assert.equal(calm.gateDb(), calm.cfg.floorMargin, 'steady noise keeps the base margin');

  const noisy = new VoiceAnalyzer();
  for (let i = 0; i < 150; i++) noisy.observeAmbient(Math.pow(10, (-50 + (i % 2 ? 9 : -9)) / 20), DT);
  assert.ok(noisy.gateDb() > noisy.cfg.floorMargin + 5, 'calibration measures fluctuation: gate ' + noisy.gateDb());
  const frames = noisyRoom(noisy, 20, { varDb: 9 });
  assert.equal(frames.filter((f) => f.onset).length, 0, 'no onsets from room noise');
  assert.ok(Math.max(...frames.map((f) => f.volume)) < noisy.cfg.activeThreshold);
  assert.ok(noisy.gateDb() <= noisy.cfg.floorMargin + noisy.cfg.maxNoiseMargin);
  // a real voice is still heard
  const voice = noisy.processRms(Math.pow(10, -20 / 20), 0.2);
  assert.ok(voice.volume > 0.3, 'voice volume ' + voice.volume);
});

test('echo guard: own sound effects cannot start a sound, a real voice still can', () => {
  const an = new VoiceAnalyzer();
  run(an, 1, () => 0);
  const echoRms = volumeToRms(0.45); // the speakers play a sfx that reads as volume 0.45
  // the game is playing a sound → guard up
  let onsets = 0;
  for (let t = 0; t < 0.3; t += DT) { an.setEchoGuard(1, DT); onsets += an.processRms(echoRms, DT).onset ? 1 : 0; }
  assert.equal(onsets, 0, 'echo did not start a sound');
  assert.ok(an.echoDb !== null && Math.abs(an.echoDb - 20 * Math.log10(echoRms)) < 3, 'echo level learned: ' + an.echoDb);
  // guard falls off with a short tail after the sfx stops
  for (let t = 0; t < 0.6; t += DT) { an.setEchoGuard(0, DT); an.processRms(FLOOR_RMS, DT); }
  assert.equal(an.echoGuard, 0);
  // next sfx: the player shouts at the same time → still detected
  let heard = false;
  for (let t = 0; t < 0.3; t += DT) { an.setEchoGuard(1, DT); heard = an.processRms(volumeToRms(0.85), DT).active || heard; }
  assert.ok(heard, 'loud player voice passes the guard');
  assert.equal(an.setEchoGuard(-3, DT) >= 0, true);
  an.reset(true);
  assert.equal(an.echoDb, null);
  assert.equal(an.echoGuard, 0);
});
