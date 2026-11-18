/**
 * Désignation du chef de projet responsable d'une demande de cotation.
 *
 * Une demande sans responsable n'est à personne, et une demande qui n'est à
 * personne attend. C'est le défaut que ce mécanisme supprime : tout dossier
 * soumis porte un nom dès la seconde où il entre dans le système, avant même
 * que quiconque l'ait ouvert.
 */

import type { RoleUtilisateur } from "@prisma/client";
import { prisma } from "./prisma.js";
import { peut } from "./permissions.js";

export type Traitant = { id: string; nomComplet: string };

/**
 * Les comptes à qui une demande de cotation peut revenir.
 *
 * Déduits de la capacité et non du rôle : la matrice est modifiable depuis
 * l'interface, et coder « CHEF_DE_PROJET » en dur ici ferait diverger la
 * répartition de ce que le réglage des permissions affirme.
 *
 * Les comptes de supervision sont écartés. Le directeur général et les
 * administrateurs peuvent traiter une cotation, puisqu'ils peuvent tout, mais
 * leur en distribuer automatiquement reviendrait à mettre le directeur dans la
 * file de production. Ils gardent le droit d'agir, ils n'entrent pas dans le
 * tour.
 *
 * Repli volontaire : si ce tri ne laisse personne, on retombe sur tous ceux
 * qui peuvent traiter. Mieux vaut un dossier chez l'administrateur que pas de
 * responsable du tout.
 *
 * Le filtrage se fait en mémoire parce que la capacité n'existe pas en base :
 * elle se calcule à partir du rôle et des surcharges tenues en cache.
 */
export async function traitantsDisponibles(): Promise<Traitant[]> {
  const comptes = await prisma.utilisateur.findMany({
    where: { actif: true },
    select: { id: true, nomComplet: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  const peuventTraiter = comptes.filter((c) =>
    peut(c.role as RoleUtilisateur, "cotations.traiter")
  );
  const dediees = peuventTraiter.filter(
    (c) => !peut(c.role as RoleUtilisateur, "cotations.superviser")
  );

  return (dediees.length > 0 ? dediees : peuventTraiter).map(({ id, nomComplet }) => ({
    id,
    nomComplet,
  }));
}

/**
 * Choisit à qui revient une nouvelle demande : le moins chargé.
 *
 * Un tour de rôle strict distribue à l'aveugle et finit par donner un dossier
 * de plus à celui qui en a déjà dix. La charge en cours est le seul critère
 * dont on dispose, et elle a le mérite de se corriger d'elle-même.
 *
 * À égalité, le plus ancien compte l'emporte, pour que la répartition soit
 * reproductible : un départage au hasard rendrait le comportement impossible
 * à expliquer le jour où quelqu'un demandera pourquoi il a hérité du dossier.
 *
 * Renvoie null quand aucun compte ne peut traiter. La demande est alors
 * enregistrée sans responsable, et un habilité devra l'affecter à la main.
 */
export async function choisirResponsable(): Promise<Traitant | null> {
  const traitants = await traitantsDisponibles();
  if (traitants.length === 0) return null;
  if (traitants.length === 1) return traitants[0];

  const enCours = await prisma.demandeCotation.groupBy({
    by: ["responsableId"],
    where: {
      responsableId: { in: traitants.map((t) => t.id) },
      statut: { in: ["NON_TRAITEE", "EN_COURS"] },
    },
    _count: { _all: true },
  });

  const charge = new Map(enCours.map((l) => [l.responsableId, l._count._all]));
  let choisi = traitants[0];
  let meilleure = charge.get(choisi.id) ?? 0;
  for (const t of traitants.slice(1)) {
    const c = charge.get(t.id) ?? 0;
    if (c < meilleure) {
      choisi = t;
      meilleure = c;
    }
  }
  return choisi;
}
