import type { Permission, Role } from "./api";
import type { CleTraduction } from "./i18n";

/**
 * Quelle interface chaque rôle voit en premier.
 *
 * À distinguer soigneusement des permissions : celles-ci disent ce qu'un
 * compte a le DROIT de faire et sont vérifiées par le serveur à chaque appel.
 * Ce fichier ne décide que de ce qu'on MONTRE. Cacher une entrée de menu n'a
 * jamais protégé quoi que ce soit ; c'est du confort de lecture, pas de la
 * sécurité.
 *
 * Le directeur général a exactement les droits d'un administrateur, mais il
 * n'a pas les mêmes questions : il ouvre l'outil pour savoir où en est
 * l'activité, pas pour importer un fichier.
 */

export type EntreeNav = {
  to: string;
  cle: CleTraduction;
  icone: string;
  end?: boolean;
  /** Masquée si le compte n'a pas ce droit, même quand la vue la prévoit. */
  requiert?: Permission;
};

/** Vue par défaut : celle que tout le monde avait jusqu'ici. */
const NAV_STANDARD: EntreeNav[] = [
  { to: "/", cle: "nav.dashboard", icone: "dashboard", end: true },
  { to: "/clients", cle: "nav.clients", icone: "users" },
  { to: "/import", cle: "nav.import", icone: "import", requiert: "clients.importer" },
  { to: "/newsletters", cle: "nav.newsletters", icone: "mail", requiert: "newsletters.voir" },
  /* La file des cotations, pour le chef de projet qui la traite. Elle vient
     avant les écrans de pilotage : c'est du travail en attente, pas une
     consultation, et un travail en attente se montre en premier. */
  { to: "/cotations", cle: "nav.cotations", icone: "quote", requiert: "cotations.traiter" },
  { to: "/a-chiffrer", cle: "nav.aChiffrer", icone: "coins", requiert: "ventes.cout" },
];

/**
 * Vue des ressources humaines.
 *
 * Le module RH n'a pas encore d'écran ; en attendant, la DRH n'ouvrait
 * l'application que pour son profil. La file des cotations lui donne la seule
 * chose qu'elle y suit aujourd'hui : où le travail s'accumule et depuis
 * combien de temps il attend.
 */
const NAV_RH: EntreeNav[] = [
  { to: "/cotations", cle: "nav.cotations", icone: "quote", requiert: "cotations.superviser" },
];

/** Vue de la direction générale. */
const NAV_DG: EntreeNav[] = [
  { to: "/", cle: "nav.dashboard", icone: "dashboard", end: true },
  { to: "/equipes", cle: "nav.equipes", icone: "team" },
  { to: "/clients", cle: "nav.clients", icone: "users" },
  { to: "/campagnes", cle: "nav.campagnes", icone: "mail", requiert: "newsletters.voir" },
  { to: "/partenaires", cle: "nav.partenaires", icone: "handshake" },
  /* Le DG ne traite pas les cotations, il regarde où elles s'arrêtent. */
  { to: "/cotations", cle: "nav.cotations", icone: "quote", requiert: "cotations.superviser" },
  /* Les commandes dont le prix d'achat manque. L'onglet est visible pour qui
     peut le renseigner : sans lui, la file s'allongerait sans que personne
     ne la voie, et les commissions resteraient en suspens. */
  { to: "/a-chiffrer", cle: "nav.aChiffrer", icone: "coins", requiert: "ventes.cout" },
];

/**
 * Vue du responsable commercial : celle de la direction, plus l'import.
 *
 * Le directeur général n'ouvre pas l'outil pour charger un fichier de
 * prospects ; le responsable commercial si, c'est lui qui alimente la base
 * avant de la distribuer à son équipe. Le lui retirer en le faisant passer
 * au pilotage aurait été une perte, et c'est la seule différence entre les
 * deux menus.
 */
const NAV_RESPONSABLE: EntreeNav[] = [
  ...NAV_DG.slice(0, 3),
  { to: "/import", cle: "nav.import", icone: "import", requiert: "clients.importer" },
  ...NAV_DG.slice(3),
];

/**
 * Vue du commercial : trois onglets, pas davantage.
 *
 * Ses chiffres, ses clients, son temps. Ventes et commissions restent des
 * écrans à part entière, atteints depuis les indicateurs du tableau de bord
 * plutôt que depuis le menu : une barre latérale qui liste tout ce que
 * l'application sait faire cesse d'indiquer par où commencer.
 *
 * Aucune entrée n'est conditionnée par une permission. Ce sont ses propres
 * chiffres et son propre portefeuille : le droit de les consulter ne se
 * discute pas, et les routes correspondantes ne lisent que le compte connecté.
 */
const NAV_COMMERCIAL: EntreeNav[] = [
  { to: "/", cle: "nav.dashboard", icone: "dashboard", end: true },
  /* Le pipeline avant le portefeuille : on regarde ce qui est en jeu avant
     d'ouvrir la liste des clients, et c'est l'ecran de debut de journee. */
  { to: "/pipeline", cle: "nav.pipeline", icone: "kanban" },
  { to: "/clients", cle: "nav.portefeuille", icone: "users" },
  /* Les cotations après le portefeuille : une demande de cotation se fait
     depuis une affaire en cours, donc après avoir regardé le pipeline, et ce
     que le commercial vient y chercher le reste du temps est l'état de sa
     file, pas un écran qu'il ouvre tous les matins. */
  { to: "/cotations", cle: "nav.cotations", icone: "quote" },
  { to: "/planning", cle: "nav.calendrier", icone: "calendar" },
];

/**
 * Mise en service progressive : trois onglets, pour tout le monde.
 *
 * Tableau de bord, portefeuille client, cotations. C'est une décision
 * d'adoption, pas une décision technique : un outil qui s'ouvre sur onze
 * entrées de menu ne dit pas par où commencer, et une équipe qui ne sait pas
 * par où commencer retourne au fichier Excel. Les trois retenus couvrent la
 * journée de chacun, et c'est sur eux que portera la formation.
 *
 * Seuls les MENUS sont réduits. Les routes restent toutes montées et les écrans
 * de détail restent atteignables depuis les indicateurs du tableau de bord,
 * comme le parcours commercial le fait déjà : masquer une entrée n'a jamais
 * rien désactivé. Rouvrir un onglet se fait en retirant son chemin d'ici, sans
 * toucher à une page.
 */
const MENU_RESTREINT = true;

/** Les chemins conservés pendant la mise en service. */
const ONGLETS_OUVERTS = ["/", "/clients", "/cotations"];

export function navDe(role: Role | undefined): EntreeNav[] {
  const complete = navComplete(role);
  if (!MENU_RESTREINT) return complete;
  /* Filtré depuis le menu complet plutôt que réécrit : chaque rôle garde son
     ordre, son libellé et sa condition de droit. Le commercial lit
     « Portefeuille » là où la direction lit « Clients », et le chef de projet
     ne voit les cotations que s'il peut les traiter. */
  return complete.filter((e) => ONGLETS_OUVERTS.includes(e.to));
}

function navComplete(role: Role | undefined): EntreeNav[] {
  if (role === "DG") return NAV_DG;
  if (role === "RESPONSABLE_COMMERCIAL") return NAV_RESPONSABLE;
  if (role === "COMMERCIAL") return NAV_COMMERCIAL;
  if (role === "RH") return NAV_RH;
  return NAV_STANDARD;
}

/**
 * Comptes qui ouvrent sur les indicateurs plutôt que sur la base clients.
 *
 * Le directeur général et le responsable commercial. Le second encadre une
 * équipe : ses questions du matin sont celles du premier, où en est le
 * chiffre d'affaires et qui vend quoi, pas l'état de la base de prospection.
 * Il voyait jusqu'ici le tableau de bord des fiches clients, qui ne répond à
 * aucune de ces questions.
 *
 * Nommée « pilotage » et non « direction » depuis qu'ils sont deux : un nom
 * qui désigne une personne précise cesse d'être vrai au premier ajout.
 *
 * Les données qu'ils voient sont les mêmes, et c'est assumé : le responsable
 * commercial a déjà « clients.voirTous » et « stats.globales », il lit donc
 * toute la base. Lui montrer les mêmes chiffres ne lui ouvre rien de neuf,
 * cela les lui présente enfin.
 */
export function estVuePilotage(role: Role | undefined) {
  return role === "DG" || role === "RESPONSABLE_COMMERCIAL";
}

/**
 * Le commercial ouvre sur sa propre performance.
 *
 * Le responsable commercial en est exclu, mais plus par défaut : il encadre
 * une équipe, ses questions portent sur les autres autant que sur lui, et
 * c'est la vue de pilotage qui y répond.
 */
export function estVueCommerciale(role: Role | undefined) {
  return role === "COMMERCIAL";
}

/**
 * La DRH, dont le parcours se limite pour l'instant à la file des cotations.
 *
 * À revoir quand le module RH aura ses écrans : c'est alors l'effectif qui
 * deviendra sa page d'accueil.
 */
export function estVueRH(role: Role | undefined) {
  return role === "RH";
}

/**
 * Le chef de projet, qui n'ouvre l'outil ni sur de l'argent ni sur des clients.
 *
 * Il ne vend rien : chiffre d'affaires, marge et commissions ne le concernent
 * pas, et le tableau de bord des fiches clients qu'il voyait jusqu'ici ne
 * répondait à aucune de ses questions. Les siennes portent sur sa charge et
 * sur ses délais, et c'est ce que mesure son écran.
 *
 * Testé sur le rôle et non sur « cotations.traiter », comme le périmètre des
 * ventes : une surcharge de permissions REMPLACE la matrice par défaut, donc
 * une capacité ajoutée n'atteint jamais les rôles déjà surchargés en
 * production, et leur page d'accueil basculerait au hasard des surcharges.
 */
export function estVueChefProjet(role: Role | undefined) {
  return role === "CHEF_DE_PROJET";
}

/**
 * Comptes dont la barre latérale se réduit au profil et à la déconnexion.
 *
 * Rien à y cacher : un commercial n'a de toute façon ni la gestion des comptes
 * ni celle des permissions. L'intérêt est de ne pas lui montrer un bas de
 * menu vide là où d'autres rôles ont des entrées.
 */
export function piedDeMenuMinimal(role: Role | undefined) {
  return role === "COMMERCIAL" || role === "RH";
}
