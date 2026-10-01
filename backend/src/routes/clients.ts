import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { Prisma, type RoleUtilisateur } from "@prisma/client";
import { requirePermission } from "../lib/auth.js";
import { masquerCoordonnees, perimetreClients } from "../lib/permissions.js";

export const clientsRouter = Router();

/**
 * Combine les filtres de recherche avec le périmètre de visibilité du compte.
 * Les deux doivent se cumuler par ET : un commercial qui recherche « banque »
 * ne doit trouver que des banques de SON périmètre, pas de toute la base.
 */
function avecPerimetre(
  filtres: Prisma.ClientWhereInput,
  utilisateur: { id: string; role: RoleUtilisateur }
): Prisma.ClientWhereInput {
  const perimetre = perimetreClients(utilisateur);
  return perimetre ? { AND: [filtres, perimetre] } : filtres;
}

clientsRouter.get("/", async (req, res) => {
  const { pays, ville, secteurActivite, commercialEnCharge, caMin, caMax, recherche, page = "1", pageSize = "25", tri, ordre } =
    req.query as Record<string, string>;

  const filtres: Prisma.ClientWhereInput = {};
  if (pays) filtres.pays = { equals: pays, mode: "insensitive" };
  if (ville) filtres.ville = { equals: ville, mode: "insensitive" };
  if (secteurActivite) filtres.secteurActivite = { equals: secteurActivite, mode: "insensitive" };
  if (commercialEnCharge) filtres.commercialEnCharge = { equals: commercialEnCharge, mode: "insensitive" };
  if (caMin || caMax) {
    filtres.chiffreAffaires = {
      ...(caMin ? { gte: new Prisma.Decimal(caMin) } : {}),
      ...(caMax ? { lte: new Prisma.Decimal(caMax) } : {}),
    };
  }
  if (recherche) {
    filtres.OR = [
      { nom: { contains: recherche, mode: "insensitive" } },
      { emailContact: { contains: recherche, mode: "insensitive" } },
      { nomContactInterne: { contains: recherche, mode: "insensitive" } },
    ];
  }

  const where = avecPerimetre(filtres, req.utilisateur!);

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
      include: { proprietaire: { select: { id: true, nomComplet: true } } },
    }),
    prisma.client.count({ where }),
  ]);

  res.json({
    clients: masquerCoordonnees(clients, req.utilisateur!.role),
    total,
    page: pageNum,
    pageSize: pageSizeNum,
  });
});

clientsRouter.get("/facets", async (req, res) => {
  // Les listes déroulantes ne doivent proposer que ce que le compte peut voir.
  const where = avecPerimetre({}, req.utilisateur!);

  const [pays, villes, secteurs, commerciaux] = await Promise.all([
    prisma.client.findMany({ distinct: ["pays"], select: { pays: true }, where: { AND: [where, { pays: { not: null } }] } }),
    prisma.client.findMany({ distinct: ["ville"], select: { ville: true }, where: { AND: [where, { ville: { not: null } }] } }),
    prisma.client.findMany({
      distinct: ["secteurActivite"],
      select: { secteurActivite: true },
      where: { AND: [where, { secteurActivite: { not: null } }] },
    }),
    prisma.client.findMany({
      distinct: ["commercialEnCharge"],
      select: { commercialEnCharge: true },
      where: { AND: [where, { commercialEnCharge: { not: null } }] },
    }),
  ]);

  res.json({
    pays: pays.map((p) => p.pays).filter(Boolean),
    villes: villes.map((v) => v.ville).filter(Boolean),
    secteurs: secteurs.map((s) => s.secteurActivite).filter(Boolean),
    commerciaux: commerciaux.map((c) => c.commercialEnCharge).filter(Boolean),
  });
});

clientsRouter.get("/stats", async (req, res) => {
  const where = avecPerimetre({}, req.utilisateur!);
  const et = (extra: Prisma.ClientWhereInput) => ({ AND: [where, extra] });

  const [total, sumResult, parPays, parSecteur, derniers, avecEmail, newslettersEnvoyees] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.aggregate({ _sum: { chiffreAffaires: true }, where }),
    prisma.client.groupBy({ by: ["pays"], _count: { _all: true }, where: et({ pays: { not: null } }), orderBy: { _count: { pays: "desc" } } }),
    prisma.client.groupBy({
      by: ["secteurActivite"],
      _count: { _all: true },
      where: et({ secteurActivite: { not: null } }),
      orderBy: { _count: { secteurActivite: "desc" } },
    }),
    prisma.client.findMany({ where, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.client.findMany({ where: et({ emailContact: { not: null } }), select: { emailContact: true } }),
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
    dernierClients: masquerCoordonnees(derniers, req.utilisateur!.role),
  });
});

clientsRouter.get("/:id", async (req, res) => {
  const client = await prisma.client.findFirst({
    where: avecPerimetre({ id: req.params.id }, req.utilisateur!),
    include: {
      proprietaire: { select: { id: true, nomComplet: true } },
      acces: { include: { utilisateur: { select: { id: true, nomComplet: true, role: true } } } },
    },
  });
  // Hors périmètre : on répond « introuvable » plutôt que « interdit », pour ne
  // pas révéler l'existence d'une fiche que le compte n'a pas le droit de voir.
  if (!client) return res.status(404).json({ error: "Client introuvable." });
  res.json(masquerCoordonnees([client], req.utilisateur!.role)[0]);
});

/**
 * Champs qu'une fiche saisie à la main peut porter.
 *
 * Liste explicite plutôt que recopie du corps de la requête : celui-ci
 * laisserait écrire « importJobId » ou « proprietaireId », donc rattacher une
 * fiche à un lot d'import qui n'existe pas, ou l'attribuer à un collègue.
 */
const CHAMPS_SAISIS = [
  "nom",
  "adressePhysique",
  "ville",
  "pays",
  "siteWeb",
  "emailContact",
  "nomContactInterne",
  "commercialEnCharge",
  "secteurActivite",
  "telephone",
  "notes",
] as const;

clientsRouter.post("/", requirePermission("clients.creer"), async (req, res) => {
  const corps = (req.body ?? {}) as Record<string, unknown>;

  const nom = typeof corps.nom === "string" ? corps.nom.trim() : "";
  if (!nom) return res.status(400).json({ error: "Le nom du client est obligatoire." });

  const donnees: Record<string, string | null> = { nom };
  for (const champ of CHAMPS_SAISIS) {
    if (champ === "nom") continue;
    const valeur = corps[champ];
    // Vide vaut absent : une chaîne blanche dans « pays » créerait une
    // catégorie fantôme dans les ventilations du directeur.
    donnees[champ] = typeof valeur === "string" && valeur.trim() ? valeur.trim() : null;
  }

  /* Un même nom deux fois dans le périmètre est presque toujours une double
     saisie. On refuse plutôt que de laisser deux fiches se partager un
     historique de ventes que personne ne saura ensuite réunir. */
  const doublon = await prisma.client.findFirst({
    where: avecPerimetre({ nom: { equals: nom, mode: "insensitive" } }, req.utilisateur!),
    select: { id: true },
  });
  if (doublon) {
    return res.status(409).json({ error: "Une fiche porte déjà ce nom dans votre périmètre.", id: doublon.id });
  }

  try {
    const client = await prisma.client.create({
      // Le créateur devient propriétaire : un commercial garde toujours accès
      // aux prospects qu'il a lui-même saisis.
      data: { ...donnees, nom, proprietaireId: req.utilisateur!.id },
    });
    res.status(201).json(client);
  } catch (err) {
    res.status(400).json({ error: "Impossible de créer le client.", details: String(err) });
  }
});

clientsRouter.put("/:id", requirePermission("clients.modifier"), async (req, res) => {
  const autorise = await prisma.client.findFirst({
    where: avecPerimetre({ id: req.params.id }, req.utilisateur!),
    select: { id: true },
  });
  if (!autorise) return res.status(404).json({ error: "Client introuvable." });

  try {
    // Le propriétaire ne se réattribue pas via une simple modification de fiche.
    const { proprietaireId, acces, ...donnees } = req.body ?? {};
    const client = await prisma.client.update({ where: { id: req.params.id }, data: donnees });
    res.json(client);
  } catch (err) {
    res.status(400).json({ error: "Impossible de modifier le client.", details: String(err) });
  }
});

clientsRouter.delete("/:id", requirePermission("clients.supprimer"), async (req, res) => {
  const autorise = await prisma.client.findFirst({
    where: avecPerimetre({ id: req.params.id }, req.utilisateur!),
    select: { id: true },
  });
  if (!autorise) return res.status(404).json({ error: "Client introuvable." });

  try {
    await prisma.client.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: "Impossible de supprimer le client.", details: String(err) });
  }
});
