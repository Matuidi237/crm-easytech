import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PilotageCommercial, fetchPilotageCommercial } from "../api";
import { useAuth } from "../AuthContext";
import { useLangue } from "../i18n";
import { BarList, foldTail } from "../components/Charts";
import Encarts from "../components/Encarts";
import { IconAlert, IconArrowRight, IconAward, IconTrend } from "../components/Icons";

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

  /* Les trois signaux qui appellent une action. Le ton monte avec la gravite :
     un objectif qui manque se pose, un retard de trajectoire se rattrape, un
     commercial muet depuis un mois se rappelle tout de suite. */
  const compteurs = [
    {
      cle: "sansObjectif" as const,
      ton: "bleu" as const,
      valeur: alertes.sansObjectif,
      label: t("rc.alerteSansObjectif"),
      note: t("rc.alerteSansObjectifNote"),
      icone: IconAward,
    },
    {
      cle: "sousTrajectoire" as const,
      ton: "ambre" as const,
      valeur: alertes.sousTrajectoire,
      label: t("rc.alerteSousTrajectoire"),
      note: t("rc.alerteSousTrajectoireNote", { pct: nombre(objectif.partEcoulee) }),
      icone: IconTrend,
    },
    {
      cle: "silencieux" as const,
      ton: "rouge" as const,
      valeur: alertes.silencieux,
      label: t("rc.alerteSilencieux"),
      note: t("rc.alerteSilencieuxNote", { n: nombre(alertes.seuilSilenceJours) }),
      icone: IconAlert,
    },
  ];

  return (
    <>
      {entete}

      {/* Quatre encarts, et rien d'autre en tete. Le premier porte la
          trajectoire, les trois suivants ce qui appelle une action : chacun
          filtre le tableau en dessous, et le second clic le retire.

          Pas de jauge : une barre de progression posee a cote d'un
          pourcentage affiche deux fois la meme chose, et le chiffre se lit
          plus vite. La comparaison au temps ecoule, qui est la seule lecture
          honnete d'un taux, tient dans la ligne de contexte. */}
      <Encarts
        encarts={[
          {
            cle: "objectif",
            ton: objectif.atteintePct === null ? "neutre" : dansLesTemps ? "vert" : "ambre",
            label: t("rc.objectifContexte", { annee: objectif.annee }),
            valeur:
              objectif.atteintePct === null
                ? t("rc.sansObjectifGroupe")
                : `${nombre(objectif.atteintePct)}%`,
            note:
              objectif.cible === null
                ? t("rc.sansObjectifAppui", { n: nombre(objectif.effectif) })
                : t("rc.objectifNote", {
                    realise: montantCompact(objectif.realise),
                    cible: montantCompact(objectif.cible),
                    ecoule: nombre(objectif.partEcoulee),
                  }),
            icone: IconTrend,
          },
          ...compteurs.map((c) => ({
            cle: c.cle,
            ton: c.ton,
            label: c.label,
            valeur: nombre(c.valeur),
            note: c.note,
            icone: c.icone,
            actif: filtre === c.cle,
            onClick:
              c.valeur === 0 ? undefined : () => setFiltre(filtre === c.cle ? "" : c.cle),
          })),
        ]}
      />

      {/* Les deux montants qui situent le mois, sur une seule ligne. En
          encarts ils auraient dispute la vedette a la trajectoire, qui est la
          question du matin ; ici ils la completent. */}
      <p className="rc-appui">
        <span>
          {t("rc.caMois")}
          <strong title={montant(mois.ca)}>{montantCompact(mois.ca)}</strong>
          {mois.variationPct !== null && (
            <span className={`delta ${mois.variationPct >= 0 ? "delta-hausse" : "delta-baisse"}`}>
              {mois.variationPct >= 0 ? "+" : ""}
              {nombre(mois.variationPct)}%
            </span>
          )}
        </span>
        <span className="rc-appui-sep">·</span>
        <span>
          {t("rc.pipelinePondere")}
          <strong title={montant(pipeline.pondere)}>{montantCompact(pipeline.pondere)}</strong>
        </span>
        {pipeline.resteApresPipeline !== null && (
          <>
            <span className="rc-appui-sep">·</span>
            <span>
              {pipeline.resteApresPipeline <= 0
                ? t("rc.objectifCouvert")
                : t("rc.resteNote", {
                    montant: montantCompact(pipeline.resteApresPipeline),
                  })}
            </span>
          </>
        )}
      </p>

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
                    {/* Le taux en clair, teinte selon qu'il suit ou non le
                        temps ecoule. Une barre a cote n'ajoutait rien : la
                        comparaison se fait d'une ligne a l'autre, et les
                        chiffres tabulaires suffisent a l'oeil. */}
                    {c.atteintePct === null ? (
                      <span className="muted-3">-</span>
                    ) : (
                      <span
                        className={`rc-taux${
                          c.atteintePct < objectif.partEcoulee ? " en-retrait" : ""
                        }`}
                      >
                        {nombre(c.atteintePct)}%
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
