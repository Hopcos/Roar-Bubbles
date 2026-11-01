/**
 * RoarBubbles - global tuning constants.
 * All gameplay numbers live here so the game can be re-balanced without touching logic.
 */
(function (root, name, deps, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory.apply(null, deps.map(function (d) { return require('./' + d); }));
  } else {
    var ns = (root.RB = root.RB || {});
    ns[name] = factory.apply(null, deps.map(function (d) { return ns[d]; }));
  }
})(typeof self !== 'undefined' ? self : this, 'config', [], function () {
  'use strict';

  var config = {
    version: '1.0.0',

    /** Playable arena: x ∈ [-halfWidth, halfWidth], y ∈ [0, height], z ∈ [-halfDepth, halfDepth] */
    arena: { halfWidth: 6, height: 8, halfDepth: 6 },

    /** Where the bubble wand sits. */
    spawn: { x: 0, y: 1.6, z: 3 },

    audio: {
      fftSize: 1024,
      /** dB above the adaptive noise floor that maps to volume 0 */
      floorMargin: 6,
      /** dB span (above floor + margin) that maps to volume 0 → 1 */
      dynamicRange: 40,
      /** noise floor assumed before any ambient measurement (dB) */
      initialFloorDb: -60,
      /** fast floor adaptation time constant while calibrating on ambient sound (s) */
      calibrateTau: 0.25,
      /** absolute floor bounds for the adaptive noise floor */
      minFloorDb: -90,
      maxFloorDb: -25,
      /** how fast the noise floor creeps upward (dB / s) when the signal is above it */
      floorRiseRate: 0.6,
      /** noise tracking on quiet frames: time constants (s) when the level falls / follows */
      floorFallTau: 0.15,
      floorTrackTau: 6,
      /** noise fluctuation (mean |dB - floor|) estimate: start value and time constant */
      initialNoiseDev: 1,
      noiseDevTau: 2,
      /** gate = floorMargin + clamp(noiseDevFactor * noiseDev - noiseDevAllowance, 0, maxNoiseMargin) */
      noiseDevFactor: 2.5,
      noiseDevAllowance: 2.5,
      maxNoiseMargin: 14,
      /** echo guard: extra volume needed to START a sound while the game's own sfx are audible
       *  (echoStartBoost until the echo level has been learned, echoKnownBoost afterwards) */
      echoStartBoost: 0.3,
      echoKnownBoost: 0.08,
      /** echo guard fall-off time constant (room reverberation tail, s) */
      echoTailTau: 0.12,
      /** learned echo level: rise / decay time constants (s) and over-subtraction factor */
      echoLearnTau: 0.4,
      echoForgetTau: 4,
      echoOverSubtract: 1.5,
      attackTau: 0.03,
      releaseTau: 0.1,
      /** hysteresis thresholds on the normalised volume */
      activeThreshold: 0.16,
      releaseThreshold: 0.1,
      /** minimum seconds between two onsets */
      onsetMinGap: 0.12,
      /** number of recent onsets kept for rhythm estimation */
      rhythmHistory: 7,
      /** valid beat interval range (seconds) */
      minBeatInterval: 0.18,
      maxBeatInterval: 1.4,
      /** coefficient of variation that maps to rhythm 0 */
      maxCv: 0.38,
      rhythmTau: 0.35,
      continuityTau: 1.2,
      /** time window (s) used to measure sudden volume surges */
      surgeWindow: 0.15
    },

    bubble: {
      startRadius: 0.12,
      minRadius: 0.1,
      /** bubble leaves the wand once it reaches this radius */
      detachRadius: 0.35,
      /** radius reachable at volume 1 (before rhythm bonus) */
      radiusPerVolume: 3.0,
      rhythmSizeBonus: 0.3,
      /** exponential approach rate (1/s) toward the volume-driven radius */
      growResponse: 1.3,
      /** radius lost per second in silence (scaled by continuity / rhythm) */
      shrinkRate: 0.32,
      /** volume above which stress accumulates */
      loudThreshold: 0.86,
      loudStressRate: 7,
      nearLimitStressRate: 1.6,
      stressDecay: 0.45,
      /** rhythm extends the burst radius by this factor */
      rhythmBurstBonus: 0.3,
      /** rhythm raises the surge limit by this amount */
      rhythmSurgeBonus: 0.25,
      damping: 1.8,
      liftWhenBlowing: 0.18,
      sinkWhenSilent: 0.22,
      /** continuous (non-rhythmic) sound pushes the bubble along the level drift direction */
      driftForce: 0.55,
      driftDelay: 0.9,
      driftMaxSustain: 5,
      guideGain: 1.8,
      windRhythmDamping: 0.8
    },

    events: {
      growTickInterval: 0.16,
      shrinkTickInterval: 0.32,
      /** minimal radius change per tick to emit grow/shrink sound */
      tickDelta: 0.012
    },

    stars: {
      /** passing within this fraction of the time limit gives 3 / 2 stars */
      three: 0.4,
      two: 0.7
    },

    storageKey: 'roarbubbles.v1'
  };

  return config;
});
