// Three.js Shader-powered interactive VFX for Rotation V3 Tool Rail:
// 1. Soft breathing lime-green halo hugging tool item frames (arcade power aura)
// 2. Gentle soft-expanding halo ripple wave spreading on click
// 3. Crisp pixel-block confetti particles (matching game's 16-bit tetromino & pixel UI)
//
// Pure WebGL ShaderMaterial — NO SVG, NO external textures.

globalThis.createRotationToolFx = function({ stage, rail, THREE }) {
  if (!stage || !rail || !THREE) return null;

  // 1. Create overlay transparent canvas
  let canvas = stage.querySelector('#lite-tool-fx-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'lite-tool-fx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6;border-radius:inherit;';
    stage.append(canvas);
  }

  // 2. Three.js Scene, Camera, and WebGLRenderer
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, stage.clientWidth || 390, 0, stage.clientHeight || 844, -200, 200);
  camera.position.z = 10;

  const maxHalos = 12;
  const maxRipples = 16;
  const maxParticles = 140;

  const matrixHelper = new THREE.Matrix4();
  const scaleHelper = new THREE.Vector3();
  const colorHelper = new THREE.Color();
  const InstancedAttr = THREE.InstancedBufferAttribute || THREE.BufferAttribute;

  // Track active click flash punches for individual tool buttons
  const buttonPunches = new Map();

  // ==========================================
  // SHADER 1: Breathing Lime-Green Halo (Aura Hugging Button)
  // Perfectly proportioned to hug the circular tool button
  // ==========================================
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  const haloMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: 2,
    uniforms: {
      uTime: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vTint;
      void main() {
        vUv = uv;
        vTint = instanceColor;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vTint;

      void main() {
        vec2 p = (vUv - 0.5) * 2.0; // [-1, 1]
        float dist = length(p);

        // Smooth breathing pulse (~2.6s cycle)
        float breath = 0.5 + 0.5 * sin(uTime * 2.4 + vTint.b * 3.14159);
        float clickPunch = vTint.g; // 0.0 -> 1.0

        // Button occupies r ~ 0.56 in this quad
        float btnR = 0.56;
        float punchExpand = 0.05 * clickPunch;
        float ringCenter = btnR + 0.04 + 0.035 * breath + punchExpand;
        float ringThick  = 0.055 + 0.025 * breath + 0.03 * clickPunch;

        float dRing = abs(dist - ringCenter);

        // Soft, controlled gaussian-like glow hugging the rim (not a huge blurry fog)
        float glowSharp = exp(-pow(dRing / ringThick, 2.0) * 3.5);
        float glowSoft  = exp(-pow(dRing / (ringThick * 2.1), 2.0) * 2.0) * 0.45;
        float intensity = glowSharp + glowSoft;

        // Clean masking: cut off button interior so icon remains 100% crisp
        float innerMask = smoothstep(btnR - 0.03, btnR + 0.015, dist);
        // Outer falloff so it never bleeds excessively into neighbor buttons
        float outerMask = smoothstep(1.0, 0.78, dist);
        intensity *= innerMask * outerMask;

        // Subtle organic rotation shimmer around the ring
        float angle = atan(p.y, p.x);
        float shimmer = 1.0 + 0.08 * sin(angle * 3.0 - uTime * 2.0);
        intensity *= shimmer;

        // Enabled scale + punch boost
        float enabledScale = vTint.r;
        intensity *= enabledScale * (0.65 + 0.25 * breath + clickPunch * 1.6);

        if (intensity <= 0.003) discard;

        // Color palette: game's vibrant lime-green (#c4ff17) + bright core (#efff79)
        vec3 limeGreen = vec3(0.769, 1.000, 0.090); // #c4ff17 iconic game lime
        vec3 brightCore = vec3(0.940, 1.000, 0.650); // #efff79 luminous core
        vec3 punchWhite = vec3(1.000, 1.000, 1.000); // punch flash

        float coreMix = exp(-pow(dRing / (ringThick * 0.6), 2.0) * 4.0);
        vec3 col = mix(limeGreen, brightCore, clamp(coreMix, 0.0, 1.0));
        col = mix(col, punchWhite, clickPunch * 0.75);

        gl_FragColor = vec4(col, intensity);
      }
    `
  });

  const haloMesh = new THREE.InstancedMesh(haloGeo, haloMaterial, maxHalos);
  haloMesh.instanceColor = new InstancedAttr(new Float32Array(maxHalos * 3), 3);
  haloMesh.count = 0;
  haloMesh.frustumCulled = false;
  scene.add(haloMesh);

  // ==========================================
  // SHADER 2: Soft Expanding Halo Ripple Wave (柔和光晕波纹)
  // Expands smoothly from button rim outward with gentle luminous diffusion
  // ==========================================
  const rippleGeo = new THREE.PlaneGeometry(1, 1);
  const rippleMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: 2,
    uniforms: {},
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vTint;
      void main() {
        vUv = uv;
        vTint = instanceColor;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      varying vec3 vTint;

      void main() {
        float progress = vTint.r; // 0.0 -> 1.0
        if (progress <= 0.0 || progress >= 1.0) discard;

        vec2 p = (vUv - 0.5) * 2.0;
        float dist = length(p);

        // Smooth cubic ease-out wavefront
        float ease = 1.0 - pow(1.0 - progress, 2.6);
        float ringR = 0.22 + 0.72 * ease;
        float ringW = 0.08 + 0.12 * progress;

        // Bell-curve soft wave crest
        float dRing = abs(dist - ringR);
        float crest = exp(-pow(dRing / ringW, 2.0) * 4.5);

        // Soft secondary inner wash (trailing gentle aura)
        float innerWash = smoothstep(ringR, max(0.18, ringR - ringW * 2.2), dist) *
                          smoothstep(0.16, ringR - ringW * 0.5, dist) * 0.35;

        // Cut inside the tool button itself
        float buttonHole = smoothstep(0.18, 0.24, dist);

        // Energy dissipation over lifetime
        float lifeFade = pow(1.0 - progress, 1.4);
        float alpha = (crest * 0.85 + innerWash) * lifeFade * buttonHole;
        alpha *= smoothstep(1.0, 0.86, dist);

        if (alpha <= 0.003) discard;

        // Soft gradient: starts luminous lime-green, gently shifts to ethereal mint/cyan at crest
        vec3 lime = vec3(0.769, 1.000, 0.090); // #c4ff17
        vec3 cyan = vec3(0.350, 0.920, 0.980); // #59ebfa
        vec3 core = vec3(0.960, 1.000, 0.920); // soft white core

        vec3 col = mix(lime, cyan, progress * 0.75);
        col = mix(col, core, crest * 0.45);

        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  const rippleMesh = new THREE.InstancedMesh(rippleGeo, rippleMaterial, maxRipples);
  rippleMesh.instanceColor = new InstancedAttr(new Float32Array(maxRipples * 3), 3);
  rippleMesh.count = 0;
  rippleMesh.frustumCulled = false;
  scene.add(rippleMesh);

  // ==========================================
  // SHADER 3: Crisp 16-bit Pixel-Block Confetti Particles (随机方块粒子)
  // Perfectly matches the game's tetromino blocks and pixel art aesthetic
  // ==========================================
  const particleGeo = new THREE.PlaneGeometry(1, 1);
  const particleParamsArray = new Float32Array(maxParticles * 4); // [progress, type, seed, boost]
  const particleParamsAttribute = new InstancedAttr(particleParamsArray, 4);
  particleGeo.setAttribute('aParams', particleParamsAttribute);

  const particleMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: 2,
    uniforms: {
      uTime: { value: 0 }
    },
    vertexShader: `
      attribute vec4 aParams;
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec4 vParams;
      void main() {
        vUv = uv;
        vColor = instanceColor;
        vParams = aParams;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec4 vParams; // x: progress, y: type, z: seed, w: boost

      void main() {
        float progress = vParams.x;
        float pType = vParams.y;
        float seed = vParams.z;
        float boost = vParams.w;

        if (progress <= 0.0 || progress >= 1.0) discard;

        vec2 p = (vUv - 0.5) * 2.0; // [-1, 1]

        // -------------------------------------------------------------
        // TYPE 0: Pixel Gem Block (Hero crisp square with 16-bit bevel border)
        // -------------------------------------------------------------
        if (pType < 0.5) {
          // Hard-edge square — crisp pixel cut
          float boxDist = max(abs(p.x), abs(p.y));
          if (boxDist > 0.85) discard;

          // 16-bit pixel block shading (top-left light rim, bottom-right shadow)
          float lightRim = step(p.x + p.y, -0.4) * 0.22;
          float darkRim  = step(0.4, p.x + p.y) * 0.22;

          // Inner bright pixel core
          float centerGlint = step(boxDist, 0.45) * 0.12;

          vec3 col = vColor * (1.0 + lightRim + centerGlint - darkRim);

          // Click pop flash
          col += vec3(1.0) * boost * 0.45;

          float lifeFade = 1.0 - smoothstep(0.65, 1.0, progress);
          gl_FragColor = vec4(col, lifeFade);
        }
        // -------------------------------------------------------------
        // TYPE 1: Micro Pixel Shard (small 1-pixel style square dot)
        // -------------------------------------------------------------
        else if (pType < 1.5) {
          float boxDist = max(abs(p.x), abs(p.y));
          if (boxDist > 0.88) discard;

          vec3 col = vColor;
          col += vec3(1.0) * boost * 0.55;

          float alpha = 1.0 - smoothstep(0.55, 1.0, progress);
          gl_FragColor = vec4(col, alpha);
        }
        // -------------------------------------------------------------
        // TYPE 2: Pixel Sparkle Star (pixel cross / plus sign)
        // -------------------------------------------------------------
        else {
          float armH = step(abs(p.y), 0.30) * step(abs(p.x), 0.88);
          float armV = step(abs(p.x), 0.30) * step(abs(p.y), 0.88);
          float cross = max(armH, armV);
          if (cross < 0.5) discard;

          // Gentle twinkle over time
          float twinkle = 0.7 + 0.35 * sin(uTime * 18.0 + seed * 6.28);
          vec3 col = mix(vColor, vec3(1.0), 0.55);

          float alpha = twinkle * (1.0 - smoothstep(0.6, 1.0, progress));
          gl_FragColor = vec4(col, alpha);
        }
      }
    `
  });

  const particleMesh = new THREE.InstancedMesh(particleGeo, particleMaterial, maxParticles);
  particleMesh.instanceColor = new InstancedAttr(new Float32Array(maxParticles * 3), 3);
  particleMesh.count = 0;
  particleMesh.frustumCulled = false;
  scene.add(particleMesh);

  // ==========================================
  // SHADER 4: Score Bar Overcharge Chugging ("突突"爆分充能传导条)
  // Left-to-right energy wave slamming into a pulsing right-end bulge,
  // with temperature progression: Lime (#c4ff17) -> Gold (#ffe24f) -> White + Prismatic
  // ==========================================
  const scoreBarGeo = new THREE.PlaneGeometry(1, 1);
  const scoreBarMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: 2,
    uniforms: {
      uTime: { value: 0 },
      uBarSize: { value: new THREE.Vector3(260, 6, 0) },
      uQuadSize: { value: new THREE.Vector3(320, 56, 0) },
      uPad: { value: new THREE.Vector3(18, 25, 0) },
      uState: { value: new THREE.Vector3(0, 0, 0) } // x: overflowRatio, y: chugPulse, z: breachFlash
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform vec3 uBarSize;
      uniform vec3 uQuadSize;
      uniform vec3 uPad;
      uniform vec3 uState;
      varying vec2 vUv;

      float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
      }

      void main() {
        float overflowRatio = max(0.0, uState.x);
        float chugPulse = clamp(uState.y, 0.0, 1.35);
        float breachFlash = clamp(uState.z, 0.0, 1.0);

        // Normalized heat tiers:
        // goldMix: 0 -> 1 across overflowRatio [0.06 .. 0.32]
        // prismMix: 0 -> 1 across overflowRatio [0.32 .. 0.68]
        float goldMix = smoothstep(0.06, 0.32, overflowRatio);
        float prismMix = smoothstep(0.32, 0.68, overflowRatio);
        float heat = clamp(overflowRatio / 0.55, 0.0, 1.0);

        // Pixel coordinates relative to #goal-track:
        // px in [0, uBarSize.x], py = 0 at vertical center of #goal-track
        float px = vUv.x * uQuadSize.x - uPad.x;
        float py = (vUv.y - 0.5) * uQuadSize.y;

        float barW = max(10.0, uBarSize.x);
        float barH = max(5.0, uBarSize.y);
        float xNorm = clamp(px / barW, 0.0, 1.0);

        // Smooth UV boundary feather so glow NEVER touches the quad edge (zero texture seam)
        float uvFadeX = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
        float uvFadeY = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.78, vUv.y);
        float uvFade = uvFadeX * uvFadeY;

        // High-speed charge packets racing from left (0.0) to right (1.0)
        float waveSpeed = 3.8 + 1.8 * heat;
        float packetPhase = fract(xNorm * 1.65 - uTime * waveSpeed);
        float packetCrest = pow(1.0 - packetPhase, 2.8) * smoothstep(0.0, 0.12, packetPhase);
        float fastWave = 0.5 + 0.5 * sin(xNorm * 16.0 - uTime * 34.0);

        // Right-end impact zone (where waves slam into the 100% cap and bulge out)
        float headZone = smoothstep(0.72, 1.0, xNorm);

        // Elastic vertical jitter ("突突" vibration, stronger toward right tip)
        float jitterAmp = (0.40 + 0.90 * headZone) * chugPulse * (0.65 + 0.50 * heat);
        float yJitter = sin(uTime * 84.0 + xNorm * 11.0) * jitterAmp;

        // Right tip punches/juts outward on every chug beat
        float rightTipX = barW + (2.8 + 4.2 * heat) * chugPulse + 1.2 * fastWave * chugPulse;

        // Bar half-thickness with traveling wave swell + compact right-end nozzle bulge
        float baseHalfH = barH * 0.50;
        float barPump = 1.0 + (0.18 + 0.14 * heat) * chugPulse;
        float waveSwell = 1.0 + 0.22 * packetCrest * smoothstep(0.08, 0.92, xNorm);
        float tipSwell = 1.0 + (0.55 + 0.35 * heat) * (0.28 + 0.72 * chugPulse) * pow(headZone, 1.8);
        float localRadius = baseHalfH * barPump * waveSwell * tipSwell;

        // Distance to deformed bar spine
        float clampedX = clamp(px, 0.0, rightTipX);
        float dBar = length(vec2(px - clampedX, py - yJitter)) - localRadius;

        // Compact pulsing energy nozzle at the right tip ("突突"喷嘴鼓包)
        float knotCenterX = rightTipX - 2.0;
        float knotRadius = baseHalfH * (1.15 + (0.85 + 0.45 * heat) * chugPulse + 0.25 * breachFlash);
        float dKnot = length(vec2((px - knotCenterX) * 0.82, py - yJitter)) - knotRadius;

        float d = smin(dBar, dKnot, 2.4);

        // Crisp core mask and finite-support Gaussian outer glow (strictly 0 before quad edge)
        float coreMask = 1.0 - smoothstep(-0.7, 0.8, d);
        float innerHighlight = 1.0 - smoothstep(-localRadius * 0.85, -localRadius * 0.15, d);

        float rimMaxDist = 14.0 + 6.0 * chugPulse + 4.0 * heat;
        float rimNorm = clamp(max(0.0, d) / rimMaxDist, 0.0, 1.0);
        float rimGlow = exp(-rimNorm * rimNorm * 5.5) * (1.0 - rimNorm) * (0.52 + 0.38 * chugPulse);

        float flareDist = length(vec2((px - knotCenterX) * 0.68, py - yJitter));
        float flareMaxDist = 22.0 + 10.0 * chugPulse + 6.0 * breachFlash;
        float flareNorm = clamp(flareDist / flareMaxDist, 0.0, 1.0);
        float headFlare = exp(-flareNorm * flareNorm * 5.0) * (1.0 - flareNorm)
                          * (0.42 + 0.52 * chugPulse + 0.60 * breachFlash);

        float alpha = clamp(coreMask + (rimGlow * 0.72 + headFlare * 0.78) * uvFade, 0.0, 1.0);
        if (alpha <= 0.002) discard;

        // Diagonal >>> energy chevrons pointing RIGHT (+abs(py)) and racing left-to-right
        float chevronCoord = (px * 0.28 + abs(py - yJitter) * 0.82 - uTime * (26.0 + 10.0 * heat));
        float chevron = smoothstep(-0.18, 0.38, sin(chevronCoord));

        // Color Palette Progression (Game-authentic Lime -> Gold -> Ice-Cyan/White):
        // 1. Lime (#c4ff17)
        vec3 limeBase = vec3(0.769, 1.000, 0.090);
        vec3 limeBright = vec3(0.945, 1.000, 0.580);
        // 2. Radiant Gold (#ffcc24 -> #ffe875)
        vec3 goldBase = vec3(1.000, 0.780, 0.140);
        vec3 goldBright = vec3(1.000, 0.950, 0.560);
        // 3. Overdrive Cyan-Gold-White
        vec3 prismWave = mix(
          vec3(0.380, 0.940, 1.000),
          vec3(1.000, 0.900, 0.320),
          0.5 + 0.5 * sin(6.28318 * (xNorm * 1.25 - uTime * 3.0))
        );

        vec3 bodyCol = mix(limeBase, goldBase, goldMix);
        bodyCol = mix(bodyCol, prismWave, prismMix * 0.75);

        vec3 brightCol = mix(limeBright, goldBright, goldMix);
        brightCol = mix(brightCol, vec3(1.0, 1.0, 1.0), prismMix * 0.85);

        // Combine chevron stripes, traveling charge packet, and right-tip white-hot compression
        float energyBand = clamp(0.38 * chevron + 0.52 * packetCrest + 0.42 * innerHighlight, 0.0, 1.0);
        vec3 col = mix(bodyCol, brightCol, energyBand);

        // White-hot flash at the right bulge during each chug pulse & initial breach
        float whiteHot = clamp(headZone * (0.45 * chugPulse + 0.35 * packetCrest) + headFlare * 0.60 + breachFlash * 0.70, 0.0, 1.0);
        col = mix(col, vec3(1.0, 1.0, 0.96), whiteHot);

        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  const scoreBarMesh = new THREE.InstancedMesh(scoreBarGeo, scoreBarMaterial, 1);
  scoreBarMesh.count = 0;
  scoreBarMesh.frustumCulled = false;
  scene.add(scoreBarMesh);

  // Game Authentic Color Palette:
  // Lime, Sky Blue, Cyan, White, and Orange (matching the game's tetrominoes)
  const PALETTE = [
    [0.769, 1.000, 0.090], // #c4ff17  lime (primary)
    [0.937, 1.000, 0.475], // #efff79  bright lime
    [0.224, 0.863, 0.918], // #39dcea  vivid cyan
    [0.450, 0.760, 0.990], // #73c2fd  sky blue
    [0.960, 0.988, 1.000], // #f5fcff  sparkle white
    [1.000, 0.650, 0.250], // #ffa640  warm orange (tetromino accent)
  ];

  const GOLD_PALETTE = [
    [1.000, 0.890, 0.310], // #ffe24f radiant gold
    [0.769, 1.000, 0.090], // #c4ff17 lime accent
    [1.000, 0.965, 0.720], // #fff6b8 white-gold
    [0.960, 0.995, 1.000], // #f5feff crisp white
  ];

  const PRISM_PALETTE = [
    [1.000, 1.000, 1.000], // pure white
    [0.769, 1.000, 0.090], // #c4ff17 lime
    [1.000, 0.890, 0.310], // #ffe24f solar gold
    [0.396, 0.918, 1.000], // #65eaff ice cyan
  ];

  // Active effect state
  const ripples = [];
  const particles = [];
  let lastBurstTime = 0;
  let animId = 0;
  let lastTime = performance.now();

  // Score Bar Overcharge ("突突"爆分) state
  const overcharge = {
    active: false,
    stageKey: '',
    displayScore: 0,
    goalScore: 100,
    overflowRatio: 0,
    chugPulse: 0,
    breachFlash: 0,
    lastChugAt: 0,
    holdStartedAt: null,
    holdCompletedStageKey: '',
    HOLD_DURATION_MS: 550
  };

  function pickOverchargeColor(ratio) {
    if (ratio >= 0.38) return PRISM_PALETTE[Math.floor(Math.random() * PRISM_PALETTE.length)];
    if (ratio >= 0.12) return GOLD_PALETTE[Math.floor(Math.random() * GOLD_PALETTE.length)];
    return PALETTE[Math.floor(Math.random() * 2)]; // Lime / Bright Lime
  }

  function spawnScoreBarSparks(tx, ty, barW, barH, ratio, isBreach = false) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced && !isBreach) return;

    const heat = Math.min(1.0, Math.max(0.0, ratio / 0.5));
    const count = isBreach
      ? (reduced ? 5 : 12)
      : (2 + Math.floor(Math.random() * 2) + (heat > 0.35 ? 1 : 0));

    for (let i = 0; i < count; i++) {
      if (particles.length >= maxParticles) particles.shift();

      const r = Math.random();
      // Keep nozzle particles as crisp pixel cubes (type 0 and type 1)
      const pType = r < 0.55 ? 0 : 1;

      // Eject from the right nozzle tip of the bar
      const alongRight = isBreach ? (0.85 + Math.random() * 0.15) : (0.94 + Math.random() * 0.08);
      const px = tx + barW * alongRight;
      const py = ty + (Math.random() - 0.5) * (barH + 2);

      // Tight nozzle spray cone to the right (-42deg .. +42deg)
      const spreadAngle = (Math.random() - 0.5) * Math.PI * (isBreach ? 0.72 : 0.46);
      const speedBase = isBreach ? 95 : (72 + 55 * heat);
      const speed = speedBase + Math.random() * (isBreach ? 90 : 68);

      const vx = Math.cos(spreadAngle) * speed + 24;
      const vy = Math.sin(spreadAngle) * speed - 12;

      const baseSize = pType === 0
        ? (4.0 + Math.random() * 2.8 + heat * 0.8)
        : (2.6 + Math.random() * 2.0);
      const life = isBreach ? (0.34 + Math.random() * 0.20) : (0.22 + Math.random() * 0.16);

      particles.push({
        x: px,
        y: py,
        vx,
        vy,
        rotZ: Math.random() * Math.PI * 2,
        vRotZ: (Math.random() - 0.5) * 8.0,
        baseSize,
        type: pType,
        seed: Math.random(),
        color: pickOverchargeColor(ratio),
        age: 0,
        maxLife: life
      });
    }
  }

  function pulseScoreDigits(ratio, isBreach = false) {
    const scoreNode = stage.querySelector('#level-score');
    if (!scoreNode || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const heat = Math.min(1.0, Math.max(0.0, ratio / 0.5));
    const pulse = Math.min(1.3, Math.max(0.0, overcharge.chugPulse));
    if (pulse <= 0.02 && !isBreach) {
      scoreNode.style.transform = '';
      return;
    }
    const scalePeak = 1.0 + (isBreach ? 0.24 : (0.10 + 0.08 * heat)) * pulse;
    const liftY = -(1.8 + 1.4 * heat) * pulse;
    scoreNode.style.transform = `translateY(${liftY.toFixed(1)}px) scale(${scalePeak.toFixed(3)})`;
  }

  function triggerChugBeat(isBreach = false) {
    const trackEl = stage.querySelector('#goal-track');
    if (!trackEl) return;
    const sRect = stage.getBoundingClientRect();
    const tRect = trackEl.getBoundingClientRect();
    if (tRect.width <= 0) return;

    const tx = tRect.left - sRect.left;
    const ty = tRect.top + tRect.height / 2 - sRect.top;

    overcharge.chugPulse = isBreach ? 1.30 : Math.max(overcharge.chugPulse, 1.0);
    if (isBreach) overcharge.breachFlash = 1.0;
    overcharge.lastChugAt = performance.now();

    spawnScoreBarSparks(tx, ty, tRect.width, tRect.height, overcharge.overflowRatio, isBreach);
    pulseScoreDigits(overcharge.overflowRatio, isBreach);
  }

  function syncScoreBar({ stageKey, displayScore, goalScore, visible = true } = {}) {
    const trackEl = stage.querySelector('#goal-track');
    if (!visible || !trackEl || goalScore <= 0 || displayScore < goalScore) {
      if (overcharge.active) {
        overcharge.active = false;
        overcharge.chugPulse = 0;
        overcharge.breachFlash = 0;
        scoreBarMesh.count = 0;
        if (trackEl) {
          delete trackEl.dataset.overcharge;
          delete trackEl.dataset.overchargeTier;
        }
        const scoreNode = stage.querySelector('#level-score');
        if (scoreNode?.style) scoreNode.style.transform = '';
      }
      if (stageKey && stageKey !== overcharge.stageKey) {
        overcharge.stageKey = stageKey;
        overcharge.holdStartedAt = null;
      }
      return;
    }

    const nextRatio = Math.max(0, displayScore - goalScore) / Math.max(1, goalScore);
    const wasActive = overcharge.active && overcharge.stageKey === stageKey;
    const scoreIncreased = wasActive && displayScore > overcharge.displayScore;

    overcharge.stageKey = stageKey;
    overcharge.displayScore = displayScore;
    overcharge.goalScore = goalScore;
    overcharge.overflowRatio = nextRatio;
    overcharge.active = true;
    trackEl.dataset.overcharge = 'true';
    trackEl.dataset.overchargeTier = nextRatio > 0.40 ? '2' : nextRatio >= 0.15 ? '1' : '0';

    if (!wasActive) {
      triggerChugBeat(true);
    } else if (scoreIncreased && performance.now() - overcharge.lastChugAt >= 42) {
      triggerChugBeat(false);
    }
  }

  function resetScoreBar() {
    const trackEl = stage.querySelector('#goal-track');
    overcharge.active = false;
    overcharge.chugPulse = 0;
    overcharge.breachFlash = 0;
    overcharge.holdStartedAt = null;
    scoreBarMesh.count = 0;
    if (trackEl) {
      delete trackEl.dataset.overcharge;
      delete trackEl.dataset.overchargeTier;
    }
    const scoreNode = stage.querySelector('#level-score');
    if (scoreNode?.style) scoreNode.style.transform = '';
  }

  function shouldHoldCompletion(game, now = performance.now()) {
    if (!game || !['checkpoint-complete', 'level-complete'].includes(game.phase)) return false;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const key = `${game.stage}:${game.checkpoint}`;
    if (overcharge.holdCompletedStageKey === key) return false;
    if ((game.checkpointScore || 0) < (game.goal || 0)) return false;

    if (overcharge.holdStartedAt === null || overcharge.stageKey !== key) {
      overcharge.stageKey = key;
      overcharge.holdStartedAt = now;
      // Ensure overcharge bar is visibly active during the 0.55s climax hold
      syncScoreBar({
        stageKey: key,
        displayScore: Math.max(game.goal || 1, game.checkpointScore || 0),
        goalScore: Math.max(1, game.goal || 1),
        visible: true
      });
    }

    if (now - overcharge.holdStartedAt < overcharge.HOLD_DURATION_MS) {
      return true;
    }

    overcharge.holdCompletedStageKey = key;
    overcharge.holdStartedAt = null;
    return false;
  }

  function skipOverchargeHold(game) {
    if (game) {
      overcharge.holdCompletedStageKey = `${game.stage}:${game.checkpoint}`;
    }
    overcharge.holdStartedAt = null;
    resetScoreBar();
  }

  // Resize canvas to match #stage dimensions & DPR
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w <= 0 || h <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.left = 0;
      camera.right = w;
      camera.top = 0;
      camera.bottom = h;
      camera.updateProjectionMatrix();
    }
  }

  // Trigger ripple wave + scattering square particles at stage-relative coordinates (cx, cy)
  function triggerBurst(cx, cy, sourceBtn = null) {
    const now = performance.now();
    if (now - lastBurstTime < 70) return;
    lastBurstTime = now;

    if (sourceBtn) {
      buttonPunches.set(sourceBtn, { energy: 1.0, decayRate: 3.4 });
    }

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 1. Soft expanding halo ripple wave
    ripples.push({
      x: cx,
      y: cy,
      age: 0,
      maxLife: reduced ? 0.40 : 0.70,
      maxRadius: reduced ? 80 : 135
    });
    if (ripples.length > maxRipples) ripples.shift();

    // 2. Random pixel-block particles scattering (方块粒子散开)
    // 12-16 square blocks, 6-10 micro shards, 3-5 sparkle crosses
    const squareCount = reduced ? 6 : (12 + Math.floor(Math.random() * 5));
    const shardCount  = reduced ? 4 : (7 + Math.floor(Math.random() * 4));
    const sparkCount  = reduced ? 2 : (3 + Math.floor(Math.random() * 3));
    const totalCount  = squareCount + shardCount + sparkCount;

    for (let i = 0; i < totalCount; i++) {
      if (particles.length >= maxParticles) particles.shift();

      let pType;
      if (i < squareCount) pType = 0;
      else if (i < squareCount + shardCount) pType = 1;
      else pType = 2;

      // Full 360-degree burst biased outward/leftward into the playing field
      const angle = Math.random() * Math.PI * 2;
      let speed, baseSize, life;

      if (pType === 0) {
        // Hero Square Blocks: 8px - 14px crisp pixel blocks
        speed = reduced ? (60 + Math.random() * 60) : (100 + Math.random() * 130);
        baseSize = 8 + Math.random() * 6;
        life = reduced ? 0.40 : (0.65 + Math.random() * 0.30);
      } else if (pType === 1) {
        // Micro Shards: 4px - 7px fast energy sparks
        speed = reduced ? (80 + Math.random() * 70) : (140 + Math.random() * 150);
        baseSize = 4 + Math.random() * 3;
        life = reduced ? 0.30 : (0.45 + Math.random() * 0.20);
      } else {
        // Sparkle Crosses: 10px - 15px twinkling plus stars
        speed = reduced ? (40 + Math.random() * 40) : (60 + Math.random() * 70);
        baseSize = 10 + Math.random() * 5;
        life = reduced ? 0.45 : (0.75 + Math.random() * 0.30);
      }

      // Bias trajectory leftward toward center board
      const vx = Math.cos(angle) * speed - (reduced ? 15 : 45);
      const vy = Math.sin(angle) * speed;

      // Spawn at button rim
      const offsetR = 12 + Math.random() * 14;
      const px = cx + Math.cos(angle) * offsetR;
      const py = cy + Math.sin(angle) * offsetR;

      // Z rotation only (keeps the 2D pixel-square alignment crisp)
      const rotZ = Math.random() * Math.PI * 2;
      const vRotZ = (Math.random() - 0.5) * (reduced ? 3.0 : 7.0);

      const col = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const seed = Math.random();

      particles.push({
        x: px, y: py,
        vx, vy,
        rotZ, vRotZ,
        baseSize,
        type: pType,
        seed,
        color: col,
        age: 0,
        maxLife: life
      });
    }
  }

  function triggerButtonBurst(button) {
    if (!button || !button.isConnected) return;
    const sRect = stage.getBoundingClientRect();
    const bRect = button.getBoundingClientRect();
    const cx = bRect.left + bRect.width / 2 - sRect.left;
    const cy = bRect.top + bRect.height / 2 - sRect.top;
    triggerBurst(cx, cy, button);
  }

  // Hook pointerdown and click on rail buttons
  rail.addEventListener('pointerdown', event => {
    const btn = event.target.closest('.insertion-button');
    if (btn) triggerButtonBurst(btn);
  }, { passive: true });

  rail.addEventListener('click', event => {
    const btn = event.target.closest('.insertion-button');
    if (btn) triggerButtonBurst(btn);
  });

  // Render & simulation frame
  function renderFrame(now) {
    animId = requestAnimationFrame(renderFrame);
    if (document.hidden) return;

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    resize();

    const timeSec = now / 1000;
    haloMaterial.uniforms.uTime.value = timeSec;
    particleMaterial.uniforms.uTime.value = timeSec;
    scoreBarMaterial.uniforms.uTime.value = timeSec;

    // Decay button click punches
    for (const [btn, punch] of buttonPunches.entries()) {
      punch.energy -= punch.decayRate * dt;
      if (punch.energy <= 0.001) {
        buttonPunches.delete(btn);
      }
    }

    const sRect = stage.getBoundingClientRect();

    // 0. Update Score Bar Overcharge ("突突"爆分)
    if (overcharge.active) {
      const trackEl = stage.querySelector('#goal-track');
      const overlayEl = stage.querySelector('#overlay');
      const clearEl = stage.querySelector('#lite-stage-clear');
      const hiddenByModal = (overlayEl && !overlayEl.hidden) || !!clearEl;
      if (!trackEl || hiddenByModal) {
        scoreBarMesh.count = 0;
      } else {
        // Automatic high-frequency chug beat (~13.5Hz -> every ~74ms) while overcharging
        const chugIntervalMs = Math.max(52, 76 - Math.min(20, overcharge.overflowRatio * 36));
        if (now - overcharge.lastChugAt >= chugIntervalMs) {
          triggerChugBeat(false);
        }

        overcharge.chugPulse = Math.max(0, overcharge.chugPulse - dt * 13.5);
        overcharge.breachFlash = Math.max(0, overcharge.breachFlash - dt * 4.2);
        pulseScoreDigits(overcharge.overflowRatio, false);

        const tRect = trackEl.getBoundingClientRect();
        const barX = tRect.left - sRect.left;
        const barY = tRect.top - sRect.top;
        const barW = Math.max(10, tRect.width);
        const barH = Math.max(5, tRect.height);

        const padLeft = 56;
        const padRight = 84;
        const padY = 64;
        const quadW = barW + padLeft + padRight;
        const quadH = barH + padY * 2;
        const cx = barX - padLeft + quadW * 0.5;
        const cy = barY - padY + quadH * 0.5;

        scoreBarMaterial.uniforms.uBarSize.value.set(barW, barH, 0);
        scoreBarMaterial.uniforms.uQuadSize.value.set(quadW, quadH, 0);
        scoreBarMaterial.uniforms.uPad.value.set(padLeft, padY, 0);
        scoreBarMaterial.uniforms.uState.value.set(
          overcharge.overflowRatio,
          overcharge.chugPulse,
          overcharge.breachFlash
        );

        matrixHelper.identity();
        matrixHelper.makeRotationZ(0);
        matrixHelper.scale(scaleHelper.set(quadW, quadH, 1));
        matrixHelper.setPosition(cx, cy, 1);
        scoreBarMesh.setMatrixAt(0, matrixHelper);
        scoreBarMesh.count = 1;
        scoreBarMesh.instanceMatrix.needsUpdate = true;
      }
    } else {
      scoreBarMesh.count = 0;
    }

    // 1. Update Breathing Halos hugging active tool buttons
    const buttons = [...rail.querySelectorAll('.insertion-button')].filter(btn => {
      return !btn.hidden && btn.offsetParent !== null && btn.style.display !== 'none';
    });

    let haloCount = 0;
    for (let i = 0; i < buttons.length && haloCount < maxHalos; i++) {
      const btn = buttons[i];
      const bRect = btn.getBoundingClientRect();
      const cx = bRect.left + bRect.width / 2 - sRect.left;
      const cy = bRect.top + bRect.height / 2 - sRect.top;

      const punch = buttonPunches.get(btn);
      const punchEnergy = punch ? punch.energy : 0.0;

      // Halo quad covers ~1.75x diameter (proportioned cleanly around the 54px button)
      const diameter = Math.max(bRect.width, bRect.height) * (1.75 + 0.12 * punchEnergy);
      matrixHelper.identity();
      matrixHelper.makeRotationZ(0);
      matrixHelper.scale(scaleHelper.set(diameter, diameter, 1));
      matrixHelper.setPosition(cx, cy, 0);
      haloMesh.setMatrixAt(haloCount, matrixHelper);

      const isEnabled = !btn.disabled && !btn.hasAttribute('disabled');
      // Tint: r = enabled (1.0 or 0.35), g = click punch energy, b = phase offset
      colorHelper.setRGB(isEnabled ? 1.0 : 0.35, punchEnergy, i * 0.45);
      haloMesh.setColorAt(haloCount, colorHelper);
      haloCount++;
    }
    haloMesh.count = haloCount;
    if (haloCount > 0) {
      haloMesh.instanceMatrix.needsUpdate = true;
      if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;
    }

    // 2. Update Soft Ripple Waves
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.age += dt;
      if (r.age >= r.maxLife) {
        ripples.splice(i, 1);
      }
    }

    let rippleCount = 0;
    for (let i = 0; i < ripples.length && rippleCount < maxRipples; i++) {
      const r = ripples[i];
      const progress = Math.min(1.0, Math.max(0.0, r.age / r.maxLife));
      const diameter = r.maxRadius * 2.2;

      matrixHelper.identity();
      matrixHelper.makeRotationZ(0);
      matrixHelper.scale(scaleHelper.set(diameter, diameter, 1));
      matrixHelper.setPosition(r.x, r.y, 0);
      rippleMesh.setMatrixAt(rippleCount, matrixHelper);

      colorHelper.setRGB(progress, 0.0, 0.0);
      rippleMesh.setColorAt(rippleCount, colorHelper);
      rippleCount++;
    }
    rippleMesh.count = rippleCount;
    if (rippleCount > 0) {
      rippleMesh.instanceMatrix.needsUpdate = true;
      if (rippleMesh.instanceColor) rippleMesh.instanceColor.needsUpdate = true;
    }

    // 3. Update Pixel Confetti Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }

      // Physics: drag + gentle gravity
      const drag = Math.pow(0.92, dt * 60);
      p.vx *= drag;
      p.vy *= drag;
      p.vy += 85 * dt; // gentle gravity down
      p.vx -= 14 * dt; // slight drift towards board

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotZ += p.vRotZ * dt;
    }

    let pCount = 0;
    for (let i = 0; i < particles.length && pCount < maxParticles; i++) {
      const p = particles[i];
      const progress = p.age / p.maxLife;

      // Scale pop-in curve
      let scaleFactor = 1.0;
      let boost = 0.0;
      if (p.age < 0.06) {
        scaleFactor = (p.age / 0.06) * 1.30;
        boost = 1.0 - (p.age / 0.06);
      } else if (p.age < 0.14) {
        const t = (p.age - 0.06) / 0.08;
        scaleFactor = 1.30 - 0.30 * t;
      } else {
        scaleFactor = 1.0 - 0.32 * Math.pow(progress, 2.0);
      }

      const finalScale = p.baseSize * scaleFactor;

      matrixHelper.identity();
      matrixHelper.makeRotationZ(p.rotZ);
      matrixHelper.scale(scaleHelper.set(finalScale, finalScale, 1));
      matrixHelper.setPosition(p.x, p.y, 0);
      particleMesh.setMatrixAt(pCount, matrixHelper);

      colorHelper.setRGB(p.color[0], p.color[1], p.color[2]);
      particleMesh.setColorAt(pCount, colorHelper);

      const pIdx = pCount * 4;
      particleParamsArray[pIdx + 0] = progress;
      particleParamsArray[pIdx + 1] = p.type;
      particleParamsArray[pIdx + 2] = p.seed;
      particleParamsArray[pIdx + 3] = boost;

      pCount++;
    }
    particleMesh.count = pCount;
    if (pCount > 0) {
      particleMesh.instanceMatrix.needsUpdate = true;
      if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
      particleParamsAttribute.needsUpdate = true;
    }

    // 4. Render overlay scene
    renderer.clear();
    renderer.render(scene, camera);

    window.__toolFxDiag = {
      renderer, scene, camera,
      haloMesh, rippleMesh, particleMesh, scoreBarMesh,
      overcharge,
      lastButtonsCount: buttons.length,
      activeParticles: pCount
    };
  }

  window.__toolFxDiag = {
    renderer, scene, camera,
    haloMesh, rippleMesh, particleMesh, scoreBarMesh,
    overcharge,
    lastButtonsCount: 0,
    activeParticles: 0
  };

  // Start continuous RAF loop
  animId = requestAnimationFrame(renderFrame);

  return {
    triggerBurst,
    triggerButtonBurst,
    syncScoreBar,
    resetScoreBar,
    shouldHoldCompletion,
    skipOverchargeHold,
    destroy() {
      if (animId) cancelAnimationFrame(animId);
      canvas?.remove();
      haloGeo.dispose();
      haloMaterial.dispose();
      rippleGeo.dispose();
      rippleMaterial.dispose();
      particleGeo.dispose();
      particleMaterial.dispose();
      scoreBarGeo.dispose();
      scoreBarMaterial.dispose();
      renderer.dispose();
    }
  };
};
