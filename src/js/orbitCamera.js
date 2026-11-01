/**
 * RoarBubbles - lightweight orbit camera controls (mouse drag / wheel, touch drag / pinch).
 * Works with any camera exposing position.set(x,y,z) and lookAt(x,y,z).
 */
(function (root, name, deps, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory.apply(null, deps.map(function (d) { return require('./' + d); }));
  } else {
    var ns = (root.RB = root.RB || {});
    ns[name] = factory.apply(null, deps.map(function (d) { return ns[d]; }));
  }
})(typeof self !== 'undefined' ? self : this, 'orbitCamera', ['utils'], function (U) {
  'use strict';

  var DEFAULTS = {
    target: { x: 0, y: 2.8, z: -0.5 },
    distance: 15,
    theta: 0.0, // azimuth around Y (0 = looking toward -z from +z)
    phi: 1.3, // polar angle from +Y
    minDistance: 5,
    maxDistance: 32,
    minPhi: 0.15,
    maxPhi: 1.52,
    rotateSpeed: 0.006,
    zoomSpeed: 0.0015
  };

  function OrbitCamera(camera, options) {
    this.camera = camera;
    this.opts = Object.assign({}, DEFAULTS, options || {});
    this.pointers = {};
    this.pinchDist = 0;
    this.element = null;
    this.reset();
  }

  OrbitCamera.DEFAULTS = DEFAULTS;

  OrbitCamera.prototype.reset = function () {
    var o = this.opts;
    this.target = U.v3copy(o.target);
    this.distance = o.distance;
    this.theta = o.theta;
    this.phi = o.phi;
    this.apply();
  };

  OrbitCamera.prototype.position = function () {
    var s = Math.sin(this.phi);
    return {
      x: this.target.x + this.distance * s * Math.sin(this.theta),
      y: this.target.y + this.distance * Math.cos(this.phi),
      z: this.target.z + this.distance * s * Math.cos(this.theta)
    };
  };

  OrbitCamera.prototype.apply = function () {
    var o = this.opts;
    this.phi = U.clamp(this.phi, o.minPhi, o.maxPhi);
    this.distance = U.clamp(this.distance, o.minDistance, o.maxDistance);
    if (!this.camera) return;
    var p = this.position();
    this.camera.position.set(p.x, p.y, p.z);
    this.camera.lookAt(this.target.x, this.target.y, this.target.z);
  };

  OrbitCamera.prototype.rotate = function (dx, dy) {
    this.theta -= dx * this.opts.rotateSpeed;
    this.phi -= dy * this.opts.rotateSpeed;
    this.apply();
  };

  /** positive delta zooms out */
  OrbitCamera.prototype.zoom = function (delta) {
    this.distance *= Math.exp(delta * this.opts.zoomSpeed);
    this.apply();
  };

  OrbitCamera.prototype._onDown = function (e) {
    this.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (this.element.setPointerCapture) { try { this.element.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    this.pinchDist = this._pinchDistance();
  };

  OrbitCamera.prototype._pinchDistance = function () {
    var ids = Object.keys(this.pointers);
    if (ids.length < 2) return 0;
    var a = this.pointers[ids[0]], b = this.pointers[ids[1]];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  OrbitCamera.prototype._onMove = function (e) {
    var p = this.pointers[e.pointerId];
    if (!p) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    var count = Object.keys(this.pointers).length;
    if (count === 1) this.rotate(dx, dy);
    else if (count === 2) {
      var d = this._pinchDistance();
      if (this.pinchDist > 0 && d > 0) this.zoom((this.pinchDist - d) * 4);
      this.pinchDist = d;
    }
  };

  OrbitCamera.prototype._onUp = function (e) {
    delete this.pointers[e.pointerId];
    this.pinchDist = this._pinchDistance();
  };

  OrbitCamera.prototype._onWheel = function (e) {
    if (e.preventDefault) e.preventDefault();
    this.zoom(e.deltaY);
  };

  OrbitCamera.prototype.attach = function (element) {
    var self = this;
    this.element = element;
    this._handlers = {
      pointerdown: function (e) { self._onDown(e); },
      pointermove: function (e) { self._onMove(e); },
      pointerup: function (e) { self._onUp(e); },
      pointercancel: function (e) { self._onUp(e); },
      pointerleave: function (e) { if (e.pointerType === 'mouse') self._onUp(e); },
      wheel: function (e) { self._onWheel(e); },
      dblclick: function () { self.reset(); }
    };
    Object.keys(this._handlers).forEach(function (k) {
      element.addEventListener(k, self._handlers[k], k === 'wheel' ? { passive: false } : false);
    });
    return this;
  };

  OrbitCamera.prototype.detach = function () {
    var self = this;
    if (!this.element) return;
    Object.keys(this._handlers).forEach(function (k) { self.element.removeEventListener(k, self._handlers[k]); });
    this.element = null;
  };

  return { OrbitCamera: OrbitCamera };
});
