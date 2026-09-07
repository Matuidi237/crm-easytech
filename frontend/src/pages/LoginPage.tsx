import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useT } from "../i18n";
import SelecteurLangue from "../components/SelecteurLangue";
import { IconAlert } from "../components/Icons";

export default function LoginPage() {
  const t = useT();
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
          <h2>{t("login.accroche")}</h2>
          <p>{t("login.pitch")}</p>
        </div>
        <div className="la-foot">{t("login.pied")}</div>
      </aside>

      <main className="login-main">
        {/* La langue se choisit avant même de se connecter : c'est le premier
            écran, et rien n'oblige à passer par le français pour y accéder. */}
        <div className="login-lang">
          <SelecteurLangue />
        </div>

        <form className="login-card" onSubmit={handleSubmit}>
          <img src="/brand/easytech-logo.png" alt="EasyTech Group" className="login-logo" />

          <h1>{t("login.titre")}</h1>
          <p className="lc-sub">{t("login.sousTitre")}</p>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 18 }}>
              <IconAlert />
              {error}
            </div>
          )}

          <div className="field">
            <label htmlFor="identifiant">{t("login.identifiant")}</label>
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
            <label htmlFor="motDePasse">{t("login.motDePasse")}</label>
            <input
              id="motDePasse"
              type="password"
              autoComplete="current-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? t("login.connexion") : t("login.seConnecter")}
          </button>

          <p className="lc-help">{t("login.aide")}</p>
        </form>
      </main>
    </div>
  );
}
