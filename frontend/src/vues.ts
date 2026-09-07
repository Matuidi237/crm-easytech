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
  { to: "/partenaires", cle: "nav.partenaires", icone: "handshake" },
];

export function navDe(role: Role | undefined): EntreeNav[] {
  return role === "DG" ? NAV_DG : NAV_STANDARD;
}

/** Le DG ouvre sur ses indicateurs, pas sur l'état de la base clients. */
export function estVueDirection(role: Role | undefined) {
  return role === "DG";
}
