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

  /* ---------- Strict one-view gate ---------- */

  const showOverlay = () => {
    $("adminOverlay").hidden = false;
    // Lock the page behind the overlay (scroll must happen inside the panel).
    document.body.style.overflow = "hidden";
    // Stop Lenis smooth scroll so wheel input reaches the panel's own
    // scrollbar instead of being swallowed trying to scroll the locked page.
    if (window.__lenis) window.__lenis.stop();
  };

  const hideOverlay = () => {
    $("adminOverlay").hidden = true;
    // Hide BOTH views so nothing can linger visible behind the overlay.
    $("adminLogin").hidden = true;
    $("adminPanel").hidden = true;
    document.body.style.overflow = "";
    if (window.__lenis) window.__lenis.start();
  };

  // Exactly one view visible: "login" or "panel". Never both, never none.
  const showView = (view) => {
    $("adminLogin").hidden = view !== "login";
    $("adminPanel").hidden = view !== "panel";
    showOverlay();
  };

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
        // Never open the login over a live session; go straight to the panel.
        if (supabase && supabase.auth.getSession) {
          supabase.auth.getSession().then(({ data }) => {
            if (data.session) showView("panel");
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

    // Valid session received from Supabase — and only now show the panel.
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
      .select("name, email, message, created_at")
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
      .select("title, description, tech_tags, created_at")
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
          <tr>
            <td>${escapeHtml(row.title)}</td>
            <td>${escapeHtml(row.description || "")}</td>
            <td>${escapeHtml((row.tech_tags || []).join(", "))}</td>
            <td class="admin-date">${escapeHtml(formatDate(row.created_at))}</td>
          </tr>`
      )
      .join("");
  };

  /* ---------- Admin panel: add project (authenticated insert via RLS) ---------- */

  $("adminProjectForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = $("adminProjectStatus");

    if (!supabase) {
      status.textContent = "Supabase is not configured.";
      return;
    }

    status.textContent = "Adding…";

    const title = $("projTitle").value.trim();
    const description = $("projDesc").value.trim();
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
    hideOverlay();
  });

  /* ---------- Session restore ---------- */

  // If a Supabase session already exists (page reload while logged in), the
  // panel is reachable directly; otherwise only the login view ever exists.
  if (supabase) {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        showView("panel");
        loadMessages();
        loadProjects();
      }
    });

    // Keep the gate honest across tabs / sign-out.
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        showView("panel");
        loadMessages();
        loadProjects();
      }
    });
  }
})();