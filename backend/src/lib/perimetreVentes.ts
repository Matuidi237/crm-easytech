/**
 * Quelles ventes un compte voit dans les indicateurs de pilotage.
 *
 * La direction voit l'entreprise ; le responsable commercial voit son équipe.
 * Sans cette distinction, son tableau de bord lui annonçait le chiffre
 * d'affaires de gens qu'il n'encadre pas, et aucun de ses indicateurs ne
 * répondait à la question qu'il se pose : où en est MON équipe.
 */

import type { Prisma, RoleUtilisateur } from "@prisma/client";
import { prisma } from "./prisma.js";

export type Lecteur = { id: string; role: RoleUtilisateur };

/**
 * Vrai pour les comptes dont les chiffres se limitent à leur équipe.
 *
 * Test sur le rôle et non sur une capacité, contrairement au reste de
 * l'application, et c'est délibéré. Une capacité « voir toutes les équipes »
 * aurait été plus souple, mais une surcharge de permissions enregistrée en
 * base REMPLACE la matrice par défaut au lieu de s'y ajouter : les rôles
 * déjà surchargés en production ne l'auraient pas reçue, et leurs tableaux de
 * bord se seraient vidés du jour au lendemain. Le défaut s'est déjà produit
 * une fois, il ne coûte rien de ne pas le reproduire.
 *
 * Le responsable commercial est aujourd'hui le seul rôle qui encadre une
 * équipe de vendeurs. Le jour où un autre apparaît, c'est ici qu'on l'ajoute.
 */
export function voitSonEquipeSeulement(role: RoleUtilisateur): boolean {
  return role === "RESPONSABLE_COMMERCIAL";
}

/**
 * Les comptes dont ce lecteur suit les ventes : lui-même et ses rattachés.
 *
 * Lui-même en fait partie : un responsable commercial porte un portefeuille
 * en plus d'encadrer, et s'exclure de son propre bilan le rendrait faux.
 */
export async function equipeDe(lecteurId: string): Promise<string[]> {
  const rattaches = await prisma.utilisateur.findMany({
    where: { responsableId: lecteurId },
    select: { id: true },
  });
  return [lecteurId, ...rattaches.map((r) => r.id)];
}

/**
 * Restriction Prisma sur les ventes, ou null quand il n'y en a aucune.
 *
 * Null plutôt qu'un filtre vide : l'appelant distingue ainsi « tout voir » de
 * « ne rien voir », et un filtre oublié se remarque au lieu de passer pour
 * une absence de restriction.
 */
export async function perimetreVentes(
  lecteur: Lecteur
): Promise<Prisma.VenteWhereInput | null> {
  if (!voitSonEquipeSeulement(lecteur.role)) return null;
  return { vendeurId: { in: await equipeDe(lecteur.id) } };
}

/** Même chose pour les comptes eux-mêmes, quand on liste une équipe. */
export async function perimetreVendeurs(
  lecteur: Lecteur
): Promise<Prisma.UtilisateurWhereInput | null> {
  if (!voitSonEquipeSeulement(lecteur.role)) return null;
  return { id: { in: await equipeDe(lecteur.id) } };
}

/** Combine une restriction éventuelle avec le filtre propre à la requête. */
export function avec<T extends object>(base: T, restriction: T | null): T {
  return restriction ? ({ AND: [base, restriction] } as unknown as T) : base;
}
