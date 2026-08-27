import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { Permission, SessionUtilisateur, clearToken, getSessionUtilisateur, getToken, login as apiLogin } from "./api";

type AuthContextValue = {
  isAuthenticated: boolean;
  utilisateur: SessionUtilisateur | null;
  estAdmin: boolean;
  /** Les droits viennent du serveur : l interface ne fait que les lire. */
  peut: (permission: Permission) => boolean;
  login: (identifiant: string, motDePasse: string) => Promise<void>;
  logout: () => void;
  /** Resynchronise le contexte après une modification du profil. */
  rafraichir: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/* Une session antérieure au multi-comptes possède un jeton mais aucune identité
   exploitable : on la purge plutôt que de laisser l'application dans un état bancal. */
function sessionInitiale() {
  const token = getToken();
  const u = getSessionUtilisateur();
  if (token && !u) {
    clearToken();
    return { authentifie: false, utilisateur: null };
  }
  return { authentifie: Boolean(token), utilisateur: u };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initiale = sessionInitiale();
  const [isAuthenticated, setIsAuthenticated] = useState(initiale.authentifie);
  const [utilisateur, setUtilisateur] = useState<SessionUtilisateur | null>(initiale.utilisateur);

  const login = useCallback(async (identifiant: string, motDePasse: string) => {
    const u = await apiLogin(identifiant, motDePasse);
    setUtilisateur(u);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUtilisateur(null);
    setIsAuthenticated(false);
  }, []);

  const rafraichir = useCallback(() => setUtilisateur(getSessionUtilisateur()), []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        utilisateur,
        estAdmin: utilisateur?.role === "ADMIN" || utilisateur?.role === "SUPER_ADMIN",
        peut: (p) => (utilisateur?.permissions ?? []).includes(p),
        login,
        logout,
        rafraichir,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider.");
  return ctx;
}
