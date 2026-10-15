-- CreateEnum
CREATE TYPE "NatureVente" AS ENUM ('MATERIEL', 'SERVICE');

-- AlterTable
ALTER TABLE "Vente" ADD COLUMN     "nature" "NatureVente" NOT NULL DEFAULT 'MATERIEL';
