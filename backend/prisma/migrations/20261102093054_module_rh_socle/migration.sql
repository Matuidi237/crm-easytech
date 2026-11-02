-- CreateEnum
CREATE TYPE "StatutEmploye" AS ENUM ('ACTIF', 'SUSPENDU', 'SORTI');

-- CreateEnum
CREATE TYPE "TypeContrat" AS ENUM ('CDI', 'CDD', 'STAGE', 'PRESTATION', 'INTERIM');

-- CreateEnum
CREATE TYPE "TypeAbsence" AS ENUM ('CONGE_ANNUEL', 'MALADIE', 'MATERNITE', 'PATERNITE', 'SANS_SOLDE', 'EVENEMENT_FAMILIAL', 'AUTORISATION_EXCEPTIONNELLE', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutAbsence" AS ENUM ('SOUMISE', 'VALIDEE_MANAGER', 'APPROUVEE', 'REFUSEE', 'ANNULEE');

-- AlterEnum
ALTER TYPE "RoleUtilisateur" ADD VALUE 'RH';

-- CreateTable
CREATE TABLE "Employe" (
    "id" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenoms" TEXT,
    "emailPersonnel" TEXT,
    "telephone" TEXT,
    "adresse" TEXT,
    "dateNaissance" DATE,
    "lieuNaissance" TEXT,
    "numeroCnps" TEXT,
    "poste" TEXT,
    "service" TEXT,
    "managerId" TEXT,
    "dateEmbauche" DATE NOT NULL,
    "statut" "StatutEmploye" NOT NULL DEFAULT 'ACTIF',
    "dateSortie" DATE,
    "motifSortie" TEXT,
    "utilisateurId" TEXT,
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrat" (
    "id" TEXT NOT NULL,
    "employeId" TEXT NOT NULL,
    "type" "TypeContrat" NOT NULL,
    "intitule" TEXT,
    "debut" DATE NOT NULL,
    "fin" DATE,
    "finEssai" DATE,
    "salaireBrutMensuel" DECIMAL(18,2),
    "tempsPct" INTEGER NOT NULL DEFAULT 100,
    "note" TEXT,
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contrat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandeAbsence" (
    "id" TEXT NOT NULL,
    "employeId" TEXT NOT NULL,
    "type" "TypeAbsence" NOT NULL,
    "debut" DATE NOT NULL,
    "fin" DATE NOT NULL,
    "joursOuvres" DECIMAL(5,1) NOT NULL,
    "demiDebut" BOOLEAN NOT NULL DEFAULT false,
    "demiFin" BOOLEAN NOT NULL DEFAULT false,
    "motif" TEXT,
    "statut" "StatutAbsence" NOT NULL DEFAULT 'SOUMISE',
    "valideeManagerParNom" TEXT,
    "valideeManagerLe" TIMESTAMP(3),
    "valideeRhParNom" TEXT,
    "valideeRhLe" TIMESTAMP(3),
    "decideeParNom" TEXT,
    "motifDecision" TEXT,
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandeAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjustementConge" (
    "id" TEXT NOT NULL,
    "employeId" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "jours" DECIMAL(5,1) NOT NULL,
    "motif" TEXT NOT NULL,
    "saisiParNom" TEXT NOT NULL,
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AjustementConge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employe_matricule_key" ON "Employe"("matricule");

-- CreateIndex
CREATE UNIQUE INDEX "Employe_utilisateurId_key" ON "Employe"("utilisateurId");

-- CreateIndex
CREATE INDEX "Employe_statut_idx" ON "Employe"("statut");

-- CreateIndex
CREATE INDEX "Employe_managerId_idx" ON "Employe"("managerId");

-- CreateIndex
CREATE INDEX "Employe_estDemo_idx" ON "Employe"("estDemo");

-- CreateIndex
CREATE INDEX "Employe_nom_idx" ON "Employe"("nom");

-- CreateIndex
CREATE INDEX "Contrat_employeId_idx" ON "Contrat"("employeId");

-- CreateIndex
CREATE INDEX "Contrat_fin_idx" ON "Contrat"("fin");

-- CreateIndex
CREATE INDEX "Contrat_estDemo_idx" ON "Contrat"("estDemo");

-- CreateIndex
CREATE INDEX "DemandeAbsence_employeId_debut_idx" ON "DemandeAbsence"("employeId", "debut");

-- CreateIndex
CREATE INDEX "DemandeAbsence_statut_idx" ON "DemandeAbsence"("statut");

-- CreateIndex
CREATE INDEX "DemandeAbsence_estDemo_idx" ON "DemandeAbsence"("estDemo");

-- CreateIndex
CREATE INDEX "AjustementConge_employeId_annee_idx" ON "AjustementConge"("employeId", "annee");

-- CreateIndex
CREATE INDEX "AjustementConge_estDemo_idx" ON "AjustementConge"("estDemo");

-- AddForeignKey
ALTER TABLE "Employe" ADD CONSTRAINT "Employe_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employe" ADD CONSTRAINT "Employe_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrat" ADD CONSTRAINT "Contrat_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "Employe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeAbsence" ADD CONSTRAINT "DemandeAbsence_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "Employe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjustementConge" ADD CONSTRAINT "AjustementConge_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "Employe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
