import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FeuilleDeTemps, fetchFeuilleDeTemps } from "../api";
import { useLangue } from "../i18n";
import { IconArrowRight, IconCalendar, IconTag } from "../components/Icons";

function cleJour(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function duree(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/**
 * « Planning » : deux encarts, comme « Nos équipes ».
 *
 * La feuille de temps répond à « combien de temps sur quoi », l'agenda à
 * « quand ». Ce sont deux lectures de la même matière, et vouloir une seule
 * vue pour les deux questions donne un écran qui n'en traite bien aucune.
 */
export default function PlanningPage() {
  const { t, nombre } = useLangue();
  const navigate = useNavigate();
  const [semaine, setSemaine] = useState<FeuilleDeTemps | null>(null);

  useEffect(() => {
    fetchFeuilleDeTemps("SEMAINE", cleJour(new Date()))
      .then(setSemaine)
      .catch(() => setSemaine(null));
  }, []);

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

  /* L'état de la semaine en cours sur les deux encarts : ouvrir une page pour
     découvrir qu'il reste trois heures à pointer est une perte de temps que
     ce rappel évite. */
  const portee = semaine
    ? t("pl.semaineEnCours", {
        declare: duree(semaine.totalMinutes),
        cible: duree(semaine.cibleMinutes),
        pct: nombre(
          semaine.cibleMinutes > 0 ? Math.round((semaine.totalMinutes / semaine.cibleMinutes) * 100) : 0
        ),
      })
    : t("commun.chargement");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("nav.calendrier")}</h1>
          <div className="page-sub">{t("pl.sousTitre")}</div>
        </div>
      </div>

      <div className="equipes-grille">
        <Encart
          vers="/planning/feuilles-de-temps"
          titre={t("pl.feuillesTitre")}
          libelle={t("pl.feuillesLibelle")}
          portee={portee}
          icone={<IconTag size={22} />}
          classeIcone="equipe-icone-vente"
        />
        <Encart
          vers="/planning/agenda"
          titre={t("pl.agendaTitre")}
          libelle={t("pl.agendaLibelle")}
          portee={t("pl.agendaPortee")}
          icone={<IconCalendar size={22} />}
          classeIcone="equipe-icone-projet"
        />
      </div>
    </>
  );
}
