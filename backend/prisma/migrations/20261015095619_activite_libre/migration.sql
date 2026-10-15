-- L'activite d'un creneau passe d'une liste fermee a du texte libre.
--
-- Prisma proposait de supprimer puis recreer la colonne, ce qui jetterait
-- l'activite de chaque creneau deja pointe. On convertit a la place, en
-- traduisant chaque code de l'ancienne enumeration par le libelle que
-- l'interface affichait : les feuilles de temps existantes gardent leur sens,
-- et les libelles ainsi obtenus sont exactement ceux que la saisie reproposera.

ALTER TABLE "SaisieTemps"
  ALTER COLUMN "activite" TYPE TEXT
  USING CASE "activite"::text
    WHEN 'PROSPECTION'     THEN 'Prospection'
    WHEN 'RELANCE'         THEN 'Relance'
    WHEN 'RENDEZ_VOUS'     THEN 'Rendez-vous client'
    WHEN 'DEMONSTRATION'   THEN 'Démonstration'
    WHEN 'DEVIS'           THEN 'Rédaction de devis'
    WHEN 'NEGOCIATION'     THEN 'Négociation'
    WHEN 'SUIVI_CLIENT'    THEN 'Suivi client'
    WHEN 'REUNION_INTERNE' THEN 'Réunion interne'
    WHEN 'FORMATION'       THEN 'Formation'
    WHEN 'DEPLACEMENT'     THEN 'Déplacement'
    WHEN 'ADMINISTRATIF'   THEN 'Administratif'
    WHEN 'AUTRE'           THEN 'Autre'
    ELSE "activite"::text
  END;

-- DropEnum
DROP TYPE "TypeActivite";
