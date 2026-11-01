'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { GameEngine, STATES } = require('../../src/js/gameEngine');
const { createStorage } = require('../../src/js/utils');
const config = require('../../src/js/config');
const { volumeToRms, FLOOR_RMS } = require('../helpers/sim');

const DT = 1 / 60;
const newEngine = (storage) => new GameEngine({ storage: storage || createStorage(null) });

test('state machine: idle → ready → playing', () => {
  const e = newEngine();
  const states = [];
  e.on('state', (s) => states.push(s.state));
  assert.equal(e.state, STATES.IDLE);
  assert.equal(e.start(), false, 'cannot start without a level');
  e.loadLevel(0);
  assert.equal(e.state, STATES.READY);
  assert.equal(e.update(new Float32Array(16), DT), null, 'no update while ready');
  assert.equal(e.start(), true);
  assert.equal(e.state, STATES.PLAYING);
  assert.deepEqual(states, ['ready', 'playing']);
});

test('loadLevel validates the index', () => {
  const e = newEngine();
  assert.throws(() => e.loadLevel(-1), RangeError);
  assert.throws(() => e.loadLevel(20), RangeError);
});

test('emits grow, detach, then burst + fail(burst_*) on a sudden shout', () => {
  const e = newEngine();
  const seen = [];
  e.on('*', (_p, evt) => seen.push(evt));
  e.loadLevel(19); e.start();
  for (let i = 0; i < 90; i++) e.updateRms(volumeToRms(0.3), DT);
  for (let i = 0; i < 30 && e.state === STATES.PLAYING; i++) e.updateRms(FLOOR_RMS, DT);
  for (let i = 0; i < 60 && e.state === STATES.PLAYING; i++) e.updateRms(volumeToRms(1), DT);
  assert.ok(seen.includes('grow'));
  assert.ok(seen.includes('detach'));
  assert.ok(seen.includes('burst'));
  assert.equal(e.state, STATES.FAILED);
  assert.match(e.failReason, /^burst_/);
  assert.ok(seen.indexOf('detach') < seen.indexOf('burst'));
});

test('shrink events fire when going quiet', () => {
  const e = newEngine();
  let shrinks = 0;
  e.on('shrink', () => shrinks++);
  e.loadLevel(0); e.start();
  for (let i = 0; i < 120; i++) e.updateRms(volumeToRms(0.35), DT);
  for (let i = 0; i < 120 && e.state === STATES.PLAYING; i++) e.updateRms(FLOOR_RMS, DT);
  assert.ok(shrinks > 0);
});

test('timeout when nothing happens', () => {
  const e = newEngine();
  e.loadLevel(0); e.start();
  let res;
  e.on('fail', (r) => { res = r; });
  for (let t = 0; t < e.level.timeLimit + 1 && e.state === STATES.PLAYING; t += 0.1) e.updateRms(FLOOR_RMS, 0.1);
  assert.equal(e.state, STATES.FAILED);
  assert.equal(res.reason, 'timeout');
});

test('stepFrame passing a level unlocks the next one and stores stars', () => {
  const storage = createStorage(null);
  const e = newEngine(storage);
  e.loadLevel(0); e.start();
  const L = e.level;
  // force the bubble into a perfect state, then step with a calm rhythmic frame
  e.bubble.state = 'floating';
  e.bubble.radius = (L.target.minRadius + L.target.maxRadius) / 2;
  e.bubble.pos = { ...L.zone.center };
  const frame = { volume: 0.3, active: true, continuity: 0.6, sustain: 0.2, rhythm: 1, surge: 0 };
  let passEvt = null; const events = [];
  e.on('pass', (r) => { passEvt = r; });
  e.on('*', (_p, evt) => events.push(evt));
  for (let i = 0; i < 600 && e.state === STATES.PLAYING; i++) {
    e.bubble.radius = (L.target.minRadius + L.target.maxRadius) / 2;
    e.stepFrame(frame, DT);
  }
  assert.equal(e.state, STATES.PASSED);
  assert.equal(passEvt.stars, 3);
  assert.ok(events.indexOf('enterZone') < events.indexOf('pass'));
  assert.ok(events.includes('sizeOk'));
  assert.equal(e.progress.unlocked, 2);
  assert.equal(e.isUnlocked(1), true);
  assert.equal(e.isUnlocked(2), false);
  assert.equal(e.hasNext(), true);

  // persisted
  const again = newEngine(storage);
  assert.equal(again.progress.unlocked, 2);
  assert.equal(again.progress.stars['1'], 3);

  // next / retry
  assert.equal(e.next().id, 2);
  assert.equal(e.state, STATES.READY);
  assert.equal(e.retry().id, 2);
  e.resetProgress();
  assert.equal(e.progress.unlocked, 1);
  assert.equal(newEngine(storage).progress.unlocked, 1);
});

test('next() returns null on the last level', () => {
  const e = newEngine();
  e.loadLevel(19);
  assert.equal(e.hasNext(), false);
  assert.equal(e.next(), null);
});

test('corrupted progress in storage is repaired', () => {
  const storage = createStorage(null);
  storage.set(config.storageKey + '.progress', { unlocked: 999, stars: {} });
  assert.equal(newEngine(storage).progress.unlocked, 20);
  storage.set(config.storageKey + '.progress', 'garbage');
  assert.equal(newEngine(storage).progress.unlocked, 1);
});

test('snapshot exposes everything the HUD needs', () => {
  const e = newEngine();
  e.loadLevel(3); e.start();
  const s = e.updateRms(volumeToRms(0.3), DT);
  for (const k of ['state', 'levelIndex', 'audio', 'bubble', 'eval']) assert.ok(k in s);
  for (const k of ['radius', 'pos', 'stress', 'burstRadius', 'state']) assert.ok(k in s.bubble);
  assert.ok(s.bubble.burstRadius >= e.level.physics.burstRadius);
});

test('loadLevel resets bubble, evaluator and result', () => {
  const e = newEngine();
  e.loadLevel(0); e.start();
  for (let i = 0; i < 60; i++) e.updateRms(volumeToRms(0.4), DT);
  e.retry();
  assert.equal(e.bubble.radius, config.bubble.startRadius);
  assert.equal(e.lastEval.hold, 0);
  assert.equal(e.result, null);
  assert.equal(e.failReason, null);
});
