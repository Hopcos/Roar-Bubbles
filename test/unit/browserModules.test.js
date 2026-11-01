'use strict';
/** Tests for the browser-facing modules using fakes (no real Web Audio / WebGL needed). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { Sfx, SOUNDS, DURATIONS } = require('../../src/js/sfx');
const { MicInput } = require('../../src/js/micInput');
const { OrbitCamera } = require('../../src/js/orbitCamera');
const { pickHint } = require('../../src/js/hints');
const i18n = require('../../src/js/i18n');
const R3 = require('../../src/js/renderer3d');
const { LEVELS, THEMES } = require('../../src/js/levels');
const { createStorage } = require('../../src/js/utils');

/* ---------- fake Web Audio ---------- */
function fakeParam() {
  const calls = [];
  const p = { value: 0, calls };
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) p[m] = (...a) => { calls.push([m, ...a]); return p; };
  return p;
}
function fakeNode(kind, log) {
  const n = { kind, connections: [], connect(d) { n.connections.push(d); return d; }, start() { log.push(kind + ':start'); }, stop() {} };
  n.frequency = fakeParam(); n.gain = fakeParam(); n.Q = fakeParam();
  return n;
}
function FakeAudioContext() {
  const log = [];
  return {
    log, state: 'suspended', currentTime: 0, sampleRate: 8000, destination: { kind: 'dest' },
    resumed: 0,
    resume() { this.resumed++; this.state = 'running'; },
    createOscillator: () => fakeNode('osc', log),
    createGain: () => fakeNode('gain', log),
    createBiquadFilter: () => fakeNode('filter', log),
    createBufferSource: () => fakeNode('noise', log),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) })
  };
}

test('Sfx: every built-in sound schedules audio nodes', () => {
  const ctx = FakeAudioContext();
  const s = new Sfx({ storage: createStorage(null), contextFactory: () => ctx });
  for (const name of Object.keys(SOUNDS)) {
    const before = ctx.log.length;
    assert.equal(s.play(name, { radius: 1, final: true }), true, name);
    assert.ok(ctx.log.length > before, name + ' created no nodes');
  }
  assert.ok(ctx.resumed >= 1, 'suspended context is resumed');
});

test('Sfx: disabled → nothing plays, toggle persists, unknown sounds are ignored', () => {
  const storage = createStorage(null);
  let created = 0;
  const s = new Sfx({ storage, contextFactory: () => { created++; return FakeAudioContext(); } });
  assert.equal(s.enabled, true);
  s.toggle();
  assert.equal(s.play('burst'), false);
  assert.equal(created, 0, 'no AudioContext while disabled');
  assert.equal(new Sfx({ storage }).enabled, false, 'setting persisted');
  s.setEnabled(true);
  assert.equal(s.play('does-not-exist'), false);
  s.setVolume(2); assert.equal(s.volume, 1);
  s.setVolume(0.3); assert.equal(new Sfx({ storage }).volume, 0.3);
});

test('Sfx: isAudible tracks our own sounds for the microphone echo guard', () => {
  const ctx = FakeAudioContext();
  const s = new Sfx({ storage: createStorage(null), contextFactory: () => ctx });
  for (const name of Object.keys(SOUNDS)) assert.equal(typeof DURATIONS[name], 'number', 'duration for ' + name);
  assert.equal(s.isAudible(), false);
  s.play('grow', { radius: 0.5 });
  assert.equal(s.isAudible(), true);
  ctx.currentTime = DURATIONS.grow + 0.01;
  assert.equal(s.isAudible(), false, 'silent after the sound ended');
  s.play('enterZone');
  s.play('grow');
  ctx.currentTime += DURATIONS.grow + 0.01;
  assert.equal(s.isAudible(), true, 'longest sound wins');
  s.register('custom', () => {}, 2);
  s.register('noDuration', () => {});
  s.play('custom'); ctx.currentTime += 1.5;
  assert.equal(s.isAudible(), true);
  s.setVolume(0); assert.equal(s.isAudible(), false, 'muted volume → no echo');
  s.setVolume(1); s.setEnabled(false); assert.equal(s.isAudible(), false, 'disabled → no echo');
  s.setEnabled(true); ctx.currentTime += 10;
  s.play('noDuration'); assert.equal(s.isAudible(), true, 'unknown durations use a default');
});

test('Sfx: register custom sounds; missing AudioContext is handled', () => {
  const ctx = FakeAudioContext();
  const s = new Sfx({ storage: createStorage(null), contextFactory: () => ctx });
  let called = null;
  s.register('custom', (c, out, p) => { called = p; });
  assert.equal(s.play('custom', { a: 1 }), true);
  assert.deepEqual(called, { a: 1 });
  const none = new Sfx({ storage: createStorage(null), contextFactory: () => null });
  assert.equal(none.play('pass'), false);
  const throwing = new Sfx({ storage: createStorage(null), contextFactory: () => { throw new Error('x'); } });
  assert.equal(throwing.play('pass'), false);
});

/* ---------- MicInput ---------- */
function fakeMicEnv(opts = {}) {
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  const stream = { getTracks: () => tracks };
  let constraints = null;
  const mediaDevices = {
    getUserMedia: (c) => { constraints = c; return opts.fail ? Promise.reject(opts.fail) : Promise.resolve(stream); }
  };
  function Ctx() {
    this.state = 'running';
    this.createMediaStreamSource = () => ({ connect: (n) => { this.connected = n; } });
    this.createAnalyser = () => ({
      fftSize: 0,
      getFloatTimeDomainData: opts.noFloat ? undefined : (buf) => buf.fill(0.25),
      getByteTimeDomainData: (buf) => buf.fill(192)
    });
    this.close = () => { this.closed = true; };
  }
  return { mediaDevices, Ctx, tracks, getConstraints: () => constraints };
}

test('MicInput: requests only an audio input device with raw processing', async () => {
  const env = fakeMicEnv();
  const mic = new MicInput({ mediaDevices: env.mediaDevices, AudioContextCtor: env.Ctx, isSecureContext: true, fftSize: 256 });
  assert.equal(mic.read(), null, 'nothing before start');
  await mic.start();
  const c = env.getConstraints();
  assert.equal(c.video, false);
  assert.equal(c.audio.echoCancellation, true);
  assert.equal(c.audio.autoGainControl, false);
  assert.equal(c.audio.noiseSuppression, false);
  const buf = mic.read();
  assert.equal(buf.length, 256);
  assert.equal(buf[0], 0.25);
  await mic.start(); // idempotent
  mic.stop();
  assert.equal(env.tracks[0].stopped, true);
  assert.equal(mic.read(), null);
});

test('MicInput: byte fallback when float data is unavailable', async () => {
  const env = fakeMicEnv({ noFloat: true });
  const mic = new MicInput({ mediaDevices: env.mediaDevices, AudioContextCtor: env.Ctx, fftSize: 64 });
  await mic.start();
  assert.equal(mic.read()[3], 0.5);
});

test('MicInput: errors are mapped to i18n keys', async () => {
  const denied = fakeMicEnv({ fail: { name: 'NotAllowedError' } });
  const mic = new MicInput({ mediaDevices: denied.mediaDevices, AudioContextCtor: denied.Ctx });
  await assert.rejects(mic.start(), (e) => MicInput.errorKey(e) === 'mic_denied');
  assert.equal(MicInput.errorKey({ name: 'NotFoundError' }), 'mic_nodevice');
  assert.equal(MicInput.errorKey({ name: 'Weird' }), 'mic_error');
  assert.equal(MicInput.errorKey(null), 'mic_error');

  const insecure = new MicInput({ mediaDevices: null, AudioContextCtor: null, isSecureContext: false });
  await assert.rejects(insecure.start(), (e) => MicInput.errorKey(e) === 'mic_insecure');
  const unsupported = new MicInput({ mediaDevices: {}, AudioContextCtor: null, isSecureContext: true });
  assert.equal(unsupported.isSupported(), false);
  await assert.rejects(unsupported.start(), (e) => MicInput.errorKey(e) === 'mic_unsupported');
});

/* ---------- OrbitCamera ---------- */
function fakeCamera() {
  return { position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, lookAt(x, y, z) { this.look = [x, y, z]; } };
}

test('OrbitCamera: default position, rotate, zoom limits and reset', () => {
  const cam = fakeCamera();
  const oc = new OrbitCamera(cam);
  const d0 = Math.hypot(cam.position.x - oc.target.x, cam.position.y - oc.target.y, cam.position.z - oc.target.z);
  assert.ok(Math.abs(d0 - oc.opts.distance) < 1e-9);
  assert.deepEqual(cam.look, [oc.target.x, oc.target.y, oc.target.z]);

  oc.rotate(100, 0);
  assert.notEqual(oc.theta, oc.opts.theta);
  oc.rotate(0, 100000);
  assert.equal(oc.phi, oc.opts.minPhi);
  oc.rotate(0, -100000);
  assert.equal(oc.phi, oc.opts.maxPhi);
  oc.zoom(1e6); assert.equal(oc.distance, oc.opts.maxDistance);
  oc.zoom(-1e6); assert.equal(oc.distance, oc.opts.minDistance);
  oc.reset();
  assert.equal(oc.distance, oc.opts.distance);
  assert.equal(oc.theta, oc.opts.theta);
});

test('OrbitCamera: pointer drag rotates, pinch zooms, wheel zooms, detach removes listeners', () => {
  const handlers = {};
  const el = {
    addEventListener: (k, fn) => { handlers[k] = fn; },
    removeEventListener: (k) => { delete handlers[k]; },
    setPointerCapture() {}
  };
  const oc = new OrbitCamera(fakeCamera()).attach(el);
  const th0 = oc.theta;
  handlers.pointerdown({ pointerId: 1, clientX: 0, clientY: 0 });
  handlers.pointermove({ pointerId: 1, clientX: 50, clientY: 0 });
  assert.ok(oc.theta < th0);
  handlers.pointerdown({ pointerId: 2, clientX: 100, clientY: 0 });
  const dist0 = oc.distance;
  handlers.pointermove({ pointerId: 2, clientX: 200, clientY: 0 }); // fingers apart → zoom in
  assert.ok(oc.distance < dist0);
  handlers.pointerup({ pointerId: 2 });
  handlers.pointerup({ pointerId: 1 });
  const d1 = oc.distance;
  let prevented = false;
  handlers.wheel({ deltaY: 200, preventDefault: () => { prevented = true; } });
  assert.ok(oc.distance > d1 && prevented);
  handlers.dblclick();
  assert.equal(oc.distance, oc.opts.distance);
  handlers.pointermove({ pointerId: 9, clientX: 1, clientY: 1 }); // unknown pointer ignored
  oc.detach();
  assert.equal(Object.keys(handlers).length, 0);
});

/* ---------- hints ---------- */
test('pickHint chooses the most relevant tip', () => {
  const L = LEVELS[0];
  const base = () => ({
    state: 'playing',
    audio: { rhythm: 0.8, sustain: 0.2 },
    bubble: { state: 'floating', radius: 1, stress: 0, burstRadius: 3 },
    eval: { sizeOk: false, inZone: false }
  });
  assert.equal(pickHint(null, L), 'tip_start');
  assert.equal(pickHint({ ...base(), state: 'ready' }, L), 'tip_start');
  let s = base(); s.bubble.stress = 0.6; assert.equal(pickHint(s, L), 'tip_too_loud');
  s = base(); s.audio = { rhythm: 0.1, sustain: 2 }; assert.equal(pickHint(s, L), 'tip_drifting');
  s = base(); s.bubble.state = 'attached'; assert.equal(pickHint(s, L), 'tip_start');
  s = base(); s.eval = { sizeOk: true, inZone: true }; assert.equal(pickHint(s, L), 'tip_hold');
  s = base(); s.bubble.radius = 0.2; assert.equal(pickHint(s, L), 'tip_bigger');
  s = base(); s.bubble.radius = 2; assert.equal(pickHint(s, L), 'tip_smaller');
  s = base(); s.audio.rhythm = 0.1; assert.equal(pickHint(s, L), 'tip_need_rhythm');
  assert.equal(pickHint(base(), L), 'tip_go_zone');
});

/* ---------- i18n ---------- */
test('i18n: zh and en dictionaries have identical keys', () => {
  const zh = Object.keys(i18n.DICT.zh).sort();
  const en = Object.keys(i18n.DICT.en).sort();
  assert.deepEqual(zh, en);
});

test('i18n: every key used by hints / fail reasons / mic errors exists', () => {
  const keys = ['tip_start', 'tip_too_loud', 'tip_drifting', 'tip_need_rhythm', 'tip_bigger', 'tip_smaller', 'tip_go_zone', 'tip_hold',
    'fail_burst_surge', 'fail_burst_stress', 'fail_burst_overinflate', 'fail_escaped', 'fail_timeout',
    'mic_denied', 'mic_nodevice', 'mic_insecure', 'mic_unsupported', 'mic_error'];
  for (const k of keys) for (const lang of i18n.languages) assert.ok(i18n.DICT[lang][k], lang + '.' + k);
});

test('i18n: placeholders, fallback, detection', () => {
  i18n.setLang('en');
  assert.equal(i18n.t('level', { n: 3 }), 'Level 3');
  assert.equal(i18n.t('level'), 'Level {n}');
  assert.equal(i18n.t('no_such_key'), 'no_such_key');
  assert.equal(i18n.setLang('xx'), 'en', 'unknown language ignored');
  i18n.setLang('zh');
  assert.equal(i18n.t('level', { n: 3 }), '第 3 关');
  assert.equal(i18n.detect('zh-TW'), 'zh');
  assert.equal(i18n.detect('fr-FR'), 'en');
});

/* ---------- renderer (non-WebGL parts) ---------- */
test('renderer: has a visual theme for every level theme and needs three.js', () => {
  for (const th of THEMES) assert.ok(R3.THEMES[th], 'missing theme ' + th);
  assert.throws(() => new R3.Renderer3D({}, null), /three\.js/);
  R3.Renderer3D.registerTheme('moon', { skyTop: 0, skyBottom: 0, fog: 0, ground: [0, 0], hemi: [0, 0], hills: 1 });
  assert.ok(R3.THEMES.moon);
  delete R3.THEMES.moon;
});

test('renderer: terrain is nearly flat inside the arena and rises outside', () => {
  for (const [x, z] of [[0, 0], [5, 5], [-6, 3]]) assert.ok(R3.terrainHeight(x, z, 1) < 0.1);
  assert.ok(R3.terrainHeight(20, 20, 1) > 2);
});
