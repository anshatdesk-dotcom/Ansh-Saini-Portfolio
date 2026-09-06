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
      cards,      Resume, Contact, the custom cursor). It holds star dots and thin
      glowing streak trails, each parked at a world (x, y) and a negative Z
      depth.

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

   Monochrome only — white/grey stars and white/grey glowing streaks.
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

  /* --- streaks: thin glowing light trails -------------------------------
     Occasional brighter, elongated lines mixed into the star field. Short
     vertical/diagonal segments with feathered ends and a soft box-shadow
     glow; brightness varies per streak. They use the same scroll-driven Z
     loop as the stars and stretch along their axis (scaleY) as they near
     the camera so they read as motion trails, not static dashes. */
  const STREAK_COUNT = isMobile ? 25 : 55;
  for (let i = 0; i < STREAK_COUNT; i++) {
    const z0 = R(Z_FAR_START, Z_NEAR_START);
    const s0 = projScale(z0, FOV_BASE);
    const nx = R(-0.55, 0.55);
    const ny = R(-0.46, 0.46);
    const len = R(18, 58);
    const thick = R(1, 2);
    // Vertical-ish with a diagonal mix: mostly slight angles, some steeper.
    const angle = R(-50, 50);
    const bright = Math.random();

    const el = makeItem("span", "depth-tunnel-streak", {
      width: `${thick.toFixed(1)}px`,
      height: `${len.toFixed(1)}px`,
      marginLeft: `${(-thick / 2).toFixed(1)}px`,
      marginTop: `${(-len / 2).toFixed(1)}px`,
      opacity: "0",
    });
    el.style.boxShadow = `0 0 ${(4 + bright * 14).toFixed(1)}px ${(0.5 + bright * 2.5).toFixed(1)}px rgba(255,255,255,${(
      0.2 + bright * 0.5
    ).toFixed(2)})`;
    world.appendChild(el);
    items.push({
      el,
      nx,
      ny,
      x0: (nx * window.innerWidth) / s0,
      y0: (ny * window.innerHeight) / s0,
      z0,
      base: R(0.22, 0.7),
      isStreak: true,
      angle,
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

      const pos = `translate3d(${it.x0.toFixed(1)}px, ${it.y0.toFixed(1)}px, ${z.toFixed(1)}px)`;
      if (it.isStreak) {
        // Stretch along the streak's own axis as it approaches the camera,
        // turning the line into a motion trail; relax again far away.
        const progress = Math.max(0, Math.min(1, (z - Z_DEEP) / SPAN));
        const stretch = 1 + progress * 1.9;
        it.el.style.transform = `${pos} rotate(${it.angle}deg) scaleY(${stretch.toFixed(2)})`;
      } else {
        it.el.style.transform = pos;
      }
      it.el.style.opacity = op.toFixed(3);
    }
  };

  const update = () => {
    requestAnimationFrame(update);
    frame();
  };

  update();
})();
