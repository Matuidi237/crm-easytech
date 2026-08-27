import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requirePermission } from "../lib/auth.js";
import { peut } from "../lib/permissions.js";

/**
 * Ouverture d'accès nominatifs : un responsable désigne les clients qu'un
 * commercial peut consulter, sans lui ouvrir la base entière.
 */
export const accesRouter = Router();

// Toutes les routes de ce module supposent le droit d'accorder des accès.
accesRouter.use(requirePermission("acces.accorder"));

/** Comptes susceptibles de recevoir un accès : ceux qui ne voient pas déjà tout. */
accesRouter.get("/beneficiaires", async (_req, res) => {
  const comptes = await prisma.utilisateur.findMany({
    where: { actif: true },
    orderBy: { nomComplet: "asc" },
    select: { id: true, nomComplet: true, identifiant: true, role: true, _count: { select: { accesAccordes: true } } },
  });

  res.json(
    comptes
      .filter((c) => !peut(c.role, "clients.voirTous"))
      .map((c) => ({
        id: c.id,
        nomComplet: c.nomComplet,
        identifiant: c.identifiant,
        role: c.role,
        nbAcces: c._count.accesAccordes,
      }))
  );
});

/** Clients actuellement ouverts à un compte donné. */
accesRouter.get("/utilisateur/:id", async (req, res) => {
  const acces = await prisma.accesClient.findMany({
    where: { utilisateurId: req.params.id },
    orderBy: { createdAt: "desc" },
    include: { client: { select: { id: true, nom: true, secteurActivite: true, pays: true } } },
  });

  res.json(
    acces.map((a) => ({
      id: a.id,
      client: a.client,
      accordePar: a.accordeParNom,
      accordeLe: a.createdAt,
    }))
  );
});

/** Ouvre un ou plusieurs clients à un compte. Idempotent. */
accesRouter.post("/", async (req, res) => {
  const { utilisateurId, clientIds } = req.body as { utilisateurId?: string; clientIds?: string[] };

  if (!utilisateurId || !Array.isArray(clientIds) || clientIds.length === 0) {
    return res.status(400).json({ error: "Un compte et au moins un client sont requis." });
  }

  const beneficiaire = await prisma.utilisateur.findUnique({ where: { id: utilisateurId } });
  if (!beneficiaire) return res.status(404).json({ error: "Compte introuvable." });

  // Ouvrir des accès à quelqu'un qui voit déjà toute la base n'a aucun effet :
  // autant le dire clairement plutôt que d'enregistrer des lignes inutiles.
  if (peut(beneficiaire.role, "clients.voirTous")) {
    return res.status(400).json({
      error: `${beneficiaire.nomComplet} voit déjà l'ensemble de la base : aucun accès nominatif n'est nécessaire.`,
    });
  }

  const existants = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    select: { id: true },
  });
  if (existants.length === 0) return res.status(404).json({ error: "Aucun de ces clients n'existe." });

  const resultat = await prisma.accesClient.createMany({
    data: existants.map((c) => ({
      clientId: c.id,
      utilisateurId,
      accordeParId: req.utilisateur!.id,
      accordeParNom: req.utilisateur!.nomComplet,
    })),
    skipDuplicates: true, // réouvrir un accès déjà donné ne doit pas échouer
  });

  res.status(201).json({
    accordes: resultat.count,
    dejaOuverts: existants.length - resultat.count,
    introuvables: clientIds.length - existants.length,
  });
});

/** Retire l'accès d'un compte à un client. */
accesRouter.delete("/", async (req, res) => {
  const { utilisateurId, clientId } = req.body as { utilisateurId?: string; clientId?: string };
  if (!utilisateurId || !clientId) {
    return res.status(400).json({ error: "Compte et client requis." });
  }

  const supprime = await prisma.accesClient.deleteMany({ where: { utilisateurId, clientId } });
  if (supprime.count === 0) return res.status(404).json({ error: "Cet accès n'existe pas." });

  res.status(204).send();
});

/** Retire d'un coup tous les accès d'un compte. */
accesRouter.delete("/utilisateur/:id", async (req, res) => {
  const supprime = await prisma.accesClient.deleteMany({ where: { utilisateurId: req.params.id } });
  res.json({ retires: supprime.count });
});
