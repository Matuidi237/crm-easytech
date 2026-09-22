import { useLangue, type CleTraduction } from "../i18n";
import { IconInbox } from "../components/Icons";

/**
 * Onglet annoncé mais pas encore traité.
 *
 * L'entrée figure dans la barre latérale avant que la page existe : le parcours
 * du commercial a été arrêté en entier, et masquer les trois onglets restants
 * laisserait croire que l'outil s'arrête au tableau de bord. Mieux vaut une
 * page qui dit franchement qu'elle arrive qu'un menu qui change de forme à
 * chaque livraison.
 */
export default function EnConstruction({ titre, sousTitre }: { titre: CleTraduction; sousTitre: CleTraduction }) {
  const { t } = useLangue();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t(titre)}</h1>
          <div className="page-sub">{t(sousTitre)}</div>
        </div>
      </div>

      <div className="card">
        <div className="empty">
          <div className="empty-icon">
            <IconInbox />
          </div>
          <div className="empty-title">{t("commun.aVenirTitre")}</div>
          <p className="empty-text" style={{ margin: 0 }}>
            {t("commun.aVenirTexte")}
          </p>
        </div>
      </div>
    </>
  );
}
