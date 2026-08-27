import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";

export const clientsRouter = Router();

clientsRouter.get("/", async (req, res) => {
  const { pays, ville, secteurActivite, commercialEnCharge, caMin, caMax, recherche, page = "1", pageSize = "25", tri, ordre } = req.query as Record<string, string>;

  const where: Prisma.ClientWhereInput = {};
  if (pays) where.pays = { equals: pays, mode: "insensitive" };
  if (ville) where.ville = { equals: ville, mode: "insensitive" };
  if (secteurActivite) where.secteurActivite = { equals: secteurActivite, mode: "insensitive" };
  if (commercialEnCharge) where.commercialEnCharge = { equals: commercialEnCharge, mode: "insensitive" };
  if (caMin || caMax) {
    where.chiffreAffaires = {
      ...(caMin ? { gte: new Prisma.Decimal(caMin) } : {}),
      ...(caMax ? { lte: new Prisma.Decimal(caMax) } : {}),
    };
  }
  if (recherche) {
    where.OR = [
      { nom: { contains: recherche, mode: "insensitive" } },
      { emailContact: { contains: recherche, mode: "insensitive" } },
      { nomContactInterne: { contains: recherche, mode: "insensitive" } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSizeNum = Math.min(500, Math.max(1, parseInt(pageSize, 10) || 25));

  const CHAMPS_TRIABLES = ["nom", "secteurActivite", "pays", "commercialEnCharge", "chiffreAffaires", "createdAt"] as const;
  const champTri = (CHAMPS_TRIABLES as readonly string[]).includes(tri) ? tri : "nom";
  const sens: Prisma.SortOrder = ordre === "desc" ? "desc" : "asc";
  // Les colonnes optionnelles sont massivement nulles : on renvoie les vides en fin de liste.
  const orderBy =
    champTri === "nom" || champTri === "createdAt"
      ? { [champTri]: sens }
      : { [champTri]: { sort: sens, nulls: "last" } };

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: orderBy as Prisma.ClientOrderByWithRelationInput,
      skip: (pageNum - 1) * pageSizeNum,
      take: pageSizeNum,
    }),
    prisma.client.count({ where }),
  ]);

  res.json({ clients, total, page: pageNum, pageSize: pageSizeNum });
});

clientsRouter.get("/facets", async (_req, res) => {
  const [pays, villes, secteurs, commerciaux] = await Promise.all([
    prisma.client.findMany({ distinct: ["pays"], select: { pays: true }, where: { pays: { not: null } } }),
    prisma.client.findMany({ distinct: ["ville"], select: { ville: true }, where: { ville: { not: null } } }),
    prisma.client.findMany({ distinct: ["secteurActivite"], select: { secteurActivite: true }, where: { secteurActivite: { not: null } } }),
    prisma.client.findMany({ distinct: ["commercialEnCharge"], select: { commercialEnCharge: true }, where: { commercialEnCharge: { not: null } } }),
  ]);

  res.json({
    pays: pays.map((p) => p.pays).filter(Boolean),
    villes: villes.map((v) => v.ville).filter(Boolean),
    secteurs: secteurs.map((s) => s.secteurActivite).filter(Boolean),
    commerciaux: commerciaux.map((c) => c.commercialEnCharge).filter(Boolean),
  });
});

clientsRouter.get("/stats", async (_req, res) => {
  const [total, sumResult, parPays, parSecteur, derniers, avecEmail, newslettersEnvoyees] = await Promise.all([
    prisma.client.count(),
    prisma.client.aggregate({ _sum: { chiffreAffaires: true } }),
    prisma.client.groupBy({ by: ["pays"], _count: { _all: true }, where: { pays: { not: null } }, orderBy: { _count: { pays: "desc" } } }),
    prisma.client.groupBy({ by: ["secteurActivite"], _count: { _all: true }, where: { secteurActivite: { not: null } }, orderBy: { _count: { secteurActivite: "desc" } } }),
    prisma.client.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.client.findMany({ where: { emailContact: { not: null } }, select: { emailContact: true } }),
    prisma.newsletter.count({ where: { statut: "ENVOYEE" } }),
  ]);

  // Un client peut porter plusieurs contacts séparés par "; " — on compte les adresses réelles.
  let nbContacts = 0;
  let nbClientsAvecEmail = 0;
  for (const { emailContact } of avecEmail) {
    const adresses = (emailContact ?? "").split(";").map((e) => e.trim()).filter((e) => e.includes("@"));
    if (adresses.length > 0) {
      nbClientsAvecEmail++;
      nbContacts += adresses.length;
    }
  }

  res.json({
    totalClients: total,
    nbClientsAvecEmail,
    nbContacts,
    nbPays: parPays.length,
    nbSecteurs: parSecteur.length,
    newslettersEnvoyees,
    chiffreAffairesCumule: sumResult._sum.chiffreAffaires ?? 0,
    repartitionPays: parPays.map((p) => ({ label: p.pays, count: p._count._all })),
    repartitionSecteur: parSecteur.map((s) => ({ label: s.secteurActivite, count: s._count._all })),
    dernierClients: derniers,
  });
});

clientsRouter.get("/:id", async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) return res.status(404).json({ error: "Client introuvable." });
  res.json(client);
});

clientsRouter.post("/", async (req, res) => {
  try {
    const client = await prisma.client.create({ data: req.body });
    res.status(201).json(client);
  } catch (err) {
    res.status(400).json({ error: "Impossible de créer le client.", details: String(err) });
  }
});

clientsRouter.put("/:id", async (req, res) => {
  try {
    const client = await prisma.client.update({ where: { id: req.params.id }, data: req.body });
    res.json(client);
  } catch (err) {
    res.status(400).json({ error: "Impossible de modifier le client.", details: String(err) });
  }
});

clientsRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.client.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: "Impossible de supprimer le client.", details: String(err) });
  }
});
