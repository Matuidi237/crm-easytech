import { Router } from "express";
import multer from "multer";
import type { TypeCampagne } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { parseUploadedFile } from "../lib/fileParser.js";

export const campagnesRouter = Router();

/* 10 Mo : une liste d'adresses, même longue, pèse quelques centaines de Ko.
   Au-delà, c'est qu'on importe autre chose qu'une liste. */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const TYPES: TypeCampagne[] = ["MAILING", "NEWSLETTER"];

/**
 * Validation d'adresse volontairement permissive.
 *
 * Une expression stricte rejette des adresses pourtant valides (apostrophes,
 * caractères accentués, domaines longs). Le seul vrai test d'une adresse est
 * l'envoi ; ici on n'écarte que ce qui ne peut pas être une adresse, pour
 * éviter d'importer des en-têtes de colonne ou des cellules vides.
 */
function adresseVraisemblable(valeur: string) {
  const v = valeur.trim();
  if (v.length < 6 || v.length > 254) return false;
  if (v.includes(" ")) return false;
  const arobases = v.split("@").length - 1;
  if (arobases !== 1) return false;
  const [local, domaine] = v.split("@");
  return local.length > 0 && domaine.includes(".") && !domaine.startsWith(".") && !domaine.endsWith(".");
}

/** Colonnes susceptibles de porter l'adresse, puis le nom. */
const CLES_EMAIL = ["email", "mail", "adresse", "adressemail", "courriel", "e-mail"];
const CLES_NOM = ["nom", "name", "contact", "prenom", "société", "societe", "entreprise", "client"];

const normaliser = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Extrait les destinataires d'un fichier.
 *
 * On cherche d'abord une colonne d'adresses par son intitulé ; si aucun
 * intitulé ne convient, on balaie toutes les cellules. Un fichier collé à la
 * va-vite, sans entête, reste ainsi exploitable, ce qui est le cas courant
 * quand une liste arrive par message.
 */
function extraireDestinataires(rows: Record<string, unknown>[], headers: string[]) {
  const colonneEmail = headers.find((h) => CLES_EMAIL.includes(normaliser(h)));
  const colonneNom = headers.find((h) => CLES_NOM.includes(normaliser(h)));

  const trouves = new Map<string, { email: string; nom: string | null }>();
  let rejetees = 0;

  /* Un fichier sans ligne d'entête voit sa première ligne prise pour des noms
     de colonnes : la première adresse serait perdue sans un mot. Si un entête
     est lui-même une adresse, c'est que le fichier n'en avait pas, et cette
     ligne est de la donnée. */
  if (!colonneEmail) {
    for (const h of headers) {
      const brut = h.trim();
      if (adresseVraisemblable(brut)) trouves.set(brut.toLowerCase(), { email: brut.toLowerCase(), nom: null });
    }
  }

  for (const row of rows) {
    let email: string | null = null;

    if (colonneEmail) {
      const brut = String(row[colonneEmail] ?? "").trim();
      if (brut) email = brut;
    } else {
      // Aucun entête reconnaissable : on prend la première cellule qui
      // ressemble à une adresse.
      for (const valeur of Object.values(row)) {
        const brut = String(valeur ?? "").trim();
        if (adresseVraisemblable(brut)) {
          email = brut;
          break;
        }
      }
    }

    if (!email) continue;
    if (!adresseVraisemblable(email)) {
      rejetees += 1;
      continue;
    }

    // La casse ne distingue pas deux adresses : on dédoublonne en minuscules.
    const cle = email.toLowerCase();
    if (trouves.has(cle)) continue;

    const nom = colonneNom ? String(row[colonneNom] ?? "").trim() || null : null;
    trouves.set(cle, { email: cle, nom });
  }

  return {
    destinataires: [...trouves.values()],
    rejetees,
    colonneEmail: colonneEmail ?? null,
    /* L'interface doit pouvoir dire que le fichier n'avait pas d'entête, sans
       quoi le décompte de lignes lues paraîtrait faux d'une unité. */
    sansEntete: !colonneEmail && headers.some((h) => adresseVraisemblable(h.trim())),
  };
}

/** Liste des campagnes d'un type donné, la plus récente d'abord. */
campagnesRouter.get("/", async (req, res) => {
  const type = String(req.query.type ?? "").toUpperCase() as TypeCampagne;
  const filtre = TYPES.includes(type) ? { type } : {};

  const campagnes = await prisma.campagne.findMany({
    where: filtre,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      titre: true,
      objet: true,
      statut: true,
      fichierSource: true,
      creeParNom: true,
      envoyeeLe: true,
      createdAt: true,
      _count: { select: { destinataires: true } },
    },
  });

  res.json({
    campagnes: campagnes.map(({ _count, ...c }) => ({ ...c, nbDestinataires: _count.destinataires })),
  });
});

campagnesRouter.get("/:id", async (req, res) => {
  const campagne = await prisma.campagne.findUnique({
    where: { id: req.params.id },
    include: {
      // Un aperçu suffit à l'écran ; la liste entière n'a pas à transiter.
      destinataires: { take: 50, orderBy: { email: "asc" } },
      _count: { select: { destinataires: true } },
    },
  });
  if (!campagne) return res.status(404).json({ error: "Campagne introuvable." });

  const { _count, ...reste } = campagne;
  res.json({ ...reste, nbDestinataires: _count.destinataires });
});

/**
 * Analyse d'un fichier de destinataires, sans rien enregistrer.
 *
 * L'aperçu précède l'enregistrement : on montre ce qui a été compris avant de
 * l'écrire, comme pour l'import de clients. Une liste d'envoi mal lue se paie
 * en messages partis au mauvais endroit.
 */
campagnesRouter.post("/destinataires/analyser", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });

  try {
    const { headers, rows } = parseUploadedFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    const { destinataires, rejetees, colonneEmail, sansEntete } = extraireDestinataires(rows, headers);

    res.json({
      fichier: req.file.originalname,
      // La ligne d'entête est de la donnée quand il n'y a pas d'entête.
      lignesLues: rows.length + (sansEntete ? 1 : 0),
      colonneEmail,
      sansEntete,
      nbDestinataires: destinataires.length,
      rejetees,
      apercu: destinataires.slice(0, 20),
      destinataires,
    });
  } catch {
    res.status(400).json({ error: "Fichier illisible. Formats acceptés : CSV, XLSX, JSON." });
  }
});

campagnesRouter.post("/", async (req, res) => {
  const { type, titre, objet, contenuHtml, fichierSource, destinataires } = req.body as {
    type?: string;
    titre?: string;
    objet?: string;
    contenuHtml?: string;
    fichierSource?: string | null;
    destinataires?: { email: string; nom?: string | null }[];
  };

  const typeValide = String(type ?? "").toUpperCase() as TypeCampagne;
  if (!TYPES.includes(typeValide)) return res.status(400).json({ error: "Type de campagne inconnu." });
  if (!titre?.trim()) return res.status(400).json({ error: "Le titre est requis." });
  if (!objet?.trim()) return res.status(400).json({ error: "L'objet de l'email est requis." });

  // Dernier filet : le navigateur a déjà dédoublonné, la base l'impose, mais
  // rien ne garantit que l'appel vienne de l'interface.
  const propres = new Map<string, { email: string; nom: string | null }>();
  for (const d of destinataires ?? []) {
    const email = String(d.email ?? "").trim().toLowerCase();
    if (!adresseVraisemblable(email)) continue;
    if (!propres.has(email)) propres.set(email, { email, nom: d.nom?.trim() || null });
  }

  const campagne = await prisma.campagne.create({
    data: {
      type: typeValide,
      titre: titre.trim(),
      objet: objet.trim(),
      contenuHtml: contenuHtml ?? "",
      fichierSource: fichierSource || null,
      creeParId: req.utilisateur?.id ?? null,
      creeParNom: req.utilisateur?.nomComplet ?? "",
      /* PRETE et non ENVOYEE : rien ne part tant que la partie technique
         (SMTP) n'est pas branchée. L'état dit exactement où l'on en est. */
      statut: propres.size > 0 ? "PRETE" : "BROUILLON",
      destinataires: { create: [...propres.values()] },
    },
    select: { id: true, type: true, titre: true, statut: true },
  });

  res.status(201).json(campagne);
});

campagnesRouter.delete("/:id", async (req, res) => {
  // Les destinataires partent en cascade avec leur campagne.
  const supprimee = await prisma.campagne.deleteMany({ where: { id: req.params.id } });
  if (supprimee.count === 0) return res.status(404).json({ error: "Campagne introuvable." });
  res.status(204).end();
});
