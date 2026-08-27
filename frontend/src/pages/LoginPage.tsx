import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { IconAlert } from "../components/Icons";

export default function LoginPage() {
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(identifiant, motDePasse);
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <aside className="login-aside">
        <div className="la-pitch">
          <h2>Toute notre base clients, au même endroit.</h2>
          <p>
            Nous centralisons nos fichiers, filtrons nos clients par pays, secteur ou commercial, et adressons nos
            campagnes aux bons interlocuteurs.
          </p>
        </div>
        <div className="la-foot">Outil interne, accès réservé aux collaborateurs.</div>
      </aside>

      <main className="login-main">
        <form className="login-card" onSubmit={handleSubmit}>
          <img src="/brand/easytech-logo.png" alt="EasyTech Group" className="login-logo" />

          <h1>Connexion</h1>
          <p className="lc-sub">Renseignez vos identifiants pour accéder au CRM.</p>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 18 }}>
              <IconAlert />
              {error}
            </div>
          )}

          <div className="field">
            <label htmlFor="identifiant">Identifiant</label>
            <input
              id="identifiant"
              type="text"
              autoFocus
              autoComplete="username"
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="motDePasse">Mot de passe</label>
            <input
              id="motDePasse"
              type="password"
              autoComplete="current-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>

          <p className="lc-help">
            Vous n'avez pas de compte ? Demandez à un administrateur de vous en créer un.
          </p>
        </form>
      </main>
    </div>
  );
}
