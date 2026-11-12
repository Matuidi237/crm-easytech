-- CreateEnum
CREATE TYPE "StatutCotation" AS ENUM ('NON_TRAITEE', 'EN_COURS', 'TRAITEE', 'CLOTUREE');

-- CreateEnum
CREATE TYPE "OrigineePiece" AS ENUM ('BESOIN', 'COTATION');

-- CreateTable
CREATE TABLE "DemandeCotation" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "objet" TEXT NOT NULL,
    "description" TEXT,
    "clientId" TEXT,
    "clientNom" TEXT NOT NULL,
    "commercialId" TEXT,
    "commercialNom" TEXT NOT NULL,
    "statut" "StatutCotation" NOT NULL DEFAULT 'NON_TRAITEE',
    "echeanceLe" DATE NOT NULL,
    "traiteParId" TEXT,
    "traiteParNom" TEXT,
    "priseEnChargeLe" TIMESTAMP(3),
    "traiteeLe" TIMESTAMP(3),
    "recueLe" TIMESTAMP(3),
    "reponse" TEXT,
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandeCotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PieceCotation" (
    "id" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "origine" "OrigineePiece" NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "typeMime" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "contenu" BYTEA NOT NULL,
    "deposeParNom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PieceCotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemandeCotation_reference_key" ON "DemandeCotation"("reference");

-- CreateIndex
CREATE INDEX "DemandeCotation_commercialId_statut_idx" ON "DemandeCotation"("commercialId", "statut");

-- CreateIndex
CREATE INDEX "DemandeCotation_statut_echeanceLe_idx" ON "DemandeCotation"("statut", "echeanceLe");

-- CreateIndex
CREATE INDEX "DemandeCotation_clientId_idx" ON "DemandeCotation"("clientId");

-- CreateIndex
CREATE INDEX "DemandeCotation_estDemo_idx" ON "DemandeCotation"("estDemo");

-- CreateIndex
CREATE INDEX "PieceCotation_demandeId_idx" ON "PieceCotation"("demandeId");

-- AddForeignKey
ALTER TABLE "DemandeCotation" ADD CONSTRAINT "DemandeCotation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeCotation" ADD CONSTRAINT "DemandeCotation_commercialId_fkey" FOREIGN KEY ("commercialId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeCotation" ADD CONSTRAINT "DemandeCotation_traiteParId_fkey" FOREIGN KEY ("traiteParId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceCotation" ADD CONSTRAINT "PieceCotation_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "DemandeCotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
