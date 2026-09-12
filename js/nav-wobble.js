/* ==========================================================================
   nav-wobble.js — Per-letter wobble effect on the nav bar: the "AS" logo
   and every .nav-link (Home, About, Projects, Resume, Contact).

   Splits each element's text into letter spans. On mouseenter, a letter
   pops up, tilts randomly, and scales, then springs back into place with
   an elastic snap.

   Safe alongside existing nav behaviour:
   - The logo's triple-click admin trigger (js/admin.js) listens on the
     .logo element itself via event bubbling, not its text content, so
     splitting into spans does not affect it.
   - The active-link underline (css/nav.css, .nav-link::after) is keyed to
     the anchor's own box, not its text, so it is unaffected too.

   Respects prefers-reduced-motion and is skipped on touch devices (no
   hover there), consistent with hero-repel.js and section-title-magnetic.js.
   ========================================================================== */

(() => {
  "use strict";

  if (typeof gsap === "undefined") return; // vendor script failed to load

  const isTouch = matchMedia("(hover: none), (pointer: coarse)").matches;
  const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (isTouch || prefersReducedMotion) return;

  const targets = Array.from(document.querySelectorAll(".logo, .nav-link"));
  if (!targets.length) return;

  function splitIntoChars(el) {
    if (el.dataset.wobbleReady) return;
    el.dataset.wobbleReady = "true";

    const text = el.textContent;
    el.setAttribute("aria-label", text); // keep the label accessible to screen readers
    el.innerHTML = text
      .split("")
      .map((ch) =>
        ch === " "
          ? '<span class="wobble-char" aria-hidden="true">&nbsp;</span>'
          : `<span class="wobble-char" aria-hidden="true">${ch}</span>`
      )
      .join("");

    el.querySelectorAll(".wobble-char").forEach((char) => {
      char.addEventListener("mouseenter", () => {
        gsap.timeline()
          .to(char, {
            duration: 0.14,
            rotate: gsap.utils.random(-32, 32),
            y: gsap.utils.random(-10, -4),
            scale: 1.3,
            ease: "power2.out",
            overwrite: "auto",
          })
          .to(char, {
            duration: 0.7,
            rotate: 0,
            y: 0,
            scale: 1,
            ease: "elastic.out(1, 0.3)",
          });
      });
    });
  }

  targets.forEach(splitIntoChars);
})();
