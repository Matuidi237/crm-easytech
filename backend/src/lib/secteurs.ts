/**
 * Taxonomie de secteurs d'activité du CRM.
 *
 * Les fichiers sources emploient des vocabulaires très différents (français,
 * anglais, abréviations, fautes de frappe) : sans regroupement on obtient des
 * centaines de valeurs uniques, inexploitables pour cibler une campagne.
 * Ce module ramène tout à une liste courte et stable.
 *
 * L'ordre des règles compte : les libellés les plus spécifiques doivent être
 * testés avant les plus génériques (« IT SECURITY » avant « SECURITY »).
 */

export const SECTEURS = [
  "Informatique & numérique",
  "Télécommunications",
  "Banque & finance",
  "Assurance",
  "Santé & pharmacie",
  "Éducation & recherche",
  "Énergie & pétrole",
  "BTP & construction",
  "Immobilier",
  "Transport & logistique",
  "Industrie & mines",
  "Agroalimentaire",
  "Commerce & distribution",
  "Tourisme & hôtellerie",
  "Médias & communication",
  "Conseil & services professionnels",
  "Secteur public & institutions",
  "ONG & organisations internationales",
] as const;

export type Secteur = (typeof SECTEURS)[number];

/** Valeur de repli : le libellé source n'a pas pu être rattaché. */
export const SECTEUR_AUTRE = "Autre";

/** Index des libellés canoniques, pour garantir l'idempotence (voir canoniserSecteur). */
const CANONIQUES_NORMALISES = new Map(SECTEURS.map((s) => [normaliser(s), s]));

/** Libellés qui ne désignent pas un secteur (fuites d'entête, remplissage). */
/* Comparé APRÈS normalisation : « N/A » y devient « N A ». */
const NON_SECTEURS = /^(SECTOR OF COMPANY|CITY OF COMPANY|TYPE OF COMPANY|N A|NA|NIL|NONE|DIVERS)$/;

type Regle = { secteur: Secteur; motsCles: string[] };

/* Testées dans l'ordre : du plus spécifique au plus générique. */
const REGLES: Regle[] = [
  // Spécifiques d'abord, car leurs mots-clés apparaissent aussi ailleurs.
  {
    secteur: "ONG & organisations internationales",
    motsCles: ["NGO", "ONG", "HUMANITARIAN", "BAILLEUR", "CHARITY", "FOUNDATION", "NON PROFIT", "NONPROFIT"],
  },
  {
    secteur: "Secteur public & institutions",
    motsCles: [
      "GOVERNMENT", "GOUVERNEMENTAL", "PARASTATAL", "POLITICAL", "GOVERNING BODY", "MINISTRY", "MINISTERE",
      "PUBLIC SERVICE", "DROUGHT MANAGEMENT", "IMMIGRATION", "COUNTY", "REGULATOR", "AUTHORITY",
    ],
  },
  {
    secteur: "Assurance",
    motsCles: ["INSURANCE", "INSUARANCE", "ASSURANCE", "ACTUARIAL", "ACTURIAL", "REASSURANCE"],
  },
  {
    secteur: "Télécommunications",
    motsCles: ["TELECOM", "TELECOMMUNICATION", "ISP", "INTERNET SERVICE", "MOBILE OPERATOR"],
  },
  {
    // Placé avant « Conseil » pour capter IT SECURITY / DATA SECURITY avant SECURITY seul.
    secteur: "Informatique & numérique",
    motsCles: [
      "IT SECURITY", "DATA SECURITY", "CYBER", "INFORMATION TECHNOLOGY", "INFORMATION TEHNOLOGY",
      "IT SERVICES", "IT SOLUTIONS", "SOFTWARE", "SOFT WARE", "DATA CENTER", "DATA CENTRE",
      "MANAGED SERVICES", "VEHICLE TRACKING", "VIHECLE TRACKING", "ARTECH", "AEROSPACE TECH",
      "GAMING", "DIGITAL", "INFORMATIQUE", "SYSTEMS", "SYSTEME", "ICT", "IT", "TECH", "FINTECH", "DATA",
    ],
  },
  {
    secteur: "Banque & finance",
    motsCles: [
      "BANK", "BANQUE", "BANCAIRE", "BANKING", "SACCO", "MICROFINANCE", "MICROCREDIT",
      "FINANCE", "FINANCIAL", "FINANCING", "CREDIT", "LENDING", "LOAN", "SAVING",
      "INVESTMENT", "CAPITAL", "MORTGAGE", "PENSION", "SECURITIES", "VALUATION", "BOURSE",
      "COLLECTION", "RECOUVREMENT", // agences de recouvrement
    ],
  },
  {
    // Avant « Santé » : « HOSPITALITY » contient « HOSPITAL » et serait mal classé.
    secteur: "Tourisme & hôtellerie",
    motsCles: [
      "HOSPITALITY", "HOTEL", "TOURISM", "TOURS", "TOUR", "TRAVEL", "TICKET",
      "RESORT", "LODGE", "RESTAURANT",
    ],
  },
  {
    secteur: "Santé & pharmacie",
    motsCles: [
      "HEALTH", "HEALLTH", "HOSPITAL", "DENTAL", "PHARMA", "MEDICAL", "MEDIC", "CLINIC",
      "LABORATOR", "HEARING", "DEAF", "PPES", "SANTE", "DIAGNOSTIC",
    ],
  },
  {
    secteur: "Éducation & recherche",
    motsCles: [
      "EDUCATION", "EDUCATIONAL", "COLLEGE", "SCHOOL", "ECOLE", "UNIVERSIT", "LEARNING",
      "TRAINING", "FORMATION", "RESEARCH", "REASEARCH", "ACADEM", "INSTITUT",
    ],
  },
  {
    secteur: "Énergie & pétrole",
    motsCles: [
      "OIL", "GAS", "GAZ", "PETROL", "ENERGY", "ENERGIE", "UTILITY", "SOLAR", "POWER",
      "ELECTRIC", "EAU ET ENERGIE",
    ],
  },
  {
    secteur: "BTP & construction",
    motsCles: [
      "CONSTRUCTION", "CONSTRUTION", "BUILDING", "CIVIL", "ENGINEER", "ARCHITECT", "ROAD", "RAOD",
      "BTP", "CIMENT", "CEMENT", "PAINT", "COATING", "INTERIOR DESIGN", "HARDWARE", "HARDAWARE",
      "PLUMBING", "INFRASTRUCTURE", "TRAVAUX",
    ],
  },
  {
    secteur: "Immobilier",
    motsCles: ["REAL ESTATE", "REALESTATE", "PROPERTY", "IMMOBILIER", "ESTATE"],
  },
  {
    secteur: "Transport & logistique",
    motsCles: [
      "LOGISTIC", "LOGISTIQUE", "TRANSPORT", "FORWARDING", "SHIPPING", "FREIGHT", "AERIEN",
      "AVIATION", "COURIER", "FLEET",
    ],
  },
  {
    secteur: "Agroalimentaire",
    motsCles: ["AGRI", "AGRO", "FOOD", "BEVERAGE", "FARM", "DAIRY", "FMCG", "FMG", "BRASSERIE", "LAIT"],
  },
  {
    secteur: "Médias & communication",
    motsCles: [
      "MEDIA", "NEWS", "ADVERTIS", "MARKETING", "BRANDING", "BRAND MODELING", "STUDIO",
      "EVENT", "PRINT", "PUBLICIT", "COMMUNICATION", "RADIO", "TELEVISION",
    ],
  },
  {
    secteur: "Industrie & mines",
    motsCles: [
      "MANUFACTUR", "MANUIFACTURING", "INDUSTR", "PRODUCTION", "CHEMICAL", "PLASTIC", "TEXTILE",
      "MINE", "MINING", "METAL", "QUARRY", "USINE",
    ],
  },
  {
    secteur: "Commerce & distribution",
    motsCles: [
      "RETAIL", "SUPERMARKET", "SUPPLIER", "SUPPLIES", "SUPLLIES", "IMPORT", "EXPORT",
      "CLOTHING", "SHOE", "FASHION", "TRADING", "COMMERCIAL", "CONSUMER", "STORE",
      "DISTRIBUTION", "WHOLESALE", "COMMERCE", "BOOKSHOP",
      // Concessionnaires et distributeurs de véhicules, pas des transporteurs.
      "AUTOMOBILE", "MOTOR VEHICLE", "CAR DEALER",
    ],
  },
  {
    // Filet le plus large : passe en dernier.
    secteur: "Conseil & services professionnels",
    motsCles: [
      "CONSULT", "ACCOUNT", "ACOUNTING", "AUDIT", "LAW", "LEGAL", "LITIGATION", "LETIGATION",
      "ADVOCATE", "AVOCAT", "JURIDIQUE", "HUMAN RESOURCE", "RECRUIT", "PLACEMENT", "TRANSLATION",
      "AUCTIONEER", "SECURITY", "ADVISORY", "CORPORATE SERVICE", "CONTACT CENTRE", "CONTACT CENTER",
      "MANAGEMENT", "ADMIN", "BUSINESS", "ENTERPRISE", "SERVICE", "CERVICE", "AGENCY", "AGENCE", "HR",
    ],
  },
];

/** Normalise pour comparaison : majuscules, sans accents, ponctuation en espaces. */
function normaliser(valeur: string) {
  return valeur
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Rattache un libellé source à un secteur canonique.
 * Renvoie `""` si le libellé est vide ou n'est pas un secteur,
 * `SECTEUR_AUTRE` si aucune règle ne correspond.
 */
export function canoniserSecteur(brut: string | null | undefined): string {
  const n = normaliser(String(brut ?? ""));
  if (!n) return "";

  // Un libellé déjà canonique se renvoie lui-même : la fonction doit être
  // idempotente, sinon réimporter un export du CRM reclasserait les fiches
  // (« Secteur public & institutions » contient « INSTITUT »…).
  const dejaCanonique = CANONIQUES_NORMALISES.get(n);
  if (dejaCanonique) return dejaCanonique;
  if (n === normaliser(SECTEUR_AUTRE)) return SECTEUR_AUTRE;

  if (NON_SECTEURS.test(n)) return "";

  for (const { secteur, motsCles } of REGLES) {
    for (const mot of motsCles) {
      const m = normaliser(mot);
      // Mots courts (IT, HR, ICT…) : correspondance sur mot entier uniquement,
      // sinon « IT » matcherait « SECURITY », « CREDIT », « HOSPITALITY »…
      const motif = m.length <= 3 ? new RegExp(`(^| )${m}( |$)`) : new RegExp(m.replace(/ /g, " "));
      if (motif.test(n)) return secteur;
    }
  }
  return SECTEUR_AUTRE;
}
