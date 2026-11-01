/**
 * RoarBubbles - VoiceAnalyzer
 *
 * Turns raw microphone samples into the three gameplay signals:
 *   volume      (0..1, loudness above the adaptive noise floor)
 *   continuity  (0..1, how continuously sound has been present recently) + sustain (s of unbroken sound)
 *   rhythm      (0..1, regularity of the onset intervals)
 * plus `surge` (sudden loudness increase) used for bursting.
 *
 * Pure logic: no Web Audio dependency, so it is fully unit-testable.
 */
(function (root, name, deps, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory.apply(null, deps.map(function (d) { return require('./' + d); }));
  } else {
    var ns = (root.RB = root.RB || {});
    ns[name] = factory.apply(null, deps.map(function (d) { return ns[d]; }));
  }
})(typeof self !== 'undefined' ? self : this, 'audioAnalyzer', ['config', 'utils'], function (config, U) {
  'use strict';

  function computeRms(samples) {
    if (!samples || !samples.length) return 0;
    var s = 0;
    for (var i = 0; i < samples.length; i++) s += samples[i] * samples[i];
    return Math.sqrt(s / samples.length);
  }

  function rmsToDb(rms) { return 20 * Math.log10(Math.max(rms, 1e-9)); }

  function VoiceAnalyzer(options) {
    this.cfg = Object.assign({}, config.audio, options || {});
    this.sensitivity = 1;
    this.floorDb = this.cfg.initialFloorDb;
    this.noiseDev = this.cfg.initialNoiseDev;
    this.echoDb = null;
    this.reset();
  }

  /** Reset the gameplay state. The measured noise floor is kept unless `hard` is true. */
  VoiceAnalyzer.prototype.reset = function (hard) {
    this.time = 0;
    if (hard || typeof this.floorDb !== 'number') {
      this.floorDb = this.cfg.initialFloorDb;
      this.noiseDev = this.cfg.initialNoiseDev;
      this.echoDb = null;
    }
    this.echoGuard = 0;
    this.volume = 0;
    this.active = false;
    this.onsets = [];
    this.lastOnset = -Infinity;
    this.rhythmTarget = 0;
    this.rhythm = 0;
    this.continuity = 0;
    this.sustain = 0;
    this.history = [];
    this.meanInterval = 0;
  };

  /** sensitivity multiplier (0.25 .. 4). Higher = quieter sounds reach full volume. */
  VoiceAnalyzer.prototype.setSensitivity = function (s) {
    this.sensitivity = U.clamp(Number(s) || 1, 0.25, 4);
  };

  VoiceAnalyzer.prototype.process = function (samples, dt) {
    return this.processRms(computeRms(samples), dt);
  };

  /**
   * Extra dB above the floor required before anything counts as sound. It grows with how much the
   * room noise fluctuates, so a noisy (fan, traffic, keyboard) room cannot blow the bubble by itself.
   */
  VoiceAnalyzer.prototype.gateDb = function () {
    var c = this.cfg;
    return c.floorMargin + U.clamp(c.noiseDevFactor * this.noiseDev - c.noiseDevAllowance, 0, c.maxNoiseMargin);
  };

  VoiceAnalyzer.prototype._updateFloor = function (db, dt) {
    var c = this.cfg;
    // the game's own sound effects coming back through the speakers must not shift the noise estimate
    if (this.echoGuard > 0.05) return;
    if (!this.active && db < this.floorDb + this.gateDb()) {
      // quiet frame: learn the noise level and how much it fluctuates
      var tau = db < this.floorDb ? c.floorFallTau : c.floorTrackTau;
      this.floorDb += (db - this.floorDb) * U.smoothing(dt, tau);
      this.noiseDev += (Math.abs(db - this.floorDb) - this.noiseDev) * U.smoothing(dt, c.noiseDevTau);
    } else {
      // loud frame: the floor may only creep upward (very long sounds become the new "silence")
      this.floorDb += Math.min(Math.max(0, db - this.floorDb), c.floorRiseRate * dt);
    }
    this.floorDb = U.clamp(this.floorDb, c.minFloorDb, c.maxFloorDb);
  };

  /**
   * Learn how loud our own sound effects arrive at the microphone (frames where the guard is up and the
   * player is silent) and subtract that power while they play: a light-weight acoustic echo canceller.
   */
  VoiceAnalyzer.prototype._removeEcho = function (db, dt) {
    var c = this.cfg;
    var g = this.echoGuard;
    if (g <= 0) return db;
    if (g > 0.5 && !this.active && db > this.floorDb) {
      if (this.echoDb === null) this.echoDb = Math.min(db, this.floorDb + this.gateDb() + 0.5 * c.dynamicRange);
      else this.echoDb += (db - this.echoDb) * U.smoothing(dt, db > this.echoDb ? c.echoLearnTau : c.echoForgetTau);
    }
    if (this.echoDb === null) return db;
    var p = Math.pow(10, db / 10) - c.echoOverSubtract * g * Math.pow(10, this.echoDb / 10);
    return Math.max(10 * Math.log10(Math.max(p, 1e-18)), Math.min(db, this.floorDb));
  };

  /**
   * Tell the analyser that the game itself is currently making sound (0..1). While the guard is up,
   * starting a new sound needs a clearly louder input, so speaker → microphone echo of the sound
   * effects cannot inflate the bubble (that feedback loop could otherwise "play" a level by itself).
   * The guard falls off with a short tail for room reverberation.
   */
  VoiceAnalyzer.prototype.setEchoGuard = function (level, dt) {
    var g = U.clamp01(Number(level) || 0);
    if (g >= this.echoGuard) this.echoGuard = g;
    else this.echoGuard += (g - this.echoGuard) * U.smoothing(Math.max(0, dt || 0), this.cfg.echoTailTau);
    if (this.echoGuard < 0.01) this.echoGuard = 0;
    return this.echoGuard;
  };

  VoiceAnalyzer.prototype._updateRhythm = function (onset) {
    var c = this.cfg;
    var t = this.time;
    if (onset) {
      this.onsets.push(t);
      if (this.onsets.length > c.rhythmHistory) this.onsets.shift();
      var intervals = [];
      for (var i = 1; i < this.onsets.length; i++) intervals.push(this.onsets[i] - this.onsets[i - 1]);
      var last = intervals[intervals.length - 1];
      if (last !== undefined && (last < c.minBeatInterval || last > c.maxBeatInterval)) {
        // tempo broken: restart rhythm history from this onset
        this.onsets = [t];
        intervals = [];
      }
      if (intervals.length >= 3) {
        var m = U.mean(intervals);
        var cv = U.std(intervals) / m;
        var regularity = U.clamp01(1 - cv / c.maxCv);
        var confidence = Math.min(1, intervals.length / 4);
        this.rhythmTarget = regularity * confidence;
        this.meanInterval = m;
      } else {
        this.rhythmTarget = 0;
        this.meanInterval = intervals.length ? U.mean(intervals) : 0;
      }
    }
    // no beat for too long (silence or one long continuous sound) → rhythm fades
    var patience = Math.max(1.6 * (this.meanInterval || 0), 0.9);
    if (this.onsets.length && t - this.lastOnset > patience) {
      this.rhythmTarget = 0;
      this.onsets = [];
      this.meanInterval = 0;
    }
  };

  /**
   * Calibrate the noise floor on ambient sound (call while the player is told to stay quiet,
   * e.g. while the level briefing is shown). The floor follows the signal quickly in both directions.
   */
  VoiceAnalyzer.prototype.observeAmbient = function (rms, dt) {
    var c = this.cfg;
    var db = rmsToDb(rms);
    var k = U.smoothing(Math.max(0, dt || 0), c.calibrateTau);
    this.floorDb += (db - this.floorDb) * k;
    this.floorDb = U.clamp(this.floorDb, c.minFloorDb, c.maxFloorDb);
    this.noiseDev += (Math.min(Math.abs(db - this.floorDb), 20) - this.noiseDev) * k;
    return this.floorDb;
  };

  /**
   * Core update with an already computed RMS value.
   * @param {number} rms linear RMS of the current frame
   * @param {number} dt  seconds since the previous frame
   */
  VoiceAnalyzer.prototype.processRms = function (rms, dt) {
    var c = this.cfg;
    dt = Math.max(0, Math.min(dt || 0, 0.25));
    this.time += dt;

    var db = this._removeEcho(rmsToDb(rms), dt);
    this._updateFloor(db, dt);
    var range = c.dynamicRange / this.sensitivity;
    var rawVolume = U.clamp01((db - this.floorDb - this.gateDb()) / range);

    var tau = rawVolume > this.volume ? c.attackTau : c.releaseTau;
    this.volume += (rawVolume - this.volume) * U.smoothing(dt, tau);

    var onset = false;
    // while our own sfx play, starting a sound needs a margin (bigger while the echo level is still unknown)
    var startThreshold = c.activeThreshold + (this.echoDb === null ? c.echoStartBoost : c.echoKnownBoost) * this.echoGuard;
    if (!this.active && this.volume >= startThreshold) {
      this.active = true;
      if (this.time - this.lastOnset >= c.onsetMinGap) {
        onset = true;
        this.lastOnset = this.time;
      }
    } else if (this.active && this.volume < c.releaseThreshold) {
      this.active = false;
    }

    this._updateRhythm(onset);
    this.rhythm += (this.rhythmTarget - this.rhythm) * U.smoothing(dt, c.rhythmTau);
    this.continuity += ((this.active ? 1 : 0) - this.continuity) * U.smoothing(dt, c.continuityTau);
    this.sustain = this.active ? this.sustain + dt : 0;

    this.history.push({ t: this.time, v: this.volume });
    while (this.history.length && this.time - this.history[0].t > c.surgeWindow) this.history.shift();
    var minV = this.volume;
    for (var i = 0; i < this.history.length; i++) if (this.history[i].v < minV) minV = this.history[i].v;
    var surge = Math.max(0, this.volume - minV);

    return {
      time: this.time,
      rms: rms,
      db: db,
      floorDb: this.floorDb,
      gateDb: this.gateDb(),
      echoGuard: this.echoGuard,
      rawVolume: rawVolume,
      volume: this.volume,
      active: this.active,
      onset: onset,
      continuity: this.continuity,
      sustain: this.sustain,
      rhythm: this.rhythm,
      bpm: this.meanInterval > 0 ? 60 / this.meanInterval : 0,
      surge: surge
    };
  };

  /** An "empty" analysis frame, handy for idle states and tests. */
  function silentFrame() {
    return { time: 0, rms: 0, db: -180, floorDb: -90, gateDb: 6, echoGuard: 0, rawVolume: 0, volume: 0, active: false, onset: false,
      continuity: 0, sustain: 0, rhythm: 0, bpm: 0, surge: 0 };
  }

  return { VoiceAnalyzer: VoiceAnalyzer, computeRms: computeRms, rmsToDb: rmsToDb, silentFrame: silentFrame };
});
