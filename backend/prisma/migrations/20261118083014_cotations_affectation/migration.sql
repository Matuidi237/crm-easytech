-- AlterTable
ALTER TABLE "DemandeCotation" ADD COLUMN     "affecteeLe" TIMESTAMP(3),
ADD COLUMN     "responsableId" TEXT,
ADD COLUMN     "responsableNom" TEXT;

-- CreateTable
CREATE TABLE "AffectationCotation" (
    "id" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "ancienResponsableId" TEXT,
    "ancienResponsableNom" TEXT,
    "nouveauResponsableId" TEXT,
    "nouveauResponsableNom" TEXT NOT NULL,
    "motif" TEXT,
    "parNom" TEXT,
    "automatique" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffectationCotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffectationCotation_demandeId_createdAt_idx" ON "AffectationCotation"("demandeId", "createdAt");

-- AddForeignKey
ALTER TABLE "DemandeCotation" ADD CONSTRAINT "DemandeCotation_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationCotation" ADD CONSTRAINT "AffectationCotation_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "DemandeCotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
