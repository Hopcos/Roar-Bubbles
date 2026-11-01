'use strict';
/**
 * Browser end-to-end closed loop (optional): opens dist/index.html in headless Chrome / Edge via the
 * DevTools protocol, with Chrome's fake microphone device as the *input device*. The fake device emits
 * a loud periodic beep, so the real page goes  mic → analyser → engine → renderer → result overlay.
 *
 *   npm run test:e2e          (needs Chrome or Edge and network access for the three.js CDN)
 *   CHROME_PATH=/path/to/chrome npm run test:e2e
 * The test is skipped automatically when no browser is found.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { build } = require('../../scripts/build');

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);
const BROWSER = CANDIDATES.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, stepMs = 200) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return v;
    await sleep(stepMs);
  }
}

test('browser e2e: fake mic device drives the real page to a result', { skip: !BROWSER && 'no Chrome/Edge found', timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roarbubbles-e2e-'));
  const page = build({ outFile: path.join(dir, 'index.html') }).outFile;
  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(fs.readFileSync(page)); });
  await new Promise((r) => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port + '/';
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(BROWSER, ['--headless=new', '--remote-debugging-port=' + port, '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=800,600', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + path.join(dir, 'profile'), 'about:blank'], { stdio: 'ignore' });
  const errors = [];
  let ws;
  try {
    const target = await waitFor(async () => {
      try { return (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).find((t) => t.type === 'page'); } catch { return null; }
    }, 20000);
    assert.ok(target, 'devtools target');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = {};
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending[d.id]) { pending[d.id](d.result); delete pending[d.id]; }
      if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
    };
    const send = (method, params = {}) => new Promise((r) => { pending[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
    const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value;

    await send('Runtime.enable');
    await send('Page.navigate', { url });
    const booted = await waitFor(() => ev('!!(window.RoarBubbles && window.THREE)'), 30000);
    if (!booted) return test.skip?.('three.js CDN not reachable');

    assert.equal(await ev('document.querySelectorAll("canvas.scene-canvas").length'), 1, 'WebGL canvas');
    assert.equal(await ev('document.getElementById("modal-guide").hidden'), false, 'guide opens on first visit');
    // the language switch sits on the outermost layer: reachable even while the guide modal is open
    const topmost = await ev('(() => { const b = document.querySelector("#lang-switch [data-lang=en]").getBoundingClientRect();'
      + ' const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return el && el.getAttribute("data-lang"); })()');
    assert.equal(topmost, 'en', 'language switch is above the modal');
    await ev('document.querySelector("#lang-switch [data-lang=en]").click()');
    assert.equal(await ev('document.documentElement.lang'), 'en');
    assert.match(await ev('document.querySelector("#modal-guide h2, #modal-guide .card").textContent'), /[A-Za-z]{4}/);
    assert.equal(await ev('document.querySelector("#lang-switch [data-lang=en]").getAttribute("aria-pressed")'), 'true');
    await ev('document.querySelector("#lang-switch [data-lang=zh]").click()');
    assert.equal(await ev('document.documentElement.lang'), 'zh-CN');
    await ev('document.querySelector("[data-close=modal-guide]").click()');
    assert.equal(await ev('RoarBubbles.engine.state'), 'ready');
    assert.equal(await ev('document.querySelectorAll("#level-grid .level-btn").length'), 20);

    await ev('document.getElementById("btn-start").click()');
    const playing = await waitFor(() => ev('["playing","passed","failed"].includes(RoarBubbles.engine.state)'), 45000);
    assert.ok(playing, 'countdown finished and the level started');
    const heard = await waitFor(() => ev('RoarBubbles.engine.bubble.radius > 0.2 || RoarBubbles.engine.state !== "playing"'), 30000);
    assert.ok(heard, 'microphone input reached the engine');
    const done = await waitFor(() => ev('!document.getElementById("overlay-result").hidden'), 60000);
    assert.ok(done, 'result overlay shown');
    const reason = await ev('RoarBubbles.engine.failReason');
    // the fake device beeps loudly and abruptly → the surge/stress rules must pop the bubble
    assert.match(String(reason), /^(burst_|escaped|timeout)/);
    assert.deepEqual(errors, [], 'no runtime errors');
  } finally {
    try { ws && ws.close(); } catch { /* ignore */ }
    chrome.kill();
    server.close();
  }
});
