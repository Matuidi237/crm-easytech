/* En production, le SPA et l'API sont servis par la même origine : nginx relaie
   /api vers le backend. Une URL relative suffit donc, ce qui évite d'avoir à
   figer l'adresse du serveur au moment du build. En développement, on vise le
   backend local lancé séparément. */
const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000");
const TOKEN_KEY = "crm_token";
const USER_KEY = "crm_utilisateur";

export const ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "DG",
  "RESPONSABLE_COMMERCIAL",
  "COMMERCIAL",
  "COMPTABLE",
  "CHEF_DE_PROJET",
] as const;

export type Role = (typeof ROLES)[number];

/** Libellés affichés. La matrice des droits, elle, vit uniquement côté serveur. */

export type Permission =
  | "clients.voirTous" | "clients.creer" | "clients.modifier" | "clients.supprimer"
  | "clients.importer" | "clients.exporter" | "clients.coordonnees"
  | "acces.accorder"
  | "newsletters.voir" | "newsletters.creer" | "newsletters.envoyer"
  | "stats.globales" | "utilisateurs.gerer" | "utilisateurs.gererAdmins" | "permissions.gerer";

export type SessionUtilisateur = {
  id: string;
  identifiant: string;
  nomComplet: string;
  role: Role;
  /** Fournies par le serveur : l interface ne redéfinit jamais les droits. */
  permissions: Permission[];
};

export type Utilisateur = Omit<SessionUtilisateur, "permissions"> & {
  email: string | null;
  fonction: string | null;
  actif: boolean;
  dernierAcces: string | null;
  createdAt: string;
  responsableId: string | null;
  responsable: { id: string; nomComplet: string } | null;
  nbAccesAccordes?: number;
  nbClientsPossedes?: number;
  permissions?: Permission[];
};

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getSessionUtilisateur(): SessionUtilisateur | null {
  const brut = localStorage.getItem(USER_KEY);
  if (!brut) return null;
  try {
    return JSON.parse(brut) as SessionUtilisateur;
  } catch {
    return null;
  }
}

export function setSessionUtilisateur(u: SessionUtilisateur) {
  localStorage.setItem(USER_KEY, JSON.stringify(u));
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

class AuthError extends Error {}

async function authedFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401) {
    clearToken();
    throw new AuthError("Session expirée, merci de vous reconnecter.");
  }

  return res;
}

export async function login(username: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Échec de la connexion.");
  const { token, utilisateur } = (await res.json()) as { token: string; utilisateur: SessionUtilisateur };
  setToken(token);
  setSessionUtilisateur(utilisateur);
  return utilisateur;
}

/* -------------------------------------------------------- Compte connecté */

export async function fetchMoi() {
  const res = await authedFetch("/api/auth/moi");
  if (!res.ok) throw new Error("Erreur lors du chargement du profil.");
  return res.json() as Promise<Utilisateur>;
}

/**
 * Réaligne la session locale sur ce que le serveur autorise réellement.
 *
 * Les droits sont recopiés dans le localStorage à la connexion pour que
 * l'interface sache quoi afficher. Si le super administrateur modifie la
 * matrice entre-temps, cette copie devient périmée : le serveur refuserait
 * bien l'appel, mais l'utilisateur verrait des menus qui ne mènent nulle part,
 * ou l'inverse. On la resynchronise donc à chaque ouverture de l'application.
 */
export async function synchroniserSession() {
  const session = getSessionUtilisateur();
  if (!session) return null;
  const profil = await fetchMoi();
  const aJour: SessionUtilisateur = {
    id: profil.id,
    identifiant: profil.identifiant,
    nomComplet: profil.nomComplet,
    role: profil.role,
    permissions: profil.permissions ?? session.permissions,
  };
  setSessionUtilisateur(aJour);
  return aJour;
}

export async function updateMoi(data: { nomComplet: string; email: string; fonction: string }) {
  const res = await authedFetch("/api/auth/moi", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de l'enregistrement.");
  const { utilisateur, token } = (await res.json()) as { utilisateur: Utilisateur; token: string };
  setToken(token);
  setSessionUtilisateur({
    id: utilisateur.id,
    identifiant: utilisateur.identifiant,
    nomComplet: utilisateur.nomComplet,
    role: utilisateur.role,
    // Le rôle n'a pas changé : on conserve les droits déjà en session.
    permissions: getSessionUtilisateur()?.permissions ?? [],
  });
  return utilisateur;
}

export async function changerMonMotDePasse(motDePasseActuel: string, nouveauMotDePasse: string) {
  const res = await authedFetch("/api/auth/moi/mot-de-passe", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motDePasseActuel, nouveauMotDePasse }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors du changement de mot de passe.");
}

/* ------------------------------------------------ Administration des comptes */

export async function fetchUtilisateurs() {
  const res = await authedFetch("/api/utilisateurs");
  if (!res.ok) throw new Error("Erreur lors du chargement des comptes.");
  return res.json() as Promise<Utilisateur[]>;
}

export async function createUtilisateur(data: {
  identifiant: string;
  nomComplet: string;
  email: string;
  fonction: string;
  role: Role;
  motDePasse: string;
  responsableId?: string | null;
}) {
  const res = await authedFetch("/api/utilisateurs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de la création du compte.");
  return res.json() as Promise<Utilisateur>;
}

export async function updateUtilisateur(
  id: string,
  data: Partial<{ nomComplet: string; email: string; fonction: string; role: Role; actif: boolean; responsableId: string | null }>
) {
  const res = await authedFetch(`/api/utilisateurs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de la modification.");
  return res.json() as Promise<Utilisateur>;
}

export async function reinitialiserMotDePasse(id: string, motDePasse: string) {
  const res = await authedFetch(`/api/utilisateurs/${id}/mot-de-passe`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motDePasse }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de la réinitialisation.");
}

export async function deleteUtilisateur(id: string) {
  const res = await authedFetch(`/api/utilisateurs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de la suppression du compte.");
}

/** Rôles que le compte connecté a le droit d'attribuer, et responsables assignables. */
export async function fetchOptionsComptes() {
  const res = await authedFetch("/api/utilisateurs/options");
  if (!res.ok) throw new Error("Erreur lors du chargement des options.");
  return res.json() as Promise<{
    roles: { valeur: Role; libelle: string }[];
    responsables: { id: string; nomComplet: string; role: Role }[];
  }>;
}

/* ------------------------------------------------------ Matrice des permissions */

export type LignePermission = { cle: Permission; groupe: string; libelle: string; detail: string };

export type RolePermissions = {
  role: Role;
  libelle: string;
  /** Le super administrateur est affiché mais verrouillé. */
  modifiable: boolean;
  /** true si le rôle s'écarte des valeurs par défaut du code. */
  surcharge: boolean;
  permissions: Permission[];
  parDefaut: Permission[];
};

export async function fetchMatricePermissions() {
  const res = await authedFetch("/api/permissions");
  if (!res.ok) throw new Error("Erreur lors du chargement des permissions.");
  return res.json() as Promise<{ catalogue: LignePermission[]; roles: RolePermissions[] }>;
}

export async function enregistrerPermissions(role: Role, permissions: Permission[]) {
  const res = await authedFetch(`/api/permissions/${role}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de l'enregistrement.");
}

export async function reinitialiserPermissions(role: Role) {
  const res = await authedFetch(`/api/permissions/${role}/reinitialiser`, { method: "POST" });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de la réinitialisation.");
}

/* ------------------------------------------------- Accès nominatifs aux clients */

export type Beneficiaire = {
  id: string;
  nomComplet: string;
  identifiant: string;
  role: Role;
  nbAcces: number;
};

/** Comptes à périmètre restreint, seuls concernés par un octroi d'accès. */
export async function fetchBeneficiaires() {
  const res = await authedFetch("/api/acces/beneficiaires");
  if (!res.ok) throw new Error("Erreur lors du chargement des comptes.");
  return res.json() as Promise<Beneficiaire[]>;
}

export async function fetchAccesDe(utilisateurId: string) {
  const res = await authedFetch(`/api/acces/utilisateur/${utilisateurId}`);
  if (!res.ok) throw new Error("Erreur lors du chargement des accès.");
  return res.json() as Promise<
    { id: string; client: { id: string; nom: string; secteurActivite: string | null; pays: string | null }; accordePar: string; accordeLe: string }[]
  >;
}

export async function accorderAcces(utilisateurId: string, clientIds: string[]) {
  const res = await authedFetch("/api/acces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ utilisateurId, clientIds }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de l'ouverture des accès.");
  return res.json() as Promise<{ accordes: number; dejaOuverts: number; introuvables: number }>;
}

export async function retirerAcces(utilisateurId: string, clientId: string) {
  const res = await authedFetch("/api/acces", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ utilisateurId, clientId }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors du retrait de l'accès.");
}

export type Client = {
  id: string;
  nom: string;
  adressePhysique?: string | null;
  ville?: string | null;
  pays?: string | null;
  siteWeb?: string | null;
  emailContact?: string | null;
  telephone?: string | null;
  nomContactInterne?: string | null;
  commercialEnCharge?: string | null;
  secteurActivite?: string | null;
  chiffreAffaires?: string | number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Facets = {
  pays: string[];
  villes: string[];
  secteurs: string[];
  commerciaux: string[];
};

export type ClientFilters = {
  pays?: string;
  ville?: string;
  secteurActivite?: string;
  commercialEnCharge?: string;
  caMin?: string;
  caMax?: string;
  recherche?: string;
  page?: number;
  pageSize?: number;
  tri?: string;
  ordre?: "asc" | "desc";
};

export type Repartition = { label: string; count: number };

export type Stats = {
  totalClients: number;
  nbClientsAvecEmail: number;
  nbContacts: number;
  nbPays: number;
  nbSecteurs: number;
  newslettersEnvoyees: number;
  chiffreAffairesCumule: string | number;
  repartitionPays: Repartition[];
  repartitionSecteur: Repartition[];
  dernierClients: Client[];
};

export async function fetchClients(filters: ClientFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const res = await authedFetch(`/api/clients?${params.toString()}`);
  if (!res.ok) throw new Error("Erreur lors du chargement des clients.");
  return res.json() as Promise<{ clients: Client[]; total: number; page: number; pageSize: number }>;
}

export async function fetchFacets() {
  const res = await authedFetch("/api/clients/facets");
  if (!res.ok) throw new Error("Erreur lors du chargement des filtres.");
  return res.json() as Promise<Facets>;
}

export async function fetchStats() {
  const res = await authedFetch("/api/clients/stats");
  if (!res.ok) throw new Error("Erreur lors du chargement des statistiques.");
  return res.json() as Promise<Stats>;
}

export async function deleteClient(id: string) {
  const res = await authedFetch(`/api/clients/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Erreur lors de la suppression.");
}

export async function createClient(data: Partial<Client>) {
  const res = await authedFetch("/api/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Erreur lors de la création du client.");
  return res.json() as Promise<Client>;
}

export type PreviewResponse = {
  token: string;
  fileName: string;
  format: string;
  headers: string[];
  sampleRows: Record<string, unknown>[];
  totalRows: number;
  clientFields: string[];
};

export async function previewImport(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await authedFetch("/api/import/preview", { method: "POST", body: formData });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de la lecture du fichier.");
  return res.json() as Promise<PreviewResponse>;
}

export async function commitImport(token: string, mapping: Record<string, string | null>) {
  const res = await authedFetch("/api/import/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, mapping }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de l'import.");
  return res.json() as Promise<{ totalRows: number; importedRows: number; errors: { ligne: number; message: string }[] }>;
}

export type ImportFile = {
  id: string;
  nomFichier: string;
  formatSource: string;
  nbLignesTotal: number;
  nbLignesImportees: number;
  nbErreurs: number;
  nbClientsActuels: number;
  createdAt: string;
};

export async function fetchImportFiles() {
  const res = await authedFetch("/api/import");
  if (!res.ok) throw new Error("Erreur lors du chargement des fichiers importés.");
  return res.json() as Promise<ImportFile[]>;
}

export async function deleteImportFile(id: string) {
  const res = await authedFetch(`/api/import/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de la suppression du fichier.");
}

export type NewsletterFormat = "TEXTE" | "HTML";
export type NewsletterStatut = "BROUILLON" | "ENVOI_EN_COURS" | "ENVOYEE" | "ECHEC";

export type Newsletter = {
  id: string;
  titre: string;
  sujet: string;
  format: NewsletterFormat;
  contenu: string;
  secteursCibles: string[];
  statut: NewsletterStatut;
  nbDestinataires: number | null;
  nbEnvoyes: number | null;
  nbEchecs: number | null;
  envoyeeLe: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewsletterEnvoi = {
  id: string;
  clientNom: string;
  email: string;
  statut: "ENVOYE" | "ECHEC";
  erreur: string | null;
  createdAt: string;
};

export async function fetchNewsletters() {
  const res = await authedFetch("/api/newsletters");
  if (!res.ok) throw new Error("Erreur lors du chargement des newsletters.");
  return res.json() as Promise<Newsletter[]>;
}

export async function fetchNewsletter(id: string) {
  const res = await authedFetch(`/api/newsletters/${id}`);
  if (!res.ok) throw new Error("Erreur lors du chargement de la newsletter.");
  return res.json() as Promise<Newsletter & { envois: NewsletterEnvoi[] }>;
}

export async function fetchAudience(secteurs: string[]) {
  const params = new URLSearchParams({ secteurs: secteurs.join(",") });
  const res = await authedFetch(`/api/newsletters/audience?${params.toString()}`);
  if (!res.ok) throw new Error("Erreur lors du calcul de l'audience.");
  return res.json() as Promise<{ nbDestinataires: number }>;
}

export async function createNewsletter(data: { titre: string; sujet: string; format: NewsletterFormat; contenu: string; secteursCibles: string[] }) {
  const res = await authedFetch("/api/newsletters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de la création.");
  return res.json() as Promise<Newsletter>;
}

export async function updateNewsletter(id: string, data: { titre: string; sujet: string; format: NewsletterFormat; contenu: string; secteursCibles: string[] }) {
  const res = await authedFetch(`/api/newsletters/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de la modification.");
  return res.json() as Promise<Newsletter>;
}

export async function deleteNewsletter(id: string) {
  const res = await authedFetch(`/api/newsletters/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de la suppression.");
}

export async function sendNewsletter(id: string) {
  const res = await authedFetch(`/api/newsletters/${id}/send`, { method: "POST" });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de l'envoi.");
  return res.json() as Promise<{ newsletter: Newsletter; mailerLive: boolean }>;
}

/* ------------------------------------------------------------- Direction */

export type IndicateursDirection = {
  aDesVentes: boolean;
  nbVentes: number;
  chiffreAffaires: number;
  meilleurVendeur: { nom: string; ca: number; nbVentes: number; partPct: number } | null;
  meilleurProduit: { nom: string; nbVentes: number; ca: number; partPct: number } | null;
  beneficeMoyen: number | null;
  beneficeTotal?: number;
  margeMoyennePct: number | null;
  nbClientsFactures: number;
  /** Mois en cours comparé au précédent. null = pas de base de comparaison. */
  variations: {
    chiffreAffaires: number | null;
    nbVentes: number | null;
    beneficeMoyen: number | null;
  };
};

export async function fetchIndicateursDirection() {
  const res = await authedFetch("/api/direction/tableau-de-bord");
  if (!res.ok) throw new Error("Erreur lors du chargement des indicateurs.");
  return res.json() as Promise<IndicateursDirection>;
}


export type DimensionCa = "pays" | "secteur" | "commercial" | "produit";
export type DimensionTop = "commercial" | "pays" | "secteur";

export type LigneCa = { label: string; montant: number; nbVentes: number };
export type LigneTopProduit = {
  groupe: string;
  produit: string;
  nbVentes: number;
  montant: number;
  partPct: number;
};
export type VenteRecente = {
  dateVente: string;
  clientNom: string;
  produit: string;
  vendeurNom: string;
  quantite: number;
  montant: number;
  benefice: number;
};

export type AnalysesDirection = {
  chiffreAffaires: Record<DimensionCa, LigneCa[]>;
  meilleursProduits: Record<DimensionTop, LigneTopProduit[]>;
  /** Ordre global des produits : c'est lui qui fixe leur couleur à l'écran. */
  ordreProduits: string[];
  parMois: { mois: string; ca: number; benefice: number; nbVentes: number }[];
  dernieresVentes: VenteRecente[];
};

export async function fetchAnalysesDirection() {
  const res = await authedFetch("/api/direction/analyses");
  if (!res.ok) throw new Error("Erreur lors du chargement des analyses.");
  return res.json() as Promise<AnalysesDirection>;
}

/* ------------------------------------------------------------- Commercial */

/**
 * Tableau de bord d'un commercial.
 *
 * Aucun identifiant n'est transmis : la route travaille sur le compte
 * connecté. Un commercial ne peut donc pas lire les chiffres d'un collègue en
 * modifiant un paramètre, et l'interface n'a pas à s'en préoccuper.
 */
export type TableauCommercial = {
  identite: { nomComplet: string; pays: string | null };
  chiffreAffaires: {
    total: number;
    benefice: number;
    margePct: number | null;
    nbVentes: number;
    mois: number;
    variationMois: number | null;
    partEquipePct: number | null;
    derniereVente: string | null;
  };
  classement: {
    rang: number | null;
    effectif: number;
    rangChiffreAffaires: number | null;
    rangRentabilite: number | null;
    caPremier: number;
  };
  portefeuille: { total: number; avecVente: number; couverturePct: number | null };
  commissions: {
    /** Null quand aucun taux n'est fixé : à distinguer d'un taux à zéro. */
    tauxPct: number | null;
    attendu: number | null;
    recu: number | null;
    nbVentesReglees: number;
  };
};

export async function fetchTableauCommercial() {
  const res = await authedFetch("/api/commercial/tableau-de-bord");
  if (!res.ok) throw new Error("Erreur lors du chargement de votre tableau de bord.");
  return res.json() as Promise<TableauCommercial>;
}

/* ---------------------------------------------------------------- Équipes */

/** Chiffres communs à tout lot de projets, du plus global au plus fin. */
export type BilanProjets = {
  total: number;
  ouverts: number;
  livres: number;
  enRetard: number;
  annules: number;
  budgetPilote: number;
  budgetOuvert: number;
  /** null tant que rien n'est livré : on ne juge pas un délai sans livraison. */
  respectDelaisPct: number | null;
  avancementMoyenPct: number | null;
  derniereLivraison: string | null;
};

export type ApercuEquipes = {
  commerciale: {
    effectif: number;
    effectifActif: number;
    nbPays: number;
    chiffreAffaires: number;
    benefice: number;
    nbVentes: number;
  };
  projet: { effectif: number; effectifActif: number; nbPays: number } & BilanProjets;
};

export async function fetchApercuEquipes() {
  const res = await authedFetch("/api/direction/equipes");
  if (!res.ok) throw new Error("Erreur lors du chargement des équipes.");
  return res.json() as Promise<ApercuEquipes>;
}

export type MembreCommercial = {
  id: string;
  nomComplet: string;
  identifiant: string;
  email: string | null;
  fonction: string | null;
  role: Role;
  actif: boolean;
  pays: string | null;
  chiffreAffaires: number;
  benefice: number;
  nbVentes: number;
  derniereVente: string | null;
  /** null quand aucun taux de commission n'a été fixé pour ce compte. */
  commission: number | null;
};

export type EquipeCommerciale = { membres: MembreCommercial[]; pays: string[] };

export async function fetchEquipeCommerciale(filtres: { recherche?: string; pays?: string } = {}) {
  const params = new URLSearchParams();
  if (filtres.recherche) params.set("recherche", filtres.recherche);
  if (filtres.pays) params.set("pays", filtres.pays);
  const suffixe = params.toString() ? `?${params}` : "";
  const res = await authedFetch(`/api/direction/equipe-commerciale${suffixe}`);
  if (!res.ok) throw new Error("Erreur lors du chargement de l'équipe commerciale.");
  return res.json() as Promise<EquipeCommerciale>;
}

export type VenteCommercial = {
  id: string;
  dateVente: string;
  clientNom: string;
  produit: string;
  quantite: number;
  montant: number;
  benefice: number;
  commission: number | null;
};

export type FicheCommercial = {
  membre: {
    id: string;
    nomComplet: string;
    identifiant: string;
    email: string | null;
    fonction: string | null;
    role: Role;
    actif: boolean;
    pays: string | null;
    dernierAcces: string | null;
    responsable: { id: string; nomComplet: string } | null;
    tauxCommissionPct: number | null;
  };
  chiffreAffaires: number;
  benefice: number;
  commissions: number | null;
  margePct: number;
  nbVentes: number;
  nbClients: number;
  partEquipePct: number;
  rang: number;
  effectifEquipe: number;
  derniereVente: string | null;
  parMois: { mois: string; ca: number; benefice: number; nbVentes: number }[];
  ventes: VenteCommercial[];
};

export async function fetchFicheCommercial(id: string) {
  const res = await authedFetch(`/api/direction/commercial/${id}`);
  if (res.status === 404) throw new Error("Commercial introuvable.");
  if (!res.ok) throw new Error("Erreur lors du chargement de la fiche.");
  return res.json() as Promise<FicheCommercial>;
}

/* ----------------------------------------------------------- Équipe projet */

export type StatutProjet = "EN_PREPARATION" | "EN_COURS" | "EN_PAUSE" | "LIVRE" | "ANNULE";

export type MembreProjet = {
  id: string;
  nomComplet: string;
  identifiant: string;
  email: string | null;
  fonction: string | null;
  role: Role;
  actif: boolean;
  pays: string | null;
} & BilanProjets;

export type EquipeProjet = { membres: MembreProjet[]; pays: string[] };

export async function fetchEquipeProjet(filtres: { recherche?: string; pays?: string } = {}) {
  const params = new URLSearchParams();
  if (filtres.recherche) params.set("recherche", filtres.recherche);
  if (filtres.pays) params.set("pays", filtres.pays);
  const suffixe = params.toString() ? `?${params}` : "";
  const res = await authedFetch(`/api/direction/equipe-projet${suffixe}`);
  if (!res.ok) throw new Error("Erreur lors du chargement de l'équipe projet.");
  return res.json() as Promise<EquipeProjet>;
}

export type Projet = {
  id: string;
  nom: string;
  clientNom: string;
  statut: StatutProjet;
  budget: number;
  avancementPct: number;
  dateDebut: string;
  dateFinPrevue: string;
  dateFinReelle: string | null;
  /** Vente d'origine : ce qui a été vendu, et par qui. */
  produit: string | null;
  vendeurNom: string | null;
  enRetard: boolean;
  /** Jours d'écart à l'échéance promise, négatif si livré en avance. */
  joursDeDerive: number | null;
};

export type FicheChefProjet = {
  membre: {
    id: string;
    nomComplet: string;
    identifiant: string;
    email: string | null;
    fonction: string | null;
    role: Role;
    actif: boolean;
    pays: string | null;
    dernierAcces: string | null;
  };
  rang: number;
  effectifEquipe: number;
  projets: Projet[];
} & BilanProjets;

export async function fetchFicheChefProjet(id: string) {
  const res = await authedFetch(`/api/direction/chef-projet/${id}`);
  if (res.status === 404) throw new Error("Chef de projet introuvable.");
  if (!res.ok) throw new Error("Erreur lors du chargement de la fiche.");
  return res.json() as Promise<FicheChefProjet>;
}

/* ------------------------------------------------------------ Partenaires */

export type TypePartenaire = "EDITEUR" | "CONSTRUCTEUR" | "DISTRIBUTEUR" | "SERVICES";

export type ConditionPartenariat = {
  id: string;
  libelle: string;
  exigence: string;
  situation: string | null;
  satisfaite: boolean;
  /** Vrai quand le verdict vient des ventes et non d'une case cochée. */
  mesuree: boolean;
  seuil: number | null;
  realise: number | null;
  progressionPct: number | null;
};

export type Partenaire = {
  id: string;
  nom: string;
  type: TypePartenaire;
  siteWeb: string | null;
  paliers: string[];
  niveauActuel: string;
  /** -1 si le niveau courant ne figure pas dans l'échelle déclarée. */
  rangActuel: number;
  niveauSuivant: string | null;
  auSommet: boolean;
  depuis: string | null;
  channelManager: { nom: string | null; email: string | null; telephone: string | null } | null;
  notes: string | null;
  conditions: ConditionPartenariat[];
  conditionsRemplies: number;
  conditionsTotal: number;
  caDouzeMois: number;
  caTotal: number;
  beneficeDouzeMois: number;
  nbVentesDouzeMois: number;
  produits: string[];
};

export async function fetchPartenaires() {
  const res = await authedFetch("/api/direction/partenaires");
  if (!res.ok) throw new Error("Erreur lors du chargement des partenaires.");
  return res.json() as Promise<{ partenaires: Partenaire[] }>;
}

/* ------------------------------------------------------------- Campagnes */

export type TypeCampagne = "MAILING" | "NEWSLETTER";
export type StatutCampagne = "BROUILLON" | "PRETE" | "ENVOYEE" | "ECHEC";

export type CampagneResume = {
  id: string;
  type: TypeCampagne;
  titre: string;
  objet: string;
  statut: StatutCampagne;
  fichierSource: string | null;
  creeParNom: string;
  envoyeeLe: string | null;
  createdAt: string;
  nbDestinataires: number;
};

export type DestinataireCampagne = { email: string; nom: string | null };

export type AnalyseDestinataires = {
  fichier: string;
  lignesLues: number;
  /** Colonne retenue, null si l'adresse a été trouvée en balayant les cellules. */
  colonneEmail: string | null;
  /** Vrai quand le fichier n'avait pas de ligne d'entête. */
  sansEntete: boolean;
  nbDestinataires: number;
  /** Valeurs qui ressemblaient à une adresse sans en être une. */
  rejetees: number;
  apercu: DestinataireCampagne[];
  destinataires: DestinataireCampagne[];
};

export async function fetchCampagnes(type: TypeCampagne) {
  const res = await authedFetch(`/api/campagnes?type=${type}`);
  if (!res.ok) throw new Error("Erreur lors du chargement des campagnes.");
  return res.json() as Promise<{ campagnes: CampagneResume[] }>;
}

export async function analyserDestinataires(fichier: File) {
  const corps = new FormData();
  corps.append("file", fichier);
  const res = await authedFetch("/api/campagnes/destinataires/analyser", { method: "POST", body: corps });
  if (!res.ok) throw new Error((await res.json()).error ?? "Fichier illisible.");
  return res.json() as Promise<AnalyseDestinataires>;
}

export async function creerCampagne(data: {
  type: TypeCampagne;
  titre: string;
  objet: string;
  contenuHtml: string;
  fichierSource: string | null;
  destinataires: DestinataireCampagne[];
}) {
  const res = await authedFetch("/api/campagnes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erreur lors de la création.");
  return res.json() as Promise<{ id: string; titre: string; statut: StatutCampagne }>;
}

export async function supprimerCampagne(id: string) {
  const res = await authedFetch(`/api/campagnes/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Erreur lors de la suppression.");
}
