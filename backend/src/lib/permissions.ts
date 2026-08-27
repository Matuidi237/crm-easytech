import type { RoleUtilisateur } from "@prisma/client";

/**
 * Hiérarchie de privilèges du CRM.
 *
 * Un seul endroit décide de ce que chaque rôle peut faire. Les routes ne
 * testent jamais un rôle directement : elles exigent une capacité. Ajouter un
 * rôle ou déplacer un droit se fait donc ici, sans toucher au reste du code.
 *
 * Deux mécanismes se superposent :
 *   1. les capacités ci-dessous, qui portent sur des actions ;
 *   2. la portée de visibilité des clients (voir « perimetreClients »), qui
 *      décide QUELLES fiches un compte peut voir, ligne par ligne.
 */

export const PERMISSIONS = [
  "clients.voirTous", // accède à toute la base, sans octroi nominatif
  "clients.creer",
  "clients.modifier",
  "clients.supprimer",
  "clients.importer",
  "clients.exporter",
  "clients.coordonnees", // voir emails et téléphones des fiches
  "acces.accorder", // ouvrir l'accès d'un client à un commercial
  "newsletters.voir",
  "newsletters.creer",
  "newsletters.envoyer",
  "stats.globales",
  "utilisateurs.gerer", // créer et modifier des comptes
  "utilisateurs.gererAdmins", // toucher aux administrateurs et au super admin
  "permissions.gerer", // modifier la matrice elle-même
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Description de chaque droit, pour que l'écran de réglage soit compréhensible. */
export const CATALOGUE_PERMISSIONS: { cle: Permission; groupe: string; libelle: string; detail: string }[] = [
  { cle: "clients.voirTous", groupe: "Clients", libelle: "Voir toute la base", detail: "Sans cette case, le compte ne voit que ses propres fiches et celles qu'on lui a ouvertes." },
  { cle: "clients.creer", groupe: "Clients", libelle: "Ajouter un client", detail: "Le créateur devient propriétaire de la fiche." },
  { cle: "clients.modifier", groupe: "Clients", libelle: "Modifier une fiche", detail: "Uniquement dans les limites de son périmètre." },
  { cle: "clients.supprimer", groupe: "Clients", libelle: "Supprimer une fiche", detail: "Vaut aussi pour la suppression d'un fichier importé." },
  { cle: "clients.importer", groupe: "Clients", libelle: "Importer un fichier", detail: "Donne accès à la page Importer." },
  { cle: "clients.exporter", groupe: "Clients", libelle: "Exporter en CSV", detail: "N'exporte que ce que le compte peut déjà voir." },
  { cle: "clients.coordonnees", groupe: "Clients", libelle: "Voir les coordonnées", detail: "Sans cette case, emails et téléphones sont masqués." },
  { cle: "acces.accorder", groupe: "Accès", libelle: "Ouvrir l'accès à des clients", detail: "Permet de désigner les fiches qu'un commercial peut consulter." },
  { cle: "newsletters.voir", groupe: "Campagnes", libelle: "Consulter les campagnes", detail: "Donne accès à la page Newsletters." },
  { cle: "newsletters.creer", groupe: "Campagnes", libelle: "Rédiger une campagne", detail: "Création et modification des brouillons." },
  { cle: "newsletters.envoyer", groupe: "Campagnes", libelle: "Envoyer une campagne", detail: "Déclenche l'envoi réel aux destinataires." },
  { cle: "stats.globales", groupe: "Pilotage", libelle: "Voir les statistiques", detail: "Chiffres du tableau de bord, limités au périmètre du compte." },
  { cle: "utilisateurs.gerer", groupe: "Administration", libelle: "Gérer les comptes", detail: "Créer, modifier et désactiver des comptes de rang inférieur." },
  { cle: "utilisateurs.gererAdmins", groupe: "Administration", libelle: "Gérer les administrateurs", detail: "Toucher aux comptes d'administration." },
  { cle: "permissions.gerer", groupe: "Administration", libelle: "Modifier les permissions", detail: "Accès à cet écran. À n'accorder qu'en connaissance de cause." },
];

const TOUTES = [...PERMISSIONS];

/**
 * Valeurs par défaut. Le super administrateur peut les surcharger depuis
 * l'interface (voir « appliquerSurcharges »), mais elles restent la référence
 * vers laquelle on peut toujours revenir.
 */
const MATRICE_PAR_DEFAUT: Record<RoleUtilisateur, Permission[]> = {
  /** Contrôle total. Volontairement non modifiable : sans cette garantie, un
   *  décochage malheureux verrouillerait définitivement l'application. */
  SUPER_ADMIN: TOUTES,

  /** Tout, sauf toucher aux administrateurs et à la matrice elle-même. */
  ADMIN: TOUTES.filter((p) => p !== "utilisateurs.gererAdmins" && p !== "permissions.gerer"),

  /**
   * Voit toute la base et distribue les accès à ses commerciaux.
   * Il administre des comptes, mais seulement ceux de son équipe : cette
   * restriction-là ne s'exprime pas en capacité, elle est vérifiée dans la
   * route utilisateurs.
   */
  RESPONSABLE_COMMERCIAL: [
    "clients.voirTous",
    "clients.creer",
    "clients.modifier",
    "clients.supprimer",
    "clients.importer",
    "clients.exporter",
    "clients.coordonnees",
    "acces.accorder",
    "newsletters.voir",
    "newsletters.creer",
    "newsletters.envoyer",
    "stats.globales",
    "utilisateurs.gerer",
  ],

  /**
   * Ne voit que ses propres prospects et les fiches qu'un responsable lui a
   * ouvertes. Il peut alimenter la base, jamais la parcourir en entier.
   * Il rédige des campagnes mais ne les envoie pas : l'envoi engage l'image
   * de l'entreprise et reste une décision d'encadrement.
   */
  COMMERCIAL: [
    "clients.creer",
    "clients.modifier",
    "clients.importer",
    "clients.exporter",
    "clients.coordonnees",
    "newsletters.voir",
    "newsletters.creer",
  ],

  /**
   * Chiffres et montants, sans les coordonnées : elle n'en a pas l'usage,
   * et c'est autant de données personnelles qui ne circulent pas.
   */
  COMPTABLE: ["clients.voirTous", "clients.exporter", "stats.globales"],

  /** Pilotage : lecture complète et gestion des campagnes, sans modification. */
  CHEF_DE_PROJET: [
    "clients.voirTous",
    "clients.coordonnees",
    "clients.exporter",
    "newsletters.voir",
    "newsletters.creer",
    "newsletters.envoyer",
    "stats.globales",
  ],
};

/** Libellés affichés dans l'interface. */
export const LIBELLES_ROLES: Record<RoleUtilisateur, string> = {
  SUPER_ADMIN: "Super administrateur",
  ADMIN: "Administrateur",
  RESPONSABLE_COMMERCIAL: "Responsable commercial",
  COMMERCIAL: "Commercial",
  COMPTABLE: "Comptable",
  CHEF_DE_PROJET: "Chef de projet",
};

/** Du plus élevé au plus restreint. Sert à empêcher qu'un compte en promeuve un autre au-dessus de lui. */
const RANG: Record<RoleUtilisateur, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 80,
  RESPONSABLE_COMMERCIAL: 60,
  CHEF_DE_PROJET: 50,
  COMPTABLE: 40,
  COMMERCIAL: 20,
};

/**
 * Surcharges enregistrées en base, tenues en mémoire : les permissions sont
 * évaluées à chaque requête, une lecture SQL à chaque fois serait du gaspillage.
 * Le cache est rechargé au démarrage et après chaque modification.
 *
 * Note : ce cache est propre au processus. Avec plusieurs répliques du backend,
 * il faudrait les notifier ; l'installation actuelle n'en compte qu'une.
 */
let surcharges: Partial<Record<RoleUtilisateur, Permission[]>> = {};

export function appliquerSurcharges(nouvelles: Partial<Record<RoleUtilisateur, Permission[]>>) {
  // Le super administrateur est exclu par principe, même si la base en contenait une.
  const { SUPER_ADMIN: _ignore, ...reste } = nouvelles;
  surcharges = reste;
}

export function permissionsParDefaut(role: RoleUtilisateur): Permission[] {
  return MATRICE_PAR_DEFAUT[role] ?? [];
}

export function estSurcharge(role: RoleUtilisateur): boolean {
  return role !== "SUPER_ADMIN" && surcharges[role] !== undefined;
}

export function permissionsDe(role: RoleUtilisateur): Permission[] {
  if (role === "SUPER_ADMIN") return TOUTES;
  return surcharges[role] ?? MATRICE_PAR_DEFAUT[role] ?? [];
}

export function peut(role: RoleUtilisateur, permission: Permission): boolean {
  return permissionsDe(role).includes(permission);
}

export function rangDe(role: RoleUtilisateur): number {
  return RANG[role] ?? 0;
}

/**
 * Un compte ne peut agir que sur des rôles strictement inférieurs au sien,
 * ce qui interdit à un administrateur de se hisser au niveau du super admin
 * ou de neutraliser un pair.
 */
export function peutAgirSur(acteur: RoleUtilisateur, cible: RoleUtilisateur): boolean {
  if (acteur === "SUPER_ADMIN") return true;
  return rangDe(acteur) > rangDe(cible);
}

/**
 * Restriction Prisma décrivant les clients visibles par un compte.
 * `null` signifie « aucune restriction ».
 */
export function perimetreClients(utilisateur: { id: string; role: RoleUtilisateur }) {
  if (peut(utilisateur.role, "clients.voirTous")) return null;
  return {
    OR: [
      { proprietaireId: utilisateur.id },
      { acces: { some: { utilisateurId: utilisateur.id } } },
    ],
  };
}

/** Retire les coordonnées des fiches quand le rôle n'y a pas droit. */
export function masquerCoordonnees<T extends { emailContact?: string | null; telephone?: string | null }>(
  fiches: T[],
  role: RoleUtilisateur
): T[] {
  if (peut(role, "clients.coordonnees")) return fiches;
  return fiches.map((f) => ({ ...f, emailContact: null, telephone: null }));
}
