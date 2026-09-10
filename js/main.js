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

  /* ---------- 3. Contact form (Supabase-backed, OTP-verified) ----------
     Flow:
       1. The visitor fills Name / Email / Message and hits "Send Message".
       2. Client-side validation rejects blank fields and bad emails.
       3. Supabase Auth emails a 6-digit OTP to the address
          (supabase.auth.signInWithOtp).
       4. The visitor enters the code; supabase.auth.verifyOtp proves the
          email belongs to them.
       5. Only then is the message inserted — via the submit_message RPC,
          which validates again server-side and rejects a second message
          from the same email (one message per email).
       6. The temporary OTP session is signed out immediately so visitors
          are never left authenticated.

     Without Supabase configured, the old placeholder behaviour stays so
     the form never breaks. */

  const form = document.getElementById("contactForm");
  const formStatus = document.getElementById("formStatus");
  const sendBtn = document.getElementById("formSendBtn");
  const otpRow = document.getElementById("formOtpRow");
  const otpInput = document.getElementById("formOtp");
  const otpTarget = document.getElementById("formOtpTarget");
  const verifyBtn = document.getElementById("formVerifyBtn");
  const resendBtn = document.getElementById("formResendBtn");

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let otpEmail = ""; // the address the current code was sent to
  let resendCooldownUntil = 0;

  const setStatus = (msg, isError = false) => {
    formStatus.textContent = msg;
    formStatus.classList.toggle("form-status-error", isError);
  };

  const setFieldError = (input, errorEl, message) => {
    input.classList.toggle("input-error", Boolean(message));
    errorEl.textContent = message || "";
  };

  const showOtpStep = (show) => {
    otpRow.hidden = !show;
    verifyBtn.disabled = false;
    if (show) otpInput.focus();
  };

  // Cooldown on the "Resend code" button so Supabase's email rate limits
  // (roughly one email per minute per address) are respected.
  const armResendCooldown = () => {
    resendCooldownUntil = Date.now() + 60000;
    resendBtn.disabled = true;
    const tick = () => {
      const left = Math.max(0, Math.ceil((resendCooldownUntil - Date.now()) / 1000));
      resendBtn.textContent = left > 0 ? `Resend code (${left}s)` : "Resend code";
      resendBtn.disabled = left > 0;
      if (left > 0) setTimeout(tick, 1000);
    };
    tick();
  };

  const sendOtp = async (email) => {
    const supabase = window.__supabaseClient || null;
    if (!supabase) return { error: { message: "Supabase is not configured." } };
    // IMPORTANT: Your Supabase project must be configured to send OTP codes
    // (not magic links). In the Supabase dashboard, go to:
    //   Authentication → Email Templates → Confirm email
    // Set "Confirm email" to "OTP" instead of "Magic Link".
    // Otherwise this sends a magic link that creates a session.
    return supabase.auth.signInWithOtp({ email });
  };

  /* --- Step 1: validate + send the OTP --- */

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const supabase = window.__supabaseClient || null;
    if (!supabase) {
      setStatus(
        "Thanks! This form isn't connected to anything yet — the handler will be added in a later step."
      );
      form.reset();
      return;
    }

    const nameInput = document.getElementById("formName");
    const emailInput = document.getElementById("formEmail");
    const msgInput = document.getElementById("formMessage");
    const nameError = document.getElementById("formNameError");
    const emailError = document.getElementById("formEmailError");
    const msgError = document.getElementById("formMessageError");

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const message = msgInput.value.trim();

    // Client-side validation — the RPC re-checks all of this server-side.
    let valid = true;
    if (!name) {
      setFieldError(nameInput, nameError, "Please enter your name.");
      valid = false;
    } else {
      setFieldError(nameInput, nameError, "");
    }
    if (!email) {
      setFieldError(emailInput, emailError, "Please enter your email.");
      valid = false;
    } else if (!EMAIL_RE.test(email)) {
      setFieldError(emailInput, emailError, "That email doesn't look right.");
      valid = false;
    } else {
      setFieldError(emailInput, emailError, "");
    }
    if (!message) {
      setFieldError(msgInput, msgError, "Message cannot be empty.");
      valid = false;
    } else {
      setFieldError(msgInput, msgError, "");
    }
    if (!valid) return;

    // Send the verification code to the given address.
    sendBtn.disabled = true;
    setStatus(`Sending a verification code to ${email}…`);

    const { error } = await sendOtp(email);

    if (error) {
      sendBtn.disabled = false;
      setStatus(
        "Couldn't send the code: " + (error.message || "unknown error"),
        true
      );
      return;
    }

    otpEmail = email;
    otpTarget.textContent = email;
    otpInput.value = "";
    showOtpStep(true);
    sendBtn.textContent = "Change email";
    sendBtn.disabled = false;
    setStatus(`Enter the code sent to ${email}.`);
    armResendCooldown();
  });

  // "Change email" returns to the start (keep the entered message).
  sendBtn.addEventListener("click", () => {
    if (sendBtn.textContent !== "Change email") return;
    showOtpStep(false);
    sendBtn.textContent = "Send Message";
    setStatus("");
  });

  /* --- Step 2: verify the code, then insert via the RPC --- */

  verifyBtn.addEventListener("click", async () => {
    const supabase = window.__supabaseClient || null;
    if (!supabase || !otpEmail) return;

    const code = otpInput.value.trim();
    if (!/^\d{6,8}$/.test(code)) {
      setStatus("Please enter the 6-8 digit code from the email.", true);
      return;
    }

    verifyBtn.disabled = true;
    setStatus("Verifying…");

    // Prove the email belongs to the sender.
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: otpEmail,
      token: code,
      type: "email",
    });

    if (verifyError) {
      verifyBtn.disabled = false;
      setStatus("That code is invalid or has expired. Try again.", true);
      return;
    }

    // Code verified — now insert through the RPC (validates + dedupes).
    const { data, error: insertError } = await supabase.rpc("submit_message", {
      p_name: document.getElementById("formName").value.trim(),
      p_email: otpEmail,
      p_message: document.getElementById("formMessage").value.trim(),
    });

    // Drop the temporary OTP session — visitors should never stay logged in.
    await supabase.auth.signOut().catch(() => {});

    if (insertError) {
      verifyBtn.disabled = false;
      setStatus(
        "Something went wrong: " + (insertError.message || "unknown error"),
        true
      );
      return;
    }
    if (!data || data.ok !== true) {
      verifyBtn.disabled = false;
      setStatus(
        data && data.error ? data.error : "Something went wrong sending your message.",
        true
      );
      return;
    }

    // Success — reset the form to a pristine state.
    form.reset();
    showOtpStep(false);
    sendBtn.textContent = "Send Message";
    otpEmail = "";
    setStatus("Thanks! Your message has been sent.");
  });

  /* --- Resend code (with a 60s cooldown) --- */

  resendBtn.addEventListener("click", async () => {
    if (!otpEmail || resendBtn.disabled) return;
    setStatus(`Resending a code to ${otpEmail}…`);
    const { error } = await sendOtp(otpEmail);
    if (error) {
      setStatus(
        "Couldn't resend the code: " + (error.message || "unknown error"),
        true
      );
      armResendCooldown();
      return;
    }
    setStatus(`A new code is on its way to ${otpEmail}.`);
    armResendCooldown();
  });
})();
