/* ==========================================================================
   hero-tunnel.js — "Hyper Scroll" 3D depth tunnel, full-page background

   Reference: "Hyper Scroll" CodePen by Aleksa Rakocevic (Lenis + pure CSS 3D
   transforms; no WebGL for this layer).

   Two responsibilities:

   1. Smooth scroll — Lenis (js/vendor/lenis.min.js) replaces native wheel
      scroll with eased scrolling (lerp: 0.08) across the whole page, kept in
      sync with GSAP ScrollTrigger. Anchor links route through lenis.scrollTo
      so nav clicks stay smooth. Only enabled on fine pointers without
      reduced-motion; otherwise the site keeps its native / CSS-smooth
      behaviour.

   2. Depth tunnel — a fixed, pointer-events:none perspective layer attached
      to <body> at z-index:-1, i.e. above the page's black backdrop and below
      every section's content (Hero text, About's chrome sculpture, project
      cards, Resume, Contact, the custom cursor). It holds star dots, each
      parked at a world (x, y) and a negative Z depth.

      As the user scrolls the ENTIRE page, every element's Z advances through
      a looped band (deep → camera → past): the browser's CSS perspective
      shrinks deep elements toward the screen centre and grows them as they
      approach, so they stream toward and past the viewer continuously at any
      scroll position. Elements fade in when far away and fade out before
      crossing the projection plane, then wrap back to the deep end — a
      seamless, fully reversible stream for the full length of the page.

      The world tilts subtly with the mouse and the perspective widens a
      little with scroll velocity. Each element's Z is refreshed only while
      the page is visible and being scrolled, keeping the frame cost low
      alongside the hero's Three.js scene and the About chrome sculpture.

   A Three.js layer in the same file adds planets and asteroids that ride the
   identical scroll→Z loop, so the whole depth field moves as one.
   No scanlines, noise, or RGB-split effects.
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
     2. Depth-tunnel world (full page)
     ===================================================================== */
  const viewport = document.createElement("div");
  viewport.className = "depth-tunnel";
  viewport.setAttribute("aria-hidden", "true");
  viewport.setAttribute("role", "presentation");
  document.body.appendChild(viewport);

  const world = document.createElement("div");
  world.className = "depth-tunnel-world";
  viewport.appendChild(world);

  const R = (min, max) => min + Math.random() * (max - min);

  /* Depth band. Camera sits at z:0; elements loop from Z_DEEP (small, far)
     toward the viewer and past it, wrapping back to Z_DEEP. Everything stays
     well clear of the projection plane so perspective never mirrors/clips.
     (Visible fade completes by z≈+300; wrap happens at z=Z_TOP.) The band is
     long enough that a full lap takes ~1700px of scroll, so across the whole
     page the stream never runs dry and never visibly repeats itself. */
  const Z_DEEP = -8200;
  const Z_TOP = 650;
  const SPAN = Z_TOP - Z_DEEP; // 8850 — one full loop
  const FOV_BASE = 1100;
  const SPEED = 5; // world px advanced per scroll px

  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  const makeItem = (tag, cls, css) => {
    const el = document.createElement(tag);
    el.className = cls;
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("role", "presentation");
    for (const [k, v] of Object.entries(css)) el.style[k] = v;
    return el;
  };

  const wrap = (v, min, span) => min + ((((v - min) % span) + span) % span);

  /* Perspective projection scale for an element at world Z (camera f): an
     element shrinks toward the centre as it recedes; grows to full size as
     it reaches the screen plane. */
  const projScale = (z, f) => f / (f - z);

  const items = [];

  /* --- stars: tiny monochrome dots -------------------------------------
     Dense field of dots, sized by depth (closer stars start larger), which
     the CSS projection further grows as they approach. */
  const STAR_COUNT = isMobile ? 100 : 220;
  const Z_NEAR_START = -650; // shallowest rest position for stars
  const Z_FAR_START = Z_DEEP + 60;

  for (let i = 0; i < STAR_COUNT; i++) {
    const z0 = R(Z_FAR_START, Z_NEAR_START);
    const s0 = projScale(z0, FOV_BASE);
    const nx = R(-0.55, 0.55);
    const ny = R(-0.48, 0.48);
    // closeness 0 (far) .. 1 (near camera) -> dot size ~1px .. ~3.5px
    const close = (z0 - Z_FAR_START) / (Z_NEAR_START - Z_FAR_START);
    const size = Math.min(4.2, 1.1 + close * 2.6 + R(-0.4, 0.7));
    const shade = Math.random();
    const el = makeItem("span", "depth-tunnel-star", {
      width: `${size.toFixed(1)}px`,
      height: `${size.toFixed(1)}px`,
      background: shade > 0.72 ? "#ffffff" : shade > 0.32 ? "#d5d5d5" : "#8f8f8f",
      opacity: "0",
    });
    world.appendChild(el);
    items.push({
      el,
      nx,
      ny,
      x0: (nx * window.innerWidth) / s0,
      y0: (ny * window.innerHeight) / s0,
      z0,
      base: R(0.35, 0.95),
    });
  }

  // Re-anchor screen fractions on resize (world px depend on viewport).
  const reanchor = () => {
    for (const it of items) {
      const s0 = projScale(it.z0, FOV_BASE);
      it.x0 = (it.nx * window.innerWidth) / s0;
      it.y0 = (it.ny * window.innerHeight) / s0;
    }
  };
  window.addEventListener("resize", reanchor);
  reanchor();

  /* =====================================================================
     2b. Three.js planets & asteroids riding the SAME scroll→Z loop
     ---------------------------------------------------------------------
     Pixel-locked sync with the CSS star layer: the CSS world uses
     perspective f (px) and places elements at translate3d(x0, y0, z), which
     projects to screen offset x0 * f/(f−z). The identical projection is
     achieved in Three.js with the camera at z = f looking down −Z and
     fov = 2·atan((h/2)/f): an object at world (x0, −y0, z) then lands on
     exactly the same screen pixel as its DOM twin. So the planets share the
     same z0 / wrap / fade math as the stars and the whole field moves as one.

     All meshes are monochrome-muted (desaturated rock/moon tones) to stay
     cohesive with the site's near-monochrome palette. Meshes are hidden
     while fully faded to skip their draw calls.
     ===================================================================== */
  const gl = { ok: false };

  if (typeof THREE !== "undefined") {
    try {
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
      renderer.outputEncoding = THREE.sRGBEncoding;

      const glLayer = document.createElement("div");
      glLayer.className = "depth-gl";
      glLayer.setAttribute("aria-hidden", "true");
      glLayer.appendChild(renderer.domElement);
      document.body.appendChild(glLayer); // z-index -2: behind the CSS stars

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 10, 12000);

      /* Depth fog — the core of the depth illusion: objects far from the
         camera sink into the black background (small, hazy, faint) and
         sharpen/opacify as they approach. Tied to camera distance, which
         grows as scroll drives objects toward z=0. */
      scene.fog = new THREE.Fog(0x000000, 700, 4200);

      // Directional "sun" lighting with high key contrast so rocks read as
      // distinct lit/shadow faces, not flat grey noise.
      scene.add(new THREE.AmbientLight(0xffffff, 0.14));
      const key = new THREE.DirectionalLight(0xfff1e0, 3.2);
      key.position.set(600, 420, 800);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xdce9ff, 0.5);
      fill.position.set(-700, -260, 500);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xcfe0ff, 1.3);
      rim.position.set(0, -200, -900);
      scene.add(rim);

      const glGroup = new THREE.Group();
      scene.add(glGroup); // rotated by the same mouse tilt as the CSS world

      /* ---- procedural surface textures (canvas -> CanvasTexture) ---- */
      const makeCanvas = (size) => {
        const cv = document.createElement("canvas");
        cv.width = cv.height = size;
        return [cv, cv.getContext("2d")];
      };

      // Rocky mottle: layered speckles on a base colour
      const rockyTexture = (base, dark, light, craters) => {
        const [cv, ctx] = makeCanvas(256);
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 900; i++) {
          ctx.fillStyle = Math.random() > 0.5 ? dark : light;
          ctx.globalAlpha = 0.06 + Math.random() * 0.16;
          const r = 1 + Math.random() * 6;
          ctx.beginPath();
          ctx.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
          ctx.fill();
        }
        if (craters) {
          for (let i = 0; i < 26; i++) {
            const x = Math.random() * 256, y = Math.random() * 256, r = 3 + Math.random() * 11;
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = dark;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = light;
            ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.7, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        const tex = new THREE.CanvasTexture(cv);
        tex.wrapS = THREE.RepeatWrapping;
        return tex;
      };

      // Banded gas-style planet: horizontal noise bands
      const bandedTexture = (bands) => {
        const [cv, ctx] = makeCanvas(256);
        for (let y = 0; y < 256; y++) {
          const t = y / 256;
          const band = Math.sin(t * Math.PI * bands + Math.sin(t * 21) * 0.7) * 0.5 + 0.5;
          const shade = Math.round(96 + band * 88);
          ctx.fillStyle = `rgb(${shade},${shade + 10},${shade + 22})`;
          ctx.fillRect(0, y, 256, 1);
        }
        for (let i = 0; i < 500; i++) {
          ctx.globalAlpha = 0.05;
          ctx.fillStyle = Math.random() > 0.5 ? "#ffffff" : "#3a4a5a";
          ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 14, 1);
        }
        ctx.globalAlpha = 1;
        return new THREE.CanvasTexture(cv);
      };

      // Crater bump map for the moon
      const craterBump = () => {
        const [cv, ctx] = makeCanvas(256);
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 34; i++) {
          const x = Math.random() * 256, y = Math.random() * 256, r = 3 + Math.random() * 12;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, "#2a2a2a");
          g.addColorStop(0.75, "#5a5a5a");
          g.addColorStop(1, "#9a9a9a");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        return new THREE.CanvasTexture(cv);
      };

      /* ---- the planets (spaced far apart in the loop, one "moment" each)
         Only the nearest one emerges from the fog at a time; the rest stay
         hidden in the haze until the user scrolls them closer. All parked
         in the outer screen edges — never over the hero text. */
      const seg = isMobile ? 28 : 44;
      const planets = [];
      const addPlanet = (radius, z0, nx, ny, material, spin) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, seg, Math.round(seg * 0.7)), material);
        const s0 = projScale(z0, FOV_BASE);
        const rec = {
          mesh,
          x0: (nx * window.innerWidth) / s0,
          y0: (ny * window.innerHeight) / s0,
          z0,
          spin,
        };
        glGroup.add(mesh);
        planets.push(rec);
        return rec;
      };

      // 1 — muted mars-like rock (closest: the single planet visible at rest)
      addPlanet(170, -2400, -0.36, 0.24,
        new THREE.MeshStandardMaterial({
          map: rockyTexture("#7a4a3c", "#4e2e26", "#a3766a", false),
          bumpMap: rockyTexture("#808080", "#3c3c3c", "#c8c8c8", false),
          bumpScale: 2.2,
          roughness: 0.96,
          metalness: 0,
        }), 0.05);

      // 2 — banded bluish-grey gas-style planet (largest; deep, revealed later)
      addPlanet(220, -5400, 0.38, -0.22,
        new THREE.MeshStandardMaterial({
          map: bandedTexture(9),
          roughness: 0.85,
          metalness: 0.05,
        }), 0.035);

      // 3 — pale cratered moon (deepest; its own moment near the loop's end)
      addPlanet(130, -7900, -0.34, -0.26,
        new THREE.MeshStandardMaterial({
          map: rockyTexture("#b5b5b5", "#8a8a8a", "#dedede", true),
          bumpMap: craterBump(),
          bumpScale: 3.0,
          roughness: 1.0,
          metalness: 0,
        }), 0.07);

      /* ---- asteroids: displaced icosahedra, tumbling ----
         Few, chunky, and evenly spaced across the loop: only 2-3 ever sit
         inside the fog's visible range at once. Simple geometry (detail 0,
         20 faces) + strong flat shading so each reads as a distinct rock. */
      const ASTEROID_COUNT = isMobile ? 3 : 6;
      const asteroids = [];
      // Evenly distribute across the whole loop span (no random bunching).
      for (let i = 0; i < ASTEROID_COUNT; i++) {
        const z0 = Z_DEEP + ((i + 0.5) / ASTEROID_COUNT) * SPAN;
        const s0 = projScale(z0, FOV_BASE);
        const radius = R(20, 46);
        // Detail 0: 20 flat faces — chunky, readable silhouettes.
        const geo = new THREE.IcosahedronGeometry(radius, 0);
        const posAttr = geo.attributes.position;
        for (let v = 0; v < posAttr.count; v++) {
          const d = 0.8 + Math.random() * 0.4; // gentler deformation
          posAttr.setXYZ(v, posAttr.getX(v) * d, posAttr.getY(v) * d, posAttr.getZ(v) * d);
        }
        geo.computeVertexNormals();
        const grey = 0.5 + Math.random() * 0.25;
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
          color: new THREE.Color(grey * 0.95, grey * 0.82, grey * 0.72), // grey-brown rock
          roughness: 0.95,
          metalness: 0,
          flatShading: true,
        }));
        asteroids.push({
          mesh,
          x0: (R(-0.48, 0.48) * window.innerWidth) / s0,
          y0: (R(-0.4, 0.4) * window.innerHeight) / s0,
          z0,
          base: R(0.7, 1),
          tumble: { x: R(-0.3, 0.3), y: R(-0.3, 0.3) },
        });
      }

      /* ---- per-frame GL update ---------------------------------------- */
      let lastFovPx = 0;
      const syncCamera = (f) => {
        if (f === lastFovPx) return;
        lastFovPx = f;
        camera.position.set(0, 0, f); // CSS-perspective equivalent
        camera.fov = (2 * Math.atan(window.innerHeight / 2 / f) * 180) / Math.PI;
        camera.updateProjectionMatrix();
      };

      const placeMesh = (mesh, rec) => {
        // Target from the shared scroll→Z math, then LERP the mesh toward it
        // (~12% per frame) — absorbs any residual scroll stutter so motion
        // stays glassy even when scroll input is uneven.
        const tx = rec.x0, ty = -rec.y0, tz = rec.targetZ;
        mesh.position.x += (tx - mesh.position.x) * 0.12;
        mesh.position.y += (ty - mesh.position.y) * 0.12;
        mesh.position.z += (tz - mesh.position.z) * 0.12;
      };

      gl.frame = (advance, velocity, rotX, rotY) => {
        const f = FOV_BASE + Math.min(Math.abs(velocity) * 7, 320);
        syncCamera(f);

        // Mouse tilt on the whole GL group, matching the CSS world's lean.
        glGroup.rotation.x = rotX * (Math.PI / 180);
        glGroup.rotation.y = rotY * (Math.PI / 180);

        let anyVisible = false;
        const updateOne = (rec, baseOpacity) => {
          const z = wrap(rec.z0 + advance, Z_DEEP, SPAN);
          rec.targetZ = z;
          const fFar = Math.max(0, Math.min(1, (z - Z_DEEP) / 500));
          const fNear = Math.max(0, Math.min(1, (150 - z) / 400)); // fade well before the camera
          let op = baseOpacity * fFar * fNear;
          if (op > 1) op = 1;
          placeMesh(rec.mesh, rec);
          // Fog already dims far objects; mesh fade handles the loop's ends.
          rec.mesh.visible = op > 0.01;
          if (rec.mesh.visible) {
            rec.mesh.material.opacity = op;
            rec.mesh.material.transparent = op < 1;
            anyVisible = true;
          }
          return op;
        };

        for (const p of planets) {
          updateOne(p, 1);
          if (p.mesh.visible) {
            p.mesh.rotation.y += p.spin * 0.016;
            p.mesh.rotation.x = Math.sin(p.z0) * 0.18;
          }
        }
        for (const a of asteroids) {
          const op = updateOne(a, a.base);
          if (a.mesh.visible) {
            a.mesh.rotation.x += a.tumble.x * 0.012;
            a.mesh.rotation.y += a.tumble.y * 0.012;
            a.mesh.material.opacity = op;
          }
        }

        if (anyVisible) renderer.render(scene, camera);
      };

      // Re-anchor GL object screen positions on resize (same as DOM stars).
      const glReanchor = () => {
        for (const rec of [...planets, ...asteroids]) {
          const s0 = projScale(rec.z0, FOV_BASE);
          rec.x0 = (rec.nx * window.innerWidth) / s0;
          rec.y0 = (rec.ny * window.innerHeight) / s0;
        }
      };

      const glResize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        lastFovPx = 0; // force fov re-sync (depends on height)
        glReanchor();
      };
      window.addEventListener("resize", glResize);
      glResize();

      gl.ok = true;
    } catch (err) {
      console.warn("[hero-tunnel] Three.js planet layer unavailable, stars only.", err);
    }
  }

  /* =====================================================================
     3. Input state
     ===================================================================== */
  let mx = 0; // eased cursor position, -1..1 (right/down positive)
  let my = 0;
  let mxT = 0;
  let myT = 0;

  window.addEventListener("pointermove", (e) => {
    mxT = (e.clientX / window.innerWidth) * 2 - 1;
    myT = (e.clientY / window.innerHeight) * 2 - 1;
  });

  // Pause per-element Z updates while the page is hidden or the tab is
  // backgrounded — the rAF loop also stops on its own, this saves style work.
  let pageVisible = !document.hidden;
  document.addEventListener("visibilitychange", () => {
    pageVisible = !document.hidden;
  });

  /* =====================================================================
     4. Per-frame update
     ===================================================================== */
  const frame = () => {
    const scroll = lenis.scroll || 0;
    const velocity = lenis.velocity || 0;

    // Subtle speed feel: widen perspective with |scroll velocity|.
    const fov = FOV_BASE + Math.min(Math.abs(velocity) * 7, 320);
    viewport.style.perspective = fov + "px";

    // Mouse tilt (lerped) — the whole world leans slightly with the pointer.
    mx += (mxT - mx) * 0.08;
    my += (myT - my) * 0.08;
    const rotY = mx * 5;
    const rotX = -my * 3.5;
    world.style.transform = `rotateX(${rotX.toFixed(3)}deg) rotateY(${rotY.toFixed(3)}deg)`;

    if (!pageVisible || document.hidden) return;

    const advance = scroll * SPEED; // grows monotonically with scroll

    if (gl.ok) gl.frame(advance, velocity, rotX, rotY);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const z = wrap(it.z0 + advance, Z_DEEP, SPAN);

      // Depth fading:
      //  - far: invisible at Z_DEEP, fully in by Z_DEEP + ~340
      //  - near: fully in until z≈-150, gone by z≈+300 (before the plane)
      const fFar = Math.max(0, Math.min(1, (z - Z_DEEP) / 340));
      const fNear = Math.max(0, Math.min(1, (300 - z) / 450));
      let op = it.base * fFar * fNear;
      if (op > 1) op = 1;
      if (op < 0) op = 0;

      it.el.style.transform = `translate3d(${it.x0.toFixed(1)}px, ${it.y0.toFixed(1)}px, ${z.toFixed(1)}px)`;
      it.el.style.opacity = op.toFixed(3);
    }
  };

  const update = () => {
    requestAnimationFrame(update);
    frame();
  };

  update();
})();
