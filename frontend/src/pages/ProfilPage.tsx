import { FormEvent, useEffect, useState } from "react";
import { Utilisateur, changerMonMotDePasse, fetchMoi, updateMoi } from "../api";
import { useAuth } from "../AuthContext";
import { IconAlert, IconCheck, IconKey } from "../components/Icons";

function initiales(nom: string) {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export default function ProfilPage() {
  const { rafraichir } = useAuth();
  const [moi, setMoi] = useState<Utilisateur | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [nomComplet, setNomComplet] = useState("");
  const [email, setEmail] = useState("");
  const [fonction, setFonction] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [infoOk, setInfoOk] = useState(false);

  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mdpEnCours, setMdpEnCours] = useState(false);
  const [mdpOk, setMdpOk] = useState(false);
  const [mdpErreur, setMdpErreur] = useState<string | null>(null);

  useEffect(() => {
    fetchMoi()
      .then((u) => {
        setMoi(u);
        setNomComplet(u.nomComplet);
        setEmail(u.email ?? "");
        setFonction(u.fonction ?? "");
      })
      .catch((e) => setErreur(e.message));
  }, []);

  async function enregistrerInfos(e: FormEvent) {
    e.preventDefault();
    setEnregistrement(true);
    setErreur(null);
    setInfoOk(false);
    try {
      const u = await updateMoi({ nomComplet, email, fonction });
      setMoi(u);
      rafraichir();
      setInfoOk(true);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnregistrement(false);
    }
  }

  async function changerMdp(e: FormEvent) {
    e.preventDefault();
    setMdpErreur(null);
    setMdpOk(false);

    if (nouveau !== confirmation) {
      setMdpErreur("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }
    if (nouveau.length < 8) {
      setMdpErreur("Le nouveau mot de passe doit faire au moins 8 caractères.");
      return;
    }

    setMdpEnCours(true);
    try {
      await changerMonMotDePasse(actuel, nouveau);
      setMdpOk(true);
      setActuel("");
      setNouveau("");
      setConfirmation("");
    } catch (err) {
      setMdpErreur((err as Error).message);
    } finally {
      setMdpEnCours(false);
    }
  }

  if (erreur && !moi) {
    return (
      <div className="alert alert-error">
        <IconAlert />
        {erreur}
      </div>
    );
  }
  if (!moi) {
    return (
      <div className="card">
        <p className="muted-3" style={{ margin: 0 }}>
          Chargement du profil…
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mon profil</h1>
          <div className="page-sub">Vos informations et la sécurité de votre compte.</div>
        </div>
      </div>

      <div className="profil-grid">
        <div className="card">
          <div className="profil-hero">
            <div className="avatar avatar-xl">{initiales(moi.nomComplet)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="ph-name">{moi.nomComplet}</div>
              <div className="ph-sub">
                <span className={`pill ${moi.role === "ADMIN" ? "pill-brand" : "pill-neutral"}`}>
                  {moi.role === "ADMIN" ? "Administrateur" : "Commercial"}
                </span>
                {moi.fonction && <span style={{ marginLeft: 8 }}>{moi.fonction}</span>}
              </div>
            </div>
          </div>

          <form onSubmit={enregistrerInfos}>
            {erreur && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                <IconAlert />
                {erreur}
              </div>
            )}
            {infoOk && (
              <div className="alert alert-success" style={{ marginBottom: 16 }}>
                <IconCheck />
                Vos informations ont été enregistrées.
              </div>
            )}

            <div className="form-grid">
              <div className="field">
                <label htmlFor="nomComplet">Nom complet</label>
                <input
                  id="nomComplet"
                  value={nomComplet}
                  onChange={(e) => {
                    setNomComplet(e.target.value);
                    setInfoOk(false);
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="fonction">Fonction</label>
                <input
                  id="fonction"
                  value={fonction}
                  placeholder="Responsable commercial…"
                  onChange={(e) => {
                    setFonction(e.target.value);
                    setInfoOk(false);
                  }}
                />
              </div>
              <div className="field full">
                <label htmlFor="email">Adresse email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  placeholder="prenom.nom@easytechgroup.com"
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setInfoOk(false);
                  }}
                />
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={enregistrement}>
                {enregistrement ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Informations du compte</div>
            </div>
            <div className="info-list">
              <div className="info-row">
                <span className="ir-label">Identifiant</span>
                <span className="ir-value">{moi.identifiant}</span>
              </div>
              <div className="info-row">
                <span className="ir-label">Rôle</span>
                <span className="ir-value">{moi.role === "ADMIN" ? "Administrateur" : "Commercial"}</span>
              </div>
              <div className="info-row">
                <span className="ir-label">Dernier accès</span>
                <span className="ir-value">{formatDate(moi.dernierAcces)}</span>
              </div>
              <div className="info-row">
                <span className="ir-label">Compte créé le</span>
                <span className="ir-value">{formatDate(moi.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Mot de passe</div>
                <div className="card-sub">8 caractères minimum.</div>
              </div>
              <IconKey />
            </div>

            <form onSubmit={changerMdp}>
              {mdpErreur && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>
                  <IconAlert />
                  {mdpErreur}
                </div>
              )}
              {mdpOk && (
                <div className="alert alert-success" style={{ marginBottom: 16 }}>
                  <IconCheck />
                  Mot de passe mis à jour.
                </div>
              )}

              <div className="field">
                <label htmlFor="actuel">Mot de passe actuel</label>
                <input
                  id="actuel"
                  type="password"
                  autoComplete="current-password"
                  value={actuel}
                  onChange={(e) => setActuel(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="nouveau">Nouveau mot de passe</label>
                <input
                  id="nouveau"
                  type="password"
                  autoComplete="new-password"
                  value={nouveau}
                  onChange={(e) => setNouveau(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="confirmation">Confirmer le nouveau mot de passe</label>
                <input
                  id="confirmation"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </div>

              <div className="form-actions">
                <button className="btn btn-ghost" type="submit" disabled={mdpEnCours}>
                  {mdpEnCours ? "Modification…" : "Changer le mot de passe"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
