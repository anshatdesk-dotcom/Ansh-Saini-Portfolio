/* ==========================================================================
   hero-scene.js — Three.js 3D background for the Home/Hero section only.

   Renders a slow-rotating monochrome low-poly wireframe icosahedron with a
   faint particle orbit behind the hero text. The WebGL canvas is absolutely
   positioned inside the hero, transparent, pointer-events:none and layered
   BELOW the text (z-index 0 vs 1), so it never shifts layout, blocks
   scrolling, or interferes with the nav / scroll indicator.

   Three.js (MIT) is vendored at js/vendor/three.min.js.
   ========================================================================== */

(() => {
  "use strict";

  const hero = document.getElementById("home");
  if (!hero) return;

  // ------------------------------------------------------------------ setup
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,                 // transparent canvas — black page shows through
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch (err) {
    console.warn("[hero-scene] WebGL unavailable, skipping 3D background.", err);
    return;
  }

  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;display:block;";
  hero.prepend(canvas); // first child => behind .hero-content (z-index:1)

  const scene = new THREE.Scene(); // transparent background
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 8;

  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Cap pixel ratio on small screens / high-DPI displays for performance
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));

  // --------------------------------------------------------------- 3D content
  const world = new THREE.Group();
  scene.add(world);

  // Outer low-poly shell — crisp edges, matte grey
  const shellGeo = new THREE.IcosahedronGeometry(1.85, 1);
  const shell = new THREE.LineSegments(
    new THREE.EdgesGeometry(shellGeo),
    new THREE.LineBasicMaterial({
      color: 0xbfbfbf,
      transparent: true,
      opacity: 0.85,
    })
  );
  world.add(shell);

  // Inner ghost wireframe — white, faint, counter-rotates for depth
  const coreGeo = new THREE.IcosahedronGeometry(1.15, 1);
  const core = new THREE.Mesh(
    coreGeo,
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    })
  );
  world.add(core);

  // Sparse particle orbit ring in white/grey
  const orbitCount = isMobile ? 160 : 420;
  const positions = new Float32Array(orbitCount * 3);
  for (let i = 0; i < orbitCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 3.1 + Math.random() * 0.85;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 0.55;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const orbitGeo = new THREE.BufferGeometry();
  orbitGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const orbit = new THREE.Points(
    orbitGeo,
    new THREE.PointsMaterial({
      color: 0xdddddd,
      size: 0.035,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
      depthWrite: false,
    })
  );
  world.add(orbit);

  // ------------------------------------------------------ pointer parallax
  // Normalized cursor position, -1..1 (clamped); ignored on touch devices.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const canHover = window.matchMedia("(hover: hover)").matches;

  window.addEventListener("pointermove", (event) => {
    pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
  });

  // Hovering the hero speeds up rotation & slightly scales the shapes
  let hoverActive = false;
  if (canHover) {
    hero.addEventListener("pointerenter", () => {
      hoverActive = true;
    });
    hero.addEventListener("pointerleave", () => {
      hoverActive = false;
    });
  }

  // Scroll depth: eases the camera down as the hero scrolls up, so the 3D
  // geometry appears to lag behind the text (~0.5x scroll feel for depth).
  let cameraY = 0;

  // ------------------------------------------------------------ resize
  const setSize = () => {
    const width = hero.clientWidth || 1;
    const height = hero.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false); // false => keep our CSS sizing
  };

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(setSize).observe(hero);
  }
  window.addEventListener("resize", setSize);
  setSize();

  // Skip rendering work while the hero is off-screen
  let heroVisible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      heroVisible = entries[0].isIntersecting;
    }).observe(hero);
  }

  // ------------------------------------------------------------ animate
  const clock = new THREE.Clock();

  // Rotation/scale boost factor while the hero is hovered
  let boost = 1;
  let boostScale = 1;

  const renderOnce = () => {
    renderer.render(scene, camera);
  };

  if (reduceMotion) {
    // Respect reduced motion: static scene, no rotation or parallax
    shell.rotation.y = 0.6;
    core.rotation.x = 0.4;
    core.rotation.y = 0.3;
    orbit.rotation.z = 0.4;
    renderOnce();
    return;
  }

  const animate = () => {
    requestAnimationFrame(animate);
    if (!heroVisible) return; // keep the loop alive but do no work off-screen

    const dt = Math.min(clock.getDelta(), 0.05);

    // Scroll-depth parallax: hero progress 0 -> 1 as it leaves the viewport
    const heroRect = hero.getBoundingClientRect();
    const heroProgress = Math.min(
      Math.max((window.innerHeight - heroRect.bottom) / (heroRect.height || 1), 0),
      1
    );
    cameraY += (heroProgress * 1.8 - cameraY) * 0.08;
    camera.position.y = cameraY;

    // Smoothly ease parallax toward the pointer
    pointer.x += (pointer.tx - pointer.x) * 0.045;
    pointer.y += (pointer.ty - pointer.y) * 0.045;

    const parallax = canHover ? 0.18 : 0; // radians max tilt
    world.rotation.x = pointer.y * parallax;
    world.rotation.y = dt * 0.18 + pointer.x * parallax * 0.4;

    // Hover: ease the speed/scale multipliers toward their target
    boost += ((hoverActive ? 1.9 : 1) - boost) * 0.05;
    boostScale += ((hoverActive ? 1.05 : 1) - boostScale) * 0.05;
    shell.scale.setScalar(boostScale);
    core.scale.setScalar(boostScale);

    // Continuous slow rotation (calm drift; sped up on hover)
    shell.rotation.y -= dt * 0.22 * boost;
    core.rotation.y += dt * 0.14 * boost;
    core.rotation.x += dt * 0.08 * boost;
    orbit.rotation.z -= dt * 0.05 * boost;
    orbit.rotation.y += dt * 0.02 * boost;

    renderer.render(scene, camera);
  };
  animate();

  // Expose a ready flag for debugging / tests
  window.__heroSceneReady = true;
})();
