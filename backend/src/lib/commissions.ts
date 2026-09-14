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
 * personne par personne. Tant qu'il n'est pas fixé, la commission vaut null :
 * l'interface affiche « taux non défini » au lieu d'un zéro qui se lirait
 * comme une absence de résultat.
 */

/** Décimal Prisma, nombre, ou rien. */
export type Taux = { toString(): string } | number | null | undefined;

export function tauxEnNombre(taux: Taux): number | null {
  if (taux === null || taux === undefined) return null;
  const n = Number(taux);
  return Number.isFinite(n) ? n : null;
}

/**
 * Commission due sur un bénéfice donné.
 * Renvoie null quand aucun taux n'est fixé, et jamais un montant négatif :
 * une vente à perte ne coûte pas d'argent au commercial, elle ne lui en
 * rapporte simplement pas.
 */
export function commissionDe(benefice: number, taux: Taux): number | null {
  const pct = tauxEnNombre(taux);
  if (pct === null) return null;
  return Math.round(Math.max(0, benefice) * (pct / 100));
}
