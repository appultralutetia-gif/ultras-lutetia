-- ════════════════════════════════════════════════════════════
-- ULTRAS LUTETIA — Nettoyage post phase Key Users
-- À exécuter UNE SEULE FOIS, juste avant le lancement officiel.
-- Garde : membres, sections, cellules, membres_cellules, chartes,
--         config_asso, matchs (calendrier de saison réel).
-- Nettoie : tout le reste (tifos, déplacements, boutique, sticks,
--           cotisations, charte signée, évaluations, annonces, événements).
--
-- ⚠️ IRRÉVERSIBLE. Faire un export/backup avant (Supabase →
-- Database → Backups, ou pg_dump) si le moindre doute.
-- ════════════════════════════════════════════════════════════

-- ── 1. Tifos ────────────────────────────────────────────────
delete from inscriptions_session;
delete from sessions_tifo;

-- ── 2. Évaluations (cellule Tifo / Déplacement / Comité) ──────
delete from evaluations;

-- ── 3. Déplacements ────────────────────────────────────────────
delete from inscriptions_deplacement;
delete from deplacements;

-- ── 4. Boutique (matos) ────────────────────────────────────────
delete from commande_items;
delete from commandes;
delete from produits;

-- ── 5. Sticks ───────────────────────────────────────────────────
delete from sticks_distribution;
delete from sticks_catalogue;

-- ── 6. Cotisations ──────────────────────────────────────────────
delete from cotisations;
update membres set cotisation_a_jour = false;

-- ── 7. Charte (remise à zéro pour signature officielle au lancement) ──
delete from signatures_charte;
update membres set charte_signee = false, charte_signee_at = null;

-- ── 8. Annonces & événements de test ───────────────────────────
delete from annonces;
delete from evenements;

-- ── Conservé volontairement (ne pas toucher) ───────────────────
-- membres, sections, cellules, membres_cellules, chartes,
-- config_asso, matchs

-- ── Vérification rapide après exécution ────────────────────────
select
  (select count(*) from sessions_tifo) as nb_sessions_tifo,
  (select count(*) from inscriptions_session) as nb_inscriptions_session,
  (select count(*) from evaluations) as nb_evaluations,
  (select count(*) from deplacements) as nb_deplacements,
  (select count(*) from inscriptions_deplacement) as nb_inscriptions_deplacement,
  (select count(*) from produits) as nb_produits,
  (select count(*) from commandes) as nb_commandes,
  (select count(*) from sticks_catalogue) as nb_sticks_catalogue,
  (select count(*) from sticks_distribution) as nb_sticks_distribution,
  (select count(*) from cotisations) as nb_cotisations,
  (select count(*) from signatures_charte) as nb_signatures_charte,
  (select count(*) from annonces) as nb_annonces,
  (select count(*) from evenements) as nb_evenements,
  (select count(*) from membres) as nb_membres,        -- doit être inchangé
  (select count(*) from matchs) as nb_matchs;           -- doit être inchangé
-- Toutes les colonnes nb_* (sauf nb_membres et nb_matchs) doivent valoir 0.
