import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import type { RoleUtilisateur } from "@prisma/client";
import { peut, type Permission } from "./permissions.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export type SessionUtilisateur = {
  id: string;
  identifiant: string;
  nomComplet: string;
  role: RoleUtilisateur;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      utilisateur?: SessionUtilisateur;
    }
  }
}

/** Champs renvoyés au client — n'inclut jamais le hash du mot de passe. */
export const SELECT_UTILISATEUR = {
  id: true,
  identifiant: true,
  nomComplet: true,
  email: true,
  fonction: true,
  role: true,
  actif: true,
  dernierAcces: true,
  createdAt: true,
  responsableId: true,
  responsable: { select: { id: true, nomComplet: true } },
} as const;

export function signToken(u: SessionUtilisateur) {
  return jwt.sign(u, JWT_SECRET, { expiresIn: "12h" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentification requise." });

  try {
    req.utilisateur = jwt.verify(token, JWT_SECRET) as SessionUtilisateur;
    next();
  } catch {
    res.status(401).json({ error: "Session expirée, merci de vous reconnecter." });
  }
}

/**
 * Exige une capacité précise plutôt qu'un rôle : les routes n'ont pas à
 * connaître la hiérarchie, seulement ce qu'elles demandent.
 */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.utilisateur?.role;
    if (!role || !peut(role, permission)) {
      return res.status(403).json({ error: "Votre rôle ne permet pas cette action." });
    }
    next();
  };
}
