-- CreateEnum
CREATE TYPE "StatutCreneau" AS ENUM ('PREVU', 'REALISE');

-- AlterTable
ALTER TABLE "SaisieTemps" ADD COLUMN     "statut" "StatutCreneau" NOT NULL DEFAULT 'REALISE';
