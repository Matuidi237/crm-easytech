import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CampagneResume, fetchCampagnes } from "../api";
import { useLangue } from "../i18n";
import { IconAlert, IconArrowRight, IconMail, IconSend } from "../components/Icons";

/**
 * « Campagnes » : un encart par type d'envoi, sur le modèle de « Nos équipes ».
 *
 * La page ne fait qu'aiguiller, mais chaque encart annonce ce qui a déjà été
 * fait : ouvrir une page pour découvrir qu'elle est vide est une perte de
 * temps que le compteur évite.
 */
export default function CampagnesPage() {
  const { t, nombre } = useLangue();
  const navigate = useNavigate();
  const [mailings, setMailings] = useState<CampagneResume[] | null>(null);
  const [newsletters, setNewsletters] = useState<CampagneResume[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetchCampagnes("MAILING")
      .then((r) => setMailings(r.campagnes))
      .catch((e) => setErreur(e.message));
    fetchCampagnes("NEWSLETTER")
      .then((r) => setNewsletters(r.campagnes))
      .catch((e) => setErreur(e.message));
  }, []);

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("ca.titre")}</h1>
        <div className="page-sub">{t("ca.sousTitre")}</div>
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

  function Encart({
    vers,
    titre,
    libelle,
    icone,
    classeIcone,
    campagnes,
  }: {
    vers: string;
    titre: string;
    libelle: string;
    icone: React.ReactNode;
    classeIcone: string;
    campagnes: CampagneResume[] | null;
  }) {
    const nb = campagnes?.length ?? 0;
    const destinataires = (campagnes ?? []).reduce((s, c) => s + c.nbDestinataires, 0);

    return (
      <button type="button" className="equipe-carte" onClick={() => navigate(vers)} aria-label={titre}>
        <div className="equipe-haut">
          <div className={`equipe-icone ${classeIcone}`}>{icone}</div>
          <span className="equipe-effectif">
            {campagnes === null
              ? t("commun.chargement")
              : nb === 0
                ? t("ca.aucuneCampagne")
                : nb === 1
                  ? t("ca.campagnesUne")
                  : t("ca.campagnesN", { n: nombre(nb) })}
          </span>
        </div>

        <div className="equipe-corps">
          <div className="equipe-titre">{titre}</div>
          <p className="equipe-libelle">{libelle}</p>
        </div>

        <div className="equipe-pied">
          <span className="equipe-portee">
            {destinataires > 0 && t("ca.destinatairesTotal", { n: nombre(destinataires) })}
          </span>
          <span className="equipe-lien">
            {t("ca.ouvrir")}
            <IconArrowRight size={15} />
          </span>
        </div>
      </button>
    );
  }

  return (
    <>
      {entete}

      <div className="equipes-grille">
        <Encart
          vers="/campagnes/mailing"
          titre={t("ca.mailingTitre")}
          libelle={t("ca.mailingLibelle")}
          icone={<IconSend size={22} />}
          classeIcone="equipe-icone-vente"
          campagnes={mailings}
        />
        <Encart
          vers="/campagnes/newsletter"
          titre={t("ca.newsletterTitre")}
          libelle={t("ca.newsletterLibelle")}
          icone={<IconMail size={22} />}
          classeIcone="equipe-icone-projet"
          campagnes={newsletters}
        />
      </div>
    </>
  );
}
