/**
 * RoarBubbles - Level definitions.
 *
 * To add a level: append an entry to LEVEL_SPECS (or call registerLevel at runtime).
 * Each spec only needs a few "design" fields; buildLevel() derives the rest from `difficulty` (0..1).
 */
(function (root, name, deps, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory.apply(null, deps.map(function (d) { return require('./' + d); }));
  } else {
    var ns = (root.RB = root.RB || {});
    ns[name] = factory.apply(null, deps.map(function (d) { return ns[d]; }));
  }
})(typeof self !== 'undefined' ? self : this, 'levels', ['config', 'utils'], function (config, U) {
  'use strict';

  var THEMES = ['meadow', 'lake', 'desert', 'snow', 'volcano'];

  /**
   * Design table. zone: [x, y, z] of the target zone centre, size: [min, max] radius,
   * drift: direction continuous sound pushes the bubble, wind: [x, z] base wind.
   */
  var LEVEL_SPECS = [
    { name: { zh: '晨露草地', en: 'Dewy Meadow' },        theme: 'meadow',  zone: [0, 2.4, 1.5],   size: [0.5, 1.4], hold: 3,  time: 60, wind: [0, 0],        drift: [0, 0.4, -1] },
    { name: { zh: '蒲公英坡', en: 'Dandelion Slope' },    theme: 'meadow',  zone: [0.8, 2.6, 1],   size: [0.6, 1.4], hold: 4,  time: 60, wind: [0.08, 0],     drift: [0.3, 0.4, -1] },
    { name: { zh: '风车小径', en: 'Windmill Path' },      theme: 'meadow',  zone: [-1.2, 2.8, 0.8],size: [0.7, 1.5], hold: 4,  time: 60, wind: [-0.12, 0.05], drift: [-0.4, 0.3, -1] },
    { name: { zh: '花海', en: 'Sea of Flowers' },          theme: 'meadow',  zone: [1.5, 3, 0],     size: [0.8, 1.5], hold: 5,  time: 65, wind: [0.15, -0.1],  drift: [1, 0.2, -0.5] },
    { name: { zh: '镜湖', en: 'Mirror Lake' },            theme: 'lake',    zone: [-1.5, 2.6, 0],  size: [0.8, 1.5], hold: 5,  time: 65, wind: [-0.2, 0],     drift: [-1, 0.2, -0.3] },
    { name: { zh: '睡莲湾', en: 'Lily Bay' },             theme: 'lake',    zone: [2, 3, -0.5],    size: [0.9, 1.6], hold: 5,  time: 65, wind: [0.25, -0.1],  drift: [1, 0.3, -0.3] },
    { name: { zh: '雾中小岛', en: 'Misty Isle' },         theme: 'lake',    zone: [0, 3.4, -1.5],  size: [1.0, 1.6], hold: 6,  time: 70, wind: [0.1, 0.25],   drift: [0, 0.5, -1] },
    { name: { zh: '瀑布潭', en: 'Waterfall Pool' },       theme: 'lake',    zone: [-2.2, 3.2, -1], size: [1.0, 1.6], hold: 6,  time: 70, wind: [-0.3, 0.1],   drift: [-1, 0.6, 0] },
    { name: { zh: '金色沙丘', en: 'Golden Dunes' },       theme: 'desert',  zone: [2.2, 2.8, -1.5],size: [1.1, 1.7], hold: 6,  time: 70, wind: [0.35, 0],     drift: [1, 0.2, -0.4] },
    { name: { zh: '仙人掌谷', en: 'Cactus Valley' },      theme: 'desert',  zone: [-2.5, 3.4, -1.5],size: [1.1, 1.7], hold: 7, time: 75, wind: [-0.4, 0.15],  drift: [-1, 0.3, -0.6] },
    { name: { zh: '海市蜃楼', en: 'Mirage' },             theme: 'desert',  zone: [0.5, 4, -2.5],  size: [1.2, 1.7], hold: 7,  time: 75, wind: [0.3, 0.3],    drift: [0.3, 1, -0.5] },
    { name: { zh: '沙暴边缘', en: 'Sandstorm Edge' },     theme: 'desert',  zone: [3, 3.4, -2],    size: [1.2, 1.75], hold: 8, time: 75, wind: [0.5, -0.2],   drift: [1, 0.3, 0] },
    { name: { zh: '雪松林', en: 'Cedar Snowfield' },      theme: 'snow',    zone: [-3, 3.6, -2],   size: [1.3, 1.8], hold: 8,  time: 80, wind: [-0.5, 0.2],   drift: [-1, 0.4, -0.5] },
    { name: { zh: '冰湖', en: 'Frozen Lake' },            theme: 'snow',    zone: [2.5, 4.2, -2.8],size: [1.3, 1.8], hold: 9,  time: 80, wind: [0.55, 0.25],  drift: [0.8, 0.6, -0.6] },
    { name: { zh: '极光山脊', en: 'Aurora Ridge' },       theme: 'snow',    zone: [0, 4.8, -3],    size: [1.4, 1.85], hold: 9, time: 80, wind: [0.4, -0.45],  drift: [0, 1, -0.6] },
    { name: { zh: '暴风雪', en: 'Blizzard' },             theme: 'snow',    zone: [-3.2, 4.4, -2.5],size: [1.4, 1.85], hold: 10, time: 85, wind: [-0.65, 0.3], drift: [-1, 0.5, -0.2] },
    { name: { zh: '熔岩平原', en: 'Lava Plains' },        theme: 'volcano', zone: [3.2, 4, -3],    size: [1.5, 1.9], hold: 10, time: 85, wind: [0.7, -0.2],   drift: [1, 0.8, 0] },
    { name: { zh: '火山口', en: 'Crater Rim' },           theme: 'volcano', zone: [-2.8, 5, -3.2], size: [1.5, 1.9], hold: 11, time: 90, wind: [-0.7, 0.35],  drift: [-0.8, 1, -0.4] },
    { name: { zh: '灰烬风暴', en: 'Ash Storm' },          theme: 'volcano', zone: [0, 5.4, -3.6],  size: [1.6, 1.95], hold: 11, time: 90, wind: [0.6, 0.6],   drift: [0, 1, -1] },
    { name: { zh: '巨龙之息', en: "Dragon's Breath" },    theme: 'volcano', zone: [3.4, 5, -3.4],  size: [1.65, 1.95], hold: 12, time: 90, wind: [0.85, -0.35], drift: [1, 0.8, -0.4] }
  ];

  /** Derive a full level object from a design spec. */
  function buildLevel(spec, index, total) {
    var n = total || LEVEL_SPECS.length;
    var d = spec.difficulty !== undefined ? spec.difficulty : (n > 1 ? index / (n - 1) : 0);
    var zoneRadius = spec.zoneRadius !== undefined ? spec.zoneRadius : U.lerp(2.4, 0.95, d);
    // the zone must be able to contain a bubble of the minimum required size
    zoneRadius = Math.max(zoneRadius, spec.size[0] * 0.6);
    var burstMargin = U.lerp(0.9, 0.38, d);
    return {
      id: index + 1,
      name: spec.name,
      theme: spec.theme,
      difficulty: d,
      target: { minRadius: spec.size[0], maxRadius: spec.size[1] },
      zone: { center: { x: spec.zone[0], y: spec.zone[1], z: spec.zone[2] }, radius: zoneRadius },
      holdTime: spec.hold,
      timeLimit: spec.time,
      /** progress lost per second when leaving the zone / size window (seconds per second) */
      holdDecay: spec.holdDecay !== undefined ? spec.holdDecay : U.lerp(0.4, 3, d),
      physics: {
        burstRadius: spec.size[1] + burstMargin,
        surgeLimit: spec.surgeLimit !== undefined ? spec.surgeLimit : U.lerp(0.9, 0.68, d),
        stressScale: U.lerp(0.7, 1.4, d),
        wind: { x: spec.wind[0], y: 0, z: spec.wind[1] },
        gust: U.lerp(0, 0.6, d),
        driftDir: { x: spec.drift[0], y: spec.drift[1], z: spec.drift[2] }
      }
    };
  }

  var LEVELS = LEVEL_SPECS.map(function (s, i) { return buildLevel(s, i, LEVEL_SPECS.length); });

  /** Validate a level against the arena. Returns a list of human readable problems (empty = valid). */
  function validateLevel(level, arena) {
    var a = arena || config.arena;
    var errs = [];
    var z = level.zone;
    if (!level.name || !level.name.zh || !level.name.en) errs.push('missing bilingual name');
    if (THEMES.indexOf(level.theme) < 0) errs.push('unknown theme ' + level.theme);
    if (!(level.target.minRadius > 0 && level.target.maxRadius > level.target.minRadius)) errs.push('bad target size');
    if (level.physics.burstRadius <= level.target.maxRadius) errs.push('burst radius must exceed max target radius');
    if (Math.abs(z.center.x) + z.radius > a.halfWidth) errs.push('zone outside arena (x)');
    if (Math.abs(z.center.z) + z.radius > a.halfDepth) errs.push('zone outside arena (z)');
    if (z.center.y + z.radius > a.height || z.center.y - z.radius < 0) errs.push('zone outside arena (y)');
    if (!(level.holdTime > 0) || !(level.timeLimit > level.holdTime)) errs.push('bad timing');
    if (level.physics.surgeLimit <= 0 || level.physics.surgeLimit > 1) errs.push('bad surge limit');
    return errs;
  }

  /** Runtime extension point: add a new level built from a spec. */
  function registerLevel(spec) {
    LEVEL_SPECS.push(spec);
    var lvl = buildLevel(spec, LEVELS.length, LEVELS.length + 1);
    var errs = validateLevel(lvl);
    if (errs.length) { LEVEL_SPECS.pop(); throw new Error('Invalid level: ' + errs.join(', ')); }
    LEVELS.push(lvl);
    return lvl;
  }

  return { LEVELS: LEVELS, LEVEL_SPECS: LEVEL_SPECS, THEMES: THEMES, buildLevel: buildLevel, validateLevel: validateLevel, registerLevel: registerLevel };
});
