/* ==========================================================================
   contact-orbit.js — "Orbiting Moons" typing effect on the Contact form's
   Name, Email, and Message fields.

   Each keystroke spawns a small glowing sphere above the caret that orbits
   briefly, then flings outward and fades — rendered on a transparent canvas
   layered behind each field, drawn fresh every frame (no persistent DOM
   nodes per letter, so long typing sessions stay cheap).

   Respects prefers-reduced-motion. Runs on touch devices too (typing still
   happens there), but only while the Contact section is near the viewport,
   to avoid any background cost while scrolled elsewhere on the page.
   ========================================================================== */

(() => {
  "use strict";

  const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  const FIELD_IDS = ["formName", "formEmail", "formMessage"];
  const fields = FIELD_IDS
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!fields.length) return;

  const contactSection = document.getElementById("contact");

  function caretPoint(input, wrapRect) {
    const inputRect = input.getBoundingClientRect();
    const val = input.value;
    const ratio = Math.min(val.length / 42, 1);
    const x = (inputRect.left - wrapRect.left) + 16 + ratio * (inputRect.width - 32);
    const y = (inputRect.top - wrapRect.top) + inputRect.height / 2;
    return { x, y };
  }

  fields.forEach((input) => {
    const fieldWrapper = input.closest(".form-field");
    if (!fieldWrapper || fieldWrapper.dataset.orbitReady) return;
    fieldWrapper.dataset.orbitReady = "true";
    fieldWrapper.style.position = "relative";

    const wrap = document.createElement("div");
    wrap.className = "contact-orbit-canvas-wrap";
    wrap.setAttribute("aria-hidden", "true");
    fieldWrapper.appendChild(wrap);

    const canvas = document.createElement("canvas");
    wrap.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    let w = 0, h = 0, dpr = window.devicePixelRatio || 1;
    let running = false;
    let rafId = null;

    function resize() {
      const rect = wrap.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const moons = []; // {cx, cy, angle, radius, angularV, born, orbitDuration, size, flungAngle, flungSpeed}

    function spawnMoon() {
      const wrapRect = wrap.getBoundingClientRect();
      const { x, y } = caretPoint(input, wrapRect);
      moons.push({
        cx: x,
        cy: y - 18,
        angle: Math.random() * Math.PI * 2,
        radius: 9 + Math.random() * 7,
        angularV: (0.15 + Math.random() * 0.1) * (Math.random() < 0.5 ? 1 : -1),
        born: performance.now(),
        orbitDuration: 650 + Math.random() * 300,
        size: 1.6 + Math.random() * 1.4,
        flungAngle: null,
        flungSpeed: 2 + Math.random() * 2,
      });
      if (moons.length > 60) moons.shift();
      startLoop();
    }

    input.addEventListener("keydown", (e) => {
      if (e.key.length === 1) spawnMoon(); // any printable character
    });

    function drawMoon(x, y, size, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#e8e8e8";
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);
      const now = performance.now();

      for (let i = moons.length - 1; i >= 0; i--) {
        const m = moons[i];
        const age = now - m.born;

        if (age < m.orbitDuration) {
          m.angle += m.angularV;
          const x = m.cx + Math.cos(m.angle) * m.radius;
          const y = m.cy + Math.sin(m.angle) * m.radius * 0.6;
          const alpha = Math.min(1, age / 150);
          drawMoon(x, y, m.size, alpha);
        } else {
          if (m.flungAngle === null) m.flungAngle = m.angle + Math.PI / 2;
          const t = (age - m.orbitDuration) / 1000;
          if (t > 1.1) {
            moons.splice(i, 1);
            continue;
          }
          const dist = m.flungSpeed * t * 60;
          const x = m.cx + Math.cos(m.flungAngle) * (m.radius + dist);
          const y = m.cy + Math.sin(m.flungAngle) * (m.radius + dist) * 0.6 - t * 20;
          const alpha = Math.max(0, 1 - t / 1.1);
          drawMoon(x, y, m.size, alpha);
        }
      }

      if (moons.length > 0) {
        rafId = requestAnimationFrame(frame);
      } else {
        running = false; // stop the loop entirely once nothing is left to draw
      }
    }

    function startLoop() {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(frame);
    }

    // Pause entirely once the Contact section is far off-screen, so this
    // never costs anything while the user is elsewhere on the page.
    if (contactSection && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting && rafId) {
              cancelAnimationFrame(rafId);
              running = false;
            }
          });
        },
        { rootMargin: "200px" }
      );
      observer.observe(contactSection);
    }
  });
})();
