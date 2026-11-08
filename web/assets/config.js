// Paste your Supabase Project URL and the *anon / publishable* key (Settings > API Keys).
// URL must look like  https://abcdxyz.supabase.co   (nothing after .supabase.co).
// NEVER paste the service_role / secret key here.
window.APP_CONFIG = { SUPABASE_URL: "https://yjdxiigmclkochwjnoqk.supabase.co", SUPABASE_ANON_KEY: "sb_publishable_kBS5b3wPPm37XV1etVtbaQ_S09_-xX0" };
// Safety net: removes spaces and any accidental path such as /rest/v1/ from the URL.
window.APP_CONFIG.SUPABASE_URL = (window.APP_CONFIG.SUPABASE_URL || "").trim().replace(/^(https?:\/\/[^\/]+).*$/i, "$1");
window.APP_CONFIG.SUPABASE_ANON_KEY = (window.APP_CONFIG.SUPABASE_ANON_KEY || "").trim();
