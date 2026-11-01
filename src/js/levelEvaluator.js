/**
 * RoarBubbles - LevelEvaluator: checks the pass conditions (size window + zone + hold time + time limit).
 */
(function (root, name, deps, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory.apply(null, deps.map(function (d) { return require('./' + d); }));
  } else {
    var ns = (root.RB = root.RB || {});
    ns[name] = factory.apply(null, deps.map(function (d) { return ns[d]; }));
  }
})(typeof self !== 'undefined' ? self : this, 'levelEvaluator', ['config', 'utils'], function (config, U) {
  'use strict';

  function LevelEvaluator(level) {
    this.level = level;
    this.reset();
  }

  LevelEvaluator.prototype.reset = function () {
    this.hold = 0;
    this.elapsed = 0;
    this.inZone = false;
    this.sizeOk = false;
    this.passed = false;
    this.timedOut = false;
  };

  LevelEvaluator.prototype.checkSize = function (radius) {
    var t = this.level.target;
    return radius >= t.minRadius && radius <= t.maxRadius;
  };

  LevelEvaluator.prototype.checkZone = function (pos) {
    return U.v3dist(pos, this.level.zone.center) <= this.level.zone.radius;
  };

  /**
   * @param {{radius:number,pos:{x,y,z}}} bubble
   * @param {number} dt
   * @param {boolean} floating whether the bubble is free (attached bubbles never count)
   */
  LevelEvaluator.prototype.update = function (bubble, dt, floating) {
    if (this.passed || this.timedOut) return this.snapshot();
    this.elapsed += dt;
    this.sizeOk = this.checkSize(bubble.radius);
    this.inZone = floating !== false && this.checkZone(bubble.pos);
    if (this.sizeOk && this.inZone) this.hold += dt;
    else this.hold = Math.max(0, this.hold - this.level.holdDecay * dt);
    if (this.hold >= this.level.holdTime) { this.hold = this.level.holdTime; this.passed = true; }
    else if (this.elapsed >= this.level.timeLimit) this.timedOut = true;
    return this.snapshot();
  };

  LevelEvaluator.prototype.snapshot = function () {
    return {
      hold: this.hold,
      holdProgress: U.clamp01(this.hold / this.level.holdTime),
      elapsed: this.elapsed,
      remaining: Math.max(0, this.level.timeLimit - this.elapsed),
      inZone: this.inZone,
      sizeOk: this.sizeOk,
      passed: this.passed,
      timedOut: this.timedOut
    };
  };

  /** 1..3 stars depending on how much of the time limit was used. */
  function starsFor(elapsed, timeLimit) {
    var r = elapsed / timeLimit;
    if (r <= config.stars.three) return 3;
    if (r <= config.stars.two) return 2;
    return 1;
  }

  return { LevelEvaluator: LevelEvaluator, starsFor: starsFor };
});
