-- CreateEnum
CREATE TYPE "TypeCampagne" AS ENUM ('MAILING', 'NEWSLETTER');

-- CreateEnum
CREATE TYPE "StatutCampagne" AS ENUM ('BROUILLON', 'PRETE', 'ENVOYEE', 'ECHEC');

-- CreateTable
CREATE TABLE "Campagne" (
    "id" TEXT NOT NULL,
    "type" "TypeCampagne" NOT NULL,
    "titre" TEXT NOT NULL,
    "objet" TEXT NOT NULL,
    "contenuHtml" TEXT NOT NULL DEFAULT '',
    "statut" "StatutCampagne" NOT NULL DEFAULT 'BROUILLON',
    "fichierSource" TEXT,
    "creeParId" TEXT,
    "creeParNom" TEXT NOT NULL,
    "envoyeeLe" TIMESTAMP(3),
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campagne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampagneDestinataire" (
    "id" TEXT NOT NULL,
    "campagneId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampagneDestinataire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campagne_type_idx" ON "Campagne"("type");

-- CreateIndex
CREATE INDEX "Campagne_statut_idx" ON "Campagne"("statut");

-- CreateIndex
CREATE INDEX "Campagne_estDemo_idx" ON "Campagne"("estDemo");

-- CreateIndex
CREATE INDEX "CampagneDestinataire_campagneId_idx" ON "CampagneDestinataire"("campagneId");

-- CreateIndex
CREATE UNIQUE INDEX "CampagneDestinataire_campagneId_email_key" ON "CampagneDestinataire"("campagneId", "email");

-- AddForeignKey
ALTER TABLE "CampagneDestinataire" ADD CONSTRAINT "CampagneDestinataire_campagneId_fkey" FOREIGN KEY ("campagneId") REFERENCES "Campagne"("id") ON DELETE CASCADE ON UPDATE CASCADE;
