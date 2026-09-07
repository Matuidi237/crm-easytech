import { FormEvent, useEffect, useState } from "react";
import { Utilisateur, changerMonMotDePasse, fetchMoi, updateMoi } from "../api";
import { useAuth } from "../AuthContext";
import { useLangue, useLibelles } from "../i18n";
import { IconAlert, IconCheck, IconKey } from "../components/Icons";

function initiales(nom: string) {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

export default function ProfilPage() {
  const { t, dateHeure } = useLangue();
  const libelles = useLibelles();
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
      setMdpErreur(t("profil.mdpConfirmationDifferente"));
      return;
    }
    if (nouveau.length < 8) {
      setMdpErreur(t("profil.mdpTropCourt"));
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
          {t("profil.chargement")}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("profil.titre")}</h1>
          <div className="page-sub">{t("profil.sousTitre")}</div>
        </div>
      </div>

      <div className="profil-grid">
        <div className="card">
          <div className="profil-hero">
            <div className="avatar avatar-xl">{initiales(moi.nomComplet)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="ph-name">{moi.nomComplet}</div>
              <div className="ph-sub">
                <span className={`pill ${moi.role === "COMMERCIAL" ? "pill-neutral" : "pill-brand"}`}>
                  {libelles.role(moi.role)}
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
                {t("profil.infosEnregistrees")}
              </div>
            )}

            <div className="form-grid">
              <div className="field">
                <label htmlFor="nomComplet">{t("profil.nomComplet")}</label>
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
                <label htmlFor="fonction">{t("profil.fonction")}</label>
                <input
                  id="fonction"
                  value={fonction}
                  placeholder={t("profil.fonctionPlaceholder")}
                  onChange={(e) => {
                    setFonction(e.target.value);
                    setInfoOk(false);
                  }}
                />
              </div>
              <div className="field full">
                <label htmlFor="email">{t("profil.email")}</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  placeholder={t("profil.emailPlaceholder")}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setInfoOk(false);
                  }}
                />
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={enregistrement}>
                {enregistrement ? t("commun.enregistrement") : t("commun.enregistrer")}
              </button>
            </div>
          </form>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">{t("profil.infosCompte")}</div>
            </div>
            <div className="info-list">
              <div className="info-row">
                <span className="ir-label">{t("profil.identifiant")}</span>
                <span className="ir-value">{moi.identifiant}</span>
              </div>
              <div className="info-row">
                <span className="ir-label">{t("profil.role")}</span>
                <span className="ir-value">{libelles.role(moi.role)}</span>
              </div>
              <div className="info-row">
                <span className="ir-label">{t("profil.dernierAcces")}</span>
                <span className="ir-value">{dateHeure(moi.dernierAcces) || t("commun.jamais")}</span>
              </div>
              <div className="info-row">
                <span className="ir-label">{t("profil.creeLe")}</span>
                <span className="ir-value">{dateHeure(moi.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">{t("profil.motDePasse")}</div>
                <div className="card-sub">{t("profil.motDePasseAide")}</div>
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
                  {t("profil.mdpMisAJour")}
                </div>
              )}

              <div className="field">
                <label htmlFor="actuel">{t("profil.mdpActuel")}</label>
                <input
                  id="actuel"
                  type="password"
                  autoComplete="current-password"
                  value={actuel}
                  onChange={(e) => setActuel(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="nouveau">{t("profil.mdpNouveau")}</label>
                <input
                  id="nouveau"
                  type="password"
                  autoComplete="new-password"
                  value={nouveau}
                  onChange={(e) => setNouveau(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="confirmation">{t("profil.mdpConfirmer")}</label>
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
                  {mdpEnCours ? t("profil.mdpModification") : t("profil.mdpChanger")}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
