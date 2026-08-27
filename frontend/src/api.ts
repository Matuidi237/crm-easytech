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
  "RESPONSABLE_COMMERCIAL",
  "COMMERCIAL",
  "COMPTABLE",
  "CHEF_DE_PROJET",
] as const;

export type Role = (typeof ROLES)[number];

/** Libellés affichés. La matrice des droits, elle, vit uniquement côté serveur. */
export const LIBELLES_ROLES: Record<Role, string> = {
  SUPER_ADMIN: "Super administrateur",
  ADMIN: "Administrateur",
  RESPONSABLE_COMMERCIAL: "Responsable commercial",
  COMMERCIAL: "Commercial",
  COMPTABLE: "Comptable",
  CHEF_DE_PROJET: "Chef de projet",
};

export type Permission =
  | "clients.voirTous" | "clients.creer" | "clients.modifier" | "clients.supprimer"
  | "clients.importer" | "clients.exporter" | "clients.coordonnees"
  | "acces.accorder"
  | "newsletters.voir" | "newsletters.creer" | "newsletters.envoyer"
  | "stats.globales" | "utilisateurs.gerer" | "utilisateurs.gererAdmins";

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
