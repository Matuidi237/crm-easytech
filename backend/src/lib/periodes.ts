import type { PeriodeObjectif } from "@prisma/client";

/**
 * Fenêtres de temps des objectifs commerciaux.
 *
 * Un seul endroit décide où commence une semaine ou un trimestre. Deux
 * calculs concurrents produiraient deux chiffres pour le même objectif, et
 * c'est le commercial qui découvrirait l'écart en comparant son écran à celui
 * de son responsable.
 *
 * Tout est calculé en heure locale du serveur, comme le reste de l'outil :
 * une vente du 31 janvier à 23 h appartient à janvier pour celui qui l'a
 * faite, pas à février parce qu'un fuseau l'a décalée.
 */

export type Fenetre = { debut: Date; fin: Date };

const JOUR_MS = 24 * 60 * 60 * 1000;

/** Minuit du jour donné, sans toucher à l'original. */
export function minuit(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Lundi de la semaine contenant la date.
 *
 * La semaine commence le lundi : c'est la norme ISO et l'usage au Cameroun.
 * getDay() renvoyant 0 pour dimanche, celui-ci est rattaché à la semaine qui
 * s'achève et non à celle qui commence.
 */
export function debutSemaine(d: Date): Date {
  const j = minuit(d);
  const jourSemaine = (j.getDay() + 6) % 7;
  j.setDate(j.getDate() - jourSemaine);
  return j;
}

/** Début de la fenêtre contenant la date, pour la granularité demandée. */
export function debutDe(periode: PeriodeObjectif, reference: Date): Date {
  const d = minuit(reference);
  switch (periode) {
    case "JOUR":
      return d;
    case "SEMAINE":
      return debutSemaine(d);
    case "MOIS":
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case "TRIMESTRE":
      return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
    case "SEMESTRE":
      return new Date(d.getFullYear(), d.getMonth() < 6 ? 0 : 6, 1);
    case "ANNEE":
      return new Date(d.getFullYear(), 0, 1);
  }
}

/**
 * Fenêtre complète, bornes ouvertes à droite.
 *
 * La fin est le premier instant HORS période : comparer avec « < fin » évite
 * la question de la milliseconde finale, qui fait qu'une vente de 23:59:59.500
 * tombe dans le mois ou n'y tombe pas selon la précision retenue.
 */
export function fenetreDe(periode: PeriodeObjectif, reference: Date): Fenetre {
  const debut = debutDe(periode, reference);
  const fin = new Date(debut);
  switch (periode) {
    case "JOUR":
      fin.setDate(fin.getDate() + 1);
      break;
    case "SEMAINE":
      fin.setDate(fin.getDate() + 7);
      break;
    case "MOIS":
      fin.setMonth(fin.getMonth() + 1);
      break;
    case "TRIMESTRE":
      fin.setMonth(fin.getMonth() + 3);
      break;
    case "SEMESTRE":
      fin.setMonth(fin.getMonth() + 6);
      break;
    case "ANNEE":
      fin.setFullYear(fin.getFullYear() + 1);
      break;
  }
  return { debut, fin };
}

/** Fenêtre décalée de n crans, pour naviguer d'une période à l'autre. */
export function decaler(periode: PeriodeObjectif, reference: Date, pas: number): Date {
  const d = debutDe(periode, reference);
  switch (periode) {
    case "JOUR":
      d.setDate(d.getDate() + pas);
      break;
    case "SEMAINE":
      d.setDate(d.getDate() + pas * 7);
      break;
    case "MOIS":
      d.setMonth(d.getMonth() + pas);
      break;
    case "TRIMESTRE":
      d.setMonth(d.getMonth() + pas * 3);
      break;
    case "SEMESTRE":
      d.setMonth(d.getMonth() + pas * 6);
      break;
    case "ANNEE":
      d.setFullYear(d.getFullYear() + pas);
      break;
  }
  return d;
}

/**
 * Part de la fenêtre déjà écoulée, de 0 à 1.
 *
 * Sert à dire si un objectif est tenu : 40 % du chiffre au tiers du trimestre
 * est une avance, le même chiffre la veille de la clôture est un échec. Sans
 * cette part, une barre de progression ne dit rien d'utile.
 */
export function partEcoulee({ debut, fin }: Fenetre, maintenant = new Date()): number {
  if (maintenant <= debut) return 0;
  if (maintenant >= fin) return 1;
  return (maintenant.getTime() - debut.getTime()) / (fin.getTime() - debut.getTime());
}

/** Jours de la fenêtre, utile pour étaler une feuille de temps. */
export function joursDe({ debut, fin }: Fenetre): Date[] {
  const jours: Date[] = [];
  for (let t = debut.getTime(); t < fin.getTime(); t += JOUR_MS) {
    jours.push(new Date(t));
  }
  return jours;
}
