import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { SELECT_UTILISATEUR } from "../lib/auth.js";
import { MDP_MIN } from "./auth.js";

export const utilisateursRouter = Router();

/** Empêche de se retrouver sans aucun administrateur actif. */
async function resteraitSansAdmin(idModifie: string, futurRole?: string, futurActif?: boolean) {
  const admins = await prisma.utilisateur.findMany({
    where: { role: "ADMIN", actif: true },
    select: { id: true },
  });
  const restants = admins.filter((a) => a.id !== idModifie).length;
  const cibleResteAdminActif = futurRole !== undefined ? futurRole === "ADMIN" : true;
  const cibleResteActive = futurActif !== undefined ? futurActif : true;
  return restants === 0 && !(cibleResteAdminActif && cibleResteActive);
}

utilisateursRouter.get("/", async (_req, res) => {
  const utilisateurs = await prisma.utilisateur.findMany({
    orderBy: [{ actif: "desc" }, { nomComplet: "asc" }],
    select: SELECT_UTILISATEUR,
  });
  res.json(utilisateurs);
});

utilisateursRouter.post("/", async (req, res) => {
  const { identifiant, nomComplet, email, fonction, role, motDePasse } = req.body as Record<string, string>;

  if (!identifiant?.trim() || !nomComplet?.trim() || !motDePasse) {
    return res.status(400).json({ error: "Identifiant, nom complet et mot de passe sont requis." });
  }
  if (motDePasse.length < MDP_MIN) {
    return res.status(400).json({ error: `Le mot de passe doit faire au moins ${MDP_MIN} caractères.` });
  }
  if (role && role !== "ADMIN" && role !== "COMMERCIAL") {
    return res.status(400).json({ error: "Rôle invalide." });
  }

  const existe = await prisma.utilisateur.findUnique({ where: { identifiant: identifiant.trim() } });
  if (existe) return res.status(409).json({ error: "Cet identifiant est déjà utilisé." });

  const utilisateur = await prisma.utilisateur.create({
    data: {
      identifiant: identifiant.trim(),
      nomComplet: nomComplet.trim(),
      email: email?.trim() || null,
      fonction: fonction?.trim() || null,
      role: (role as "ADMIN" | "COMMERCIAL") ?? "COMMERCIAL",
      motDePasseHash: await bcrypt.hash(motDePasse, 10),
    },
    select: SELECT_UTILISATEUR,
  });

  res.status(201).json(utilisateur);
});

utilisateursRouter.put("/:id", async (req, res) => {
  const { nomComplet, email, fonction, role, actif } = req.body as {
    nomComplet?: string;
    email?: string;
    fonction?: string;
    role?: string;
    actif?: boolean;
  };

  if (role && role !== "ADMIN" && role !== "COMMERCIAL") {
    return res.status(400).json({ error: "Rôle invalide." });
  }

  if ((role !== undefined || actif !== undefined) && (await resteraitSansAdmin(req.params.id, role, actif))) {
    return res.status(400).json({ error: "Il doit rester au moins un administrateur actif." });
  }

  try {
    const utilisateur = await prisma.utilisateur.update({
      where: { id: req.params.id },
      data: {
        ...(nomComplet !== undefined ? { nomComplet: nomComplet.trim() } : {}),
        ...(email !== undefined ? { email: email.trim() || null } : {}),
        ...(fonction !== undefined ? { fonction: fonction.trim() || null } : {}),
        ...(role !== undefined ? { role: role as "ADMIN" | "COMMERCIAL" } : {}),
        ...(actif !== undefined ? { actif } : {}),
      },
      select: SELECT_UTILISATEUR,
    });
    res.json(utilisateur);
  } catch (err) {
    res.status(400).json({ error: "Impossible de modifier ce compte.", details: String(err) });
  }
});

utilisateursRouter.put("/:id/mot-de-passe", async (req, res) => {
  const { motDePasse } = req.body as { motDePasse?: string };
  if (!motDePasse || motDePasse.length < MDP_MIN) {
    return res.status(400).json({ error: `Le mot de passe doit faire au moins ${MDP_MIN} caractères.` });
  }

  try {
    await prisma.utilisateur.update({
      where: { id: req.params.id },
      data: { motDePasseHash: await bcrypt.hash(motDePasse, 10) },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "Impossible de réinitialiser ce mot de passe.", details: String(err) });
  }
});

utilisateursRouter.delete("/:id", async (req, res) => {
  if (req.params.id === req.utilisateur!.id) {
    return res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte." });
  }
  if (await resteraitSansAdmin(req.params.id, undefined, false)) {
    return res.status(400).json({ error: "Il doit rester au moins un administrateur actif." });
  }

  try {
    await prisma.utilisateur.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: "Impossible de supprimer ce compte.", details: String(err) });
  }
});
