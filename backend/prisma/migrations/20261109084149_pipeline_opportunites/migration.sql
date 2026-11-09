-- CreateEnum
CREATE TYPE "EtapePipeline" AS ENUM ('NOUVELLE', 'QUALIFIEE', 'DEVIS_ENVOYE', 'NEGOCIATION', 'GAGNEE', 'PERDUE');

-- CreateEnum
CREATE TYPE "PrioriteOpportunite" AS ENUM ('BASSE', 'MOYENNE', 'HAUTE');

-- CreateTable
CREATE TABLE "Opportunite" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "clientId" TEXT,
    "clientNom" TEXT NOT NULL,
    "commercialId" TEXT,
    "commercialNom" TEXT NOT NULL,
    "etape" "EtapePipeline" NOT NULL DEFAULT 'NOUVELLE',
    "priorite" "PrioriteOpportunite" NOT NULL DEFAULT 'MOYENNE',
    "montantEstime" DECIMAL(18,2) NOT NULL,
    "nature" "NatureVente" NOT NULL DEFAULT 'MATERIEL',
    "description" TEXT,
    "clotureEstimeeLe" DATE,
    "etapeDepuisLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clotureeLe" TIMESTAMP(3),
    "motifPerte" TEXT,
    "referenceCommande" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Opportunite_commercialId_etape_idx" ON "Opportunite"("commercialId", "etape");

-- CreateIndex
CREATE INDEX "Opportunite_clientId_idx" ON "Opportunite"("clientId");

-- CreateIndex
CREATE INDEX "Opportunite_etape_idx" ON "Opportunite"("etape");

-- CreateIndex
CREATE INDEX "Opportunite_estDemo_idx" ON "Opportunite"("estDemo");

-- AddForeignKey
ALTER TABLE "Opportunite" ADD CONSTRAINT "Opportunite_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunite" ADD CONSTRAINT "Opportunite_commercialId_fkey" FOREIGN KEY ("commercialId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
