/**
 * Quelles ventes un compte voit dans les indicateurs de pilotage.
 *
 * La direction voit l'entreprise entière, ventes de tous les comptes
 * confondues ; le responsable commercial voit la force de vente, c'est-à-dire
 * les commerciaux de tous les pays du groupe et lui-même. Sans cette
 * distinction, son tableau de bord mêlait à ses chiffres des ventes
 * enregistrées par des comptes qu'il n'encadre pas.
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
 * Les rôles qui composent la force de vente.
 *
 * Le responsable commercial en fait partie : il porte un portefeuille en plus
 * d'encadrer, et s'exclure de son propre bilan le rendrait faux.
 */
const ROLES_FORCE_DE_VENTE = ["RESPONSABLE_COMMERCIAL", "COMMERCIAL"] as const;

/**
 * Les comptes dont ce lecteur suit les ventes.
 *
 * Tous les commerciaux du groupe, et non les seuls comptes qui le désignent
 * comme responsable hiérarchique. Le rattachement décrit l'organigramme, il
 * ne décrit pas le périmètre : un commercial recruté et oublié dans le champ
 * « responsable » disparaissait de tous ses indicateurs sans qu'aucun écran
 * ne le signale. Le cas s'est produit, un compte réel était dans cet état.
 *
 * À revoir le jour où le groupe nomme un responsable commercial par zone :
 * il faudra alors revenir au rattachement, et signaler les non rattachés.
 */
export async function equipeDe(lecteurId: string): Promise<string[]> {
  const force = await prisma.utilisateur.findMany({
    where: { role: { in: [...ROLES_FORCE_DE_VENTE] } },
    select: { id: true },
  });
  const ids = new Set(force.map((u) => u.id));
  ids.add(lecteurId);
  return [...ids];
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
