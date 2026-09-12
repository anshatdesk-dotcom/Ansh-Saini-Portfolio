/* ==========================================================================
   hero-repel.js — Magnetic Repel effect on the hero "Ansh Saini" heading.

   Splits the heading into per-letter spans (after the existing fade/rise
   entrance in animations.js has played) and, on mousemove, pushes any
   letter within a radius of the cursor away from it — like same-pole
   magnets repelling. Letters ease back to rest once the cursor moves away.

   Respects prefers-reduced-motion and is skipped entirely on touch devices
   (no cursor to repel from), consistent with js/cursor.js.
   ========================================================================== */

(() => {
  "use strict";

  if (typeof gsap === "undefined") return; // vendor script failed to load

  const isTouch = matchMedia("(hover: none), (pointer: coarse)").matches;
  const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (isTouch || prefersReducedMotion) return;

  const heading = document.querySelector(".hero-title");
  if (!heading || heading.dataset.repelReady) return;

  const RADIUS = 160; // px — how close the cursor must be to affect a letter
  const STRENGTH = 0.9; // how far letters get pushed at maximum proximity

  const init = () => {
    if (heading.dataset.repelReady) return; // guard against double-init
    heading.dataset.repelReady = "true";

    const text = heading.textContent;
    heading.setAttribute("aria-label", text); // keep the name accessible to screen readers
    heading.innerHTML = text
      .split("")
      .map((ch) =>
        ch === " "
          ? '<span class="hero-title-char" aria-hidden="true">&nbsp;</span>'
          : `<span class="hero-title-char" aria-hidden="true">${ch}</span>`
      )
      .join("");

    const chars = Array.from(heading.querySelectorAll(".hero-title-char"));

    const onMouseMove = (e) => {
      chars.forEach((char) => {
        const rect = char.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = cx - e.clientX;
        const dy = cy - e.clientY;
        const dist = Math.hypot(dx, dy);

        if (dist < RADIUS) {
          const strength = 1 - dist / RADIUS;
          gsap.to(char, {
            duration: 0.35,
            x: dx * strength * STRENGTH,
            y: dy * strength * STRENGTH,
            rotate: dx * strength * 0.08,
            scale: 1 - strength * 0.15,
            ease: "power3.out",
            overwrite: "auto",
          });
        } else {
          gsap.to(char, {
            duration: 0.6,
            x: 0,
            y: 0,
            rotate: 0,
            scale: 1,
            ease: "elastic.out(1, 0.5)",
            overwrite: "auto",
          });
        }
      });
    };

    document.addEventListener("mousemove", onMouseMove);

    // If the cursor leaves the window entirely, ease every letter back to rest
    document.addEventListener("mouseleave", () => {
      chars.forEach((char) => {
        gsap.to(char, {
          duration: 0.6,
          x: 0,
          y: 0,
          rotate: 0,
          scale: 1,
          ease: "elastic.out(1, 0.5)",
          overwrite: "auto",
        });
      });
    });
  };

  // Wait for the hero entrance animation (in animations.js) to finish its
  // fade/rise on `.hero-title` as a whole before splitting it into spans —
  // otherwise the two animations would fight over the same element.
  if (document.readyState === "complete") {
    setTimeout(init, 900);
  } else {
    window.addEventListener("load", () => setTimeout(init, 900));
  }
})();
