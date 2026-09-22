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
];

/** Vue de la direction générale. */
const NAV_DG: EntreeNav[] = [
  { to: "/", cle: "nav.dashboard", icone: "dashboard", end: true },
  { to: "/equipes", cle: "nav.equipes", icone: "team" },
  { to: "/clients", cle: "nav.clients", icone: "users" },
  { to: "/campagnes", cle: "nav.campagnes", icone: "mail", requiert: "newsletters.voir" },
  { to: "/partenaires", cle: "nav.partenaires", icone: "handshake" },
];

/**
 * Vue du commercial : son activité à lui.
 *
 * Aucune entrée n'est conditionnée par une permission. Ce sont ses propres
 * chiffres, son portefeuille, ses commissions : le droit de les consulter ne
 * se discute pas, et les routes correspondantes ne lisent que le compte
 * connecté.
 */
const NAV_COMMERCIAL: EntreeNav[] = [
  { to: "/", cle: "nav.dashboard", icone: "dashboard", end: true },
  { to: "/ventes", cle: "nav.ventes", icone: "tag" },
  { to: "/clients", cle: "nav.clients", icone: "users" },
  { to: "/commissions", cle: "nav.commissions", icone: "coins" },
  { to: "/agenda", cle: "nav.agenda", icone: "calendar" },
];

export function navDe(role: Role | undefined): EntreeNav[] {
  if (role === "DG") return NAV_DG;
  if (role === "COMMERCIAL") return NAV_COMMERCIAL;
  return NAV_STANDARD;
}

/** Le DG ouvre sur ses indicateurs, pas sur l'état de la base clients. */
export function estVueDirection(role: Role | undefined) {
  return role === "DG";
}

/**
 * Le commercial ouvre sur sa propre performance.
 *
 * Le responsable commercial en est volontairement exclu : il encadre une
 * équipe, ses questions portent sur les autres autant que sur lui, et sa vue
 * reste celle de la base clients tant qu'elle n'a pas été traitée.
 */
export function estVueCommerciale(role: Role | undefined) {
  return role === "COMMERCIAL";
}

/**
 * Comptes dont la barre latérale se réduit au profil et à la déconnexion.
 *
 * Rien à y cacher : un commercial n'a de toute façon ni la gestion des comptes
 * ni celle des permissions. L'intérêt est de ne pas lui montrer un bas de
 * menu vide là où d'autres rôles ont des entrées.
 */
export function piedDeMenuMinimal(role: Role | undefined) {
  return role === "COMMERCIAL";
}
