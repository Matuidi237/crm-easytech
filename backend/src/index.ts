import express from "express";
import cors from "cors";
import { prisma } from "./lib/prisma.js";
import { clientsRouter } from "./routes/clients.js";
import { importRouter } from "./routes/import.js";
import { authRouter } from "./routes/auth.js";
import { newslettersRouter } from "./routes/newsletters.js";
import { utilisateursRouter } from "./routes/utilisateurs.js";
import { requireAdmin, requireAuth } from "./lib/auth.js";

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
app.use("/api/newsletters", requireAuth, newslettersRouter);
app.use("/api/utilisateurs", requireAuth, requireAdmin, utilisateursRouter);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

/** Crée le premier administrateur à partir du .env quand la table est vide. */
async function amorcerPremierAdmin() {
  if ((await prisma.utilisateur.count()) > 0) return;

  const identifiant = process.env.ADMIN_USERNAME;
  const motDePasseHash = process.env.ADMIN_PASSWORD_HASH;
  if (!identifiant || !motDePasseHash) {
    console.warn(
      "Aucun utilisateur en base, et ADMIN_USERNAME / ADMIN_PASSWORD_HASH sont absents du .env : impossible d'amorcer le premier compte."
    );
    return;
  }

  await prisma.utilisateur.create({
    data: { identifiant, nomComplet: "Administrateur", motDePasseHash, role: "ADMIN" },
  });
  console.log(`Premier compte administrateur créé depuis .env : ${identifiant}`);
}

amorcerPremierAdmin()
  .catch((err) => console.error("Amorçage du premier administrateur impossible :", err))
  .finally(() => {
    app.listen(port, () => {
      console.log(`CRM backend démarré sur http://localhost:${port}`);
    });
  });
