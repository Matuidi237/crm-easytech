import { useEffect, useState } from "react";
import { Equipes, MembreEquipe, fetchEquipes } from "../api";
import { useLangue, useLibelles } from "../i18n";
import { IconAlert, IconInbox, IconTeam } from "../components/Icons";

function initiales(nom: string) {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

export default function EquipesPage() {
  const { t, nombre } = useLangue();
  const libelles = useLibelles();
  const [donnees, setDonnees] = useState<Equipes | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetchEquipes()
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }, []);

  function Tableau({ membres }: { membres: MembreEquipe[] }) {
    if (membres.length === 0) {
      return (
        <p className="muted-3" style={{ margin: "4px 0 0", fontSize: 13 }}>
          {t("equipes.aucunMembre")}
        </p>
      );
    }
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("equipes.colMembre")}</th>
              <th>{t("equipes.colClients")}</th>
              <th>{t("equipes.colVentes")}</th>
              <th>{t("equipes.colCa")}</th>
              <th>{t("equipes.colBenefice")}</th>
            </tr>
          </thead>
          <tbody>
            {membres.map((m) => (
              <tr key={m.id}>
                <td className="td-main">
                  <div className="cell-client">
                    <span
                      className="avatar-mono"
                      style={{ background: "var(--brand-100)", color: "var(--brand-700)" }}
                    >
                      {initiales(m.nomComplet)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="cc-name">
                        {m.nomComplet}
                        {!m.actif && (
                          <span className="tag" style={{ marginLeft: 7 }}>
                            {t("equipes.inactif")}
                          </span>
                        )}
                      </div>
                      <div className="cc-sub">{m.fonction || libelles.role(m.role)}</div>
                    </div>
                  </div>
                </td>
                <td className="num" data-label={t("equipes.colClients")}>
                  {nombre(m.nbClients)}
                </td>
                <td className="num" data-label={t("equipes.colVentes")}>
                  {nombre(m.nbVentes)}
                </td>
                <td className="num" data-label={t("equipes.colCa")}>
                  {m.nbVentes > 0 ? `${nombre(m.chiffreAffaires)} XAF` : "-"}
                </td>
                <td className="num" data-label={t("equipes.colBenefice")}>
                  {m.nbVentes > 0 ? `${nombre(m.benefice)} XAF` : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("equipes.titre")}</h1>
        <div className="head-meta">
          <IconTeam size={15} />
          <span>{t("equipes.sousTitre")}</span>
        </div>
      </div>
    </div>
  );

  if (erreur) {
    return (
      <>
        {entete}
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      </>
    );
  }

  if (!donnees) {
    return (
      <>
        {entete}
        <div className="card">
          <p className="muted-3" style={{ margin: 0 }}>
            {t("commun.chargementDonnees")}
          </p>
        </div>
      </>
    );
  }

  const rien = donnees.equipes.length === 0 && donnees.sansEquipe.length === 0;

  return (
    <>
      {entete}

      {rien && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("equipes.aucuneTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("equipes.aucuneTexte")}
            </p>
          </div>
        </div>
      )}

      {donnees.equipes.map((e) => (
        <div className="table-card" key={e.responsable.id}>
          <div className="card-head">
            <div className="cell-client">
              <span className="avatar-mono" style={{ background: "var(--brand-100)", color: "var(--brand-700)" }}>
                {initiales(e.responsable.nomComplet)}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="card-title">{e.responsable.nomComplet}</div>
                <div className="card-sub">
                  {t("equipes.responsable")} ·{" "}
                  {e.membres.length > 1
                    ? t("equipes.membresN", { n: e.membres.length })
                    : e.membres.length === 1
                      ? t("equipes.membresUn")
                      : t("equipes.aucunMembre")}
                </div>
              </div>
            </div>
            {e.nbVentes > 0 && (
              <div style={{ textAlign: "right" }}>
                <div className="card-sub">{t("equipes.colCa")}</div>
                <div className="td-strong">{nombre(e.chiffreAffaires)} XAF</div>
              </div>
            )}
          </div>
          {/* Le responsable figure dans son propre tableau : il vend aussi. */}
          <Tableau membres={[e.responsable, ...e.membres]} />
        </div>
      ))}

      {donnees.sansEquipe.length > 0 && (
        <div className="table-card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("equipes.sansEquipe")}</div>
              <div className="card-sub">{t("equipes.sansEquipeAide")}</div>
            </div>
          </div>
          <Tableau membres={donnees.sansEquipe} />
        </div>
      )}
    </>
  );
}
