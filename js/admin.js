/* ==========================================================================
   admin.js — hidden admin panel (Supabase Auth + data)

   Access is deliberately invisible to normal visitors: clicking the "AS"
   logo 3 times within 2 seconds opens a plain login modal (Email + Password,
   no signup, no "forgot password"). Single clicks keep their normal
   behaviour (scroll to top / close the mobile menu).

   AUTH: The only way into the admin panel is a successful
   supabase.auth.signInWithPassword() response carrying a valid session. The
   login modal and the dashboard are mutually exclusive views — exactly one
   is visible at any time; both start hidden in the markup.

   DATA: The panel reads the "messages" table (authenticated-only via RLS)
   and the "projects" table (public read), and inserts into "projects".

   Requires Supabase configured in js/supabase-config.js. Without it the
   login shows a clear "not configured" message instead of pretending.
   ========================================================================== */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // Shared client from js/supabase-config.js — null when keys are blank.
  const supabase = window.__supabaseClient || null;

  // Only this email may use the admin panel. Visitors who verify a contact-
  // form OTP get an authenticated session — they must NOT unlock the panel.
  const ADMIN_EMAIL = (window.ADMIN_EMAIL || "").toLowerCase();
  const isAdminSession = (session) =>
    !!session &&
    !!ADMIN_EMAIL &&
    (session.user?.email || "").toLowerCase() === ADMIN_EMAIL;

  // The panel opens ONLY for a session the owner created by logging in with
  // their password through the hidden modal. The contact form's OTP flow also
  // creates a (brief) authenticated session — if that email happens to be the
  // admin's own, isAdminSession alone would wrongly unlock the panel. This
  // flag marks an *intentional* admin login, so OTP sessions can never do it.
  const ADMIN_AUTHED_KEY = "fb_admin_authed";
  const markAdminAuthed = () => localStorage.setItem(ADMIN_AUTHED_KEY, "1");
  const clearAdminAuthed = () => localStorage.removeItem(ADMIN_AUTHED_KEY);
  const isAdminAuthed = (session) =>
    isAdminSession(session) && localStorage.getItem(ADMIN_AUTHED_KEY) === "1";

  /* ---------- Strict one-view gate ---------- */

  const showOverlay = () => {
    $("adminOverlay").hidden = false;
    // Lock the page behind the overlay (scroll must happen inside the panel).
    document.body.style.overflow = "hidden";
    // Stop Lenis smooth scroll so wheel input reaches the panel's own
    // scrollbar instead of being swallowed trying to scroll the locked page.
    if (window.__lenis) {
      window.__lenis.stop();
      window.__lenis.smoothWheel = false;
    }
  };

  const hideOverlay = () => {
    $("adminOverlay").hidden = true;
    // Hide BOTH views so nothing can linger visible behind the overlay.
    $("adminLogin").hidden = true;
    $("adminPanel").hidden = true;
    document.body.style.overflow = "";
    if (window.__lenis) {
      window.__lenis.smoothWheel = true;
      window.__lenis.start();
    }
  };

  // Exactly one view visible: "login" or "panel". Never both, never none.
  const showView = (view) => {
    $("adminLogin").hidden = view !== "login";
    $("adminPanel").hidden = view !== "panel";
    showOverlay();
  };

  /* ---------- Wheel scroll inside panel — stop propagation before Lenis captures it ---------- */

  const panel = $("adminPanel");
  if (panel) {
    panel.addEventListener(
      "wheel",
      (e) => {
        // Let the panel's own overflow-y scroll handle this event;
        // prevent it from bubbling up to Lenis / the tunnel layer.
        e.stopPropagation();
      },
      { passive: true }
    );
  }

  /* ---------- Logo triple-click detector (always active) ---------- */

  const CLICK_WINDOW_MS = 2000;
  const REQUIRED_CLICKS = 3;
  let clickTimes = [];

  document.querySelectorAll(".logo").forEach((logo) => {
    logo.addEventListener("click", () => {
      const now = Date.now();
      // Keep only clicks inside the sliding window.
      clickTimes = clickTimes.filter((t) => now - t <= CLICK_WINDOW_MS);
      clickTimes.push(now);
      if (clickTimes.length >= REQUIRED_CLICKS) {
        clickTimes = [];
        // Only a flagged admin login goes straight to the panel; anything
        // else (or a visitor's OTP session) shows the login modal.
        if (supabase && supabase.auth.getSession) {
          supabase.auth.getSession().then(({ data }) => {
            if (isAdminAuthed(data.session)) showView("panel");
            else showView("login");
          });
        } else {
          showView("login");
        }
      }
      // NOTE: no preventDefault — single clicks navigate to #home normally.
    });
  });

  // Escape or the close button dismisses the overlay without logging in.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("adminOverlay").hidden) hideOverlay();
  });

  $("adminLoginClose").addEventListener("click", hideOverlay);

  /* ---------- Validation helpers ---------- */

  const validateField = (input, errorEl, message) => {
    const val = input.value.trim();
    if (!val) {
      input.classList.add("admin-input-error");
      errorEl.textContent = message;
      return false;
    }
    input.classList.remove("admin-input-error");
    errorEl.textContent = "";
    return true;
  };

  /* ---------- Login: supabase.auth.signInWithPassword ---------- */

  $("adminLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("adminLoginError").textContent = "";

    if (!supabase) {
      $("adminLoginError").textContent =
        "Admin panel is not configured yet — add your Supabase keys in js/supabase-config.js.";
      return;
    }

    const email = $("adminEmail").value.trim();
    const password = $("adminPassword").value;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      // Deliberately generic — never reveal whether the email exists.
      $("adminLoginError").textContent = "Invalid email or password";
      return;
    }

    // Only the configured admin email may enter. Anything else is treated
    // exactly like a wrong password (and the stray session is dropped).
    if (!isAdminSession(data.session)) {
      supabase.auth.signOut();
      $("adminLoginError").textContent = "Invalid email or password";
      return;
    }

    // Valid admin session received from Supabase — only now show the panel.
    // Mark it as an intentional admin login so session restore (page reloads)
    // knows to reopen the panel — and so OTP sessions never can.
    markAdminAuthed();
    $("adminLoginForm").reset();
    showView("panel");
    loadMessages();
    loadProjects();
  });

  /* ---------- Admin panel: messages (authenticated read via RLS) ---------- */

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
  };

  const escapeHtml = (str) =>
    String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const loadMessages = async () => {
    const body = $("adminMessagesBody");
    const empty = $("adminMessagesEmpty");
    const status = $("adminMessagesStatus");
    body.innerHTML = "";
    empty.hidden = true;

    if (!supabase) {
      status.textContent = "Supabase is not configured.";
      return;
    }

    status.textContent = "Loading…";

    const { data, error } = await supabase
      .from("messages")
      .select("id, name, email, message, created_at")
      .order("created_at", { ascending: false });

    status.textContent = "";

    if (error) {
      status.textContent =
        "Could not load messages: " + (error.message || "unknown error");
      return;
    }

    if (!data || data.length === 0) {
      empty.hidden = false;
      return;
    }

    body.innerHTML = data
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.email)}</td>
            <td>${escapeHtml(row.message)}</td>
            <td class="admin-date">${escapeHtml(formatDate(row.created_at))}</td>
          </tr>`
      )
      .join("");
  };

  /* ---------- Admin panel: projects (public read) ---------- */

  const loadProjects = async () => {
    const body = $("adminProjectsBody");
    const empty = $("adminProjectsEmpty");
    const status = $("adminProjectsStatus");
    body.innerHTML = "";
    empty.hidden = true;

    if (!supabase) {
      status.textContent = "Supabase is not configured.";
      return;
    }

    status.textContent = "Loading…";

    const { data, error } = await supabase
      .from("projects")
      .select("id, title, description, tech_tags, created_at")
      .order("created_at", { ascending: false });

    status.textContent = "";

    if (error) {
      status.textContent =
        "Could not load projects: " + (error.message || "unknown error");
      return;
    }

    if (!data || data.length === 0) {
      empty.hidden = false;
      return;
    }

    body.innerHTML = data
      .map(
        (row) => `
          <tr data-id="${escapeHtml(row.id)}">
            <td>${escapeHtml(row.title)}</td>
            <td>${escapeHtml(row.description || "")}</td>
            <td>${escapeHtml((row.tech_tags || []).join(", "))}</td>
            <td class="admin-date">${escapeHtml(formatDate(row.created_at))}</td>
            <td class="admin-actions">
              <button class="admin-delete-btn" type="button" data-id="${escapeHtml(row.id)}" data-title="${escapeHtml(row.title)}" aria-label="Delete project: ${escapeHtml(row.title)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </td>
          </tr>`
      )
      .join("");

    // Wire delete buttons
    body.querySelectorAll(".admin-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteProject(btn.dataset.id, btn.dataset.title));
    });
  };

  /* ---------- Admin panel: delete project ---------- */

  const deleteProject = async (id, title) => {
    if (!supabase) return;

    const confirmed = window.confirm(`Delete project "${title}"? This cannot be undone.`);
    if (!confirmed) return;

    const status = $("adminProjectsStatus");
    status.textContent = "Deleting…";

    const { error } = await supabase.from("projects").delete().eq("id", id);

    if (error) {
      status.textContent =
        "Could not delete project: " + (error.message || "unknown error");
      return;
    }

    status.textContent = "Project deleted.";
    loadProjects();
    // Refresh the public Projects section on the live site immediately.
    if (typeof window.__refreshPublicProjects === "function") {
      window.__refreshPublicProjects();
    }
  };

  /* ---------- Admin panel: add project (authenticated insert via RLS) ---------- */

  $("adminProjectForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = $("adminProjectStatus");

    if (!supabase) {
      status.textContent = "Supabase is not configured.";
      return;
    }

    // Validate required fields
    const titleInput = $("projTitle");
    const descInput = $("projDesc");
    const titleError = $("projTitleError");
    const descError = $("projDescError");

    const titleValid = validateField(titleInput, titleError, "Title is required.");
    const descValid = validateField(descInput, descError, "Description is required.");

    if (!titleValid || !descValid) {
      status.textContent = "";
      return;
    }

    status.textContent = "Adding…";

    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    const tagsRaw = $("projTags").value.trim();
    const link = $("projLink").value.trim();
    const imageUrl = $("projImage").value.trim();

    // "React, CSS, JavaScript" -> ["React", "CSS", "JavaScript"]
    const techTags = tagsRaw
      ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    const { error } = await supabase.from("projects").insert({
      title,
      description: description || null,
      tech_tags: techTags,
      link: link || null,
      image_url: imageUrl || null,
    });

    if (error) {
      status.textContent =
        "Could not add project: " + (error.message || "unknown error");
      return;
    }

    status.textContent = "Project added.";
    $("adminProjectForm").reset();
    loadProjects(); // refresh the dashboard projects table
    // Refresh the public Projects section on the live site immediately.
    if (typeof window.__refreshPublicProjects === "function") {
      window.__refreshPublicProjects();
    }
  });

  /* ---------- Log out ---------- */

  $("adminLogout").addEventListener("click", () => {
    // Fire-and-forget: close the overlay immediately rather than waiting for
    // the sign-out network round-trip to finish first.
    if (supabase) supabase.auth.signOut();
    clearAdminAuthed();
    hideOverlay();
  });

  /* ---------- Session restore ---------- */

  // After a page reload while still logged in as admin (the login flag above
  // is set), the panel reopens directly. There is deliberately NO auth-state
  // listener here: the contact form's OTP verification also fires a SIGNED_IN
  // event with the admin's own email, and listening to it would yank the
  // visitor into the admin dashboard mid-form. Only the explicit password
  // login (which sets the flag) or a flagged restore may open the panel.
  if (supabase) {
    supabase.auth.getSession().then(({ data }) => {
      if (isAdminAuthed(data.session)) {
        showView("panel");
        loadMessages();
        loadProjects();
      }
    });
  }
})();
