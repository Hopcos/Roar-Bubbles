/**
 * RoarBubbles - Three.js 3D renderer: themed terrain, target zone, iridescent bubble and effects.
 * New terrains can be added with Renderer3D.registerTheme(name, style).
 */
(function (root, name, deps, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory.apply(null, deps.map(function (d) { return require('./' + d); }));
  } else {
    var ns = (root.RB = root.RB || {});
    ns[name] = factory.apply(null, deps.map(function (d) { return ns[d]; }));
  }
})(typeof self !== 'undefined' ? self : this, 'renderer3d', ['config', 'utils', 'orbitCamera'], function (config, U, OC) {
  'use strict';

  function seeded(seed) {
    var s = seed >>> 0 || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /** Terrain height (outside the arena it rises into hills). */
  function terrainHeight(x, z, amp) {
    var d = Math.sqrt(x * x + z * z);
    var h = 0.04 * (1 + Math.sin(x * 0.9) * Math.cos(z * 0.7));
    if (d > 9) h += Math.min(14, Math.pow(d - 9, 1.15) * 0.12 * (amp || 1)) * (0.65 + 0.35 * Math.sin(x * 0.27 + z * 0.19));
    return h;
  }

  var THEMES = {
    meadow: { skyTop: 0x6fb8ff, skyBottom: 0xe8f6ff, fog: 0xdcefff, ground: [0x7cc95e, 0x4f9a3e], hemi: [0xffffff, 0x4f7a3a], hills: 1, clouds: true, props: 'flowers' },
    lake: { skyTop: 0x5aa7e0, skyBottom: 0xd9f0ff, fog: 0xcfe8f7, ground: [0x8bc77c, 0x5d9c5a], hemi: [0xffffff, 0x3c6a5a], hills: 1.2, clouds: true, props: 'lake' },
    desert: { skyTop: 0x7fb6e8, skyBottom: 0xffe7c0, fog: 0xffe2b8, ground: [0xf0cf8a, 0xd6a75a], hemi: [0xfff4e0, 0x9a7440], hills: 0.7, clouds: true, props: 'cactus' },
    snow: { skyTop: 0x8aa8d0, skyBottom: 0xeef4fb, fog: 0xe4edf7, ground: [0xffffff, 0xd2deea], hemi: [0xffffff, 0x8899aa], hills: 1.4, clouds: false, props: 'pines', particles: 'snow' },
    volcano: { skyTop: 0x1a0f1a, skyBottom: 0x6a2a20, fog: 0x3a1c18, ground: [0x4a3a36, 0x2a201e], hemi: [0xffb080, 0x301010], hills: 1.6, clouds: false, props: 'volcano', particles: 'embers' }
  };

  var BUBBLE_VERT = [
    'uniform float uTime; uniform float uStress; uniform float uWobble;',
    'varying vec3 vN; varying vec3 vV;',
    'void main(){',
    '  vec3 p = position;',
    '  float w = sin(p.x*6.0+uTime*7.0)*sin(p.y*5.0+uTime*5.3)*sin(p.z*4.0+uTime*6.1);',
    '  p += normal * w * (0.025 + uStress*0.12 + uWobble*0.06);',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  vN = normalize(normalMatrix * normal);',
    '  vV = normalize(-mv.xyz);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var BUBBLE_FRAG = [
    'uniform float uTime; uniform float uStress; uniform float uGlow; uniform float uOpacity; uniform vec3 uTint;',
    'varying vec3 vN; varying vec3 vV;',
    'void main(){',
    '  vec3 n = normalize(vN); vec3 v = normalize(vV);',
    '  float ndv = clamp(dot(n, v), 0.0, 1.0);',
    '  float fr = pow(1.0 - ndv, 2.2);',
    '  vec3 irid = 0.5 + 0.5*cos(6.2831*(vec3(0.0,0.33,0.67) + fr*1.4 + uTime*0.05 + n.y*0.35));',
    '  vec3 L = normalize(vec3(0.5, 0.8, 0.4)); vec3 H = normalize(L + v);',
    '  float spec = pow(max(dot(n, H), 0.0), 80.0);',
    '  vec3 L2 = normalize(vec3(-0.6, 0.3, 0.5)); float spec2 = pow(max(dot(n, normalize(L2+v)), 0.0), 30.0)*0.35;',
    '  vec3 col = mix(irid, vec3(1.0, 0.3, 0.25), uStress*0.65) * (0.35 + fr) + (spec + spec2) * 1.2 + uTint*uGlow;',
    '  float a = clamp(0.07 + fr*0.85 + spec + spec2 + uGlow*0.25, 0.0, 1.0) * uOpacity;',
    '  gl_FragColor = vec4(col, a);',
    '}'
  ].join('\n');

  var SKY_VERT = 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }';
  var SKY_FRAG = 'uniform vec3 top; uniform vec3 bottom; varying vec3 vW; void main(){ float h = clamp(normalize(vW).y*1.4+0.15, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }';

  function disposeTree(obj) {
    obj.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); });
    });
  }

  function Renderer3D(container, THREE) {
    if (!THREE) throw new Error('three.js not loaded');
    this.THREE = THREE;
    this.container = container;
    this.effects = [];
    this.time = 0;
    this.level = null;
    this.displayRadius = config.bubble.startRadius;
    this.bubbleMode = 'alive';
    this._init();
  }

  Renderer3D.THEMES = THEMES;
  Renderer3D.terrainHeight = terrainHeight;
  Renderer3D.registerTheme = function (name, style) { THEMES[name] = style; };

  Renderer3D.prototype._init = function () {
    var T = this.THREE;
    var r = this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2));
    this.container.appendChild(r.domElement);
    r.domElement.className = 'scene-canvas';

    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(50, 1, 0.1, 400);
    this.orbit = new OC.OrbitCamera(this.camera).attach(r.domElement);

    this.hemi = new T.HemisphereLight(0xffffff, 0x445544, 0.9);
    this.scene.add(this.hemi);
    var sun = new T.DirectionalLight(0xffffff, 0.75);
    sun.position.set(6, 12, 8);
    this.scene.add(sun);

    this.sky = new T.Mesh(new T.SphereGeometry(160, 32, 16), new T.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: T.BackSide, depthWrite: false,
      uniforms: { top: { value: new T.Color(0x6fb8ff) }, bottom: { value: new T.Color(0xe8f6ff) } }
    }));
    this.scene.add(this.sky);

    this.world = new T.Group();
    this.scene.add(this.world);
    this._buildStatic();
    this._buildBubble();
    this.resize();
  };

  /** arena bounds + bubble wand: shared by every level */
  Renderer3D.prototype._buildStatic = function () {
    var T = this.THREE, a = config.arena, s = config.spawn;
    var box = new T.LineSegments(
      new T.EdgesGeometry(new T.BoxGeometry(a.halfWidth * 2, a.height, a.halfDepth * 2)),
      new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 })
    );
    box.position.set(0, a.height / 2, 0);
    this.scene.add(box);
    this.arenaBox = box;

    var wand = new T.Group();
    var ring = new T.Mesh(new T.TorusGeometry(0.3, 0.035, 12, 40), new T.MeshStandardMaterial({ color: 0xff6fa8, roughness: 0.4, metalness: 0.1 }));
    var stick = new T.Mesh(new T.CylinderGeometry(0.03, 0.04, s.y - 0.3, 10), new T.MeshStandardMaterial({ color: 0xffd34d, roughness: 0.6 }));
    stick.position.y = -(s.y - 0.3) / 2 - 0.3;
    wand.add(ring); wand.add(stick);
    wand.position.set(s.x, s.y, s.z);
    this.scene.add(wand);
    this.wand = wand;
  };

  Renderer3D.prototype._buildBubble = function () {
    var T = this.THREE;
    this.bubbleUniforms = {
      uTime: { value: 0 }, uStress: { value: 0 }, uWobble: { value: 0 }, uGlow: { value: 0 },
      uOpacity: { value: 1 }, uTint: { value: new T.Color(0xffd34d) }
    };
    var mat = new T.ShaderMaterial({
      vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG, uniforms: this.bubbleUniforms,
      transparent: true, depthWrite: false
    });
    this.bubble = new T.Mesh(new T.SphereGeometry(1, 48, 32), mat);
    this.bubble.renderOrder = 10;
    this.scene.add(this.bubble);

    this.shadow = new T.Mesh(new T.CircleGeometry(1, 32), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);

    var lineGeo = new T.BufferGeometry();
    lineGeo.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
    this.heightLine = new T.Line(lineGeo, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
    this.scene.add(this.heightLine);
  };

  /** Build the themed world + target zone for a level. */
  Renderer3D.prototype.setLevel = function (level) {
    var T = this.THREE;
    this.level = level;
    this.clearEffects();
    disposeTree(this.world);
    this.world.clear ? this.world.clear() : (this.world.children.length = 0);

    var th = THEMES[level.theme] || THEMES.meadow;
    this.theme = th;
    this.sky.material.uniforms.top.value.set(th.skyTop);
    this.sky.material.uniforms.bottom.value.set(th.skyBottom);
    this.scene.fog = new T.Fog(th.fog, 30, 110);
    this.hemi.color.set(th.hemi[0]);
    this.hemi.groundColor.set(th.hemi[1]);

    this._buildTerrain(th, level.id);
    this._buildProps(th, level.id);
    this._buildZone(level);
    this.particles = th.particles ? this._buildAmbientParticles(th.particles) : null;
    this.resetBubble();
  };

  Renderer3D.prototype._buildTerrain = function (th, seed) {
    var T = this.THREE;
    var geo = new T.PlaneGeometry(220, 220, 110, 110);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    var colors = [];
    var ca = new T.Color(th.ground[0]), cb = new T.Color(th.ground[1]), c = new T.Color();
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i);
      var h = terrainHeight(x, z, th.hills);
      pos.setY(i, h);
      var n = 0.5 + 0.5 * Math.sin(x * 0.45 + seed) * Math.cos(z * 0.37 - seed);
      c.copy(ca).lerp(cb, U.clamp01(n * 0.7 + h * 0.04));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    var mesh = new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true }));
    this.world.add(mesh);

    // arena floor outline
    var a = config.arena;
    var pts = [-a.halfWidth, 0.06, -a.halfDepth, a.halfWidth, 0.06, -a.halfDepth, a.halfWidth, 0.06, a.halfDepth, -a.halfWidth, 0.06, a.halfDepth, -a.halfWidth, 0.06, -a.halfDepth];
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    this.world.add(new T.Line(g, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })));
  };

  /** random prop positions on a ring; keeps the corridor between the default camera and the arena clear */
  Renderer3D.prototype._ringPositions = function (rand, count, minR, maxR) {
    var out = [];
    for (var guard = 0; out.length < count && guard < count * 20; guard++) {
      var ang = rand() * Math.PI * 2, d = minR + rand() * (maxR - minR);
      var x = Math.cos(ang) * d, z = Math.sin(ang) * d;
      if (z > 2 && Math.abs(x) < 13 && d < 28) continue;
      if (Math.abs(x) < 6.6 && Math.abs(z) < 6.6) continue; // keep the arena itself clear
      out.push({ x: x, z: z, y: terrainHeight(x, z, this.theme.hills) });
    }
    return out;
  };

  Renderer3D.prototype._buildProps = function (th, seed) {
    var T = this.THREE, W = this.world, rand = seeded(seed * 97 + 13), self = this;
    function std(color, extra) { return new T.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.8 }, extra || {})); }

    if (th.clouds) {
      var cloudMat = std(0xffffff, { roughness: 1, transparent: true, opacity: 0.92 });
      for (var c = 0; c < 9; c++) {
        var cloud = new T.Group();
        for (var k = 0; k < 4; k++) {
          var puff = new T.Mesh(new T.SphereGeometry(1.4 + rand() * 1.4, 12, 10), cloudMat);
          puff.position.set(k * 1.6 - 2.4, rand() * 0.8, rand() * 1.2);
          cloud.add(puff);
        }
        var ang = rand() * Math.PI * 2, d = 30 + rand() * 40;
        cloud.position.set(Math.cos(ang) * d, 16 + rand() * 12, Math.sin(ang) * d - 10);
        W.add(cloud);
      }
    }

    if (th.props === 'flowers' || th.props === 'lake') {
      var cols = [0xff6fa8, 0xffd34d, 0xffffff, 0xb07cff, 0xff8a4d];
      this._ringPositions(rand, 70, 6.5, 22).forEach(function (p) {
        var stem = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.45, 5), std(0x3f8a32));
        stem.position.set(p.x, p.y + 0.22, p.z);
        var head = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), std(cols[Math.floor(rand() * cols.length)], { roughness: 0.5 }));
        head.position.set(p.x, p.y + 0.47, p.z);
        W.add(stem); W.add(head);
      });
      this._ringPositions(rand, 16, 13, 30).forEach(function (p) { self._tree(p, 1 + rand() * 0.8, 0x3f9a4a); });
    }
    if (th.props === 'lake') {
      var water = new T.Mesh(new T.CircleGeometry(7, 48), new T.MeshPhongMaterial({ color: 0x3aa0d8, transparent: true, opacity: 0.75, shininess: 90, specular: 0xffffff }));
      water.rotation.x = -Math.PI / 2; water.position.set(0, 0.1, -1);
      W.add(water);
      for (var l = 0; l < 10; l++) {
        var pad = new T.Mesh(new T.CircleGeometry(0.35 + rand() * 0.25, 16), std(0x4caf50, { side: T.DoubleSide }));
        var la = rand() * Math.PI * 2, ld = 1 + rand() * 5;
        pad.rotation.x = -Math.PI / 2; pad.position.set(Math.cos(la) * ld, 0.12, Math.sin(la) * ld - 1);
        W.add(pad);
      }
    }
    if (th.props === 'cactus') {
      this._ringPositions(rand, 26, 7, 28).forEach(function (p) {
        var h = 1 + rand() * 1.8, m = std(0x3e8f4a);
        var body = new T.Mesh(new T.CylinderGeometry(0.22, 0.25, h, 10), m);
        body.position.set(p.x, p.y + h / 2, p.z);
        W.add(body);
        if (rand() > 0.4) {
          var arm = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.6, 8), m);
          arm.position.set(p.x + 0.35, p.y + h * 0.6, p.z);
          W.add(arm);
        }
      });
      this._ringPositions(rand, 12, 9, 30).forEach(function (p) {
        var rock = new T.Mesh(new T.DodecahedronGeometry(0.4 + rand() * 0.8, 0), std(0xc08a50));
        rock.position.set(p.x, p.y + 0.2, p.z); W.add(rock);
      });
    }
    if (th.props === 'pines') {
      this._ringPositions(rand, 40, 8, 32).forEach(function (p) { self._pine(p, 1 + rand()); });
      var ice = new T.Mesh(new T.CircleGeometry(5, 40), new T.MeshPhongMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.6, shininess: 120, specular: 0xffffff }));
      ice.rotation.x = -Math.PI / 2; ice.position.set(2, 0.08, -2); W.add(ice);
    }
    if (th.props === 'volcano') {
      var cone = new T.Mesh(new T.ConeGeometry(14, 16, 32, 1, true), std(0x2e2220, { flatShading: true }));
      cone.position.set(-18, 6, -38); W.add(cone);
      var glow = new T.Mesh(new T.SphereGeometry(2.6, 16, 12), new T.MeshBasicMaterial({ color: 0xff5a1a }));
      glow.position.set(-18, 13.6, -38); W.add(glow);
      var lavaMat = new T.MeshBasicMaterial({ color: 0xff6a1a });
      this._ringPositions(rand, 14, 7, 24).forEach(function (p) {
        var pool = new T.Mesh(new T.CircleGeometry(0.6 + rand() * 1.4, 20), lavaMat);
        pool.rotation.x = -Math.PI / 2; pool.position.set(p.x, p.y + 0.05, p.z); W.add(pool);
      });
      this._ringPositions(rand, 20, 8, 30).forEach(function (p) {
        var rock = new T.Mesh(new T.DodecahedronGeometry(0.5 + rand(), 0), std(0x1e1614, { flatShading: true }));
        rock.position.set(p.x, p.y + 0.3, p.z); W.add(rock);
      });
      var lavaLight = new T.PointLight(0xff5a1a, 1.2, 40);
      lavaLight.position.set(0, 3, -6); W.add(lavaLight);
    }
  };

  Renderer3D.prototype._tree = function (p, s, color) {
    var T = this.THREE;
    var trunk = new T.Mesh(new T.CylinderGeometry(0.12 * s, 0.16 * s, 1.2 * s, 8), new T.MeshStandardMaterial({ color: 0x7a5230 }));
    trunk.position.set(p.x, p.y + 0.6 * s, p.z);
    var crown = new T.Mesh(new T.SphereGeometry(0.9 * s, 12, 10), new T.MeshStandardMaterial({ color: color, roughness: 0.9 }));
    crown.position.set(p.x, p.y + 1.6 * s, p.z);
    this.world.add(trunk); this.world.add(crown);
  };

  Renderer3D.prototype._pine = function (p, s) {
    var T = this.THREE;
    var trunk = new T.Mesh(new T.CylinderGeometry(0.1 * s, 0.14 * s, 0.8 * s, 6), new T.MeshStandardMaterial({ color: 0x5a3a20 }));
    trunk.position.set(p.x, p.y + 0.4 * s, p.z);
    this.world.add(trunk);
    for (var i = 0; i < 3; i++) {
      var cone = new T.Mesh(new T.ConeGeometry((0.9 - i * 0.22) * s, 1.1 * s, 10), new T.MeshStandardMaterial({ color: i === 2 ? 0xffffff : 0x2f6a4a, roughness: 0.9 }));
      cone.position.set(p.x, p.y + (1 + i * 0.6) * s, p.z);
      this.world.add(cone);
    }
  };

  Renderer3D.prototype._buildAmbientParticles = function (kind) {
    var T = this.THREE;
    var n = 500, arr = new Float32Array(n * 3), rand = seeded(5);
    for (var i = 0; i < n; i++) {
      arr[i * 3] = (rand() - 0.5) * 50; arr[i * 3 + 1] = rand() * 20; arr[i * 3 + 2] = (rand() - 0.5) * 50;
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(arr, 3));
    var pts = new T.Points(geo, new T.PointsMaterial({
      color: kind === 'snow' ? 0xffffff : 0xff7a2a, size: kind === 'snow' ? 0.12 : 0.09,
      transparent: true, opacity: 0.85, depthWrite: false
    }));
    pts.userData.kind = kind;
    this.world.add(pts);
    return pts;
  };

  Renderer3D.prototype._buildZone = function (level) {
    var T = this.THREE, z = level.zone, c = z.center;
    var g = new T.Group();
    g.position.set(c.x, c.y, c.z);
    var shellMat = new T.MeshBasicMaterial({ color: 0x5fd7ff, transparent: true, opacity: 0.1, depthWrite: false });
    var shell = new T.Mesh(new T.SphereGeometry(z.radius, 40, 24), shellMat);
    var wireMat = new T.MeshBasicMaterial({ color: 0x5fd7ff, wireframe: true, transparent: true, opacity: 0.18, depthWrite: false });
    var wire = new T.Mesh(new T.SphereGeometry(z.radius, 16, 10), wireMat);
    g.add(shell); g.add(wire);

    var ringGroup = new T.Group();
    var minRing = new T.Mesh(new T.TorusGeometry(level.target.minRadius, 0.025, 8, 64), new T.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.85 }));
    var maxRing = new T.Mesh(new T.TorusGeometry(level.target.maxRadius, 0.035, 8, 64), new T.MeshBasicMaterial({ color: 0xff7aa8, transparent: true, opacity: 0.85 }));
    ringGroup.add(minRing); ringGroup.add(maxRing);
    g.add(ringGroup);
    this.world.add(g);

    var groundY = terrainHeight(c.x, c.z, this.theme.hills) + 0.12;
    var ground = new T.Mesh(new T.RingGeometry(z.radius * 0.85, z.radius, 48), new T.MeshBasicMaterial({ color: 0x5fd7ff, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(c.x, groundY, c.z);
    this.world.add(ground);
    var beamH = Math.max(0.01, c.y - z.radius - groundY);
    var beam = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, beamH, 6), new T.MeshBasicMaterial({ color: 0x5fd7ff, transparent: true, opacity: 0.35 }));
    beam.position.set(c.x, groundY + beamH / 2, c.z);
    this.world.add(beam);

    this.zone = { group: g, shellMat: shellMat, wireMat: wireMat, ringGroup: ringGroup, groundMat: ground.material, beamMat: beam.material };
  };

  Renderer3D.prototype.resetBubble = function () {
    var s = config.spawn;
    this.bubbleMode = 'alive';
    this.displayRadius = config.bubble.startRadius;
    this.bubble.visible = true;
    this.bubble.position.set(s.x, s.y, s.z);
    this.bubble.scale.setScalar(this.displayRadius);
    var u = this.bubbleUniforms;
    u.uOpacity.value = 1; u.uGlow.value = 0; u.uStress.value = 0; u.uWobble.value = 0;
  };

  /* ---------------- effects ---------------- */

  Renderer3D.prototype._particleBurst = function (pos, count, opts) {
    var T = this.THREE;
    var positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), vel = [];
    var col = new T.Color();
    for (var i = 0; i < count; i++) {
      var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      var dir = { x: s * Math.cos(th), y: u, z: s * Math.sin(th) };
      var r0 = opts.radius || 0;
      positions[i * 3] = pos.x + dir.x * r0; positions[i * 3 + 1] = pos.y + dir.y * r0; positions[i * 3 + 2] = pos.z + dir.z * r0;
      var sp = opts.speed * (0.5 + Math.random());
      vel.push({ x: dir.x * sp, y: dir.y * sp + (opts.up || 0), z: dir.z * sp });
      col.setHSL(opts.hue !== undefined ? opts.hue + Math.random() * 0.1 : Math.random(), 0.9, 0.7);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(positions, 3));
    geo.setAttribute('color', new T.BufferAttribute(colors, 3));
    var mat = new T.PointsMaterial({ size: opts.size || 0.1, vertexColors: true, transparent: true, opacity: 1, depthWrite: false });
    var pts = new T.Points(geo, mat);
    this.scene.add(pts);
    var life = 0, scene = this.scene;
    this.effects.push({
      update: function (dt) {
        life += dt;
        var p = geo.attributes.position.array;
        for (var i = 0; i < vel.length; i++) {
          vel[i].y -= (opts.gravity || 0) * dt;
          var drag = Math.exp(-(opts.drag || 0.5) * dt);
          vel[i].x *= drag; vel[i].y *= drag; vel[i].z *= drag;
          p[i * 3] += vel[i].x * dt; p[i * 3 + 1] += vel[i].y * dt; p[i * 3 + 2] += vel[i].z * dt;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = Math.max(0, 1 - life / opts.life);
        return life < opts.life;
      },
      dispose: function () { scene.remove(pts); geo.dispose(); mat.dispose(); }
    });
  };

  Renderer3D.prototype._shockwave = function (pos, radius) {
    var T = this.THREE;
    var mesh = new T.Mesh(new T.SphereGeometry(1, 20, 14), new T.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.6, depthWrite: false }));
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.scale.setScalar(radius);
    this.scene.add(mesh);
    var life = 0, scene = this.scene;
    this.effects.push({
      update: function (dt) { life += dt; mesh.scale.setScalar(radius * (1 + life * 5)); mesh.material.opacity = Math.max(0, 0.6 - life * 2); return life < 0.3; },
      dispose: function () { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    });
  };

  Renderer3D.prototype.clearEffects = function () {
    this.effects.forEach(function (e) { e.dispose(); });
    this.effects = [];
  };

  /** React to game events (burst / escape / pass / detach) */
  Renderer3D.prototype.onEvent = function (evt, payload) {
    var p = payload && payload.pos;
    if (evt === 'burst') {
      this.bubbleMode = 'burst';
      this.bubble.visible = false;
      this._particleBurst(p, 220, { radius: payload.radius, speed: 2.4, gravity: 4, life: 1.1, size: 0.08 });
      this._shockwave(p, payload.radius);
    } else if (evt === 'escape') {
      this.bubbleMode = 'escape';
      var v = payload.vel || { x: 0, y: 1, z: 0 };
      var l = Math.max(0.5, Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z));
      this.escapeVel = { x: v.x / l * 4, y: v.y / l * 4 + 2, z: v.z / l * 4 };
      this.escapeTime = 0;
    } else if (evt === 'pass') {
      this.bubbleMode = 'pass';
      var c = this.level.zone.center;
      this._particleBurst(c, 260, { speed: 4, up: 3, gravity: 5, life: 2.2, size: 0.13, drag: 0.8 });
    } else if (evt === 'detach') {
      this._particleBurst(p, 30, { speed: 0.8, gravity: 1, life: 0.6, size: 0.05, hue: 0.55 });
    }
  };

  /**
   * Per-frame update.
   * @param {object} snap GameEngine snapshot (may be null before the first level)
   * @param {number} dt
   */
  Renderer3D.prototype.update = function (snap, dt) {
    this.time += dt;
    var u = this.bubbleUniforms;
    u.uTime.value = this.time;

    if (snap && this.level) {
      var b = snap.bubble;
      if (this.bubbleMode === 'alive') {
        this.displayRadius += (b.radius - this.displayRadius) * U.smoothing(dt, 0.05);
        this.bubble.position.set(b.pos.x, b.pos.y, b.pos.z);
        this.bubble.scale.setScalar(this.displayRadius);
        u.uStress.value = b.stress;
        u.uWobble.value = snap.audio ? snap.audio.volume : 0;
      } else if (this.bubbleMode === 'escape') {
        this.escapeTime += dt;
        var bp = this.bubble.position;
        bp.x += this.escapeVel.x * dt; bp.y += this.escapeVel.y * dt; bp.z += this.escapeVel.z * dt;
        this.escapeVel.y += 1.5 * dt;
        u.uOpacity.value = Math.max(0, 1 - this.escapeTime / 1.6);
        if (u.uOpacity.value <= 0) this.bubble.visible = false;
      } else if (this.bubbleMode === 'pass') {
        u.uGlow.value = Math.min(1, u.uGlow.value + dt * 1.5);
        this.bubble.position.y += dt * 0.6;
      }

      var e = snap.eval || {};
      var zc = (e.inZone && e.sizeOk) ? 0x4dff88 : e.inZone ? 0xffd34d : 0x5fd7ff;
      var pulse = 0.5 + 0.5 * Math.sin(this.time * ((e.inZone && e.sizeOk) ? 8 : 2.5));
      this.zone.shellMat.color.set(zc); this.zone.wireMat.color.set(zc);
      this.zone.groundMat.color.set(zc); this.zone.beamMat.color.set(zc);
      this.zone.shellMat.opacity = 0.07 + 0.08 * pulse + (e.holdProgress || 0) * 0.12;
      this.zone.ringGroup.lookAt(this.camera.position);

      var visible = this.bubble.visible;
      var bpos = this.bubble.position;
      var gy = terrainHeight(bpos.x, bpos.z, this.theme.hills) + 0.07;
      this.shadow.visible = visible;
      this.shadow.position.set(bpos.x, gy, bpos.z);
      this.shadow.scale.setScalar(Math.max(0.05, this.displayRadius * (1 - Math.min(0.6, (bpos.y - gy) * 0.06))));
      this.shadow.material.opacity = 0.22 * Math.max(0.2, 1 - (bpos.y - gy) * 0.08) * u.uOpacity.value;
      var lp = this.heightLine.geometry.attributes.position;
      lp.setXYZ(0, bpos.x, gy, bpos.z); lp.setXYZ(1, bpos.x, bpos.y - this.displayRadius, bpos.z);
      lp.needsUpdate = true;
      this.heightLine.visible = visible && this.bubbleMode === 'alive';
    }

    if (this.particles) {
      var arr = this.particles.geometry.attributes.position.array;
      var snow = this.particles.userData.kind === 'snow';
      for (var i = 0; i < arr.length; i += 3) {
        arr[i + 1] += (snow ? -0.8 : 1.1) * dt;
        arr[i] += Math.sin(this.time + i) * 0.2 * dt;
        if (snow && arr[i + 1] < 0) arr[i + 1] = 20;
        if (!snow && arr[i + 1] > 20) arr[i + 1] = 0;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }

    this.wand.lookAt(this.camera.position.x, this.wand.position.y, this.camera.position.z);

    for (var k = this.effects.length - 1; k >= 0; k--) {
      if (!this.effects[k].update(dt)) { this.effects[k].dispose(); this.effects.splice(k, 1); }
    }
    this.renderer.render(this.scene, this.camera);
  };

  Renderer3D.prototype.resize = function () {
    var w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the arena in view on narrow (portrait) screens
    this.camera.fov = w / h < 0.8 ? 68 : 50;
    this.camera.updateProjectionMatrix();
  };

  return { Renderer3D: Renderer3D, THEMES: THEMES, terrainHeight: terrainHeight };
});
