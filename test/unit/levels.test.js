'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const LV = require('../../src/js/levels');
const config = require('../../src/js/config');

const { LEVELS, THEMES, buildLevel, validateLevel } = LV;

test('there are exactly 20 levels with sequential ids', () => {
  assert.equal(LEVELS.length, 20);
  LEVELS.forEach((l, i) => assert.equal(l.id, i + 1));
});

test('every level is valid inside the arena', () => {
  LEVELS.forEach((l) => assert.deepEqual(validateLevel(l), [], 'level ' + l.id));
});

test('every level has explicit size / zone / hold requirements', () => {
  for (const l of LEVELS) {
    assert.ok(l.target.minRadius > 0 && l.target.maxRadius > l.target.minRadius);
    assert.ok(l.zone.radius > 0 && typeof l.zone.center.x === 'number');
    assert.ok(l.holdTime > 0 && l.timeLimit > l.holdTime);
    assert.ok(l.name.zh && l.name.en);
    assert.ok(THEMES.includes(l.theme));
  }
});

test('difficulty increases from easy to hard', () => {
  const first = LEVELS[0], last = LEVELS[19];
  for (let i = 1; i < LEVELS.length; i++) {
    const a = LEVELS[i - 1], b = LEVELS[i];
    assert.ok(b.difficulty > a.difficulty);
    assert.ok(b.holdTime >= a.holdTime, 'hold time non decreasing');
    assert.ok(b.target.minRadius >= a.target.minRadius, 'min size non decreasing');
    assert.ok(b.zone.radius <= a.zone.radius + 1e-9, 'zone shrinks');
    assert.ok(b.physics.surgeLimit <= a.physics.surgeLimit + 1e-9, 'less tolerance to surges');
  }
  const width = (l) => l.target.maxRadius - l.target.minRadius;
  assert.ok(width(last) < width(first) / 2, 'size window narrows');
  const wind = (l) => Math.hypot(l.physics.wind.x, l.physics.wind.z);
  assert.ok(wind(last) > wind(first) + 0.5);
  const dist = (l) => Math.hypot(l.zone.center.x - config.spawn.x, l.zone.center.y - config.spawn.y, l.zone.center.z - config.spawn.z);
  assert.ok(dist(last) > dist(first) * 3, 'zone further from the wand');
});

test('the target size always fits below the burst radius with a safety margin', () => {
  for (const l of LEVELS) assert.ok(l.physics.burstRadius - l.target.maxRadius >= 0.35);
});

test('the required volume to reach the target size is achievable (< 0.85)', () => {
  const b = config.bubble;
  for (const l of LEVELS) {
    const mid = (l.target.minRadius + l.target.maxRadius) / 2;
    const vol = (mid - b.minRadius) / (b.radiusPerVolume * (1 + b.rhythmSizeBonus));
    assert.ok(vol < b.loudThreshold, 'level ' + l.id + ' needs volume ' + vol.toFixed(2));
  }
});

test('themes are grouped (each theme used by 4 consecutive levels)', () => {
  THEMES.forEach((th, i) => {
    assert.deepEqual(LEVELS.slice(i * 4, i * 4 + 4).map((l) => l.theme), [th, th, th, th]);
  });
});

test('validateLevel reports problems', () => {
  const bad = buildLevel({ name: { zh: 'x' }, theme: 'moon', zone: [5.8, 7.9, 0], size: [1, 0.5], hold: 5, time: 3, wind: [0, 0], drift: [0, 1, 0] }, 0, 1);
  const errs = validateLevel(bad);
  for (const s of ['bilingual', 'theme', 'size', 'arena (x)', 'arena (y)', 'timing']) {
    assert.ok(errs.some((e) => e.includes(s)), 'expected error about ' + s + ': ' + errs.join(';'));
  }
});

test('buildLevel honours explicit overrides', () => {
  const l = buildLevel({ name: { zh: 'a', en: 'a' }, theme: 'meadow', zone: [0, 3, 0], size: [0.5, 1], hold: 2, time: 30, wind: [0, 0], drift: [0, 1, 0], difficulty: 0.5, zoneRadius: 1.7, holdDecay: 9, surgeLimit: 0.5 }, 0, 1);
  assert.equal(l.difficulty, 0.5);
  assert.equal(l.zone.radius, 1.7);
  assert.equal(l.holdDecay, 9);
  assert.equal(l.physics.surgeLimit, 0.5);
});

test('registerLevel appends valid levels and rejects invalid ones', () => {
  const before = LEVELS.length;
  assert.throws(() => LV.registerLevel({ name: { zh: 'x', en: 'x' }, theme: 'meadow', zone: [9, 3, 0], size: [0.5, 1], hold: 2, time: 30, wind: [0, 0], drift: [0, 1, 0] }), /Invalid level/);
  assert.equal(LEVELS.length, before);
  const lvl = LV.registerLevel({ name: { zh: '额外', en: 'Bonus' }, theme: 'snow', zone: [0, 4, -2], size: [1.6, 2], hold: 12, time: 90, wind: [0.9, 0], drift: [1, 1, 0], difficulty: 1 });
  assert.equal(lvl.id, before + 1);
  assert.equal(LEVELS.length, before + 1);
  // restore global list for other tests in this process
  LEVELS.pop(); LV.LEVEL_SPECS.pop();
});
