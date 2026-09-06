/* ==========================================================================
   animations.js — GSAP + ScrollTrigger motion layer (whole site).

   - Section reveals: fade + rise as each section enters at ~80% of the
     viewport, headings first then content/cards, staggered, once per element.
   - Hero entrance on load (script line -> name -> tagline).
   - Sliding nav active-underline indicator (desktop) that eases between links.
   - Nav bar turns translucent + blurred once the hero has been scrolled past.
   - Hero 3D depth/parallax lives inside js/hero-scene.js (kept with the scene).

   All tweened motion is gated behind `prefers-reduced-motion: no-preference`;
   reduced-motion users simply see static content.
   ========================================================================== */

(() => {
  "use strict";

  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
    return; // vendor scripts failed to load — site stays fully static
  }

  gsap.registerPlugin(ScrollTrigger);

  const body = document.body;
  const mobile = () => window.matchMedia("(max-width: 768px)").matches;

  /* ---------------------------------------------------------- nav backdrop
     Translucent + blurred once the hero has fully scrolled past. Not a tween,
     so it also runs for reduced-motion users. */
  const headerEl = document.getElementById("siteHeader");
  if (headerEl) {
    // Transparent at the very top; translucent + blurred once past 100px
    ScrollTrigger.create({
      start: 100,
      end: "max",
      onToggle: (self) => headerEl.classList.toggle("nav-scrolled", self.isActive),
    });
  }

  /* ------------------------------------------------- motion-enabled scope */
  const mm = gsap.matchMedia();

  mm.add("(prefers-reduced-motion: no-preference)", () => {
    body.classList.add("gsap-motion");

    const small = mobile();
    const dur = small ? 0.45 : 0.75;
    const rise = small ? 22 : 40;
    const ease = "power3.out";

    /* ---- 1. Hero load-in: name (tagline is typed by js/hero-typewriter.js) ---- */
    gsap
      .timeline({ delay: 0.1 })
      .from(".hero-title", { y: rise, autoAlpha: 0, duration: dur, ease, clearProps: "transform,opacity,visibility" }, 0);

    /* ---- 2. Section reveal builder (once per element, ~80% into view) ---- */
    const buildSection = (cfg) => {
      const section = document.getElementById(cfg.id);
      if (!section) return;

      const tl = gsap.timeline({
        scrollTrigger: { trigger: section, start: "top 80%", once: true },
      });

      // Heading block first (title + subtitle)
      const head = section.querySelector(".section-head");
      if (head) {
        tl.from(head.querySelectorAll(".section-title, .section-subtitle"), {
          y: 30,
          autoAlpha: 0,
          duration: dur,
          stagger: 0.12,
          ease,
          clearProps: "transform,opacity,visibility",
        });
      }

      // Then configured content groups, overlapping slightly
      (cfg.groups || []).forEach((group, index) => {
        const els = section.querySelectorAll(group.selector);
        if (!els.length) return;
        tl.from(
          els,
          {
            y: group.y ?? rise,
            scale: group.scale ?? 1,
            autoAlpha: 0,
            duration: group.dur ?? dur,
            stagger: group.stagger ?? 0.12,
            ease: group.ease ?? ease,
            clearProps: "transform,opacity,visibility",
          },
          index === 0 ? "-=0.35" : "<"
        );
      });
    };

    /* ---- About: smooth one-shot entrance (no pin, no scrub) ----
       Heading fades in + slides up 50px, subtitle follows, the 3D sculpture
       gently fades up, then the bio paragraphs rise with a small stagger.
       Fires once at ~75% into the viewport with power3.out easing; every
       tween clears its inline styles afterwards so hover/3D interactions are
       never shadowed by leftover transforms. */
    const aboutEl = document.getElementById("about");
    if (aboutEl) {
      const aHead = aboutEl.querySelector(".section-head");
      const aTitle = aHead && aHead.querySelector(".section-title");
      const aSub = aHead && aHead.querySelector(".section-subtitle");
      const aPhoto = aboutEl.querySelector(".about-photo");
      const aParas = aboutEl.querySelectorAll(".about-text > p");

      const tl = gsap.timeline({
        scrollTrigger: { trigger: aboutEl, start: "top 75%", once: true },
      });

      const anim = (el, vars, pos) => {
        if (el) tl.from(el, vars, pos);
      };

      anim(
        aTitle,
        { y: 50, autoAlpha: 0, duration: small ? 0.7 : 0.9, ease: "power3.out", clearProps: "transform,opacity,visibility" },
        0
      );
      anim(
        aSub,
        { y: 22, autoAlpha: 0, duration: small ? 0.6 : 0.7, ease: "power3.out", clearProps: "transform,opacity,visibility" },
        0.18
      );
      anim(
        aPhoto,
        { autoAlpha: 0, scale: 0.96, duration: small ? 0.7 : 0.85, ease: "power2.out", clearProps: "transform,opacity,visibility" },
        0.25
      );
      anim(
        aParas[0],
        { y: 36, autoAlpha: 0, duration: small ? 0.6 : 0.75, ease: "power3.out", clearProps: "transform,opacity,visibility" },
        0.55
      );
      anim(
        aParas[1],
        { y: 36, autoAlpha: 0, duration: small ? 0.6 : 0.75, ease: "power3.out", clearProps: "transform,opacity,visibility" },
        0.75
      );
    }

    buildSection({
      id: "projects",
      groups: [{ selector: ".project-card", stagger: 0.15 }], // left-to-right row order
    });

    // Resume: columns rise first, then skill chips pop in one by one
    const resumeEl = document.getElementById("resume");
    if (resumeEl) {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: resumeEl, start: "top 80%", once: true },
      });
      const head = resumeEl.querySelector(".section-head");
      if (head) {
        tl.from(head.querySelectorAll(".section-title, .section-subtitle"), {
          y: 30,
          autoAlpha: 0,
          duration: dur,
          stagger: 0.12,
          ease,
          clearProps: "transform,opacity,visibility",
        });
      }
      tl.from(
        resumeEl.querySelectorAll(".resume-grid > .resume-col"),
        {
          y: rise,
          autoAlpha: 0,
          duration: dur,
          stagger: 0.15,
          ease,
          clearProps: "transform,opacity,visibility",
        },
        "-=0.35"
      );
      tl.from(
        resumeEl.querySelectorAll(".skill-tags .chip"),
        {
          scale: 0.8,
          y: 10,
          autoAlpha: 0,
          duration: dur * 0.7,
          stagger: 0.045,
          ease: "back.out(2)",
          clearProps: "transform,opacity,visibility",
        },
        "-=0.55"
      );
    }

    buildSection({
      id: "contact",
      groups: [{ selector: ".contact-grid > *", stagger: 0.15 }],
    });

    /* ---- 3. Sliding active-link indicator (desktop nav only) ---- */
    let indicator = null;
    let observer = null;
    let onResize = null;
    const navList = document.getElementById("navLinks");

    if (navList && !small) {
      indicator = document.createElement("span");
      indicator.className = "nav-indicator";
      navList.appendChild(indicator);

      const spyAnchors = Array.from(navList.querySelectorAll('a[href^="#"]'));
      const currentActive = () =>
        spyAnchors.find((a) => a.classList.contains("active")) || spyAnchors[0];

      const place = (link, animate) => {
        if (!link || !indicator) return;
        const props = { left: link.offsetLeft, width: link.offsetWidth };
        if (animate && indicator.offsetWidth > 0) {
          gsap.to(indicator, { ...props, duration: 0.35, ease: "power2.out" });
        } else {
          gsap.set(indicator, props);
        }
      };

      place(currentActive(), false);

      // Scroll-spy (js/main.js) toggles .active — follow those changes
      observer = new MutationObserver(() => place(currentActive(), true));
      observer.observe(navList, {
        attributes: true,
        subtree: true,
        attributeFilter: ["class"],
      });

      onResize = () => place(currentActive(), false);
      window.addEventListener("resize", onResize);
    }

    // Re-measure triggers once late-loading assets (fonts) settle
    window.addEventListener("load", ScrollTrigger.refresh, { once: true });

    return () => {
      body.classList.remove("gsap-motion");
      if (observer) observer.disconnect();
      if (onResize) window.removeEventListener("resize", onResize);
      if (indicator) indicator.remove();
    };
  });
})();
