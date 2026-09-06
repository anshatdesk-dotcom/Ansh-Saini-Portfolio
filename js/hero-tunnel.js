/* ==========================================================================
   hero-tunnel.js — "Hyper Scroll" 3D depth tunnel for the Hero section

   Reference: "Hyper Scroll" CodePen by Aleksa Rakocevic (Lenis + pure CSS 3D
   transforms; no WebGL for this layer).

   Two responsibilities:

   1. Smooth scroll — Lenis (js/vendor/lenis.min.js) replaces native wheel
      scroll with eased scrolling (lerp: 0.08) across the whole page, kept in
      sync with GSAP ScrollTrigger. Anchor links route through lenis.scrollTo
      so nav clicks stay smooth. Only enabled on fine pointers without
      reduced-motion; otherwise the site keeps its native / CSS-smooth
      behaviour.

   2. Depth tunnel — a fixed, pointer-events:none perspective layer appended
      inside #home at z-index:-1, i.e. behind the Three.js canvas (z:0) and
      the hero text content (z:1). It holds small star dots and thin glass
      cards, each parked at a world (x, y) and a negative Z depth. Scrolling advances every element's Z through a looped band
      (deep → camera → past): the browser's CSS perspective shrinks deep
      elements toward the screen centre and grows them as they approach, so
      they stream toward and past the viewer. Each element fades in when it
      is far away and fades out before it crosses the projection plane, then
      wraps back to the deep end — a seamless, reversible stream. The world
      tilts subtly with the mouse and the perspective widens a little with
      scroll velocity. The whole layer fades out once the hero has scrolled
      away, so the tunnel never leaks into later sections.

   Monochrome only — white/grey stars and dark glass cards with thin light
   borders. No scanlines, noise, or RGB-split effects.
   ========================================================================== */

(() => {
  "use strict";

  const hero = document.getElementById("home");
  if (!hero) return;

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const noReducedMotion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

  if (typeof Lenis === "undefined" || !finePointer || !noReducedMotion) return;

  /* =====================================================================
     1. Lenis smooth scroll (site-wide easing)
     ===================================================================== */
  const html = document.documentElement;
  const prevScrollBehavior = html.style.scrollBehavior;
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
  let lenisTickerFn = null;
  if (window.gsap && gsap.ticker) {
    gsap.ticker.lagSmoothing(0);
    lenisTickerFn = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(lenisTickerFn);
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
     2. Depth-tunnel world
     ===================================================================== */
  const viewport = document.createElement("div");
  viewport.className = "hero-tunnel";
  viewport.setAttribute("aria-hidden", "true");
  viewport.setAttribute("role", "presentation");
  hero.appendChild(viewport);

  const world = document.createElement("div");
  world.className = "hero-tunnel-world";
  viewport.appendChild(world);

  const R = (min, max) => min + Math.random() * (max - min);

  /* Depth band. Camera sits at z:0; elements loop from Z_DEEP (small, far)
     toward the viewer and past it, wrapping back to Z_DEEP. Everything stays
     well clear of the projection plane so perspective never mirrors/clips.
     (Visible fade completes by z≈+300; wrap happens at z=Z_TOP.) */
  const Z_DEEP = -3600;
  const Z_TOP = 650;
  const SPAN = Z_TOP - Z_DEEP; // 4250 — one full loop
  const FOV_BASE = 1100;

  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  // --- build one item ---------------------------------------------------
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

  // --- stars: tiny monochrome dots -------------------------------------
  const STAR_COUNT = isMobile ? 28 : 55;
  for (let i = 0; i < STAR_COUNT; i++) {
    const z0 = R(Z_DEEP + 60, -650); // deep start, nothing at rest near camera
    const s0 = projScale(z0, FOV_BASE);
    const nx = R(-0.55, 0.55); // desired screen fraction at rest
    const ny = R(-0.48, 0.48);
    const size = R(2, 5.5);
    const shade = Math.random();
    const el = makeItem("span", "hero-tunnel-star", {
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
      x0: (nx * window.innerWidth) / s0, // world px — rests at nx·vw via projection
      y0: (ny * window.innerHeight) / s0,
      z0,
      base: R(0.3, 0.9),
    });
  }

  // --- cards: thin glass rectangles -------------------------------------
  const cardCount = isMobile ? 4 : 6;
  for (let i = 0; i < cardCount; i++) {
    const t = cardCount === 1 ? 0 : i / (cardCount - 1);
    const z0 = Z_DEEP + 250 + t * (2900 - 250); // -3350 .. -450
    const s0 = projScale(z0, FOV_BASE);
    const w = R(90, 175);
    const h = R(46, 92);
    const nx = R(-0.5, 0.5);
    const ny = R(-0.38, 0.38);
    const el = makeItem("div", "hero-tunnel-card", {
      width: `${w.toFixed(0)}px`,
      height: `${h.toFixed(0)}px`,
      marginLeft: `${(-w / 2).toFixed(0)}px`,
      marginTop: `${(-h / 2).toFixed(0)}px`,
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
      base: R(0.55, 0.95),
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

  /* =====================================================================
     3. Input state
     ===================================================================== */
  let mx = 0;
  let my = 0;
  let mxT = 0;
  let myT = 0;
  let overHero = false;

  hero.addEventListener("pointermove", (e) => {
    mxT = (e.clientX / window.innerWidth) * 2 - 1;
    myT = (e.clientY / window.innerHeight) * 2 - 1;
  });
  hero.addEventListener("pointerenter", () => {
    overHero = true;
  });
  hero.addEventListener("pointerleave", () => {
    overHero = false;
  });

  // Hide the tunnel once the hero has left the viewport entirely.
  let heroOnScreen = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      heroOnScreen = entries[0].isIntersecting;
    }).observe(hero);
  }

  window.addEventListener("resize", reanchor);
  reanchor();

  /* =====================================================================
     4. Per-frame update
     ===================================================================== */
  const SPEED = 5; // world px advanced per scroll px

  const frame = () => {
    const svh = Math.max(hero.clientHeight || window.innerHeight, 1);
    const scroll = lenis.scroll || 0;
    const velocity = lenis.velocity || 0;

    // Layer fades out as the hero scrolls away (p: 0 = hero fills viewport).
    const p = Math.min(scroll / (svh * 0.9), 1.05);
    const fadeT = Math.max(0, (p - 0.78) / 0.2);
    const wrapperFade = fadeT >= 1 ? 0 : 1 - Math.pow(fadeT, 1.6);

    // Subtle speed feel: widen perspective with |scroll velocity|.
    const fov = FOV_BASE + Math.min(Math.abs(velocity) * 7, 320);
    viewport.style.perspective = fov + "px";

    // Mouse tilt (lerped, only meaningful while the pointer is over the hero).
    mx += ((overHero ? mxT : 0) - mx) * 0.06;
    my += ((overHero ? myT : 0) - my) * 0.06;
    const rotY = mx * 5;
    const rotX = -my * 3.5;
    world.style.transform = `rotateX(${rotX.toFixed(3)}deg) rotateY(${rotY.toFixed(3)}deg)`;

    if (wrapperFade <= 0.001 || !heroOnScreen) {
      if (viewport.style.opacity !== "0") viewport.style.opacity = "0";
      return;
    }
    viewport.style.opacity = wrapperFade.toFixed(3);

    const advance = scroll * SPEED; // grows monotonically with scroll

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const z = wrap(it.z0 + advance, Z_DEEP, SPAN);

      // Depth fading:
      //  - far: invisible at Z_DEEP, fully in by Z_DEEP + ~340
      //  - near: fully in until z≈-150, gone by z≈+300 (before the plane)
      const fFar = Math.max(0, Math.min(1, (z - Z_DEEP) / 340));
      const fNear = Math.max(0, Math.min(1, (300 - z) / 450));
      let op = wrapperFade * it.base * fFar * fNear;
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
