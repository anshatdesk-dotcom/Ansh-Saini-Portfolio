/* ==========================================================================
   projects.js — public Projects section, backed by the Supabase "projects"
   table (anonymous read-only via RLS).

   Uses the shared client from js/supabase-config.js. If Supabase isn't
   configured, the fetch fails, or the table is empty, the static placeholder
   cards already in index.html stay untouched, so the section never appears
   empty.
   ========================================================================== */

(() => {
  "use strict";

  const supabase = window.__supabaseClient || null;
  if (!supabase) return;

  const grid = document.querySelector(".project-grid");
  if (!grid) return;

  const escapeHtml = (str) =>
    String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const buildCard = (project) => {
    const title = escapeHtml(project.title || "Untitled");
    const desc = escapeHtml(project.description || "");
    const link = project.link || "#";
    const imageUrl = project.image_url;
    const tags = Array.isArray(project.tech_tags) ? project.tech_tags : [];

    const thumb = imageUrl
      ? `<img class="project-thumb-img" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />`
      : `<div class="project-thumb" aria-hidden="true">Image placeholder</div>`;

    const chips = tags
      .map((tag) => `<li class="chip">${escapeHtml(tag)}</li>`)
      .join("");

    return `
      <article class="project-card">
        ${thumb}
        <div class="project-card-body">
          <h3 class="project-title">${title}</h3>
          ${desc ? `<p class="project-desc">${desc}</p>` : ""}
          ${chips ? `<ul class="project-tech" aria-label="Technologies used">${chips}</ul>` : ""}
          <a class="project-link" href="${escapeHtml(link)}" aria-label="View project: ${title}">View Project &rarr;</a>
        </div>
      </article>`;
  };

  (async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      // Any failure (network, RLS not set up, table missing) → keep placeholders.
      if (error || !data || data.length === 0) return;

      grid.innerHTML = data.map(buildCard).join("");
    } catch (_err) {
      // Keep the static placeholders on any unexpected error.
    }
  })();
})();