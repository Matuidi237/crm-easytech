export const CLIENT_FIELDS = [
  { key: "nom", label: "Nom du client", required: true },
  { key: "adressePhysique", label: "Adresse physique" },
  { key: "ville", label: "Ville" },
  { key: "pays", label: "Pays" },
  { key: "siteWeb", label: "Site web" },
  { key: "emailContact", label: "Adresse mail" },
  { key: "telephone", label: "Téléphone" },
  { key: "nomContactInterne", label: "Nom du contact (interne)" },
  { key: "commercialEnCharge", label: "Commercial en charge" },
  { key: "secteurActivite", label: "Secteur d'activité" },
  { key: "chiffreAffaires", label: "Chiffre d'affaires" },
  { key: "notes", label: "Notes" },
] as const;

export type ClientFieldKey = (typeof CLIENT_FIELDS)[number]["key"];

export const CLIENT_FIELD_KEYS = CLIENT_FIELDS.map((f) => f.key) as ClientFieldKey[];
