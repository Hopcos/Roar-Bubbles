/**
 * RoarBubbles - Bubble physics.
 *
 * Gameplay rules (see README for the diagram):
 *  - volume      → target radius (louder = bigger)
 *  - surge       → sudden loudness bursts the bubble
 *  - loud for long / radius near the limit → stress → burst
 *  - continuity  → the bubble does not shrink in short pauses,
 *                  but long unbroken sound (sustain) pushes it along the level drift → may escape
 *  - rhythm      → bigger size bonus, higher burst limit, less wind, and guidance toward the target zone
 */
(function (root, name, deps, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory.apply(null, deps.map(function (d) { return require('./' + d); }));
  } else {
    var ns = (root.RB = root.RB || {});
    ns[name] = factory.apply(null, deps.map(function (d) { return ns[d]; }));
  }
})(typeof self !== 'undefined' ? self : this, 'bubblePhysics', ['config', 'utils'], function (config, U) {
  'use strict';

  var STATES = { ATTACHED: 'attached', FLOATING: 'floating', BURST: 'burst', ESCAPED: 'escaped' };

  function windAt(physics, t) {
    var w = physics.wind || { x: 0, y: 0, z: 0 };
    var g = physics.gust || 0;
    var mag = Math.sqrt(w.x * w.x + w.z * w.z);
    var k = 1 + g * Math.sin(0.7 * t);
    return {
      x: w.x * k + g * 0.5 * mag * Math.sin(1.3 * t + 1),
      y: (w.y || 0) + g * 0.15 * mag * Math.sin(0.9 * t + 2),
      z: w.z * k + g * 0.5 * mag * Math.cos(1.1 * t)
    };
  }

  function Bubble(options) {
    this.cfg = Object.assign({}, config.bubble, options && options.bubble);
    this.arena = Object.assign({}, config.arena, options && options.arena);
    this.spawn = U.v3copy((options && options.spawn) || config.spawn);
    this.reset();
  }

  Bubble.STATES = STATES;

  Bubble.prototype.reset = function () {
    this.state = STATES.ATTACHED;
    this.radius = this.cfg.startRadius;
    this.pos = U.v3copy(this.spawn);
    this.vel = U.v3(0, 0, 0);
    this.stress = 0;
    this.time = 0;
    this.burstReason = null;
  };

  Bubble.prototype.isAlive = function () {
    return this.state === STATES.ATTACHED || this.state === STATES.FLOATING;
  };

  /** effective burst radius for the current rhythm */
  Bubble.prototype.burstRadius = function (level, rhythm) {
    return level.physics.burstRadius * (1 + this.cfg.rhythmBurstBonus * (rhythm || 0));
  };

  Bubble.prototype._updateRadius = function (f, dt) {
    var c = this.cfg;
    var r = this.radius;
    if (f.active) {
      var rv = c.minRadius + f.volume * c.radiusPerVolume * (1 + c.rhythmSizeBonus * f.rhythm);
      if (rv > r) r += (rv - r) * U.smoothing(dt, 1 / c.growResponse);
      else r -= Math.min(r - rv, c.shrinkRate * 0.4 * (1 - f.continuity) * dt);
    } else {
      r -= c.shrinkRate * (1 - f.continuity) * (1 - 0.7 * f.rhythm) * dt;
    }
    this.radius = Math.max(c.minRadius, r);
  };

  Bubble.prototype._updateStress = function (f, dt, level) {
    var c = this.cfg;
    var scale = level.physics.stressScale || 1;
    var add = 0;
    if (f.volume > c.loudThreshold) {
      add += (f.volume - c.loudThreshold) * c.loudStressRate * (1 - 0.7 * f.rhythm);
    }
    var ratio = this.radius / this.burstRadius(level, f.rhythm);
    if (ratio > 0.85) add += ((ratio - 0.85) / 0.15) * c.nearLimitStressRate * (1 - 0.6 * f.rhythm);
    if (add > 0) this.stress += add * scale * dt;
    else this.stress -= c.stressDecay * dt;
    this.stress = U.clamp(this.stress, 0, 1);
  };

  Bubble.prototype._checkBurst = function (f, level) {
    var c = this.cfg;
    var surgeLimit = level.physics.surgeLimit + c.rhythmSurgeBonus * f.rhythm;
    if (f.surge > surgeLimit) return 'surge';
    if (this.radius >= this.burstRadius(level, f.rhythm)) return 'overinflate';
    if (this.stress >= 1) return 'stress';
    return null;
  };

  Bubble.prototype._updateMotion = function (f, dt, level) {
    var c = this.cfg;
    var t = this.time;
    var w = windAt(level.physics, t);
    var windK = 1 - c.windRhythmDamping * f.rhythm;
    var force = U.v3scale(w, windK);

    // continuous, unbroken sound keeps blowing the bubble away
    var sustainExcess = U.clamp(f.sustain - c.driftDelay, 0, c.driftMaxSustain);
    if (sustainExcess > 0) {
      var dir = U.v3norm(level.physics.driftDir || { x: 0, y: 0.3, z: -1 });
      force = U.v3add(force, U.v3scale(dir, c.driftForce * sustainExcess * (1 - f.rhythm)));
    }

    // rhythm guides the bubble toward the target zone
    var g = c.guideGain * Math.pow(f.rhythm, 1.5);
    if (g > 0) force = U.v3add(force, U.v3scale(U.v3sub(level.zone.center, this.pos), g));

    force.y += f.active ? c.liftWhenBlowing * (1 - f.rhythm) : -c.sinkWhenSilent * (1 - f.rhythm);

    this.vel = U.v3add(this.vel, U.v3scale(force, dt));
    this.vel = U.v3scale(this.vel, Math.exp(-c.damping * dt));
    this.pos = U.v3add(this.pos, U.v3scale(this.vel, dt));

    if (this.pos.y < this.radius) {
      this.pos.y = this.radius;
      if (this.vel.y < 0) this.vel.y = -this.vel.y * 0.3;
    }
  };

  Bubble.prototype.isOutOfArena = function () {
    var a = this.arena, p = this.pos;
    return Math.abs(p.x) > a.halfWidth || Math.abs(p.z) > a.halfDepth || p.y > a.height;
  };

  /**
   * Advance the simulation.
   * @param {object} f   analysis frame from VoiceAnalyzer
   * @param {number} dt  seconds
   * @param {object} level level definition (needs .physics and .zone)
   * @returns {string[]} list of events that happened: 'detach' | 'burst' | 'escape'
   */
  Bubble.prototype.update = function (f, dt, level) {
    var events = [];
    if (!this.isAlive()) return events;
    this.time += dt;

    this._updateRadius(f, dt);
    this._updateStress(f, dt, level);

    var reason = this._checkBurst(f, level);
    if (reason) {
      this.state = STATES.BURST;
      this.burstReason = reason;
      events.push('burst');
      return events;
    }

    if (this.state === STATES.ATTACHED) {
      this.pos = U.v3copy(this.spawn);
      if (this.radius >= this.cfg.detachRadius) {
        this.state = STATES.FLOATING;
        this.vel = U.v3(0, 0.25, -0.35);
        events.push('detach');
      }
      return events;
    }

    this._updateMotion(f, dt, level);
    if (this.isOutOfArena()) {
      this.state = STATES.ESCAPED;
      events.push('escape');
    }
    return events;
  };

  return { Bubble: Bubble, STATES: STATES, windAt: windAt };
});
