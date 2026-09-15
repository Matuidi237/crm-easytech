-- CreateEnum
CREATE TYPE "TypePartenaire" AS ENUM ('EDITEUR', 'CONSTRUCTEUR', 'DISTRIBUTEUR', 'SERVICES');

-- CreateTable
CREATE TABLE "Partenaire" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "TypePartenaire" NOT NULL,
    "siteWeb" TEXT,
    "paliers" TEXT[],
    "niveauActuel" TEXT NOT NULL,
    "depuis" TIMESTAMP(3),
    "motsClesProduits" TEXT[],
    "channelManagerNom" TEXT,
    "channelManagerEmail" TEXT,
    "channelManagerTelephone" TEXT,
    "notes" TEXT,
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partenaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConditionPartenariat" (
    "id" TEXT NOT NULL,
    "partenaireId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "exigence" TEXT NOT NULL,
    "situation" TEXT,
    "satisfaite" BOOLEAN NOT NULL DEFAULT false,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConditionPartenariat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Partenaire_nom_key" ON "Partenaire"("nom");

-- CreateIndex
CREATE INDEX "Partenaire_estDemo_idx" ON "Partenaire"("estDemo");

-- CreateIndex
CREATE INDEX "ConditionPartenariat_partenaireId_idx" ON "ConditionPartenariat"("partenaireId");

-- AddForeignKey
ALTER TABLE "ConditionPartenariat" ADD CONSTRAINT "ConditionPartenariat_partenaireId_fkey" FOREIGN KEY ("partenaireId") REFERENCES "Partenaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
