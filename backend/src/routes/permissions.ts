import { Router } from "express";
import type { RoleUtilisateur } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  CATALOGUE_PERMISSIONS,
  LIBELLES_ROLES,
  PERMISSIONS,
  type Permission,
  appliquerSurcharges,
  estSurcharge,
  permissionsDe,
  permissionsParDefaut,
} from "../lib/permissions.js";

export const permissionsRouter = Router();

const ROLES = Object.keys(LIBELLES_ROLES) as RoleUtilisateur[];

/** Relit les surcharges depuis la base et rafraîchit le cache du processus. */
export async function rechargerPermissions() {
  const lignes = await prisma.permissionsRole.findMany();
  const map: Partial<Record<RoleUtilisateur, Permission[]>> = {};
  for (const l of lignes) map[l.role] = l.permissions as Permission[];
  appliquerSurcharges(map);
  return lignes.length;
}

/** État complet de la matrice : ce qui s'applique, les défauts, et les écarts. */
permissionsRouter.get("/", (_req, res) => {
  res.json({
    catalogue: CATALOGUE_PERMISSIONS,
    roles: ROLES.map((role) => ({
      role,
      libelle: LIBELLES_ROLES[role],
      // Le super administrateur est affiché mais verrouillé.
      modifiable: role !== "SUPER_ADMIN",
      surcharge: estSurcharge(role),
      permissions: permissionsDe(role),
      parDefaut: permissionsParDefaut(role),
    })),
  });
});

permissionsRouter.put("/:role", async (req, res) => {
  const role = req.params.role as RoleUtilisateur;
  const { permissions } = req.body as { permissions?: string[] };

  if (!ROLES.includes(role)) return res.status(404).json({ error: "Rôle inconnu." });
  if (role === "SUPER_ADMIN") {
    return res.status(400).json({
      error:
        "Les droits du super administrateur ne sont pas modifiables : c'est ce qui garantit de pouvoir toujours reprendre la main.",
    });
  }
  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: "Liste de permissions attendue." });
  }

  const inconnues = permissions.filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
  if (inconnues.length > 0) {
    return res.status(400).json({ error: `Permissions inconnues : ${inconnues.join(", ")}` });
  }

  await prisma.permissionsRole.upsert({
    where: { role },
    create: { role, permissions, modifiePar: req.utilisateur!.nomComplet },
    update: { permissions, modifiePar: req.utilisateur!.nomComplet },
  });
  await rechargerPermissions();

  res.json({ role, permissions: permissionsDe(role), surcharge: estSurcharge(role) });
});

/** Revient aux valeurs par défaut définies dans le code. */
permissionsRouter.post("/:role/reinitialiser", async (req, res) => {
  const role = req.params.role as RoleUtilisateur;
  if (!ROLES.includes(role)) return res.status(404).json({ error: "Rôle inconnu." });

  await prisma.permissionsRole.deleteMany({ where: { role } });
  await rechargerPermissions();

  res.json({ role, permissions: permissionsDe(role), surcharge: false });
});
