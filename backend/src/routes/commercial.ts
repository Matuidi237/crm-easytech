import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { commissionDe, tauxEffectif } from "../lib/commissions.js";
import { peut, perimetreClients } from "../lib/permissions.js";
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
    const montant = nb(v.prixVente) * v.quantite;
    const marge = (nb(v.prixVente) - nb(v.prixAchat)) * v.quantite;
    ca += montant;
    benefice += marge;
    if (v.dateVente >= debutMois) caMois += montant;
    else if (v.dateVente >= debutMoisPrecedent) caMoisPrecedent += montant;
    if (v.dateVente >= anneeEnCours.debut && v.dateVente < anneeEnCours.fin) {
      caAnnee += montant;
      beneficeAnnee += marge;
      nbVentesAnnee += 1;
    }
    if (v.clientId) mesClients.add(v.clientId);

    /* Commission calculée vente par vente, comme sur la fiche que consulte le
       directeur : un total obtenu autrement ne coïnciderait pas avec le détail,
       et c'est le commercial qui aurait à s'expliquer sur l'écart. */
    const part = commissionDe(marge, taux);
    commissionsAttendues += part;
    if (v.commissionVerseeLe) commissionsRecues += part;

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
      /* Le taux renvoyé est celui qui s'applique vraiment, taux maison
         compris : afficher « non défini » à côté d'un montant calculé
         laisserait croire à une erreur. */
      tauxPct: tauxEffectif(taux),
      /* Vrai quand le taux a été négocié pour ce compte. L'interface le dit,
         parce que « 3 % parce que c'est la règle » et « 3 % parce qu'on me
         l'a accordé » ne se renégocient pas de la même façon. */
      tauxNegocie: taux !== null && taux !== undefined,
      attendu: Math.round(commissionsAttendues),
      recu: Math.round(commissionsRecues),
      nbVentesReglees: mesVentes.filter((v) => v.commissionVerseeLe !== null).length,
    },
    parMois: parMois.map((m) => ({ ...m, ca: Math.round(m.ca), benefice: Math.round(m.benefice) })),
    ventes: detail,
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

  const perfs = new Map<string, Perf>(equipe.map((e) => [e.id, { id: e.id, ca: 0, benefice: 0, nbVentes: 0 }]));
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
    const montant = nb(v.prixVente) * v.quantite;
    const marge = (nb(v.prixVente) - nb(v.prixAchat)) * v.quantite;
    const p = perfs.get(v.vendeurId!);
    if (!p) continue;
    p.ca += montant;
    p.benefice += marge;
    p.nbVentes += 1;

    const cle = `${v.dateVente.getFullYear()}-${String(v.dateVente.getMonth() + 1).padStart(2, "0")}`;
    const duMois = caMensuel.get(cle);
    if (duMois) duMois.set(v.vendeurId!, (duMois.get(v.vendeurId!) ?? 0) + montant);
  }

  const membres = [...perfs.values()];
  const parCa = membres.map((p) => ({ id: p.id, score: p.ca })).sort((a, b) => b.score - a.score);
  const parMarge = membres
    .map((p) => ({ id: p.id, score: p.ca > 0 ? p.benefice / p.ca : -1 }))
    .sort((a, b) => b.score - a.score);
  const parCombine = membres
    .map((p) => ({
      id: p.id,
      score: (rangDe(parCa, p.id) ?? membres.length) + (rangDe(parMarge, p.id) ?? membres.length),
    }))
    .sort((a, b) => a.score - b.score);

  const moiPerf = perfs.get(moi.id) ?? { id: moi.id, ca: 0, benefice: 0, nbVentes: 0 };
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
      margePct: moiPerf.ca > 0 ? Math.round((moiPerf.benefice / moiPerf.ca) * 100) : null,
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
    ligne.chiffreAffaires += nb(v.prixVente) * v.quantite;
    ligne.benefice += (nb(v.prixVente) - nb(v.prixAchat)) * v.quantite;
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
    /** Date du dernier versement du mois, pour retrouver le paiement reçu. */
    dernierVersement: Date | null;
  };

  const parMois = new Map<string, Releve>();
  let benefice = 0;
  let attendu = 0;
  let recu = 0;

  const lignes = ventes.map((v) => {
    const montant = nb(v.prixVente) * v.quantite;
    const marge = (nb(v.prixVente) - nb(v.prixAchat)) * v.quantite;
    const part = commissionDe(marge, taux);

    benefice += marge;
    attendu += part;
    if (v.commissionVerseeLe) recu += part;

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
        dernierVersement: null,
      } satisfies Releve);
    releve.nbVentes += 1;
    releve.chiffreAffaires += montant;
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
    parMois.set(cle, releve);

    return {
      id: v.id,
      dateVente: v.dateVente,
      clientNom: v.clientNom,
      produit: v.produit,
      quantite: v.quantite,
      montant: Math.round(montant),
      benefice: Math.round(marge),
      commission: part,
      commissionVerseeLe: v.commissionVerseeLe,
    };
  });

  res.json({
    regle: {
      tauxPct: tauxEffectif(taux),
      tauxNegocie: taux !== null && taux !== undefined,
      /* L'assiette est rappelée explicitement : beaucoup de commerciaux
         attendent un pourcentage du chiffre d'affaires, et découvrir la base
         de calcul au moment de contester est le pire moment. */
      assiette: "BENEFICE" as const,
    },
    totaux: {
      chiffreAffaires: Math.round(lignes.reduce((s, l) => s + l.montant, 0)),
      benefice: Math.round(benefice),
      attendu: Math.round(attendu),
      recu: Math.round(recu),
      reste: Math.round(attendu - recu),
      nbVentes: lignes.length,
      nbVentesReglees: lignes.filter((l) => l.commissionVerseeLe !== null).length,
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
    select: { produit: true, prixAchat: true, prixVente: true },
  });

  const derniers = new Map<string, { produit: string; prixAchat: number; prixVente: number }>();
  for (const v of ventes) {
    if (derniers.has(v.produit)) continue; // la liste est déjà triée : la première vue est la plus récente
    derniers.set(v.produit, { produit: v.produit, prixAchat: nb(v.prixAchat), prixVente: nb(v.prixVente) });
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
 * Enregistre une vente au nom du compte connecté.
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
    produit?: string;
    quantite?: number;
    prixAchat?: number;
    prixVente?: number;
    dateVente?: string;
  };

  const produit = (corps.produit ?? "").trim();
  const clientNom = (corps.clientNom ?? "").trim();
  if (!clientNom) return res.status(400).json({ error: "Le client est obligatoire." });
  if (!produit) return res.status(400).json({ error: "Le produit ou service est obligatoire." });

  const quantite = Number(corps.quantite);
  if (!Number.isInteger(quantite) || quantite < 1) {
    return res.status(400).json({ error: "La quantité doit être un entier d'au moins 1." });
  }

  const prixAchat = montantValide(corps.prixAchat);
  const prixVente = montantValide(corps.prixVente);
  if (prixAchat === null) return res.status(400).json({ error: "Le prix d'achat est invalide." });
  if (prixVente === null) return res.status(400).json({ error: "Le prix de vente est invalide." });

  const dateVente = corps.dateVente ? new Date(corps.dateVente) : new Date();
  if (Number.isNaN(dateVente.getTime())) {
    return res.status(400).json({ error: "La date de vente est invalide." });
  }
  /* Une vente datée dans l'avenir gonflerait le mois en cours et fausserait la
     comparaison mois à mois affichée partout. On refuse plutôt que de corriger
     en silence une date que l'utilisateur croit avoir saisie. */
  const finDuJour = new Date();
  finDuJour.setHours(23, 59, 59, 999);
  if (dateVente > finDuJour) {
    return res.status(400).json({ error: "Une vente ne peut pas être datée dans le futur." });
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

  const vente = await prisma.vente.create({
    data: {
      clientId,
      clientNom,
      vendeurId: moi.id,
      vendeurNom: moi.nomComplet,
      produit,
      quantite,
      prixAchat,
      prixVente,
      dateVente,
      // Jamais « estDemo » : une vente saisie à la main est une vraie vente,
      // et le nettoyage du jeu de démonstration ne doit pas l'emporter.
    },
    select: { id: true, produit: true, quantite: true, prixAchat: true, prixVente: true },
  });

  const montant = nb(vente.prixVente) * vente.quantite;
  const benefice = (nb(vente.prixVente) - nb(vente.prixAchat)) * vente.quantite;
  const compte = await prisma.utilisateur.findUnique({
    where: { id: moi.id },
    select: { tauxCommissionPct: true },
  });

  res.status(201).json({
    id: vente.id,
    montant: Math.round(montant),
    benefice: Math.round(benefice),
    commission: commissionDe(benefice, compte?.tauxCommissionPct),
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
