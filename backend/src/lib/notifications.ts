/**
 * Émission des avis, pour toute l'application.
 *
 * Un seul endroit d'où partent les notifications, quel que soit le module qui
 * les déclenche. Deux mécanismes parallèles donneraient deux cloches à
 * surveiller, et c'est exactement ce qu'une notification est censée éviter.
 *
 * Le texte n'est jamais composé ici. On enregistre un type stable et les
 * valeurs qui rempliront la phrase ; l'interface la rédige dans la langue du
 * lecteur. Écrire « Vous avez reçu la demande COT-2026-0041 » en base figerait
 * le français au moment de l'émission.
 */

import { prisma } from "./prisma.js";

/**
 * Les types d'avis connus.
 *
 * Cette liste n'est pas une contrainte de base, c'est un index : la colonne
 * reste du texte libre pour qu'un module ajouté plus tard n'impose pas une
 * migration. Elle sert à tenir les clés de traduction en face, et à ce qu'on
 * sache ici ce qui existe.
 *
 * Chaque type a sa clé « notif.<type> » dans les deux dictionnaires.
 */
export const TYPES_NOTIFICATION = [
  "cotation.affectee",
  "cotation.reaffectee",
  "cotation.retiree",
  "cotation.transmise",
  "cotation.revision",
  "cotation.receptionnee",
] as const;

export type TypeNotification = (typeof TYPES_NOTIFICATION)[number];

type Avis = {
  destinataireId: string | null | undefined;
  type: TypeNotification;
  donnees?: Record<string, string>;
  lien?: string;
  /** Qui déclenche. Personne ne s'avertit soi-même. */
  acteurId?: string;
  estDemo?: boolean;
};

/**
 * Dépose un avis.
 *
 * Ne lève jamais : une notification est un confort, et un module ne doit pas
 * échouer parce que l'avis qui l'accompagne n'a pas pu s'écrire. L'erreur part
 * au journal, l'opération métier reste faite.
 *
 * Ignore silencieusement un destinataire absent, et le cas où l'acteur est
 * aussi le destinataire : s'avertir de ce qu'on vient de faire soi-même ne
 * renseigne personne et noie les avis qui comptent.
 */
export async function notifier(avis: Avis): Promise<void> {
  if (!avis.destinataireId) return;
  if (avis.acteurId && avis.acteurId === avis.destinataireId) return;

  try {
    await prisma.notification.create({
      data: {
        destinataireId: avis.destinataireId,
        type: avis.type,
        donnees: avis.donnees ?? undefined,
        lien: avis.lien ?? null,
        estDemo: avis.estDemo ?? false,
      },
    });
  } catch (err) {
    console.error("Notification non enregistrée :", err);
  }
}

/** Plusieurs avis d'un coup, chacun indépendant des autres. */
export async function notifierPlusieurs(avis: Avis[]): Promise<void> {
  await Promise.all(avis.map(notifier));
}

/**
 * Au-delà de ce nombre, la liste déroulante cesse d'être lisible.
 *
 * Les avis plus anciens ne sont pas effacés pour autant : ils restent en base,
 * et c'est l'affichage qui se borne. Une purge est un geste d'administration,
 * pas un effet de bord d'un affichage.
 */
export const AVIS_AFFICHES = 30;
