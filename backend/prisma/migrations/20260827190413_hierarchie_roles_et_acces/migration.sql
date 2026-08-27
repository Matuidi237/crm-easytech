-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RoleUtilisateur" ADD VALUE 'SUPER_ADMIN';
ALTER TYPE "RoleUtilisateur" ADD VALUE 'RESPONSABLE_COMMERCIAL';
ALTER TYPE "RoleUtilisateur" ADD VALUE 'COMPTABLE';
ALTER TYPE "RoleUtilisateur" ADD VALUE 'CHEF_DE_PROJET';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "proprietaireId" TEXT;

-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN     "responsableId" TEXT;

-- CreateTable
CREATE TABLE "AccesClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "accordeParId" TEXT NOT NULL,
    "accordeParNom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccesClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccesClient_utilisateurId_idx" ON "AccesClient"("utilisateurId");

-- CreateIndex
CREATE UNIQUE INDEX "AccesClient_clientId_utilisateurId_key" ON "AccesClient"("clientId", "utilisateurId");

-- CreateIndex
CREATE INDEX "Client_proprietaireId_idx" ON "Client"("proprietaireId");

-- CreateIndex
CREATE INDEX "Utilisateur_responsableId_idx" ON "Utilisateur"("responsableId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_proprietaireId_fkey" FOREIGN KEY ("proprietaireId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Utilisateur" ADD CONSTRAINT "Utilisateur_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesClient" ADD CONSTRAINT "AccesClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesClient" ADD CONSTRAINT "AccesClient_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
