import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { SELECT_UTILISATEUR, requireAuth, signToken } from "../lib/auth.js";
import { permissionsDe } from "../lib/permissions.js";

export const authRouter = Router();

export const MDP_MIN = 8;

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    return res.status(400).json({ error: "Identifiant et mot de passe requis." });
  }

  const utilisateur = await prisma.utilisateur.findUnique({ where: { identifiant: username.trim() } });

  // Message identique dans tous les cas d'échec : ne pas révéler quels comptes existent.
  const echec = () => res.status(401).json({ error: "Identifiant ou mot de passe incorrect." });
  if (!utilisateur) {
    await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin");
    return echec();
  }
  if (!(await bcrypt.compare(password, utilisateur.motDePasseHash))) return echec();
  if (!utilisateur.actif) {
    return res.status(403).json({ error: "Ce compte est désactivé. Contactez un administrateur." });
  }

  await prisma.utilisateur.update({ where: { id: utilisateur.id }, data: { dernierAcces: new Date() } });

  const session = {
    id: utilisateur.id,
    identifiant: utilisateur.identifiant,
    nomComplet: utilisateur.nomComplet,
    role: utilisateur.role,
  };
  // Les permissions accompagnent la session : l'interface masque ce qui n'est
  // pas autorisé sans avoir à redéfinir la matrice de son côté.
  res.json({
    token: signToken(session),
    utilisateur: { ...session, permissions: permissionsDe(utilisateur.role) },
  });
});

authRouter.get("/moi", requireAuth, async (req, res) => {
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: req.utilisateur!.id },
    select: SELECT_UTILISATEUR,
  });
  if (!utilisateur) return res.status(404).json({ error: "Compte introuvable." });
  res.json({ ...utilisateur, permissions: permissionsDe(utilisateur.role) });
});

authRouter.put("/moi", requireAuth, async (req, res) => {
  const { nomComplet, email, fonction } = req.body as {
    nomComplet?: string;
    email?: string;
    fonction?: string;
  };

  if (nomComplet !== undefined && !nomComplet.trim()) {
    return res.status(400).json({ error: "Le nom complet ne peut pas être vide." });
  }

  const utilisateur = await prisma.utilisateur.update({
    where: { id: req.utilisateur!.id },
    data: {
      ...(nomComplet !== undefined ? { nomComplet: nomComplet.trim() } : {}),
      ...(email !== undefined ? { email: email.trim() || null } : {}),
      ...(fonction !== undefined ? { fonction: fonction.trim() || null } : {}),
    },
    select: SELECT_UTILISATEUR,
  });

  // Le nom figure dans le jeton : on en renvoie un rafraîchi pour éviter un affichage périmé.
  res.json({
    utilisateur,
    token: signToken({
      id: utilisateur.id,
      identifiant: utilisateur.identifiant,
      nomComplet: utilisateur.nomComplet,
      role: utilisateur.role,
    }),
  });
});

authRouter.put("/moi/mot-de-passe", requireAuth, async (req, res) => {
  const { motDePasseActuel, nouveauMotDePasse } = req.body as {
    motDePasseActuel?: string;
    nouveauMotDePasse?: string;
  };

  if (!motDePasseActuel || !nouveauMotDePasse) {
    return res.status(400).json({ error: "Mot de passe actuel et nouveau mot de passe requis." });
  }
  if (nouveauMotDePasse.length < MDP_MIN) {
    return res.status(400).json({ error: `Le nouveau mot de passe doit faire au moins ${MDP_MIN} caractères.` });
  }

  const utilisateur = await prisma.utilisateur.findUnique({ where: { id: req.utilisateur!.id } });
  if (!utilisateur) return res.status(404).json({ error: "Compte introuvable." });

  if (!(await bcrypt.compare(motDePasseActuel, utilisateur.motDePasseHash))) {
    return res.status(400).json({ error: "Le mot de passe actuel est incorrect." });
  }

  await prisma.utilisateur.update({
    where: { id: utilisateur.id },
    data: { motDePasseHash: await bcrypt.hash(nouveauMotDePasse, 10) },
  });

  res.json({ ok: true });
});
