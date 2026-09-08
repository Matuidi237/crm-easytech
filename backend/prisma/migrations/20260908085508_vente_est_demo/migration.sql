-- AlterTable
ALTER TABLE "Vente" ADD COLUMN     "estDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Vente_estDemo_idx" ON "Vente"("estDemo");
