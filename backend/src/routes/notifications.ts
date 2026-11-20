import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { AVIS_AFFICHES } from "../lib/notifications.js";

export const notificationsRouter = Router();

/* Aucune capacité n'est exigée nulle part dans ce fichier : chacun ne lit que
   ses propres avis, et le destinataire vient du jeton, jamais de la requête.
   Demander un droit pour consulter ce qui vous est adressé n'aurait pas de
   sens. */

const SELECT_AVIS = {
  id: true,
  type: true,
  donnees: true,
  lien: true,
  lueLe: true,
  createdAt: true,
} as const;

/**
 * Les avis du compte connecté, les plus récents d'abord.
 *
 * Lus et non lus ensemble : une liste qui ne montrerait que le non-lu
 * disparaîtrait entièrement au premier coup d'œil, et on ne pourrait plus
 * retrouver ce qu'on vient de voir passer.
 */
notificationsRouter.get("/", async (req, res) => {
  const moi = req.utilisateur!;

  const [avis, nonLus] = await Promise.all([
    prisma.notification.findMany({
      where: { destinataireId: moi.id },
      orderBy: { createdAt: "desc" },
      take: AVIS_AFFICHES,
      select: SELECT_AVIS,
    }),
    prisma.notification.count({ where: { destinataireId: moi.id, lueLe: null } }),
  ]);

  res.json({ avis, nonLus });
});

/** Marque un avis comme lu. */
notificationsRouter.post("/:id/lu", async (req, res) => {
  const moi = req.utilisateur!;
  /* « updateMany » et non « update » : il filtre sur le destinataire dans la
     même requête, là où « update » exigerait de lire d'abord pour vérifier à
     qui l'avis appartient. */
  const { count } = await prisma.notification.updateMany({
    where: { id: req.params.id, destinataireId: moi.id, lueLe: null },
    data: { lueLe: new Date() },
  });
  res.json({ ok: true, modifies: count });
});

/** Marque tout comme lu. */
notificationsRouter.post("/lues", async (req, res) => {
  const moi = req.utilisateur!;
  const { count } = await prisma.notification.updateMany({
    where: { destinataireId: moi.id, lueLe: null },
    data: { lueLe: new Date() },
  });
  res.json({ ok: true, modifies: count });
});
