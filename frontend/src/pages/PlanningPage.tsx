import { useNavigate } from "react-router-dom";
import { useLangue } from "../i18n";
import { IconArrowRight, IconCalendar, IconTrend } from "../components/Icons";

/**
 * « Agenda » : deux encarts, sur le modèle de « Nos équipes ».
 *
 * Les deux faces du temps d'un commercial, et elles ne se mélangent pas : la
 * feuille de temps constate ce qui a été fait, les objectifs annoncent ce qui
 * doit l'être. Les réunir sur un écran unique ferait d'un engagement et d'un
 * relevé la même chose.
 */
export default function PlanningPage() {
  const { t } = useLangue();
  const navigate = useNavigate();

  function Encart({
    vers,
    titre,
    libelle,
    portee,
    icone,
    classeIcone,
  }: {
    vers: string;
    titre: string;
    libelle: string;
    portee: string;
    icone: React.ReactNode;
    classeIcone: string;
  }) {
    return (
      <button type="button" className="equipe-carte" onClick={() => navigate(vers)} aria-label={titre}>
        <div className="equipe-haut">
          <div className={`equipe-icone ${classeIcone}`}>{icone}</div>
        </div>

        <div className="equipe-corps">
          <div className="equipe-titre">{titre}</div>
          <p className="equipe-libelle">{libelle}</p>
        </div>

        <div className="equipe-pied">
          <span className="equipe-portee">{portee}</span>
          <span className="equipe-lien">
            {t("ag.ouvrir")}
            <IconArrowRight size={15} />
          </span>
        </div>
      </button>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("nav.planning")}</h1>
          <div className="page-sub">{t("ag.sousTitre")}</div>
        </div>
      </div>

      <div className="equipes-grille">
        <Encart
          vers="/planning/feuille-de-temps"
          titre={t("ag.feuilleTitre")}
          libelle={t("ag.feuilleLibelle")}
          portee={t("ag.feuillePortee")}
          icone={<IconCalendar size={22} />}
          classeIcone="equipe-icone-vente"
        />
        <Encart
          vers="/planning/objectifs"
          titre={t("ag.objectifsTitre")}
          libelle={t("ag.objectifsLibelle")}
          portee={t("ag.objectifsPortee")}
          icone={<IconTrend size={22} />}
          classeIcone="equipe-icone-projet"
        />
      </div>
    </>
  );
}
