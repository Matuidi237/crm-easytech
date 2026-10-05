import { Router } from "express";
import type { PeriodeObjectif, TypeActivite } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { peut, perimetreClients } from "../lib/permissions.js";
import { debutDe, fenetreDe, minuit, partEcoulee } from "../lib/periodes.js";

export const planningRouter = Router();

/**
 * Feuille de temps et objectifs du compte connecté.
 *
 * Comme pour les autres routes du parcours commercial, l'identité vient du
 * jeton : personne ne pointe ni ne s'assigne d'objectif au nom d'un collègue
 * en changeant un paramètre.
 */

const nb = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

const ACTIVITES: TypeActivite[] = [
  "PROSPECTION",
  "RELANCE",
  "RENDEZ_VOUS",
  "DEMONSTRATION",
  "DEVIS",
  "NEGOCIATION",
  "SUIVI_CLIENT",
  "REUNION_INTERNE",
  "FORMATION",
  "DEPLACEMENT",
  "ADMINISTRATIF",
  "AUTRE",
];

const PERIODES: PeriodeObjectif[] = ["JOUR", "SEMAINE", "MOIS", "TRIMESTRE", "SEMESTRE", "ANNEE"];

/**
 * Lit une date d'URL, ou le jour même quand elle manque ou ne tient pas.
 *
 * « 2026-10-01 » est découpé à la main plutôt que confié à new Date() : ce
 * dernier interprète la forme courte en UTC, et le 1er octobre devient le 30
 * septembre pour tout fuseau situé à l'ouest de Greenwich.
 */
function dateDeRequete(valeur: unknown): Date {
  if (typeof valeur !== "string" || !valeur) return minuit(new Date());
  const court = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (court) return new Date(Number(court[1]), Number(court[2]) - 1, Number(court[3]));
  const d = new Date(valeur);
  return Number.isNaN(d.getTime()) ? minuit(new Date()) : minuit(d);
}

/**
 * Jour calendaire, ramené à minuit UTC.
 *
 * Les colonnes « jour » et « debut » sont de type DATE : PostgreSQL y tronque
 * l'horodatage sur UTC. Y écrire un minuit local décale la date d'un jour pour
 * tout fuseau à l'est de Greenwich, Douala compris, et un créneau du 1er
 * octobre se retrouve rangé au 30 septembre. On convertit donc explicitement,
 * à l'écriture comme à la lecture.
 */
function jourCalendaire(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/* ==========================================================================
   Feuille de temps
   ========================================================================== */

/**
 * Journée de référence, en minutes.
 *
 * Une seule valeur pour tout le monde faute d'accord individuel. Elle ne sert
 * qu'à situer une charge : « 28 h » ne dit pas si la semaine est pleine, « 28
 * de 35 » si. Aucun seuil n'est imposé, aucune alerte n'en découle. Le jour où
 * les contrats divergeront, ce nombre deviendra un champ du compte.
 */
const MINUTES_CIBLE_PAR_JOUR = 7 * 60;

/** Jours ouvrés d'une fenêtre : le samedi et le dimanche ne sont pas attendus. */
function joursOuvres(debut: Date, fin: Date): number {
  let n = 0;
  for (const d = new Date(debut); d < fin; d.setDate(d.getDate() + 1)) {
    const j = d.getDay();
    if (j !== 0 && j !== 6) n += 1;
  }
  return n;
}

/**
 * Feuille de temps sur la granularité demandée, du jour à l'année.
 *
 * On renvoie le détail ET les totaux : recalculer les cumuls côté interface
 * donnerait deux additions à maintenir, et c'est celle qui est fausse qu'on
 * finit par croire.
 *
 * Le détail des créneaux ne suit que sur le jour et la semaine. Au-delà, une
 * année de pointage représente plusieurs milliers de lignes que personne ne
 * lira : les périodes longues se regardent en agrégat, et le détail se
 * retrouve en redescendant d'un cran.
 */
planningRouter.get("/temps", async (req, res) => {
  const moi = req.utilisateur!;
  const periode = PERIODES.includes(req.query.periode as PeriodeObjectif)
    ? (req.query.periode as PeriodeObjectif)
    : "SEMAINE";
  /* « semaine » reste accepté pour ne pas casser un lien déjà en circulation
     pendant que l'interface bascule sur « date ». */
  const reference = dateDeRequete(req.query.date ?? req.query.semaine);
  const { debut, fin } = fenetreDe(periode, reference);
  const detaille = periode === "JOUR" || periode === "SEMAINE";

  const saisies = await prisma.saisieTemps.findMany({
    where: { utilisateurId: moi.id, jour: { gte: jourCalendaire(debut), lt: jourCalendaire(fin) } },
    orderBy: [{ jour: "asc" }, { debutMinutes: "asc" }],
    select: {
      id: true,
      jour: true,
      debutMinutes: true,
      finMinutes: true,
      activite: true,
      description: true,
      clientId: true,
      clientNom: true,
    },
  });

  const parJour = new Map<string, number>();
  const parActivite = new Map<TypeActivite, number>();
  const parMois = new Map<string, number>();
  const clientsTouches = new Set<string>();
  let total = 0;

  for (const s of saisies) {
    const minutes = s.finMinutes - s.debutMinutes;
    total += minutes;
    const cle = s.jour.toISOString().slice(0, 10);
    parJour.set(cle, (parJour.get(cle) ?? 0) + minutes);
    parMois.set(cle.slice(0, 7), (parMois.get(cle.slice(0, 7)) ?? 0) + minutes);
    parActivite.set(s.activite, (parActivite.get(s.activite) ?? 0) + minutes);
    if (s.clientNom) clientsTouches.add(s.clientNom);
  }

  /* Conformité : jours ouvrés où la cible est tenue, et jours où elle ne l'est
     pas tout en ayant été travaillés. Un jour à zéro n'est pas « sous
     l'objectif », il est non pointé, et les confondre accuserait à tort
     quiconque prend des congés. */
  const ouvres = joursOuvres(debut, fin);
  let joursTenus = 0;
  let joursSousCible = 0;
  for (const [, minutes] of parJour) {
    if (minutes >= MINUTES_CIBLE_PAR_JOUR) joursTenus += 1;
    else joursSousCible += 1;
  }

  res.json({
    periode,
    debut,
    fin,
    // Le détail n'accompagne que les fenêtres courtes.
    saisies: detaille ? saisies : [],
    detaille,
    totalMinutes: total,
    cibleMinutes: ouvres * MINUTES_CIBLE_PAR_JOUR,
    cibleParJourMinutes: MINUTES_CIBLE_PAR_JOUR,
    joursOuvres: ouvres,
    joursPointes: parJour.size,
    joursTenus,
    joursSousCible,
    nbCreneaux: saisies.length,
    nbClients: clientsTouches.size,
    parJour: Object.fromEntries(parJour),
    parMois: [...parMois.entries()].map(([mois, minutes]) => ({ mois, minutes })).sort((a, b) => a.mois.localeCompare(b.mois)),
    /* Trié du plus lourd au plus léger : la question posée à une feuille de
       temps est « où est passée ma semaine », pas « combien par catégorie
       dans l'ordre alphabétique ». */
    parActivite: [...parActivite.entries()]
      .map(([activite, minutes]) => ({ activite, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
  });
});

planningRouter.post("/temps", async (req, res) => {
  const moi = req.utilisateur!;
  const corps = req.body as {
    jour?: string;
    debutMinutes?: number;
    finMinutes?: number;
    activite?: TypeActivite;
    description?: string;
    clientId?: string | null;
  };

  if (!corps.jour) return res.status(400).json({ error: "La date est invalide." });
  const jourLocal = dateDeRequete(corps.jour);
  if (Number.isNaN(jourLocal.getTime())) {
    return res.status(400).json({ error: "La date est invalide." });
  }
  /* Pointer un jour à venir n'a pas de sens : une feuille de temps constate
     ce qui a été fait. Un planning prévisionnel, c'est l'autre onglet. */
  if (jourLocal > minuit(new Date())) {
    return res.status(400).json({ error: "On ne déclare pas du temps sur un jour à venir." });
  }
  const jour = jourCalendaire(jourLocal);

  const debutMinutes = Number(corps.debutMinutes);
  const finMinutes = Number(corps.finMinutes);
  const valide = (m: number) => Number.isInteger(m) && m >= 0 && m <= 24 * 60;
  if (!valide(debutMinutes) || !valide(finMinutes)) {
    return res.status(400).json({ error: "Les horaires sont invalides." });
  }
  if (finMinutes <= debutMinutes) {
    return res.status(400).json({ error: "L'heure de fin doit suivre l'heure de début." });
  }

  const activite = corps.activite;
  if (!activite || !ACTIVITES.includes(activite)) {
    return res.status(400).json({ error: "L'activité est obligatoire." });
  }

  /* Chevauchement refusé : deux créneaux superposés gonflent le total de la
     journée, et une feuille de temps qui annonce dix heures sur une journée
     de huit cesse d'être prise au sérieux. */
  const conflit = await prisma.saisieTemps.findFirst({
    where: {
      utilisateurId: moi.id,
      jour,
      debutMinutes: { lt: finMinutes },
      finMinutes: { gt: debutMinutes },
    },
    select: { id: true, debutMinutes: true, finMinutes: true },
  });
  if (conflit) {
    return res.status(409).json({
      error: "Ce créneau en recouvre un autre déjà déclaré ce jour-là.",
      debutMinutes: conflit.debutMinutes,
      finMinutes: conflit.finMinutes,
    });
  }

  let clientId: string | null = null;
  let clientNom: string | null = null;
  if (corps.clientId) {
    const perimetre = perimetreClients(moi);
    const client = await prisma.client.findFirst({
      where: perimetre ? { AND: [{ id: corps.clientId }, perimetre] } : { id: corps.clientId },
      select: { id: true, nom: true },
    });
    if (!client) return res.status(404).json({ error: "Client introuvable dans votre périmètre." });
    clientId = client.id;
    clientNom = client.nom;
  }

  const saisie = await prisma.saisieTemps.create({
    data: {
      utilisateurId: moi.id,
      jour,
      debutMinutes,
      finMinutes,
      activite,
      description: corps.description?.trim() || null,
      clientId,
      clientNom,
    },
  });

  res.status(201).json(saisie);
});

/**
 * Corrige un créneau déjà déclaré.
 *
 * Un horaire se saisit vite et se trompe autant : sans correction, la seule
 * issue est de supprimer puis de ressaisir, ce qui fait perdre la ligne quand
 * on est interrompu entre les deux.
 */
planningRouter.patch("/temps/:id", async (req, res) => {
  const moi = req.utilisateur!;
  const existant = await prisma.saisieTemps.findFirst({
    where: { id: req.params.id, utilisateurId: moi.id },
    select: { id: true, jour: true },
  });
  if (!existant) return res.status(404).json({ error: "Créneau introuvable." });

  const corps = req.body as {
    debutMinutes?: number;
    finMinutes?: number;
    activite?: TypeActivite;
    description?: string;
    clientId?: string | null;
  };

  const debutMinutes = Number(corps.debutMinutes);
  const finMinutes = Number(corps.finMinutes);
  const valide = (m: number) => Number.isInteger(m) && m >= 0 && m <= 24 * 60;
  if (!valide(debutMinutes) || !valide(finMinutes)) {
    return res.status(400).json({ error: "Les horaires sont invalides." });
  }
  if (finMinutes <= debutMinutes) {
    return res.status(400).json({ error: "L'heure de fin doit suivre l'heure de début." });
  }

  const activite = corps.activite;
  if (!activite || !ACTIVITES.includes(activite)) {
    return res.status(400).json({ error: "L'activité est obligatoire." });
  }

  // Même garde qu'à la création, en s'excluant soi-même de la comparaison.
  const conflit = await prisma.saisieTemps.findFirst({
    where: {
      utilisateurId: moi.id,
      jour: existant.jour,
      id: { not: existant.id },
      debutMinutes: { lt: finMinutes },
      finMinutes: { gt: debutMinutes },
    },
    select: { id: true },
  });
  if (conflit) {
    return res.status(409).json({ error: "Ce créneau en recouvre un autre déjà déclaré ce jour-là." });
  }

  let clientId: string | null = null;
  let clientNom: string | null = null;
  if (corps.clientId) {
    const perimetre = perimetreClients(moi);
    const client = await prisma.client.findFirst({
      where: perimetre ? { AND: [{ id: corps.clientId }, perimetre] } : { id: corps.clientId },
      select: { id: true, nom: true },
    });
    if (!client) return res.status(404).json({ error: "Client introuvable dans votre périmètre." });
    clientId = client.id;
    clientNom = client.nom;
  }

  const saisie = await prisma.saisieTemps.update({
    where: { id: existant.id },
    data: {
      debutMinutes,
      finMinutes,
      activite,
      description: corps.description?.trim() || null,
      clientId,
      clientNom,
    },
  });

  res.json(saisie);
});

planningRouter.delete("/temps/:id", async (req, res) => {
  const moi = req.utilisateur!;
  const saisie = await prisma.saisieTemps.findFirst({
    where: { id: req.params.id, utilisateurId: moi.id },
    select: { id: true },
  });
  // 404 et non 403 : on ne confirme pas l'existence du créneau d'un autre.
  if (!saisie) return res.status(404).json({ error: "Créneau introuvable." });

  await prisma.saisieTemps.delete({ where: { id: saisie.id } });
  res.json({ ok: true });
});

/* ==========================================================================
   Objectifs
   ========================================================================== */

/** Champs renvoyes pour un objectif, jalons compris. */
const SELECT_OBJECTIF = {
  id: true,
  titre: true,
  description: true,
  periode: true,
  debut: true,
  cibleCaXAF: true,
  cibleVentes: true,
  cibleRendezVous: true,
  fixeParEncadrement: true,
  definiParNom: true,
  note: true,
  jalons: {
    // Sans « as const » : Prisma attend un orderBy modifiable.
    orderBy: [{ echeance: "asc" as const }, { ordre: "asc" as const }],
    select: {
      id: true,
      libelle: true,
      unite: true,
      cible: true,
      realise: true,
      echeance: true,
      ordre: true,
    },
  },
};

type ObjectifBrut = {
  cibleCaXAF: unknown;
  /* Absents des reponses d ecriture, qui ne relisent pas la relation : le
     tableau vide y est plus honnete qu un champ manquant cote interface. */
  jalons?: { cible: unknown; realise: unknown }[];
};

/** Les Decimal de Prisma arrivent en objet : on les ramene a des nombres. */
function normaliserObjectif<T extends ObjectifBrut>(o: T) {
  return {
    ...o,
    cibleCaXAF: o.cibleCaXAF === null || o.cibleCaXAF === undefined ? null : Math.round(Number(o.cibleCaXAF)),
    jalons: (o.jalons ?? []).map((j) => ({ ...j, cible: Number(j.cible), realise: Number(j.realise) })),
  };
}


/**
 * Objectifs d'une période, avec ce qui a réellement été réalisé.
 *
 * Les deux jeux d'objectifs sont renvoyés, celui du responsable et le sien,
 * même quand un seul pilote le suivi : voir l'autre permet de comparer son
 * engagement à celui qu'on lui demande, et c'est précisément la conversation
 * que cet écran doit rendre possible.
 */
planningRouter.get("/objectifs", async (req, res) => {
  const moi = req.utilisateur!;
  const periode = PERIODES.includes(req.query.periode as PeriodeObjectif)
    ? (req.query.periode as PeriodeObjectif)
    : "MOIS";
  const reference = dateDeRequete(req.query.date);
  const { debut, fin } = fenetreDe(periode, reference);

  const compte = await prisma.utilisateur.findUnique({
    where: { id: moi.id },
    select: { objectifsPersonnels: true, responsable: { select: { nomComplet: true } } },
  });
  if (!compte) return res.status(404).json({ error: "Compte introuvable." });

  const [objectifs, ventes, rendezVous] = await Promise.all([
    prisma.objectifCommercial.findMany({
      where: { utilisateurId: moi.id, periode, debut: jourCalendaire(debut) },
      select: SELECT_OBJECTIF,
    }),
    prisma.vente.findMany({
      where: { vendeurId: moi.id, dateVente: { gte: debut, lt: fin } },
      select: { prixAchat: true, prixVente: true, quantite: true },
    }),
    /* Les rendez-vous se comptent dans la feuille de temps : c'est la seule
       trace dont dispose l'outil, et demander une seconde saisie pour le même
       fait produirait deux chiffres divergents. */
    prisma.saisieTemps.count({
      where: {
        utilisateurId: moi.id,
        jour: { gte: jourCalendaire(debut), lt: jourCalendaire(fin) },
        activite: { in: ["RENDEZ_VOUS", "DEMONSTRATION"] },
      },
    }),
  ]);

  let chiffreAffaires = 0;
  let benefice = 0;
  for (const v of ventes) {
    chiffreAffaires += nb(v.prixVente) * v.quantite;
    benefice += (nb(v.prixVente) - nb(v.prixAchat)) * v.quantite;
  }

  const normaliser = normaliserObjectif;

  res.json({
    periode,
    debut,
    fin,
    /* Part de la période écoulée : 40 % du chiffre au tiers du trimestre est
       une avance, le même chiffre la veille de la clôture est un échec. */
    partEcoulee: Math.round(partEcoulee({ debut, fin }) * 100),
    source: compte.objectifsPersonnels ? "PERSONNEL" : "ENCADREMENT",
    responsableNom: compte.responsable?.nomComplet ?? null,
    objectifEncadrement: objectifs.filter((o) => o.fixeParEncadrement).map(normaliser)[0] ?? null,
    objectifPersonnel: objectifs.filter((o) => !o.fixeParEncadrement).map(normaliser)[0] ?? null,
    realise: {
      chiffreAffaires: Math.round(chiffreAffaires),
      benefice: Math.round(benefice),
      nbVentes: ventes.length,
      nbRendezVous: rendezVous,
    },
  });
});

/**
 * Tous les objectifs à venir et récents, toutes granularités confondues.
 *
 * C'est la vue de pilotage : un objectif annuel, ses trimestres et ses mois
 * se lisent ensemble ou pas du tout. Les consulter un par un en changeant de
 * granularité oblige à tenir la hiérarchie de tête, ce qu'aucune feuille de
 * route ne demande à son lecteur.
 */
planningRouter.get("/objectifs/feuille-de-route", async (req, res) => {
  const moi = req.utilisateur!;

  const compte = await prisma.utilisateur.findUnique({
    where: { id: moi.id },
    select: { objectifsPersonnels: true, responsable: { select: { nomComplet: true } } },
  });
  if (!compte) return res.status(404).json({ error: "Compte introuvable." });

  /* Fenêtre de lecture : l'exercice en cours et le suivant. Remonter plus loin
     encombrerait la page d'engagements clos dont personne ne discute plus. */
  const anneeEnCours = fenetreDe("ANNEE", new Date());
  const borneBasse = jourCalendaire(anneeEnCours.debut);
  const borneHaute = jourCalendaire(new Date(anneeEnCours.fin.getFullYear() + 1, 0, 1));

  const objectifs = await prisma.objectifCommercial.findMany({
    where: { utilisateurId: moi.id, debut: { gte: borneBasse, lt: borneHaute } },
    orderBy: [{ debut: "asc" }, { periode: "asc" }],
    select: SELECT_OBJECTIF,
  });

  /* Une seule lecture des ventes de la fenêtre : chaque objectif y puise son
     réalisé. Une requête par objectif multiplierait les allers-retours pour
     recompter les mêmes lignes. */
  const [ventes, rendezVous] = await Promise.all([
    prisma.vente.findMany({
      where: { vendeurId: moi.id, dateVente: { gte: anneeEnCours.debut } },
      select: { dateVente: true, prixAchat: true, prixVente: true, quantite: true },
    }),
    prisma.saisieTemps.findMany({
      where: {
        utilisateurId: moi.id,
        jour: { gte: borneBasse },
        activite: { in: ["RENDEZ_VOUS", "DEMONSTRATION"] },
      },
      select: { jour: true },
    }),
  ]);

  const lignes = objectifs.map((o) => {
    const { fin } = fenetreDe(o.periode, new Date(o.debut.getFullYear(), o.debut.getMonth(), o.debut.getDate()));
    const debutLocal = new Date(o.debut.getFullYear(), o.debut.getMonth(), o.debut.getDate());

    let chiffreAffaires = 0;
    let benefice = 0;
    let nbVentes = 0;
    for (const v of ventes) {
      if (v.dateVente < debutLocal || v.dateVente >= fin) continue;
      chiffreAffaires += nb(v.prixVente) * v.quantite;
      benefice += (nb(v.prixVente) - nb(v.prixAchat)) * v.quantite;
      nbVentes += 1;
    }
    const nbRendezVous = rendezVous.filter(
      (r) => r.jour >= jourCalendaire(debutLocal) && r.jour < jourCalendaire(fin)
    ).length;

    const maintenant = new Date();
    /* L'état se déduit du calendrier et des chiffres, jamais d'une saisie :
       un statut qu'on coche à la main finit par contredire les montants
       affichés juste à côté. */
    const atteint =
      (o.cibleCaXAF === null || chiffreAffaires >= Number(o.cibleCaXAF)) &&
      (o.cibleVentes === null || nbVentes >= o.cibleVentes) &&
      (o.cibleRendezVous === null || nbRendezVous >= o.cibleRendezVous);
    const statut =
      atteint ? "ATTEINT" : maintenant < debutLocal ? "A_VENIR" : maintenant < fin ? "EN_COURS" : "MANQUE";

    return {
      ...normaliserObjectif(o),
      fin,
      statut,
      partEcoulee: Math.round(partEcoulee({ debut: debutLocal, fin }) * 100),
      realise: {
        chiffreAffaires: Math.round(chiffreAffaires),
        benefice: Math.round(benefice),
        nbVentes,
        nbRendezVous,
      },
    };
  });

  res.json({
    source: compte.objectifsPersonnels ? "PERSONNEL" : "ENCADREMENT",
    responsableNom: compte.responsable?.nomComplet ?? null,
    objectifs: lignes,
  });
});

/** Bascule entre le planning du responsable et le sien. */
planningRouter.patch("/objectifs/source", async (req, res) => {
  const personnel = (req.body as { personnel?: boolean }).personnel === true;
  await prisma.utilisateur.update({
    where: { id: req.utilisateur!.id },
    data: { objectifsPersonnels: personnel },
  });
  res.json({ source: personnel ? "PERSONNEL" : "ENCADREMENT" });
});

/**
 * Pose ou remplace un objectif.
 *
 * Un commercial ne crée que des objectifs personnels. Ceux de l'encadrement
 * passent par un compte qui gère des utilisateurs : sans cette séparation, un
 * objectif « fixé par le responsable » pourrait être réécrit par son
 * destinataire, et n'engagerait plus personne.
 */
planningRouter.post("/objectifs", async (req, res) => {
  const moi = req.utilisateur!;
  const corps = req.body as {
    titre?: string;
    description?: string;
    periode?: PeriodeObjectif;
    date?: string;
    cibleCaXAF?: number | null;
    cibleVentes?: number | null;
    cibleRendezVous?: number | null;
    note?: string;
    pourUtilisateurId?: string;
  };

  const periode = corps.periode;
  if (!periode || !PERIODES.includes(periode)) {
    return res.status(400).json({ error: "La période est invalide." });
  }
  const debut = jourCalendaire(debutDe(periode, dateDeRequete(corps.date)));

  const pourAutrui = !!corps.pourUtilisateurId && corps.pourUtilisateurId !== moi.id;
  if (pourAutrui && !peut(moi.role, "utilisateurs.gerer")) {
    return res.status(403).json({ error: "Votre rôle ne permet pas de fixer l'objectif d'un autre compte." });
  }
  const utilisateurId = pourAutrui ? corps.pourUtilisateurId! : moi.id;

  const entier = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : undefined;
  };
  const cibleVentes = entier(corps.cibleVentes);
  const cibleRendezVous = entier(corps.cibleRendezVous);
  const cibleCaXAF = entier(corps.cibleCaXAF);
  if (cibleVentes === undefined || cibleRendezVous === undefined || cibleCaXAF === undefined) {
    return res.status(400).json({ error: "Les cibles doivent être des nombres entiers positifs." });
  }
  /* Un objectif sans aucune cible n'engage à rien : on refuse plutôt que de
     laisser une ligne vide occuper la place d'un vrai engagement. */
  if (cibleCaXAF === null && cibleVentes === null && cibleRendezVous === null) {
    return res.status(400).json({ error: "Renseignez au moins une cible." });
  }

  const donnees = {
    titre: corps.titre?.trim() || null,
    description: corps.description?.trim() || null,
    cibleCaXAF,
    cibleVentes,
    cibleRendezVous,
    note: corps.note?.trim() || null,
    definiParNom: moi.nomComplet,
  };

  const objectif = await prisma.objectifCommercial.upsert({
    where: {
      utilisateurId_periode_debut_fixeParEncadrement: {
        utilisateurId,
        periode,
        debut,
        fixeParEncadrement: pourAutrui,
      },
    },
    update: donnees,
    create: { utilisateurId, periode, debut, fixeParEncadrement: pourAutrui, ...donnees },
  });

  res.status(201).json(normaliserObjectif(objectif));
});

/** Retire un objectif personnel. Ceux de l'encadrement ne se suppriment pas ici. */
planningRouter.delete("/objectifs/:id", async (req, res) => {
  const moi = req.utilisateur!;
  const objectif = await prisma.objectifCommercial.findFirst({
    where: { id: req.params.id, utilisateurId: moi.id },
    select: { id: true, fixeParEncadrement: true },
  });
  if (!objectif) return res.status(404).json({ error: "Objectif introuvable." });
  if (objectif.fixeParEncadrement) {
    return res.status(403).json({ error: "Cet objectif a été fixé par votre responsable." });
  }

  await prisma.objectifCommercial.delete({ where: { id: objectif.id } });
  res.json({ ok: true });
});


/* ==========================================================================
   Jalons
   ========================================================================== */

const UNITES = ["MONTANT", "NOMBRE", "BINAIRE"] as const;
type Unite = (typeof UNITES)[number];

/**
 * Objectif personnel du compte, prêt à recevoir un jalon.
 *
 * Les objectifs de l'encadrement sont écartés ici : laisser ajouter un jalon
 * à un engagement fixé par son responsable reviendrait à le réécrire par la
 * marge, alors qu'on ne peut pas le modifier de face.
 */
async function monObjectifModifiable(objectifId: string, utilisateurId: string) {
  return prisma.objectifCommercial.findFirst({
    where: { id: objectifId, utilisateurId, fixeParEncadrement: false },
    select: { id: true, periode: true, debut: true },
  });
}

planningRouter.post("/objectifs/:id/jalons", async (req, res) => {
  const moi = req.utilisateur!;
  const objectif = await monObjectifModifiable(req.params.id, moi.id);
  if (!objectif) {
    return res.status(404).json({ error: "Objectif introuvable ou non modifiable." });
  }

  const corps = req.body as { libelle?: string; unite?: Unite; cible?: number; echeance?: string };
  const libelle = (corps.libelle ?? "").trim();
  if (!libelle) return res.status(400).json({ error: "L'intitulé du jalon est obligatoire." });

  const unite: Unite = UNITES.includes(corps.unite as Unite) ? (corps.unite as Unite) : "NOMBRE";
  /* Un jalon binaire vaut 1 par construction : demander sa cible ouvrirait la
     porte à « 0 sur 3 », qui ne veut rien dire pour un fait accompli ou non. */
  const cible = unite === "BINAIRE" ? 1 : Number(corps.cible);
  if (!Number.isFinite(cible) || cible <= 0) {
    return res.status(400).json({ error: "La cible du jalon doit être un nombre positif." });
  }

  const echeance = dateDeRequete(corps.echeance);
  /* L'échéance doit tomber dans la fenêtre de l'objectif : un jalon daté après
     la clôture ne sera jamais tenu, et avant l'ouverture il est déjà passé. */
  const debutLocal = new Date(objectif.debut.getFullYear(), objectif.debut.getMonth(), objectif.debut.getDate());
  const { fin } = fenetreDe(objectif.periode, debutLocal);
  if (echeance < debutLocal || echeance >= fin) {
    return res.status(400).json({ error: "L'échéance doit tomber dans la période de l'objectif." });
  }

  const dernier = await prisma.jalonObjectif.findFirst({
    where: { objectifId: objectif.id },
    orderBy: { ordre: "desc" },
    select: { ordre: true },
  });

  const jalon = await prisma.jalonObjectif.create({
    data: {
      objectifId: objectif.id,
      libelle,
      unite,
      cible,
      echeance: jourCalendaire(echeance),
      ordre: (dernier?.ordre ?? -1) + 1,
    },
  });

  res.status(201).json({ ...jalon, cible: Number(jalon.cible), realise: Number(jalon.realise) });
});

/** Met à jour l'avancement déclaré d'un jalon. */
planningRouter.patch("/jalons/:id", async (req, res) => {
  const moi = req.utilisateur!;
  const jalon = await prisma.jalonObjectif.findFirst({
    where: { id: req.params.id, objectif: { utilisateurId: moi.id, fixeParEncadrement: false } },
    select: { id: true, cible: true, unite: true },
  });
  if (!jalon) return res.status(404).json({ error: "Jalon introuvable ou non modifiable." });

  const brut = (req.body as { realise?: number }).realise;
  const realise = Number(brut);
  if (!Number.isFinite(realise) || realise < 0) {
    return res.status(400).json({ error: "L'avancement doit être un nombre positif." });
  }
  /* Plafonné à la cible : dépasser son propre jalon de 300 % fausserait
     l'avancement global de l'objectif sans rien dire de plus qu'« atteint ». */
  const retenu = Math.min(realise, Number(jalon.cible));

  const maj = await prisma.jalonObjectif.update({
    where: { id: jalon.id },
    data: { realise: retenu },
  });

  res.json({ ...maj, cible: Number(maj.cible), realise: Number(maj.realise) });
});

planningRouter.delete("/jalons/:id", async (req, res) => {
  const moi = req.utilisateur!;
  const jalon = await prisma.jalonObjectif.findFirst({
    where: { id: req.params.id, objectif: { utilisateurId: moi.id, fixeParEncadrement: false } },
    select: { id: true },
  });
  if (!jalon) return res.status(404).json({ error: "Jalon introuvable ou non modifiable." });

  await prisma.jalonObjectif.delete({ where: { id: jalon.id } });
  res.json({ ok: true });
});
