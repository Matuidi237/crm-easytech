-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "jour" DATE NOT NULL,
    "texte" TEXT NOT NULL,
    "couleur" TEXT NOT NULL DEFAULT 'JAUNE',
    "epinglee" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT,
    "clientNom" TEXT,
    "estDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_utilisateurId_jour_idx" ON "Note"("utilisateurId", "jour");

-- CreateIndex
CREATE INDEX "Note_utilisateurId_epinglee_idx" ON "Note"("utilisateurId", "epinglee");

-- CreateIndex
CREATE INDEX "Note_clientId_idx" ON "Note"("clientId");

-- CreateIndex
CREATE INDEX "Note_estDemo_idx" ON "Note"("estDemo");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
