import { Router } from "express";
import bcrypt from "bcryptjs";
import type { RoleUtilisateur } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { SELECT_UTILISATEUR } from "../lib/auth.js";
import { LIBELLES_ROLES, peutAgirSur, rangDe } from "../lib/permissions.js";
import { MDP_MIN } from "./auth.js";

export const utilisateursRouter = Router();

const ROLES = Object.keys(LIBELLES_ROLES) as RoleUtilisateur[];
const estRoleValide = (r: unknown): r is RoleUtilisateur => typeof r === "string" && ROLES.includes(r as RoleUtilisateur);

/** Il doit toujours rester un super administrateur actif, sans quoi plus personne ne peut administrer. */
async function resteraitSansSuperAdmin(idModifie: string, futurRole?: RoleUtilisateur, futurActif?: boolean) {
  const supers = await prisma.utilisateur.findMany({
    where: { role: "SUPER_ADMIN", actif: true },
    select: { id: true },
  });
  const autres = supers.filter((s) => s.id !== idModifie).length;
  if (autres > 0) return false;
  const etaitSuper = supers.some((s) => s.id === idModifie);
  if (!etaitSuper) return false;
  const resteSuper = futurRole === undefined || futurRole === "SUPER_ADMIN";
  const resteActif = futurActif === undefined || futurActif;
  return !(resteSuper && resteActif);
}

type Verdict =
  | { erreur: string; statut: 403 | 404 }
  | { cible: { id: string; role: RoleUtilisateur; responsableId: string | null } };

/** Le compte visé existe-t-il, et l'acteur a-t-il un rang suffisant pour y toucher ? */
async function cibleAutorisee(
  req: { utilisateur?: { id: string; role: RoleUtilisateur } },
  id: string
): Promise<Verdict> {
  const cible = await prisma.utilisateur.findUnique({ where: { id } });
  if (!cible) return { erreur: "Compte introuvable.", statut: 404 as const };
  if (!peutAgirSur(req.utilisateur!.role, cible.role)) {
    return { erreur: "Ce compte est d'un niveau égal ou supérieur au vôtre.", statut: 403 as const };
  }
  // Un responsable commercial n'administre que les comptes qui lui sont rattachés.
  if (req.utilisateur!.role === "RESPONSABLE_COMMERCIAL" && cible.responsableId !== req.utilisateur!.id) {
    return { erreur: "Ce compte n'est pas rattaché à votre équipe.", statut: 403 as const };
  }
  return { cible };
}

utilisateursRouter.get("/", async (req, res) => {
  const moi = req.utilisateur!;
  // Le responsable ne voit que son équipe et lui-même ; les administrateurs voient tout.
  const where =
    moi.role === "RESPONSABLE_COMMERCIAL" ? { OR: [{ responsableId: moi.id }, { id: moi.id }] } : {};

  const utilisateurs = await prisma.utilisateur.findMany({
    where,
    orderBy: [{ actif: "desc" }, { nomComplet: "asc" }],
    select: { ...SELECT_UTILISATEUR, _count: { select: { accesAccordes: true, clientsPossedes: true } } },
  });

  res.json(
    utilisateurs.map((u) => ({
      ...u,
      nbAccesAccordes: u._count.accesAccordes,
      nbClientsPossedes: u._count.clientsPossedes,
      _count: undefined,
    }))
  );
});

/** Rôles que l'acteur a le droit d'attribuer, et responsables assignables. */
utilisateursRouter.get("/options", async (req, res) => {
  const moi = req.utilisateur!;
  const attribuables = ROLES.filter((r) => peutAgirSur(moi.role, r)).map((r) => ({ valeur: r, libelle: LIBELLES_ROLES[r] }));

  const responsables = await prisma.utilisateur.findMany({
    where: { actif: true, role: { in: ["RESPONSABLE_COMMERCIAL", "ADMIN", "SUPER_ADMIN"] } },
    orderBy: { nomComplet: "asc" },
    select: { id: true, nomComplet: true, role: true },
  });

  res.json({ roles: attribuables, responsables });
});

utilisateursRouter.post("/", async (req, res) => {
  const { identifiant, nomComplet, email, fonction, role, motDePasse, responsableId } = req.body as Record<string, string>;
  const moi = req.utilisateur!;

  if (!identifiant?.trim() || !nomComplet?.trim() || !motDePasse) {
    return res.status(400).json({ error: "Identifiant, nom complet et mot de passe sont requis." });
  }
  if (motDePasse.length < MDP_MIN) {
    return res.status(400).json({ error: `Le mot de passe doit faire au moins ${MDP_MIN} caractères.` });
  }

  const roleCible: RoleUtilisateur = estRoleValide(role) ? role : "COMMERCIAL";
  if (!peutAgirSur(moi.role, roleCible)) {
    return res.status(403).json({ error: `Vous ne pouvez pas créer un compte « ${LIBELLES_ROLES[roleCible]} ».` });
  }

  const existe = await prisma.utilisateur.findUnique({ where: { identifiant: identifiant.trim() } });
  if (existe) return res.status(409).json({ error: "Cet identifiant est déjà utilisé." });

  // Un responsable ne crée que dans sa propre équipe : il en devient le supérieur.
  const rattachement = moi.role === "RESPONSABLE_COMMERCIAL" ? moi.id : responsableId?.trim() || null;

  const utilisateur = await prisma.utilisateur.create({
    data: {
      identifiant: identifiant.trim(),
      nomComplet: nomComplet.trim(),
      email: email?.trim() || null,
      fonction: fonction?.trim() || null,
      role: roleCible,
      responsableId: rattachement,
      motDePasseHash: await bcrypt.hash(motDePasse, 10),
    },
    select: SELECT_UTILISATEUR,
  });

  res.status(201).json(utilisateur);
});

utilisateursRouter.put("/:id", async (req, res) => {
  const { nomComplet, email, fonction, role, actif, responsableId } = req.body as {
    nomComplet?: string;
    email?: string;
    fonction?: string;
    role?: string;
    actif?: boolean;
    responsableId?: string | null;
  };
  const moi = req.utilisateur!;

  const verdict = await cibleAutorisee(req, req.params.id);
  if ("erreur" in verdict) return res.status(verdict.statut).json({ error: verdict.erreur });

  let roleCible: RoleUtilisateur | undefined;
  if (role !== undefined) {
    if (!estRoleValide(role)) return res.status(400).json({ error: "Rôle inconnu." });
    if (!peutAgirSur(moi.role, role)) {
      return res.status(403).json({ error: `Vous ne pouvez pas attribuer le rôle « ${LIBELLES_ROLES[role]} ».` });
    }
    roleCible = role;
  }

  if ((roleCible !== undefined || actif !== undefined) && (await resteraitSansSuperAdmin(req.params.id, roleCible, actif))) {
    return res.status(400).json({ error: "Il doit rester au moins un super administrateur actif." });
  }

  try {
    const utilisateur = await prisma.utilisateur.update({
      where: { id: req.params.id },
      data: {
        ...(nomComplet !== undefined ? { nomComplet: nomComplet.trim() } : {}),
        ...(email !== undefined ? { email: email.trim() || null } : {}),
        ...(fonction !== undefined ? { fonction: fonction.trim() || null } : {}),
        ...(roleCible !== undefined ? { role: roleCible } : {}),
        ...(actif !== undefined ? { actif } : {}),
        ...(responsableId !== undefined && moi.role !== "RESPONSABLE_COMMERCIAL"
          ? { responsableId: responsableId || null }
          : {}),
      },
      select: SELECT_UTILISATEUR,
    });

    // Un compte qui perd l'accès global garde ses accès nominatifs ; à l'inverse,
    // un compte promu voit tout : ses accès nominatifs deviennent sans objet.
    if (roleCible && rangDe(roleCible) >= rangDe("CHEF_DE_PROJET")) {
      await prisma.accesClient.deleteMany({ where: { utilisateurId: req.params.id } });
    }

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

  const verdict = await cibleAutorisee(req, req.params.id);
  if ("erreur" in verdict) return res.status(verdict.statut).json({ error: verdict.erreur });

  await prisma.utilisateur.update({
    where: { id: req.params.id },
    data: { motDePasseHash: await bcrypt.hash(motDePasse, 10) },
  });
  res.json({ ok: true });
});

utilisateursRouter.delete("/:id", async (req, res) => {
  if (req.params.id === req.utilisateur!.id) {
    return res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte." });
  }

  const verdict = await cibleAutorisee(req, req.params.id);
  if ("erreur" in verdict) return res.status(verdict.statut).json({ error: verdict.erreur });

  if (await resteraitSansSuperAdmin(req.params.id, undefined, false)) {
    return res.status(400).json({ error: "Il doit rester au moins un super administrateur actif." });
  }

  try {
    await prisma.utilisateur.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: "Impossible de supprimer ce compte.", details: String(err) });
  }
});
