/* ==========================================================================
   cursor.js — two-ball cursor with GSAP movement

   Two solid circles (big + small) follow the mouse via GSAP tweens.
   mix-blend-mode: difference on each creates clean text inversion.
   Reference: CodePen "Circle cursor with blend mode" by clementGir

   Must load after GSAP (gsap.min.js) and at end of <body>.
   ========================================================================== */

(() => {
  "use strict";

  // --- Touch detection: bail early, add fallback class for CSS ---
  const isTouch =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(hover: none), (pointer: coarse)").matches;

  if (isTouch) {
    document.body.classList.add("touch-device");
    return;
  }

  // Enable cursor-none on body
  document.body.classList.add("glow-cursor-active");

  // --- Create the two ball elements ---
  const bigBall = document.createElement("div");
  bigBall.className = "cursor-ball cursor-ball--big";
  bigBall.setAttribute("aria-hidden", "true");
  bigBall.setAttribute("role", "presentation");
  document.body.appendChild(bigBall);

  const smallBall = document.createElement("div");
  smallBall.className = "cursor-ball cursor-ball--small";
  smallBall.setAttribute("aria-hidden", "true");
  smallBall.setAttribute("role", "presentation");
  document.body.appendChild(smallBall);

  // --- State ---
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;

  // --- Reduced motion: skip GSAP tweens ---
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- Track mouse ---
  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // --- GSAP render loop: tween balls toward mouse ---
  const tick = () => {
    if (reducedMotion) {
      // Snap directly — no lag
      gsap.set(bigBall, { x: mouseX, y: mouseY });
      gsap.set(smallBall, { x: mouseX, y: mouseY });
    } else {
      // Big ball: slow follower (0.4s)
      gsap.to(bigBall, {
        x: mouseX,
        y: mouseY,
        duration: 0.4,
        ease: "power2.out",
        overwrite: "auto",
      });

      // Small ball: fast follower (0.1s)
      gsap.to(smallBall, {
        x: mouseX,
        y: mouseY,
        duration: 0.1,
        ease: "power2.out",
        overwrite: "auto",
      });
    }

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);

  // --- Hover state: scale big ball on interactive elements ---
  const INTERACTIVE_SELECTOR = [
    "a",
    "button",
    "input",
    "textarea",
    "select",
    ".btn",
    ".btn-outline",
    ".nav-link",
    ".social-link",
    ".project-card",
    ".project-link",
    ".scroll-indicator",
    ".nav-toggle",
    ".chip",
    ".hero-title",
  ].join(",");

  const handleEnter = () => {
    gsap.to(bigBall, {
      scale: 3,
      duration: 0.2,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  const handleLeave = () => {
    gsap.to(bigBall, {
      scale: 1,
      duration: 0.3,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  // Use event delegation on body for efficiency
  document.body.addEventListener("mouseenter", (e) => {
    if (e.target.closest(INTERACTIVE_SELECTOR)) {
      handleEnter();
    }
  }, true);

  document.body.addEventListener("mouseleave", (e) => {
    if (e.target.closest(INTERACTIVE_SELECTOR)) {
      handleLeave();
    }
  }, true);

  // --- Clean up on page hide (background tab) ---
  // GSAP handles rAF internally, nothing extra needed
})();
