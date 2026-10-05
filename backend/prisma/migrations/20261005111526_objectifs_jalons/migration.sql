-- CreateEnum
CREATE TYPE "UniteJalon" AS ENUM ('MONTANT', 'NOMBRE', 'BINAIRE');

-- AlterTable
ALTER TABLE "ObjectifCommercial" ADD COLUMN     "description" TEXT,
ADD COLUMN     "titre" TEXT;

-- CreateTable
CREATE TABLE "JalonObjectif" (
    "id" TEXT NOT NULL,
    "objectifId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "unite" "UniteJalon" NOT NULL DEFAULT 'NOMBRE',
    "cible" DECIMAL(18,2) NOT NULL,
    "realise" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "echeance" DATE NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JalonObjectif_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JalonObjectif_objectifId_idx" ON "JalonObjectif"("objectifId");

-- CreateIndex
CREATE INDEX "JalonObjectif_estDemo_idx" ON "JalonObjectif"("estDemo");

-- CreateIndex
CREATE INDEX "ObjectifCommercial_debut_idx" ON "ObjectifCommercial"("debut");

-- AddForeignKey
ALTER TABLE "JalonObjectif" ADD CONSTRAINT "JalonObjectif_objectifId_fkey" FOREIGN KEY ("objectifId") REFERENCES "ObjectifCommercial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
