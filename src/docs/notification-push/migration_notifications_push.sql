-- ════════════════════════════════════════════════════════════
-- ULTRAS LUTETIA — Notifications push (infrastructure générique)
-- À exécuter UNE FOIS dans Supabase → SQL Editor, avant de déployer
-- l'Edge Function send-push-notification.
--
-- Principe : un membre peut ouvrir l'app sur plusieurs appareils
-- (téléphone + tablette par ex). Chaque appareil qui active les
-- notifications crée sa propre ligne ("abonnement push" / subscription).
-- Quand on veut notifier un membre, on envoie à TOUTES ses lignes.
-- ════════════════════════════════════════════════════════════

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  membre_id uuid not null references membres(id) on delete cascade,
  -- Les 3 champs ci-dessous forment l'abonnement push tel que fourni par
  -- le navigateur (PushSubscription.toJSON()) — endpoint = l'URL du
  -- service de notification du navigateur (Google/Mozilla/Apple selon le
  -- cas), p256dh/auth = clés de chiffrement propres à cet appareil.
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Un membre peut avoir plusieurs abonnements (plusieurs appareils), mais
-- jamais le même endpoint deux fois (ré-abonnement = on remplace, pas
-- on duplique) — cf. logique "upsert" côté front dans notifications.js.
create index if not exists idx_push_subscriptions_membre on push_subscriptions(membre_id);

-- RLS : un membre ne doit pouvoir gérer que ses propres abonnements.
-- L'Edge Function d'envoi utilise la clé service_role, qui bypasse RLS,
-- donc elle peut lire tous les abonnements pour notifier qui elle veut.
alter table push_subscriptions enable row level security;

create policy "Un membre gère ses propres abonnements push"
  on push_subscriptions
  for all
  using (membre_id = auth.uid())
  with check (membre_id = auth.uid());

-- ── Vérification rapide après exécution ────────────────────────
select count(*) as nb_abonnements_push from push_subscriptions;
-- Doit afficher 0 juste après la création (table vide, normal).
