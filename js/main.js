/* ==========================================================================
   main.js — site behaviour
   1. Mobile menu (hamburger -> slide-in panel)
   2. Scroll-spy: highlight the nav link of the currently visible section
   3. Placeholder contact-form handling
   Smooth scrolling itself is handled by CSS (`scroll-behavior: smooth`)
   + anchor links, so no JS is needed for it.
   ========================================================================== */

(() => {
  "use strict";

  const body = document.body;
  const header = document.getElementById("siteHeader");
  const toggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");
  const backdrop = document.getElementById("navBackdrop");

  /* ---------- 1. Mobile menu ---------- */

  const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;

  const openMenu = () => {
    body.classList.add("menu-open");
    toggle.setAttribute("aria-expanded", "true");
  };

  const closeMenu = () => {
    body.classList.remove("menu-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    body.classList.contains("menu-open") ? closeMenu() : openMenu();
  });

  // Close when the backdrop is clicked
  backdrop.addEventListener("click", closeMenu);

  // Close with the Escape key (return focus to the hamburger)
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && body.classList.contains("menu-open")) {
      closeMenu();
      toggle.focus();
    }
  });

  // Close after picking a section from the panel
  navLinks.addEventListener("click", (event) => {
    if (event.target.closest('a[href^="#"]')) {
      closeMenu();
    }
  });

  // Also close when clicking the logo while the menu is open
  header.querySelector('a[href="#home"]').addEventListener("click", closeMenu);

  // Reset state if the viewport grows past the mobile breakpoint
  const desktopQuery = window.matchMedia("(min-width: 768px)");
  desktopQuery.addEventListener("change", (event) => {
    if (event.matches) closeMenu();
  });

  /* ---------- 2. Scroll-spy ---------- */

  const spyLinks = Array.from(navLinks.querySelectorAll('a[href^="#"]'));
  const spySections = spyLinks
    .map((link) => document.getElementById(link.getAttribute("href").slice(1)))
    .filter(Boolean);

  const setActiveLink = (sectionId) => {
    spyLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${sectionId}`;
      link.classList.toggle("active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  // Track which section crosses the middle band of the viewport.
  // The band is 10% tall, centered vertically, so the "current" section is
  // the one at the screen centre — works well for tall and short sections.
  const spyObserver = new IntersectionObserver(
    (entries) => {
      // Reduce over the section elements (not the observer entries) so a single
      // visible section still resolves to that section's element.
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => entry.target);
      if (visible.length === 0) return;

      // If several sections intersect at once (edge cases), pick the last in DOM order
      const current = visible.reduce((last, section) =>
        spySections.indexOf(section) > spySections.indexOf(last) ? section : last
      );
      setActiveLink(current.id);
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
  );

  spySections.forEach((section) => spyObserver.observe(section));

  /* ---------- 3. Contact form (placeholder behaviour) ---------- */

  const form = document.getElementById("contactForm");
  const formStatus = document.getElementById("formStatus");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    formStatus.textContent =
      "Thanks! This form isn't connected to anything yet — the handler will be added in a later step.";
    form.reset();
  });
})();
