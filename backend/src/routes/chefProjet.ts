import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  attendLePM,
  estEnCircuit,
  estEnRetard,
  joursRestants,
  urgenceDe,
} from "../lib/cotations.js";

/**
 * Tableau de bord du chef de projet.
 *
 * Les trois autres rôles ouvrent l'outil sur de l'argent : chiffre d'affaires,
 * marge, commissions. Le chef de projet ne vend rien et n'a aucun de ces
 * chiffres ; ce qu'il a, c'est une file et un délai. Son tableau de bord mesure
 * donc du temps et de la charge, et c'est la raison pour laquelle il ne
 * réutilise pas celui du commercial.
 *
 * Tout est calculé sur les demandes dont il est le responsable, pas sur la file
 * entière : il peut consulter n'importe quel dossier, il n'est comptable que
 * des siens. Mélanger les deux lui ferait porter un retard qui appartient à
 * quelqu'un d'autre.
 */
export const chefProjetRouter = Router();

/** Huit semaines : deux mois de recul, assez pour voir une tendance et assez
    peu pour que chaque barre reste lisible sur un téléphone. */
const SEMAINES_OBSERVEES = 8;

/** Lundi de la semaine contenant cette date, à minuit local. */
function lundiDe(d: Date): Date {
  const j = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  /* getDay() rend 0 le dimanche : sans ce report, le dimanche ouvrirait sa
     propre semaine au lieu de clore la précédente. */
  const recul = (j.getDay() + 6) % 7;
  j.setDate(j.getDate() - recul);
  return j;
}

function cleSemaine(d: Date): string {
  const l = lundiDe(d);
  const mois = String(l.getMonth() + 1).padStart(2, "0");
  const jour = String(l.getDate()).padStart(2, "0");
  return `${l.getFullYear()}-${mois}-${jour}`;
}

function moyenne(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  const somme = valeurs.reduce((s, v) => s + v, 0);
  return Math.round((somme / valeurs.length) * 10) / 10;
}

function heuresEcoulees(depuis: Date, jusqu: Date): number {
  return Math.round(((jusqu.getTime() - depuis.getTime()) / 3_600_000) * 10) / 10;
}

chefProjetRouter.get("/tableau-de-bord", async (req, res) => {
  const moi = req.utilisateur!;
  const maintenant = new Date();

  const debutObservation = lundiDe(maintenant);
  debutObservation.setDate(debutObservation.getDate() - 7 * (SEMAINES_OBSERVEES - 1));

  /* Tout l'historique de ses dossiers, closes comprises. Un délai moyen de
     chiffrage calculé sur la seule file courante ne porterait que sur ce qui
     n'est pas fini, c'est-à-dire sur rien de mesurable. */
  const miennes = await prisma.demandeCotation.findMany({
    where: { responsableId: moi.id },
    select: {
      id: true,
      reference: true,
      objet: true,
      clientNom: true,
      commercialId: true,
      commercialNom: true,
      statut: true,
      echeanceLe: true,
      createdAt: true,
      priseEnChargeLe: true,
      traiteeLe: true,
      recueLe: true,
      nbRevisions: true,
    },
    orderBy: [{ echeanceLe: "asc" }, { createdAt: "asc" }],
  });

  const aPrendreEnCharge = miennes.filter((d) => attendLePM(d.statut) && d.priseEnChargeLe === null);
  const enTraitement = miennes.filter((d) => attendLePM(d.statut) && d.priseEnChargeLe !== null);
  const enRetard = miennes.filter((d) => estEnRetard(d.statut, d.echeanceLe));
  /* Transmises, pas encore confirmées reçues. Elles ne lui demandent plus de
     travail mais restent dans le circuit : les compter comme terminées
     masquerait l'angle mort qui a motivé le module. */
  const transmises = miennes.filter((d) => d.statut === "TRAITEE");

  /* La plus vieille attente, en heures. Une moyenne rassure toujours ; c'est
     le dossier le plus ancien qui dit s'il y a un problème. */
  const attentes = aPrendreEnCharge.map((d) => heuresEcoulees(d.createdAt, maintenant));
  const plusLongueAttenteH = attentes.length > 0 ? Math.max(...attentes) : null;

  const rendues = miennes.filter((d) => d.traiteeLe !== null);
  const delaiPriseEnChargeH = moyenne(
    miennes
      .filter((d) => d.priseEnChargeLe !== null)
      .map((d) => heuresEcoulees(d.createdAt, d.priseEnChargeLe!))
  );
  const delaiChiffrageH = moyenne(
    rendues.map((d) => heuresEcoulees(d.priseEnChargeLe ?? d.createdAt, d.traiteeLe!))
  );

  /* Tenue des échéances : rendues au plus tard le jour de l'échéance. Mesurée
     sur « traiteeLe » et non sur l'état actuel, car une cotation renvoyée pour
     correction a bien été transmise une fois et ce premier passage compte. */
  const dansLesDelais = rendues.filter((d) => d.traiteeLe!.getTime() <= d.echeanceLe.getTime() + 86_400_000);
  const tenuePct = rendues.length > 0 ? Math.round((dansLesDelais.length / rendues.length) * 100) : null;

  /* Reçues contre rendues, semaine par semaine. Deux séries sur la même échelle
     parce qu'elles comptent la même chose : si la première passe durablement
     au-dessus de la seconde, la file grossit, et aucun délai moyen ne le dit. */
  const semaines: { cle: string; recues: number; rendues: number }[] = [];
  for (let i = 0; i < SEMAINES_OBSERVEES; i += 1) {
    const d = new Date(debutObservation);
    d.setDate(d.getDate() + 7 * i);
    semaines.push({ cle: cleSemaine(d), recues: 0, rendues: 0 });
  }
  const index = new Map(semaines.map((s) => [s.cle, s]));
  for (const d of miennes) {
    const recue = index.get(cleSemaine(d.createdAt));
    if (recue) recue.recues += 1;
    if (d.traiteeLe) {
      const rendue = index.get(cleSemaine(d.traiteeLe));
      if (rendue) rendue.rendues += 1;
    }
  }

  /* Ce qui attend, dans l'ordre où il faut l'ouvrir. Huit lignes : au-delà,
     c'est la file complète qu'on consulte, et elle a son propre écran. */
  const RANG = { NON_TRAITEE: 0, EN_COURS: 1 } as Record<string, number>;
  const file = miennes
    .filter((d) => attendLePM(d.statut))
    .sort((a, b) => RANG[a.statut] - RANG[b.statut] || a.echeanceLe.getTime() - b.echeanceLe.getTime())
    .slice(0, 8)
    .map((d) => ({
      id: d.id,
      reference: d.reference,
      objet: d.objet,
      clientNom: d.clientNom,
      commercialNom: d.commercialNom,
      statut: d.statut,
      echeanceLe: d.echeanceLe,
      urgence: urgenceDe(d.statut, d.echeanceLe),
      joursRestants: joursRestants(d.echeanceLe),
      enRetard: estEnRetard(d.statut, d.echeanceLe),
      priseEnCharge: d.priseEnChargeLe !== null,
    }));

  /* D'où vient la charge. Le chef de projet sert plusieurs commerciaux et n'a
     aucun moyen de savoir lequel occupe sa semaine. */
  const parDemandeur = new Map<string, number>();
  for (const d of miennes.filter((x) => estEnCircuit(x.statut))) {
    parDemandeur.set(d.commercialNom, (parDemandeur.get(d.commercialNom) ?? 0) + 1);
  }
  const demandeurs = [...parDemandeur.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  res.json({
    charge: {
      aPrendreEnCharge: aPrendreEnCharge.length,
      enTraitement: enTraitement.length,
      enRetard: enRetard.length,
      transmises: transmises.length,
      plusLongueAttenteH,
    },
    delais: {
      priseEnChargeH: delaiPriseEnChargeH,
      chiffrageH: delaiChiffrageH,
      tenuePct,
      nbRendues: rendues.length,
      nbRevisions: miennes.reduce((s, d) => s + d.nbRevisions, 0),
    },
    total: miennes.length,
    semaines,
    file,
    demandeurs,
  });
});
