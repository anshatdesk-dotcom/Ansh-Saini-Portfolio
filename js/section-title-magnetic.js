/* ==========================================================================
   section-title-magnetic.js — Magnetic Pull effect on every .section-title
   heading (About, Projects, Resume, Contact).

   Splits each heading into per-letter spans and, on mousemove, pulls any
   letter within a radius of the cursor toward it — the inverse of the
   Hero's Magnetic Repel (js/hero-repel.js). Letters ease back to rest once
   the cursor moves away.

   Respects prefers-reduced-motion and is skipped on touch devices (no
   cursor to pull toward), consistent with hero-repel.js and cursor.js.
   ========================================================================== */

(() => {
  "use strict";

  if (typeof gsap === "undefined") return; // vendor script failed to load

  const isTouch = matchMedia("(hover: none), (pointer: coarse)").matches;
  const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (isTouch || prefersReducedMotion) return;

  const headings = Array.from(document.querySelectorAll(".section-title"));
  if (!headings.length) return;

  const RADIUS = 140; // px — how close the cursor must be to affect a letter
  const STRENGTH = 0.4; // how far letters get pulled at maximum proximity

  const allChars = []; // flat list across every heading, for one shared mousemove loop

  function splitHeading(heading) {
    if (heading.dataset.magneticReady) return;
    heading.dataset.magneticReady = "true";

    const text = heading.textContent;
    heading.setAttribute("aria-label", text); // keep the heading accessible to screen readers
    heading.innerHTML = text
      .split("")
      .map((ch) =>
        ch === " "
          ? '<span class="section-title-char" aria-hidden="true">&nbsp;</span>'
          : `<span class="section-title-char" aria-hidden="true">${ch}</span>`
      )
      .join("");

    heading.querySelectorAll(".section-title-char").forEach((char) => allChars.push(char));
  }

  headings.forEach(splitHeading);
  if (!allChars.length) return;

  const onMouseMove = (e) => {
    allChars.forEach((char) => {
      const rect = char.getBoundingClientRect();
      // Skip characters that are far off-screen (not currently scrolled into view)
      // to avoid unnecessary work on headings elsewhere on the page.
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200) return;

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);

      if (dist < RADIUS) {
        const strength = 1 - dist / RADIUS;
        gsap.to(char, {
          duration: 0.4,
          x: dx * strength * STRENGTH,
          y: dy * strength * STRENGTH,
          rotate: dx * strength * 0.05,
          scale: 1 + strength * 0.25,
          ease: "power3.out",
          overwrite: "auto",
        });
      } else {
        gsap.to(char, {
          duration: 0.5,
          x: 0,
          y: 0,
          rotate: 0,
          scale: 1,
          ease: "power3.out",
          overwrite: "auto",
        });
      }
    });
  };

  document.addEventListener("mousemove", onMouseMove);

  // If the cursor leaves the window entirely, ease every letter back to rest
  document.addEventListener("mouseleave", () => {
    allChars.forEach((char) => {
      gsap.to(char, {
        duration: 0.5,
        x: 0,
        y: 0,
        rotate: 0,
        scale: 1,
        ease: "elastic.out(1, 0.5)",
        overwrite: "auto",
      });
    });
  });
})();
