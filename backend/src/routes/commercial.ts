import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { BAREME_PCT, commissionDe, tauxEffectif, type NatureVente } from "../lib/commissions.js";
import {
  ajouter,
  cumulVide,
  margeDe,
  margePct,
  montantDe,
  type Cumul,
} from "../lib/ventes.js";
import {
  COLONNES,
  PROBABILITE_PCT,
  estOuverte,
  joursDansEtape,
  stagne,
  valeurPonderee,
} from "../lib/pipeline.js";
import { peut, perimetreClients } from "../lib/permissions.js";
import { chercherDoublon } from "./clients.js";
import { fenetreDe, partEcoulee } from "../lib/periodes.js";

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

type Perf = { id: string; ca: number; caEvalue: number; benefice: number; nbVentes: number };

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
    select: { nomComplet: true, pays: true, tauxCommissionPct: true, objectifsPersonnels: true },
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
        nature: true,
        referenceCommande: true,
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

  /* Objectif de l'année en cours, dans la source que le compte a retenue
     (voir l'onglet Agenda). Il remplace le chiffre d'affaires brut en tête du
     tableau de bord : savoir qu'on a fait 30 M n'apprend rien tant qu'on
     ignore ce qui était attendu. */
  const anneeEnCours = fenetreDe("ANNEE", new Date());
  const objectifsAnnee = await prisma.objectifCommercial.findMany({
    where: {
      utilisateurId: moi.id,
      periode: "ANNEE",
      debut: new Date(Date.UTC(anneeEnCours.debut.getFullYear(), 0, 1)),
    },
    select: { cibleCaXAF: true, fixeParEncadrement: true, definiParNom: true },
  });
  // Le compte suit soit son propre objectif, soit celui de l'encadrement.
  const sourceEncadrement = !compte.objectifsPersonnels;
  const objectifRetenu = objectifsAnnee.find((o) => o.fixeParEncadrement === sourceEncadrement) ?? null;

  /* --- Ce que j'ai réalisé ------------------------------------------------ */
  const { debutMois, debutMoisPrecedent } = bornesMensuelles();
  let ca = 0;
  let benefice = 0;
  let caMois = 0;
  let caMoisPrecedent = 0;
  let commissionsAttendues = 0;
  let commissionsRecues = 0;
  /* Chiffre d'affaires des seules ventes chiffrées : c'est l'assiette du taux
     de marge. Le rapporter au chiffre d'affaires total ferait baisser le taux
     à chaque commande non encore complétée, sans que rien n'ait changé. */
  let caEvalue = 0;
  let ventesSansCout = 0;
  /* Le cumul de l'année civile, seul comparable à un objectif annuel. Le
     total de tous les temps inclurait les exercices précédents et donnerait
     un taux de complétion flatteur et faux. */
  let caAnnee = 0;
  let beneficeAnnee = 0;
  let nbVentesAnnee = 0;
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
    const montant = montantDe(v);
    /* Null tant que la direction n'a pas renseigné le prix d'achat. La vente
       compte alors dans le chiffre d'affaires et dans l'objectif, mais ni dans
       le bénéfice ni dans la commission : une marge inconnue ne vaut pas zéro,
       et la compter pour telle afficherait 100 % de marge. */
    const marge = margeDe(v);
    ca += montant;
    if (marge !== null) {
      caEvalue += montant;
      benefice += marge;
    }
    if (v.dateVente >= debutMois) caMois += montant;
    else if (v.dateVente >= debutMoisPrecedent) caMoisPrecedent += montant;
    if (v.dateVente >= anneeEnCours.debut && v.dateVente < anneeEnCours.fin) {
      caAnnee += montant;
      if (marge !== null) beneficeAnnee += marge;
      nbVentesAnnee += 1;
    }
    if (v.clientId) mesClients.add(v.clientId);

    /* Commission calculée vente par vente, comme sur la fiche que consulte le
       directeur : un total obtenu autrement ne coïnciderait pas avec le détail,
       et c'est le commercial qui aurait à s'expliquer sur l'écart. */
    const part = marge === null ? null : commissionDe(marge, v.nature, taux);
    if (part !== null) {
      commissionsAttendues += part;
      if (v.commissionVerseeLe) commissionsRecues += part;
    } else {
      ventesSansCout += 1;
    }

    const cle = `${v.dateVente.getFullYear()}-${String(v.dateVente.getMonth() + 1).padStart(2, "0")}`;
    const i = indexMois.get(cle);
    if (i !== undefined) {
      parMois[i].ca += montant;
      if (marge !== null) parMois[i].benefice += marge;
      parMois[i].nbVentes += 1;
    }

    detail.push({
      id: v.id,
      dateVente: v.dateVente,
      clientNom: v.clientNom,
      produit: v.produit,
      referenceCommande: v.referenceCommande,
      quantite: v.quantite,
      montant: Math.round(montant),
      benefice: marge === null ? null : Math.round(marge),
      commission: part,
      /* Réglée ou non, ligne à ligne : c'est ce qui rend vérifiable l'écart
         entre « reçu » et « attendu » affiché en haut de page. Un total qu'on
         ne peut pas décomposer ne se conteste pas, et une commission se
         conteste. */
      commissionVerseeLe: v.commissionVerseeLe,
    });
  }

  /* --- Classement --------------------------------------------------------- */
  const perfs = new Map<string, Perf>(
    equipe.map((e) => [e.id, { id: e.id, ca: 0, caEvalue: 0, benefice: 0, nbVentes: 0 }])
  );
  for (const v of ventesEquipe) {
    const p = perfs.get(v.vendeurId!);
    if (!p) continue; // vendeur inactif ou d'un autre rôle : hors classement
    const montant = montantDe(v);
    const marge = margeDe(v);
    p.ca += montant;
    if (marge !== null) {
      p.caEvalue += montant;
      p.benefice += marge;
    }
    p.nbVentes += 1;
  }

  const membres = [...perfs.values()];
  const parCa = membres.map((p) => ({ id: p.id, score: p.ca })).sort((a, b) => b.score - a.score);
  /* Rentabilité = taux de marge, pas bénéfice absolu : sinon « rentabilité »
     ne dirait rien de plus que le chiffre d'affaires et le classement combiné
     mesurerait deux fois la même chose. Sans vente, la marge n'existe pas, et
     un taux de 0 la placerait devant quelqu'un qui vend à faible marge. */
  const parMarge = membres
    /* Le taux se mesure sur ce qui est chiffré. Quelqu'un dont aucune vente
       n'a encore reçu son coût n'a pas un taux de zéro, il n'en a pas. */
    .map((p) => ({ id: p.id, score: p.caEvalue > 0 ? p.benefice / p.caEvalue : -1 }))
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
    /* L'indicateur de tête : où en est l'année par rapport à l'engagement.
       « cible null » dit qu'aucun objectif n'a été posé, ce qui n'est pas la
       même chose qu'un objectif à zéro et appelle une autre réaction. */
    objectifAnnuel: {
      annee: anneeEnCours.debut.getFullYear(),
      cible: objectifRetenu?.cibleCaXAF === undefined || objectifRetenu?.cibleCaXAF === null
        ? null
        : Math.round(Number(objectifRetenu.cibleCaXAF)),
      realise: Math.round(caAnnee),
      benefice: Math.round(beneficeAnnee),
      nbVentes: nbVentesAnnee,
      /* Part de l'année écoulée : un taux de complétion ne se juge que
         comparé au temps consommé. */
      partEcoulee: Math.round(partEcoulee(anneeEnCours) * 100),
      source: compte.objectifsPersonnels ? "PERSONNEL" : "ENCADREMENT",
      definiParNom: objectifRetenu?.definiParNom ?? null,
    },
    chiffreAffaires: {
      total: Math.round(ca),
      benefice: Math.round(benefice),
      /* Sur l'assiette chiffrée, pas sur le chiffre d'affaires total. */
      margePct: caEvalue > 0 ? Math.round((benefice / caEvalue) * 100) : null,
      nbVentes: mesVentes.length,
      /* Ce qui attend encore son prix d'achat. Le dire évite qu'un commercial
         croie sa marge en baisse alors qu'elle n'est pas encore calculée. */
      ventesSansCout,
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
      /* Le barème part toujours avec les montants : un taux dépend désormais
         de ce qui est vendu, et un chiffre affiché seul ne permettrait plus
         de refaire le calcul. */
      bareme: BAREME_PCT,
      /* Non nul quand un taux a été négocié pour ce compte, auquel cas il
         remplace le barème. L'interface le dit, parce que « 3 % parce que
         c'est la règle » et « 3 % parce qu'on me l'a accordé » ne se
         renégocient pas de la même façon. */
      tauxNegociePct: taux === null || taux === undefined ? null : Number(taux),
      attendu: Math.round(commissionsAttendues),
      /* Des commissions restent à déterminer tant que des coûts manquent : le
         montant attendu n'est donc pas encore le montant final. */
      ventesSansCout,
      recu: Math.round(commissionsRecues),
      nbVentesReglees: mesVentes.filter((v) => v.commissionVerseeLe !== null).length,
    },
    parMois: parMois.map((m) => ({ ...m, ca: Math.round(m.ca), benefice: Math.round(m.benefice) })),
    ventes: detail,
  });
});

/* ==========================================================================
   Activité commerciale détaillée
   ========================================================================== */

const PERIODES_ACTIVITE = ["MOIS", "TRIMESTRE", "SEMESTRE", "ANNEE"] as const;
type PeriodeActivite = (typeof PERIODES_ACTIVITE)[number];

/**
 * Tout ce qu'il y a à dire de l'activité d'une période.
 *
 * Un taux de complétion seul ne se discute pas : on veut savoir ce qui l'a
 * produit, ce qui manque, et si la période précédente faisait mieux. Cette
 * route répond en une fois, parce que ces chiffres se lisent ensemble et que
 * les répartir sur quatre appels ferait clignoter la page à chaque filtre.
 */
commercialRouter.get("/activite", async (req, res) => {
  const moi = req.utilisateur!;
  const periode = (PERIODES_ACTIVITE as readonly string[]).includes(String(req.query.periode))
    ? (req.query.periode as PeriodeActivite)
    : "ANNEE";

  const reference = new Date();
  const courante = fenetreDe(periode, reference);
  /* Période précédente de même longueur : comparer un trimestre à l'année
     entière ne dirait rien, et c'est pourtant l'erreur facile. */
  const precedenteRef = new Date(courante.debut);
  precedenteRef.setDate(precedenteRef.getDate() - 1);
  const precedente = fenetreDe(periode, precedenteRef);

  const compte = await prisma.utilisateur.findUnique({
    where: { id: moi.id },
    select: { tauxCommissionPct: true, objectifsPersonnels: true },
  });
  if (!compte) return res.status(404).json({ error: "Compte introuvable." });

  const [ventes, objectifs] = await Promise.all([
    prisma.vente.findMany({
      where: { vendeurId: moi.id, dateVente: { gte: precedente.debut, lt: courante.fin } },
      orderBy: { dateVente: "desc" },
      select: {
        id: true,
        dateVente: true,
        clientId: true,
        clientNom: true,
        produit: true,
        nature: true,
        referenceCommande: true,
        quantite: true,
        prixAchat: true,
        prixVente: true,
        commissionVerseeLe: true,
      },
    }),
    prisma.objectifCommercial.findMany({
      where: {
        utilisateurId: moi.id,
        periode,
        debut: new Date(
          Date.UTC(courante.debut.getFullYear(), courante.debut.getMonth(), courante.debut.getDate())
        ),
      },
      select: { cibleCaXAF: true, cibleVentes: true, fixeParEncadrement: true, titre: true, definiParNom: true },
    }),
  ]);

  const sourceEncadrement = !compte.objectifsPersonnels;
  const objectif = objectifs.find((o) => o.fixeParEncadrement === sourceEncadrement) ?? null;

  const vide = cumulVide;

  const courant = vide();
  const avant = vide();
  const parProduit = new Map<string, Cumul>();
  const parClient = new Map<string, Cumul & { nom: string }>();
  const parMois = new Map<string, { ca: number; benefice: number; nbVentes: number }>();
  const clients = new Set<string>();
  let commissions = 0;

  /* Les mois de la période sont créés vides avant d'être remplis : partir des
     ventes laisserait les mois creux hors du graphique, et une courbe qui
     saute les creux raconte une progression qui n'a pas eu lieu. */
  for (const d = new Date(courante.debut); d < courante.fin; d.setMonth(d.getMonth() + 1)) {
    parMois.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, {
      ca: 0,
      benefice: 0,
      nbVentes: 0,
    });
  }

  const dernieres: {
    id: string;
    dateVente: Date;
    clientNom: string;
    produit: string;
    referenceCommande: string | null;
    quantite: number;
    montant: number;
    /* Null tant que le coût manque : l'interface écrit alors « à chiffrer »
       plutôt qu'un zéro qui passerait pour une vente sans marge. */
    benefice: number | null;
    commission: number | null;
    commissionVerseeLe: Date | null;
  }[] = [];

  for (const v of ventes) {
    const montant = montantDe(v);
    /* Null tant que le prix d'achat n'a pas été renseigné : la vente compte
       alors dans le chiffre d'affaires, jamais dans la marge. Le cumul range
       lui-même ce qui est chiffré de ce qui ne l'est pas. */
    const marge = margeDe(v);
    const dansLaPeriode = v.dateVente >= courante.debut;

    ajouter(dansLaPeriode ? courant : avant, v);

    if (!dansLaPeriode) continue;

    if (marge !== null) commissions += commissionDe(marge, v.nature, compte.tauxCommissionPct);
    if (v.clientId) clients.add(v.clientId);

    ajouter(parProduit.get(v.produit) ?? parProduit.set(v.produit, vide()).get(v.produit)!, v);

    const cleClient = v.clientId ?? `nom:${v.clientNom}`;
    const c = parClient.get(cleClient) ?? { ...vide(), nom: v.clientNom };
    ajouter(c, v);
    parClient.set(cleClient, c);

    const mois = `${v.dateVente.getFullYear()}-${String(v.dateVente.getMonth() + 1).padStart(2, "0")}`;
    const m = parMois.get(mois);
    if (m) {
      m.ca += montant;
      if (marge !== null) m.benefice += marge;
      m.nbVentes += 1;
    }

    dernieres.push({
      id: v.id,
      dateVente: v.dateVente,
      clientNom: v.clientNom,
      produit: v.produit,
      referenceCommande: v.referenceCommande,
      quantite: v.quantite,
      montant: Math.round(montant),
      benefice: marge === null ? null : Math.round(marge),
      commission: marge === null ? null : commissionDe(marge, v.nature, compte.tauxCommissionPct),
      commissionVerseeLe: v.commissionVerseeLe,
    });
  }

  const arrondir = (c: Cumul) => ({
    ...c,
    ca: Math.round(c.ca),
    benefice: Math.round(c.benefice),
  });

  res.json({
    periode,
    debut: courante.debut,
    fin: courante.fin,
    partEcoulee: Math.round(partEcoulee(courante) * 100),
    objectif: objectif
      ? {
          titre: objectif.titre,
          definiParNom: objectif.definiParNom,
          source: sourceEncadrement ? "ENCADREMENT" : "PERSONNEL",
          cibleCaXAF: objectif.cibleCaXAF === null ? null : Math.round(Number(objectif.cibleCaXAF)),
          cibleVentes: objectif.cibleVentes,
        }
      : null,
    courant: {
      ...arrondir(courant),
      margePct: margePct(courant),
      /* Panier moyen : deux commerciaux au même chiffre n'ont pas le même
         métier selon qu'ils signent trois contrats ou trente. */
      panierMoyen: courant.nbVentes > 0 ? Math.round(courant.ca / courant.nbVentes) : 0,
      nbClients: clients.size,
      commissions: Math.round(commissions),
    },
    precedent: {
      ...arrondir(avant),
      margePct: margePct(avant),
      panierMoyen: avant.nbVentes > 0 ? Math.round(avant.ca / avant.nbVentes) : 0,
    },
    parMois: [...parMois.entries()]
      .map(([mois, m]) => ({ mois, ...m, ca: Math.round(m.ca), benefice: Math.round(m.benefice) }))
      .sort((a, b) => a.mois.localeCompare(b.mois)),
    parProduit: [...parProduit.entries()]
      .map(([produit, c]) => ({ produit, ...arrondir(c) }))
      .sort((a, b) => b.ca - a.ca),
    parClient: [...parClient.values()]
      .map((c) => ({ nom: c.nom, ...arrondir(c) }))
      .sort((a, b) => b.ca - a.ca),
    dernieresVentes: dernieres.slice(0, 10),
  });
});

/* ==========================================================================
   Détail du classement
   ========================================================================== */

/**
 * Comment le rang se construit, sans nommer personne.
 *
 * Un commercial a le droit de savoir où il se situe et de quoi dépend sa
 * place ; il n'a pas à connaître le chiffre d'affaires nominatif de ses
 * collègues, qui relève de l'encadrement. On renvoie donc des repères
 * agrégés : le premier, la moyenne, la médiane, et sa propre position sur
 * chacun des deux axes.
 */
commercialRouter.get("/classement", async (req, res) => {
  const moi = req.utilisateur!;

  const [equipe, ventesEquipe] = await Promise.all([
    prisma.utilisateur.findMany({
      where: { role: { in: [...ROLES_COMMERCIALE] }, actif: true },
      select: { id: true },
    }),
    prisma.vente.findMany({
      where: { vendeurId: { not: null } },
      select: { vendeurId: true, dateVente: true, prixAchat: true, prixVente: true, quantite: true },
    }),
  ]);

  const perfs = new Map<string, Perf>(
    equipe.map((e) => [e.id, { id: e.id, ca: 0, caEvalue: 0, benefice: 0, nbVentes: 0 }])
  );
  /* Rang mois par mois sur douze mois : une place isolée ne dit pas si l'on
     monte ou si l'on décroche, et c'est la tendance qui se discute. */
  const maintenant = new Date();
  const mois: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
    mois.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const caMensuel = new Map<string, Map<string, number>>(mois.map((m) => [m, new Map()]));

  for (const v of ventesEquipe) {
    const montant = montantDe(v);
    const marge = margeDe(v);
    const p = perfs.get(v.vendeurId!);
    if (!p) continue;
    p.ca += montant;
    if (marge !== null) {
      p.caEvalue += montant;
      p.benefice += marge;
    }
    p.nbVentes += 1;

    const cle = `${v.dateVente.getFullYear()}-${String(v.dateVente.getMonth() + 1).padStart(2, "0")}`;
    const duMois = caMensuel.get(cle);
    if (duMois) duMois.set(v.vendeurId!, (duMois.get(v.vendeurId!) ?? 0) + montant);
  }

  const membres = [...perfs.values()];
  const parCa = membres.map((p) => ({ id: p.id, score: p.ca })).sort((a, b) => b.score - a.score);
  const parMarge = membres
    /* Sur l'assiette chiffrée : sans coût renseigné, il n'y a pas de taux de
       marge, et un zéro placerait l'intéressé devant qui vend à faible marge. */
    .map((p) => ({ id: p.id, score: p.caEvalue > 0 ? p.benefice / p.caEvalue : -1 }))
    .sort((a, b) => b.score - a.score);
  const parCombine = membres
    .map((p) => ({
      id: p.id,
      score: (rangDe(parCa, p.id) ?? membres.length) + (rangDe(parMarge, p.id) ?? membres.length),
    }))
    .sort((a, b) => a.score - b.score);

  const moiPerf = perfs.get(moi.id) ?? { id: moi.id, ca: 0, caEvalue: 0, benefice: 0, nbVentes: 0 };
  const cas = parCa.map((c) => c.score);
  const mediane = cas.length === 0 ? 0 : cas[Math.floor(cas.length / 2)];

  res.json({
    rang: rangDe(parCombine, moi.id),
    rangChiffreAffaires: rangDe(parCa, moi.id),
    rangRentabilite: rangDe(parMarge, moi.id),
    effectif: membres.length,
    moi: {
      chiffreAffaires: Math.round(moiPerf.ca),
      benefice: Math.round(moiPerf.benefice),
      margePct: moiPerf.caEvalue > 0 ? Math.round((moiPerf.benefice / moiPerf.caEvalue) * 100) : null,
      nbVentes: moiPerf.nbVentes,
    },
    /* Repères anonymes : ils situent sans désigner. */
    equipe: {
      caPremier: Math.round(cas[0] ?? 0),
      caMoyen: Math.round(cas.reduce((s, c) => s + c, 0) / Math.max(1, cas.length)),
      caMedian: Math.round(mediane),
      margeMoyennePct:
        membres.reduce((s, p) => s + p.ca, 0) > 0
          ? Math.round(
              (membres.reduce((s, p) => s + p.benefice, 0) / membres.reduce((s, p) => s + p.ca, 0)) * 100
            )
          : null,
    },
    parMois: mois.map((m) => {
      const duMois = caMensuel.get(m)!;
      const classement = [...duMois.entries()].sort((a, b) => b[1] - a[1]);
      const index = classement.findIndex(([id]) => id === moi.id);
      return {
        mois: m,
        ca: Math.round(duMois.get(moi.id) ?? 0),
        /* Null quand on n'a rien vendu ce mois-là : se voir « dernier » parce
           qu'on était en congé n'apprend rien. */
        rang: index === -1 ? null : index + 1,
        classes: classement.length,
      };
    }),
  });
});

/* ==========================================================================
   Détail du portefeuille
   ========================================================================== */

/**
 * Les clients du portefeuille, et ce qu'ils ont rapporté.
 *
 * L'intérêt de l'écran n'est pas la liste, qui existe déjà sous l'onglet
 * Clients, mais la distinction entre ceux qui achètent et ceux qui dorment :
 * c'est là que se trouve le travail à venir.
 */
commercialRouter.get("/portefeuille", async (req, res) => {
  const moi = req.utilisateur!;

  const [possedes, ouverts, mesVentes] = await Promise.all([
    prisma.client.findMany({
      where: { proprietaireId: moi.id },
      select: { id: true, nom: true, pays: true, secteurActivite: true, createdAt: true },
    }),
    prisma.accesClient.findMany({
      where: { utilisateurId: moi.id },
      select: {
        client: { select: { id: true, nom: true, pays: true, secteurActivite: true, createdAt: true } },
      },
    }),
    prisma.vente.findMany({
      where: { vendeurId: moi.id },
      select: { clientId: true, clientNom: true, dateVente: true, prixAchat: true, prixVente: true, quantite: true },
    }),
  ]);

  type Ligne = {
    id: string | null;
    nom: string;
    pays: string | null;
    secteurActivite: string | null;
    origine: "PROPRIETAIRE" | "ACCES" | "VENTE";
    nbVentes: number;
    chiffreAffaires: number;
    benefice: number;
    derniereVente: Date | null;
  };

  const lignes = new Map<string, Ligne>();
  const poser = (c: { id: string; nom: string; pays: string | null; secteurActivite: string | null }, origine: Ligne["origine"]) => {
    if (lignes.has(c.id)) return;
    lignes.set(c.id, {
      id: c.id,
      nom: c.nom,
      pays: c.pays,
      secteurActivite: c.secteurActivite,
      origine,
      nbVentes: 0,
      chiffreAffaires: 0,
      benefice: 0,
      derniereVente: null,
    });
  };

  for (const c of possedes) poser(c, "PROPRIETAIRE");
  for (const a of ouverts) if (a.client) poser(a.client, "ACCES");

  for (const v of mesVentes) {
    /* Une vente sans fiche rattachée garde sa ligne, sous son nom : la retirer
       ferait disparaître du chiffre d'affaires déjà réalisé. */
    const cle = v.clientId ?? `nom:${v.clientNom}`;
    const ligne =
      lignes.get(cle) ??
      ({
        id: v.clientId,
        nom: v.clientNom,
        pays: null,
        secteurActivite: null,
        origine: "VENTE",
        nbVentes: 0,
        chiffreAffaires: 0,
        benefice: 0,
        derniereVente: null,
      } satisfies Ligne);
    ligne.nbVentes += 1;
    ligne.chiffreAffaires += montantDe(v);
    // Le bénéfice n'inclut que ce qui est chiffré ; le reste attend son coût.
    const marge = margeDe(v);
    if (marge !== null) ligne.benefice += marge;
    if (!ligne.derniereVente || v.dateVente > ligne.derniereVente) ligne.derniereVente = v.dateVente;
    lignes.set(cle, ligne);
  }

  const toutes = [...lignes.values()].map((l) => ({
    ...l,
    chiffreAffaires: Math.round(l.chiffreAffaires),
    benefice: Math.round(l.benefice),
  }));

  const servis = toutes.filter((l) => l.nbVentes > 0);
  res.json({
    total: toutes.length,
    avecVente: servis.length,
    couverturePct: toutes.length > 0 ? Math.round((servis.length / toutes.length) * 100) : null,
    chiffreAffaires: servis.reduce((s, l) => s + l.chiffreAffaires, 0),
    /* Les clients servis d'abord, du plus gros au plus petit ; les dormants
       ensuite, par ordre alphabétique faute de montant pour les départager. */
    clients: [
      ...servis.sort((a, b) => b.chiffreAffaires - a.chiffreAffaires),
      ...toutes.filter((l) => l.nbVentes === 0).sort((a, b) => a.nom.localeCompare(b.nom)),
    ],
  });
});

/* ==========================================================================
   Commissions
   ========================================================================== */

/**
 * Relevé de commissions du compte connecté.
 *
 * Une commission se conteste : la page doit donc permettre de refaire le
 * calcul, pas seulement d'en lire le total. On renvoie la règle appliquée, le
 * relevé mois par mois, et chaque vente avec sa part. Un montant global sans
 * justificatif n'est pas vérifiable, et ce qui n'est pas vérifiable finit par
 * être contesté de travers.
 *
 * Le regroupement se fait sur le mois de la VENTE, pas du versement : c'est
 * le travail du mois qui se discute, et une commission réglée en retard
 * appartient quand même au mois où elle a été gagnée.
 */
commercialRouter.get("/commissions", async (req, res) => {
  const moi = req.utilisateur!;

  const compte = await prisma.utilisateur.findUnique({
    where: { id: moi.id },
    select: { tauxCommissionPct: true },
  });
  if (!compte) return res.status(404).json({ error: "Compte introuvable." });

  const taux = compte.tauxCommissionPct;

  const ventes = await prisma.vente.findMany({
    where: { vendeurId: moi.id },
    orderBy: { dateVente: "desc" },
    select: {
      id: true,
      dateVente: true,
      clientNom: true,
      produit: true,
      nature: true,
      referenceCommande: true,
      quantite: true,
      prixAchat: true,
      prixVente: true,
      commissionVerseeLe: true,
    },
  });

  type Releve = {
    mois: string;
    nbVentes: number;
    chiffreAffaires: number;
    benefice: number;
    commission: number;
    verse: number;
    du: number;
    /** Lignes du mois encore sans coût, donc sans commission calculable. */
    sansCout: number;
    /** Date du dernier versement du mois, pour retrouver le paiement reçu. */
    dernierVersement: Date | null;
  };

  const parMois = new Map<string, Releve>();
  let benefice = 0;
  let attendu = 0;
  let recu = 0;
  /* Ventes dont le coût n'a pas encore été renseigné par la direction : leur
     commission n'est pas nulle, elle n'est pas encore calculable. Le dire est
     la seule façon d'expliquer un « attendu » qui va encore monter. */
  let sansCout = 0;

  /* Ce que chaque nature rapporte. Le commercial ne pilote pas son mix de
     vente s'il ne sait pas ce que le service lui a rapporté par rapport au
     matériel, et c'est précisément ce que la grille l'invite à arbitrer. */
  const parNature = new Map<NatureVente, { nbVentes: number; benefice: number; commission: number }>();

  const lignes = ventes.map((v) => {
    const montant = montantDe(v);
    /* Null tant que le prix d'achat manque. La ligne figure quand même au
       relevé, en attente : la masquer laisserait croire que la vente a été
       oubliée, alors que c'est son coût qui l'est. */
    const marge = margeDe(v);
    const part = marge === null ? null : commissionDe(marge, v.nature, taux);

    const n = parNature.get(v.nature) ?? { nbVentes: 0, benefice: 0, commission: 0 };
    n.nbVentes += 1;
    if (marge !== null && part !== null) {
      n.benefice += marge;
      n.commission += part;
      benefice += marge;
      attendu += part;
      if (v.commissionVerseeLe) recu += part;
    } else {
      sansCout += 1;
    }
    parNature.set(v.nature, n);

    const cle = `${v.dateVente.getFullYear()}-${String(v.dateVente.getMonth() + 1).padStart(2, "0")}`;
    const releve =
      parMois.get(cle) ??
      ({
        mois: cle,
        nbVentes: 0,
        chiffreAffaires: 0,
        benefice: 0,
        commission: 0,
        verse: 0,
        du: 0,
        sansCout: 0,
        dernierVersement: null,
      } satisfies Releve);
    releve.nbVentes += 1;
    releve.chiffreAffaires += montant;
    if (marge !== null && part !== null) {
      releve.benefice += marge;
      releve.commission += part;
      if (v.commissionVerseeLe) {
        releve.verse += part;
        if (!releve.dernierVersement || v.commissionVerseeLe > releve.dernierVersement) {
          releve.dernierVersement = v.commissionVerseeLe;
        }
      } else {
        releve.du += part;
      }
    } else {
      releve.sansCout += 1;
    }
    parMois.set(cle, releve);

    return {
      id: v.id,
      dateVente: v.dateVente,
      clientNom: v.clientNom,
      produit: v.produit,
      nature: v.nature,
      quantite: v.quantite,
      referenceCommande: v.referenceCommande,
      montant: Math.round(montant),
      benefice: marge === null ? null : Math.round(marge),
      commission: part,
      /* Le taux de la ligne voyage avec elle : sans lui, un relevé qui mêle
         3 % et 5 % devient impossible à recalculer de tête. */
      tauxPct: tauxEffectif(v.nature, taux),
      commissionVerseeLe: v.commissionVerseeLe,
    };
  });

  res.json({
    regle: {
      bareme: BAREME_PCT,
      tauxNegociePct: taux === null || taux === undefined ? null : Number(taux),
      /* L'assiette est rappelée explicitement : beaucoup de commerciaux
         attendent un pourcentage du chiffre d'affaires, et découvrir la base
         de calcul au moment de contester est le pire moment. */
      assiette: "BENEFICE" as const,
    },
    /* Ordre fixe, barème compris : les deux natures figurent toujours, même
       à zéro. Une grille dont une ligne disparaît faute de vente laisserait
       croire qu'elle ne s'applique pas. */
    parNature: (["MATERIEL", "SERVICE"] as const).map((nature) => {
      const n = parNature.get(nature) ?? { nbVentes: 0, benefice: 0, commission: 0 };
      return {
        nature,
        tauxPct: tauxEffectif(nature, taux),
        nbVentes: n.nbVentes,
        benefice: Math.round(n.benefice),
        commission: Math.round(n.commission),
      };
    }),
    totaux: {
      chiffreAffaires: Math.round(lignes.reduce((s, l) => s + l.montant, 0)),
      benefice: Math.round(benefice),
      attendu: Math.round(attendu),
      recu: Math.round(recu),
      reste: Math.round(attendu - recu),
      nbVentes: lignes.length,
      nbVentesReglees: lignes.filter((l) => l.commissionVerseeLe !== null).length,
      ventesSansCout: sansCout,
    },
    // Du mois le plus récent au plus ancien, comme la liste des ventes.
    parMois: [...parMois.values()]
      .sort((a, b) => b.mois.localeCompare(a.mois))
      .map((m) => ({
        ...m,
        chiffreAffaires: Math.round(m.chiffreAffaires),
        benefice: Math.round(m.benefice),
        commission: Math.round(m.commission),
        verse: Math.round(m.verse),
        du: Math.round(m.du),
      })),
    ventes: lignes,
  });
});

/* ==========================================================================
   Pipeline commercial
   ========================================================================== */

const SELECT_OPPORTUNITE = {
  id: true,
  titre: true,
  clientId: true,
  clientNom: true,
  etape: true,
  priorite: true,
  montantEstime: true,
  nature: true,
  description: true,
  clotureEstimeeLe: true,
  etapeDepuisLe: true,
  motifPerte: true,
  referenceCommande: true,
  ordre: true,
  updatedAt: true,
} as const;

type OpportuniteBrute = {
  montantEstime: unknown;
  etape: keyof typeof PROBABILITE_PCT;
  etapeDepuisLe: Date;
};

/** Ajoute ce qui se déduit de l'étape, pour que l'interface ne le recalcule pas. */
function enrichir<T extends OpportuniteBrute>(o: T) {
  const montant = Math.round(nb(o.montantEstime));
  return {
    ...o,
    montantEstime: montant,
    probabilitePct: PROBABILITE_PCT[o.etape],
    valeurPonderee: valeurPonderee(montant, o.etape),
    joursDansEtape: joursDansEtape(o.etapeDepuisLe),
    stagne: stagne(o.etape, o.etapeDepuisLe),
  };
}

/**
 * Le tableau du commercial connecté.
 *
 * Les affaires perdues ne sont pas renvoyées avec les colonnes : une colonne de
 * perdues se remplit sans fin et chasse de l'écran celles qui appellent une
 * action. Elles se demandent à part, quand on veut analyser les motifs.
 *
 * Les gagnées sont bornées à quatre-vingt-dix jours, pour la même raison : la
 * colonne doit montrer ce qui vient d'être conclu, pas l'historique complet.
 */
commercialRouter.get("/pipeline", async (req, res) => {
  const moi = req.utilisateur!;

  const borneGagnees = new Date();
  borneGagnees.setDate(borneGagnees.getDate() - 90);

  const opportunites = await prisma.opportunite.findMany({
    where: {
      commercialId: moi.id,
      OR: [
        { etape: { in: ["NOUVELLE", "QUALIFIEE", "DEVIS_ENVOYE", "NEGOCIATION"] } },
        { etape: "GAGNEE", clotureeLe: { gte: borneGagnees } },
      ],
    },
    orderBy: [{ ordre: "asc" }, { updatedAt: "desc" }],
    select: SELECT_OPPORTUNITE,
  });

  const enrichies = opportunites.map(enrichir);
  const ouvertes = enrichies.filter((o) => estOuverte(o.etape));

  res.json({
    colonnes: COLONNES.map((etape) => ({
      etape,
      probabilitePct: PROBABILITE_PCT[etape],
      opportunites: enrichies.filter((o) => o.etape === etape),
    })),
    totaux: {
      /* Le brut et le pondéré côte à côte : le premier dit ce qui est en jeu, le
         second ce qu'on peut raisonnablement attendre. Donner le brut seul
         promettrait ce qui n'arrivera pas. */
      nbOuvertes: ouvertes.length,
      montantOuvert: ouvertes.reduce((t, o) => t + o.montantEstime, 0),
      valeurPonderee: ouvertes.reduce((t, o) => t + o.valeurPonderee, 0),
      nbStagnantes: ouvertes.filter((o) => o.stagne).length,
    },
  });
});

/** Les affaires perdues, à part, avec leurs motifs. */
commercialRouter.get("/pipeline/perdues", async (req, res) => {
  const moi = req.utilisateur!;
  const perdues = await prisma.opportunite.findMany({
    where: { commercialId: moi.id, etape: "PERDUE" },
    orderBy: { clotureeLe: "desc" },
    take: 50,
    select: { ...SELECT_OPPORTUNITE, clotureeLe: true },
  });
  res.json({
    perdues: perdues.map((o) => ({ ...o, montantEstime: Math.round(nb(o.montantEstime)) })),
  });
});

/** Lit et valide ce qui est commun à la création et à la correction. */
/**
 * Jour calendaire, ramené à minuit UTC.
 *
 * Les colonnes `@db.Date` tronquent l'horodatage sur UTC : y écrire un minuit
 * local décalerait la date d'un jour à Douala, et une clôture prévue le 1er
 * tomberait au 30 du mois précédent.
 */
function jourCalendaire(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function lireCorpsOpportunite(corps: {
  titre?: string;
  montantEstime?: number;
  nature?: string;
  priorite?: string;
  description?: string;
  clotureEstimeeLe?: string | null;
}) {
  const titre = (corps.titre ?? "").trim();
  if (!titre) return { erreur: "L'intitulé de l'affaire est obligatoire." };
  if (titre.length > 120) return { erreur: "Cet intitulé est trop long." };

  const montantEstime = montantValide(corps.montantEstime);
  if (montantEstime === null) return { erreur: "Le montant estimé est invalide." };

  const nature = corps.nature === "SERVICE" ? "SERVICE" : "MATERIEL";
  const priorite =
    corps.priorite === "HAUTE" || corps.priorite === "BASSE" ? corps.priorite : "MOYENNE";

  let clotureEstimeeLe: Date | null = null;
  if (corps.clotureEstimeeLe) {
    const d = new Date(corps.clotureEstimeeLe);
    if (Number.isNaN(d.getTime())) return { erreur: "La date de clôture estimée est invalide." };
    clotureEstimeeLe = jourCalendaire(d);
  }

  return {
    donnees: {
      titre,
      montantEstime,
      nature: nature as "MATERIEL" | "SERVICE",
      priorite: priorite as "HAUTE" | "MOYENNE" | "BASSE",
      description: corps.description?.trim() || null,
      clotureEstimeeLe,
    },
  };
}

commercialRouter.post("/pipeline", async (req, res) => {
  const moi = req.utilisateur!;
  const corps = req.body as Parameters<typeof lireCorpsOpportunite>[0] & {
    clientId?: string | null;
    clientNom?: string;
  };

  const lu = lireCorpsOpportunite(corps);
  if ("erreur" in lu) return res.status(400).json({ error: lu.erreur });

  const clientNom = (corps.clientNom ?? "").trim();
  if (!clientNom) return res.status(400).json({ error: "Le client est obligatoire." });

  /* Le client doit être dans le périmètre, comme partout ailleurs : on ne suit
     pas une affaire chez quelqu'un dont on n'a pas la fiche. */
  let clientId: string | null = null;
  if (corps.clientId) {
    const perimetre = perimetreClients(moi);
    const existant = await prisma.client.findFirst({
      where: perimetre ? { AND: [{ id: corps.clientId }, perimetre] } : { id: corps.clientId },
      select: { id: true },
    });
    if (!existant) return res.status(404).json({ error: "Client introuvable dans votre périmètre." });
    clientId = existant.id;
  }

  /* En tête de la première colonne : une affaire qu'on vient de saisir est
     celle qu'on a en tête, elle ne doit pas apparaître en bas d'une pile. */
  const premiere = await prisma.opportunite.findFirst({
    where: { commercialId: moi.id, etape: "NOUVELLE" },
    orderBy: { ordre: "asc" },
    select: { ordre: true },
  });

  const creee = await prisma.opportunite.create({
    data: {
      ...lu.donnees,
      clientId,
      clientNom,
      commercialId: moi.id,
      commercialNom: moi.nomComplet,
      ordre: (premiere?.ordre ?? 0) - 1,
    },
    select: SELECT_OPPORTUNITE,
  });

  res.status(201).json(enrichir(creee));
});

commercialRouter.patch("/pipeline/:id", async (req, res) => {
  const moi = req.utilisateur!;
  const existante = await prisma.opportunite.findFirst({
    where: { id: req.params.id, commercialId: moi.id },
    select: { id: true },
  });
  // 404 et non 403 : on ne confirme pas l'existence de l'affaire d'un collègue.
  if (!existante) return res.status(404).json({ error: "Affaire introuvable." });

  const lu = lireCorpsOpportunite(req.body);
  if ("erreur" in lu) return res.status(400).json({ error: lu.erreur });

  const maj = await prisma.opportunite.update({
    where: { id: existante.id },
    data: lu.donnees,
    select: SELECT_OPPORTUNITE,
  });
  res.json(enrichir(maj));
});

/**
 * Déplace une affaire d'une colonne à l'autre.
 *
 * Geste à part de la correction complète, parce que c'est celui qu'on fait
 * vingt fois par semaine et qu'il doit coûter un glissement. Passer par la
 * correction obligerait à renvoyer tout le contenu de la carte, et la moindre
 * erreur de l'appelant écraserait ce qu'on ne voulait pas toucher.
 */
commercialRouter.patch("/pipeline/:id/etape", async (req, res) => {
  const moi = req.utilisateur!;
  const existante = await prisma.opportunite.findFirst({
    where: { id: req.params.id, commercialId: moi.id },
    select: { id: true, etape: true },
  });
  if (!existante) return res.status(404).json({ error: "Affaire introuvable." });

  const corps = req.body as { etape?: string; motifPerte?: string; referenceCommande?: string };
  const etape = corps.etape;
  const connues = ["NOUVELLE", "QUALIFIEE", "DEVIS_ENVOYE", "NEGOCIATION", "GAGNEE", "PERDUE"];
  if (!etape || !connues.includes(etape)) {
    return res.status(400).json({ error: "Étape inconnue." });
  }

  /* Une affaire perdue sans motif n'apprend rien, et c'est précisément ce
     qu'on voudra analyser dans six mois. On l'exige au moment où la raison est
     encore fraîche, pas plus tard. */
  const motifPerte = (corps.motifPerte ?? "").trim();
  if (etape === "PERDUE" && !motifPerte) {
    return res.status(400).json({ error: "Indiquez pourquoi l'affaire est perdue." });
  }

  const cloture = etape === "GAGNEE" || etape === "PERDUE";
  const maj = await prisma.opportunite.update({
    where: { id: existante.id },
    data: {
      etape: etape as "NOUVELLE",
      // Le compteur d'immobilité repart à chaque changement d'étape, et
      // seulement à ce moment : c'est l'avancement qu'il mesure.
      etapeDepuisLe: existante.etape === etape ? undefined : new Date(),
      clotureeLe: cloture ? new Date() : null,
      motifPerte: etape === "PERDUE" ? motifPerte : null,
      referenceCommande:
        etape === "GAGNEE" ? corps.referenceCommande?.trim() || null : null,
    },
    select: SELECT_OPPORTUNITE,
  });

  res.json(enrichir(maj));
});

commercialRouter.delete("/pipeline/:id", async (req, res) => {
  const moi = req.utilisateur!;
  const affaire = await prisma.opportunite.findFirst({
    where: { id: req.params.id, commercialId: moi.id },
    select: { id: true },
  });
  if (!affaire) return res.status(404).json({ error: "Affaire introuvable." });

  await prisma.opportunite.delete({ where: { id: affaire.id } });
  res.json({ ok: true });
});

/* ==========================================================================
   Saisie d'une vente
   ========================================================================== */

/**
 * Clients proposés pendant la frappe.
 *
 * Le périmètre du compte s'applique : un commercial ne doit pas découvrir le
 * portefeuille d'un collègue en tapant trois lettres dans un champ de saisie.
 * La suggestion est un confort, jamais une fuite.
 */
commercialRouter.get("/clients", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json({ clients: [] });

  const perimetre = perimetreClients(req.utilisateur!);
  const recherche: Prisma.ClientWhereInput = { nom: { contains: q, mode: "insensitive" } };

  const clients = await prisma.client.findMany({
    where: perimetre ? { AND: [recherche, perimetre] } : recherche,
    /* Court volontairement : une liste qu'il faut parcourir des yeux coûte
       plus de temps qu'elle n'en fait gagner. */
    take: 8,
    orderBy: { nom: "asc" },
    select: { id: true, nom: true, pays: true, secteurActivite: true },
  });

  res.json({ clients });
});

/**
 * Produits déjà vendus, avec leurs derniers prix connus.
 *
 * Le catalogue n'est pas modélisé et le champ reste du texte libre. Proposer
 * ce qui existe déjà évite que « Pare-feu Fortinet » et « Parefeu Fortinet »
 * deviennent deux produits dans les statistiques du directeur. Les prix
 * suivent pour épargner une recherche dans un ancien devis ; ils restent
 * modifiables, un tarif change.
 */
commercialRouter.get("/produits", async (_req, res) => {
  const ventes = await prisma.vente.findMany({
    orderBy: { dateVente: "desc" },
    select: { produit: true, nature: true, prixAchat: true, prixVente: true },
  });

  type Suggestion = { produit: string; nature: NatureVente; prixAchat: number; prixVente: number };
  const derniers = new Map<string, Suggestion>();
  for (const v of ventes) {
    if (derniers.has(v.produit)) continue; // la liste est déjà triée : la première vue est la plus récente
    /* La nature suit le produit : un pare-feu reste du matériel d'une vente à
       l'autre, et la reproposer évite qu'une même référence soit commissionnée
       à 3 % un mois et à 5 % le suivant selon l'attention du vendeur. */
    derniers.set(v.produit, {
      produit: v.produit,
      nature: v.nature,
      prixAchat: nb(v.prixAchat),
      prixVente: nb(v.prixVente),
    });
  }

  res.json({ produits: [...derniers.values()].sort((a, b) => a.produit.localeCompare(b.produit)) });
});

/** Montant positif, arrondi au franc : le XAF n'a pas de sous-unité en usage. */
function montantValide(valeur: unknown): number | null {
  const n = Number(valeur);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * Enregistre une commande validée, au nom du compte connecté.
 *
 * Chez EasyTech le devis part de Zoho ; quand le client le valide, il devient
 * un document ferme, et c'est ce document que cette route recopie. Trois
 * conséquences, toutes délibérées :
 *
 * La référence du document est exigée. C'est elle qui rattache la ligne à son
 * original, et qui permettra, le jour où une synchronisation automatique sera
 * branchée, de reconnaître ce qui est déjà en base au lieu de le recréer.
 *
 * Une commande porte plusieurs lignes, comme le document d'origine. Les
 * enregistrer séparément obligerait à ressaisir le client et la date autant
 * de fois, et priverait l'écran de tout moyen de les regrouper.
 *
 * Le prix d'achat n'est pas demandé : le commercial ne le connaît pas. Il est
 * renseigné ensuite par qui de droit, et la vente reste hors marge et hors
 * commission en attendant.
 *
 * Le vendeur n'est jamais lu dans la requête : il vient du jeton. Accepter un
 * identifiant de vendeur permettrait d'inscrire une vente au nom d'un
 * collègue, donc de déplacer son chiffre d'affaires et sa commission.
 */
commercialRouter.post("/ventes", async (req, res) => {
  const moi = req.utilisateur!;
  const corps = req.body as {
    clientId?: string | null;
    clientNom?: string;
    nouveauClient?: { pays?: string; secteurActivite?: string } | null;
    referenceCommande?: string;
    dateVente?: string;
    lignes?: { produit?: string; nature?: string; quantite?: number; prixVente?: number }[];
  };

  const referenceCommande = (corps.referenceCommande ?? "").trim();
  if (!referenceCommande) {
    return res.status(400).json({ error: "La référence du document Zoho est obligatoire." });
  }
  if (referenceCommande.length > 60) {
    return res.status(400).json({ error: "Cette référence est trop longue." });
  }

  const clientNom = (corps.clientNom ?? "").trim();
  if (!clientNom) return res.status(400).json({ error: "Le client est obligatoire." });

  const brutes = Array.isArray(corps.lignes) ? corps.lignes : [];
  if (brutes.length === 0) {
    return res.status(400).json({ error: "Une commande comporte au moins une ligne." });
  }
  if (brutes.length > 50) {
    return res.status(400).json({ error: "Cette commande comporte trop de lignes." });
  }

  /* Toutes les lignes sont validées avant qu'aucune ne soit écrite : une
     commande à moitié enregistrée donnerait un chiffre d'affaires faux que
     personne ne penserait à vérifier. */
  const lignes: { produit: string; nature: NatureVente; quantite: number; prixVente: number }[] = [];
  for (const [i, l] of brutes.entries()) {
    const produit = (l.produit ?? "").trim();
    if (!produit) {
      return res.status(400).json({ error: `Ligne ${i + 1} : le produit ou service est obligatoire.` });
    }
    /* La nature est exigée, pas devinée. Elle fixe le taux de commission, et
       une valeur par défaut silencieuse ferait payer à l'entreprise, ou au
       commercial, une inattention de saisie. */
    const nature = l.nature === "MATERIEL" || l.nature === "SERVICE" ? l.nature : null;
    if (!nature) {
      return res.status(400).json({ error: `Ligne ${i + 1} : précisez matériel ou service.` });
    }
    const quantite = Number(l.quantite);
    if (!Number.isInteger(quantite) || quantite < 1) {
      return res.status(400).json({ error: `Ligne ${i + 1} : la quantité doit être un entier d'au moins 1.` });
    }
    const prixVente = montantValide(l.prixVente);
    if (prixVente === null) {
      return res.status(400).json({ error: `Ligne ${i + 1} : le prix de vente est invalide.` });
    }
    lignes.push({ produit, nature, quantite, prixVente });
  }

  const dateVente = corps.dateVente ? new Date(corps.dateVente) : new Date();
  if (Number.isNaN(dateVente.getTime())) {
    return res.status(400).json({ error: "La date est invalide." });
  }
  /* Une commande datée dans l'avenir gonflerait le mois en cours et fausserait
     la comparaison mois à mois affichée partout. On refuse plutôt que de
     corriger en silence une date que l'utilisateur croit avoir saisie. */
  const finDuJour = new Date();
  finDuJour.setHours(23, 59, 59, 999);
  if (dateVente > finDuJour) {
    return res.status(400).json({ error: "Une commande ne peut pas être datée dans le futur." });
  }

  /* Référence déjà présente : on refuse, sur tout le système et pas seulement
     sur ses propres ventes. Deux fois le même document, c'est deux fois le
     même chiffre d'affaires, et plus personne ne sait lequel fait foi. */
  const deja = await prisma.vente.findFirst({
    where: { referenceCommande: { equals: referenceCommande, mode: "insensitive" } },
    select: { vendeurNom: true },
  });
  if (deja) {
    return res.status(409).json({
      error: `La référence ${referenceCommande} a déjà été enregistrée par ${deja.vendeurNom}.`,
    });
  }

  /* Rattachement du client. Sans identifiant, la vente garde un nom lisible
     mais sort du portefeuille et des ventilations par pays et par secteur :
     on crée donc la fiche quand le compte en a le droit, plutôt que de
     laisser une vente orpheline dégrader les statistiques. */
  let clientId: string | null = null;
  let clientCree = false;

  if (corps.clientId) {
    const perimetre = perimetreClients(moi);
    const existant = await prisma.client.findFirst({
      where: perimetre ? { AND: [{ id: corps.clientId }, perimetre] } : { id: corps.clientId },
      select: { id: true, nom: true },
    });
    if (!existant) return res.status(404).json({ error: "Client introuvable dans votre périmètre." });
    clientId = existant.id;
  } else if (corps.nouveauClient) {
    if (!peut(moi.role, "clients.creer")) {
      return res.status(403).json({ error: "Votre rôle ne permet pas de créer une fiche client." });
    }
    /* Même garde qu'à la création directe : une fiche déjà présente dans le
       système, fût-ce chez un collègue, ne doit pas en recevoir une seconde.
       La saisie s'arrête ici, le temps qu'un responsable rattache la fiche.
       C'est une gêne assumée : deux fiches jumelles coûtent plus cher à
       réconcilier plus tard qu'une commande saisie demain. */
    const doublon = await chercherDoublon(clientNom, null, moi);
    if (doublon) {
      return res.status(409).json({
        error: doublon.visible
          ? "Un client portant ce nom existe déjà dans votre portefeuille : choisissez-le dans la liste des suggestions."
          : "Un client portant ce nom existe déjà dans le système, hors de votre portefeuille. Demandez à votre responsable de vous en ouvrir l'accès.",
        nomExistant: doublon.nom,
      });
    }
    const cree = await prisma.client.create({
      data: {
        nom: clientNom,
        pays: corps.nouveauClient.pays?.trim() || null,
        secteurActivite: corps.nouveauClient.secteurActivite?.trim() || null,
        // Celui qui l'apporte en devient responsable : sans cela la fiche
        // n'entrerait dans le portefeuille de personne.
        proprietaireId: moi.id,
      },
      select: { id: true },
    });
    clientId = cree.id;
    clientCree = true;
  }

  await prisma.vente.createMany({
    data: lignes.map((l) => ({
      clientId,
      clientNom,
      vendeurId: moi.id,
      vendeurNom: moi.nomComplet,
      referenceCommande,
      produit: l.produit,
      nature: l.nature,
      quantite: l.quantite,
      prixVente: l.prixVente,
      // Pas de prixAchat : il est renseigné ensuite par la direction.
      dateVente,
      // Jamais « estDemo » : une commande saisie à la main est une vraie
      // commande, et le nettoyage du jeu de démonstration ne doit pas
      // l'emporter.
    })),
  });

  const montant = lignes.reduce((t, l) => t + l.prixVente * l.quantite, 0);

  res.status(201).json({
    referenceCommande,
    nbLignes: lignes.length,
    montant: Math.round(montant),
    clientCree,
  });
});

/** Annule une vente saisie par erreur, à condition qu'elle soit la sienne. */
commercialRouter.delete("/ventes/:id", async (req, res) => {
  const moi = req.utilisateur!;
  const vente = await prisma.vente.findFirst({
    where: { id: req.params.id, vendeurId: moi.id },
    select: { id: true, commissionVerseeLe: true },
  });

  /* 404 et non 403 : on ne confirme pas l'existence d'une vente qui
     appartient à quelqu'un d'autre. */
  if (!vente) return res.status(404).json({ error: "Vente introuvable." });

  /* Une commission déjà versée a quitté le CRM : effacer la vente ferait
     disparaître la justification d'un paiement réel. La correction passe alors
     par un responsable. */
  if (vente.commissionVerseeLe) {
    return res.status(409).json({
      error: "Cette vente a déjà donné lieu au versement d'une commission, elle ne peut plus être supprimée.",
    });
  }

  await prisma.vente.delete({ where: { id: vente.id } });
  res.json({ ok: true });
});
