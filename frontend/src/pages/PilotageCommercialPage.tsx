import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PilotageCommercial, fetchPilotageCommercial } from "../api";
import { useAuth } from "../AuthContext";
import { useLangue } from "../i18n";
import { BarList, foldTail } from "../components/Charts";
import { IconAlert, IconArrowRight } from "../components/Icons";

/** Les trois signaux qui appellent une action, et le filtre qu'ils posent. */
const ALERTES = ["sansObjectif", "sousTrajectoire", "silencieux"] as const;
type Alerte = (typeof ALERTES)[number];

/**
 * Tableau de bord du responsable commercial.
 *
 * Il encadre les commerciaux de tous les pays du groupe, fixe leurs objectifs
 * et répond de la trajectoire. Son écran n'est donc pas celui du directeur
 * général : celui-là constate, celui-ci agit.
 *
 * L'ordre suit ses questions du matin. Où en est-on sur l'objectif, qui
 * décroche, quel marché avance. « Meilleur vendeur » n'y figure pas : il le
 * connaît déjà, et ce qu'il ignore est qui est en train de décrocher.
 */
export default function PilotageCommercialPage() {
  const { t, nombre, montant, montantCompact, date } = useLangue();
  const { utilisateur } = useAuth();
  const [donnees, setDonnees] = useState<PilotageCommercial | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Alerte | "">("");

  useEffect(() => {
    fetchPilotageCommercial()
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }, []);

  const commerciaux = useMemo(() => {
    const tous = donnees?.commerciaux ?? [];
    if (filtre === "" || !donnees) return tous;
    const ecoule = donnees.objectif.partEcoulee;
    if (filtre === "sansObjectif") return tous.filter((c) => c.cible === null);
    if (filtre === "silencieux") return tous.filter((c) => c.silencieux);
    return tous.filter((c) => c.atteintePct !== null && c.atteintePct < ecoule);
  }, [donnees, filtre]);

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("rc.bienvenue", { nom: utilisateur?.nomComplet ?? "" })}</h1>
        <div className="page-sub">{t("rc.sousTitre")}</div>
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

  const { objectif, mois, pipeline, alertes, parPays } = donnees;

  /* Dans les temps si le réalisé suit au moins le temps consommé. C'est la
     seule lecture honnête d'un taux d'avancement : 93 % au mois de mars n'est
     pas la même nouvelle qu'en décembre. */
  const dansLesTemps = (objectif.atteintePct ?? 0) >= objectif.partEcoulee;
  const totalPays = parPays.reduce((s, p) => s + p.ca, 0);

  const compteurs: { cle: Alerte; valeur: number; libelle: string }[] = [
    { cle: "sansObjectif", valeur: alertes.sansObjectif, libelle: t("rc.alerteSansObjectif") },
    { cle: "sousTrajectoire", valeur: alertes.sousTrajectoire, libelle: t("rc.alerteSousTrajectoire") },
    {
      cle: "silencieux",
      valeur: alertes.silencieux,
      libelle: t("rc.alerteSilencieux", { n: nombre(alertes.seuilSilenceJours) }),
    },
  ];

  return (
    <>
      {entete}

      {/* La trajectoire, en un chiffre. C'est lui qui fixe les objectifs :
          savoir s'ils seront tenus est sa première question, et le taux ne
          veut rien dire sans le temps consommé en regard. */}
      <section className="panneau heros">
        <div className="heros-haut">
          <div className="heros-principal">
            <span className="heros-contexte">
              {t("rc.objectifContexte", { annee: objectif.annee })}
            </span>
            <span className="heros-chiffre">
              {objectif.atteintePct === null ? t("rc.sansObjectifGroupe") : `${nombre(objectif.atteintePct)}%`}
            </span>
            <span className="heros-appui">
              {objectif.cible === null
                ? t("rc.sansObjectifAppui", { n: nombre(objectif.effectif) })
                : t("co.realiseSurCible", {
                    realise: montant(objectif.realise),
                    cible: montant(objectif.cible),
                  })}
            </span>
          </div>
          {objectif.cible !== null && (
            <span className={`etat ${dansLesTemps ? "etat-bon" : "etat-alerte"}`}>
              {dansLesTemps ? t("ag.etat.en-ligne") : t("ag.etat.en-retard")}
            </span>
          )}
        </div>

        {objectif.cible !== null && (
          <>
            <div className="mesure">
              <span
                className={`mesure-remplie${dansLesTemps ? "" : " alerte"}`}
                style={{ width: `${Math.min(100, objectif.atteintePct ?? 0)}%` }}
              />
              <span className="mesure-seuil" style={{ left: `${objectif.partEcoulee}%` }} />
            </div>
            <div className="mesure-pied">
              <span>{t("co.tempsEcouleSeuil", { pct: objectif.partEcoulee })}</span>
              <span>
                {t("rc.couvertPar", {
                  n: nombre(objectif.nbAvecObjectif),
                  total: nombre(objectif.effectif),
                })}
              </span>
            </div>
          </>
        )}

        {/* Deux chiffres d'appui, et pas quatre cartes : ce qui est rentré ce
            mois-ci, et ce qui est engagé mais pas encore signé. Le second
            change la lecture du premier, un objectif qui paraît hors
            d'atteinte ne l'est pas si le pipeline le couvre. */}
        <dl className="heros-rythme">
          <div>
            <dt>{t("rc.caMois")}</dt>
            <dd>
              {montant(mois.ca)}
              {mois.variationPct !== null && (
                <span className={`delta ${mois.variationPct >= 0 ? "delta-hausse" : "delta-baisse"}`}>
                  {mois.variationPct >= 0 ? "+" : ""}
                  {nombre(mois.variationPct)}%
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>{t("rc.pipelinePondere")}</dt>
            <dd>{montant(pipeline.pondere)}</dd>
          </div>
          {pipeline.resteApresPipeline !== null && (
            <div>
              <dt>{t("rc.resteAFaire")}</dt>
              <dd className={pipeline.resteApresPipeline <= 0 ? "valeur-positive" : undefined}>
                {pipeline.resteApresPipeline <= 0
                  ? t("rc.objectifCouvert")
                  : montant(pipeline.resteApresPipeline)}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* Les trois signaux qui appellent une action. Chacun filtre le tableau
          en dessous : un compteur qu'on ne peut pas ouvrir oblige à retrouver
          à la main les lignes qu'il annonce. */}
      <div className="rc-signaux">
        {compteurs.map((c) => (
          <button
            type="button"
            key={c.cle}
            className={`rc-signal${filtre === c.cle ? " actif" : ""}${c.valeur === 0 ? " calme" : ""}`}
            aria-pressed={filtre === c.cle}
            disabled={c.valeur === 0}
            onClick={() => setFiltre(filtre === c.cle ? "" : c.cle)}
          >
            <span className="rc-signal-valeur">{nombre(c.valeur)}</span>
            <span className="rc-signal-libelle">{c.libelle}</span>
          </button>
        ))}
      </div>

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("rc.equipeTitre")}</div>
            <div className="card-sub">{t("rc.equipeSousTitre")}</div>
          </div>
          {filtre !== "" && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiltre("")}>
              {t("rc.retirerFiltre")}
            </button>
          )}
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("rc.colCommercial")}</th>
                <th>{t("rc.colPays")}</th>
                <th className="num">{t("rc.colCa")}</th>
                <th className="num">{t("rc.colObjectif")}</th>
                <th>{t("rc.colAtteinte")}</th>
                <th>{t("rc.colDerniereVente")}</th>
              </tr>
            </thead>
            <tbody>
              {commerciaux.map((c) => (
                <tr key={c.id}>
                  <td className="td-strong td-main" data-label={t("rc.colCommercial")}>
                    {/* La fiche porte les objectifs, l'agenda et le
                        portefeuille : c'est de là qu'il agit. */}
                    <Link className="cp-lien" to={`/equipes/commerciale/${c.id}`}>
                      {c.nomComplet}
                    </Link>
                  </td>
                  <td data-label={t("rc.colPays")}>
                    {c.pays ?? <span className="muted-3">{t("rc.paysInconnu")}</span>}
                  </td>
                  <td className="num" data-label={t("rc.colCa")} title={montant(c.chiffreAffaires)}>
                    {montantCompact(c.chiffreAffaires)}
                  </td>
                  <td className="num" data-label={t("rc.colObjectif")}>
                    {c.cible === null ? (
                      <span className="pill pill-warn">{t("rc.aFixer")}</span>
                    ) : (
                      <span title={montant(c.cible)}>{montantCompact(c.cible)}</span>
                    )}
                  </td>
                  <td data-label={t("rc.colAtteinte")}>
                    {c.atteintePct === null ? (
                      <span className="muted-3">-</span>
                    ) : (
                      <span className="rc-atteinte">
                        <span className="rc-jauge">
                          <span
                            className={`rc-jauge-remplie${
                              c.atteintePct < objectif.partEcoulee ? " alerte" : ""
                            }`}
                            style={{ width: `${Math.min(100, c.atteintePct)}%` }}
                          />
                        </span>
                        <span className="rc-atteinte-pct">{nombre(c.atteintePct)}%</span>
                      </span>
                    )}
                  </td>
                  <td data-label={t("rc.colDerniereVente")}>
                    {c.derniereVente === null ? (
                      <span className="pill pill-danger">{t("rc.aucuneVente")}</span>
                    ) : (
                      <span className={c.silencieux ? "cot-retard" : undefined}>
                        {date(c.derniereVente)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {parPays.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("rc.paysTitre")}</div>
              <div className="card-sub">{t("rc.paysSousTitre")}</div>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/clients">
              {t("rc.voirClients")}
              <IconArrowRight size={14} />
            </Link>
          </div>
          {/* Par pays du client et non du commercial : c'est le marché qu'on
              compare, pas le bureau depuis lequel la vente a été saisie. */}
          <BarList
            data={foldTail(
              parPays.map((p) => ({ label: p.pays, count: p.ca })),
              6,
              t("dg.autres")
            )}
            total={totalPays}
          />
        </div>
      )}
    </>
  );
}
