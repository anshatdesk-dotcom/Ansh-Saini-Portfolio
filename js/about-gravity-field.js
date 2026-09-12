/* ==========================================================================
   about-gravity-field.js — faint background dot-field behind the About
   section that bends away from the cursor, like the chrome sculpture's
   mass is warping the space around it.

   Purely decorative and independent of js/about-scene.js (which already
   tilts the chrome object toward the cursor) — this only adds the
   background starfield-distortion layer behind the content.

   Respects prefers-reduced-motion and is skipped on touch devices (no
   cursor to react to).
   ========================================================================== */

(() => {
  "use strict";

  const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = matchMedia("(hover: none), (pointer: coarse)").matches;
  if (prefersReducedMotion || isTouch) return;

  const aboutSection = document.getElementById("about");
  if (!aboutSection) return;

  aboutSection.style.position = aboutSection.style.position || "relative";

  const canvas = document.createElement("canvas");
  canvas.className = "about-gravity-canvas";
  canvas.setAttribute("aria-hidden", "true");
  aboutSection.prepend(canvas); // sits behind .container via z-index in CSS

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  let w = 0, h = 0;
  let dots = [];
  const SPACING = 48;

  function buildDots() {
    dots = [];
    for (let x = 0; x < w + SPACING; x += SPACING) {
      for (let y = 0; y < h + SPACING; y += SPACING) {
        dots.push({ ox: x, oy: y, x, y, vx: 0, vy: 0 });
      }
    }
  }

  function resize() {
    const rect = aboutSection.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildDots();
  }
  resize();
  window.addEventListener("resize", resize);

  let mouseX = w / 2, mouseY = h / 2;
  let targetX = mouseX, targetY = mouseY;
  let hasPointer = false;
  let running = true;

  aboutSection.addEventListener("pointermove", (e) => {
    const rect = aboutSection.getBoundingClientRect();
    targetX = e.clientX - rect.left;
    targetY = e.clientY - rect.top;
    hasPointer = true;
  });
  aboutSection.addEventListener("pointerleave", () => {
    hasPointer = false;
  });

  // Pause the render loop entirely while the About section is far off-screen.
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          running = entry.isIntersecting;
        });
      },
      { rootMargin: "200px" }
    );
    observer.observe(aboutSection);
  }

  function animate() {
    requestAnimationFrame(animate);
    if (!running) return;

    mouseX += (targetX - mouseX) * 0.06;
    mouseY += (targetY - mouseY) * 0.06;

    ctx.clearRect(0, 0, w, h);
    dots.forEach((d) => {
      const ddx = d.ox - mouseX;
      const ddy = d.oy - mouseY;
      const dist = Math.max(30, Math.hypot(ddx, ddy));
      let fx = 0, fy = 0;
      if (hasPointer && dist < 160) {
        const push = (1 - dist / 160) * 22;
        fx = (ddx / dist) * push;
        fy = (ddy / dist) * push;
      }
      const tx = d.ox + fx;
      const ty = d.oy + fy;
      d.vx = (d.vx + (tx - d.x) * 0.1) * 0.8;
      d.vy = (d.vy + (ty - d.y) * 0.1) * 0.8;
      d.x += d.vx;
      d.y += d.vy;

      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.arc(d.x, d.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  requestAnimationFrame(animate);
})();
