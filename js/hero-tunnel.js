/* ==========================================================================
   hero-tunnel.js — "Hyper Scroll" 3D depth tunnel, full-page background

   Reference: "Hyper Scroll" CodePen by Aleksa Rakocevic (Lenis smooth scroll
   + perspective depth field).

   Two responsibilities:

   1. Smooth scroll — Lenis (js/vendor/lenis.min.js) replaces native wheel
      scroll with eased scrolling (lerp: 0.08) across the whole page, kept in
      sync with GSAP ScrollTrigger. Anchor links route through lenis.scrollTo
      so nav clicks stay smooth. Only enabled on fine pointers without
      reduced-motion; otherwise the site keeps its native / CSS-smooth
      behaviour.

   2. Depth tunnel — a fixed, pointer-events:none Three.js layer attached to
      <body> at z-index:-1 (above the page's black backdrop, below every
      section's content and the custom cursor). It renders a field of soft
      GLOWING star points (THREE.Points with an additive-blended circular
      glow sprite — no flat CSS dots), each parked at a world (x, y) and a
      negative Z depth.

      As the user scrolls the ENTIRE page, every star's Z advances through a
      looped band (deep → camera → past): the perspective camera shrinks deep
      stars toward the screen centre and grows them as they approach, so they
      stream toward and past the viewer continuously at any scroll position.
      A distance fade computed in the vertex shader (the fog) brings stars in
      as they emerge from the deep haze and fades them out before they cross
      the projection plane, then they wrap back to the deep end — a seamless,
      fully reversible stream for the full length of the page.

      A handful (4-5) of larger glowing orbs float independently of scroll:
      they keep fixed screen positions near the screen edges and drift with
      slow, per-orb sine waves — ambient "dust motes", never over text.

      The whole world tilts subtly with the mouse and the perspective widens
      a little with scroll velocity. All per-frame work is buffer writes
      inside a single requestAnimationFrame loop driven by Lenis's SMOOTHED
      scroll value — no raw scroll-event-driven position updates.
   ========================================================================== */

(() => {
  "use strict";

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const noReducedMotion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

  if (typeof Lenis === "undefined" || !finePointer || !noReducedMotion) return;

  /* =====================================================================
     1. Lenis smooth scroll (site-wide easing)
     ===================================================================== */
  const html = document.documentElement;
  html.style.scrollBehavior = "auto"; // Lenis owns the easing now

  const lenis = new Lenis({
    lerp: 0.08,
    smoothWheel: true,
    wheelMultiplier: 1,
  });

  // Keep GSAP ScrollTrigger (section reveals, nav state) in sync.
  lenis.on("scroll", () => {
    if (window.ScrollTrigger) ScrollTrigger.update();
  });

  // Drive Lenis from GSAP's ticker when available so both share one loop.
  if (window.gsap && gsap.ticker) {
    gsap.ticker.lagSmoothing(0);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
  } else {
    const raf = (t) => {
      lenis.raf(t);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }

  // Route anchor clicks through Lenis (scroll-spy + menu logic untouched).
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (href === "#") {
        e.preventDefault();
        lenis.scrollTo(0, { duration: 1 });
        return;
      }
      const target = href.length > 1 ? document.querySelector(href) : null;
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: 0, duration: 1.1 });
    });
  });

  /* =====================================================================
     2. Depth-tunnel parameters
     ===================================================================== */
  const R = (min, max) => min + Math.random() * (max - min);

  /* Depth band. Camera sits at z:f looking down −Z; stars loop from Z_DEEP
     (small, far) toward the viewer and past it, wrapping back to Z_DEEP.
     Everything stays well clear of the projection plane so perspective never
     mirrors/clips. (Visible fade completes by z≈+300; wrap happens at
     z=Z_TOP.) The band is long enough that a full lap takes ~1700px of
     scroll, so across the whole page the stream never runs dry and never
     visibly repeats itself. */
  const Z_DEEP = -8200;
  const Z_TOP = 650;
  const SPAN = Z_TOP - Z_DEEP; // 8850 — one full loop
  const FOV_BASE = 1100;
  const SPEED = 5; // world px advanced per scroll px

  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  const wrap = (v, min, span) => min + ((((v - min) % span) + span) % span);

  /* =====================================================================
     3. Three.js depth field — glowy stars + floating orbs
     ---------------------------------------------------------------------
     Pixel-locked with the old CSS perspective: the camera sits at z = f
     looking down −Z with fov = 2·atan((h/2)/f), so a star at world
     (x0, −y0, z) projects to exactly the screen offset a CSS element with
     translate3d(x0, y0, z) would get. Star world x/y are pre-compensated
     with (f−z0)/f so each star rests at a fixed screen fraction and then
     drifts outward as it approaches the camera.

     All stars are unlit additive points over the black page backdrop — soft
     glow texture, per-point size + brightness, distance fade in the vertex
     shader. No planets, no asteroids, no textures, no lights: the heaviest
     geometry from the previous version is gone, so per-frame cost is just a
     few small buffer writes.
     ===================================================================== */
  const gl = { ok: false };

  if (typeof THREE !== "undefined") {
    try {
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));

      const glLayer = document.createElement("div");
      glLayer.className = "depth-gl";
      glLayer.setAttribute("aria-hidden", "true");
      glLayer.setAttribute("role", "presentation");
      glLayer.appendChild(renderer.domElement);
      document.body.appendChild(glLayer); // z-index -1: behind all content

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 10, 20000);

      // Soft circular glow sprite (canvas radial gradient → texture).
      const makeGlowTexture = () => {
        const size = 128;
        const cv = document.createElement("canvas");
        cv.width = cv.height = size;
        const ctx = cv.getContext("2d");
        const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.22, "rgba(255,255,255,0.92)");
        g.addColorStop(0.55, "rgba(255,255,255,0.35)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
        return new THREE.CanvasTexture(cv);
      };
      const glowTex = makeGlowTexture();

      /* Distance-based fade (the fog): stars emerge from the deep haze
         (dist uFarIn → uFarOut) and fade out approaching the camera
         (dist uNearOut → uNearIn), mirroring the old CSS band exactly —
         fully in by z ≈ Z_DEEP+340, gone by z ≈ +300 (well before the
         plane), so the wrap seam at Z_TOP is invisible. */
      const starVert = `
        uniform float uFocal;
        uniform float uDPR;
        uniform float uFarIn;
        uniform float uFarOut;
        uniform float uNearOut;
        uniform float uNearIn;
        attribute float aSize;
        attribute float aBright;
        varying float vAlpha;
        varying float vBright;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = max(-mv.z, 1.0);
          float farFade = 1.0 - smoothstep(uFarIn, uFarOut, dist);
          float nearFade = smoothstep(uNearOut, uNearIn, dist);
          vAlpha = farFade * nearFade;
          vBright = aBright;
          gl_PointSize = aSize * uFocal * uDPR / dist;
          gl_Position = projectionMatrix * mv;
        }
      `;
      const starFrag = `
        uniform sampler2D uMap;
        varying float vAlpha;
        varying float vBright;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vec3(vBright) * a, 1.0);
        }
      `;

      const glGroup = new THREE.Group();
      scene.add(glGroup); // rotated by the same mouse tilt as the old CSS world

      /* ---- tunnel stars: soft glowing points on the scroll→Z loop ---- */
      const STAR_COUNT = isMobile ? 130 : 260;
      const Z_NEAR_START = -650; // shallowest rest position
      const Z_FAR_START = Z_DEEP + 60;

      const starGeo = new THREE.BufferGeometry();
      const starPos = new Float32Array(STAR_COUNT * 3);
      const starSize = new Float32Array(STAR_COUNT);
      const starBright = new Float32Array(STAR_COUNT);
      const starData = [];

      for (let i = 0; i < STAR_COUNT; i++) {
        const z0 = R(Z_FAR_START, Z_NEAR_START);
        const closeness = (z0 - Z_FAR_START) / (Z_NEAR_START - Z_FAR_START); // 0 far .. 1 near
        const dist0 = FOV_BASE - z0;
        // Mostly small glow cores; a few larger "closer" stars. Size/brightness
        // scale with depth so far stars read smaller and dimmer.
        const desiredPx = 1.3 + closeness * 4.4 + R(-0.5, 1.0);
        starSize[i] = (desiredPx * dist0) / FOV_BASE;
        starBright[i] = Math.min(1, 0.35 + closeness * 0.55 + R(0, 0.15));
        starData.push({ nx: R(-0.55, 0.55), ny: R(-0.48, 0.48), z0, inv: dist0 / FOV_BASE });
      }
      starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
      starGeo.setAttribute("aSize", new THREE.BufferAttribute(starSize, 1));
      starGeo.setAttribute("aBright", new THREE.BufferAttribute(starBright, 1));

      const starMat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: glowTex },
          uFocal: { value: FOV_BASE },
          uDPR: { value: renderer.getPixelRatio() },
          uFarIn: { value: FOV_BASE - Z_DEEP - 340 },
          uFarOut: { value: FOV_BASE - Z_DEEP },
          uNearOut: { value: FOV_BASE - 300 },
          uNearIn: { value: FOV_BASE + 150 },
        },
        vertexShader: starVert,
        fragmentShader: starFrag,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });

      const stars = new THREE.Points(starGeo, starMat);
      glGroup.add(stars);

      /* ---- floating orbs: fixed screen positions, sine drift, no scroll ----
         Small glowing motes parked near the screen edges (the same text-safe
         zone rule: |nx| ≥ ~0.33 so they never sit behind headings/copy).
         They keep their depth and only drift — slow, per-orb sine waves with
         independent timing, plus a gentle brightness pulse. */
      const ORB_Z = -700;
      const ORB_INV = (FOV_BASE - ORB_Z) / FOV_BASE; // world px per screen px at orb depth

      const orbDefs = [
        { nx: -0.42, ny: -0.16, sizePx: 14, bright: 0.75, dxPx: 20, dyPx: 15, sx: 0.55, sy: 0.4, px: 0.4, py: 2.2 },
        { nx: -0.33, ny: 0.34, sizePx: 10, bright: 0.6, dxPx: 15, dyPx: 13, sx: 0.4, sy: 0.62, px: 1.9, py: 0.9 },
        { nx: 0.44, ny: -0.28, sizePx: 12, bright: 0.7, dxPx: 17, dyPx: 11, sx: 0.72, sy: 0.34, px: 2.8, py: 3.4 },
        { nx: 0.35, ny: 0.38, sizePx: 9, bright: 0.55, dxPx: 13, dyPx: 17, sx: 0.46, sy: 0.5, px: 0.9, py: 1.5 },
        { nx: -0.47, ny: 0.12, sizePx: 11, bright: 0.65, dxPx: 16, dyPx: 12, sx: 0.62, sy: 0.45, px: 3.7, py: 0.3 },
      ];

      const orbCount = isMobile ? 4 : 5;
      const orbGeo = new THREE.BufferGeometry();
      const orbPos = new Float32Array(orbCount * 3);
      const orbSize = new Float32Array(orbCount);
      const orbPhase = new Float32Array(orbCount);
      const orbSpeed = new Float32Array(orbCount);
      const orbBright = new Float32Array(orbCount);
      const orbData = [];

      for (let i = 0; i < orbCount; i++) {
        const d = orbDefs[i];
        orbSize[i] = d.sizePx * ORB_INV;
        orbPhase[i] = d.px;
        orbSpeed[i] = d.sx;
        orbBright[i] = d.bright;
        orbData.push(d);
      }
      orbGeo.setAttribute("position", new THREE.BufferAttribute(orbPos, 3));
      orbGeo.setAttribute("aSize", new THREE.BufferAttribute(orbSize, 1));
      orbGeo.setAttribute("aPhase", new THREE.BufferAttribute(orbPhase, 1));
      orbGeo.setAttribute("aSpeed", new THREE.BufferAttribute(orbSpeed, 1));
      orbGeo.setAttribute("aBright", new THREE.BufferAttribute(orbBright, 1));

      const orbVert = `
        uniform float uFocal;
        uniform float uDPR;
        uniform float uTime;
        attribute float aSize;
        attribute float aPhase;
        attribute float aSpeed;
        attribute float aBright;
        varying float vAlpha;
        varying float vBright;
        void main() {
          float pulse = 0.5 + 0.5 * sin(uTime * aSpeed + aPhase);
          vAlpha = 0.55 + 0.3 * pulse; // gentle breathing, 0.55..0.85
          vBright = aBright;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = max(-mv.z, 1.0);
          gl_PointSize = aSize * uFocal * uDPR / dist;
          gl_Position = projectionMatrix * mv;
        }
      `;

      const orbMat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: glowTex },
          uFocal: { value: FOV_BASE },
          uDPR: { value: renderer.getPixelRatio() },
          uTime: { value: 0 },
        },
        vertexShader: orbVert,
        fragmentShader: starFrag,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });

      const orbPoints = new THREE.Points(orbGeo, orbMat);
      glGroup.add(orbPoints);

      /* ---- per-frame update ----------------------------------------- */
      let lastFovPx = 0;
      const syncCamera = (f) => {
        if (f === lastFovPx) return;
        lastFovPx = f;
        camera.position.set(0, 0, f); // CSS-perspective equivalent
        camera.fov = (2 * Math.atan(window.innerHeight / 2 / f) * 180) / Math.PI;
        camera.updateProjectionMatrix();
      };

      gl.frame = (advance, velocity, f, rotX, rotY) => {
        syncCamera(f);

        // Mouse tilt on the whole GL group, matching the old CSS world's lean.
        glGroup.rotation.x = rotX * (Math.PI / 180);
        glGroup.rotation.y = rotY * (Math.PI / 180);

        starMat.uniforms.uFocal.value = f;
        orbMat.uniforms.uFocal.value = f;

        // Stars: advance Z with scroll (Lenis-smoothed), re-anchor x/y from
        // stored screen fractions so resizes need no special handling.
        const W = window.innerWidth;
        const H = window.innerHeight;
        for (let i = 0; i < STAR_COUNT; i++) {
          const d = starData[i];
          const z = wrap(d.z0 + advance, Z_DEEP, SPAN);
          starPos[i * 3] = d.nx * W * d.inv;
          starPos[i * 3 + 1] = -d.ny * H * d.inv;
          starPos[i * 3 + 2] = z;
        }
        starGeo.attributes.position.needsUpdate = true;

        // Orbs: fixed depth, slow independent sine drift in screen space.
        const t = performance.now() / 1000;
        orbMat.uniforms.uTime.value = t;
        for (let i = 0; i < orbCount; i++) {
          const d = orbData[i];
          const dx = Math.sin(t * d.sx + d.px) * d.dxPx * ORB_INV;
          const dy = Math.cos(t * d.sy + d.py) * d.dyPx * ORB_INV;
          orbPos[i * 3] = d.nx * W * ORB_INV + dx;
          orbPos[i * 3 + 1] = -(d.ny * H * ORB_INV + dy);
          orbPos[i * 3 + 2] = ORB_Z;
        }
        orbGeo.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
      };

      const glResize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        lastFovPx = 0; // force fov re-sync (depends on height)
      };
      window.addEventListener("resize", glResize);
      glResize();

      glLayer.dataset.stars = String(STAR_COUNT);
      glLayer.dataset.orbs = String(orbCount);
      gl.ok = true;
    } catch (err) {
      console.warn("[hero-tunnel] Three.js depth layer unavailable.", err);
    }
  }

  /* =====================================================================
     4. Input state
     ===================================================================== */
  let mx = 0; // eased cursor position, -1..1 (right/down positive)
  let my = 0;
  let mxT = 0;
  let myT = 0;

  window.addEventListener("pointermove", (e) => {
    mxT = (e.clientX / window.innerWidth) * 2 - 1;
    myT = (e.clientY / window.innerHeight) * 2 - 1;
  });

  // Pause per-frame updates while the page is hidden or the tab is
  // backgrounded — the rAF loop also stops on its own, this saves the work.
  let pageVisible = !document.hidden;
  document.addEventListener("visibilitychange", () => {
    pageVisible = !document.hidden;
  });

  /* =====================================================================
     5. Per-frame update (single rAF loop, Lenis-smoothed scroll)
     ===================================================================== */
  const frame = () => {
    const scroll = lenis.scroll || 0;
    const velocity = lenis.velocity || 0;

    // Subtle speed feel: widen perspective with |scroll velocity|.
    const fov = FOV_BASE + Math.min(Math.abs(velocity) * 7, 320);

    // Mouse tilt (lerped) — the whole depth world leans with the pointer.
    mx += (mxT - mx) * 0.08;
    my += (myT - my) * 0.08;
    const rotY = mx * 5;
    const rotX = -my * 3.5;

    if (!pageVisible || document.hidden) return;

    if (gl.ok) gl.frame(scroll * SPEED, velocity, fov, rotX, rotY);
  };

  const update = () => {
    requestAnimationFrame(update);
    frame();
  };

  update();
})();