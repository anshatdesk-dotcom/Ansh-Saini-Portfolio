/* ==========================================================================
   about-text-scatter.js — words in the About section's bio paragraphs
   scatter away from the cursor, then spring back to their original resting
   position once the cursor moves away (or after a short delay).

   Splits each paragraph into word-level spans (not letters — keeps the
   text readable while it's near the cursor) and applies a simple
   spring-physics update each frame: an outward repel force while the
   cursor is close, and a pull-back-to-origin force always active.

   Respects prefers-reduced-motion and is skipped on touch devices (no
   cursor to scatter from).
   ========================================================================== */

(() => {
  "use strict";

  const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = matchMedia("(hover: none), (pointer: coarse)").matches;
  if (prefersReducedMotion || isTouch) return;

  const container = document.querySelector(".about-text");
  if (!container || container.dataset.scatterReady) return;
  container.dataset.scatterReady = "true";

  const RADIUS = 220; // px — how close the cursor must be to scatter a character
  const REPEL_STRENGTH = 2600; // higher = stronger push
  const RETURN_STRENGTH = 0.06; // higher = snaps home faster
  const DAMPING = 0.88; // velocity decay each frame, keeps motion settled not jittery

  // Split every paragraph's text into word spans (for natural line wrapping),
  // then each word into per-character spans (so letters scatter individually).
  // Spaces between words stay as plain text nodes.
  const paragraphs = Array.from(container.querySelectorAll("p"));
  const words = []; // holds per-character entries; name kept for the rest of the script

  paragraphs.forEach((p) => {
    const text = p.textContent.trim();
    if (!text) return; // skip empty paragraphs (e.g. a leftover empty <em>)
    p.textContent = ""; // clear, we rebuild with spans + space nodes

    text.split(/(\s+)/).forEach((token) => {
      if (token.trim() === "") {
        p.appendChild(document.createTextNode(token));
        return;
      }
      const wordSpan = document.createElement("span");
      wordSpan.className = "about-word";
      Array.from(token).forEach((ch) => {
        const charSpan = document.createElement("span");
        charSpan.className = "about-char";
        charSpan.textContent = ch;
        wordSpan.appendChild(charSpan);
        words.push({
          el: charSpan,
          ox: 0, oy: 0, // original resting offset, measured after layout
          x: 0, y: 0,   // current offset
          vx: 0, vy: 0,
          jitter: 0.8 + Math.random() * 0.5, // 0.8–1.3x, so chars don't move identically
        });
      });
      p.appendChild(wordSpan);
    });
  });

  if (!words.length) return;

  // Measure each word's resting position relative to the container, once
  // layout has settled (fonts loaded, etc).
  function measureRestingPositions() {
    const containerRect = container.getBoundingClientRect();
    words.forEach((w) => {
      const r = w.el.getBoundingClientRect();
      w.ox = r.left - containerRect.left + r.width / 2;
      w.oy = r.top - containerRect.top + r.height / 2;
    });
  }
  measureRestingPositions();
  window.addEventListener("resize", () => {
    // Reset transforms before re-measuring so stale offsets don't skew the new baseline
    words.forEach((w) => { w.el.style.transform = ""; w.x = 0; w.y = 0; w.vx = 0; w.vy = 0; });
    requestAnimationFrame(measureRestingPositions);
  });

  let pointerX = -9999, pointerY = -9999;
  let hasPointer = false;

  container.addEventListener("pointermove", (e) => {
    const rect = container.getBoundingClientRect();
    pointerX = e.clientX - rect.left;
    pointerY = e.clientY - rect.top;
    hasPointer = true;
  });
  container.addEventListener("pointerleave", () => {
    hasPointer = false;
  });

  let running = true;
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => { running = entry.isIntersecting; }),
      { rootMargin: "150px" }
    );
    observer.observe(container);
  }

  function animate() {
    requestAnimationFrame(animate);
    if (!running) return;

    words.forEach((w) => {
      const currentX = w.ox + w.x;
      const currentY = w.oy + w.y;
      const dx = currentX - pointerX;
      const dy = currentY - pointerY;
      const dist = Math.max(1, Math.hypot(dx, dy));

      let fx = 0, fy = 0;
      if (hasPointer && dist < RADIUS) {
        const push = (1 - dist / RADIUS) * REPEL_STRENGTH * w.jitter;
        fx = (dx / dist) * push * 0.0016;
        fy = (dy / dist) * push * 0.0016;
      }

      // Always-on pull back toward the original resting offset (0,0 in local terms)
      fx += -w.x * RETURN_STRENGTH;
      fy += -w.y * RETURN_STRENGTH;

      w.vx = (w.vx + fx) * DAMPING;
      w.vy = (w.vy + fy) * DAMPING;
      w.x += w.vx;
      w.y += w.vy;

      w.el.style.transform = `translate(${w.x.toFixed(2)}px, ${w.y.toFixed(2)}px)`;
    });
  }
  requestAnimationFrame(animate);
})();
