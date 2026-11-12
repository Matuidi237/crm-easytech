import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer, { MulterError } from "multer";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { peut } from "../lib/permissions.js";
import type { SessionUtilisateur } from "../lib/auth.js";
import {
  ECHEANCE_MAX_JOURS,
  TAILLE_MAX_PIECE,
  attendLePM,
  delaiMoyenHeures,
  estEnCircuit,
  estEnRetard,
  jourCalendaire,
  joursRestants,
  referenceCotation,
  typePieceAccepte,
} from "../lib/cotations.js";

export const cotationsRouter = Router();

/* Les pièces transitent en mémoire puis partent en base. Rien n'est écrit sur
   le disque du serveur : une instance redéployée ne doit pas perdre les
   fichiers, et un volume persistant oublié au déploiement les perdrait sans
   rien dire. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAILLE_MAX_PIECE },
});

/** Jamais le contenu des pièces : une file de trente demandes renverrait
    plusieurs dizaines de méga-octets pour afficher des noms de fichiers. */
const SELECT_PIECE = {
  id: true,
  origine: true,
  nomFichier: true,
  typeMime: true,
  taille: true,
  deposeParNom: true,
  createdAt: true,
} as const;

const SELECT_DEMANDE = {
  id: true,
  reference: true,
  objet: true,
  description: true,
  clientId: true,
  clientNom: true,
  commercialId: true,
  commercialNom: true,
  statut: true,
  echeanceLe: true,
  traiteParId: true,
  traiteParNom: true,
  priseEnChargeLe: true,
  traiteeLe: true,
  recueLe: true,
  reponse: true,
  revisionDemandeeLe: true,
  motifRevision: true,
  nbRevisions: true,
  createdAt: true,
  updatedAt: true,
  pieces: { select: SELECT_PIECE, orderBy: { createdAt: "asc" } },
} as const;

type DemandeBrute = Prisma.DemandeCotationGetPayload<{ select: typeof SELECT_DEMANDE }>;

/**
 * Qui voit quoi.
 *
 * Le commercial ne voit que ses demandes, sans qu'aucune capacité ne lui soit
 * accordée : ce sont les siennes, et exiger un droit pour les consulter
 * reviendrait à lui demander la permission de lire son propre travail. Le chef
 * de projet et la direction voient la file entière.
 */
function perimetre(u: SessionUtilisateur): Prisma.DemandeCotationWhereInput {
  if (peut(u.role, "cotations.traiter") || peut(u.role, "cotations.superviser")) return {};
  return { commercialId: u.id };
}

function voitToutLeMonde(u: SessionUtilisateur): boolean {
  return peut(u.role, "cotations.traiter") || peut(u.role, "cotations.superviser");
}

/** Ajoute ce qui se déduit des dates, pour que l'interface ne le recalcule pas. */
function enrichir(d: DemandeBrute) {
  return {
    ...d,
    enRetard: estEnRetard(d.statut, d.echeanceLe),
    joursRestants: joursRestants(d.echeanceLe),
    enCircuit: estEnCircuit(d.statut),
    /* Deux délais distincts, parce qu'ils accusent deux personnes
       différentes : le temps d'attente avant que le chef de projet ouvre la
       demande, et le temps de chiffrage une fois ouverte. Les confondre
       empêcherait de savoir si le problème est la charge ou la réactivité. */
    heuresAvantPriseEnCharge:
      d.priseEnChargeLe !== null
        ? Math.round(((d.priseEnChargeLe.getTime() - d.createdAt.getTime()) / 3_600_000) * 10) / 10
        : null,
    heuresDeTraitement:
      d.traiteeLe !== null
        ? Math.round(
            ((d.traiteeLe.getTime() - (d.priseEnChargeLe ?? d.createdAt).getTime()) / 3_600_000) * 10
          ) / 10
        : null,
  };
}

/* ==========================================================================
   La file
   ========================================================================== */

/**
 * La file visible par le compte connecté, avec ses indicateurs.
 *
 * Les demandes closes ne sont pas renvoyées par défaut : une file qui conserve
 * tout l'historique finit par noyer les quelques lignes qui appellent une
 * action. Elles se demandent explicitement quand on veut regarder en arrière.
 */
cotationsRouter.get("/", async (req, res) => {
  const moi = req.utilisateur!;
  const avecCloturees = req.query.historique === "1";

  const base = perimetre(moi);
  const demandes = await prisma.demandeCotation.findMany({
    where: avecCloturees ? base : { ...base, statut: { not: "CLOTUREE" } },
    /* Par échéance croissante : la file se lit du plus pressant au moins
       pressant. Trier par date de saisie ferait passer une demande sans enjeu
       avant un appel d'offres qui ferme vendredi, ce qui est exactement le
       reproche fait au fonctionnement actuel. */
    orderBy: [{ echeanceLe: "asc" }, { createdAt: "asc" }],
    take: avecCloturees ? 200 : 100,
    select: SELECT_DEMANDE,
  });

  /* Les indicateurs se calculent sur le périmètre complet, closes comprises :
     un délai moyen de traitement n'a de sens que sur ce qui a été traité, et
     c'est précisément ce que la file courante ne contient plus. */
  const pourMesure = await prisma.demandeCotation.findMany({
    where: base,
    select: {
      statut: true,
      echeanceLe: true,
      createdAt: true,
      priseEnChargeLe: true,
      traiteeLe: true,
      nbRevisions: true,
    },
  });

  const enrichies = demandes.map(enrichir);
  const enCircuit = pourMesure.filter((d) => estEnCircuit(d.statut));

  res.json({
    demandes: enrichies,
    /* Dit à l'interface ce qu'elle a le droit de proposer. Cacher un bouton
       n'a jamais rien protégé, les routes le revérifient toutes ; c'est du
       confort de lecture, pas de la sécurité. */
    droits: {
      traiter: peut(moi.role, "cotations.traiter"),
      superviser: peut(moi.role, "cotations.superviser"),
      fileGlobale: voitToutLeMonde(moi),
    },
    totaux: {
      /* Le total soumis, closes comprises : c'est le volume d'activité du
         circuit, et le compter sur la seule file courante le ferait baisser
         chaque fois qu'un dossier se termine bien. */
      soumises: pourMesure.length,
      enCircuit: enCircuit.length,
      nonTraitees: pourMesure.filter((d) => d.statut === "NON_TRAITEE").length,
      enCours: pourMesure.filter((d) => d.statut === "EN_COURS").length,
      traitees: pourMesure.filter((d) => d.statut === "TRAITEE").length,
      cloturees: pourMesure.filter((d) => d.statut === "CLOTUREE").length,
      enRetard: enCircuit.filter((d) => estEnRetard(d.statut, d.echeanceLe)).length,
      /* Les dossiers repartis pour correction. Un chiffrage refait est du
         travail payé deux fois : c'est l'indicateur qui dit si le besoin est
         mal exprimé au départ ou mal lu à l'arrivée. */
      enRevision: enCircuit.filter((d) => d.nbRevisions > 0).length,
      /* Null et non zéro quand rien n'est mesurable : un délai moyen de zéro
         heure se lirait comme une performance parfaite alors qu'il signifie
         seulement qu'aucune demande n'a encore été traitée. */
      heuresMoyennesPriseEnCharge: delaiMoyenHeures(
        pourMesure.map((d) => ({ debut: d.createdAt, fin: d.priseEnChargeLe }))
      ),
      heuresMoyennesTraitement: delaiMoyenHeures(
        pourMesure.map((d) => ({ debut: d.priseEnChargeLe ?? d.createdAt, fin: d.traiteeLe }))
      ),
      /* Part des demandes rendues avant l'échéance annoncée. C'est la seule
         mesure qui juge le circuit sur la promesse faite au commercial, et non
         sur une moyenne qu'aucun dossier précis ne reconnaît. */
      ...tauxTenue(pourMesure),
    },
  });
});

/** Demandes rendues, et combien l'ont été dans le délai annoncé. */
function tauxTenue(lignes: { traiteeLe: Date | null; echeanceLe: Date }[]) {
  const rendues = lignes.filter((l): l is { traiteeLe: Date; echeanceLe: Date } => l.traiteeLe !== null);
  if (rendues.length === 0) return { nbRendues: 0, nbDansLeDelai: 0, tauxTenuePct: null as number | null };
  const dansLeDelai = rendues.filter(
    (l) => jourCalendaire(l.traiteeLe).getTime() <= l.echeanceLe.getTime()
  ).length;
  return {
    nbRendues: rendues.length,
    nbDansLeDelai: dansLeDelai,
    tauxTenuePct: Math.round((dansLeDelai / rendues.length) * 100),
  };
}

/**
 * Le détail d'une demande.
 *
 * Cette lecture a un effet : quand un chef de projet ouvre une demande encore
 * non traitée, elle passe « en cours de traitement ». C'est volontairement une
 * conséquence de la consultation et non un bouton, parce qu'un bouton « j'ai
 * vu » ne serait jamais cliqué et que le commercial resterait devant un
 * « non traitée » faux. L'effet ne joue qu'une fois, au premier passage.
 */
cotationsRouter.get("/:id", async (req, res) => {
  const moi = req.utilisateur!;
  const demande = await prisma.demandeCotation.findFirst({
    where: { AND: [{ id: req.params.id }, perimetre(moi)] },
    select: SELECT_DEMANDE,
  });
  // 404 et non 403 : on ne confirme pas l'existence de la demande d'un autre.
  if (!demande) return res.status(404).json({ error: "Demande de cotation introuvable." });

  if (demande.statut === "NON_TRAITEE" && peut(moi.role, "cotations.traiter")) {
    const maj = await prisma.demandeCotation.update({
      where: { id: demande.id },
      data: {
        statut: "EN_COURS",
        priseEnChargeLe: new Date(),
        traiteParId: moi.id,
        traiteParNom: moi.nomComplet,
      },
      select: SELECT_DEMANDE,
    });
    return res.json(enrichir(maj));
  }

  res.json(enrichir(demande));
});

/* ==========================================================================
   Soumission, côté commercial
   ========================================================================== */

/**
 * Référence lisible de la demande.
 *
 * Numérotée à partir du plus grand rang déjà pris, et non du nombre de
 * demandes : une demande retirée ferait retomber le compteur sur une
 * référence déjà utilisée, et la création échouerait sur la contrainte
 * d'unicité. Celle-ci reste le dernier mot, et l'appelant retente.
 */
async function prochaineReference(tx: Prisma.TransactionClient): Promise<string> {
  const annee = new Date().getFullYear();
  const derniere = await tx.demandeCotation.findFirst({
    where: { reference: { startsWith: `COT-${annee}-` } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });
  const rang = derniere ? parseInt(derniere.reference.slice(-4), 10) : 0;
  return referenceCotation(annee, (Number.isNaN(rang) ? 0 : rang) + 1);
}

cotationsRouter.post("/", upload.single("piece"), async (req, res) => {
  const moi = req.utilisateur!;
  const corps = req.body as Record<string, string | undefined>;

  const objet = (corps.objet ?? "").trim();
  if (!objet) return res.status(400).json({ error: "L'objet de la demande est obligatoire." });
  if (objet.length > 150) return res.status(400).json({ error: "Cet objet est trop long." });

  const clientNom = (corps.clientNom ?? "").trim();
  if (!clientNom) return res.status(400).json({ error: "Le client est obligatoire." });

  /* L'échéance est exigée, et c'est le cœur du module : sans délai annoncé,
     la file se trie par ancienneté et le chef de projet n'a aucun moyen de
     savoir ce qui est urgent. */
  if (!corps.echeanceLe) {
    return res.status(400).json({ error: "Indiquez pour quand vous attendez la cotation." });
  }
  const echeance = new Date(corps.echeanceLe);
  if (Number.isNaN(echeance.getTime())) {
    return res.status(400).json({ error: "La date d'échéance est invalide." });
  }
  const echeanceLe = jourCalendaire(echeance);
  const restants = joursRestants(echeanceLe);
  if (restants < 0) {
    return res.status(400).json({ error: "Une échéance dans le passé ne peut pas être tenue." });
  }
  if (restants > ECHEANCE_MAX_JOURS) {
    return res.status(400).json({ error: "Cette échéance est trop lointaine pour une cotation." });
  }

  const piece = req.file;
  if (piece && !typePieceAccepte(piece.mimetype)) {
    return res.status(400).json({ error: "Ce type de fichier n'est pas accepté." });
  }

  let clientId: string | null = null;
  if (corps.clientId) {
    const existant = await prisma.client.findUnique({
      where: { id: corps.clientId },
      select: { id: true },
    });
    clientId = existant?.id ?? null;
  }

  try {
    const creee = await prisma.$transaction(async (tx) => {
      const reference = await prochaineReference(tx);
      return tx.demandeCotation.create({
        data: {
          reference,
          objet,
          description: corps.description?.trim() || null,
          clientId,
          clientNom,
          commercialId: moi.id,
          commercialNom: moi.nomComplet,
          echeanceLe,
          ...(piece
            ? {
                pieces: {
                  create: {
                    origine: "BESOIN",
                    nomFichier: piece.originalname,
                    typeMime: piece.mimetype,
                    taille: piece.size,
                    contenu: piece.buffer,
                    deposeParNom: moi.nomComplet,
                  },
                },
              }
            : {}),
        },
        select: SELECT_DEMANDE,
      });
    });

    res.status(201).json(enrichir(creee));
  } catch (err) {
    res.status(400).json({ error: "La demande n'a pas pu être enregistrée.", details: String(err) });
  }
});

/** Le commercial retire sa demande, tant que personne ne s'en est saisi. */
cotationsRouter.delete("/:id", async (req, res) => {
  const moi = req.utilisateur!;
  const demande = await prisma.demandeCotation.findFirst({
    where: { id: req.params.id, commercialId: moi.id },
    select: { id: true, statut: true },
  });
  if (!demande) return res.status(404).json({ error: "Demande de cotation introuvable." });

  /* Une demande déjà ouverte par le chef de projet ne s'efface plus : du temps
     y a été passé, et le faire disparaître effacerait aussi cette trace. */
  if (demande.statut !== "NON_TRAITEE") {
    return res.status(409).json({
      error: "Cette demande est déjà prise en charge, elle ne peut plus être retirée.",
    });
  }

  await prisma.demandeCotation.delete({ where: { id: demande.id } });
  res.json({ ok: true });
});

/* ==========================================================================
   Traitement, côté chef de projet
   ========================================================================== */

function exigerTraiter(role: SessionUtilisateur["role"]): boolean {
  return peut(role, "cotations.traiter");
}

/**
 * Le chef de projet rend sa cotation.
 *
 * La pièce est facultative au cas où la réponse tient en deux lignes (hors
 * catalogue, délai fournisseur rédhibitoire), mais l'un des deux au moins est
 * exigé : une demande qui repasse « traitée » sans rien de joint ni rien
 * d'écrit ne renseigne pas davantage le commercial qu'un silence.
 */
cotationsRouter.post("/:id/reponse", upload.single("piece"), async (req, res) => {
  const moi = req.utilisateur!;
  if (!exigerTraiter(moi.role)) {
    return res.status(403).json({ error: "Votre rôle ne permet pas de traiter les cotations." });
  }

  const demande = await prisma.demandeCotation.findUnique({
    where: { id: req.params.id },
    select: { id: true, statut: true, priseEnChargeLe: true },
  });
  if (!demande) return res.status(404).json({ error: "Demande de cotation introuvable." });
  if (demande.statut === "CLOTUREE") {
    return res.status(409).json({ error: "Cette demande est déjà sortie du circuit." });
  }

  const reponse = (req.body?.reponse as string | undefined)?.trim() || null;
  const piece = req.file;
  if (!reponse && !piece) {
    return res.status(400).json({ error: "Joignez la cotation ou écrivez votre réponse." });
  }
  if (piece && !typePieceAccepte(piece.mimetype)) {
    return res.status(400).json({ error: "Ce type de fichier n'est pas accepté." });
  }

  const maj = await prisma.demandeCotation.update({
    where: { id: demande.id },
    data: {
      statut: "TRAITEE",
      traiteeLe: new Date(),
      traiteParId: moi.id,
      traiteParNom: moi.nomComplet,
      /* Une demande rendue sans avoir été marquée prise en charge garde quand
         même une date de prise en charge : sans elle, le délai de traitement
         se calculerait depuis la soumission et accuserait le chef de projet de
         l'attente qui l'a précédé. */
      priseEnChargeLe: demande.priseEnChargeLe ?? new Date(),
      reponse,
      ...(piece
        ? {
            pieces: {
              create: {
                origine: "COTATION",
                nomFichier: piece.originalname,
                typeMime: piece.mimetype,
                taille: piece.size,
                contenu: piece.buffer,
                deposeParNom: moi.nomComplet,
              },
            },
          }
        : {}),
    },
    select: SELECT_DEMANDE,
  });

  res.json(enrichir(maj));
});

/* ==========================================================================
   Réception, côté commercial
   ========================================================================== */

/**
 * Le commercial confirme avoir reçu la cotation, et la demande sort du circuit.
 *
 * Réservé au demandeur, y compris à la direction : un tiers qui déclarerait la
 * réception à sa place ferait disparaître de la file une demande que personne
 * n'a réellement reçue, ce qui est exactement le désordre que ce module doit
 * faire cesser.
 */
cotationsRouter.post("/:id/reception", async (req, res) => {
  const moi = req.utilisateur!;
  const demande = await prisma.demandeCotation.findFirst({
    where: { id: req.params.id, commercialId: moi.id },
    select: { id: true, statut: true },
  });
  if (!demande) {
    return res.status(404).json({ error: "Demande de cotation introuvable." });
  }
  if (demande.statut !== "TRAITEE") {
    return res.status(409).json({
      error: "La cotation n'a pas encore été rendue, il n'y a rien à réceptionner.",
    });
  }

  const maj = await prisma.demandeCotation.update({
    where: { id: demande.id },
    data: { statut: "CLOTUREE", recueLe: new Date() },
    select: SELECT_DEMANDE,
  });
  res.json(enrichir(maj));
});

/**
 * Le commercial renvoie la cotation pour révision.
 *
 * Sans cette issue, celui qui reçoit un chiffrage erroné n'a le choix qu'entre
 * l'accepter et laisser pourrir la demande, ce qui est exactement le genre de
 * silence que ce module doit faire cesser. Le dossier retourne au chef de
 * projet avec le motif, et le compteur de retard reprend.
 */
cotationsRouter.post("/:id/revision", async (req, res) => {
  const moi = req.utilisateur!;
  const demande = await prisma.demandeCotation.findFirst({
    where: { id: req.params.id, commercialId: moi.id },
    select: { id: true, statut: true, nbRevisions: true },
  });
  if (!demande) return res.status(404).json({ error: "Demande de cotation introuvable." });
  if (demande.statut !== "TRAITEE") {
    return res.status(409).json({ error: "Aucune cotation n'est en attente de votre accord." });
  }

  const motif = (req.body?.motif as string | undefined)?.trim();
  /* Un renvoi sans motif renvoie le chef de projet à la case départ sans lui
     dire ce qu'il doit reprendre, et lui fait refaire le même travail. */
  if (!motif) {
    return res.status(400).json({ error: "Indiquez ce qui doit être revu dans cette cotation." });
  }

  const maj = await prisma.demandeCotation.update({
    where: { id: demande.id },
    data: {
      statut: "EN_COURS",
      revisionDemandeeLe: new Date(),
      motifRevision: motif,
      nbRevisions: demande.nbRevisions + 1,
    },
    select: SELECT_DEMANDE,
  });
  res.json(enrichir(maj));
});

/* ==========================================================================
   Pièces jointes
   ========================================================================== */

/** Ajoute une pièce à une demande déjà ouverte, d'un côté ou de l'autre. */
cotationsRouter.post("/:id/pieces", upload.single("piece"), async (req, res) => {
  const moi = req.utilisateur!;
  const demande = await prisma.demandeCotation.findFirst({
    where: { AND: [{ id: req.params.id }, perimetre(moi)] },
    select: { id: true, commercialId: true, statut: true },
  });
  if (!demande) return res.status(404).json({ error: "Demande de cotation introuvable." });

  const piece = req.file;
  if (!piece) return res.status(400).json({ error: "Aucun fichier reçu." });
  if (!typePieceAccepte(piece.mimetype)) {
    return res.status(400).json({ error: "Ce type de fichier n'est pas accepté." });
  }

  /* L'origine se déduit de qui dépose, jamais du formulaire : laisser
     l'appelant la déclarer permettrait de faire passer un besoin pour une
     cotation et de fausser la lecture du dossier. */
  const estLeDemandeur = demande.commercialId === moi.id;
  if (!estLeDemandeur && !exigerTraiter(moi.role)) {
    return res.status(403).json({ error: "Votre rôle ne permet pas d'ajouter une pièce." });
  }

  const creee = await prisma.pieceCotation.create({
    data: {
      demandeId: demande.id,
      origine: estLeDemandeur ? "BESOIN" : "COTATION",
      nomFichier: piece.originalname,
      typeMime: piece.mimetype,
      taille: piece.size,
      contenu: piece.buffer,
      deposeParNom: moi.nomComplet,
    },
    select: SELECT_PIECE,
  });

  res.status(201).json(creee);
});

/**
 * Télécharge une pièce.
 *
 * Le périmètre de la demande commande : une pièce ne se lit que par qui peut
 * voir la demande qui la porte. Servie en pièce jointe et jamais en ligne :
 * un fichier déposé par un tiers et rendu dans l'origine de l'application
 * pourrait s'y exécuter.
 */
cotationsRouter.get("/pieces/:pieceId", async (req, res) => {
  const moi = req.utilisateur!;
  const piece = await prisma.pieceCotation.findFirst({
    where: { id: req.params.pieceId, demande: perimetre(moi) },
    select: { nomFichier: true, typeMime: true, contenu: true },
  });
  if (!piece) return res.status(404).json({ error: "Pièce introuvable." });

  res.setHeader("Content-Type", piece.typeMime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(piece.nomFichier)}`
  );
  res.send(Buffer.from(piece.contenu));
});

/**
 * Un fichier trop gros ou refusé par multer remonte ici.
 *
 * Sans ce filet, l'erreur part dans le gestionnaire par défaut d'Express, qui
 * répond une page HTML : l'interface lirait une pile d'appels à la place du
 * message, et l'utilisateur n'apprendrait pas que sa pièce dépasse la limite.
 */
cotationsRouter.use(
  (err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `Ce fichier dépasse ${Math.round(TAILLE_MAX_PIECE / (1024 * 1024))} Mo.`
          : "Ce fichier n'a pas pu être lu.";
      return res.status(400).json({ error: message });
    }
    next(err);
  }
);
