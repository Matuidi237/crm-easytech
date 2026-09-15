-- CreateEnum
CREATE TYPE "StatutProjet" AS ENUM ('EN_PREPARATION', 'EN_COURS', 'EN_PAUSE', 'LIVRE', 'ANNULE');

-- CreateTable
CREATE TABLE "Projet" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "clientId" TEXT,
    "clientNom" TEXT NOT NULL,
    "venteId" TEXT,
    "chefDeProjetId" TEXT,
    "chefDeProjetNom" TEXT NOT NULL,
    "statut" "StatutProjet" NOT NULL DEFAULT 'EN_PREPARATION',
    "budget" DECIMAL(18,2) NOT NULL,
    "avancementPct" INTEGER NOT NULL DEFAULT 0,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFinPrevue" TIMESTAMP(3) NOT NULL,
    "dateFinReelle" TIMESTAMP(3),
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Projet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Projet_estDemo_idx" ON "Projet"("estDemo");

-- CreateIndex
CREATE INDEX "Projet_chefDeProjetId_idx" ON "Projet"("chefDeProjetId");

-- CreateIndex
CREATE INDEX "Projet_clientId_idx" ON "Projet"("clientId");

-- CreateIndex
CREATE INDEX "Projet_statut_idx" ON "Projet"("statut");

-- CreateIndex
CREATE INDEX "Projet_dateFinPrevue_idx" ON "Projet"("dateFinPrevue");

-- AddForeignKey
ALTER TABLE "Projet" ADD CONSTRAINT "Projet_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projet" ADD CONSTRAINT "Projet_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "Vente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projet" ADD CONSTRAINT "Projet_chefDeProjetId_fkey" FOREIGN KEY ("chefDeProjetId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
