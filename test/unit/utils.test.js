'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../../src/js/utils');

test('clamp / clamp01 / lerp', () => {
  assert.equal(U.clamp(5, 0, 3), 3);
  assert.equal(U.clamp(-1, 0, 3), 0);
  assert.equal(U.clamp01(0.4), 0.4);
  assert.equal(U.clamp01(2), 1);
  assert.equal(U.lerp(0, 10, 0.25), 2.5);
});

test('smoothing is frame-rate independent', () => {
  // two half steps equal one full step
  const a = U.smoothing(0.1, 0.3);
  const half = U.smoothing(0.05, 0.3);
  const twoHalf = 1 - (1 - half) * (1 - half);
  assert.ok(Math.abs(a - twoHalf) < 1e-12);
  assert.equal(U.smoothing(0.1, 0), 1);
});

test('vector helpers', () => {
  const a = U.v3(1, 2, 2);
  assert.equal(U.v3len(a), 3);
  assert.deepEqual(U.v3add(a, U.v3(1, 1, 1)), { x: 2, y: 3, z: 3 });
  assert.deepEqual(U.v3sub(a, a), { x: 0, y: 0, z: 0 });
  assert.deepEqual(U.v3scale(a, 2), { x: 2, y: 4, z: 4 });
  assert.equal(U.v3dist(U.v3(0, 0, 0), U.v3(3, 4, 0)), 5);
  assert.ok(Math.abs(U.v3len(U.v3norm(a)) - 1) < 1e-12);
  assert.deepEqual(U.v3norm(U.v3()), { x: 0, y: 0, z: 0 });
  const c = U.v3copy(a); c.x = 9; assert.equal(a.x, 1);
});

test('mean / std', () => {
  assert.equal(U.mean([]), 0);
  assert.equal(U.mean([1, 2, 3]), 2);
  assert.equal(U.std([5]), 0);
  assert.ok(Math.abs(U.std([2, 4, 4, 4, 5, 5, 7, 9]) - 2) < 1e-12);
});

test('Emitter on / off / wildcard / error isolation', () => {
  const e = new U.Emitter();
  const got = [];
  const off = e.on('a', (p) => got.push(['a', p]));
  e.on('*', (p, evt) => got.push(['*', evt]));
  e.on('a', () => { throw new Error('listener failure must not break others'); });
  const origErr = console.error; console.error = () => {};
  e.emit('a', 1);
  off();
  e.emit('a', 2);
  console.error = origErr;
  assert.deepEqual(got, [['a', 1], ['*', 'a'], ['*', 'a']]);
});

test('createStorage works with a backend, without one, and when the backend throws', () => {
  const map = new Map();
  const backend = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
  const s = U.createStorage(backend);
  s.set('x', { a: 1 });
  assert.deepEqual(s.get('x'), { a: 1 });
  assert.equal(s.get('missing', 'fb'), 'fb');

  const mem = U.createStorage(null);
  mem.set('y', [1, 2]);
  assert.deepEqual(mem.get('y'), [1, 2]);

  const broken = U.createStorage({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
  broken.set('z', 1);
  assert.equal(broken.get('z', 'fallback'), 'fallback');

  map.set('bad', '{not json');
  assert.equal(s.get('bad', 'fb'), 'fb');
});
