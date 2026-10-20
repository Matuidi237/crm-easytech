/**
 * Lecture d'une ligne de vente.
 *
 * Chez EasyTech, le devis part de Zoho et le commercial qui enregistre la
 * commande ne connaît pas le prix d'achat : seule la direction en dispose.
 * Une vente entre donc en base avec son chiffre d'affaires et, souvent, sans
 * son coût.
 *
 * Tout l'enjeu tient dans la conséquence : un coût absent n'est pas un coût
 * nul. Le traiter comme zéro afficherait une marge de 100 %, une commission
 * imméritée et un classement à la rentabilité faux. Ce fichier existe pour
 * que cette distinction se fasse au même endroit partout, plutôt que d'être
 * refaite, et oubliée, à chaque route.
 */

import { beneficeVide, commissionCumulee, type BeneficeParNature, type Taux } from "./commissions.js";

/** Décimal Prisma, nombre, ou rien. */
type Montant = { toString(): string } | number | null | undefined;

const nb = (v: Montant) => (v === null || v === undefined ? 0 : Number(v));

export type LigneVente = {
  prixVente: Montant;
  prixAchat: Montant;
  quantite: number;
  nature?: "MATERIEL" | "SERVICE";
};

/** Chiffre d'affaires de la ligne. Toujours connu. */
export function montantDe(v: LigneVente): number {
  return nb(v.prixVente) * v.quantite;
}

/** Vrai quand le coût a été renseigné, fût-il nul. */
export function coutConnu(v: LigneVente): boolean {
  return v.prixAchat !== null && v.prixAchat !== undefined;
}

/**
 * Marge de la ligne, ou null tant que le coût manque.
 *
 * Un coût explicitement à zéro est respecté : il arrive qu'une prestation ne
 * coûte rien d'autre que du temps déjà payé, et le remplacer par « inconnu »
 * retirerait des chiffres justes.
 */
export function margeDe(v: LigneVente): number | null {
  if (!coutConnu(v)) return null;
  return (nb(v.prixVente) - nb(v.prixAchat)) * v.quantite;
}

/**
 * Cumul d'un ensemble de ventes.
 *
 * Deux assiettes coexistent, et c'est le point à ne pas perdre de vue :
 * « ca » porte tout ce qui a été vendu, « caEvalue » seulement ce dont on
 * connaît le coût. Le taux de marge se calcule sur la seconde, faute de quoi
 * chaque vente non complétée ferait mécaniquement baisser un taux qui n'a
 * pourtant pas bougé.
 */
export type Cumul = {
  ca: number;
  nbVentes: number;
  quantite: number;
  caEvalue: number;
  benefice: number;
  nbVentesEvaluees: number;
  beneficeParNature: BeneficeParNature;
};

export function cumulVide(): Cumul {
  return {
    ca: 0,
    nbVentes: 0,
    quantite: 0,
    caEvalue: 0,
    benefice: 0,
    nbVentesEvaluees: 0,
    beneficeParNature: beneficeVide(),
  };
}

/** Ajoute une ligne au cumul, en rangeant ce qui est connu de ce qui ne l'est pas. */
export function ajouter(c: Cumul, v: LigneVente): Cumul {
  const montant = montantDe(v);
  c.ca += montant;
  c.nbVentes += 1;
  c.quantite += v.quantite;

  const marge = margeDe(v);
  if (marge !== null) {
    c.caEvalue += montant;
    c.benefice += marge;
    c.nbVentesEvaluees += 1;
    if (v.nature) c.beneficeParNature[v.nature] += marge;
  }
  return c;
}

/**
 * Taux de marge, ou null quand aucune vente n'est encore chiffrée.
 *
 * Null et non zéro : « 0 % » se lit comme une marge nulle, c'est-à-dire une
 * information, alors qu'on n'en a aucune.
 */
export function margePct(c: Cumul): number | null {
  if (c.caEvalue <= 0) return null;
  return Math.round((c.benefice / c.caEvalue) * 100);
}

/** Commission due sur le cumul, chaque nature à son taux. */
export function commissionDuCumul(c: Cumul, taux: Taux): number {
  return commissionCumulee(c.beneficeParNature, taux);
}

/** Ce qui attend encore un coût, pour le dire plutôt que de le taire. */
export function resteAChiffrer(c: Cumul): { nbVentes: number; ca: number } {
  return { nbVentes: c.nbVentes - c.nbVentesEvaluees, ca: Math.round(c.ca - c.caEvalue) };
}
