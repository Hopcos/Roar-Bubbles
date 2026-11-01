/**
 * RoarBubbles - procedural sound effects (Web Audio, no audio files).
 * Extensible: Sfx.register('name', function (ctx, out, params) { ... }).
 */
(function (root, name, deps, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory.apply(null, deps.map(function (d) { return require('./' + d); }));
  } else {
    var ns = (root.RB = root.RB || {});
    ns[name] = factory.apply(null, deps.map(function (d) { return ns[d]; }));
  }
})(typeof self !== 'undefined' ? self : this, 'sfx', ['config', 'utils'], function (config, U) {
  'use strict';

  /** schedule one enveloped oscillator note */
  function tone(ctx, out, o) {
    var t0 = ctx.currentTime + (o.delay || 0);
    var dur = o.dur || 0.2;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + (o.bend || dur));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain || 0.2), t0 + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    return osc;
  }

  var noiseCache = null;
  function noiseBuffer(ctx) {
    if (noiseCache && noiseCache.ctx === ctx) return noiseCache.buf;
    var len = Math.floor(ctx.sampleRate * 0.6);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noiseCache = { ctx: ctx, buf: buf };
    return buf;
  }

  function noise(ctx, out, o) {
    var t0 = ctx.currentTime + (o.delay || 0);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    var filter = ctx.createBiquadFilter();
    filter.type = o.filter || 'bandpass';
    filter.frequency.setValueAtTime(o.freq || 1500, t0);
    if (o.freqEnd) filter.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.dur);
    filter.Q.value = o.q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(o.gain || 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(filter); filter.connect(g); g.connect(out);
    src.start(t0);
    src.stop(t0 + o.dur + 0.05);
    return src;
  }

  var SOUNDS = {
    /** bubbly "bloop" – lower pitch for bigger bubbles */
    grow: function (ctx, out, p) {
      var f = 700 / (0.6 + (p && p.radius || 0.3));
      tone(ctx, out, { type: 'sine', f0: f, f1: f * 1.7, bend: 0.07, dur: 0.13, gain: 0.12 });
    },
    shrink: function (ctx, out, p) {
      var f = 600 / (0.6 + (p && p.radius || 0.3));
      tone(ctx, out, { type: 'triangle', f0: f * 1.2, f1: f * 0.6, dur: 0.18, gain: 0.06 });
    },
    detach: function (ctx, out) {
      tone(ctx, out, { type: 'sine', f0: 660, f1: 990, dur: 0.12, gain: 0.12 });
      tone(ctx, out, { type: 'sine', f0: 990, f1: 1320, dur: 0.14, gain: 0.08, delay: 0.08 });
    },
    burst: function (ctx, out) {
      noise(ctx, out, { freq: 2400, freqEnd: 600, q: 0.7, dur: 0.28, gain: 0.5 });
      tone(ctx, out, { type: 'sine', f0: 180, f1: 40, dur: 0.22, gain: 0.35 });
      for (var i = 0; i < 4; i++) {
        tone(ctx, out, { type: 'sine', f0: 1800 + Math.random() * 1600, f1: 900, dur: 0.06, gain: 0.04, delay: 0.05 + i * 0.04 });
      }
    },
    escape: function (ctx, out) {
      tone(ctx, out, { type: 'sine', f0: 500, f1: 1900, bend: 1.0, dur: 1.1, gain: 0.12, attack: 0.05 });
      noise(ctx, out, { filter: 'highpass', freq: 3000, dur: 0.9, gain: 0.05 });
    },
    enterZone: function (ctx, out) {
      tone(ctx, out, { type: 'sine', f0: 880, dur: 0.35, gain: 0.1 });
      tone(ctx, out, { type: 'sine', f0: 1320, dur: 0.45, gain: 0.07, delay: 0.07 });
    },
    leaveZone: function (ctx, out) {
      tone(ctx, out, { type: 'triangle', f0: 440, f1: 330, dur: 0.2, gain: 0.07 });
    },
    pass: function (ctx, out) {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) {
        tone(ctx, out, { type: 'triangle', f0: f, dur: 0.35, gain: 0.14, delay: i * 0.11 });
        tone(ctx, out, { type: 'sine', f0: f * 2, dur: 0.25, gain: 0.04, delay: i * 0.11 + 0.02 });
      });
    },
    fail: function (ctx, out) {
      [392, 330, 262].forEach(function (f, i) {
        tone(ctx, out, { type: 'triangle', f0: f, f1: f * 0.97, dur: 0.3, gain: 0.12, delay: i * 0.16 });
      });
    },
    click: function (ctx, out) {
      tone(ctx, out, { type: 'sine', f0: 1200, f1: 800, dur: 0.05, gain: 0.06 });
    },
    countdown: function (ctx, out, p) {
      tone(ctx, out, { type: 'sine', f0: p && p.final ? 1046 : 660, dur: 0.15, gain: 0.1 });
    }
  };

  /**
   * How long (s) each sound stays audible, used by the microphone echo guard.
   * Unknown / registered sounds fall back to DEFAULT_DURATION.
   */
  var DURATIONS = { grow: 0.13, shrink: 0.18, detach: 0.22, burst: 0.3, escape: 1.1, enterZone: 0.52,
    leaveZone: 0.2, pass: 0.8, fail: 0.65, click: 0.05, countdown: 0.15 };
  var DEFAULT_DURATION = 0.5;

  function defaultContextFactory() {
    var Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    return Ctor ? new Ctor() : null;
  }

  function Sfx(options) {
    options = options || {};
    this.storage = options.storage || U.createStorage();
    this.ctxFactory = options.contextFactory || defaultContextFactory;
    this.key = config.storageKey + '.sfx';
    var saved = this.storage.get(this.key, null) || {};
    this.enabled = saved.enabled !== false;
    this.volume = typeof saved.volume === 'number' ? U.clamp01(saved.volume) : 0.8;
    this.ctx = null;
    this.master = null;
    this.sounds = Object.assign({}, SOUNDS);
    this.durations = Object.assign({}, DURATIONS);
    this.audibleUntil = 0;
  }

  Sfx.SOUNDS = SOUNDS;

  Sfx.prototype._persist = function () {
    this.storage.set(this.key, { enabled: this.enabled, volume: this.volume });
  };

  /** lazily create / resume the AudioContext (must be called from a user gesture at least once) */
  Sfx.prototype.ensure = function () {
    if (!this.ctx) {
      try { this.ctx = this.ctxFactory(); } catch (e) { this.ctx = null; }
      if (!this.ctx) return null;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended' && this.ctx.resume) { try { this.ctx.resume(); } catch (e) { /* ignore */ } }
    return this.ctx;
  };

  Sfx.prototype.setEnabled = function (on) { this.enabled = !!on; this._persist(); return this.enabled; };
  Sfx.prototype.toggle = function () { return this.setEnabled(!this.enabled); };
  Sfx.prototype.setVolume = function (v) {
    this.volume = U.clamp01(Number(v));
    if (this.master) this.master.gain.value = this.volume;
    this._persist();
  };

  /** @param {number} [duration] seconds the sound is audible (for the echo guard) */
  Sfx.prototype.register = function (soundName, fn, duration) {
    this.sounds[soundName] = fn;
    if (typeof duration === 'number') this.durations[soundName] = duration;
  };

  /** true while one of our own sounds is (still) coming out of the speakers */
  Sfx.prototype.isAudible = function () {
    if (!this.enabled || !this.ctx || this.volume <= 0) return false;
    return this.ctx.currentTime < this.audibleUntil;
  };

  /** @returns {boolean} whether the sound was scheduled */
  Sfx.prototype.play = function (soundName, params) {
    if (!this.enabled) return false;
    var fn = this.sounds[soundName];
    if (!fn) return false;
    var ctx = this.ensure();
    if (!ctx) return false;
    try { fn(ctx, this.master, params || {}); } catch (e) { return false; }
    var d = this.durations[soundName];
    this.audibleUntil = Math.max(this.audibleUntil, ctx.currentTime + (typeof d === 'number' ? d : DEFAULT_DURATION));
    return true;
  };

  return { Sfx: Sfx, SOUNDS: SOUNDS, DURATIONS: DURATIONS };
});
