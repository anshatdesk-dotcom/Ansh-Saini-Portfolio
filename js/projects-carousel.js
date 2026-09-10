/* ==========================================================================
   projects-carousel.js — center-focus "coverflow" carousel for the Projects
   section (js/projects-carousel.js drives the transforms).

   - Cards sit in one horizontal row; the card nearest the viewport centre
     is scale 1 / opacity 1, cards further out shrink + fade.
   - Autoplay scrolls the row at a constant speed (one full cycle through
     all cards in ~20s), looping infinitely.
   - Drag / touch-swipe overrides autoplay; it resumes after a 1.5s pause.
   - Left/right arrow buttons + ArrowLeft/ArrowRight keys nudge by one card.
   - Respects prefers-reduced-motion (no autoplay, instant transforms).
   ========================================================================== */

(() => {
  "use strict";

  const carousel = document.getElementById("projectCarousel");
  const viewport = document.getElementById("projectViewport");
  const track = document.getElementById("projectTrack");
  if (!carousel || !viewport || !track || typeof gsap === "undefined") return;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const CYCLE_SECONDS = 20; // one full pass through all cards
  const RESUME_DELAY_MS = 500; // autoplay pause after interaction

  let wraps = []; // .project-card-wrap elements (hold coverflow transforms)
  let cardW = 0; // measured wrapper width (px)
  let gap = 0; // track gap (px)
  let step = 0; // cardW + gap
  let count = 0;
  let center = 0; // continuous float index of the centered card
  let dragging = false;
  let pointerId = null;
  let lastX = 0;
  let moved = 0; // px moved during the current drag (click suppression)
  let autoPaused = false;
  let resumeTimer = null;
  let trackXTo = null;
  const posRef = { v: 0 };

  /* ---------- Wrapping / measuring ---------- */

  const wrapCards = () => {
    // Wrap each card so GSAP's coverflow scale/opacity lives on the wrapper
    // and never conflicts with the card's own CSS hover transform.
    Array.from(track.children).forEach((child) => {
      if (child.classList.contains("project-card-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "project-card-wrap";
      child.parentNode.insertBefore(wrap, child);
      wrap.appendChild(child);
    });
    wraps = Array.from(track.querySelectorAll(":scope > .project-card-wrap"));
    count = wraps.length;
  };

  const measure = () => {
    if (!wraps.length) return;
    cardW = wraps[0].getBoundingClientRect().width;
    gap = parseFloat(getComputedStyle(track).gap) || 0;
    step = cardW + gap;
  };

  const bindTweens = () => {
    trackXTo = gsap.quickTo(track, "x", {
      duration: 0.45,
      ease: "power2.out",
    });
  };

  /* ---------- Render (distance-from-centre coverflow) ---------- */

  const render = () => {
    if (!count || step <= 0) return;

    const vw = viewport.clientWidth;
    const targetX = vw / 2 - cardW / 2 - center * step;
    if (reducedMotion) gsap.set(track, { x: targetX });
    else trackXTo(targetX);

    wraps.forEach((wrap, i) => {
      // Wrapped signed distance from the centred position, in [-count/2, count/2]
      let d = (((i - center) % count) + count) % count;
      if (d > count / 2) d -= count;
      const ad = Math.abs(d);

      const scale = Math.max(0.7, 1 - ad * 0.15);
      const opacity = Math.max(0.35, 1 - ad * 0.32);
      if (reducedMotion) {
        gsap.set(wrap, { scale, opacity });
      } else {
        // Use gsap.to with overwrite for scale — quickTo doesn't work reliably
        // on transform properties. opacity is a regular CSS prop, so quickTo
        // would work, but we use gsap.to here for consistency and simplicity.
        gsap.to(wrap, {
          scale,
          opacity,
          duration: 0.45,
          ease: "power2.out",
          overwrite: "auto",
        });
      }
      wrap.style.zIndex = String(Math.round(100 - ad * 10));
    });
  };

  /* ---------- Autoplay (runs every frame) ---------- */

  const tick = () => {
    if (!dragging && !autoPaused && !reducedMotion && count) {
      const dt = gsap.ticker.deltaRatio(60) / 60; // seconds
      center = (((center + (count / CYCLE_SECONDS) * dt) % count) + count) % count;
    }
    render();
  };
  gsap.ticker.add(tick);

  /* ---------- Drag / swipe (manual override) ---------- */

  viewport.setAttribute("tabindex", "0");
  viewport.setAttribute("aria-label", "Projects carousel — drag or use the arrow keys");

  viewport.addEventListener("pointerdown", (e) => {
    dragging = true;
    autoPaused = true;
    clearTimeout(resumeTimer);
    pointerId = e.pointerId;
    lastX = e.clientX;
    moved = 0;
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add("is-dragging");
    e.preventDefault();
  });

  viewport.addEventListener("pointermove", (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    moved += Math.abs(dx);
    if (step > 0) center -= dx / step;
    render();
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    viewport.classList.remove("is-dragging");
    resumeTimer = setTimeout(() => {
      autoPaused = false;
    }, RESUME_DELAY_MS);
  };

  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  // Swallow a click that follows an actual drag (otherwise dragging would
  // trigger the card's "View Project" link).
  viewport.addEventListener(
    "click",
    (e) => {
      if (moved > 8) {
        e.preventDefault();
        e.stopPropagation();
        moved = 0;
      }
    },
    true
  );

  // Keyboard: ArrowLeft / ArrowRight step one card (viewport is tabbable).
  viewport.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      nudge(-1);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      nudge(1);
      e.preventDefault();
    }
  });

  /* ---------- Arrows ---------- */

  const nudge = (dir) => {
    autoPaused = true;
    clearTimeout(resumeTimer);
    if (count === 0 || reducedMotion) {
      center = (((center + dir) % count) + count) % count;
      render();
    } else {
      posRef.v = center;
      gsap.to(posRef, {
        v: center + dir,
        duration: 0.55,
        ease: "power2.out",
        onUpdate: () => {
          center = posRef.v;
        },
      });
    }
    resumeTimer = setTimeout(() => {
      autoPaused = false;
    }, RESUME_DELAY_MS);
  };

  const prevBtn = carousel.querySelector(".carousel-arrow--prev");
  const nextBtn = carousel.querySelector(".carousel-arrow--next");
  if (prevBtn) prevBtn.addEventListener("click", () => nudge(-1));
  if (nextBtn) nextBtn.addEventListener("click", () => nudge(1));

  /* ---------- Resize ---------- */

  window.addEventListener("resize", () => {
    measure();
    render();
  });

  /* ---------- Rebuild (after projects.js swaps in fetched cards) ---------- */

  const rebuild = () => {
    wrapCards();
    bindTweens();
    measure();
    center = (((center % count) + count) % count) || 0;
    render();
  };

  window.__carouselRebuild = rebuild;

  rebuild();
})();