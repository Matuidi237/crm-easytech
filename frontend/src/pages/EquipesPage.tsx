import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApercuEquipes, fetchApercuEquipes } from "../api";
import { useLangue } from "../i18n";
import { IconAlert, IconArrowRight, IconHandshake, IconTeam, IconTrend } from "../components/Icons";

/**
 * « Nos équipes » : un encart par équipe, et rien de plus.
 *
 * Cette page est un aiguillage, pas un tableau de bord. Elle dit ce que chaque
 * équipe est et ce qu'elle pèse, puis laisse ouvrir le détail. Y empiler des
 * indicateurs reviendrait à refaire l'accueil du directeur général une
 * deuxième fois.
 */
export default function EquipesPage() {
  const { t, nombre, montantCompact } = useLangue();
  const navigate = useNavigate();
  const [apercu, setApercu] = useState<ApercuEquipes | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetchApercuEquipes()
      .then(setApercu)
      .catch((e) => setErreur(e.message));
  }, []);

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("equipes.titre")}</h1>
        <div className="page-sub">{t("equipes.sousTitre")}</div>
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

  if (!apercu) {
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

  const effectif = (n: number) =>
    n === 0 ? t("equipes.effectifAucun") : n === 1 ? t("equipes.effectifUn") : t("equipes.effectifN", { n });

  return (
    <>
      {entete}

      <div className="equipes-grille">
        {/* Équipe commerciale : cliquable, elle mène à sa liste. */}
        <button
          type="button"
          className="equipe-carte"
          onClick={() => navigate("/equipes/commerciale")}
          aria-label={t("equipes.voirEquipe")}
        >
          <div className="equipe-haut">
            <div className="equipe-icone equipe-icone-vente">
              <IconTeam size={22} />
            </div>
            <span className="equipe-effectif">{effectif(apercu.commerciale.effectif)}</span>
          </div>

          <div className="equipe-corps">
            <div className="equipe-titre">{t("equipes.commercialeTitre")}</div>
            <p className="equipe-libelle">{t("equipes.commercialeLibelle")}</p>
          </div>

          {apercu.commerciale.nbVentes > 0 && (
            <div className="equipe-chiffres">
              <div>
                <div className="equipe-chiffre">{montantCompact(apercu.commerciale.chiffreAffaires)}</div>
                <div className="equipe-chiffre-label">{t("ec.colCa")}</div>
              </div>
              <div>
                <div className="equipe-chiffre">{montantCompact(apercu.commerciale.benefice)}</div>
                <div className="equipe-chiffre-label">{t("ec.colBenefice")}</div>
              </div>
            </div>
          )}

          <div className="equipe-pied">
            <span className="equipe-portee">
              <IconTrend size={14} />
              {apercu.commerciale.nbPays === 1
                ? t("equipes.paysCouvertUn")
                : t("equipes.paysCouverts", { n: nombre(apercu.commerciale.nbPays) })}
            </span>
            <span className="equipe-lien">
              {t("equipes.voirEquipe")}
              <IconArrowRight size={15} />
            </span>
          </div>
        </button>

        <button
          type="button"
          className="equipe-carte"
          onClick={() => navigate("/equipes/projet")}
          aria-label={t("equipes.voirEquipe")}
        >
          <div className="equipe-haut">
            <div className="equipe-icone equipe-icone-projet">
              <IconHandshake size={22} />
            </div>
            <span className="equipe-effectif">{effectif(apercu.projet.effectif)}</span>
          </div>

          <div className="equipe-corps">
            <div className="equipe-titre">{t("equipes.projetTitre")}</div>
            <p className="equipe-libelle">{t("equipes.projetLibelle")}</p>
          </div>

          {apercu.projet.total > 0 && (
            <div className="equipe-chiffres">
              <div>
                <div className="equipe-chiffre">{nombre(apercu.projet.ouverts)}</div>
                <div className="equipe-chiffre-label">{t("ep.colEnCours")}</div>
              </div>
              <div>
                <div className="equipe-chiffre">{montantCompact(apercu.projet.budgetPilote)}</div>
                <div className="equipe-chiffre-label">{t("ep.colBudget")}</div>
              </div>
            </div>
          )}

          <div className="equipe-pied">
            {/* Les retards passent devant la portée géographique : c'est ce
                qu'un directeur général doit voir sans ouvrir la page. */}
            {apercu.projet.enRetard > 0 ? (
              <span className="pill pill-danger">
                {apercu.projet.enRetard === 1
                  ? t("ep.retardUn")
                  : t("ep.retardN", { n: nombre(apercu.projet.enRetard) })}
              </span>
            ) : (
              <span className="equipe-portee">
                <IconTrend size={14} />
                {apercu.projet.ouverts === 0
                  ? t("equipes.aucunProjet")
                  : apercu.projet.ouverts === 1
                    ? t("equipes.projetsEnCoursUn")
                    : t("equipes.projetsEnCours", { n: nombre(apercu.projet.ouverts) })}
              </span>
            )}
            <span className="equipe-lien">
              {t("equipes.voirEquipe")}
              <IconArrowRight size={15} />
            </span>
          </div>
        </button>
      </div>
    </>
  );
}
