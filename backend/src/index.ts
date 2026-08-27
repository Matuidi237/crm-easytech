import express from "express";
import cors from "cors";
import { prisma } from "./lib/prisma.js";
import { clientsRouter } from "./routes/clients.js";
import { importRouter } from "./routes/import.js";
import { authRouter } from "./routes/auth.js";
import { newslettersRouter } from "./routes/newsletters.js";
import { utilisateursRouter } from "./routes/utilisateurs.js";
import { accesRouter } from "./routes/acces.js";
import { permissionsRouter, rechargerPermissions } from "./routes/permissions.js";
import { requireAuth, requirePermission } from "./lib/auth.js";

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

// Derrière un reverse proxy : nécessaire pour lire le protocole et l'IP d'origine.
app.set("trust proxy", 1);

/* En production, le SPA est servi par la même origine que l'API (nginx relaie
   /api) : aucune en-tête CORS n'est nécessaire, et ne pas en émettre évite
   d'ouvrir l'API à d'autres sites. On n'ouvre que si CORS_ORIGIN est fourni
   explicitement, ou en développement où le front tourne sur un autre port. */
const originesCors = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (originesCors.length > 0) app.use(cors({ origin: originesCors }));
else if (process.env.NODE_ENV !== "production") app.use(cors());

app.use(express.json({ limit: "5mb" }));

app.use("/api/auth", authRouter);
app.use("/api/clients", requireAuth, clientsRouter);
app.use("/api/import", requireAuth, importRouter);
app.use("/api/newsletters", requireAuth, requirePermission("newsletters.voir"), newslettersRouter);
app.use("/api/utilisateurs", requireAuth, requirePermission("utilisateurs.gerer"), utilisateursRouter);
app.use("/api/acces", requireAuth, accesRouter);
app.use("/api/permissions", requireAuth, requirePermission("permissions.gerer"), permissionsRouter);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

/**
 * Amorçage du compte d'administration.
 *
 * Deux cas : base vierge, on crée le super administrateur depuis le .env ;
 * ou base issue d'une version antérieure où seuls ADMIN et COMMERCIAL
 * existaient, et où plus personne ne peut gérer les administrateurs. On
 * promeut alors le plus ancien administrateur.
 */
async function amorcerAdministration() {
  const nbSuperAdmins = await prisma.utilisateur.count({ where: { role: "SUPER_ADMIN" } });
  if (nbSuperAdmins > 0) return;

  const premierAdmin = await prisma.utilisateur.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });

  if (premierAdmin) {
    await prisma.utilisateur.update({ where: { id: premierAdmin.id }, data: { role: "SUPER_ADMIN" } });
    console.log(`Compte « ${premierAdmin.identifiant} » promu super administrateur.`);
    return;
  }

  if ((await prisma.utilisateur.count()) > 0) {
    console.warn(
      "Aucun super administrateur et aucun administrateur à promouvoir : la gestion des comptes est inaccessible."
    );
    return;
  }

  const identifiant = process.env.ADMIN_USERNAME;
  const motDePasseHash = process.env.ADMIN_PASSWORD_HASH;
  if (!identifiant || !motDePasseHash) {
    console.warn(
      "Base vierge et ADMIN_USERNAME / ADMIN_PASSWORD_HASH absents du .env : impossible d'amorcer le premier compte."
    );
    return;
  }

  await prisma.utilisateur.create({
    data: { identifiant, nomComplet: "Administrateur", motDePasseHash, role: "SUPER_ADMIN" },
  });
  console.log(`Premier compte super administrateur créé depuis .env : ${identifiant}`);
}

async function demarrer() {
  await amorcerAdministration();
  // Les surcharges de permissions sont chargées une fois puis tenues en cache :
  // elles sont évaluées à chaque requête, une lecture SQL à chaque fois serait
  // du gaspillage.
  const n = await rechargerPermissions();
  if (n > 0) console.log(`${n} rôle(s) avec des permissions personnalisées.`);
}

demarrer()
  .catch((err) => console.error("Démarrage incomplet :", err))
  .finally(() => {
    app.listen(port, () => {
      console.log(`CRM backend démarré sur http://localhost:${port}`);
    });
  });
