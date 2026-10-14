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

/**
 * Forme comparable d'un nom d'entreprise.
 *
 * Minuscules, accents retirés, ponctuation et espaces écrasés. « ABIDJAN
 * CIV », « Abidjan-CIV » et « abidjan civ » désignent la même société et ne
 * doivent pas faire trois fiches.
 *
 * La forme juridique n'est PAS retirée : « Orange SA » et « Orange SARL »
 * sont deux personnes morales distinctes, et les confondre ferait refuser la
 * création d'un client légitime, ce qui est plus grave qu'un doublon.
 */
function formeComparable(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Doublon = { id: string; nom: string; motif: "NOM" | "EMAIL"; visible: boolean };

/** Le compte peut-il déjà voir cette fiche, ou appartient-elle à un collègue ? */
async function ficheVisible(clientId: string, utilisateur: { id: string; role: RoleUtilisateur }) {
  const perimetre = perimetreClients(utilisateur);
  if (!perimetre) return true; // le compte voit toute la base
  const vue = await prisma.client.findFirst({
    where: { AND: [{ id: clientId }, perimetre] },
    select: { id: true },
  });
  return vue !== null;
}

/**
 * Cherche une fiche correspondante dans toute la base.
 *
 * Deux passes plutôt qu'un chargement complet de la table : l'égalité
 * insensible à la casse se règle en SQL, et seules les fiches partageant le
 * mot le plus significatif du nom sont rapprochées en mémoire. Charger les
 * milliers de noms à chaque création tiendrait aujourd'hui et plus demain.
 */
export async function chercherDoublon(
  nom: string,
  email: string | null,
  utilisateur: { id: string; role: RoleUtilisateur },
  /* Fiche à ignorer : en modification, une fiche est toujours son propre
     homonyme, et sans cette exclusion plus aucune ne pourrait être
     enregistrée sans changer de nom. */
  saufId?: string
): Promise<Doublon | null> {
  const horsSoi = saufId ? { id: { not: saufId } } : {};
  const retenir = async (c: { id: string; nom: string }, motif: Doublon["motif"]): Promise<Doublon> => ({
    id: c.id,
    nom: c.nom,
    motif,
    visible: await ficheVisible(c.id, utilisateur),
  });

  // 1. Le même nom, à la casse près.
  const exact = await prisma.client.findFirst({
    where: { ...horsSoi, nom: { equals: nom, mode: "insensitive" } },
    select: { id: true, nom: true },
  });
  if (exact) return retenir(exact, "NOM");

  // 2. La même adresse de contact, qui identifie mieux qu'un nom approchant.
  if (email) {
    const parEmail = await prisma.client.findFirst({
      where: { ...horsSoi, emailContact: { equals: email, mode: "insensitive" } },
      select: { id: true, nom: true },
    });
    if (parEmail) return retenir(parEmail, "EMAIL");
  }

  /* 3. Rapprochement sur la forme comparable. On ne compare qu'aux fiches
     contenant le mot le plus long du nom : « Abidjanaise Assurance » ne se
     compare pas aux 1 600 autres, seulement à celles qui parlent
     d'« abidjanaise ». */
  const cible = formeComparable(nom);
  if (!cible) return null;
  const motPivot = cible.split(" ").sort((a, b) => b.length - a.length)[0];
  if (!motPivot || motPivot.length < 4) return null;

  const candidats = await prisma.client.findMany({
    where: { ...horsSoi, nom: { contains: motPivot, mode: "insensitive" } },
    take: 200,
    select: { id: true, nom: true },
  });
  const correspondance = candidats.find((c) => formeComparable(c.nom) === cible);
  return correspondance ? retenir(correspondance, "NOM") : null;
}

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

  /* Doublon cherché dans TOUTE la base, pas seulement dans le périmètre du
     compte. Un client déjà suivi par un collègue ne doit pas recevoir une
     seconde fiche : deux fiches jumelles se partagent un historique de ventes
     que personne ne saura ensuite réunir, et le jour où l'on veut le chiffre
     d'affaires total du client, il manque la moitié. */
  const existant = await chercherDoublon(nom, donnees.emailContact, req.utilisateur!);
  if (existant) {
    /* Le propriétaire n'est pas nommé : savoir qu'une fiche existe suffit à
       ne pas la dupliquer, connaître le commercial qui la détient relève de
       l'encadrement. Un responsable rattachera la fiche s'il y a lieu. */
    return res.status(409).json({
      error:
        existant.motif === "EMAIL"
          ? "Cette adresse de contact est déjà rattachée à une fiche existante."
          : "Un client portant ce nom existe déjà dans le système.",
      motif: existant.motif,
      nomExistant: existant.nom,
      /* L'identifiant n'est renvoyé que si le compte peut voir la fiche :
         sinon il servirait à la lire par un autre appel. */
      id: existant.visible ? existant.id : null,
    });
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

  /* Mêmes règles qu'à la création : liste de champs explicite, chaînes vides
     ramenées à l'absence, et refus du doublon. Une fiche qu'on renomme pour
     lui donner le nom d'une autre crée exactement le doublon que la création
     refuse, et il serait absurde de l'interdire d'un côté seulement. */
  const corps = (req.body ?? {}) as Record<string, unknown>;

  const nom = typeof corps.nom === "string" ? corps.nom.trim() : "";
  if (!nom) return res.status(400).json({ error: "Le nom du client est obligatoire." });

  const donnees: Record<string, string | null> = { nom };
  for (const champ of CHAMPS_SAISIS) {
    if (champ === "nom") continue;
    const valeur = corps[champ];
    donnees[champ] = typeof valeur === "string" && valeur.trim() ? valeur.trim() : null;
  }

  const existant = await chercherDoublon(nom, donnees.emailContact, req.utilisateur!, req.params.id);
  if (existant) {
    return res.status(409).json({
      error:
        existant.motif === "EMAIL"
          ? "Cette adresse de contact est déjà rattachée à une fiche existante."
          : "Un client portant ce nom existe déjà dans le système.",
      motif: existant.motif,
      nomExistant: existant.nom,
      id: existant.visible ? existant.id : null,
    });
  }

  try {
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
