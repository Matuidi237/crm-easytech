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

const COMPTES = [
  { identifiant: "demo-dg", nomComplet: "Awa Directrice", role: "DG", fonction: "Directrice générale" },
  {
    identifiant: "demo-resp",
    nomComplet: "Paul Responsable",
    role: "RESPONSABLE_COMMERCIAL",
    fonction: "Responsable commercial",
  },
  {
    identifiant: "demo-nerea",
    nomComplet: "Nerea Vendeuse",
    role: "COMMERCIAL",
    fonction: "Commerciale grands comptes",
  },
  { identifiant: "demo-victor", nomComplet: "Victor Vendeur", role: "COMMERCIAL", fonction: "Commercial" },
  { identifiant: "demo-joseph", nomComplet: "Joseph Kamga", role: "COMMERCIAL", fonction: "Commercial secteur public" },
  { identifiant: "demo-vanessa", nomComplet: "Vanessa Ndongo", role: "COMMERCIAL", fonction: "Commerciale PME" },
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

const VENDEURS = ["demo-nerea", "demo-victor", "demo-joseph", "demo-vanessa", "demo-resp"];

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
  const [ventes, comptes] = await Promise.all([
    prisma.vente.count({ where: { estDemo: true } }),
    prisma.utilisateur.count({ where: { identifiant: { startsWith: PREFIXE } } }),
  ]);
  return { ventes, comptes };
}

async function etat() {
  const { ventes, comptes } = await compter();
  const totalVentes = await prisma.vente.count();
  if (ventes === 0 && comptes === 0) {
    console.log("Aucune donnée de démonstration en base.");
  } else {
    console.log(`Présent : ${comptes} compte(s) « ${PREFIXE}… » et ${ventes} vente(s) de démonstration.`);
    console.log(`  Sur ${totalVentes} vente(s) au total. Retrait : --supprimer`);
  }
}

async function supprimer({ silencieux = false } = {}) {
  // Les ventes d'abord, par leur drapeau : elles ne dépendent d'aucun compte.
  const ventes = await prisma.vente.deleteMany({ where: { estDemo: true } });
  const users = await prisma.utilisateur.deleteMany({ where: { identifiant: { startsWith: PREFIXE } } });

  if (!silencieux) {
    console.log(`Supprimé : ${users.count} compte(s), ${ventes.count} vente(s) de démonstration.`);
    const restant = await prisma.vente.count({ where: { estDemo: true } });
    console.log(
      restant === 0
        ? `Il ne reste aucune donnée de démonstration. Base : ${await prisma.client.count()} clients, ${await prisma.vente.count()} ventes réelles.`
        : `ATTENTION : ${restant} vente(s) de démonstration subsistent.`
    );
  }
  return { ventes: ventes.count, comptes: users.count };
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
    where: { identifiant: { in: ["demo-nerea", "demo-victor", "demo-joseph", "demo-vanessa"] } },
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

  const ca = ventes.reduce((s, v) => s + v.prixVente * v.quantite, 0);
  console.log("Jeu de démonstration en place.");
  console.log(`  Connexion DG : demo-dg / ${MOT_DE_PASSE}`);
  console.log(`  ${COMPTES.length} comptes, ${ventes.length} ventes sur 12 mois.`);
  console.log(`  Chiffre d'affaires simulé : ${ca.toLocaleString("fr-FR")} XAF`);
  console.log("  Retrait avant mise en production : node scripts/demo-direction.mjs --supprimer");
}

if (process.argv.includes("--etat")) await etat();
else if (process.argv.includes("--supprimer")) await supprimer();
else await creer();
await prisma.$disconnect();
