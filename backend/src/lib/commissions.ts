/**
 * Règle de commissionnement.
 *
 * Un seul endroit décide de ce qu'un commercial touche. La règle est ici, et
 * nulle part ailleurs : la changer ne doit pas obliger à relire les routes.
 *
 * Choix retenu : la commission porte sur le BÉNÉFICE, pas sur le chiffre
 * d'affaires. Commissionner le chiffre d'affaires récompenserait une vente à
 * perte aussi bien qu'une vente rentable ; la marge est ce que l'entreprise
 * encaisse réellement. Si EasyTech tranche autrement, c'est cette fonction
 * qu'il faut modifier, et elle seule.
 *
 * Le taux vit sur le compte (« tauxCommissionPct »), parce qu'il se négocie
 * personne par personne. À défaut d'accord particulier, c'est le taux maison
 * qui s'applique : tout commercial est commissionné, personne ne travaille
 * sans règle le temps qu'on lui en fixe une.
 */

/**
 * Taux maison, en pourcentage du bénéfice.
 *
 * S'applique à tout compte dont le taux n'a pas été négocié. Le changer ici
 * le change partout, écrans et calculs compris : c'est la seule valeur à
 * toucher si EasyTech révise sa règle.
 */
export const TAUX_PAR_DEFAUT_PCT = 3;

/** Décimal Prisma, nombre, ou rien. */
export type Taux = { toString(): string } | number | null | undefined;

/**
 * Taux réellement appliqué : celui du compte, ou le taux maison.
 *
 * Un taux explicite de zéro est respecté : il peut résulter d'une décision,
 * et le remplacer par 3 % attribuerait une commission que personne n'a
 * accordée. Seule son absence déclenche le repli.
 */
export function tauxEffectif(taux: Taux): number {
  if (taux === null || taux === undefined) return TAUX_PAR_DEFAUT_PCT;
  const n = Number(taux);
  return Number.isFinite(n) ? n : TAUX_PAR_DEFAUT_PCT;
}

/**
 * Commission due sur un bénéfice donné.
 *
 * Jamais un montant négatif : une vente à perte ne coûte pas d'argent au
 * commercial, elle ne lui en rapporte simplement pas.
 */
export function commissionDe(benefice: number, taux: Taux): number {
  return Math.round(Math.max(0, benefice) * (tauxEffectif(taux) / 100));
}
