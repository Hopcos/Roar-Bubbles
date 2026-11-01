/**
 * RoarBubbles - browser application: wires mic → engine → renderer / sound / HUD.
 */
(function (root) {
  'use strict';
  var RB = root.RB;
  var doc = root.document;
  if (!doc) return;

  var t = RB.i18n.t;
  var $ = function (id) { return doc.getElementById(id); };

  var storage = RB.utils.createStorage();
  var KEY = RB.config.storageKey;
  var engine = new RB.gameEngine.GameEngine({ storage: storage });
  var sfx = new RB.sfx.Sfx({ storage: storage });
  var mic = new RB.micInput.MicInput();
  var renderer = null;

  var app = {
    phase: 'brief', // brief | countdown | playing | result
    countdown: 0,
    lastCount: -1,
    hintKey: '',
    hintTimer: 0,
    resultTimer: null,
    lastResult: null
  };

  /* ---------------- settings ---------------- */
  var settings = storage.get(KEY + '.settings', null) || {};
  RB.i18n.setLang(settings.lang || RB.i18n.detect());
  engine.analyzer.setSensitivity(settings.sensitivity || 1);
  function saveSettings() { storage.set(KEY + '.settings', settings); }

  /* ---------------- i18n ---------------- */
  function applyI18n() {
    doc.documentElement.lang = RB.i18n.getLang() === 'zh' ? 'zh-CN' : 'en';
    doc.title = t('title') + ' · RoarBubbles';
    Array.prototype.forEach.call(doc.querySelectorAll('[data-i18n]'), function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-i18n-title]'), function (el) {
      var s = t(el.getAttribute('data-i18n-title'));
      el.title = s; el.setAttribute('aria-label', s);
    });
    $('guide-body').innerHTML = t('guide_html');
    Array.prototype.forEach.call(doc.querySelectorAll('#lang-switch [data-lang]'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === RB.i18n.getLang()));
    });
    updateSoundButton();
    renderLevelHeader();
    if (app.phase === 'brief') renderBrief();
    if (app.phase === 'result' && app.lastResult) showResult(app.lastResult);
    if (app.hintKey) $('hint').textContent = t(app.hintKey);
    renderLevelGrid();
  }

  function levelName(level) { return level.name[RB.i18n.getLang()] || level.name.zh; }

  function renderLevelHeader() {
    if (!engine.level) return;
    $('level-label').textContent = t('level', { n: engine.level.id }) + ' · ' + levelName(engine.level);
  }

  /* ---------------- modals / overlays ---------------- */
  function show(id) { $(id).hidden = false; }
  function hide(id) { $(id).hidden = true; }
  function openModal(id) { sfx.play('click'); show(id); }

  function difficultyStars(d) {
    var n = Math.max(1, Math.round(1 + d * 4));
    return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
  }

  function renderBrief() {
    var L = engine.level;
    if (!L) return;
    $('brief-title').textContent = t('level', { n: L.id }) + ' · ' + levelName(L);
    $('brief-difficulty').textContent = t('brief_difficulty') + ' ' + difficultyStars(L.difficulty);
    $('brief-goals').innerHTML =
      '<li>📏 ' + t('brief_size', { min: L.target.minRadius.toFixed(2), max: L.target.maxRadius.toFixed(2) }) + '</li>' +
      '<li>🎯 ' + t('brief_zone') + '</li>' +
      '<li>⏱ ' + t('brief_hold', { hold: L.holdTime }) + '</li>' +
      '<li>⌛ ' + t('brief_time', { time: L.timeLimit }) + '</li>';
    $('brief-error').textContent = '';
    $('brief-countdown').textContent = '';
    $('btn-start').disabled = false;
  }

  function renderLevelGrid() {
    var grid = $('level-grid');
    grid.innerHTML = '';
    engine.levels.forEach(function (L, i) {
      var b = doc.createElement('button');
      var unlocked = engine.isUnlocked(i);
      var stars = engine.progress.stars[String(L.id)] || 0;
      b.className = 'level-btn theme-' + L.theme + (i === engine.levelIndex ? ' current' : '');
      b.disabled = !unlocked;
      b.innerHTML = '<span class="num">' + L.id + '</span><span class="nm">' + (unlocked ? levelName(L) : '🔒 ' + t('locked')) +
        '</span><span class="st">' + '★★★'.slice(0, stars) + '<i>' + '☆☆☆'.slice(0, 3 - stars) + '</i></span>';
      b.addEventListener('click', function () { hide('modal-levels'); loadLevel(i); });
      grid.appendChild(b);
    });
  }

  function loadLevel(i) {
    clearTimeout(app.resultTimer);
    engine.loadLevel(i);
    if (renderer) renderer.setLevel(engine.level);
    app.phase = 'brief';
    hide('overlay-result');
    renderLevelHeader();
    renderBrief();
    renderLevelGrid();
    show('overlay-brief');
    setHint('tip_start');
  }

  function startLevel() {
    sfx.ensure();
    $('btn-start').disabled = true;
    $('brief-error').textContent = '';
    mic.start().then(function () {
      app.phase = 'countdown';
      app.countdown = 2.4;
      app.lastCount = -1;
      $('brief-countdown').textContent = t('calibrating');
    }).catch(function (err) {
      var key = RB.micInput.MicInput.errorKey(err);
      $('brief-error').textContent = t(key, { msg: (err && (err.message || err.name)) || '?' });
      $('btn-start').disabled = false;
    });
  }

  function showResult(res) {
    var L = engine.level;
    app.lastResult = res;
    app.phase = 'result';
    var box = $('overlay-result');
    box.classList.toggle('win', res.passed);
    box.classList.toggle('lose', !res.passed);
    $('result-title').textContent = res.passed ? t('passed') : t('failed');
    $('result-stars').textContent = res.passed ? '★★★'.slice(0, res.stars) + '☆☆☆'.slice(0, 3 - res.stars) : '';
    var msg = res.passed ? t('time_used', { t: res.elapsed.toFixed(1) }) : t('fail_' + res.reason);
    if (res.passed && !engine.hasNext()) msg += ' 🎉 ' + t('all_cleared');
    $('result-msg').textContent = msg;
    $('btn-next').hidden = !(res.passed && engine.hasNext());
    $('result-title').setAttribute('data-level', L ? L.id : '');
    show('overlay-result');
  }

  /* ---------------- HUD ---------------- */
  function setMeter(id, v) { $(id).style.width = (RB.utils.clamp01(v) * 100).toFixed(1) + '%'; }

  function setHint(key) {
    if (key === app.hintKey) return;
    app.hintKey = key;
    app.hintTimer = 0;
    $('hint').textContent = t(key);
  }

  function updateHud(snap, dt) {
    var a = snap.audio, b = snap.bubble, e = snap.eval || {}, L = engine.level;
    setMeter('m-volume', a.volume);
    setMeter('m-continuity', a.continuity);
    setMeter('m-rhythm', a.rhythm);
    setMeter('m-stress', b.stress);
    $('m-bpm').textContent = a.bpm ? Math.round(a.bpm) + ' bpm' : '';
    if (!L) return;

    var scaleMax = L.physics.burstRadius * (1 + RB.config.bubble.rhythmBurstBonus);
    var pct = function (r) { return (RB.utils.clamp01(r / scaleMax) * 100).toFixed(1) + '%'; };
    $('size-band').style.left = pct(L.target.minRadius);
    $('size-band').style.width = ((L.target.maxRadius - L.target.minRadius) / scaleMax * 100).toFixed(1) + '%';
    $('size-burst').style.left = pct(b.burstRadius || L.physics.burstRadius);
    $('size-marker').style.left = pct(b.radius);
    $('size-value').textContent = b.radius.toFixed(2) + ' / ' + L.target.minRadius.toFixed(2) + '–' + L.target.maxRadius.toFixed(2);
    $('chk-size').classList.toggle('ok', !!e.sizeOk);
    $('chk-zone').classList.toggle('ok', !!e.inZone);
    setMeter('hold-bar', e.holdProgress || 0);
    $('hold-value').textContent = (e.hold || 0).toFixed(1) + ' / ' + L.holdTime + t('seconds');
    var rem = e.remaining !== undefined ? e.remaining : L.timeLimit;
    $('time-value').textContent = Math.ceil(rem) + t('seconds');
    $('time-value').classList.toggle('warn', rem < 10);

    app.hintTimer += dt;
    var key = RB.hints.pickHint(snap, L);
    if (key !== app.hintKey && app.hintTimer > 0.7) setHint(key);
  }

  /* ---------------- engine events ---------------- */
  engine.on('grow', function (p) { sfx.play('grow', p); });
  engine.on('shrink', function (p) { sfx.play('shrink', p); });
  engine.on('detach', function (p) { sfx.play('detach'); if (renderer) renderer.onEvent('detach', p); });
  engine.on('enterZone', function () { sfx.play('enterZone'); });
  engine.on('leaveZone', function () { sfx.play('leaveZone'); });
  engine.on('burst', function (p) { sfx.play('burst'); if (renderer) renderer.onEvent('burst', p); });
  engine.on('escape', function (p) { sfx.play('escape'); if (renderer) renderer.onEvent('escape', p); });
  engine.on('pass', function (res) {
    sfx.play('pass');
    if (renderer) renderer.onEvent('pass', {});
    app.resultTimer = setTimeout(function () { showResult(res); renderLevelGrid(); }, 1400);
  });
  engine.on('fail', function (res) {
    app.resultTimer = setTimeout(function () { sfx.play('fail'); showResult(res); }, res.reason === 'escaped' ? 1500 : 1000);
  });

  /* ---------------- main loop ---------------- */
  var last = 0;
  function frame(now) {
    // real elapsed time (capped so a background tab does not jump); slow devices still run in real time
    var dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 1 / 60;
    last = now;
    var samples = mic.read();
    // our own sound effects reach the microphone through the speakers: never treat them as the player
    var echo = sfx.isAudible();

    if (app.phase === 'countdown') {
      // calibrate on room noise only (skip the countdown beeps)
      if (samples && !echo) engine.analyzer.observeAmbient(RB.audioAnalyzer.computeRms(samples), dt);
      app.countdown -= dt;
      var n = Math.ceil(app.countdown / 0.8);
      if (n !== app.lastCount && n > 0) {
        app.lastCount = n;
        $('brief-countdown').textContent = t('calibrating') + '  ' + n;
        sfx.play('countdown', { final: false });
      }
      if (app.countdown <= 0) {
        sfx.play('countdown', { final: true });
        hide('overlay-brief');
        flash(t('go'));
        engine.start();
        app.phase = 'playing';
      }
    } else if (app.phase === 'playing' && samples) {
      engine.analyzer.setEchoGuard(echo ? 1 : 0, dt);
      engine.update(samples, dt);
    }

    var snap = engine.snapshot();
    if (renderer) renderer.update(snap, dt);
    updateHud(snap, dt);
    root.requestAnimationFrame(frame);
  }

  function flash(text) {
    var el = $('flash');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth; // restart CSS animation
    el.classList.add('show');
  }

  /* ---------------- controls ---------------- */
  function updateSoundButton() {
    var b = $('btn-sound');
    b.textContent = sfx.enabled ? '🔊' : '🔇';
    b.title = sfx.enabled ? t('sound_on') : t('sound_off');
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', String(sfx.enabled));
  }

  function bind() {
    $('btn-guide').addEventListener('click', function () { openModal('modal-guide'); });
    $('btn-levels').addEventListener('click', function () { renderLevelGrid(); openModal('modal-levels'); });
    $('btn-settings').addEventListener('click', function () { openModal('modal-settings'); });
    $('btn-sound').addEventListener('click', function () { sfx.toggle(); updateSoundButton(); sfx.play('click'); });
    Array.prototype.forEach.call(doc.querySelectorAll('#lang-switch [data-lang]'), function (b) {
      b.addEventListener('click', function () {
        var lang = b.getAttribute('data-lang');
        if (lang === RB.i18n.getLang()) return;
        settings.lang = RB.i18n.setLang(lang);
        saveSettings(); applyI18n(); sfx.play('click');
      });
    });
    $('btn-view').addEventListener('click', function () { if (renderer) renderer.orbit.reset(); sfx.play('click'); });
    $('btn-start').addEventListener('click', startLevel);
    $('btn-retry').addEventListener('click', function () { loadLevel(engine.levelIndex); });
    $('btn-next').addEventListener('click', function () { loadLevel(engine.levelIndex + 1); });
    $('btn-menu').addEventListener('click', function () { renderLevelGrid(); show('modal-levels'); });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-close]'), function (el) {
      el.addEventListener('click', function () { hide(el.getAttribute('data-close')); });
    });
    Array.prototype.forEach.call(doc.querySelectorAll('.modal'), function (m) {
      m.addEventListener('click', function (e) { if (e.target === m) m.hidden = true; });
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') Array.prototype.forEach.call(doc.querySelectorAll('.modal'), function (m) { m.hidden = true; });
    });

    var sens = $('in-sensitivity');
    sens.value = settings.sensitivity || 1;
    $('out-sensitivity').textContent = Number(sens.value).toFixed(1) + '×';
    sens.addEventListener('input', function () {
      settings.sensitivity = Number(sens.value);
      engine.analyzer.setSensitivity(settings.sensitivity);
      $('out-sensitivity').textContent = settings.sensitivity.toFixed(1) + '×';
      saveSettings();
    });
    var vol = $('in-volume');
    vol.value = sfx.volume;
    vol.addEventListener('input', function () { sfx.setVolume(vol.value); });
    vol.addEventListener('change', function () { sfx.play('pass'); });
    $('btn-reset-progress').addEventListener('click', function () {
      engine.resetProgress(); renderLevelGrid(); $('reset-msg').textContent = t('reset_done');
    });

    doc.addEventListener('pointerdown', function () { sfx.ensure(); mic.resume(); }, { once: true });
    root.addEventListener('resize', function () { if (renderer) renderer.resize(); });
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) { mic.resume(); last = 0; } });
  }

  function boot() {
    try {
      renderer = new RB.renderer3d.Renderer3D($('stage'), root.THREE);
    } catch (e) {
      renderer = null;
      $('fatal').textContent = t('webgl_error') + ' (' + e.message + ')';
      $('fatal').hidden = false;
    }
    bind();
    applyI18n();
    loadLevel(Math.min(engine.progress.unlocked, engine.levels.length) - 1);
    if (!storage.get(KEY + '.guideSeen', false)) { show('modal-guide'); storage.set(KEY + '.guideSeen', true); }
    root.requestAnimationFrame(frame);
    root.RoarBubbles = { engine: engine, sfx: sfx, mic: mic, renderer: renderer, loadLevel: loadLevel, RB: RB };
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof self !== 'undefined' ? self : this);
