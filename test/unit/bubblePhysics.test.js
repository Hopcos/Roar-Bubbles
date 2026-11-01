'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Bubble, STATES, windAt } = require('../../src/js/bubblePhysics');
const { LEVELS } = require('../../src/js/levels');
const config = require('../../src/js/config');

const DT = 1 / 60;
const L1 = LEVELS[0];
const calm = { ...L1, physics: { ...L1.physics, wind: { x: 0, y: 0, z: 0 }, gust: 0 } };

function frame(over) {
  return Object.assign({ volume: 0, active: false, continuity: 0, sustain: 0, rhythm: 0, surge: 0 }, over);
}
function step(b, f, seconds, level = calm) {
  const evs = [];
  for (let t = 0; t < seconds && b.isAlive(); t += DT) evs.push(...b.update(frame(f), DT, level));
  return evs;
}
function floating(level = calm) {
  const b = new Bubble();
  step(b, { volume: 0.3, active: true }, 1, level);
  assert.equal(b.state, STATES.FLOATING);
  return b;
}

test('starts attached at the wand', () => {
  const b = new Bubble();
  assert.equal(b.state, STATES.ATTACHED);
  assert.deepEqual(b.pos, config.spawn);
  assert.equal(b.radius, config.bubble.startRadius);
});

test('louder sound → bigger bubble', () => {
  const sizes = [0.2, 0.35, 0.5].map((v) => { const b = new Bubble(); step(b, { volume: v, active: true, continuity: 1 }, 4); return b.radius; });
  assert.ok(sizes[0] < sizes[1] && sizes[1] < sizes[2], sizes.join(','));
  assert.ok(Math.abs(sizes[1] - (config.bubble.minRadius + 0.35 * config.bubble.radiusPerVolume)) < 0.1);
});

test('detaches from the wand at detachRadius and emits detach once', () => {
  const b = new Bubble();
  const evs = step(b, { volume: 0.3, active: true }, 2);
  assert.deepEqual(evs.filter((e) => e === 'detach'), ['detach']);
  assert.equal(b.state, STATES.FLOATING);
});

test('silence shrinks the bubble, continuity protects it', () => {
  const a = floating(); const r0 = a.radius;
  step(a, { continuity: 0 }, 1);
  assert.ok(a.radius < r0 - 0.2);

  const b = floating(); const r1 = b.radius;
  step(b, { continuity: 0.95 }, 1);
  assert.ok(r1 - b.radius < 0.03, 'continuity should keep the size');
});

test('rhythm also protects against shrinking and enlarges the target size', () => {
  const a = floating(); const r0 = a.radius;
  step(a, { rhythm: 1 }, 1);
  assert.ok(r0 - a.radius < 0.12);
  const plain = new Bubble(); step(plain, { volume: 0.5, active: true, continuity: 1 }, 4);
  const rhy = new Bubble(); step(rhy, { volume: 0.5, active: true, continuity: 1, rhythm: 1 }, 4);
  assert.ok(rhy.radius > plain.radius + 0.3);
});

test('never shrinks below minRadius', () => {
  const b = floating();
  step(b, {}, 10);
  assert.ok(b.radius >= config.bubble.minRadius);
});

test('sudden surge bursts the bubble; rhythm raises the surge limit', () => {
  const b = floating();
  step(b, { volume: 0.5, active: true, surge: 0.95 }, 0.1);
  assert.equal(b.state, STATES.BURST);
  assert.equal(b.burstReason, 'surge');

  const r = floating();
  step(r, { volume: 0.5, active: true, surge: 0.95, rhythm: 1 }, 0.1);
  assert.notEqual(r.state, STATES.BURST);
});

test('constant loud sound builds stress and bursts', () => {
  const b = floating();
  const evs = step(b, { volume: 1, active: true, continuity: 1 }, 5);
  assert.ok(evs.includes('burst'));
  assert.ok(['stress', 'overinflate'].includes(b.burstReason));
});

test('stress decays when calm', () => {
  const b = floating();
  b.stress = 0.8;
  step(b, { volume: 0.2, active: true, continuity: 1 }, 1);
  assert.ok(b.stress < 0.5);
});

test('overinflating past the burst radius bursts; rhythm extends the limit', () => {
  const lvl = { ...calm, physics: { ...calm.physics, burstRadius: 1.0 } };
  const b = floating(lvl);
  b.radius = 1.01;
  step(b, { volume: 0.3, active: true, continuity: 1 }, DT, lvl);
  assert.equal(b.burstReason, 'overinflate');

  const r = floating(lvl);
  r.radius = 1.01;
  r.update(frame({ volume: 0.3, active: true, continuity: 1, rhythm: 1 }), DT, lvl);
  assert.notEqual(r.state, STATES.BURST);
  assert.ok(r.burstRadius(lvl, 1) > r.burstRadius(lvl, 0));
});

test('long continuous sound drifts the bubble out of the arena (escape)', () => {
  const b = floating();
  const evs = step(b, { volume: 0.3, active: true, continuity: 1, sustain: 4 }, 20);
  assert.ok(evs.includes('escape'));
  assert.equal(b.state, STATES.ESCAPED);
});

test('strong rhythm guides the bubble into the zone even with wind', () => {
  const windy = LEVELS[15];
  const b = floating(windy);
  step(b, { volume: 0.3, active: true, continuity: 0.5, rhythm: 0.95 }, 12, windy);
  assert.ok(b.isAlive());
  const d = Math.hypot(b.pos.x - windy.zone.center.x, b.pos.y - windy.zone.center.y, b.pos.z - windy.zone.center.z);
  assert.ok(d < windy.zone.radius, 'distance to zone ' + d.toFixed(2));
});

test('without rhythm, wind pushes the bubble off its course', () => {
  const windy = LEVELS[15];
  const b = floating(windy);
  step(b, { volume: 0.3, active: true, continuity: 0.5 }, 6, windy);
  const d = Math.hypot(b.pos.x - windy.zone.center.x, b.pos.z - windy.zone.center.z);
  assert.ok(!b.isAlive() || d > windy.zone.radius);
});

test('bubble never goes below the ground', () => {
  const b = floating();
  step(b, {}, 8);
  assert.ok(b.pos.y >= b.radius - 1e-9);
});

test('dead bubbles ignore updates and reset revives', () => {
  const b = floating();
  b.state = STATES.BURST;
  assert.deepEqual(b.update(frame({ volume: 1, active: true }), DT, calm), []);
  b.reset();
  assert.equal(b.state, STATES.ATTACHED);
  assert.equal(b.stress, 0);
});

test('windAt is deterministic and zero without wind', () => {
  assert.deepEqual(windAt({ wind: { x: 0, y: 0, z: 0 }, gust: 0 }, 3), { x: 0, y: 0, z: 0 });
  const p = LEVELS[19].physics;
  assert.deepEqual(windAt(p, 1.5), windAt(p, 1.5));
  assert.notDeepEqual(windAt(p, 1.5), windAt(p, 2.5));
  assert.deepEqual(windAt({}, 1), { x: 0, y: 0, z: 0 });
});
