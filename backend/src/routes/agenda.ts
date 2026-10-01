import { Router } from "express";
import type { PeriodeObjectif, TypeActivite } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { peut, perimetreClients } from "../lib/permissions.js";
import { debutDe, fenetreDe, minuit, partEcoulee } from "../lib/periodes.js";

export const agendaRouter = Router();

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
 * Créneaux d'une semaine, plus les totaux qui en font une feuille de temps.
 *
 * On renvoie le détail ET les totaux : recalculer les cumuls côté interface
 * donnerait deux additions à maintenir, et c'est celle qui est fausse qu'on
 * finit par croire.
 */
agendaRouter.get("/temps", async (req, res) => {
  const moi = req.utilisateur!;
  const reference = dateDeRequete(req.query.semaine);
  const { debut, fin } = fenetreDe("SEMAINE", reference);

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
  let total = 0;

  for (const s of saisies) {
    const minutes = s.finMinutes - s.debutMinutes;
    total += minutes;
    const cle = s.jour.toISOString().slice(0, 10);
    parJour.set(cle, (parJour.get(cle) ?? 0) + minutes);
    parActivite.set(s.activite, (parActivite.get(s.activite) ?? 0) + minutes);
  }

  res.json({
    debut,
    fin,
    saisies,
    totalMinutes: total,
    parJour: Object.fromEntries(parJour),
    /* Trié du plus lourd au plus léger : la question posée à une feuille de
       temps est « où est passée ma semaine », pas « combien par catégorie
       dans l'ordre alphabétique ». */
    parActivite: [...parActivite.entries()]
      .map(([activite, minutes]) => ({ activite, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
  });
});

agendaRouter.post("/temps", async (req, res) => {
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

agendaRouter.delete("/temps/:id", async (req, res) => {
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

/**
 * Objectifs d'une période, avec ce qui a réellement été réalisé.
 *
 * Les deux jeux d'objectifs sont renvoyés, celui du responsable et le sien,
 * même quand un seul pilote le suivi : voir l'autre permet de comparer son
 * engagement à celui qu'on lui demande, et c'est précisément la conversation
 * que cet écran doit rendre possible.
 */
agendaRouter.get("/objectifs", async (req, res) => {
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
      select: {
        id: true,
        periode: true,
        debut: true,
        cibleCaXAF: true,
        cibleVentes: true,
        cibleRendezVous: true,
        fixeParEncadrement: true,
        definiParNom: true,
        note: true,
      },
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

  const normaliser = (o: (typeof objectifs)[number]) => ({
    ...o,
    cibleCaXAF: o.cibleCaXAF === null ? null : Math.round(Number(o.cibleCaXAF)),
  });

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

/** Bascule entre le planning du responsable et le sien. */
agendaRouter.patch("/objectifs/source", async (req, res) => {
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
agendaRouter.post("/objectifs", async (req, res) => {
  const moi = req.utilisateur!;
  const corps = req.body as {
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

  res.status(201).json({ ...objectif, cibleCaXAF: objectif.cibleCaXAF === null ? null : Number(objectif.cibleCaXAF) });
});

/** Retire un objectif personnel. Ceux de l'encadrement ne se suppriment pas ici. */
agendaRouter.delete("/objectifs/:id", async (req, res) => {
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
