-- AlterTable
ALTER TABLE "DemandeCotation" ADD COLUMN     "motifRevision" TEXT,
ADD COLUMN     "nbRevisions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "revisionDemandeeLe" TIMESTAMP(3);
