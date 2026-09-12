/* ==========================================================================
   celebration.js — contact-form success celebration, driven by real physics
   ==========================================================================

   When a message is successfully sent, this fires a celebration over the
   contact section: a burst of glowing motes plus one large tumbling astronaut.
   Both are simulated as real rigid bodies in a Matter.js engine — gravity, air
   friction, angular velocity and collisions are solved by the engine, not
   tweened along a scripted path.

   The astronaut is genuinely interactive with the form: every field, label and
   button in the contact form is rebuilt as an invisible static body, so the
   astronaut launches, arcs and *bounces off the form's sections* rather than
   drifting through them. The dust deliberately passes through the fields
   (collision categories below) so a burst spawned at the form's centre isn't
   explosively shunted out by the static geometry it starts inside.

   Scope / lifecycle rules that matter here:

     - One Engine + World per celebration, created on trigger. When the last
       body has faded the world is cleared, the engine is torn down, the RAF
       loop stops and the canvas + resize observer are removed. Repeated
       submissions therefore never stack engines, leak bodies or degrade the
       frame budget.
     - The canvas covers the whole contact section and paints *above* its
       content (below the fixed nav at z-index 100), so the effect is never
       hidden behind the form. It is `pointer-events: none`, so every field,
       button and link stays clickable through it.
     - Nothing global is touched: no GSAP timeline, no Three.js scene, no
       cursor listener. This engine runs its own RAF only for the ~3.5s of the
       effect, then gets out of the way.

   Matter.js itself is the official browser build of the `matter-js` npm
   package, vendored like the site's other libraries (see js/vendor/) and
   exposed as window.Matter. */

(function () {
  "use strict";

  const Matter = window.Matter;
  if (!Matter) return;

  const Engine = Matter.Engine;
  const World = Matter.World;
  const Composite = Matter.Composite;
  const Bodies = Matter.Bodies;
  const Body = Matter.Body;

  /* ------------------------------- tuning -------------------------------- */

  const PARTICLE_COUNT = 30; // top of the 20–30 band, for a fuller burst
  const PARTICLE_MIN_R = 3; // motes are large enough to read across the room
  const PARTICLE_MAX_R = 8;
  const PARTICLE_LIFE = 2400; // ms for the dust to fade out
  // Long enough for the fall and a good run of bounces off the fields, but
  // not so long that it has settled and gone static before the fade.
  const ASTRO_LIFE = 3800;
  const ASTRO_FADE = 1000; // ms of fade at the tail of the astronaut's life

  // How much speed a bounce returns. This is what decides whether the
  // astronaut keeps hopping across the form or comes to rest after a couple
  // of touches — at 0.72 it was parked on the first field within 2 seconds.
  const BOUNCE = 0.85;

  // Matter's default gravity is 1. At 0.25 the pull stays gentle enough to
  // read as low gravity, but is strong enough that the astronaut keeps coming
  // back down onto the form and bouncing across its sections instead of
  // hanging in the air (0.1 was too floaty — it settled on the first field).
  const GRAVITY_Y = 0.25;

  // Physics runs on a fixed step (Matter's recommended 60Hz). Frames are
  // accumulated into whole steps and a backgrounded tab can only catch up a
  // few of them, so the simulation stays stable and never jumps or explodes.
  const STEP = 1000 / 60;
  const MAX_STEPS = 3;
  const MAX_DELTA = STEP * MAX_STEPS;

  // Collision categories. The dust must not collide with the form's static
  // bodies (a 30-mote burst spawned at the centre of the message box would be
  // violently ejected from inside it), but the astronaut must.
  const CAT_DEFAULT = 0x0001; // astronaut
  const CAT_PARTICLE = 0x0002; // dust
  const CAT_FORM = 0x0004; // the form's fields, labels and buttons

  // Keeps the astronaut's fall speed below the point where it could skip
  // through a thin field between two physics steps.
  const MAX_ASTRO_SPEED = 10;

  const REDUCED_MOTION =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------- state --------------------------------- */

  let canvas = null; // created on demand, removed on teardown
  let ctx = null;
  let host = null; // the element the canvas is laid over
  let resizeObserver = null;
  let cssWidth = 0; // canvas size in CSS pixels (drawing space)
  let cssHeight = 0;
  let run = null; // the active simulation, or null

  /* --------------------------- canvas plumbing --------------------------- */

  function ensureCanvas() {
    if (canvas && host) return true;
    // The section (not the form) is the canvas host: the burst gets the open
    // space around the form to drift through, and the section already stacks
    // its content beneath the canvas (see css/contact.css).
    const section = document.getElementById("contact");
    const form = document.getElementById("contactForm");
    if (!section || !form) return false;

    host = section;
    canvas = document.createElement("canvas");
    canvas.className = "celebration-canvas";
    canvas.setAttribute("aria-hidden", "true"); // purely decorative
    ctx = canvas.getContext("2d");
    if (!ctx) return false;

    // Absolutely positioned over the section, so it takes no layout space.
    section.appendChild(canvas);

    syncCanvasSize();

    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(syncCanvasSize);
      resizeObserver.observe(host);
    }
    return true;
  }

  function syncCanvasSize() {
    if (!canvas || !ctx || !host) return;
    const rect = host.getBoundingClientRect();
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);

    // Render at device resolution (capped at 2x) but draw in CSS pixels.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(cssWidth * dpr);
    const h = Math.round(cssHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* --------------------------- geometry helpers -------------------------- */

  // A rect in element coordinates -> canvas coordinates (both are measured
  // against the section, so scroll position cancels out).
  function toCanvasRect(rect, hostRect) {
    return {
      x: rect.left - hostRect.left + rect.width / 2,
      y: rect.top - hostRect.top + rect.height / 2,
      w: rect.width,
      h: rect.height,
    };
  }

  // Centre of the contact form, in canvas coordinates — so the burst always
  // originates at the form (beside the success message) regardless of where
  // the section starts or how tall the form happens to be.
  function formCenter() {
    const fallback = { x: cssWidth / 2, y: cssHeight / 2 };
    const form = document.getElementById("contactForm");
    if (!form || !host) return fallback;
    const r = toCanvasRect(form.getBoundingClientRect(), host.getBoundingClientRect());
    if (!r.w || !r.h) return fallback;
    return { x: r.x, y: r.y };
  }

  // Rebuild the form's sections (fields, labels, buttons) as static bodies so
  // the astronaut can land on and bounce off them.
  function formColliders(hostRect) {
    const form = document.getElementById("contactForm");
    if (!form) return { bodies: [], top: null };

    const parts = form.querySelectorAll("label, input, textarea, button, .form-otp");
    const bodies = [];
    let top = null;

    parts.forEach(function (el) {
      // Skip the OTP row while it is collapsed, and anything invisible.
      if (el.closest("[hidden]") || el.offsetParent === null) return;
      const r = toCanvasRect(el.getBoundingClientRect(), hostRect);
      if (r.w < 6 || r.h < 6) return;
      bodies.push(
        Bodies.rectangle(r.x, r.y, r.w, r.h, {
          isStatic: true,        // Lively, and slippery: the astronaut should rebound off each field
        // and keep travelling across the form rather than coming to rest on
        // the first thing it touches.
          restitution: BOUNCE,
          friction: 0.04,
          frictionStatic: 0.1,
          collisionFilter: {
            category: CAT_FORM,
            mask: CAT_DEFAULT | CAT_FORM,
          },
          label: "form-section",
        })
      );
      if (top === null || r.y - r.h / 2 < top) top = r.y - r.h / 2;
    });

    return { bodies: bodies, top: top };
  }

  /* ----------------------------- visuals --------------------------------- */

  // Minimal flat silhouette: helmet ring, visor, rounded torso, two arms.
  // Drawn in local space, rotated by the body's angle so the engine's
  // angular velocity is what makes it tumble.
  function drawAstronaut(x, y, angle, alpha, scale) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = "rgba(236, 238, 242, 0.95)";
    ctx.fillStyle = "rgba(244, 245, 248, 0.92)";
    ctx.shadowColor = "rgba(255, 255, 255, 0.75)";
    ctx.shadowBlur = 22;

    // torso + arms as one filled silhouette
    ctx.beginPath();
    ctx.moveTo(-4.6, -0.5);
    ctx.quadraticCurveTo(0, -3.4, 4.6, -0.5);
    ctx.lineTo(3.2, 6.2);
    ctx.quadraticCurveTo(0, 7.6, -3.2, 6.2);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(-4.2, 0.4);
    ctx.lineTo(-7.4, 3.6);
    ctx.lineTo(-5.6, 5.2);
    ctx.lineTo(-3.4, 2.6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4.2, 0.4);
    ctx.lineTo(7.4, 3.6);
    ctx.lineTo(5.6, 5.2);
    ctx.lineTo(3.4, 2.6);
    ctx.closePath();
    ctx.fill();

    // helmet + visor
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, -6.4, 5.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0.4, -6.8, 2.7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(24, 26, 30, 0.85)";
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  /* ------------------------------ effect --------------------------------- */

  function celebrate() {
    if (REDUCED_MOTION) return;

    // Tear the previous run down *first* — teardown() also removes the
    // canvas, so it has to happen before a new one is created.
    teardown();
    if (!ensureCanvas()) return;
    syncCanvasSize();

    const engine = Engine.create();
    engine.gravity.y = GRAVITY_Y;
    const world = engine.world;

    const hostRect = host.getBoundingClientRect();
    const form = document.getElementById("contactForm");

    /* --- the form itself becomes collision geometry ----------------------- */
    const formGeo = formColliders(hostRect);
    formGeo.bodies.forEach(function (b) {
      Composite.add(world, b);
    });

    const particles = [];
    const origin = formCenter();

    /* --- the burst: glowing motes fired outward from the form's middle ---- */
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Even clockwise spread with jitter, so the burst reads as a ring
      // opening up rather than a random clump.
      const angle =
        (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const radius =
        PARTICLE_MIN_R + Math.random() * (PARTICLE_MAX_R - PARTICLE_MIN_R);
      const body = Bodies.circle(origin.x, origin.y, radius, {
        // High-ish air friction is what makes them coast, slow and drift
        // instead of sailing away at constant speed.
        frictionAir: 0.05 + Math.random() * 0.05,
        restitution: 0.4,
        density: 0.0009,
        // Dust passes through itself and through the form's static bodies,
        // but still collides with the astronaut (which sparks off it).
        collisionFilter: { category: CAT_PARTICLE, mask: CAT_DEFAULT },
      });

      // Fast enough to reach the edges of the section, giving the burst real
      // scale instead of a tight cluster.
      const speed = 5 + Math.random() * 9;
      Body.setVelocity(body, {
        x: Math.cos(angle) * speed,
        // A small upward bias so the cloud lifts slightly as it spreads.
        y: Math.sin(angle) * speed - 2,
      });

      Composite.add(world, body);
      particles.push({
        body,
        radius,
        // Mostly white, with a few dimmer grey motes for depth.
        shade: 200 + Math.round(Math.random() * 55),
        glow: 0.5 + Math.random() * 0.45,
        life: PARTICLE_LIFE * (0.75 + Math.random() * 0.5),
        removed: false,
      });
    }

    /* --- the astronaut: one big body that bounces off the form ------------ */
    const astroRadius = 30; // physics radius — large enough to read clearly
    const astroScale = 3.2; // visual scale of the icon drawn inside it
    // Spawn in the clear band just above the form: outside the static fields
    // (spawning inside one would shove it out unnaturally) but close enough
    // that it lands on them almost immediately.
    const spawnY =
      formGeo.top !== null
        ? Math.max(astroRadius + 12, formGeo.top - astroRadius - 10)
        : origin.y;
    const astro = Bodies.circle(origin.x, spawnY, astroRadius, {
      // Very little air drag so it keeps its spin, plus enough mass to stay
      // steadier and heavier than the dust.
      frictionAir: 0.008,
      restitution: BOUNCE,
      friction: 0.04,
      density: 0.002,
      collisionFilter: {
        category: CAT_DEFAULT,
        mask: CAT_DEFAULT | CAT_PARTICLE | CAT_FORM,
      },
      render: { visible: false },
    });
    // Dropped *towards* the form rather than flung away from it: it falls onto
    // the fields straight away, then bounces and tumbles across them. (Launched
    // upward, it only drifted back down to the form as it was fading out, so
    // the interaction was never visible.)
    Body.setVelocity(astro, {
      // It needs to *arrive* with real speed: a gentle drop just settled on
      // the first flat field and rolled along it. A firm initial fall gives
      // the first bounce real energy. The sideways speed is deliberately
      // modest — faster, and it sailed straight past the form's right edge
      // and fell through empty space instead of meeting more sections.
      x: (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 0.7),
      y: 5,
    });
    // Random spin — the engine integrates it, so the tumble is emergent.
    Body.setAngularVelocity(astro, (Math.random() - 0.5) * 0.07);
    Composite.add(world, astro);

    // Invisible walls along the form's left and right edges. Without them a
    // sideways bounce carried the astronaut out of the form's column, where
    // there is nothing left to interact with; with them it stays over the
    // form and zig-zags down through its sections.
    (function addFormWalls() {
      const box = toCanvasRect(form.getBoundingClientRect(), hostRect);
      const opts = {
        isStatic: true,
        restitution: BOUNCE,
        friction: 0.04,
        collisionFilter: { category: CAT_FORM, mask: CAT_DEFAULT | CAT_FORM },
        label: "form-wall",
      };
      const halfW = 12;
      [box.x - box.w / 2, box.x + box.w / 2].forEach(function (edgeX) {
        Composite.add(
          world,
          Bodies.rectangle(edgeX, box.y, halfW * 2, box.h * 2, opts)
        );
      });
    })();

    const started = performance.now();
    let previous = started;
    let accumulator = 0;
    const astroTrail = []; // recent positions, for a faint motion trail

    run = {
      engine,
      world,
      particles,
      astro,
      colliders: formGeo.bodies.length,
      raf: 0,
    };

    function frame(now) {
      accumulator += Math.min(now - previous, MAX_DELTA);
      previous = now;

      let steps = 0;
      while (accumulator >= STEP && steps < MAX_STEPS) {
        Engine.update(engine, STEP);
        accumulator -= STEP;
        steps++;
      }

      // Speed cap. Matter has no continuous collision detection, so a body
      // falling fast enough can tunnel straight through a thin field instead
      // of bouncing off it; this also keeps the motion readable.
      const speed = Body.getSpeed(astro);
      if (speed > MAX_ASTRO_SPEED) {
        Body.setSpeed(astro, MAX_ASTRO_SPEED);
      }

      // A frame that is too soon for another step (high-refresh display)
      // simply redraws at the current positions.
      const elapsed = now - started;
      draw(elapsed);

      // Retire each body the moment it is fully faded, so the engine only
      // ever simulates what is actually on screen.
      let alive = 0;
      for (const p of particles) {
        if (p.removed) continue;
        if (elapsed >= p.life) {
          Composite.remove(world, p.body);
          p.removed = true;
        } else {
          alive++;
        }
      }
      if (elapsed < ASTRO_LIFE) alive++;

      if (alive === 0) {
        teardown();
        return;
      }
      run.raf = requestAnimationFrame(frame);
    }

    function draw(elapsed) {
      if (!ctx) return;
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // Dust first, astronaut on top of it.
      for (const p of particles) {
        if (p.removed) continue;
        const t = elapsed / p.life;
        // Hold full brightness briefly, then fade out over the tail.
        const fade = t < 0.2 ? 1 : Math.max(0, 1 - (t - 0.2) / 0.8);
        // Also dim as the mote slows down (see the brief), so stragglers
        // thin out visually before they are removed.
        const speed = Body.getSpeed(p.body);
        const speedFade = Math.min(1, 0.35 + speed / 5);
        const alpha = fade * speedFade;
        if (alpha <= 0.01) continue;

        const { x, y } = p.body.position;
        ctx.beginPath();
        ctx.globalAlpha = alpha;
        ctx.shadowColor = "rgba(255, 255, 255, " + (0.85 * p.glow).toFixed(3) + ")";
        ctx.shadowBlur = p.radius * 4;
        ctx.fillStyle =
          "rgb(" + p.shade + ", " + p.shade + ", " + Math.min(255, p.shade + 6) + ")";
        ctx.arc(x, y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      if (elapsed < ASTRO_LIFE) {
        const t = elapsed / ASTRO_LIFE;
        const alpha =
          elapsed > ASTRO_LIFE - ASTRO_FADE
            ? Math.max(0, (ASTRO_LIFE - elapsed) / ASTRO_FADE)
            : Math.min(1, 0.15 + t * 4); // quick fade-in at the start
        const { x, y } = astro.position;

        // Faint trail so the arc and the bounces read even at this size.
        astroTrail.push({ x: x, y: y });
        if (astroTrail.length > 26) astroTrail.shift();
        for (let i = 0; i < astroTrail.length; i++) {
          const pt = astroTrail[i];
          const ta = (i / astroTrail.length) * 0.22 * alpha;
          if (ta <= 0.01) continue;
          ctx.beginPath();
          ctx.globalAlpha = ta;
          ctx.fillStyle = "rgb(226, 230, 238)";
          ctx.arc(pt.x, pt.y, astroRadius * 0.18, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        drawAstronaut(x, y, astro.angle, alpha, astroScale);
      }
    }

    run.raf = requestAnimationFrame(frame);
  }

  /* ----------------------------- teardown -------------------------------- */

  function teardown() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (run) {
      if (run.raf) cancelAnimationFrame(run.raf);
      // Free the solver state, then the bodies themselves.
      World.clear(run.world, false);
      Engine.clear(run.engine);
      run = null;
    }
    if (ctx) ctx.clearRect(0, 0, cssWidth, cssHeight);
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null;
    ctx = null;
    host = null;
  }

  /* ------------------------------ public API ----------------------------- */

  window.ContactCelebration = {
    celebrate,
    cancel: teardown,
    // Small introspection hook used by the live verification pass.
    stats: function () {
      return {
        running: Boolean(run),
        bodies: run ? run.world.bodies.length : 0,
        colliders: run ? run.colliders : 0,
        canvas: Boolean(canvas),
        astro: run
          ? {
              x: run.astro.position.x,
              y: run.astro.position.y,
              angle: run.astro.angle,
              vx: run.astro.velocity.x,
              vy: run.astro.velocity.y,
              radius: run.astro.circleRadius,
            }
          : null,
        firstParticle: run ? run.particles[0].body.position : null,
      };
    },
  };
})();
