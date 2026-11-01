'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { LevelEvaluator, starsFor } = require('../../src/js/levelEvaluator');
const { LEVELS } = require('../../src/js/levels');

const L = LEVELS[0];
const DT = 0.1;
const inside = () => ({ radius: (L.target.minRadius + L.target.maxRadius) / 2, pos: { ...L.zone.center } });

test('size and zone checks', () => {
  const ev = new LevelEvaluator(L);
  assert.equal(ev.checkSize(L.target.minRadius), true);
  assert.equal(ev.checkSize(L.target.maxRadius), true);
  assert.equal(ev.checkSize(L.target.minRadius - 0.01), false);
  assert.equal(ev.checkSize(L.target.maxRadius + 0.01), false);
  const c = L.zone.center;
  assert.equal(ev.checkZone(c), true);
  assert.equal(ev.checkZone({ x: c.x + L.zone.radius * 0.99, y: c.y, z: c.z }), true);
  assert.equal(ev.checkZone({ x: c.x + L.zone.radius * 1.01, y: c.y, z: c.z }), false);
});

test('holding inside the zone with the right size passes after holdTime', () => {
  const ev = new LevelEvaluator(L);
  let s;
  const steps = Math.ceil(L.holdTime / DT) + 1;
  for (let i = 0; i < steps; i++) s = ev.update(inside(), DT, true);
  assert.equal(s.passed, true);
  assert.equal(s.holdProgress, 1);
  assert.equal(s.hold, L.holdTime);
});

test('progress decays when leaving the zone or losing size', () => {
  const ev = new LevelEvaluator(L);
  for (let i = 0; i < 20; i++) ev.update(inside(), DT, true);
  const h = ev.hold;
  const s = ev.update({ radius: L.target.maxRadius * 2, pos: { ...L.zone.center } }, DT, true);
  assert.equal(s.sizeOk, false);
  assert.ok(Math.abs(ev.hold - (h - L.holdDecay * DT)) < 1e-9);
  for (let i = 0; i < 100; i++) ev.update({ radius: 1, pos: { x: 99, y: 0, z: 0 } }, DT, true);
  assert.equal(ev.hold, 0);
});

test('an attached bubble never counts as in zone', () => {
  const ev = new LevelEvaluator(L);
  const s = ev.update(inside(), DT, false);
  assert.equal(s.inZone, false);
  assert.equal(s.hold, 0);
});

test('time limit produces timedOut and freezes the evaluator', () => {
  const ev = new LevelEvaluator(L);
  let s;
  for (let t = 0; t <= L.timeLimit + 1; t += 1) s = ev.update({ radius: 0.1, pos: { x: 0, y: 0, z: 0 } }, 1, true);
  assert.equal(s.timedOut, true);
  assert.equal(s.remaining, 0);
  const e = ev.elapsed;
  ev.update(inside(), 1, true);
  assert.equal(ev.elapsed, e);
});

test('stars depend on the share of time used', () => {
  assert.equal(starsFor(10, 100), 3);
  assert.equal(starsFor(50, 100), 2);
  assert.equal(starsFor(90, 100), 1);
});
