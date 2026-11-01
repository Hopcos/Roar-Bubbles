/**
 * RoarBubbles - GameEngine: headless game loop / state machine.
 *
 *   idle → ready → playing → passed | failed → ready (retry / next)
 *
 * It owns the VoiceAnalyzer, the Bubble and the LevelEvaluator and only talks to the outside through
 * events, which makes it renderer-agnostic and testable in Node (closed-loop tests drive it directly).
 */
(function (root, name, deps, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory.apply(null, deps.map(function (d) { return require('./' + d); }));
  } else {
    var ns = (root.RB = root.RB || {});
    ns[name] = factory.apply(null, deps.map(function (d) { return ns[d]; }));
  }
})(typeof self !== 'undefined' ? self : this,
  'gameEngine', ['config', 'utils', 'audioAnalyzer', 'bubblePhysics', 'levels', 'levelEvaluator'],
  function (config, U, AA, BP, LV, LE) {
    'use strict';

    var STATES = { IDLE: 'idle', READY: 'ready', PLAYING: 'playing', PASSED: 'passed', FAILED: 'failed' };

    function GameEngine(options) {
      options = options || {};
      U.Emitter.call(this);
      this.levels = options.levels || LV.LEVELS;
      this.storage = options.storage || U.createStorage();
      this.analyzer = options.analyzer || new AA.VoiceAnalyzer();
      this.bubble = new BP.Bubble(options);
      this.state = STATES.IDLE;
      this.levelIndex = -1;
      this.level = null;
      this.evaluator = null;
      this.lastFrame = AA.silentFrame();
      this.lastEval = null;
      this.failReason = null;
      this.result = null;
      this.progress = this._loadProgress();
    }
    GameEngine.prototype = Object.create(U.Emitter.prototype);
    GameEngine.prototype.constructor = GameEngine;
    GameEngine.STATES = STATES;

    GameEngine.prototype._loadProgress = function () {
      var p = this.storage.get(config.storageKey + '.progress', null);
      if (!p || typeof p.unlocked !== 'number' || typeof p.stars !== 'object') p = { unlocked: 1, stars: {} };
      p.unlocked = U.clamp(Math.floor(p.unlocked), 1, this.levels.length);
      return p;
    };

    GameEngine.prototype._saveProgress = function () {
      this.storage.set(config.storageKey + '.progress', this.progress);
    };

    GameEngine.prototype.resetProgress = function () {
      this.progress = { unlocked: 1, stars: {} };
      this._saveProgress();
    };

    GameEngine.prototype.isUnlocked = function (index) {
      return index >= 0 && index < this.progress.unlocked;
    };

    GameEngine.prototype._setState = function (s) {
      var prev = this.state;
      this.state = s;
      this.emit('state', { state: s, prev: prev });
    };

    /** Prepare a level (index is 0 based). */
    GameEngine.prototype.loadLevel = function (index) {
      if (index < 0 || index >= this.levels.length) throw new RangeError('level index out of range: ' + index);
      this.levelIndex = index;
      this.level = this.levels[index];
      this.evaluator = new LE.LevelEvaluator(this.level);
      this.bubble.reset();
      this.analyzer.reset();
      this.lastFrame = AA.silentFrame();
      this.lastEval = this.evaluator.snapshot();
      this.failReason = null;
      this.result = null;
      this._wasInZone = false;
      this._wasSizeOk = false;
      this._tickRadius = this.bubble.radius;
      this._growTimer = 0;
      this._shrinkTimer = 0;
      this.emit('level', { index: index, level: this.level });
      this._setState(STATES.READY);
      return this.level;
    };

    GameEngine.prototype.start = function () {
      if (this.state !== STATES.READY) return false;
      this._setState(STATES.PLAYING);
      return true;
    };

    GameEngine.prototype.retry = function () { return this.loadLevel(this.levelIndex); };

    GameEngine.prototype.hasNext = function () { return this.levelIndex + 1 < this.levels.length; };

    GameEngine.prototype.next = function () {
      if (!this.hasNext()) return null;
      return this.loadLevel(this.levelIndex + 1);
    };

    /** Feed raw microphone samples (Float32Array) – used by the browser loop. */
    GameEngine.prototype.update = function (samples, dt) {
      if (this.state !== STATES.PLAYING) return null;
      return this.stepFrame(this.analyzer.process(samples, dt), dt);
    };

    /** Feed a linear RMS value – handy for simulations. */
    GameEngine.prototype.updateRms = function (rms, dt) {
      if (this.state !== STATES.PLAYING) return null;
      return this.stepFrame(this.analyzer.processRms(rms, dt), dt);
    };

    /** Advance one tick with an already analysed frame. */
    GameEngine.prototype.stepFrame = function (frame, dt) {
      if (this.state !== STATES.PLAYING) return null;
      var b = this.bubble;
      this.lastFrame = frame;
      var evs = b.update(frame, dt, this.level);
      for (var i = 0; i < evs.length; i++) {
        if (evs[i] === 'detach') this.emit('detach', { radius: b.radius, pos: U.v3copy(b.pos) });
      }
      if (!b.isAlive()) {
        if (b.state === BP.STATES.BURST) {
          this.emit('burst', { reason: b.burstReason, radius: b.radius, pos: U.v3copy(b.pos) });
          this._fail(b.burstReason === 'surge' ? 'burst_surge' : b.burstReason === 'stress' ? 'burst_stress' : 'burst_overinflate');
        } else {
          this.emit('escape', { radius: b.radius, pos: U.v3copy(b.pos), vel: U.v3copy(b.vel) });
          this._fail('escaped');
        }
        return this._emitFrame();
      }

      this._soundTicks(dt);

      var ev = this.evaluator.update(b, dt, b.state === BP.STATES.FLOATING);
      this.lastEval = ev;
      if (ev.inZone !== this._wasInZone) { this.emit(ev.inZone ? 'enterZone' : 'leaveZone', ev); this._wasInZone = ev.inZone; }
      if (ev.sizeOk !== this._wasSizeOk) { this.emit(ev.sizeOk ? 'sizeOk' : 'sizeLost', ev); this._wasSizeOk = ev.sizeOk; }

      if (ev.passed) this._pass();
      else if (ev.timedOut) this._fail('timeout');
      return this._emitFrame();
    };

    GameEngine.prototype._soundTicks = function (dt) {
      var c = config.events;
      var r = this.bubble.radius;
      this._growTimer += dt;
      this._shrinkTimer += dt;
      var delta = r - this._tickRadius;
      if (delta > c.tickDelta && this._growTimer >= c.growTickInterval) {
        this.emit('grow', { radius: r, delta: delta });
        this._growTimer = 0; this._tickRadius = r;
      } else if (delta < -c.tickDelta && this._shrinkTimer >= c.shrinkTickInterval) {
        this.emit('shrink', { radius: r, delta: delta });
        this._shrinkTimer = 0; this._tickRadius = r;
      }
    };

    GameEngine.prototype._emitFrame = function () {
      var snap = this.snapshot();
      this.emit('frame', snap);
      return snap;
    };

    GameEngine.prototype._pass = function () {
      var stars = LE.starsFor(this.evaluator.elapsed, this.level.timeLimit);
      var id = String(this.level.id);
      this.progress.stars[id] = Math.max(this.progress.stars[id] || 0, stars);
      this.progress.unlocked = Math.min(this.levels.length, Math.max(this.progress.unlocked, this.levelIndex + 2));
      this._saveProgress();
      this.result = { passed: true, stars: stars, elapsed: this.evaluator.elapsed };
      this.emit('pass', this.result);
      this._setState(STATES.PASSED);
    };

    GameEngine.prototype._fail = function (reason) {
      this.failReason = reason;
      this.result = { passed: false, reason: reason, elapsed: this.evaluator.elapsed };
      this.emit('fail', this.result);
      this._setState(STATES.FAILED);
    };

    GameEngine.prototype.snapshot = function () {
      var b = this.bubble;
      return {
        state: this.state,
        levelIndex: this.levelIndex,
        audio: this.lastFrame,
        bubble: {
          state: b.state, radius: b.radius, pos: U.v3copy(b.pos), vel: U.v3copy(b.vel), stress: b.stress,
          burstRadius: this.level ? b.burstRadius(this.level, this.lastFrame.rhythm) : 0
        },
        eval: this.lastEval
      };
    };

    return { GameEngine: GameEngine, STATES: STATES };
  });
