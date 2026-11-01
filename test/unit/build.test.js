'use strict';
/**
 * Build output tests: dist/index.html must be one self-contained page whose inlined modules
 * boot correctly in a browser-like global (the UMD browser branch).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { build } = require('../../scripts/build');

const SRC = path.join(__dirname, '..', '..', 'src');
const tmpOut = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'roarbubbles-')), 'index.html');
const result = build({ outFile: tmpOut });
const html = fs.readFileSync(tmpOut, 'utf8');

test('single file: every local script and stylesheet is inlined', () => {
  const localScripts = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8').match(/<script src="js\/[^"]+"/g);
  assert.equal(result.inlined.filter((f) => f.endsWith('.js')).length, localScripts.length);
  assert.ok(result.inlined.includes('css/style.css'));
  assert.doesNotMatch(html, /<script src="(?!https:)/, 'no local script references left');
  assert.doesNotMatch(html, /<link rel="stylesheet" href="(?!https:)/, 'no local stylesheet references left');
  assert.match(html, /<style>/);
});

test('only the pinned three.js CDN script stays external', () => {
  const ext = html.match(/<script src="([^"]+)"/g) || [];
  assert.equal(ext.length, 1);
  assert.match(ext[0], /cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r\d+\/three\.min\.js/);
});

test('mobile + desktop ready: viewport meta, touch-action, responsive CSS', () => {
  assert.match(html, /<meta name="viewport"[^>]*width=device-width/);
  assert.match(html, /touch-action:\s*none/);
  assert.match(html, /@media \(max-width: 720px\)/);
});

test('page contains the guide entry, sound toggle and level selector', () => {
  for (const id of ['btn-guide', 'modal-guide', 'btn-sound', 'btn-levels', 'modal-levels', 'btn-settings', 'btn-start', 'overlay-result']) {
    assert.match(html, new RegExp('id="' + id + '"'), id);
  }
});

test('inlined modules boot in a browser-like global and register on window.RB', () => {
  const scripts = [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map((m) => m[1]);
  const sandbox = { console, Math, Float32Array, Uint8Array, JSON, Object, Array, Promise };
  sandbox.self = sandbox; // no `module`, no `document` → browser branch, app.js exits early
  vm.createContext(sandbox);
  for (const code of scripts) vm.runInContext(code, sandbox);
  const RB = sandbox.RB;
  for (const m of ['config', 'utils', 'i18n', 'audioAnalyzer', 'bubblePhysics', 'levels', 'levelEvaluator', 'gameEngine', 'hints', 'sfx', 'micInput', 'orbitCamera', 'renderer3d']) {
    assert.ok(RB[m], 'module ' + m + ' registered');
  }
  assert.equal(RB.levels.LEVELS.length, 20);
  // the browser build runs the very same engine
  const e = new RB.gameEngine.GameEngine({ storage: RB.utils.createStorage(null) });
  e.loadLevel(0);
  assert.equal(e.start(), true);
});
