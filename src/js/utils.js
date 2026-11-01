/**
 * RoarBubbles - small, dependency free helpers (math, vectors, events, storage).
 */
(function (root, name, deps, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory.apply(null, deps.map(function (d) { return require('./' + d); }));
  } else {
    var ns = (root.RB = root.RB || {});
    ns[name] = factory.apply(null, deps.map(function (d) { return ns[d]; }));
  }
})(typeof self !== 'undefined' ? self : this, 'utils', [], function () {
  'use strict';

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function clamp01(v) { return clamp(v, 0, 1); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  /** frame-rate independent exponential smoothing factor */
  function smoothing(dt, tau) { return tau <= 0 ? 1 : 1 - Math.exp(-dt / tau); }

  function v3(x, y, z) { return { x: x || 0, y: y || 0, z: z || 0 }; }
  function v3copy(a) { return { x: a.x, y: a.y, z: a.z }; }
  function v3add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  function v3sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function v3scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
  function v3len(a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
  function v3dist(a, b) { return v3len(v3sub(a, b)); }
  function v3norm(a) { var l = v3len(a); return l > 1e-9 ? v3scale(a, 1 / l) : v3(0, 0, 0); }

  function mean(arr) {
    if (!arr.length) return 0;
    var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }
  function std(arr) {
    if (arr.length < 2) return 0;
    var m = mean(arr), s = 0;
    for (var i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
    return Math.sqrt(s / arr.length);
  }

  /** Minimal event emitter */
  function Emitter() { this._h = {}; }
  Emitter.prototype.on = function (evt, fn) {
    (this._h[evt] = this._h[evt] || []).push(fn);
    var self = this;
    return function off() { self.off(evt, fn); };
  };
  Emitter.prototype.off = function (evt, fn) {
    var list = this._h[evt]; if (!list) return;
    var i = list.indexOf(fn); if (i >= 0) list.splice(i, 1);
  };
  Emitter.prototype.emit = function (evt, payload) {
    var list = (this._h[evt] || []).slice().concat(this._h['*'] || []);
    for (var i = 0; i < list.length; i++) {
      try { list[i](payload, evt); } catch (e) { if (typeof console !== 'undefined') console.error(e); }
    }
  };

  /** Safe key/value storage (localStorage may throw in private mode or be absent in tests). */
  function createStorage(backend) {
    var mem = {};
    var store = backend;
    if (store === undefined) {
      try { store = typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { store = null; }
    }
    return {
      get: function (key, fallback) {
        try {
          var raw = store ? store.getItem(key) : mem[key];
          if (raw === null || raw === undefined) return fallback;
          return JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set: function (key, value) {
        var raw = JSON.stringify(value);
        try { if (store) store.setItem(key, raw); else mem[key] = raw; } catch (e) { mem[key] = raw; }
      }
    };
  }

  return {
    clamp: clamp, clamp01: clamp01, lerp: lerp, smoothing: smoothing,
    v3: v3, v3copy: v3copy, v3add: v3add, v3sub: v3sub, v3scale: v3scale,
    v3len: v3len, v3dist: v3dist, v3norm: v3norm,
    mean: mean, std: std,
    Emitter: Emitter, createStorage: createStorage
  };
});
