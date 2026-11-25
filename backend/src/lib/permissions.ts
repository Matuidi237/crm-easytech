import type { RoleUtilisateur } from "@prisma/client";

/**
 * Hiérarchie de privilèges de l'ERP.
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
  // Renseigner le prix d'achat d'une vente, donc la marge et la commission
  // qu'elle produira. Capacite a part : le commercial saisit la vente mais
  // ne connait pas le cout, et le lui ouvrir reviendrait a lui laisser fixer
  // sa propre remuneration.
  "ventes.cout",
  // Prendre en charge et rendre les cotations demandées par les commerciaux.
  // Capacité à part de « stats.globales » : traiter la file est un travail, la
  // regarder est une surveillance, et les deux ne vont pas aux mêmes comptes.
  "cotations.traiter",
  // Changer le responsable d'une demande. Séparée de « traiter » : tout chef
  // de projet chiffre, mais arbitrer qui fait quoi est une décision
  // d'encadrement, et se réattribuer soi-même les dossiers faciles n'en est
  // pas une.
  "cotations.affecter",
  // Voir la file de TOUT LE MONDE sans y répondre. Pour la direction, qui a
  // besoin de savoir où ça bloque sans avoir à chiffrer quoi que ce soit.
  "cotations.superviser",
  "utilisateurs.gerer", // créer et modifier des comptes
  "utilisateurs.gererAdmins", // toucher aux administrateurs et au super admin
  "permissions.gerer", // modifier la matrice elle-même
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Ce que l'écran de réglage affiche, et dans quel ordre.
 *
 * Seuls la clé et le groupe vivent ici. Les libellés et les explications
 * sont dans `frontend/src/i18n`, sous « perm.<clé>.libelle » et
 * « perm.<clé>.detail », parce que l'écran se lit en deux langues et que le
 * serveur n'a pas à choisir laquelle.
 *
 * Les avoir eus aux deux endroits a coûté une capacité invisible en
 * production : le texte écrit ici donnait l'illusion que le travail était
 * fait, et l'écran affichait la clé brute.
 *
 * Toute capacité ajoutée à PERMISSIONS doit apparaître ici ET porter ses
 * deux clés de traduction, sinon elle n'a pas de case à cocher.
 */
export const CATALOGUE_PERMISSIONS: { cle: Permission; groupe: string }[] = [
  { cle: "clients.voirTous", groupe: "Clients" },
  { cle: "clients.creer", groupe: "Clients" },
  { cle: "clients.modifier", groupe: "Clients" },
  { cle: "clients.supprimer", groupe: "Clients" },
  { cle: "clients.importer", groupe: "Clients" },
  { cle: "clients.exporter", groupe: "Clients" },
  { cle: "clients.coordonnees", groupe: "Clients" },
  { cle: "acces.accorder", groupe: "Accès" },
  { cle: "newsletters.voir", groupe: "Campagnes" },
  { cle: "newsletters.creer", groupe: "Campagnes" },
  { cle: "newsletters.envoyer", groupe: "Campagnes" },
  { cle: "stats.globales", groupe: "Pilotage" },
  { cle: "ventes.cout", groupe: "Ventes" },
  { cle: "cotations.traiter", groupe: "Cotations" },
  { cle: "cotations.affecter", groupe: "Cotations" },
  { cle: "cotations.superviser", groupe: "Cotations" },
  { cle: "utilisateurs.gerer", groupe: "Administration" },
  { cle: "utilisateurs.gererAdmins", groupe: "Administration" },
  { cle: "permissions.gerer", groupe: "Administration" },
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
   * Direction générale. Mêmes droits qu'un administrateur : le DG se
   * distingue par ce qu'il voit en premier, pas par ce qu'il a le droit de
   * faire. Son interface est décrite côté frontend (VUE_PAR_ROLE).
   */
  DG: TOUTES.filter((p) => p !== "utilisateurs.gererAdmins" && p !== "permissions.gerer"),

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
    "ventes.cout",
    /* Le chef de projet EST le destinataire des demandes de cotation. Sans
       cette capacité, la file lui serait invisible et le module ne servirait
       à rien. */
    "cotations.traiter",
    "newsletters.voir",
    "newsletters.creer",
    "newsletters.envoyer",
    "stats.globales",
  ],

  /**
   * Ressources humaines.
   *
   * Aucune capacité sur la partie commerciale, et c'est voulu : la RH tient l'effectif et les
   * congés, elle n'a pas à lire le portefeuille clients ni les montants des
   * ventes. Ses propres capacités, nommées « rh.* », arriveront avec le module.
   *
   * Seule exception, la supervision des cotations : la file dit où le travail
   * s'accumule et combien de temps il attend, ce qui est une question de
   * charge et d'organisation avant d'être une question commerciale. Elle ne
   * donne accès à aucun montant de vente.
   */
  RH: ["cotations.superviser"],
};

/** Libellés affichés dans l'interface. */
export const LIBELLES_ROLES: Record<RoleUtilisateur, string> = {
  SUPER_ADMIN: "Super administrateur",
  ADMIN: "Administrateur",
  DG: "Directeur général",
  RESPONSABLE_COMMERCIAL: "Responsable commercial",
  COMMERCIAL: "Commercial",
  COMPTABLE: "Comptable",
  CHEF_DE_PROJET: "Chef de projet",
  RH: "Ressources humaines",
};

/** Du plus élevé au plus restreint. Sert à empêcher qu'un compte en promeuve un autre au-dessus de lui. */
const RANG: Record<RoleUtilisateur, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 80,
  /* Même rang qu'un administrateur : aucun des deux ne peut donc agir sur
     l'autre, « peutAgirSur » exigeant un rang strictement supérieur. */
  DG: 80,
  RESPONSABLE_COMMERCIAL: 60,
  /* Au rang d'un chef de projet : la RH administre des dossiers, pas des
     comptes, et ne doit pas pouvoir promouvoir qui que ce soit. */
  RH: 50,
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
