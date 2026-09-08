/**
 * Jeu de démonstration pour la vue du directeur général.
 *
 * Crée un compte DG, une petite équipe commerciale et quelques ventes, de
 * quoi voir les quatre indicateurs remplis. « --supprimer » retire tout ce
 * que ce script a créé, et rien d'autre : les vrais clients et les vrais
 * comptes ne sont jamais touchés.
 *
 *   node scripts/demo-direction.mjs            crée le jeu
 *   node scripts/demo-direction.mjs --supprimer  le retire
 *
 * À n'utiliser qu'en local. Le mot de passe ci-dessous est public.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const MOT_DE_PASSE = "DemoDG2026!";

/* Le préfixe « demo- » est ce qui rend la suppression sûre : on ne retire
   que les comptes qui le portent. */
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
];

const IDENTIFIANTS = COMPTES.map((c) => c.identifiant);

async function supprimer() {
  const comptes = await prisma.utilisateur.findMany({
    where: { identifiant: { in: IDENTIFIANTS } },
    select: { id: true },
  });
  const ids = comptes.map((c) => c.id);

  // Les ventes de démonstration d'abord : la relation est en SetNull, elles
  // survivraient sinon à la suppression des comptes et fausseraient le CA.
  const ventes = await prisma.vente.deleteMany({ where: { vendeurId: { in: ids } } });
  const users = await prisma.utilisateur.deleteMany({ where: { identifiant: { in: IDENTIFIANTS } } });

  console.log(`Supprimé : ${users.count} compte(s) de démonstration, ${ventes.count} vente(s).`);
  console.log(`Restent en base : ${await prisma.client.count()} clients, ${await prisma.vente.count()} ventes.`);
}

async function creer() {
  // Idempotent : relancer le script ne crée pas de doublons.
  await supprimer();

  const hash = await bcrypt.hash(MOT_DE_PASSE, 10);
  const ids = {};
  for (const c of COMPTES) {
    const u = await prisma.utilisateur.create({ data: { ...c, motDePasseHash: hash } });
    ids[c.identifiant] = u.id;
  }
  await prisma.utilisateur.updateMany({
    where: { identifiant: { in: ["demo-nerea", "demo-victor"] } },
    data: { responsableId: ids["demo-resp"] },
  });

  const clients = await prisma.client.findMany({ take: 4, select: { id: true, nom: true } });
  if (clients.length === 0) {
    console.warn("Aucun client en base : les ventes seront rattachées à un client fictif.");
  }
  const cl = (i) => clients[i % Math.max(1, clients.length)] ?? null;

  /* « ilYAMois » etale les ventes sur plusieurs mois : sans cela, tout tombe
     le meme jour, la courbe d'evolution est un pic unique et la comparaison
     mois a mois n'a rien a comparer. */
  const auMois = (ilYAMois, jour) => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - ilYAMois, jour, 10, 0, 0);
  };

  const vente = (compte, produit, quantite, prixAchat, prixVente, i, ilYAMois, jour) => ({
    clientId: cl(i)?.id ?? null,
    clientNom: cl(i)?.nom ?? "Client de démonstration",
    vendeurId: ids[compte],
    vendeurNom: COMPTES.find((c) => c.identifiant === compte).nomComplet,
    produit,
    quantite,
    prixAchat,
    prixVente,
    dateVente: auMois(ilYAMois, jour),
  });

  /* Jeu choisi pour que les indicateurs ne soient pas triviaux : le meilleur
     produit se joue à l'occurrence (Microsoft 365 revient 4 fois) et non au
     chiffre d'affaires, et le meilleur vendeur n'est pas celui qui a fait le
     plus de ventes. */
  await prisma.vente.createMany({
    data: [
      // Il y a cinq mois
      vente("demo-victor", "Licences Microsoft 365", 4, 250000, 400000, 1, 5, 12),
      vente("demo-nerea", "Formation cybersécurité", 2, 120000, 300000, 2, 5, 24),
      // Il y a quatre mois
      vente("demo-nerea", "Licences Microsoft 365", 6, 250000, 400000, 0, 4, 8),
      vente("demo-resp", "Pare-feu Fortinet", 1, 600000, 900000, 3, 4, 19),
      // Il y a trois mois
      vente("demo-victor", "Serveur Dell PowerEdge", 1, 1100000, 1500000, 2, 3, 5),
      vente("demo-nerea", "Licences Microsoft 365", 9, 250000, 400000, 1, 3, 21),
      vente("demo-victor", "Formation cybersécurité", 3, 120000, 300000, 0, 3, 28),
      // Il y a deux mois
      vente("demo-resp", "Audit infrastructure", 1, 800000, 2200000, 0, 2, 6),
      vente("demo-nerea", "Serveur Dell PowerEdge", 2, 1100000, 1500000, 1, 2, 15),
      // Le mois dernier
      vente("demo-nerea", "Licences Microsoft 365", 12, 250000, 400000, 0, 1, 4),
      vente("demo-victor", "Pare-feu Fortinet", 3, 600000, 900000, 2, 1, 11),
      vente("demo-resp", "Licences Microsoft 365", 6, 250000, 400000, 3, 1, 22),
      vente("demo-victor", "Formation cybersécurité", 4, 120000, 300000, 1, 1, 27),
      // Ce mois-ci
      vente("demo-nerea", "Licences Microsoft 365", 5, 250000, 400000, 2, 0, 3),
      vente("demo-victor", "Licences Microsoft 365", 8, 250000, 400000, 3, 0, 6),
      vente("demo-resp", "Audit infrastructure", 1, 800000, 2200000, 1, 0, 9),
    ],
  });

  console.log("Jeu de démonstration en place.");
  console.log(`  Connexion DG : demo-dg / ${MOT_DE_PASSE}`);
  console.log(`  ${COMPTES.length} comptes, ${await prisma.vente.count()} ventes.`);
  console.log("  Pour tout retirer : node scripts/demo-direction.mjs --supprimer");
}

const retirer = process.argv.includes("--supprimer");
await (retirer ? supprimer() : creer());
await prisma.$disconnect();
