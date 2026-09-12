# Run doc — Ansh Saini Portfolio (static HTML)

## How to reproduce artifacts

This is a plain static site — no build step, no dependencies, no env files to copy.

- Files: `index.html`, `css/*.css`, `js/*.js`, `js/vendor/*.js`.
- No `.env.local`, no `node_modules`, no package manager needed.
- Vendored libraries are committed under `js/vendor/` and loaded with plain
  script tags (no bundler): GSAP, ScrollTrigger, Three.js, Lenis,
  `supabase.min.js` (UMD build of `@supabase/supabase-js`) and
  `matter.min.js` (browser build of the `matter-js` npm package, used by
  `js/celebration.js` for the contact-form success celebration and by
  `js/resume-physics.js` for the Resume section's floating tech icons).
  If one needs updating, download the vendored build from the npm package and
  drop it in `js/vendor/` — there is no install step.

## How to run the server

Static HTTP server on port 8123, one file: `.freebuff/dev-server.ps1`.

**From PowerShell (Windows):**
```powershell
cd D:\Portfolio
powershell -NoProfile -ExecutionPolicy Bypass -File .freebuff\dev-server.ps1
```

**Detached (so it outlives the session):**
```powershell
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','D:\Portfolio\.freebuff\dev-server.ps1' -RedirectStandardOutput 'D:\Portfolio\.freebuff\preview-<uuid>.log' -RedirectStandardError 'D:\Portfolio\.freebuff\preview-<uuid>.err' -WindowStyle Hidden -PassThru
```

The server sets `Content-Type` correctly for `.html`, `.css`, `.js`, `.jpg`, `.png`, `.svg`, `.woff2`. It serves `index.html` at `/` and falls back to `404` for missing paths.

Port: **8123** (hardcoded in `dev-server.ps1`). If 8123 is taken, edit `$listener.Prefixes.Add("http://127.0.0.1:8123/")` to a free port and update any client config.
