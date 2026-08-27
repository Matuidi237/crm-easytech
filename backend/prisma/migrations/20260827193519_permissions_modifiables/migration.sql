-- CreateTable
CREATE TABLE "PermissionsRole" (
    "role" "RoleUtilisateur" NOT NULL,
    "permissions" TEXT[],
    "modifiePar" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionsRole_pkey" PRIMARY KEY ("role")
);
