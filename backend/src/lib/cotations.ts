/**
 * Règles du circuit de cotation.
 *
 * Tout ce qui dépend du statut vit ici : l'ordre des étapes, ce qui compte
 * comme demande encore en circuit, et ce qu'est un retard. Dispersé dans les
 * routes, ce savoir finirait par diverger, et la file du chef de projet
 * n'afficherait pas les mêmes retards que celle du commercial.
 */

import type { StatutCotation } from "@prisma/client";

/** Les statuts dans l'ordre du circuit, de la soumission à la sortie. */
export const STATUTS: StatutCotation[] = ["NON_TRAITEE", "EN_COURS", "TRAITEE", "CLOTUREE"];

/**
 * Une demande encore dans le circuit.
 *
 * « Traitée » en fait partie, et c'est le point du module : la cotation est
 * rendue, mais tant que le commercial n'a pas confirmé l'avoir reçue, la
 * demande n'est pas finie. C'est exactement l'angle mort dont se plaignaient
 * les commerciaux, où un envoi déclaré fait restait sans preuve de réception.
 */
export function estEnCircuit(statut: StatutCotation): boolean {
  return statut !== "CLOTUREE";
}

/** Une demande qui attend encore un geste du chef de projet. */
export function attendLePM(statut: StatutCotation): boolean {
  return statut === "NON_TRAITEE" || statut === "EN_COURS";
}

/**
 * Jour calendaire ramené à minuit UTC.
 *
 * Les colonnes `@db.Date` tronquent l'horodatage sur UTC : y écrire un minuit
 * local décalerait la date d'un jour à Douala, et une échéance au 1er
 * tomberait au 30 du mois précédent.
 */
export function jourCalendaire(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/**
 * Une demande en retard : l'échéance annoncée est passée et le chef de projet
 * n'a pas rendu sa cotation.
 *
 * Le retard cesse d'être compté dès que la cotation est rendue, même si le
 * commercial tarde ensuite à la réceptionner : ce second délai existe, mais il
 * n'est pas du fait du chef de projet et le lui imputer fausserait la mesure.
 */
export function estEnRetard(
  statut: StatutCotation,
  echeance: Date,
  maintenant = new Date()
): boolean {
  if (!attendLePM(statut)) return false;
  return jourCalendaire(maintenant).getTime() > echeance.getTime();
}

/**
 * Jours restants avant l'échéance. Négatif quand elle est dépassée.
 *
 * Compté en jours calendaires pleins pour que « aujourd'hui » vaille zéro :
 * une échéance du jour n'est pas encore un retard, elle est le dernier moment.
 */
export function joursRestants(echeance: Date, maintenant = new Date()): number {
  const ms = echeance.getTime() - jourCalendaire(maintenant).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** Heures écoulées entre deux instants, arrondies au dixième. */
export function heuresEntre(debut: Date, fin: Date): number {
  return Math.round(((fin.getTime() - debut.getTime()) / 3_600_000) * 10) / 10;
}

/** Au-delà de ce nombre de jours sans échéance explicite, on refuse la saisie. */
export const ECHEANCE_MAX_JOURS = 180;

/** Taille maximale d'une pièce jointe. */
export const TAILLE_MAX_PIECE = 15 * 1024 * 1024;

/**
 * Types acceptés en pièce jointe.
 *
 * Le PDF est le cas courant, l'image couvre la photo d'un cahier des charges
 * papier, le tableur le besoin chiffré ligne à ligne. Rien d'exécutable : ces
 * fichiers sont renvoyés tels quels au navigateur, et une liste fermée est la
 * seule garantie qui tienne.
 */
export const TYPES_PIECE_ACCEPTES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

export function typePieceAccepte(mime: string): boolean {
  return TYPES_PIECE_ACCEPTES.includes(mime);
}

/**
 * Référence lisible d'une demande, « COT-2026-0014 ».
 *
 * Numérotée par année plutôt qu'en continu : le compteur reste court, et le
 * millésime situe la demande sans ouvrir la fiche.
 */
export function referenceCotation(annee: number, rang: number): string {
  return `COT-${annee}-${String(rang).padStart(4, "0")}`;
}

/**
 * Délai moyen, en heures, entre deux horodatages, sur un ensemble de demandes.
 *
 * Renvoie null plutôt que zéro quand rien n'est mesurable. Un délai moyen de
 * zéro heure se lirait comme une performance parfaite alors qu'il ne veut
 * dire qu'une chose : aucune demande n'a encore été traitée.
 */
export function delaiMoyenHeures(
  lignes: { debut: Date; fin: Date | null }[]
): number | null {
  const mesurables = lignes.filter((l): l is { debut: Date; fin: Date } => l.fin !== null);
  if (mesurables.length === 0) return null;
  const total = mesurables.reduce((s, l) => s + heuresEntre(l.debut, l.fin), 0);
  return Math.round((total / mesurables.length) * 10) / 10;
}
