-- CreateEnum
CREATE TYPE "TypeActivite" AS ENUM ('PROSPECTION', 'RELANCE', 'RENDEZ_VOUS', 'DEMONSTRATION', 'DEVIS', 'NEGOCIATION', 'SUIVI_CLIENT', 'REUNION_INTERNE', 'FORMATION', 'DEPLACEMENT', 'ADMINISTRATIF', 'AUTRE');

-- CreateEnum
CREATE TYPE "PeriodeObjectif" AS ENUM ('JOUR', 'SEMAINE', 'MOIS', 'TRIMESTRE', 'SEMESTRE', 'ANNEE');

-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN     "objectifsPersonnels" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SaisieTemps" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "jour" DATE NOT NULL,
    "debutMinutes" INTEGER NOT NULL,
    "finMinutes" INTEGER NOT NULL,
    "activite" "TypeActivite" NOT NULL,
    "description" TEXT,
    "clientId" TEXT,
    "clientNom" TEXT,
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaisieTemps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectifCommercial" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "periode" "PeriodeObjectif" NOT NULL,
    "debut" DATE NOT NULL,
    "cibleCaXAF" DECIMAL(18,2),
    "cibleVentes" INTEGER,
    "cibleRendezVous" INTEGER,
    "fixeParEncadrement" BOOLEAN NOT NULL DEFAULT false,
    "definiParNom" TEXT NOT NULL,
    "note" TEXT,
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjectifCommercial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaisieTemps_utilisateurId_jour_idx" ON "SaisieTemps"("utilisateurId", "jour");

-- CreateIndex
CREATE INDEX "SaisieTemps_estDemo_idx" ON "SaisieTemps"("estDemo");

-- CreateIndex
CREATE INDEX "ObjectifCommercial_utilisateurId_periode_idx" ON "ObjectifCommercial"("utilisateurId", "periode");

-- CreateIndex
CREATE INDEX "ObjectifCommercial_estDemo_idx" ON "ObjectifCommercial"("estDemo");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectifCommercial_utilisateurId_periode_debut_fixeParEncad_key" ON "ObjectifCommercial"("utilisateurId", "periode", "debut", "fixeParEncadrement");

-- AddForeignKey
ALTER TABLE "SaisieTemps" ADD CONSTRAINT "SaisieTemps_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaisieTemps" ADD CONSTRAINT "SaisieTemps_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectifCommercial" ADD CONSTRAINT "ObjectifCommercial_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
