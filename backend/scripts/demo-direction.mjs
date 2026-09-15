/**
 * Jeu de démonstration pour la vue du directeur général.
 *
 *   node scripts/demo-direction.mjs             met le jeu en place
 *   node scripts/demo-direction.mjs --supprimer le retire entièrement
 *   node scripts/demo-direction.mjs --etat      dit seulement ce qu'il en reste
 *
 * PRODUCTION : lancez « --supprimer » avant la mise en service. La suppression
 * ne s'appuie pas sur les comptes mais sur le drapeau « estDemo » porté par
 * chaque vente, et sur le préfixe « demo- » des identifiants. Elle reste donc
 * exacte même si quelqu'un a supprimé un compte à la main entre-temps, cas où
 * les ventes seraient devenues orphelines tout en continuant de gonfler le
 * chiffre d'affaires.
 *
 * Aucune fiche client n'est créée ni modifiée : les ventes s'accrochent aux
 * clients déjà présents.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const MOT_DE_PASSE = "DemoDG2026!";
const PREFIXE = "demo-";

/* Le taux de commission porte sur le bénéfice, pas sur le chiffre d'affaires
   (voir src/lib/commissions.ts). Les taux varient d'une personne à l'autre,
   comme dans la réalité : un taux unique rendrait la colonne inutile. */
const COMPTES = [
  {
    identifiant: "demo-dg",
    nomComplet: "Cyrille YOUMBI",
    role: "DG",
    fonction: "Directeur général",
    email: "cyrille.youmbi@easytechgroup.net",
    pays: "Cameroun",
  },
  {
    identifiant: "demo-resp",
    nomComplet: "Paul Responsable",
    role: "RESPONSABLE_COMMERCIAL",
    fonction: "Responsable commercial",
    email: "paul.responsable@easytechgroup.net",
    pays: "Cameroun",
    tauxCommissionPct: 8,
  },
  {
    identifiant: "demo-nerea",
    nomComplet: "Nerea Vendeuse",
    role: "COMMERCIAL",
    fonction: "Commerciale grands comptes",
    email: "nerea.vendeuse@easytechgroup.net",
    pays: "Kenya",
    tauxCommissionPct: 6.5,
  },
  {
    identifiant: "demo-victor",
    nomComplet: "Victor Vendeur",
    role: "COMMERCIAL",
    fonction: "Commercial",
    email: "victor.vendeur@easytechgroup.net",
    pays: "Nigeria",
    tauxCommissionPct: 6.5,
  },
  {
    identifiant: "demo-joseph",
    nomComplet: "Joseph Kamga",
    role: "COMMERCIAL",
    fonction: "Commercial secteur public",
    email: "joseph.kamga@easytechgroup.net",
    pays: "Cameroun",
    tauxCommissionPct: 5,
  },
  {
    identifiant: "demo-vanessa",
    nomComplet: "Vanessa Ndongo",
    role: "COMMERCIAL",
    fonction: "Commerciale PME",
    email: "vanessa.ndongo@easytechgroup.net",
    pays: "Côte d'Ivoire",
    tauxCommissionPct: 7,
  },
  /* Un commercial sans taux fixé : la fiche doit afficher « taux non défini »
     et non un zéro, sinon on ne distingue plus « rien touché » de « règle pas
     encore arbitrée ». */
  {
    identifiant: "demo-samuel",
    nomComplet: "Samuel Eto'o",
    role: "COMMERCIAL",
    fonction: "Commercial grands comptes",
    email: "samuel.etoo@easytechgroup.net",
    pays: "Congo",
  },
  // Équipe projet : elle a son propre encart sur la page Équipes.
  {
    identifiant: "demo-chef1",
    nomComplet: "Aline Mbarga",
    role: "CHEF_DE_PROJET",
    fonction: "Cheffe de projet infrastructure",
    email: "aline.mbarga@easytechgroup.net",
    pays: "Cameroun",
  },
  {
    identifiant: "demo-chef2",
    nomComplet: "Idriss Fotso",
    role: "CHEF_DE_PROJET",
    fonction: "Chef de projet cybersécurité",
    email: "idriss.fotso@easytechgroup.net",
    pays: "Cameroun",
  },
  {
    identifiant: "demo-chef3",
    nomComplet: "Grace Nkeng",
    role: "CHEF_DE_PROJET",
    fonction: "Cheffe de projet cloud",
    email: "grace.nkeng@easytechgroup.net",
    pays: "Kenya",
  },
  {
    identifiant: "demo-chef4",
    nomComplet: "Serge Bilong",
    role: "CHEF_DE_PROJET",
    fonction: "Chef de projet formation",
    email: "serge.bilong@easytechgroup.net",
    pays: "Nigeria",
  },
  {
    identifiant: "demo-chef5",
    nomComplet: "Laure Tchoumi",
    role: "CHEF_DE_PROJET",
    fonction: "Cheffe de projet déploiement",
    email: "laure.tchoumi@easytechgroup.net",
    pays: "Côte d'Ivoire",
  },
];

/**
 * Quelles ventes déclenchent un projet, et sous quel intitulé.
 *
 * Des licences ou des postes de travail se livrent sans chantier : y attacher
 * un projet gonflerait artificiellement la charge de l'équipe. Seules les
 * prestations en engendrent un, avec une durée propre à chacune.
 */
const PRESTATIONS = {
  "Audit infrastructure": { libelle: "Audit d'infrastructure", semaines: 6 },
  "Formation cybersécurité": { libelle: "Programme de formation cybersécurité", semaines: 4 },
  "Maintenance annuelle": { libelle: "Contrat de maintenance", semaines: 52 },
  "Hébergement cloud": { libelle: "Migration vers le cloud", semaines: 10 },
  "Serveur Dell PowerEdge": { libelle: "Déploiement serveur", semaines: 5 },
  "Pare-feu Fortinet": { libelle: "Mise en place du pare-feu", semaines: 3 },
};

const CHEFS = ["demo-chef1", "demo-chef2", "demo-chef3", "demo-chef4", "demo-chef5"];

/**
 * Catalogue de démonstration.
 *
 * Les marges sont volontairement inégales : un tableau de bord où tout se vend
 * au même taux ne montre rien. Le matériel dégage peu, le service beaucoup,
 * ce qui rend le « bénéfice moyen » et le taux de marge intéressants à lire.
 */
const CATALOGUE = [
  { produit: "Licences Microsoft 365", achat: 250000, vente: 400000 },
  { produit: "Serveur Dell PowerEdge", achat: 1100000, vente: 1500000 },
  { produit: "Pare-feu Fortinet", achat: 600000, vente: 900000 },
  { produit: "Formation cybersécurité", achat: 120000, vente: 300000 },
  { produit: "Audit infrastructure", achat: 800000, vente: 2200000 },
  { produit: "Maintenance annuelle", achat: 300000, vente: 750000 },
  { produit: "Postes de travail HP", achat: 320000, vente: 450000 },
  { produit: "Hébergement cloud", achat: 180000, vente: 520000 },
];

const VENDEURS = ["demo-nerea", "demo-victor", "demo-joseph", "demo-vanessa", "demo-resp", "demo-samuel"];

/* Générateur déterministe : deux exécutions donnent le même jeu, donc les
   captures d'écran et les vérifications restent comparables d'une fois sur
   l'autre. Math.random rendrait tout irreproductible. */
function suiteAleatoire(graine) {
  let etat = graine;
  return () => {
    etat = (etat * 1664525 + 1013904223) % 4294967296;
    return etat / 4294967296;
  };
}

async function compter() {
  const [ventes, projets, comptes] = await Promise.all([
    prisma.vente.count({ where: { estDemo: true } }),
    prisma.projet.count({ where: { estDemo: true } }),
    prisma.utilisateur.count({ where: { identifiant: { startsWith: PREFIXE } } }),
  ]);
  return { ventes, projets, comptes };
}

async function etat() {
  const { ventes, projets, comptes } = await compter();
  const totalVentes = await prisma.vente.count();
  if (ventes === 0 && projets === 0 && comptes === 0) {
    console.log("Aucune donnée de démonstration en base.");
  } else {
    console.log(
      `Présent : ${comptes} compte(s) « ${PREFIXE}… », ${ventes} vente(s) et ${projets} projet(s) de démonstration.`
    );
    console.log(`  Sur ${totalVentes} vente(s) au total. Retrait : --supprimer`);
  }
}

async function supprimer({ silencieux = false } = {}) {
  /* Les projets avant les ventes : ils y pointent, et une vente supprimée
     laisserait des projets orphelins mais toujours comptés. Puis les comptes,
     en dernier, puisque rien ne dépend plus d'eux. */
  const projets = await prisma.projet.deleteMany({ where: { estDemo: true } });
  const ventes = await prisma.vente.deleteMany({ where: { estDemo: true } });
  const users = await prisma.utilisateur.deleteMany({ where: { identifiant: { startsWith: PREFIXE } } });

  if (!silencieux) {
    console.log(
      `Supprimé : ${users.count} compte(s), ${ventes.count} vente(s), ${projets.count} projet(s) de démonstration.`
    );
    const restant = (await compter()).ventes + (await compter()).projets;
    console.log(
      restant === 0
        ? `Il ne reste aucune donnée de démonstration. Base : ${await prisma.client.count()} clients, ${await prisma.vente.count()} ventes réelles.`
        : `ATTENTION : ${restant} enregistrement(s) de démonstration subsistent.`
    );
  }
  return { ventes: ventes.count, projets: projets.count, comptes: users.count };
}

async function creer() {
  await supprimer({ silencieux: true }); // idempotent : pas de doublons

  const hash = await bcrypt.hash(MOT_DE_PASSE, 10);
  const ids = {};
  for (const c of COMPTES) {
    const u = await prisma.utilisateur.create({ data: { ...c, motDePasseHash: hash } });
    ids[c.identifiant] = u.id;
  }
  await prisma.utilisateur.updateMany({
    where: { role: "COMMERCIAL", identifiant: { startsWith: PREFIXE } },
    data: { responsableId: ids["demo-resp"] },
  });

  /* On pioche largement dans la base clients pour que les ventilations par
     pays et par secteur aient de la matière : avec quatre clients seulement,
     le donut n'aurait jamais plus de quatre parts. */
  const clients = await prisma.client.findMany({
    where: { pays: { not: null } },
    take: 60,
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });
  if (clients.length === 0) {
    console.warn("Aucun client localisé en base : les ventes seront rattachées à un client fictif.");
  }

  const alea = suiteAleatoire(20260908);
  const piocher = (tableau) => tableau[Math.floor(alea() * tableau.length)];

  const maintenant = new Date();
  const ventes = [];

  /* Onze mois d'historique, avec une saisonnalité assumée : creux en début de
     période, montée en fin d'année. Un volume plat ne dirait rien d'un
     graphique d'évolution. Le mois en cours est volontairement plus léger,
     puisqu'il n'est pas terminé. */
  const VOLUME_PAR_MOIS = [4, 5, 3, 6, 7, 5, 8, 9, 7, 11, 13, 5];

  for (let recul = 11; recul >= 0; recul--) {
    const nbVentes = VOLUME_PAR_MOIS[11 - recul];
    for (let i = 0; i < nbVentes; i++) {
      const article = piocher(CATALOGUE);
      const client = clients.length > 0 ? piocher(clients) : null;
      const vendeur = piocher(VENDEURS);
      const jour = 1 + Math.floor(alea() * 27);

      // Quantité corrélée au prix : on ne vend pas douze serveurs d'un coup.
      const quantite = article.vente > 1000000 ? 1 : 1 + Math.floor(alea() * 9);

      // Remise ponctuelle jusqu'à 12 % : la marge varie d'une vente à l'autre,
      // sinon le bénéfice moyen serait une constante déguisée.
      const remise = alea() < 0.3 ? 1 - alea() * 0.12 : 1;

      ventes.push({
        clientId: client?.id ?? null,
        clientNom: client?.nom ?? "Client de démonstration",
        vendeurId: ids[vendeur],
        vendeurNom: COMPTES.find((c) => c.identifiant === vendeur).nomComplet,
        produit: article.produit,
        quantite,
        prixAchat: article.achat,
        prixVente: Math.round((article.vente * remise) / 1000) * 1000,
        dateVente: new Date(maintenant.getFullYear(), maintenant.getMonth() - recul, jour, 10, 0, 0),
        estDemo: true,
      });
    }
  }

  await prisma.vente.createMany({ data: ventes });

  /* Les projets se greffent sur les ventes déjà écrites : on les relit pour
     disposer de leur identifiant, seul moyen de lier réellement ce qui a été
     vendu à ce qui est livré. */
  const ventesEcrites = await prisma.vente.findMany({
    where: { estDemo: true },
    select: { id: true, produit: true, clientId: true, clientNom: true, prixVente: true, quantite: true, dateVente: true },
    orderBy: { dateVente: "asc" },
  });

  const projets = [];
  let i = 0;
  for (const v of ventesEcrites) {
    const prestation = PRESTATIONS[v.produit];
    if (!prestation) continue; // une licence se livre sans chantier

    /* Le chantier démarre peu après la signature, jamais le jour même. */
    const debut = new Date(v.dateVente);
    debut.setDate(debut.getDate() + 3 + Math.floor(alea() * 12));
    const finPrevue = new Date(debut);
    finPrevue.setDate(finPrevue.getDate() + prestation.semaines * 7);

    const chef = CHEFS[i % CHEFS.length];
    i++;

    /* L'état découle du calendrier, il n'est pas tiré au hasard : un projet
       dont la fin prévue est passée est livré ou en retard, jamais « en
       préparation ». Sans cette cohérence, le taux de respect des délais
       n'aurait aucun sens. */
    let statut;
    let dateFinReelle = null;
    let avancementPct;

    if (finPrevue < maintenant) {
      // Échéance passée : livré dans neuf cas sur dix, sinon en retard.
      if (alea() < 0.88) {
        statut = "LIVRE";
        avancementPct = 100;
        dateFinReelle = new Date(finPrevue);
        // Deux tiers à l'heure ou en avance, un tiers livré en retard.
        const derive = alea() < 0.66 ? -Math.floor(alea() * 9) : Math.floor(alea() * 21) + 1;
        dateFinReelle.setDate(dateFinReelle.getDate() + derive);
      } else {
        statut = "EN_COURS";
        avancementPct = 60 + Math.floor(alea() * 35);
      }
    } else if (debut > maintenant) {
      statut = "EN_PREPARATION";
      avancementPct = 0;
    } else {
      // En cours : l'avancement suit le temps écoulé, avec un peu de dérive.
      const part = (maintenant - debut) / (finPrevue - debut);
      statut = alea() < 0.12 ? "EN_PAUSE" : "EN_COURS";
      avancementPct = Math.max(5, Math.min(95, Math.round(part * 100 + (alea() * 30 - 15))));
    }

    projets.push({
      nom: `${prestation.libelle} · ${v.clientNom}`,
      clientId: v.clientId,
      clientNom: v.clientNom,
      venteId: v.id,
      chefDeProjetId: ids[chef],
      chefDeProjetNom: COMPTES.find((c) => c.identifiant === chef).nomComplet,
      statut,
      budget: Number(v.prixVente) * v.quantite,
      avancementPct,
      dateDebut: debut,
      dateFinPrevue: finPrevue,
      dateFinReelle,
      estDemo: true,
    });
  }

  await prisma.projet.createMany({ data: projets });

  const ca = ventes.reduce((s, v) => s + v.prixVente * v.quantite, 0);
  const budget = projets.reduce((s, p) => s + p.budget, 0);
  console.log("Jeu de démonstration en place.");
  console.log(`  Connexion DG : demo-dg / ${MOT_DE_PASSE}`);
  console.log(`  ${COMPTES.length} comptes, ${ventes.length} ventes sur 12 mois, ${projets.length} projets.`);
  console.log(`  Chiffre d'affaires simulé : ${ca.toLocaleString("fr-FR")} XAF`);
  console.log(`  Budget projets piloté : ${budget.toLocaleString("fr-FR")} XAF`);
  console.log("  Retrait avant mise en production : node scripts/demo-direction.mjs --supprimer");
}

if (process.argv.includes("--etat")) await etat();
else if (process.argv.includes("--supprimer")) await supprimer();
else await creer();
await prisma.$disconnect();
