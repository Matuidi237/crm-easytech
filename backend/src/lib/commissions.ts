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
 * Le taux dépend de la NATURE de ce qui est vendu, pas de la personne qui
 * vend. Un commercial reste libre de négocier un taux particulier, qui
 * remplace alors le barème ; à défaut, c'est le barème maison qui vaut, et
 * personne ne travaille sans règle le temps qu'on lui en fixe une.
 */

/** Nature de ce qui est vendu, reprise de l'enum Prisma. */
export type NatureVente = "MATERIEL" | "SERVICE";

/**
 * Barème maison, en pourcentage du bénéfice.
 *
 * Le service est mieux commissionné que le matériel parce qu'il se vend plus
 * difficilement et engage le commercial après la signature. Ces deux valeurs
 * sont la seule chose à toucher si EasyTech révise sa grille : écrans et
 * calculs les lisent toutes les deux ici.
 */
export const BAREME_PCT: Record<NatureVente, number> = {
  MATERIEL: 3,
  SERVICE: 5,
};

/** Repli quand la nature est inconnue : le taux le plus bas, jamais l'inverse. */
export const TAUX_PAR_DEFAUT_PCT = BAREME_PCT.MATERIEL;

/** Décimal Prisma, nombre, ou rien. */
export type Taux = { toString(): string } | number | null | undefined;

/** Barème applicable à une nature, quoi qu'on lui passe. */
export function tauxBareme(nature: NatureVente | null | undefined): number {
  return nature && nature in BAREME_PCT ? BAREME_PCT[nature] : TAUX_PAR_DEFAUT_PCT;
}

/**
 * Taux réellement appliqué : celui négocié sur le compte, sinon le barème.
 *
 * Un taux explicite de zéro est respecté : il peut résulter d'une décision,
 * et le remplacer par le barème attribuerait une commission que personne n'a
 * accordée. Seule son absence déclenche le repli.
 *
 * Un taux négocié écrase le barème des deux natures. C'est voulu : un accord
 * particulier se signe sur un chiffre unique, et faire cohabiter un accord
 * personnel avec une grille par nature produirait des promesses que personne
 * ne saurait recalculer.
 */
export function tauxEffectif(nature: NatureVente | null | undefined, taux: Taux): number {
  if (taux === null || taux === undefined) return tauxBareme(nature);
  const n = Number(taux);
  return Number.isFinite(n) ? n : tauxBareme(nature);
}

/**
 * Commission due sur une vente.
 *
 * Jamais un montant négatif : une vente à perte ne coûte pas d'argent au
 * commercial, elle ne lui en rapporte simplement pas.
 */
export function commissionDe(
  benefice: number,
  nature: NatureVente | null | undefined,
  taux: Taux
): number {
  return Math.round(Math.max(0, benefice) * (tauxEffectif(nature, taux) / 100));
}

/** Bénéfice ventilé par nature, tel que l'accumulent les routes de synthèse. */
export type BeneficeParNature = Record<NatureVente, number>;

export function beneficeVide(): BeneficeParNature {
  return { MATERIEL: 0, SERVICE: 0 };
}

/**
 * Commission d'un cumul de ventes.
 *
 * Depuis que le taux dépend de la nature, un total de bénéfice ne suffit plus
 * à retrouver une commission : il faut la ventilation. Les routes de synthèse
 * accumulent donc le bénéfice par nature et passent par ici.
 *
 * L'arrondi se fait sur le cumul, là où le relevé détaillé arrondit vente par
 * vente : les deux peuvent différer de quelques francs sur un gros volume.
 * C'est assumé, le relevé détaillé faisant foi puisque c'est lui qu'on verse.
 */
export function commissionCumulee(benefices: BeneficeParNature, taux: Taux): number {
  return (
    commissionDe(benefices.MATERIEL, "MATERIEL", taux) +
    commissionDe(benefices.SERVICE, "SERVICE", taux)
  );
}
