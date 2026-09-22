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
 * Partenaires technologiques.
 *
 * « motsClesProduits » relie chaque partenaire aux ventes déjà en base : c'est
 * ce qui permet de mesurer le volume réalisé sous son programme au lieu de le
 * déclarer. Les échelles diffèrent d'un programme à l'autre, chacun porte donc
 * la sienne.
 *
 * Les situations sont écrites telles qu'un channel manager les formulerait :
 * certaines sont chiffrées, d'autres non, et quelques-unes sont simplement
 * inconnues. Un jeu où tout serait mesuré donnerait une fausse idée de ce que
 * l'outil saura afficher en vrai.
 */
const PARTENAIRES = [
  {
    nom: "Microsoft",
    type: "EDITEUR",
    siteWeb: "https://partner.microsoft.com",
    paliers: ["Member", "Action Pack", "Solutions Partner", "Solutions Partner Expert"],
    niveauActuel: "Solutions Partner",
    moisDepuis: 14,
    motsClesProduits: ["Microsoft"],
    channelManagerNom: "Sandra Eyenga",
    channelManagerEmail: "sandra.eyenga@partner.microsoft.com",
    channelManagerTelephone: "+237 6 98 45 12 30",
    notes: "Revue de partenariat chaque trimestre. Les certifications se renouvellent tous les deux ans.",
    conditions: [
      { libelle: "Chiffre d'affaires annuel", exigence: "60 M XAF sur les licences", seuilCaXAF: 60000000 },
      { libelle: "Ingénieurs certifiés", exigence: "4 certifications Azure actives", situation: "3 sur 4", satisfaite: false },
      { libelle: "Références clients", exigence: "5 déploiements documentés", situation: "7 déploiements", satisfaite: true },
      { libelle: "Score de satisfaction", exigence: "Au moins 4,5 sur 5", situation: "4,7 sur 5", satisfaite: true },
    ],
  },
  {
    nom: "Fortinet",
    type: "CONSTRUCTEUR",
    siteWeb: "https://partners.fortinet.com",
    paliers: ["Select", "Advanced", "Expert"],
    niveauActuel: "Advanced",
    moisDepuis: 8,
    motsClesProduits: ["Fortinet", "Pare-feu"],
    channelManagerNom: "Olivier Manga",
    channelManagerEmail: "omanga@fortinet.com",
    channelManagerTelephone: "+237 6 77 21 08 44",
    notes: "Le passage à Expert exige un audit du centre de support sur site.",
    conditions: [
      { libelle: "Chiffre d'affaires annuel", exigence: "25 M XAF sur les équipements", seuilCaXAF: 25000000 },
      { libelle: "Ingénieurs certifiés NSE", exigence: "2 NSE 7 et 4 NSE 4", situation: "1 NSE 7 et 5 NSE 4", satisfaite: false },
      { libelle: "Support de niveau 1", exigence: "Astreinte en propre", situation: "En place depuis mars", satisfaite: true },
      { libelle: "Audit du centre de support", exigence: "Visite annuelle validée", satisfaite: false },
    ],
  },
  {
    nom: "Dell Technologies",
    type: "CONSTRUCTEUR",
    siteWeb: "https://www.delltechnologies.com/partner",
    paliers: ["Authorized", "Gold", "Platinum", "Titanium"],
    niveauActuel: "Gold",
    moisDepuis: 22,
    motsClesProduits: ["Dell", "Serveur"],
    channelManagerNom: "Brigitte Nana",
    channelManagerEmail: "brigitte.nana@dell.com",
    channelManagerTelephone: "+237 6 55 90 17 62",
    conditions: [
      { libelle: "Chiffre d'affaires annuel", exigence: "40 M XAF sur l'infrastructure", seuilCaXAF: 40000000 },
      { libelle: "Formations commerciales", exigence: "3 vendeurs accrédités", situation: "4 vendeurs", satisfaite: true },
      { libelle: "Stock de démonstration", exigence: "Un serveur de démonstration en agence", satisfaite: false },
    ],
  },
  {
    nom: "HP",
    type: "CONSTRUCTEUR",
    siteWeb: "https://partner.hp.com",
    paliers: ["Business", "Silver", "Gold", "Platinum"],
    niveauActuel: "Silver",
    moisDepuis: 5,
    motsClesProduits: ["HP", "Postes de travail"],
    // Aucun channel manager désigné : le cas doit être visible à l'écran.
    conditions: [
      { libelle: "Volume annuel", exigence: "150 postes livrés", situation: "62 postes", satisfaite: false },
      { libelle: "Technicien agréé", exigence: "1 technicien certifié maintenance", satisfaite: true },
    ],
  },
  {
    nom: "Orange Business",
    type: "SERVICES",
    siteWeb: "https://www.orange-business.com",
    paliers: ["Référencé", "Partenaire", "Partenaire Premium"],
    niveauActuel: "Partenaire",
    moisDepuis: 11,
    motsClesProduits: ["Hébergement", "cloud"],
    channelManagerNom: "Thierry Abega",
    channelManagerEmail: "thierry.abega@orange-business.com",
    channelManagerTelephone: "+237 6 94 33 71 05",
    notes: "Interlocuteur unique pour l'hébergement régional et la connectivité.",
    conditions: [
      { libelle: "Volume d'hébergement", exigence: "20 M XAF facturés sur douze mois", seuilCaXAF: 20000000 },
      { libelle: "Engagement de service", exigence: "Contrat de niveau de service signé", situation: "Signé en janvier", satisfaite: true },
      { libelle: "Référent technique dédié", exigence: "1 architecte cloud identifié", situation: "À pourvoir", satisfaite: false },
    ],
  },
];

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

/* Clients confiés à chaque commercial. Assez large pour qu'il en reste sans
   vente : un portefeuille entièrement servi donnerait 100 % de couverture à
   tout le monde, et le tableau de bord n'apprendrait plus rien. */
const TAILLE_PORTEFEUILLE = 26;

/* Délai de règlement des commissions : elles se versent le mois suivant.
   Les ventes plus récentes restent donc dues, ce qui rend l'écart entre
   « reçu » et « attendu » visible au lieu d'être toujours nul. */
const MOIS_AVANT_VERSEMENT = 1;

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
  const [ventes, projets, partenaires, comptes, clientsRattaches] = await Promise.all([
    prisma.vente.count({ where: { estDemo: true } }),
    prisma.projet.count({ where: { estDemo: true } }),
    prisma.partenaire.count({ where: { estDemo: true } }),
    prisma.utilisateur.count({ where: { identifiant: { startsWith: PREFIXE } } }),
    /* Fiches confiées à un compte de démonstration. Elles ne sont pas
       supprimées au nettoyage, seulement libérées : ce sont de vrais clients,
       seul leur rattachement était simulé. */
    prisma.client.count({ where: { proprietaire: { identifiant: { startsWith: PREFIXE } } } }),
  ]);
  return { ventes, projets, partenaires, comptes, clientsRattaches };
}

async function etat() {
  const { ventes, projets, partenaires, comptes, clientsRattaches } = await compter();
  const totalVentes = await prisma.vente.count();
  if (ventes === 0 && projets === 0 && partenaires === 0 && comptes === 0) {
    console.log("Aucune donnée de démonstration en base.");
  } else {
    console.log(
      `Présent : ${comptes} compte(s) « ${PREFIXE}… », ${ventes} vente(s), ${projets} projet(s) et ${partenaires} partenaire(s) de démonstration.`
    );
    console.log(`  ${clientsRattaches} fiche(s) client confiées à ces comptes (libérées au retrait, jamais supprimées).`);
    console.log(`  Sur ${totalVentes} vente(s) au total. Retrait : --supprimer`);
  }
}

async function supprimer({ silencieux = false } = {}) {
  /* Les projets avant les ventes : ils y pointent, et une vente supprimée
     laisserait des projets orphelins mais toujours comptés. Puis les comptes,
     en dernier, puisque rien ne dépend plus d'eux. */
  const projets = await prisma.projet.deleteMany({ where: { estDemo: true } });
  const ventes = await prisma.vente.deleteMany({ where: { estDemo: true } });
  // Les conditions partent avec leur partenaire, la relation étant en cascade.
  const partenaires = await prisma.partenaire.deleteMany({ where: { estDemo: true } });
  /* Les fiches confiées à ces comptes se libèrent d'elles-mêmes : la relation
     est en SetNull. On les compte avant, pour pouvoir le dire et le vérifier
     plutôt que de l'affirmer. */
  const rattaches = await prisma.client.count({
    where: { proprietaire: { identifiant: { startsWith: PREFIXE } } },
  });
  const users = await prisma.utilisateur.deleteMany({ where: { identifiant: { startsWith: PREFIXE } } });

  if (!silencieux) {
    console.log(
      `Supprimé : ${users.count} compte(s), ${ventes.count} vente(s), ${projets.count} projet(s), ${partenaires.count} partenaire(s) de démonstration.`
    );
    console.log(`  ${rattaches} fiche(s) client libérées de leur propriétaire de démonstration, aucune supprimée.`);
    const c = await compter();
    const restant = c.ventes + c.projets + c.partenaires + c.clientsRattaches;
    console.log(
      restant === 0
        ? `Il ne reste aucune donnée de démonstration. Base : ${await prisma.client.count()} clients, ${await prisma.vente.count()} ventes réelles.`
        : `ATTENTION : ${restant} enregistrement(s) de démonstration subsistent.`
    );
  }
  return { ventes: ventes.count, projets: projets.count, partenaires: partenaires.count, comptes: users.count };
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
    where: { pays: { not: null }, proprietaireId: null },
    take: TAILLE_PORTEFEUILLE * VENDEURS.length,
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });
  if (clients.length === 0) {
    console.warn("Aucun client localisé en base : les ventes seront rattachées à un client fictif.");
  }

  /* Portefeuilles : chaque commercial se voit confier une tranche de clients.
     Sans eux, le taux de couverture de son tableau de bord vaudrait toujours
     100 % puisque son portefeuille se réduirait à ceux à qui il a vendu, et
     l'indicateur ne dirait plus rien.
     Seules des fiches sans propriétaire sont prises, et la suppression du jeu
     de démonstration les libère d'elle-même : « proprietaire » passe à null
     quand le compte disparaît (onDelete: SetNull). */
  const portefeuilles = new Map();
  for (const [rang, vendeur] of VENDEURS.entries()) {
    const part = clients.slice(rang * TAILLE_PORTEFEUILLE, (rang + 1) * TAILLE_PORTEFEUILLE);
    portefeuilles.set(vendeur, part);
    if (part.length > 0) {
      await prisma.client.updateMany({
        where: { id: { in: part.map((c) => c.id) } },
        data: { proprietaireId: ids[vendeur] },
      });
    }
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
      const vendeur = piocher(VENDEURS);
      /* On vend d'abord chez soi : une vente tirée au hasard dans toute la
         base ferait apparaître des clients hors portefeuille partout, et le
         taux de couverture mesurerait un rattachement qui n'existe pas. Une
         vente sur six échappe au portefeuille, comme dans la réalité. */
      const vivier = portefeuilles.get(vendeur) ?? [];
      const source = alea() < 0.84 && vivier.length > 0 ? vivier : clients;
      const client = source.length > 0 ? piocher(source) : null;
      const jour = 1 + Math.floor(alea() * 27);

      // Quantité corrélée au prix : on ne vend pas douze serveurs d'un coup.
      const quantite = article.vente > 1000000 ? 1 : 1 + Math.floor(alea() * 9);

      // Remise ponctuelle jusqu'à 12 % : la marge varie d'une vente à l'autre,
      // sinon le bénéfice moyen serait une constante déguisée.
      const remise = alea() < 0.3 ? 1 - alea() * 0.12 : 1;
      const dateVente = new Date(maintenant.getFullYear(), maintenant.getMonth() - recul, jour, 10, 0, 0);

      ventes.push({
        clientId: client?.id ?? null,
        clientNom: client?.nom ?? "Client de démonstration",
        vendeurId: ids[vendeur],
        vendeurNom: COMPTES.find((c) => c.identifiant === vendeur).nomComplet,
        produit: article.produit,
        quantite,
        prixAchat: article.achat,
        prixVente: Math.round((article.vente * remise) / 1000) * 1000,
        dateVente: dateVente,
        /* Réglée si le mois de la vente est clos depuis assez longtemps ;
           versée le 5 du mois suivant, comme une paie. Laisser toutes les
           commissions impayées afficherait « 0 / 4,2 M » sur chaque fiche, et
           toutes les payer ferait disparaître le reste dû. */
        commissionVerseeLe: recul > MOIS_AVANT_VERSEMENT
          ? new Date(dateVente.getFullYear(), dateVente.getMonth() + 1, 5, 9, 0, 0)
          : null,
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

  for (const p of PARTENAIRES) {
    const { conditions, moisDepuis, ...champs } = p;
    const depuis = new Date();
    depuis.setMonth(depuis.getMonth() - moisDepuis);
    await prisma.partenaire.create({
      data: {
        ...champs,
        depuis,
        estDemo: true,
        conditions: {
          create: conditions.map((c, ordre) => ({ ...c, ordre })),
        },
      },
    });
  }

  const ca = ventes.reduce((s, v) => s + v.prixVente * v.quantite, 0);
  const budget = projets.reduce((s, p) => s + p.budget, 0);
  const regees = ventes.filter((v) => v.commissionVerseeLe !== null).length;
  console.log("Jeu de démonstration en place.");
  console.log(`  Connexion DG         : demo-dg / ${MOT_DE_PASSE}`);
  console.log(`  Connexion commercial : demo-nerea / ${MOT_DE_PASSE}`);
  console.log(
    `  Portefeuilles : ${TAILLE_PORTEFEUILLE} clients par commercial, ${regees} vente(s) sur ${ventes.length} avec commission versée.`
  );
  console.log(
    `  ${COMPTES.length} comptes, ${ventes.length} ventes sur 12 mois, ${projets.length} projets, ${PARTENAIRES.length} partenaires.`
  );
  console.log(`  Chiffre d'affaires simulé : ${ca.toLocaleString("fr-FR")} XAF`);
  console.log(`  Budget projets piloté : ${budget.toLocaleString("fr-FR")} XAF`);
  console.log("  Retrait avant mise en production : node scripts/demo-direction.mjs --supprimer");
}

if (process.argv.includes("--etat")) await etat();
else if (process.argv.includes("--supprimer")) await supprimer();
else await creer();
await prisma.$disconnect();
