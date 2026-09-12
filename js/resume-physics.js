/* ==========================================================================
   resume-physics.js — floating tech-stack playground in the Resume section
   ==========================================================================

   Every skill already listed in the Resume section's Skills column gets its
   own Matter.js body: a glass ball that drifts in near-zero gravity, collides
   with the other balls and bounces off invisible walls along the section's
   edges. Moving the pointer near a ball nudges it gently away (a proximity
   force — there is deliberately no drag-and-drop).

   How it is put together:

     - The physics lives in a fixed-timestep loop (Matter's recommended 60Hz,
       with an accumulator so a slow frame can't destabilise it) and is gated
       by an IntersectionObserver: the engine only steps while the Resume
       section is in or near the viewport, so it costs nothing elsewhere.
     - The balls are real DOM elements, not canvas shapes: each one is a glass
       orb lit in that technology's own brand colour (Simple Icons via CDN
       serves each logo in its brand colour; `color` below mirrors it for the
       orb's rim, glow and trail) with the technology's name as a fallback if
       the icon can't be fetched. Crisp at any DPI.
     - A ball in motion leaves a soft particle trail in its own brand colour,
       drawn on one shared canvas behind the balls. Trail particles are plain
       arrays advanced by hand — no extra physics bodies — and they are drawn
       from pre-rendered glow sprites (one per colour) so there is no
       per-particle shadow blur in the loop.
     - The layer is `pointer-events: none` and sits behind the section's
       content, so headings, the skills chips and the Download Resume button
       stay fully readable and clickable. The pointer is tracked on window and
       converted into section coordinates, which is what lets the proximity
       force work without the layer ever swallowing a click.

   Matter.js is the vendored browser build of the `matter-js` npm package
   (js/vendor/matter.min.js), the same one the contact-form celebration uses. */

(function () {
  "use strict";

  const Matter = window.Matter;
  if (!Matter) return;

  const Engine = Matter.Engine;
  const Composite = Matter.Composite;
  const Bodies = Matter.Bodies;
  const Body = Matter.Body;
  const World = Matter.World;

  /* ------------------------------- tuning -------------------------------- */

  // With no colour in the URL, Simple Icons serves each logo in its original
  // brand colour — so the icons stay recognisable instead of being flattened
  // to the site's monochrome palette.
  function icon(slug) {
    return { src: "https://cdn.simpleicons.org/" + slug };
  }

  // The Skills column, in order. `color` is the technology's own brand colour
  // (the same value Simple Icons tints the logo with) — it drives the orb's
  // rim, its glow and its motion trail, so the container is part of the logo
  // rather than a generic grey circle around it.
  //
  // VS Code is the exception: Microsoft's marks were pulled from Simple Icons
  // over trademark policy, so its icon comes from Devicon's multi-colour
  // "-original" build, which carries the real #0065A9 / #007ACC blues.
  const VSCODE = {
    src: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vscode/vscode-original.svg",
  };

  const TECH = [
    { label: "C", icon: icon("c"), color: "#A8B9CC" },
    { label: "C++", icon: icon("cplusplus"), color: "#00599C" },
    { label: "Python", icon: icon("python"), color: "#3776AB" },
    { label: "JavaScript", icon: icon("javascript"), color: "#F7DF1E" },
    { label: "React", icon: icon("react"), color: "#61DAFB" },
    { label: "Bootstrap", icon: icon("bootstrap"), color: "#7952B3" },
    { label: "Node.js", icon: icon("nodedotjs"), color: "#5FA04E" },
    { label: "Git & GitHub", icon: icon("git"), color: "#F03C2E" },
    { label: "VS Code", icon: VSCODE, color: "#007ACC" },
    { label: "Linux", icon: icon("linux"), color: "#FCC624" },
    { label: "Figma", icon: icon("figma"), color: "#F24E1E" },
  ];

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (n >> 16) + ", " + ((n >> 8) & 255) + ", " + (n & 255);
  }

  const BALL = 56; // diameter in px (inside the brief's 50–70 range)
  const RADIUS = BALL / 2;

  // Very light pull: the balls sink at roughly 15px/s rather than falling, so
  // the field stays a floaty drift instead of a pile on the floor.
  const GRAVITY_Y = 0.025;
  const RESTITUTION = 0.7; // bouncy, but each hit bleeds energy
  const FRICTION_AIR = 0.03; // slows them into a calm drift, never speeds up
  const FRICTION = 0.05;

  const STEP = 1000 / 60;
  const MAX_STEPS = 3; // catch-up limit per frame

  // Pointer proximity: within this radius a ball is pushed away, fading to
  // nothing at the edge of the circle.
  const NUDGE_RADIUS = 140;
  // Force scale. Applied as force = NUDGE * mass * falloff², so the push is
  // felt equally by every ball regardless of its mass.
  const NUDGE = 0.0016;

  // Motion trail.
  const TRAIL_LIFE = 620; // ms a particle lives
  const TRAIL_EVERY = 38; // ms between particles per ball
  const TRAIL_MIN_SPEED = 0.12; // px/step before a ball starts trailing
  const TRAIL_EMIT_SPREAD = 10; // px of scatter around the ball's centre
  const TRAIL_SIZE = 17; // px the glow sprite is drawn at
  const TRAIL_MAX = 260; // hard cap on live particles

  // Escape hatch for a wedged ball. The layout has gaps narrower than a ball —
  // the chip row and the group heading below it sit ~20px apart, well under the
  // 56px orb — so a ball can jam between them and friction will hold it there
  // forever. Anything motionless for this long gets a small random shove.
  const STUCK_SPEED = 0.05; // px/step, treated as "not moving"
  const STUCK_AFTER = 1200; // ms of stillness before the shove
  // Expressed per unit mass so every ball gets the same kick; ≈0.8px/step.
  const STUCK_PUSH = 0.0029;

  const WALL_T = 120; // half-thickness of the boundary walls

  // Resume UI that acts as a solid obstacle.
  //
  // The `text` flag matters: a block-level heading's element box spans the
  // whole container (the "Resume" heading's box is ~672px wide while the word
  // itself is ~147px), so colliding with the element box would look like the
  // balls bouncing off an invisible full-width bar. Headings are therefore
  // measured by the tight box around their glyphs. Chips and the button use
  // their element box, because for those the box *is* the visible shape.
  const SOLID = [
    { name: "heading", sel: "#resume-title", text: true },
    { name: "subtitle", sel: "#resume .section-subtitle", text: true },
    { name: "col-heading", sel: "#resume .resume-col > h3", text: true },
    { name: "group-heading", sel: "#resume .skill-group h4", text: true },
    { name: "chip", sel: "#resume .chip", text: false },
    { name: "button", sel: "#resume .resume-actions .btn", text: false },
  ];
  const SOLID_PAD = 2; // px of padding, so contact reads as touching the ink

  // Matter applies gravity as force = mass * gravity.y * gravity.scale, so an
  // equal upward force exactly offsets it. Left alone, even 0.025 gravity is
  // inexorable: the whole set ends up piled in a row on the section's floor
  // within a minute, which is the opposite of "float rather than fall".
  // So the pull is offset, and a faint slowly-rotating current is added on
  // top of it — the balls wander and keep meeting each other instead of
  // settling. The current's direction rotates, so its average is zero and
  // nothing accelerates away; frictionAir caps the drift speed.
  const GRAVITY_FORCE = GRAVITY_Y * 0.001;
  const CURRENT = 2.2; // current strength, as a multiple of the pull
  const CURRENT_SPIN = 0.0006; // radians per ms (a full turn ≈ every 10s)

  const REDUCED_MOTION =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------- state --------------------------------- */

  let host = null; // the Resume section
  let layer = null; // the DOM layer holding the balls
  let engine = null;
  let world = null;
  let balls = []; // { body, el, label }
  let walls = [];
  let solids = []; // static bodies for the heading / chips / button
  let raf = 0;
  let running = false;
  let steps = 0; // frames stepped, for the verification hook

  let trailCanvas = null;
  let trailCtx = null;
  let particles = []; // trail particles, advanced by hand in the frame loop

  let width = 0;
  let height = 0;

  const pointer = { x: -9999, y: -9999, active: false };

  /* -------------------------------- trail -------------------------------- */

  // One pre-rendered radial glow sprite per brand colour. Drawing a small
  // image per particle is far cheaper than a per-particle shadowBlur or a
  // gradient built every frame, which matters because this runs continuously
  // while the section is on screen.
  function makeSprite(rgb) {
    const size = 32;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    if (!g) return null;
    const grad = g.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    grad.addColorStop(0, "rgba(" + rgb + ", 1)");
    grad.addColorStop(0.35, "rgba(" + rgb + ", 0.55)");
    grad.addColorStop(1, "rgba(" + rgb + ", 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  function sizeTrailCanvas() {
    if (!trailCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    trailCanvas.width = Math.round(width * dpr);
    trailCanvas.height = Math.round(height * dpr);
    trailCanvas.style.width = width + "px";
    trailCanvas.style.height = height + "px";
    // Setting width/height resets the context, so re-acquire and rescale.
    trailCtx = trailCanvas.getContext("2d");
    if (trailCtx) trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Emit from every ball that is actually moving, then age, drift and draw
  // what is left. Coordinates are CSS pixels in section space.
  function updateTrail(delta) {
    if (!trailCtx) return;

    for (const ball of balls) {
      const speed = Body.getSpeed(ball.body);
      if (speed < TRAIL_MIN_SPEED || !ball.sprite) continue;
      ball.emitAcc = (ball.emitAcc || 0) + delta;
      while (ball.emitAcc >= TRAIL_EVERY) {
        ball.emitAcc -= TRAIL_EVERY;
        if (particles.length >= TRAIL_MAX) break;
        const p = ball.body.position;
        particles.push({
          x: p.x + (Math.random() - 0.5) * TRAIL_EMIT_SPREAD,
          y: p.y + (Math.random() - 0.5) * TRAIL_EMIT_SPREAD,
          // Drift gently backwards out of the ball's path, so the wake points
          // the way it came rather than smearing forward.
          vx: -ball.body.velocity.x * 0.16 + (Math.random() - 0.5) * 0.3,
          vy: -ball.body.velocity.y * 0.16 + (Math.random() - 0.5) * 0.3,
          life: TRAIL_LIFE * (0.7 + Math.random() * 0.6),
          age: 0,
          size: TRAIL_SIZE * (0.6 + Math.random() * 0.8),
          sprite: ball.sprite,
        });
      }
    }

    trailCtx.clearRect(0, 0, width, height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += delta;
      if (p.age >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      const k = delta / STEP; // velocity is per step, position per frame
      p.x += p.vx * k;
      p.y += p.vy * k;

      const t = 1 - p.age / p.life; // 1 → 0 over the particle's life
      const size = p.size * (0.45 + t * 0.55); // shrink as it fades
      trailCtx.globalAlpha = t * t * 0.6; // ease the fade out
      trailCtx.drawImage(p.sprite, p.x - size / 2, p.y - size / 2, size, size);
    }
    trailCtx.globalAlpha = 1;
  }

  /* ------------------------------ rendering ------------------------------ */

  function makeBallEl(tech) {
    const el = document.createElement("div");
    el.className = "tech-ball";

    // The name is always in the DOM; the icon replaces it once it has loaded,
    // so an offline visit degrades to clean text instead of a broken image.
    const label = document.createElement("span");
    label.className = "tech-ball-label";
    label.textContent = tech.label;
    el.appendChild(label);
    el.title = tech.label;
    // The orb's rim, inner glow and trail all read from this, so the container
    // is tinted with the logo's own colour instead of a dead grey outline.
    const rgb = hexToRgb(tech.color);
    el.style.setProperty("--brand-rgb", rgb);

    if (!tech.icon) return { el: el, img: null, iconSrc: null, rgb: rgb };

    // The icon stays hidden until it loads (so no broken-image flash), which
    // means it has no layout box — so it must NOT be `loading="lazy"`, or the
    // browser would never consider it in view and never fetch it at all.
    // Instead the source is set by loadIcons() once the section is nearby, and
    // the listeners are attached before the src is assigned so a cached image
    // that completes immediately can't slip past them.
    const img = document.createElement("img");
    img.className = "tech-ball-icon";
    img.alt = "";
    img.decoding = "async";

    const onLoad = function () {
      el.classList.add("has-icon");
    };
    img.addEventListener("load", onLoad);
    img.addEventListener("error", function () {
      el.classList.remove("has-icon");
      if (img.parentNode) img.remove();
    });

    el.appendChild(img);
    return { el: el, img: img, iconSrc: tech.icon.src, rgb: rgb };
  }

  // Fetch the icons once the section first comes near the viewport, so a
  // visitor who never scrolls this far never downloads them.
  let iconsRequested = false;

  function loadIcons() {
    if (iconsRequested) return;
    iconsRequested = true;
    for (const ball of balls) {
      if (!ball.img) continue;
      ball.img.src = ball.iconSrc;
      // Already complete (e.g. served from cache): fire the swap by hand,
      // because the load event may have been dispatched before we got here.
      if (ball.img.complete && ball.img.naturalWidth > 0) {
        ball.el.classList.add("has-icon");
      }
    }
  }

  function syncDom() {
    for (const ball of balls) {
      const p = ball.body.position;
      ball.el.style.transform =
        "translate3d(" +
        (p.x - RADIUS).toFixed(2) +
        "px," +
        (p.y - RADIUS).toFixed(2) +
        "px,0) rotate(" +
        ball.body.angle.toFixed(4) +
        "rad)";
    }
  }

  /* ------------------------------- geometry ------------------------------ */

  function measure() {
    if (!host || !layer) return false;
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === width && h === height) return false;
    width = w;
    height = h;
    layer.style.width = width + "px";
    layer.style.height = height + "px";
    return true;
  }

  function toCanvasRect(r, hostRect) {
    return {
      x: r.left - hostRect.left + r.width / 2,
      y: r.top - hostRect.top + r.height / 2,
      w: r.width,
      h: r.height,
    };
  }

  // The resume's headings, chips and button, as static rectangles measured in
  // section coordinates. Rebuilt whenever the section is re-measured, so they
  // stay locked to the text if the layout reflows.
  function buildSolids() {
    solids.forEach(function (b) {
      Composite.remove(world, b);
    });

    const hostRect = host.getBoundingClientRect();
    const rects = [];
    SOLID.forEach(function (spec) {
      document.querySelectorAll(spec.sel).forEach(function (el) {
        if (spec.text) {
          // One rect per line box of the actual text.
          const range = document.createRange();
          range.selectNodeContents(el);
          Array.prototype.forEach.call(range.getClientRects(), function (r) {
            if (r.width > 2 && r.height > 2) rects.push({ r: r, name: spec.name });
          });
        } else {
          const r = el.getBoundingClientRect();
          if (r.width > 2 && r.height > 2) rects.push({ r: r, name: spec.name });
        }
      });
    });

    const opts = {
      isStatic: true,
      restitution: RESTITUTION,
      friction: FRICTION,
      label: "resume-solid",
    };
    solids = rects.map(function (item) {
      const c = toCanvasRect(item.r, hostRect);
      const body = Bodies.rectangle(
        c.x,
        c.y,
        c.w + SOLID_PAD * 2,
        c.h + SOLID_PAD * 2,
        opts
      );
      body.label = item.name; // so the collision surface is identifiable
      return body;
    });
    solids.forEach(function (b) {
      Composite.add(world, b);
    });
  }

  // Nothing may start life inside a heading or the button: the solver would
  // eject it on the first step, which reads as a glitch rather than a bounce.
  function resolveOverlaps() {
    for (const ball of balls) {
      for (let pass = 0; pass < 4; pass++) {
        let moved = false;
        for (const c of solids) {
          const b = c.bounds;
          const p = ball.body.position;
          const nx = Math.max(b.min.x, Math.min(p.x, b.max.x));
          const ny = Math.max(b.min.y, Math.min(p.y, b.max.y));
          const dx = p.x - nx;
          const dy = p.y - ny;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d >= RADIUS + 1) continue;

          if (d > 0.001) {
            const push = RADIUS + 2 - d;
            Body.setPosition(ball.body, {
              x: p.x + (dx / d) * push,
              y: p.y + (dy / d) * push,
            });
          } else {
            // Dead centre inside the rect — leave by the nearest edge.
            const exits = [
              { d: p.x - b.min.x, x: 0, y: -(p.x - b.min.x + RADIUS + 2) },
              { d: b.max.x - p.x, x: 0, y: b.max.x - p.x + RADIUS + 2 },
              { d: p.y - b.min.y, x: -(p.y - b.min.y + RADIUS + 2), y: 0 },
              { d: b.max.y - p.y, x: b.max.y - p.y + RADIUS + 2, y: 0 },
            ].sort(function (a, z) {
              return a.d - z.d;
            })[0];
            Body.setPosition(ball.body, { x: p.x + exits.x, y: p.y + exits.y });
          }
          moved = true;
        }
        if (!moved) break;
      }
    }
  }

  // Four static slabs just outside the section's edges: the balls bounce off
  // the section boundary and can never escape into the rest of the page.
  function buildWalls() {
    walls.forEach(function (w) {
      Composite.remove(world, w);
    });
    const opts = {
      isStatic: true,
      restitution: RESTITUTION,
      friction: FRICTION,
      label: "resume-wall",
    };
    walls = [
      Bodies.rectangle(width / 2, -WALL_T, width + WALL_T * 4, WALL_T * 2, opts), // top
      Bodies.rectangle(width / 2, height + WALL_T, width + WALL_T * 4, WALL_T * 2, opts), // bottom
      Bodies.rectangle(-WALL_T, height / 2, WALL_T * 2, height + WALL_T * 4, opts), // left
      Bodies.rectangle(width + WALL_T, height / 2, WALL_T * 2, height + WALL_T * 4, opts), // right
    ];
    walls.forEach(function (w) {
      Composite.add(world, w);
    });
  }

  /* ------------------------------- engine -------------------------------- */

  function build() {
    host = document.getElementById("resume");
    if (!host) return false;
    if (REDUCED_MOTION) return false; // purely decorative motion — skip it

    layer = document.createElement("div");
    layer.className = "resume-physics";
    layer.setAttribute("aria-hidden", "true"); // decorative only
    host.insertBefore(layer, host.firstChild);

    // The trail canvas sits behind the balls, so each ball's wake draws under
    // it rather than over it.
    trailCanvas = document.createElement("canvas");
    trailCanvas.className = "resume-physics-trail";
    trailCanvas.setAttribute("aria-hidden", "true");
    layer.appendChild(trailCanvas);

    measure();
    sizeTrailCanvas();

    engine = Engine.create();
    engine.gravity.y = GRAVITY_Y;
    world = engine.world;

    buildWalls();
    buildSolids();

    // Spread the balls over a loose grid so they don't start stacked, then let
    // the physics take over.
    const cols = Math.max(2, Math.round(Math.sqrt(TECH.length * (width / Math.max(height, 1)))));
    const rows = Math.ceil(TECH.length / cols);
    const cellW = width / cols;
    const cellH = height / rows;

    balls = TECH.map(function (tech, i) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = Math.min(
        width - RADIUS - 4,
        Math.max(RADIUS + 4, col * cellW + cellW / 2 + (Math.random() - 0.5) * cellW * 0.4)
      );
      const y = Math.min(
        height - RADIUS - 4,
        Math.max(RADIUS + 4, row * cellH + cellH / 2 + (Math.random() - 0.5) * cellH * 0.4)
      );

      const body = Bodies.circle(x, y, RADIUS, {
        restitution: RESTITUTION,
        friction: FRICTION,
        frictionAir: FRICTION_AIR,
        density: 0.0012,
        label: tech.label,
      });
      Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 3,
        y: (Math.random() - 0.5) * 3,
      });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.06);
      Composite.add(world, body);

      const made = makeBallEl(tech);
      layer.appendChild(made.el);
      return {
        body: body,
        el: made.el,
        img: made.img,
        iconSrc: made.iconSrc,
        sprite: makeSprite(made.rgb),
        emitAcc: 0,
        label: tech.label,
        // Per-ball phase so the current never moves them in lockstep.
        phase: (i / TECH.length) * Math.PI * 2,
      };
    });

    resolveOverlaps();
    syncDom();
    return true;
  }

  // Gentle outward push for any ball near the pointer. Force scales with the
  // ball's mass (so it feels identical for every ball) and falls off with
  // distance, which keeps the nudge soft rather than a shove.
  function applyProximity() {
    if (!pointer.active) return;

    const rect = host.getBoundingClientRect();
    const px = pointer.x - rect.left;
    const py = pointer.y - rect.top;
    // Ignore the pointer when it is nowhere near the section.
    if (px < -NUDGE_RADIUS || py < -NUDGE_RADIUS || px > width + NUDGE_RADIUS || py > height + NUDGE_RADIUS) {
      return;
    }

    for (const ball of balls) {
      const body = ball.body;
      const dx = body.position.x - px;
      const dy = body.position.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= 0.001 || dist > NUDGE_RADIUS) continue;
      const falloff = 1 - dist / NUDGE_RADIUS;
      const f = NUDGE * body.mass * falloff * falloff;
      Body.applyForce(body, body.position, {
        x: (dx / dist) * f,
        y: (dy / dist) * f,
      });
    }
  }

  // Offsets gravity and adds the slow current, once per simulated step. Also
  // frees any ball that has been motionless long enough to be wedged.
  function applyCurrent(now) {
    for (const ball of balls) {
      const body = ball.body;
      const pull = GRAVITY_FORCE * body.mass; // exactly cancels gravity
      const a = now * CURRENT_SPIN + ball.phase;
      Body.applyForce(body, body.position, {
        x: Math.cos(a) * pull * CURRENT,
        y: -pull + Math.sin(a * 1.3) * pull * CURRENT,
      });

      if (Body.getSpeed(body) < STUCK_SPEED) {
        ball.still = (ball.still || 0) + STEP;
        if (ball.still >= STUCK_AFTER) {
          ball.still = 0;
          const dir = Math.random() * Math.PI * 2;
          Body.applyForce(body, body.position, {
            x: Math.cos(dir) * body.mass * STUCK_PUSH,
            y: Math.sin(dir) * body.mass * STUCK_PUSH,
          });
        }
      } else {
        ball.still = 0;
      }
    }
  }

  let accumulator = 0;
  let previous = 0;

  function frame(now) {
    if (!running) return;
    const delta = Math.min(now - previous, STEP * MAX_STEPS);
    previous = now;
    accumulator += delta;

    applyProximity();

    let n = 0;
    while (accumulator >= STEP && n < MAX_STEPS) {
      applyCurrent(now);
      Engine.update(engine, STEP);
      accumulator -= STEP;
      n++;
      steps++;
    }

    syncDom();
    updateTrail(delta);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || !engine) return;
    running = true;
    previous = performance.now();
    accumulator = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    // Drop the trail instead of leaving a frozen smear behind.
    particles.length = 0;
    if (trailCtx) trailCtx.clearRect(0, 0, width, height);
  }

  /* ------------------------------ lifecycle ------------------------------ */

  function onResize() {
    if (!engine || !measure()) return;
    buildWalls();
    buildSolids();
    sizeTrailCanvas();
    // Pull anything that ended up outside the new bounds back in.
    for (const ball of balls) {
      const p = ball.body.position;
      const x = Math.min(width - RADIUS, Math.max(RADIUS, p.x));
      const y = Math.min(height - RADIUS, Math.max(RADIUS, p.y));
      if (x !== p.x || y !== p.y) Body.setPosition(ball.body, { x: x, y: y });
    }
    resolveOverlaps();
    syncDom();
    queueVisibilityCheck();
  }

  // The IntersectionObserver is the primary gate — the browser batches it and
  // it costs nothing while the section is off screen. This geometric check is
  // the backstop: IO delivery is tied to the rendering lifecycle, and in a
  // throttled or occluded window it can be delayed or skipped entirely, which
  // left the simulation stopped while the section was plainly on screen.
  let visQueued = false;

  function checkVisibility() {
    visQueued = false;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const margin = 200; // same margin as the observer's rootMargin
    if (r.bottom > -margin && r.top < window.innerHeight + margin) {
      loadIcons();
      start();
    } else {
      stop();
    }
  }

  function queueVisibilityCheck() {
    if (visQueued) return;
    visQueued = true;
    requestAnimationFrame(checkVisibility);
  }

  function onPointerMove(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  }

  function onPointerLeave() {
    pointer.active = false;
  }

  function init() {
    // The celebration can be cancelled/rebuilt freely; this is purely additive.
    if (!build()) return;

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onPointerMove, { passive: true });
    window.addEventListener("mouseout", onPointerLeave, { passive: true });

    // Only step the simulation while the section is in or near the viewport.
    if (window.IntersectionObserver) {
      const observer = new IntersectionObserver(
        function (entries) {
          // Use the newest entry: batched callbacks can carry an older state
          // first, and acting on entries[0] would then apply a stale answer.
          const entry = entries[entries.length - 1];
          if (entry.isIntersecting) {
            loadIcons();
            start();
          } else {
            stop();
          }
        },
        { rootMargin: "200px 0px" }
      );
      observer.observe(host);
    }

    // Backstop for the observer, plus the initial state.
    window.addEventListener("scroll", queueVisibilityCheck, { passive: true });
    checkVisibility();
  }

  /* ------------------------------ public API ----------------------------- */

  // Small introspection hook used by the live verification pass.
  window.ResumePhysics = {
    stats: function () {
      return {
        running: running,
        steps: steps,
        bodies: world ? world.bodies.length : 0,
        balls: balls.length,
        walls: walls.length,
        solidColliders: solids.length,
        trailParticles: particles.length,
        stationaryBalls: balls
          .filter(function (ball) {
            return Body.getSpeed(ball.body) < STUCK_SPEED;
          })
          .map(function (ball) {
            return ball.label;
          }),
        size: { w: width, h: height },
        // Collider bounds in section coordinates, so overlap can be checked
        // against the balls without any viewport conversion.
        solidBounds: solids.map(function (b) {
          return {
            label: b.label,
            minX: b.bounds.min.x,
            minY: b.bounds.min.y,
            maxX: b.bounds.max.x,
            maxY: b.bounds.max.y,
          };
        }),
        ballPositions: balls.map(function (b) {
          return {
            label: b.label,
            x: +b.body.position.x.toFixed(1),
            y: +b.body.position.y.toFixed(1),
            vx: +b.body.velocity.x.toFixed(3),
            vy: +b.body.velocity.y.toFixed(3),
            angle: +b.body.angle.toFixed(3),
          };
        }),
      };
    },
    stop: stop,
    start: start,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
