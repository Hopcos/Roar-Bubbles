/**
 * RoarBubbles - contextual hints: picks the most useful tip (i18n key) for the current game snapshot.
 */
(function (root, name, deps, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory.apply(null, deps.map(function (d) { return require('./' + d); }));
  } else {
    var ns = (root.RB = root.RB || {});
    ns[name] = factory.apply(null, deps.map(function (d) { return ns[d]; }));
  }
})(typeof self !== 'undefined' ? self : this, 'hints', [], function () {
  'use strict';

  /**
   * @param {object} snap GameEngine snapshot
   * @param {object} level level definition
   * @returns {string} i18n key
   */
  function pickHint(snap, level) {
    if (!snap || !level || snap.state !== 'playing') return 'tip_start';
    var a = snap.audio, b = snap.bubble, e = snap.eval || {};
    if (b.stress > 0.45 || b.radius > b.burstRadius * 0.9) return 'tip_too_loud';
    if (a.sustain > 1.2 && a.rhythm < 0.3) return 'tip_drifting';
    if (b.state === 'attached') return 'tip_start';
    if (e.sizeOk && e.inZone) return 'tip_hold';
    if (b.radius < level.target.minRadius) return 'tip_bigger';
    if (b.radius > level.target.maxRadius) return 'tip_smaller';
    if (a.rhythm < 0.3) return 'tip_need_rhythm';
    return 'tip_go_zone';
  }

  return { pickHint: pickHint };
});
