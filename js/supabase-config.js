/* ==========================================================================
   supabase-config.js — Supabase project credentials + shared client
   --------------------------------------------------------------------------
   Paste your values below (see the walkthrough for where to find them in
   the Supabase dashboard). These are PUBLIC (anon) credentials — the anon
   key is safe to ship to the browser by design; Row Level Security is what
   actually protects the data.

     SUPABASE_URL       — Project Settings → API → Project URL
                          (e.g. https://abcdefghijklmnopqrst.supabase.co)
     SUPABASE_ANON_KEY  — Project Settings → API → anon / public key
                          (the long "eyJ..." JWT)

   Leave either blank and the site runs exactly as before: the contact form
   keeps its placeholder behaviour and Projects shows the static cards. The
   hidden admin panel still opens via the logo triple-click (hardcoded
   credentials in js/admin.js) but its data features show a "not configured"
   notice.

   A single shared client (window.__supabaseClient) is created here so the
   contact form, projects fetch and admin panel never spin up duplicate
   GoTrue clients under the same storage key.
   ========================================================================== */

window.SUPABASE_URL = "https://xbzeziqhxqsagmdjkzpl.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhiemV6aXFoeHFzYWdtZGprenBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MDM3MjAsImV4cCI6MjEwNDM3OTcyMH0.o8ArWMI9Ssj3jneNzfThuO2iy6YTrujaPhDSMuW6Ud4";

window.__supabaseClient =
  window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY
    ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;