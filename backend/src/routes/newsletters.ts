import { Router } from "express";
import type { RoleUtilisateur } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { isMailerLive, sendEmail } from "../lib/mailer.js";
import { requirePermission } from "../lib/auth.js";
import { perimetreClients } from "../lib/permissions.js";

export const newslettersRouter = Router();

function splitEmails(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(";")
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));
}

/**
 * Destinataires d'une campagne, restreints au périmètre du compte : un
 * commercial ne doit pas déduire la taille de la base entière depuis le
 * compteur d'audience.
 */
async function findAudience(secteurs: string[], utilisateur: { id: string; role: RoleUtilisateur }) {
  const filtre = secteurs.length > 0 ? { secteurActivite: { in: secteurs } } : {};
  const perimetre = perimetreClients(utilisateur);

  const clients = await prisma.client.findMany({
    where: perimetre ? { AND: [filtre, perimetre] } : filtre,
    select: { id: true, nom: true, emailContact: true, secteurActivite: true },
  });
  return clients.filter((c) => splitEmails(c.emailContact).length > 0);
}

newslettersRouter.get("/", async (_req, res) => {
  const newsletters = await prisma.newsletter.findMany({ orderBy: { createdAt: "desc" } });
  res.json(newsletters);
});

newslettersRouter.get("/audience", async (req, res) => {
  const secteursParam = String(req.query.secteurs ?? "");
  const secteurs = secteursParam ? secteursParam.split(",").filter(Boolean) : [];
  const audience = await findAudience(secteurs, req.utilisateur!);
  res.json({ nbDestinataires: audience.length });
});

newslettersRouter.get("/:id", async (req, res) => {
  const newsletter = await prisma.newsletter.findUnique({
    where: { id: req.params.id },
    include: { envois: { orderBy: { createdAt: "desc" } } },
  });
  if (!newsletter) return res.status(404).json({ error: "Newsletter introuvable." });
  res.json(newsletter);
});

newslettersRouter.post("/", requirePermission("newsletters.creer"), async (req, res) => {
  const { titre, sujet, format, contenu, secteursCibles } = req.body as {
    titre?: string;
    sujet?: string;
    format?: "TEXTE" | "HTML";
    contenu?: string;
    secteursCibles?: string[];
  };

  if (!titre || !sujet || !contenu) {
    return res.status(400).json({ error: "Titre, sujet et contenu sont requis." });
  }

  const newsletter = await prisma.newsletter.create({
    data: {
      titre,
      sujet,
      format: format ?? "TEXTE",
      contenu,
      secteursCibles: secteursCibles ?? [],
    },
  });
  res.status(201).json(newsletter);
});

newslettersRouter.put("/:id", requirePermission("newsletters.creer"), async (req, res) => {
  const existing = await prisma.newsletter.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Newsletter introuvable." });
  if (existing.statut !== "BROUILLON") {
    return res.status(400).json({ error: "Seule une newsletter en brouillon peut être modifiée." });
  }

  const { titre, sujet, format, contenu, secteursCibles } = req.body as {
    titre?: string;
    sujet?: string;
    format?: "TEXTE" | "HTML";
    contenu?: string;
    secteursCibles?: string[];
  };

  const newsletter = await prisma.newsletter.update({
    where: { id: req.params.id },
    data: { titre, sujet, format, contenu, secteursCibles },
  });
  res.json(newsletter);
});

newslettersRouter.delete("/:id", requirePermission("newsletters.creer"), async (req, res) => {
  try {
    await prisma.newsletter.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: "Impossible de supprimer cette newsletter.", details: String(err) });
  }
});

function toHtml(format: string, contenu: string) {
  if (format === "HTML") return contenu;
  const escaped = contenu
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family: sans-serif; white-space: pre-wrap;">${escaped}</div>`;
}

newslettersRouter.post("/:id/send", requirePermission("newsletters.envoyer"), async (req, res) => {
  const newsletter = await prisma.newsletter.findUnique({ where: { id: req.params.id } });
  if (!newsletter) return res.status(404).json({ error: "Newsletter introuvable." });
  if (newsletter.statut === "ENVOI_EN_COURS") {
    return res.status(400).json({ error: "Un envoi est déjà en cours pour cette newsletter." });
  }

  const audience = await findAudience(newsletter.secteursCibles, req.utilisateur!);
  if (audience.length === 0) {
    return res.status(400).json({ error: "Aucun client avec email trouvé pour les secteurs ciblés." });
  }

  await prisma.newsletter.update({ where: { id: newsletter.id }, data: { statut: "ENVOI_EN_COURS" } });

  const html = toHtml(newsletter.format, newsletter.contenu);
  let nbEnvoyes = 0;
  let nbEchecs = 0;

  for (const client of audience) {
    const emails = splitEmails(client.emailContact);
    const result = await sendEmail(emails.join(", "), newsletter.sujet, html);

    if (result.success) nbEnvoyes++;
    else nbEchecs++;

    await prisma.newsletterEnvoi.create({
      data: {
        newsletterId: newsletter.id,
        clientId: client.id,
        clientNom: client.nom,
        email: emails.join(", "),
        statut: result.success ? "ENVOYE" : "ECHEC",
        erreur: result.success ? null : result.error,
      },
    });
  }

  const updated = await prisma.newsletter.update({
    where: { id: newsletter.id },
    data: {
      statut: nbEchecs === 0 ? "ENVOYEE" : nbEnvoyes > 0 ? "ENVOYEE" : "ECHEC",
      nbDestinataires: audience.length,
      nbEnvoyes,
      nbEchecs,
      envoyeeLe: new Date(),
    },
  });

  res.json({ newsletter: updated, mailerLive: isMailerLive() });
});
