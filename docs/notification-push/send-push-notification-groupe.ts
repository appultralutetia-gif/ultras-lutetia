// ════════════════════════════════════════════════════════════
// ULTRAS LUTETIA — Edge Function send-push-notification
// ════════════════════════════════════════════════════════════
// Fonction GÉNÉRIQUE : envoie une notification push à TOUS les
// appareils enregistrés d'un membre donné. N'importe quel endroit de
// l'app peut déclencher une notification via UL.envoyerNotificationPush()
// (cf. supabase-client.js) — validation de compte aujourd'hui, n'importe
// quel autre événement demain (rappel de déplacement, nouvelle annonce,
// etc.) sans avoir à retoucher cette fonction.
//
// Entrée attendue (POST JSON) : { membreId, titre, corps, url? }
// Ne renvoie jamais d'erreur HTTP bloquante pour un échec d'envoi
// individuel (abonnement expiré, etc.) — voir la gestion des abonnements
// morts plus bas.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webPush from 'npm:web-push@3';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
// L'adresse mailto: est exigée par le protocole Web Push (sert de contact
// pour les opérateurs de service de notification — Google/Mozilla/Apple
// — en cas de souci, ex: abus signalé). Remplacer par une adresse réelle
// du bureau si besoin, sans impact technique sur le fonctionnement.
webPush.setVapidDetails(
  'mailto:contact@ultraslutetia.fr',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), // service_role : bypass RLS, nécessaire pour lire les abonnements de n'importe quel membre
);

// En-têtes CORS nécessaires pour que le navigateur (l'app, appelée depuis
// https://appultralutetia-gif.github.io) accepte la réponse de cette
// fonction, hébergée sur un domaine différent (*.supabase.co). Sans
// 'Access-Control-Allow-Origin', le navigateur bloque la réponse même si
// la fonction a parfaitement réussi côté serveur.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Le navigateur envoie d'abord une requête OPTIONS (preflight) sans
  // corps, pour vérifier les autorisations CORS avant d'envoyer le vrai
  // POST. Sans ce court-circuit, le code plus bas tentait de lire
  // req.json() sur cette requête vide → SyntaxError ("Unexpected end of
  // JSON input"), qui faisait échouer la fonction avant même de traiter
  // la vraie requête, et empêchait les en-têtes CORS d'être renvoyés —
  // ce qui apparaissait côté navigateur comme un blocage CORS plutôt que
  // comme l'erreur serveur qu'il était vraiment.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { membreId, titre, corps, url } = await req.json();
    if (!membreId || !titre) {
      return new Response(JSON.stringify({ error: 'membreId et titre requis' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: abonnements, error: errLecture } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('membre_id', membreId);

    if (errLecture) throw errLecture;
    if (!abonnements || abonnements.length === 0) {
      // Pas une erreur : ce membre n'a simplement activé les notifications
      // sur aucun appareil. L'email (envoyerEmailValidation) reste son
      // seul canal de notification dans ce cas — comportement attendu.
      return new Response(JSON.stringify({ envoyes: 0, raison: 'aucun abonnement' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.stringify({ titre, corps: corps || '', url: url || '/ultras-lutetia/' });

    const resultats = await Promise.allSettled(
      abonnements.map((a) =>
        webPush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          payload,
        ).catch((err) => {
          // 404/410 = abonnement expiré ou révoqué côté navigateur (ex:
          // l'utilisateur a désinstallé l'app, changé de téléphone, etc.)
          // — on nettoie la ligne pour ne pas retenter indéfiniment dans
          // le vide. Toute autre erreur est simplement remontée/loggée.
          if (err.statusCode === 404 || err.statusCode === 410) {
            return supabase.from('push_subscriptions').delete().eq('id', a.id);
          }
          throw err;
        })
      )
    );

    const envoyes = resultats.filter((r) => r.status === 'fulfilled').length;
    return new Response(JSON.stringify({ envoyes, total: abonnements.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('send-push-notification erreur:', e);
    return new Response(JSON.stringify({ error: e.message || 'Erreur serveur' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
