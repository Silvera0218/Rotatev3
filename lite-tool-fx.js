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

  // Active effect state
  const ripples = [];
  const particles = [];
  let lastBurstTime = 0;
  let animId = 0;
  let lastTime = performance.now();

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

    // Decay button click punches
    for (const [btn, punch] of buttonPunches.entries()) {
      punch.energy -= punch.decayRate * dt;
      if (punch.energy <= 0.001) {
        buttonPunches.delete(btn);
      }
    }

    const sRect = stage.getBoundingClientRect();

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
      haloMesh, rippleMesh, particleMesh,
      lastButtonsCount: buttons.length,
      activeParticles: pCount
    };
  }

  // Start continuous RAF loop
  animId = requestAnimationFrame(renderFrame);

  return {
    triggerBurst,
    triggerButtonBurst,
    destroy() {
      if (animId) cancelAnimationFrame(animId);
      canvas?.remove();
      haloGeo.dispose();
      haloMaterial.dispose();
      rippleGeo.dispose();
      rippleMaterial.dispose();
      particleGeo.dispose();
      particleMaterial.dispose();
      renderer.dispose();
    }
  };
};
