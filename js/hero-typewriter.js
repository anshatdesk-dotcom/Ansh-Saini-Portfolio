/* ==========================================================================
   hero-typewriter.js — rotating-role typewriter for the hero tagline

   Reads the static <p class="hero-tagline" data-words="..."> and types each
   role character-by-character, holds, deletes, then types the next — looping
   forever (the classic "Loop + Delete" hero pattern).

   - Timing mirrors a realistic typewriter: ~60ms per char typed, ~35ms per
     char deleted, ~1.7s hold on a finished phrase, small gap between cycles.
   - A solid block caret blinks via CSS (.typewriter-caret, hero.css).
   - Respects prefers-reduced-motion: leaves the static tagline text intact.
   - No-JS fallback: the static text in the HTML is untouched if this file
     never runs (e.g. script disabled).
   ========================================================================== */

(() => {
  "use strict";

  const tagline = document.querySelector(".hero-tagline");
  if (!tagline) return;

  const noReducedMotion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
  if (!noReducedMotion) return; // keep the static text

  const raw = tagline.dataset.words || "";
  const roles = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!roles.length) return;

  const TYPE_MS = 60; // per character typed
  const DELETE_MS = 35; // per character deleted (faster than typing)
  const HOLD_MS = 1700; // pause once a phrase is fully typed
  const GAP_MS = 500; // pause after fully deleting before next phrase
  const START_DELAY = 750; // let the hero title entrance settle first

  // Screen readers should announce the full line, not per-character noise.
  tagline.setAttribute("aria-label", roles.join(" | "));
  tagline.setAttribute("role", "text");

  const textSpan = document.createElement("span");
  textSpan.className = "typewriter-text";
  textSpan.setAttribute("aria-hidden", "true");

  const caret = document.createElement("span");
  caret.className = "typewriter-caret";
  caret.setAttribute("aria-hidden", "true");

  // Keep a visually-hidden copy of the whole line for assistive tech.
  const srOnly = document.createElement("span");
  srOnly.className = "sr-only";
  srOnly.textContent = roles.join(" | ");

  tagline.textContent = "";
  tagline.append(textSpan, caret, srOnly);

  let roleIndex = 0;
  let charIndex = 0;
  let deleting = false;
  let timer = null;

  const tick = () => {
    const role = roles[roleIndex];

    if (!deleting) {
      charIndex++;
      textSpan.textContent = role.slice(0, charIndex);

      if (charIndex >= role.length) {
        deleting = true;
        timer = setTimeout(tick, HOLD_MS);
        return;
      }
      timer = setTimeout(tick, TYPE_MS);
      return;
    }

    charIndex--;
    textSpan.textContent = role.slice(0, charIndex);

    if (charIndex <= 0) {
      deleting = false;
      roleIndex = (roleIndex + 1) % roles.length;
      timer = setTimeout(tick, GAP_MS);
      return;
    }
    timer = setTimeout(tick, DELETE_MS);
  };

  timer = setTimeout(tick, START_DELAY);
})();
