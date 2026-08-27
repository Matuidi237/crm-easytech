import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { parseUploadedFile } from "../lib/fileParser.js";
import { prisma } from "../lib/prisma.js";
import { CLIENT_FIELD_KEYS, type ClientFieldKey } from "../lib/clientFields.js";
import { canoniserSecteur } from "../lib/secteurs.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const importRouter = Router();

// In-memory store of the last parsed file per upload, keyed by a token.
// Simple enough for a local single-user tool; avoids re-uploading for the commit step.
const pendingImports = new Map<string, { headers: string[]; rows: Record<string, unknown>[]; fileName: string; format: string }>();

importRouter.get("/", async (_req, res) => {
  const jobs = await prisma.importJob.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { clients: true } } },
  });

  res.json(
    jobs.map((job) => ({
      id: job.id,
      nomFichier: job.nomFichier,
      formatSource: job.formatSource,
      nbLignesTotal: job.nbLignesTotal,
      nbLignesImportees: job.nbLignesImportees,
      nbErreurs: job.nbErreurs,
      nbClientsActuels: job._count.clients,
      createdAt: job.createdAt,
    }))
  );
});

importRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.importJob.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: "Impossible de supprimer ce fichier importé.", details: String(err) });
  }
});

importRouter.post("/preview", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Aucun fichier reçu." });
  }

  try {
    const { headers, rows } = parseUploadedFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    const token = randomUUID();
    const format = req.file.originalname.split(".").pop() ?? "inconnu";
    pendingImports.set(token, { headers, rows, fileName: req.file.originalname, format });

    res.json({
      token,
      fileName: req.file.originalname,
      format,
      headers,
      sampleRows: rows.slice(0, 10),
      totalRows: rows.length,
      clientFields: CLIENT_FIELD_KEYS,
    });
  } catch (err) {
    res.status(400).json({ error: "Impossible de lire le fichier. Vérifiez le format (CSV, XLSX ou JSON).", details: String(err) });
  }
});

importRouter.post("/commit", async (req, res) => {
  const { token, mapping } = req.body as { token: string; mapping: Record<string, ClientFieldKey | null> };

  const pending = pendingImports.get(token);
  if (!pending) {
    return res.status(404).json({ error: "Session d'import expirée. Merci de réimporter le fichier." });
  }

  const nomSourceHeader = Object.entries(mapping).find(([, field]) => field === "nom")?.[0];
  if (!nomSourceHeader) {
    return res.status(400).json({ error: "Le champ 'Nom du client' doit être mappé." });
  }

  const importJob = await prisma.importJob.create({
    data: {
      nomFichier: pending.fileName,
      formatSource: pending.format,
      nbLignesTotal: pending.rows.length,
      nbLignesImportees: 0,
      nbErreurs: 0,
      mappingUtilise: mapping,
    },
  });

  const erreurs: { ligne: number; message: string }[] = [];
  let nbImportees = 0;
  let secteursRegroupes = 0;

  for (let i = 0; i < pending.rows.length; i++) {
    const row = pending.rows[i];
    const clientData: Record<string, unknown> = { importJobId: importJob.id };

    for (const [sourceHeader, targetField] of Object.entries(mapping)) {
      if (!targetField) continue;
      let value = row[sourceHeader];
      if (value === undefined || value === null || value === "") continue;

      if (targetField === "chiffreAffaires") {
        const num = typeof value === "number" ? value : parseFloat(String(value).replace(/[^\d.,-]/g, "").replace(",", "."));
        if (!isNaN(num)) clientData.chiffreAffaires = num;
        continue;
      }

      // Les secteurs sont ramenés à la taxonomie du CRM : sans ça, chaque
      // fichier apporte son propre vocabulaire et le ciblage devient inutilisable.
      if (targetField === "secteurActivite") {
        const brut = String(value).trim();
        const canonique = canoniserSecteur(brut);
        if (canonique) {
          if (canonique !== brut) secteursRegroupes++;
          clientData.secteurActivite = canonique;
        }
        continue;
      }

      clientData[targetField] = String(value).trim();
    }

    if (!clientData.nom) {
      erreurs.push({ ligne: i + 2, message: "Nom du client manquant." });
      continue;
    }

    try {
      await prisma.client.create({ data: clientData as never });
      nbImportees++;
    } catch (err) {
      erreurs.push({ ligne: i + 2, message: String(err) });
    }
  }

  await prisma.importJob.update({
    where: { id: importJob.id },
    data: { nbLignesImportees: nbImportees, nbErreurs: erreurs.length, erreurs },
  });

  pendingImports.delete(token);

  res.json({
    totalRows: pending.rows.length,
    importedRows: nbImportees,
    secteursRegroupes,
    errors: erreurs,
  });
});
