/* ==========================================================================
   about-scene.js — chrome 3D torus knot for the About section.

   Renders a slowly-rotating polished-chrome torus knot inside the About
   photo slot (#aboutPhoto). A separate transparent WebGL canvas, scoped to
   that container, reusing the same pattern as the hero scene:

   - MeshPhysicalMaterial: metalness ~1, roughness ~0.15 (polished chrome).
   - Studio lighting: key + fill + rim lights AND a procedural grey studio
     environment map, because metal only reads as chrome with reflections.
   - Continuous slow rotation + subtle pointer parallax tilt toward the
     cursor while the pointer is over the About section.
   - Monochrome (white/grey) to match the site theme.

   Three.js (MIT) is vendored at js/vendor/three.min.js.
   ========================================================================== */

(() => {
  "use strict";

  const mount = document.getElementById("aboutPhoto");
  const aboutSection = document.getElementById("about");
  if (!mount || !aboutSection) return;

  // -------------------------------------------------------------- renderer
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch (err) {
    console.warn("[about-scene] WebGL unavailable, skipping 3D sculpture.", err);
    return;
  }

  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;";
  mount.appendChild(canvas);

  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  // r149: sRGB output keeps physically-based materials looking correct
  renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 4.4);

  /* ------------------------------------------------ studio environment
     Chrome is ~99% reflection — without an environment map a metalness:1
     surface looks near-black, and with only a soft uniform map it looks like
     matte plastic. Real chrome needs HIGH CONTRAST to reflect: a dark room
     with a few bright softboxes/light strips. Those sharp bright/dark bands
     are what produce mirror-like streaks that slide across the surface as
     the knot rotates. */
  const makeStudioEnv = () => {
    const cv = document.createElement("canvas");
    cv.width = 1024;
    cv.height = 512;
    const ctx = cv.getContext("2d");

    // Dark cyclorama base (upper half slightly less dark than floor)
    const base = ctx.createLinearGradient(0, 0, 0, 512);
    base.addColorStop(0, "#3a3a3a");
    base.addColorStop(0.42, "#262626");
    base.addColorStop(0.55, "#171717");
    base.addColorStop(1, "#0c0c0c");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 1024, 512);

    // Bright softboxes (upper area) — near-white, soft edges
    const box = (x, y, w, h) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillRect(x - 26, y - 26, w + 52, h + 52);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, w, h);
    };
    box(90, 26, 330, 120); // key softbox (upper-left)
    box(620, 20, 300, 110); // second softbox (upper-right)

    // Thin vertical light strips at the sides -> vertical streaks on chrome
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(6, 40, 34, 380);
    ctx.fillRect(984, 30, 34, 360);

    // Soft floor bounce under the object
    ctx.fillStyle = "#8f8f8f";
    ctx.fillRect(330, 430, 380, 40);
    ctx.fillStyle = "#c9c9c9";
    ctx.fillRect(360, 412, 320, 26);

    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  };

  let envTex = null;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromEquirectangular(makeStudioEnv()).texture;
    scene.environment = envTex;
  } catch (err) {
    // Env map is essential for chrome; without it the metal stays dark.
    console.warn("[about-scene] Environment map unavailable, using lights only.", err);
  }

  /* ------------------------------------------------------------- lighting
     Studio lights with distinct color temperatures so the chrome shows
     visible warm/cool variation in its reflections (like real chrome under
     mixed lighting): warm key, cool fill, cool-blue rim. */
  const amb = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(amb);

  // Key — strong warm-white, upper-right-front
  const key = new THREE.DirectionalLight(0xfff1df, 3.2);
  key.position.set(4, 5, 6);
  scene.add(key);

  // Fill — cooler, softer, from the left
  const fill = new THREE.DirectionalLight(0xdce9ff, 0.7);
  fill.position.set(-5, -1, 3);
  scene.add(fill);

  // Rim — cool accent from behind, traces the silhouette
  const rim = new THREE.DirectionalLight(0xcfe0ff, 2.2);
  rim.position.set(0, 2, -6);
  scene.add(rim);

  /* ------------------------------------------------------------ sculpture
     Torus knot in polished chrome. Slow continuous spin lives on a parent
     group; pointer parallax tilt lives on the mesh so they don't fight. */
  const world = new THREE.Group();
  scene.add(world);

  const segs = isMobile ? 160 : 260;
  const geometry = new THREE.TorusKnotGeometry(1.05, 0.32, segs, isMobile ? 24 : 36);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, // chrome colour comes from reflections, not albedo
    metalness: 1.0,
    roughness: 0.05, // near mirror-smooth
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.6,
  });
  // Bind the env map directly on the material as well as the scene
  if (envTex) {
    material.envMap = envTex;
  }
  const mesh = new THREE.Mesh(geometry, material);
  world.add(mesh);
  world.scale.setScalar(0.82);

  /* ------------------------------------------------- pointer parallax
     Cursor position inside the About section steers a subtle tilt. */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const canHover = window.matchMedia("(hover: hover)").matches;

  const setPointerFromEvent = (event) => {
    const rect = mount.getBoundingClientRect();
    pointer.tx = ((event.clientX - rect.left) / (rect.width || 1)) * 2 - 1;
    pointer.ty = ((event.clientY - rect.top) / (rect.height || 1)) * 2 - 1;
  };
  if (canHover) {
    aboutSection.addEventListener("pointermove", setPointerFromEvent);
    aboutSection.addEventListener("pointerleave", () => {
      pointer.tx = 0;
      pointer.ty = 0;
    });
  }

  // ---------------------------------------------------------------- resize
  const setSize = () => {
    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false); // false => keep CSS sizing
  };
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(setSize).observe(mount);
  }
  window.addEventListener("resize", setSize);
  setSize();

  // Skip rendering work while the section is off-screen
  let sectionVisible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      sectionVisible = entries[0].isIntersecting;
    }).observe(mount);
  }

  // --------------------------------------------------------------- animate
  const clock = new THREE.Clock();
  const renderOnce = () => renderer.render(scene, camera);

  if (reduceMotion) {
    // Static, well-composed frame — no rotation or parallax.
    world.rotation.x = 0.35;
    world.rotation.y = 0.55;
    renderOnce();
    return;
  }

  const animate = () => {
    requestAnimationFrame(animate);
    if (!sectionVisible) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // Continuous slow rotation (calm drift)
    world.rotation.y += dt * 0.26;
    world.rotation.x = Math.sin(t * 0.18) * 0.16;

    // Subtle parallax tilt toward the cursor, eased
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    mesh.rotation.y = pointer.x * 0.22;
    mesh.rotation.x = pointer.y * -0.18;

    renderer.render(scene, camera);
  };
  animate();

  // Expose a ready flag + debug handle (material/scene introspection & manual
  // renders for pixel-level checks)
  window.__aboutSceneReady = true;
  window.__aboutSceneDebug = { material, scene, camera, renderer, mesh };
})();
