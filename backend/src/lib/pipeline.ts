/**
 * Règles du pipeline commercial.
 *
 * Tout ce qui dépend de l'étape vit ici : l'ordre des colonnes, la probabilité
 * de conclusion, et ce qui compte comme affaire encore ouverte. Dispersé dans
 * les routes, ce savoir finirait par diverger, et deux écrans donneraient deux
 * valeurs pondérées différentes pour le même tableau.
 */

import type { EtapePipeline } from "@prisma/client";

/**
 * Les étapes dans l'ordre du cycle de vente.
 *
 * C'est cet ordre, et non l'ordre alphabétique ni celui de l'énumération
 * Prisma, qui fixe la disposition des colonnes.
 */
export const ETAPES: EtapePipeline[] = [
  "NOUVELLE",
  "QUALIFIEE",
  "DEVIS_ENVOYE",
  "NEGOCIATION",
  "GAGNEE",
  "PERDUE",
];

/** Les colonnes du tableau. « Perdue » n'en est pas une, voir ci-dessous. */
export const COLONNES: EtapePipeline[] = ["NOUVELLE", "QUALIFIEE", "DEVIS_ENVOYE", "NEGOCIATION", "GAGNEE"];

/**
 * Probabilité de conclusion attachée à chaque étape, en pourcentage.
 *
 * Elle découle de l'étape et ne se saisit pas. Un champ de probabilité libre
 * finit toujours par refléter l'humeur du jour plutôt que l'avancement réel,
 * et personne ne le met à jour. Déduite de l'étape, elle bouge quand l'affaire
 * bouge, ce qui est précisément ce qu'on veut mesurer.
 *
 * Ces valeurs sont des conventions d'usage, à ajuster quand EasyTech aura
 * assez d'historique pour mesurer ses propres taux de transformation.
 */
export const PROBABILITE_PCT: Record<EtapePipeline, number> = {
  NOUVELLE: 10,
  QUALIFIEE: 30,
  DEVIS_ENVOYE: 50,
  NEGOCIATION: 75,
  GAGNEE: 100,
  PERDUE: 0,
};

/** Une affaire encore en jeu : ni signée, ni perdue. */
export function estOuverte(etape: EtapePipeline): boolean {
  return etape !== "GAGNEE" && etape !== "PERDUE";
}

/** Une affaire close, dans un sens ou dans l'autre. */
export function estCloturee(etape: EtapePipeline): boolean {
  return !estOuverte(etape);
}

/**
 * Valeur pondérée d'une affaire : son montant multiplié par sa probabilité.
 *
 * C'est le seul total honnête d'un pipeline. Additionner les montants bruts
 * donne un chiffre qui flatte et qui ne se réalise jamais ; le pondérer donne
 * un ordre de grandeur de ce qui va effectivement rentrer.
 */
export function valeurPonderee(montant: number, etape: EtapePipeline): number {
  return Math.round((montant * PROBABILITE_PCT[etape]) / 100);
}

/**
 * Au-delà de ce nombre de jours sans changer d'étape, une affaire est signalée.
 *
 * Trois semaines : assez pour qu'un cycle de vente normal respire, assez peu
 * pour qu'un dossier oublié remonte avant d'être perdu.
 */
export const JOURS_AVANT_STAGNATION = 21;

/** Jours écoulés depuis l'entrée dans l'étape actuelle. */
export function joursDansEtape(depuis: Date, maintenant = new Date()): number {
  const ms = maintenant.getTime() - depuis.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/** Une affaire ouverte qui n'a pas bougé depuis trop longtemps. */
export function stagne(etape: EtapePipeline, depuis: Date, maintenant = new Date()): boolean {
  return estOuverte(etape) && joursDansEtape(depuis, maintenant) >= JOURS_AVANT_STAGNATION;
}
