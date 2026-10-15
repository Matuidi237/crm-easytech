/**
 * Activités d'une feuille de temps.
 *
 * Elles sont du texte libre. Une nomenclature fermée oblige à ranger « point
 * de cadrage chez le client » dans une case qui ne lui va pas, et ce qu'on
 * range de travers, on finit par ne plus le saisir du tout.
 *
 * Ce fichier ne contient donc pas une liste autorisée mais trois choses :
 * de quoi nettoyer ce qui est tapé, de quoi proposer un point de départ à
 * celui qui n'a encore rien saisi, et de quoi reconnaître un rendez-vous
 * client parmi des libellés libres.
 */

/** Au-delà, ce n'est plus un libellé mais une description. */
export const LONGUEUR_MAX_ACTIVITE = 60;

/**
 * Propositions de démarrage.
 *
 * Elles ne limitent rien : ce sont les libellés offerts à un compte qui n'a
 * encore rien pointé, pour qu'il n'ait pas à inventer son vocabulaire devant
 * un champ vide. Dès qu'il a saisi les siens, ce sont les siens qui passent
 * devant.
 */
export const ACTIVITES_SUGGEREES = [
  "Prospection",
  "Relance",
  "Rendez-vous client",
  "Démonstration",
  "Rédaction de devis",
  "Négociation",
  "Suivi client",
  "Réunion interne",
  "Formation",
  "Déplacement",
  "Administratif",
];

/**
 * Nettoie un libellé saisi, ou rend null s'il n'en reste rien.
 *
 * Les espaces multiples sont réduits : « Suivi  client » et « Suivi client »
 * doivent compter pour la même activité dans les statistiques, et l'écart
 * entre les deux ne se voit pas à l'œil.
 */
export function normaliserActivite(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const propre = valeur.replace(/\s+/g, " ").trim();
  if (propre === "") return null;
  return propre.slice(0, LONGUEUR_MAX_ACTIVITE);
}

/** Minuscules sans accents : sert à comparer deux libellés, jamais à afficher. */
export function comparable(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Mots qui désignent un temps passé face à un client.
 *
 * Ils servent à compter les rendez-vous d'un objectif commercial, qui n'ont
 * pas d'autre trace dans l'outil. C'est une reconnaissance par le libellé, et
 * donc faillible : un commercial qui écrit « café avec Abidjan CIV » ne sera
 * pas compté. Le choix assumé est de ne rien lui imposer à la saisie plutôt
 * que de rendre un compteur exact au prix d'une case à cocher de plus.
 */
const MOTS_RENDEZ_VOUS = ["rendez-vous", "rendez vous", "rdv", "demonstration", "demo", "visite", "presentation"];

/** Le libellé décrit-il un rendez-vous client ? */
export function estRendezVous(activite: string): boolean {
  const c = comparable(activite);
  return MOTS_RENDEZ_VOUS.some((mot) => c.includes(mot));
}

/**
 * Filtre Prisma équivalent, pour compter sans relire toutes les lignes.
 *
 * Les variantes accentuées sont listées en toutes lettres : « insensitive »
 * ignore la casse mais pas les accents, et « demonstration » ne retrouverait
 * pas « Démonstration ». Les deux listes décrivent la même règle que
 * « estRendezVous », d'où leur voisinage ici.
 */
const MOTS_SQL = [...MOTS_RENDEZ_VOUS, "démonstration", "présentation"];

export const FILTRE_RENDEZ_VOUS = {
  OR: MOTS_SQL.map((mot) => ({ activite: { contains: mot, mode: "insensitive" as const } })),
};
