/* ==========================================================================
   hero-spotlight.js — spotlight cursor reveal on the Hero section

   "Spotlight Cursor Text Screen" composition (bottom → top):

     1. BASE    : the hero's own black background + the Three.js wireframe
                  canvas (js/hero-scene.js) behind the text.
     2. MIDDLE  : 3 grey/white discs (550 / 340 / 170 px) appended below;
                  they chase the cursor with a staggered GSAP delay so each
                  trails the one before it (0.45 s + 0.1 s steps, power2.out).
     3. TOP     : .container.hero-content — the light "screen" card that
                  already holds "I love creating", "Ansh Saini" and the
                  tagline. It carries background:#ebebeb + mix-blend-mode:
                  screen (see css/hero.css). Screen blending drops the card's
                  DARK pixels, so the dark letterforms are windows: wherever
                  a disc passes underneath, the light shows through the glyphs
                  — a moving spotlight reveal — while the card itself stays a
                  crisp light plaque over the black hero.

   Discs are positioned hero-relative and centred on the cursor with
   xPercent/yPercent:-50. Only built on pointer devices: touch users get the
   plain card. The two-ball custom cursor (cursor.js) is untouched — this is
   a separate layer scoped to the hero.
   ========================================================================== */

(() => {
  "use strict";

  const hero = document.getElementById("home");
  if (!hero) return;

  // --- Touch detection: bail, no mouse spotlight needed ---
  if (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(hover: none), (pointer: coarse)").matches
  ) {
    return;
  }

  // --- Build the disc layer inside the hero (behind the text card) ---
  const spots = document.createElement("div");
  spots.className = "hero-spots";
  spots.setAttribute("aria-hidden", "true");
  spots.setAttribute("role", "presentation");
  hero.appendChild(spots);

  const shapes = [];
  const shapeConfig = [
    { size: 550, bg: "#d4d4d4" }, // large, near-white
    { size: 340, bg: "#a0a0a0" }, // mid, mid-grey
    { size: 170, bg: "#6f6f6f" }, // small, darker grey
  ];

  for (const cfg of shapeConfig) {
    const el = document.createElement("div");
    el.className = "hero-spots-shape";
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("role", "presentation");
    el.style.width = cfg.size + "px";
    el.style.height = cfg.size + "px";
    el.style.background = cfg.bg;
    spots.appendChild(el);
    shapes.push(el);
  }

  // --- Mouse tracking (hero-relative, so it stays correct on scroll) ---
  // Start the discs off-screen (clipped by .hero's overflow) so the card's
  // letterforms rest crisp and dark; they only arrive when the pointer moves.
  let mouseX = -hero.clientWidth;
  let mouseY = -hero.clientHeight;

  hero.addEventListener("mousemove", (e) => {
    const rect = hero.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });

  // --- GSAP follows with a staggered delay (layered trailing) ---
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Centre each disc on the cursor once, then keep tweening toward it.
  gsap.set(shapes, { xPercent: -50, yPercent: -50, x: mouseX, y: mouseY, autoAlpha: 0 });
  gsap.to(shapes, { autoAlpha: 1, duration: 0.4, ease: "power2.out", delay: 0.05, overwrite: false });

  const tick = () => {
    if (reducedMotion) {
      for (let i = 0; i < shapes.length; i++) {
        gsap.set(shapes[i], { x: mouseX, y: mouseY });
      }
    } else {
      for (let i = 0; i < shapes.length; i++) {
        const delay = i * 0.1; // 0, 0.1, 0.2 s — each disc lags the previous
        gsap.to(shapes[i], {
          x: mouseX,
          y: mouseY,
          duration: 0.45 + delay,
          ease: "power2.out",
          overwrite: "auto",
        });
      }
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
})();
