-- CreateEnum
CREATE TYPE "NewsletterStatut" AS ENUM ('BROUILLON', 'ENVOI_EN_COURS', 'ENVOYEE', 'ECHEC');

-- CreateEnum
CREATE TYPE "NewsletterFormat" AS ENUM ('TEXTE', 'HTML');

-- CreateEnum
CREATE TYPE "EnvoiStatut" AS ENUM ('ENVOYE', 'ECHEC');

-- CreateTable
CREATE TABLE "Newsletter" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "sujet" TEXT NOT NULL,
    "format" "NewsletterFormat" NOT NULL DEFAULT 'TEXTE',
    "contenu" TEXT NOT NULL,
    "secteursCibles" TEXT[],
    "statut" "NewsletterStatut" NOT NULL DEFAULT 'BROUILLON',
    "nbDestinataires" INTEGER,
    "nbEnvoyes" INTEGER,
    "nbEchecs" INTEGER,
    "envoyeeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Newsletter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterEnvoi" (
    "id" TEXT NOT NULL,
    "newsletterId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientNom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "statut" "EnvoiStatut" NOT NULL,
    "erreur" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterEnvoi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsletterEnvoi_newsletterId_idx" ON "NewsletterEnvoi"("newsletterId");

-- AddForeignKey
ALTER TABLE "NewsletterEnvoi" ADD CONSTRAINT "NewsletterEnvoi_newsletterId_fkey" FOREIGN KEY ("newsletterId") REFERENCES "Newsletter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
