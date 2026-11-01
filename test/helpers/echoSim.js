/**
 * "Silent room" simulation: the player makes no sound at all, but the microphone still hears
 * (a) fluctuating room noise with occasional clicks and (b) the game's own sound effects coming back
 * from the speakers (acoustic echo). Used to make sure the game never blows a bubble by itself.
 */
'use strict';

const { GameEngine } = require('../../src/js/gameEngine');
const { createStorage } = require('../../src/js/utils');
const { rng } = require('./sim');

/** how long each game sound is audible (s), mirrors src/js/sfx.js */
const SFX_DUR = require('../../src/js/sfx').DURATIONS;

/**
 * @param {number} levelIndex
 * @param {object} opts { echoDb: level of the echoed sfx at the mic (dB), noiseDb, noiseVarDb, clickProb,
 *                        clickDb, seed, guard: feed the sfx echo guard like app.js does }
 */
function runSilentRoom(levelIndex, opts = {}) {
  const dt = 1 / 60;
  const r = rng(opts.seed || 11);
  const engine = new GameEngine({ storage: createStorage(null) });
  const noiseDb = opts.noiseDb ?? -55;
  const varDb = opts.noiseVarDb ?? 4;
  const echoDb = opts.echoDb ?? -30;
  let audibleUntil = 0;
  let t = 0;
  const events = {};
  engine.on('*', (_p, evt) => {
    events[evt] = (events[evt] || 0) + 1;
    if (SFX_DUR[evt]) audibleUntil = Math.max(audibleUntil, t + SFX_DUR[evt]);
  });
  const ambient = () => {
    let db = noiseDb + (r() * 2 - 1) * varDb;
    if (r() < (opts.clickProb ?? 0.01)) db = opts.clickDb ?? -38;
    return Math.pow(10, db / 20);
  };
  engine.loadLevel(levelIndex);
  // calibration countdown, like app.js
  for (let c = 0; c < 2.4; c += dt) engine.analyzer.observeAmbient(ambient(), dt);
  engine.start();
  const maxT = engine.level.timeLimit + 5;
  while (engine.state === 'playing' && t < maxT) {
    let rms = ambient();
    const audible = t < audibleUntil;
    if (audible) rms = Math.sqrt(rms * rms + Math.pow(10, echoDb / 10));
    if (opts.guard !== false && engine.analyzer.setEchoGuard) engine.analyzer.setEchoGuard(audible ? 1 : 0, dt);
    engine.updateRms(rms, dt);
    t += dt;
  }
  return { state: engine.state, reason: engine.failReason, maxRadius: engine.bubble.radius, events, engine };
}

module.exports = { runSilentRoom, SFX_DUR };
