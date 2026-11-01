/**
 * RoarBubbles - MicInput: captures the microphone (input devices only) through getUserMedia + AnalyserNode.
 * Dependencies are injectable so it can be unit-tested with fakes.
 */
(function (root, name, deps, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory.apply(null, deps.map(function (d) { return require('./' + d); }));
  } else {
    var ns = (root.RB = root.RB || {});
    ns[name] = factory.apply(null, deps.map(function (d) { return ns[d]; }));
  }
})(typeof self !== 'undefined' ? self : this, 'micInput', ['config'], function (config) {
  'use strict';

  var CONSTRAINTS = {
    audio: {
      echoCancellation: true, // keeps the game's own sound effects out of the input
      noiseSuppression: false, // blowing is "noise" – do not let the browser remove it
      autoGainControl: false // AGC would flatten the loudness we want to measure
    },
    video: false
  };

  function MicInput(options) {
    options = options || {};
    var g = typeof window !== 'undefined' ? window : {};
    this.mediaDevices = options.mediaDevices !== undefined ? options.mediaDevices : (g.navigator && g.navigator.mediaDevices);
    this.AudioContextCtor = options.AudioContextCtor || g.AudioContext || g.webkitAudioContext;
    this.isSecure = options.isSecureContext !== undefined ? options.isSecureContext : g.isSecureContext !== false;
    this.fftSize = options.fftSize || config.audio.fftSize;
    this.ctx = null; this.stream = null; this.analyser = null; this.buffer = null; this.byteBuffer = null;
    this.running = false;
  }

  MicInput.CONSTRAINTS = CONSTRAINTS;

  MicInput.prototype.isSupported = function () {
    return !!(this.mediaDevices && this.mediaDevices.getUserMedia && this.AudioContextCtor);
  };

  /** map a getUserMedia error to an i18n key */
  MicInput.errorKey = function (err) {
    var n = err && (err.name || err.code);
    if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') return 'mic_denied';
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') return 'mic_nodevice';
    if (n === 'insecure') return 'mic_insecure';
    if (n === 'unsupported') return 'mic_unsupported';
    return 'mic_error';
  };

  /** @returns {Promise<MicInput>} */
  MicInput.prototype.start = function () {
    var self = this;
    if (this.running) return Promise.resolve(this);
    if (!this.isSecure && !(this.mediaDevices && this.mediaDevices.getUserMedia)) {
      return Promise.reject({ name: 'insecure' });
    }
    if (!this.isSupported()) return Promise.reject({ name: 'unsupported' });
    return this.mediaDevices.getUserMedia(CONSTRAINTS).then(function (stream) {
      self.stream = stream;
      self.ctx = new self.AudioContextCtor();
      var src = self.ctx.createMediaStreamSource(stream);
      self.analyser = self.ctx.createAnalyser();
      self.analyser.fftSize = self.fftSize;
      self.analyser.smoothingTimeConstant = 0;
      src.connect(self.analyser); // not connected to destination: no echo of the mic
      self.buffer = new Float32Array(self.analyser.fftSize);
      self.byteBuffer = new Uint8Array(self.analyser.fftSize);
      if (self.ctx.state === 'suspended' && self.ctx.resume) self.ctx.resume();
      self.running = true;
      return self;
    });
  };

  /** @returns {Float32Array|null} latest time-domain samples in -1..1 */
  MicInput.prototype.read = function () {
    if (!this.running || !this.analyser) return null;
    if (this.analyser.getFloatTimeDomainData) {
      this.analyser.getFloatTimeDomainData(this.buffer);
    } else {
      this.analyser.getByteTimeDomainData(this.byteBuffer);
      for (var i = 0; i < this.byteBuffer.length; i++) this.buffer[i] = (this.byteBuffer[i] - 128) / 128;
    }
    return this.buffer;
  };

  MicInput.prototype.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume();
  };

  MicInput.prototype.stop = function () {
    if (this.stream && this.stream.getTracks) this.stream.getTracks().forEach(function (t) { t.stop(); });
    if (this.ctx && this.ctx.close) { try { this.ctx.close(); } catch (e) { /* ignore */ } }
    this.running = false;
    this.ctx = null; this.stream = null; this.analyser = null;
  };

  return { MicInput: MicInput };
});
