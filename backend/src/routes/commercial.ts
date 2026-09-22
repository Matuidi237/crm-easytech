import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { commissionDe, tauxEnNombre } from "../lib/commissions.js";

export const commercialRouter = Router();

/**
 * Tableau de bord d'un commercial : ce que LUI a fait.
 *
 * Toutes les routes de ce fichier travaillent sur le compte connecté, jamais
 * sur un identifiant passé dans l'URL. Un commercial n'a pas à pouvoir lire la
 * performance d'un collègue en changeant un paramètre, et cette garantie tient
 * à ce que l'identité vienne du jeton, pas de la requête.
 *
 * Les chiffres sortent de la table Vente, comme ceux de la direction : deux
 * sources donneraient deux vérités, et c'est le commercial qui découvrirait
 * l'écart devant son responsable.
 */

/** Les Decimal de Prisma arrivent en objet ; on les ramène à un nombre. */
const nb = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** Rôles qui composent le classement commercial. */
const ROLES_COMMERCIALE = ["RESPONSABLE_COMMERCIAL", "COMMERCIAL"] as const;

function bornesMensuelles(reference = new Date()) {
  return {
    debutMois: new Date(reference.getFullYear(), reference.getMonth(), 1),
    debutMoisPrecedent: new Date(reference.getFullYear(), reference.getMonth() - 1, 1),
  };
}

/** Null quand la période de référence est vide : « +100 % » depuis zéro ne veut rien dire. */
function variation(actuel: number, precedent: number): number | null {
  if (precedent <= 0) return null;
  return Math.round(((actuel - precedent) / precedent) * 100);
}

type Perf = { id: string; ca: number; benefice: number; nbVentes: number };

/**
 * Rang d'un identifiant dans une liste déjà triée, en 1..n.
 *
 * Les ex aequo partagent le même rang : deux commerciaux à 12 M ne peuvent pas
 * être deuxième et troisième, et trancher par ordre alphabétique inventerait
 * une hiérarchie que les chiffres ne portent pas.
 */
function rangDe(classement: { id: string; score: number }[], id: string): number | null {
  const index = classement.findIndex((c) => c.id === id);
  if (index === -1) return null;
  const score = classement[index].score;
  return classement.findIndex((c) => c.score === score) + 1;
}

commercialRouter.get("/tableau-de-bord", async (req, res) => {
  const moi = req.utilisateur!;

  const compte = await prisma.utilisateur.findUnique({
    where: { id: moi.id },
    select: { nomComplet: true, pays: true, tauxCommissionPct: true },
  });
  if (!compte) return res.status(404).json({ error: "Compte introuvable." });

  const taux = compte.tauxCommissionPct;

  /* Toutes les ventes de l'équipe en une lecture : le classement a besoin des
     autres, et une requête par collègue coûterait plus cher que ce tri. */
  const [mesVentes, ventesEquipe, equipe] = await Promise.all([
    prisma.vente.findMany({
      where: { vendeurId: moi.id },
      orderBy: { dateVente: "desc" },
      select: {
        id: true,
        clientId: true,
        clientNom: true,
        produit: true,
        dateVente: true,
        prixAchat: true,
        prixVente: true,
        quantite: true,
        commissionVerseeLe: true,
      },
    }),
    prisma.vente.findMany({
      where: { vendeurId: { not: null } },
      select: { vendeurId: true, prixAchat: true, prixVente: true, quantite: true },
    }),
    prisma.utilisateur.findMany({
      where: { role: { in: [...ROLES_COMMERCIALE] }, actif: true },
      select: { id: true },
    }),
  ]);

  /* --- Ce que j'ai réalisé ------------------------------------------------ */
  const { debutMois, debutMoisPrecedent } = bornesMensuelles();
  let ca = 0;
  let benefice = 0;
  let caMois = 0;
  let caMoisPrecedent = 0;
  let commissionsAttendues = 0;
  let commissionsRecues = 0;
  let commissionsMesurables = true;
  const mesClients = new Set<string>();

  /* Douze mois glissants, créés vides puis remplis. Partir des ventes
     laisserait les mois sans activité hors du graphique, et une courbe qui
     saute les creux raconte une progression qui n'a pas eu lieu. */
  const maintenant = new Date();
  const parMois: { mois: string; ca: number; benefice: number; nbVentes: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
    parMois.push({
      mois: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      ca: 0,
      benefice: 0,
      nbVentes: 0,
    });
  }
  const indexMois = new Map(parMois.map((m, i) => [m.mois, i]));

  const detail = [];

  for (const v of mesVentes) {
    const montant = nb(v.prixVente) * v.quantite;
    const marge = (nb(v.prixVente) - nb(v.prixAchat)) * v.quantite;
    ca += montant;
    benefice += marge;
    if (v.dateVente >= debutMois) caMois += montant;
    else if (v.dateVente >= debutMoisPrecedent) caMoisPrecedent += montant;
    if (v.clientId) mesClients.add(v.clientId);

    /* Commission calculée vente par vente, comme sur la fiche que consulte le
       directeur : un total obtenu autrement ne coïnciderait pas avec le détail,
       et c'est le commercial qui aurait à s'expliquer sur l'écart. */
    const part = commissionDe(marge, taux);
    if (part === null) {
      commissionsMesurables = false;
    } else {
      commissionsAttendues += part;
      if (v.commissionVerseeLe) commissionsRecues += part;
    }

    const cle = `${v.dateVente.getFullYear()}-${String(v.dateVente.getMonth() + 1).padStart(2, "0")}`;
    const i = indexMois.get(cle);
    if (i !== undefined) {
      parMois[i].ca += montant;
      parMois[i].benefice += marge;
      parMois[i].nbVentes += 1;
    }

    detail.push({
      id: v.id,
      dateVente: v.dateVente,
      clientNom: v.clientNom,
      produit: v.produit,
      quantite: v.quantite,
      montant: Math.round(montant),
      benefice: Math.round(marge),
      commission: part,
      /* Réglée ou non, ligne à ligne : c'est ce qui rend vérifiable l'écart
         entre « reçu » et « attendu » affiché en haut de page. Un total qu'on
         ne peut pas décomposer ne se conteste pas, et une commission se
         conteste. */
      commissionVerseeLe: v.commissionVerseeLe,
    });
  }

  /* --- Classement --------------------------------------------------------- */
  const perfs = new Map<string, Perf>(equipe.map((e) => [e.id, { id: e.id, ca: 0, benefice: 0, nbVentes: 0 }]));
  for (const v of ventesEquipe) {
    const p = perfs.get(v.vendeurId!);
    if (!p) continue; // vendeur inactif ou d'un autre rôle : hors classement
    p.ca += nb(v.prixVente) * v.quantite;
    p.benefice += (nb(v.prixVente) - nb(v.prixAchat)) * v.quantite;
    p.nbVentes += 1;
  }

  const membres = [...perfs.values()];
  const parCa = membres.map((p) => ({ id: p.id, score: p.ca })).sort((a, b) => b.score - a.score);
  /* Rentabilité = taux de marge, pas bénéfice absolu : sinon « rentabilité »
     ne dirait rien de plus que le chiffre d'affaires et le classement combiné
     mesurerait deux fois la même chose. Sans vente, la marge n'existe pas, et
     un taux de 0 la placerait devant quelqu'un qui vend à faible marge. */
  const parMarge = membres
    .map((p) => ({ id: p.id, score: p.ca > 0 ? p.benefice / p.ca : -1 }))
    .sort((a, b) => b.score - a.score);

  const rangCa = rangDe(parCa, moi.id);
  const rangMarge = rangDe(parMarge, moi.id);

  /* Les deux rangs se somment, puis on reclasse sur cette somme. Le plus petit
     total gagne : premier au chiffre et troisième à la marge (1+3) passe
     devant deuxième partout (2+2). Un commercial doit pouvoir refaire le
     calcul de tête, ce qu'une pondération arbitraire interdirait. */
  const parCombine = membres
    .map((p) => {
      const rc = rangDe(parCa, p.id) ?? membres.length;
      const rm = rangDe(parMarge, p.id) ?? membres.length;
      return { id: p.id, score: rc + rm };
    })
    .sort((a, b) => a.score - b.score);
  const rang = rangDe(parCombine, moi.id);

  const caEquipe = membres.reduce((s, p) => s + p.ca, 0);

  /* --- Portefeuille ------------------------------------------------------- */
  /* Trois façons d'avoir un client en charge : l'avoir créé, s'être vu ouvrir
     sa fiche, ou lui avoir déjà vendu. La troisième a l'air redondante, elle
     ne l'est pas : une fiche peut avoir changé de main après la vente, et
     l'oublier retirerait du chiffre d'affaires déjà réalisé du portefeuille. */
  const [possedes, ouverts] = await Promise.all([
    prisma.client.findMany({ where: { proprietaireId: moi.id }, select: { id: true } }),
    prisma.accesClient.findMany({ where: { utilisateurId: moi.id }, select: { clientId: true } }),
  ]);

  const portefeuille = new Set<string>([
    ...possedes.map((c) => c.id),
    ...ouverts.map((a) => a.clientId),
    ...mesClients,
  ]);
  const actifs = [...portefeuille].filter((id) => mesClients.has(id)).length;

  res.json({
    identite: { nomComplet: compte.nomComplet, pays: compte.pays },
    chiffreAffaires: {
      total: Math.round(ca),
      benefice: Math.round(benefice),
      margePct: ca > 0 ? Math.round((benefice / ca) * 100) : null,
      nbVentes: mesVentes.length,
      mois: Math.round(caMois),
      variationMois: variation(caMois, caMoisPrecedent),
      partEquipePct: caEquipe > 0 ? Math.round((ca / caEquipe) * 100) : null,
      derniereVente: mesVentes[0]?.dateVente ?? null,
    },
    classement: {
      rang,
      effectif: membres.length,
      rangChiffreAffaires: rangCa,
      rangRentabilite: rangMarge,
      /* Le premier sert de repère : savoir qu'on est troisième sans savoir de
         combien laisse croire à un écart infranchissable ou dérisoire. */
      caPremier: Math.round(parCa[0]?.score ?? 0),
    },
    portefeuille: {
      total: portefeuille.size,
      avecVente: actifs,
      couverturePct: portefeuille.size > 0 ? Math.round((actifs / portefeuille.size) * 100) : null,
    },
    commissions: {
      /* Null et non zéro quand aucun taux n'est fixé : « rien touché » et
         « règle pas encore arbitrée » appellent deux réactions différentes. */
      tauxPct: tauxEnNombre(taux),
      attendu: commissionsMesurables ? Math.round(commissionsAttendues) : null,
      recu: commissionsMesurables ? Math.round(commissionsRecues) : null,
      nbVentesReglees: mesVentes.filter((v) => v.commissionVerseeLe !== null).length,
    },
    parMois: parMois.map((m) => ({ ...m, ca: Math.round(m.ca), benefice: Math.round(m.benefice) })),
    ventes: detail,
  });
});
