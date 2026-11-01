'use strict';
/**
 * Closed-loop tests.
 *
 *   virtual player ──(volume)──▶ synthetic mic RMS / samples ──▶ VoiceAnalyzer ──▶ Bubble ──▶ LevelEvaluator
 *        ▲                                                                                    │
 *        └──────────────────────────── GameEngine snapshot (radius, rhythm, …) ◀──────────────┘
 *
 * The player reads the game state every tick and adapts its loudness (feedback), exactly like a human
 * watching the screen. These tests prove that every level is winnable with good technique and that each
 * rule (burst / escape / timeout) actually triggers for the corresponding bad technique.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../helpers/sim');
const { LEVELS } = require('../../src/js/levels');
const { GameEngine } = require('../../src/js/gameEngine');
const { createStorage } = require('../../src/js/utils');

test('a steady rhythmic player clears every one of the 20 levels', () => {
  for (let i = 0; i < LEVELS.length; i++) {
    const r = S.runLevel(i, S.rhythmicPlayer(LEVELS[i]));
    assert.ok(r.passed, 'level ' + (i + 1) + ' failed: ' + r.reason);
    assert.ok(r.elapsed < LEVELS[i].timeLimit);
    assert.ok(r.events.detach === 1 && r.events.enterZone >= 1 && r.events.pass === 1);
  }
});

test('human-like timing jitter (±20%) still clears every level across several seeds', () => {
  for (let i = 0; i < LEVELS.length; i++) {
    for (const seed of [11, 22, 33]) {
      const r = S.runLevel(i, S.rhythmicPlayer(LEVELS[i], { jitter: 0.2, seed }), { seed });
      assert.ok(r.passed, 'level ' + (i + 1) + ' seed ' + seed + ' failed: ' + r.reason);
    }
  }
});

test('different tempos (≈ 70–150 bpm) all work', () => {
  for (const period of [0.4, 0.6, 0.85]) {
    for (const i of [0, 9, 19]) {
      const r = S.runLevel(i, S.rhythmicPlayer(LEVELS[i], { period }));
      assert.ok(r.passed, 'level ' + (i + 1) + ' period ' + period + ': ' + r.reason);
    }
  }
});

test('the full sample path (Float32 sine frames) behaves like the RMS path', () => {
  for (const i of [0, 7, 14]) {
    const r = S.runLevel(i, S.rhythmicPlayer(LEVELS[i]), { useSamples: true });
    assert.ok(r.passed, 'level ' + (i + 1) + ': ' + r.reason);
  }
});

test('one long continuous sound never wins: the bubble drifts away (escape)', () => {
  let escapes = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    const r = S.runLevel(i, S.continuousPlayer(0.5));
    if (i >= 3) assert.ok(!r.passed, 'level ' + (i + 1) + ' should not be won by continuous sound');
    if (r.reason === 'escaped') escapes++;
  }
  assert.ok(escapes >= 18, 'continuous sound should mostly end with an escape, got ' + escapes);
});

test('shouting (sudden max loudness) always bursts the bubble', () => {
  for (let i = 0; i < LEVELS.length; i++) {
    const r = S.runLevel(i, S.shoutingPlayer());
    assert.equal(r.passed, false);
    assert.match(r.reason, /^burst_/, 'level ' + (i + 1) + ' reason ' + r.reason);
    assert.equal(r.events.burst, 1);
  }
});

test('an instant shout on a hard level pops the bubble through the surge rule', () => {
  const r = S.runLevel(19, (snap, t) => (t < 1.5 ? (t % 0.5 < 0.25 ? 0.4 : 0) : 1));
  assert.equal(r.reason, 'burst_surge');
});

test('erratic, rhythm-less noise fails every level', () => {
  for (let i = 0; i < LEVELS.length; i++) {
    for (const seed of [1, 2]) {
      const r = S.runLevel(i, S.erraticPlayer(seed));
      assert.equal(r.passed, false, 'level ' + (i + 1) + ' seed ' + seed);
    }
  }
});

test('silence times out', () => {
  for (const i of [0, 19]) {
    const r = S.runLevel(i, S.silentPlayer());
    assert.equal(r.reason, 'timeout');
    assert.ok(Math.abs(r.elapsed - LEVELS[i].timeLimit) < 0.1);
  }
});

test('difficulty curve: sloppy rhythm wins easy levels but loses hard ones', () => {
  const rate = (i) => [1, 2, 3, 4].filter((seed) => S.runLevel(i, S.rhythmicPlayer(LEVELS[i], { jitter: 0.7, seed }), { seed }).passed).length;
  const easy = [0, 1, 2, 3].reduce((s, i) => s + rate(i), 0);
  const hard = [16, 17, 18, 19].reduce((s, i) => s + rate(i), 0);
  assert.equal(easy, 16, 'all easy runs pass');
  assert.ok(hard <= 6, 'most hard runs fail, passed ' + hard + '/16');
});

test('harder levels take longer to clear even for a perfect player', () => {
  const t = (i) => S.runLevel(i, S.rhythmicPlayer(LEVELS[i])).elapsed;
  assert.ok(t(19) > t(0) * 2.5);
});

test('campaign: one engine plays all 20 levels in order, unlocking each next level', () => {
  const storage = createStorage(null);
  const engine = new GameEngine({ storage });
  for (let i = 0; i < LEVELS.length; i++) {
    assert.ok(engine.isUnlocked(i), 'level ' + (i + 1) + ' unlocked');
    const r = S.runLevel(i, S.rhythmicPlayer(LEVELS[i]), { engine });
    assert.ok(r.passed, 'level ' + (i + 1));
  }
  assert.equal(engine.progress.unlocked, 20);
  assert.equal(Object.keys(engine.progress.stars).length, 20);
  assert.equal(engine.hasNext(), false);
  assert.equal(new GameEngine({ storage }).progress.unlocked, 20, 'progress persisted');
});

test('event order in a winning run: grow → detach → enterZone → sizeOk → pass', () => {
  const order = [];
  const engine = new GameEngine({ storage: createStorage(null) });
  engine.on('*', (_p, evt) => { if (!order.includes(evt)) order.push(evt); });
  const r = S.runLevel(4, S.rhythmicPlayer(LEVELS[4]), { engine });
  assert.ok(r.passed);
  const idx = (e) => order.indexOf(e);
  assert.ok(idx('grow') < idx('detach'));
  assert.ok(idx('detach') < idx('enterZone'));
  assert.ok(idx('detach') < idx('sizeOk'));
  assert.ok(idx('pass') > idx('enterZone'));
  assert.equal(order.includes('burst'), false);
  assert.equal(order.includes('escape'), false);
});

/* ---------- bug guard: a silent player must never clear a level by itself ---------- */
const { runSilentRoom } = require('../helpers/echoSim');

test('silent room: noise + clicks + speaker echo of the game sfx never blow a bubble by themselves', () => {
  for (let i = 0; i < LEVELS.length; i++) {
    for (const o of [
      { echoDb: -38, clickProb: 0.03, seed: 1 },
      { echoDb: -30, clickProb: 0.03, seed: 2 },
      { echoDb: -30, clickProb: 0.005, seed: 3 },
      { echoDb: -120, noiseVarDb: 12, clickProb: 0.03, seed: 4 }
    ]) {
      const r = runSilentRoom(i, o);
      assert.equal(r.reason, 'timeout', 'level ' + (i + 1) + ' ' + JSON.stringify(o) + ' → ' + r.state + '/' + r.reason);
    }
  }
});

test('regression: without the echo guard the same silent room used to clear levels', () => {
  let passed = 0;
  for (let i = 0; i < LEVELS.length; i++) if (runSilentRoom(i, { echoDb: -38, clickProb: 0.03, seed: 1, guard: false }).state === 'passed') passed++;
  assert.ok(passed > 0, 'the simulation reproduces the feedback loop (' + passed + ' levels)');
});

test('echo guard does not hurt a real rhythmic player (sfx echo mixed into the mic)', () => {
  for (const [echoDb, period] of [[-45, 0.6], [-45, 0.85], [-40, 0.85]]) {
    for (let i = 0; i < LEVELS.length; i++) {
      const r = S.runLevel(i, S.rhythmicPlayer(LEVELS[i], { period }), { echoDb });
      assert.ok(r.passed, 'echo ' + echoDb + ' period ' + period + ' level ' + (i + 1) + ': ' + r.reason);
    }
  }
});
