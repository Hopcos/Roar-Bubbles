/**
 * RoarBubbles - i18n (zh / en). Add a language by adding a dictionary with the same keys.
 */
(function (root, name, deps, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory.apply(null, deps.map(function (d) { return require('./' + d); }));
  } else {
    var ns = (root.RB = root.RB || {});
    ns[name] = factory.apply(null, deps.map(function (d) { return ns[d]; }));
  }
})(typeof self !== 'undefined' ? self : this, 'i18n', [], function () {
  'use strict';

  var DICT = {
    zh: {
      title: '吼吼泡泡',
      subtitle: '用声音吹出完美的 3D 泡泡',
      level: '第 {n} 关',
      levels: '关卡',
      guide: '操作指引',
      settings: '设置',
      sound_on: '音效：开',
      sound_off: '音效：关',
      reset_view: '重置视角',
      meter_volume: '音量',
      meter_continuity: '连续',
      meter_rhythm: '节奏',
      meter_stress: '压力',
      goal: '过关目标',
      goal_size: '泡泡大小',
      goal_zone: '目标区域',
      goal_hold: '保持',
      time_left: '剩余',
      seconds: '秒',
      brief_size: '泡泡半径保持在 <b>{min} – {max}</b>',
      brief_zone: '让泡泡停留在<b>发光的目标区域</b>内',
      brief_hold: '同时满足以上条件累计 <b>{hold} 秒</b>',
      brief_time: '时间限制 <b>{time} 秒</b>',
      brief_difficulty: '难度',
      start: '开始吹泡泡',
      calibrating: '保持安静，正在校准环境噪音…',
      go: '吹！',
      retry: '再试一次',
      next: '下一关',
      menu: '选择关卡',
      close: '关闭',
      passed: '过关！',
      all_cleared: '恭喜你通关了全部关卡！',
      failed: '失败了',
      fail_burst_surge: '声音突然变大，泡泡被吹破了！',
      fail_burst_stress: '持续太大声，泡泡承受不住破掉了！',
      fail_burst_overinflate: '泡泡吹得太大，撑破了！',
      fail_escaped: '泡泡飘出了有效区域，飞走了！',
      fail_timeout: '时间到了！',
      time_used: '用时 {t} 秒',
      tip_start: '对着麦克风有节奏地 “呼—呼—呼—” 吹出泡泡',
      tip_too_loud: '太大声了！泡泡快撑不住了',
      tip_drifting: '持续的声音会把泡泡吹跑，试试有节奏地吹',
      tip_need_rhythm: '保持稳定的节奏，泡泡会自动飞向目标',
      tip_bigger: '再大声一点，让泡泡变大',
      tip_smaller: '轻一点，让泡泡缩小一些',
      tip_go_zone: '用稳定的节奏把泡泡引到目标区域',
      tip_hold: '完美！保持住！',
      mic_denied: '无法使用麦克风：权限被拒绝。请在浏览器设置中允许麦克风访问后刷新页面。',
      mic_nodevice: '没有找到麦克风等音频输入设备。',
      mic_insecure: '麦克风只能在 HTTPS 或 localhost 下使用，请通过 HTTPS / 本地服务器打开本页面。',
      mic_unsupported: '当前浏览器不支持麦克风采集，请使用最新版 Chrome / Edge / Firefox / Safari。',
      mic_error: '麦克风启动失败：{msg}',
      webgl_error: '无法初始化 3D 渲染（WebGL 不可用或 three.js 加载失败）。',
      sensitivity: '麦克风灵敏度',
      sfx_volume: '音效音量',
      reset_progress: '重置关卡进度',
      reset_done: '进度已重置',
      locked: '未解锁',
      guide_html:
        '<h3>🎯 游戏目标</h3><p>每一关都会给出<b>泡泡大小范围</b>、<b>目标区域</b>（发光的球形区域）和<b>保持时长</b>。让泡泡以正确的大小停留在目标区域内，累计达到保持时长即可过关。</p>' +
        '<h3>🎤 用声音控制</h3><ul>' +
        '<li><b>音量</b>：声音越大，泡泡越大；声音小或停下来，泡泡会慢慢变小。</li>' +
        '<li><b>突然变大 / 一直很大</b>：泡泡会被吹破！注意“压力”条。</li>' +
        '<li><b>连续性</b>：连续发声能让泡泡在短暂停顿时不缩小，但一直不停地吹，泡泡会被吹跑、飘出有效区域。</li>' +
        '<li><b>节奏</b>：像 “呼—呼—呼—” 一样稳定地一下一下吹，节奏感越强，泡泡越能变大且不容易破，并会被引导飞向目标区域、不会飘走。</li></ul>' +
        '<h3>🖐 视角操作</h3><ul><li>电脑：鼠标拖动旋转视角，滚轮缩放。</li><li>手机/平板：单指拖动旋转，双指捏合缩放。</li><li>点击 ⟲ 按钮恢复默认视角。</li></ul>' +
        '<h3>📊 界面说明</h3><ul><li>左侧：音量、连续、节奏、压力四个实时指标。</li><li>右侧：泡泡大小（绿色区间为目标范围）、是否在目标区域、保持进度和剩余时间。</li><li>目标区域中的两个圆环分别表示最小、最大目标尺寸。</li></ul>' +
        '<h3>💡 小技巧</h3><ul><li>开始前保持安静 1 秒，游戏会自动校准环境噪音。</li><li>先轻轻有节奏地吹，等节奏条升起后再逐渐加大音量。</li><li>建议佩戴耳机，避免游戏音效被麦克风收录。</li><li>声音太小或太大可在 ⚙ 设置中调整麦克风灵敏度。</li></ul>'
    },
    en: {
      title: 'RoarBubbles',
      subtitle: 'Blow perfect 3D bubbles with your voice',
      level: 'Level {n}',
      levels: 'Levels',
      guide: 'How to play',
      settings: 'Settings',
      sound_on: 'Sound: on',
      sound_off: 'Sound: off',
      reset_view: 'Reset view',
      meter_volume: 'Volume',
      meter_continuity: 'Flow',
      meter_rhythm: 'Rhythm',
      meter_stress: 'Stress',
      goal: 'Goal',
      goal_size: 'Bubble size',
      goal_zone: 'Target zone',
      goal_hold: 'Hold',
      time_left: 'Time',
      seconds: 's',
      brief_size: 'Keep the bubble radius within <b>{min} – {max}</b>',
      brief_zone: 'Keep the bubble inside the <b>glowing target zone</b>',
      brief_hold: 'Meet both conditions for <b>{hold} s</b> in total',
      brief_time: 'Time limit <b>{time} s</b>',
      brief_difficulty: 'Difficulty',
      start: 'Start blowing',
      calibrating: 'Stay quiet – calibrating room noise…',
      go: 'Blow!',
      retry: 'Retry',
      next: 'Next level',
      menu: 'Levels',
      close: 'Close',
      passed: 'Level cleared!',
      all_cleared: 'Congratulations, you cleared every level!',
      failed: 'Failed',
      fail_burst_surge: 'A sudden loud sound popped the bubble!',
      fail_burst_stress: 'Too loud for too long – the bubble gave in!',
      fail_burst_overinflate: 'The bubble was blown too big and burst!',
      fail_escaped: 'The bubble drifted out of the arena and flew away!',
      fail_timeout: 'Time is up!',
      time_used: 'Time {t} s',
      tip_start: 'Blow into the microphone in a steady rhythm: "hoo – hoo – hoo"',
      tip_too_loud: 'Too loud! The bubble is about to burst',
      tip_drifting: 'Continuous sound blows the bubble away – try a rhythm',
      tip_need_rhythm: 'Keep a steady rhythm and the bubble will steer to the target',
      tip_bigger: 'A little louder to grow the bubble',
      tip_smaller: 'Softer – let the bubble shrink a bit',
      tip_go_zone: 'Use a steady rhythm to guide the bubble into the zone',
      tip_hold: 'Perfect! Hold it!',
      mic_denied: 'Microphone permission denied. Allow microphone access in your browser settings and reload.',
      mic_nodevice: 'No microphone or audio input device found.',
      mic_insecure: 'The microphone only works over HTTPS or on localhost. Please open this page via HTTPS / a local server.',
      mic_unsupported: 'This browser cannot capture the microphone. Please use a recent Chrome / Edge / Firefox / Safari.',
      mic_error: 'Could not start the microphone: {msg}',
      webgl_error: 'Could not initialise 3D rendering (WebGL unavailable or three.js failed to load).',
      sensitivity: 'Mic sensitivity',
      sfx_volume: 'Sound volume',
      reset_progress: 'Reset level progress',
      reset_done: 'Progress reset',
      locked: 'Locked',
      guide_html:
        '<h3>🎯 Goal</h3><p>Every level shows a <b>bubble size range</b>, a <b>target zone</b> (glowing sphere) and a <b>hold time</b>. Keep a bubble of the right size inside the zone until the hold time is reached.</p>' +
        '<h3>🎤 Voice controls</h3><ul>' +
        '<li><b>Volume</b>: louder = bigger bubble; quiet or silent = it slowly shrinks.</li>' +
        '<li><b>Sudden or constant loudness</b>: the bubble bursts! Watch the “Stress” bar.</li>' +
        '<li><b>Continuity</b>: continuous sound keeps the bubble from shrinking in short pauses, but never stopping blows it away out of the arena.</li>' +
        '<li><b>Rhythm</b>: blow in steady pulses (“hoo – hoo – hoo”). The stronger the rhythm, the bigger and safer the bubble gets, and it is guided to the target zone instead of drifting away.</li></ul>' +
        '<h3>🖐 Camera</h3><ul><li>Desktop: drag to orbit, mouse wheel to zoom.</li><li>Phone / tablet: one finger to orbit, pinch to zoom.</li><li>Tap ⟲ to reset the view.</li></ul>' +
        '<h3>📊 HUD</h3><ul><li>Left: live Volume, Flow, Rhythm and Stress meters.</li><li>Right: bubble size (green band = target range), zone status, hold progress and remaining time.</li><li>The two rings inside the zone show the minimum and maximum target size.</li></ul>' +
        '<h3>💡 Tips</h3><ul><li>Stay quiet for a second before each level – the room noise is calibrated automatically.</li><li>Start softly in rhythm, then raise the volume once the rhythm bar is up.</li><li>Headphones prevent the game sounds from leaking into the microphone.</li><li>Adjust the microphone sensitivity in ⚙ settings if needed.</li></ul>'
    }
  };

  var current = 'zh';

  function detect(navLang) {
    var l = String(navLang || (typeof navigator !== 'undefined' && navigator.language) || 'zh').toLowerCase();
    return l.indexOf('zh') === 0 ? 'zh' : 'en';
  }

  function setLang(lang) { if (DICT[lang]) current = lang; return current; }
  function getLang() { return current; }

  /** translate a key, replacing {name} placeholders. Falls back to zh then to the key itself. */
  function t(key, params) {
    var s = (DICT[current] && DICT[current][key]);
    if (s === undefined) s = DICT.zh[key];
    if (s === undefined) return key;
    if (params) s = s.replace(/\{(\w+)\}/g, function (m, k) { return params[k] !== undefined ? params[k] : m; });
    return s;
  }

  return { DICT: DICT, t: t, setLang: setLang, getLang: getLang, detect: detect, languages: Object.keys(DICT) };
});
