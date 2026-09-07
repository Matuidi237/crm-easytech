-- AlterEnum
ALTER TYPE "RoleUtilisateur" ADD VALUE 'DG';

-- CreateTable
CREATE TABLE "Vente" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "clientNom" TEXT NOT NULL,
    "vendeurId" TEXT,
    "vendeurNom" TEXT NOT NULL,
    "produit" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "prixAchat" DECIMAL(18,2) NOT NULL,
    "prixVente" DECIMAL(18,2) NOT NULL,
    "dateVente" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vente_vendeurId_idx" ON "Vente"("vendeurId");

-- CreateIndex
CREATE INDEX "Vente_clientId_idx" ON "Vente"("clientId");

-- CreateIndex
CREATE INDEX "Vente_produit_idx" ON "Vente"("produit");

-- CreateIndex
CREATE INDEX "Vente_dateVente_idx" ON "Vente"("dateVente");

-- AddForeignKey
ALTER TABLE "Vente" ADD CONSTRAINT "Vente_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vente" ADD CONSTRAINT "Vente_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
