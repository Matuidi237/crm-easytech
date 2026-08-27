-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "adressePhysique" TEXT,
    "ville" TEXT,
    "pays" TEXT,
    "siteWeb" TEXT,
    "emailContact" TEXT,
    "nomContactInterne" TEXT,
    "commercialEnCharge" TEXT,
    "secteurActivite" TEXT,
    "chiffreAffaires" DECIMAL(18,2),
    "telephone" TEXT,
    "notes" TEXT,
    "champsPersonnalises" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "formatSource" TEXT NOT NULL,
    "nbLignesTotal" INTEGER NOT NULL,
    "nbLignesImportees" INTEGER NOT NULL,
    "nbErreurs" INTEGER NOT NULL,
    "mappingUtilise" JSONB NOT NULL,
    "erreurs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_pays_idx" ON "Client"("pays");

-- CreateIndex
CREATE INDEX "Client_ville_idx" ON "Client"("ville");

-- CreateIndex
CREATE INDEX "Client_secteurActivite_idx" ON "Client"("secteurActivite");

-- CreateIndex
CREATE INDEX "Client_commercialEnCharge_idx" ON "Client"("commercialEnCharge");
