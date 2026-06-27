// ============================================================
// ULTRAS LUTETIA — config.js (PROD)
// ============================================================

const UL_CONFIG = {
  SUPABASE_URL: 'https://afgriuvrtdkklluvtswg.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmZ3JpdXZydGRra2xsdXZ0c3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTkwODgsImV4cCI6MjA5NzI5NTA4OH0.3jXUyJD87MjhFJctzceMVoeHWGCSqGmVy3TPuXGQebc',
  APP_VERSION: '1.0.0',
  SAISON_COURANTE: '2026-2027',
  // Clé PUBLIQUE VAPID pour les notifications push (cf. GUIDE_NOTIFICATIONS_PUSH.md
  // étape 1) — ce n'est PAS un secret, elle est conçue pour être visible côté
  // client (le navigateur en a besoin pour créer l'abonnement push). La clé
  // PRIVÉE correspondante ne doit JAMAIS apparaître ici — elle va uniquement
  // dans les secrets Supabase, lue par l'Edge Function send-push-notification.
  VAPID_PUBLIC_KEY: 'REMPLACER_PAR_TA_CLE_PUBLIQUE_VAPID',
};
