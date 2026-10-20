-- AlterTable
ALTER TABLE "Vente" ADD COLUMN     "coutSaisiLe" TIMESTAMP(3),
ADD COLUMN     "coutSaisiParNom" TEXT,
ADD COLUMN     "referenceCommande" TEXT,
ALTER COLUMN "prixAchat" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Vente_referenceCommande_idx" ON "Vente"("referenceCommande");
