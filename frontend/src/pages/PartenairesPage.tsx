import { useT } from "../i18n";
import { IconHandshake, IconInbox } from "../components/Icons";

/**
 * Partenaires.
 *
 * L'entrée de menu a été demandée, son contenu ne l'a pas encore été, et rien
 * dans la base ne décrit un partenaire. Plutôt que d'inventer un modèle de
 * données qui n'a pas été arbitré, la page dit ce qui manque et ce qu'il
 * faudrait trancher pour la construire.
 */
export default function PartenairesPage() {
  const t = useT();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("partenaires.titre")}</h1>
          <div className="head-meta">
            <IconHandshake size={15} />
            <span>{t("partenaires.sousTitre")}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="empty">
          <div className="empty-icon">
            <IconInbox />
          </div>
          <div className="empty-title">{t("partenaires.aDefinirTitre")}</div>
          <p className="empty-text" style={{ margin: 0, maxWidth: 620 }}>
            {t("partenaires.aDefinirTexte")}
          </p>
          <p className="empty-text muted-3" style={{ margin: "4px 0 0", maxWidth: 620 }}>
            {t("partenaires.aDefinirAide")}
          </p>
        </div>
      </div>
    </>
  );
}
