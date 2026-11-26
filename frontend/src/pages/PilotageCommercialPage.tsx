import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PilotageCommercial, fetchPilotageCommercial } from "../api";
import { useAuth } from "../AuthContext";
import { useLangue } from "../i18n";
import Encarts from "../components/Encarts";
import {
  IconAlert,
  IconAward,
  IconChevronDown,
  IconClose,
  IconTrend,
  IconUsers,
} from "../components/Icons";

/** Les trois signaux qui appellent une action, et le filtre qu'ils posent. */
const ALERTES = ["sansObjectif", "sousTrajectoire", "silencieux"] as const;
type Alerte = (typeof ALERTES)[number];

/** Ce qu'une fenêtre peut détailler depuis un encart. */
type Fenetre = "portefeuille" | "concentration";

/**
 * Tableau de bord du responsable commercial.
 *
 * Il encadre les commerciaux de tous les pays du groupe, fixe leurs objectifs
 * et répond de la trajectoire. Son écran n'est donc pas celui du directeur
 * général : celui-là constate, celui-ci agit.
 *
 * Trois chiffres en tête, pas davantage : ce que le groupe a vendu, le
 * portefeuille dont il dispose, et à quel point ce chiffre tient sur une
 * poignée de comptes. Les deux derniers s'ouvrent, parce qu'un chiffre
 * d'ensemble ne dit pas où agir tant qu'on ne peut pas le décomposer.
 */
export default function PilotageCommercialPage() {
  const { t, nombre, montant, montantCompact, date, rang } = useLangue();
  const { utilisateur } = useAuth();
  const [donnees, setDonnees] = useState<PilotageCommercial | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Alerte | "">("");
  const [fenetre, setFenetre] = useState<Fenetre | null>(null);
  /* Les pays ouverts. Tous replies au depart : l'arbre sert a choisir ou
     regarder, et sept lignes ouvertes d'emblee ne seraient que le tableau
     plat d'avant avec des titres en plus. */
  const [paysOuverts, setPaysOuverts] = useState<string[]>([]);

  useEffect(() => {
    fetchPilotageCommercial()
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }, []);

  /* Échap referme la fenêtre ouverte : c'est le réflexe de tout le monde, et
     ne pas y répondre donne l'impression d'être coincé. */
  useEffect(() => {
    if (fenetre === null) return;
    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") setFenetre(null);
    }
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, [fenetre]);

  const commerciaux = useMemo(() => {
    const tous = donnees?.commerciaux ?? [];
    if (filtre === "" || !donnees) return tous;
    const ecoule = donnees.objectif.partEcoulee;
    if (filtre === "sansObjectif") return tous.filter((c) => c.cible === null);
    if (filtre === "silencieux") return tous.filter((c) => c.silencieux);
    return tous.filter((c) => c.atteintePct !== null && c.atteintePct < ecoule);
  }, [donnees, filtre]);

  /* L'arbre : un noeud par pays du commercial, ses vendeurs en dessous.
     Groupe sur la liste filtree, pour qu'un filtre actif vide les pays qui
     n'ont personne a montrer au lieu de les laisser ouvrir sur rien. */
  const arbre = useMemo(() => {
    const par = new Map<string | null, typeof commerciaux>();
    for (const c of commerciaux) {
      par.set(c.pays, [...(par.get(c.pays) ?? []), c]);
    }
    return [...par.entries()]
      .map(([pays, membres]) => {
        const ca = membres.reduce((s, m) => s + m.chiffreAffaires, 0);
        /* Le taux du pays ne porte que sur les commerciaux qui ont une
           cible. Compter le chiffre de ceux qui n'en ont pas face a une
           cible qui les exclut gonflait le taux : le Cameroun affichait
           199 % parce qu'un de ses deux vendeurs n'avait pas d'objectif. */
        const avecCible = membres.filter((m) => m.cible !== null);
        const cible = avecCible.reduce((s, m) => s + (m.cible ?? 0), 0);
        const caMesure = avecCible.reduce((s, m) => s + m.chiffreAffaires, 0);
        return {
          pays,
          membres,
          ca,
          cible,
          /* Null quand aucun objectif n'est pose dans ce pays : zero pour
             cent se lirait comme un echec collectif. */
          atteintePct: cible > 0 ? Math.round((caMesure / cible) * 100) : null,
          /* Dit pourquoi le taux ne couvre pas tout le monde, plutot que de
             laisser croire qu'il porte sur le chiffre affiche a cote. */
          sansCible: membres.length - avecCible.length,
        };
      })
      /* Par chiffre decroissant, les pays sans pays renseigne en dernier :
         ce n'est pas un marche, c'est une fiche a completer. */
      .sort((a, b) => {
        if ((a.pays === null) !== (b.pays === null)) return a.pays === null ? 1 : -1;
        return b.ca - a.ca;
      });
  }, [commerciaux]);

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

  const { objectif, mois, pipeline, alertes, portefeuille, concentration } = donnees;

  /* Dans les temps si le réalisé suit au moins le temps consommé. C'est la
     seule lecture honnête d'un taux d'avancement : 93 % au mois de mars n'est
     pas la même nouvelle qu'en décembre. */
  const dansLesTemps = (objectif.atteintePct ?? 0) >= objectif.partEcoulee;

  const signaux: { cle: Alerte; valeur: number; libelle: string }[] = [
    { cle: "sansObjectif", valeur: alertes.sansObjectif, libelle: t("rc.alerteSansObjectif") },
    {
      cle: "sousTrajectoire",
      valeur: alertes.sousTrajectoire,
      libelle: t("rc.alerteSousTrajectoire"),
    },
    { cle: "silencieux", valeur: alertes.silencieux, libelle: t("rc.alerteSilencieux") },
  ];

  return (
    <>
      {entete}

      {/* Trois chiffres, et deux d'entre eux s'ouvrent. Un total ne dit pas
          où agir : le portefeuille se décompose par pays, et la concentration
          par client. */}
      <Encarts
        encarts={[
          {
            cle: "ca",
            ton: "bleu",
            label: t("rc.caAnnee", { annee: objectif.annee }),
            valeur: montantCompact(objectif.realise),
            titre: montant(objectif.realise),
            note: t("rc.caNote", {
              mois: montantCompact(mois.ca),
              variation:
                mois.variationPct === null
                  ? t("dg.pasDeComparaison")
                  : `${mois.variationPct >= 0 ? "+" : ""}${nombre(mois.variationPct)}%`,
            }),
            icone: IconTrend,
          },
          {
            cle: "portefeuille",
            ton: "neutre",
            label: t("rc.portefeuille"),
            valeur: nombre(portefeuille.total),
            note: t("rc.portefeuilleNote", { n: nombre(portefeuille.parPays.length) }),
            icone: IconUsers,
            onClick: () => setFenetre("portefeuille"),
            apres: <span className="encart-invite">{t("rc.voirParPays")}</span>,
          },
          {
            cle: "concentration",
            /* Ambre dès que les vingt premiers pèsent plus de la moitié : une
               dépendance n'est pas une faute, c'est un risque à connaître. */
            ton: (concentration.partTetePct ?? 0) >= 50 ? "ambre" : "neutre",
            label: t("rc.concentration"),
            valeur:
              concentration.partTetePct === null
                ? t("rc.sansChiffre")
                : `${nombre(concentration.partTetePct)}%`,
            /* Le nombre de clients qu'il faut cumuler pour atteindre 80 % est
               la mesure de Pareto proprement dite. L'annoncer évite de laisser
               croire que vingt comptes font quatre cinquièmes du chiffre quand
               il en faut davantage. */
            note:
              concentration.nbPourQuatreVingts === null
                ? t("rc.sansChiffreNote")
                : t("rc.concentrationNote", {
                    n: nombre(concentration.nbPourQuatreVingts),
                    total: nombre(concentration.nbClients),
                  }),
            icone: IconAward,
            onClick: concentration.tete.length === 0 ? undefined : () => setFenetre("concentration"),
            apres:
              concentration.tete.length === 0 ? undefined : (
                <span className="encart-rang">
                  {concentration.tete.slice(0, 3).map((c, i) => (
                    <span className="encart-rang-ligne" key={c.id}>
                      <span className="encart-rang-place">{rang(i + 1)}</span>
                      <span className="encart-rang-nom">{c.nom}</span>
                      <span className="encart-rang-part">{nombre(c.partPct)}%</span>
                    </span>
                  ))}
                  <span className="encart-invite">{t("rc.voirTop20")}</span>
                </span>
              ),
          },
        ]}
      />

      {/* La trajectoire sur une ligne d'appui. Elle reste la question du
          matin, mais en encart elle aurait eu le meme poids que les trois
          chiffres au-dessus, alors qu'elle les commente. */}
      <p className="rc-appui">
        <span>
          {t("rc.objectifContexte", { annee: objectif.annee })}
          <strong>
            {objectif.atteintePct === null
              ? t("rc.sansObjectifGroupe")
              : `${nombre(objectif.atteintePct)}%`}
          </strong>
          {objectif.cible !== null && (
            <span className={`etat ${dansLesTemps ? "etat-bon" : "etat-alerte"}`}>
              {dansLesTemps ? t("ag.etat.en-ligne") : t("ag.etat.en-retard")}
            </span>
          )}
        </span>
        <span className="rc-appui-sep">·</span>
        <span>{t("co.tempsEcouleSeuil", { pct: objectif.partEcoulee })}</span>
        <span className="rc-appui-sep">·</span>
        <span>
          {t("rc.pipelinePondere")}
          <strong title={montant(pipeline.pondere)}>{montantCompact(pipeline.pondere)}</strong>
        </span>
      </p>

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("rc.equipeTitre")}</div>
            <div className="card-sub">{t("rc.equipeSousTitre")}</div>
          </div>
        </div>

        {/* Les trois signaux filtrent la liste, et vivent donc avec elle :
            en tete de page ils auraient dispute la place aux trois chiffres
            que le responsable vient lire en premier. */}
        <div className="rc-signaux">
          {signaux.map((s) => (
            <button
              type="button"
              key={s.cle}
              className={`rc-signal${filtre === s.cle ? " actif" : ""}${s.valeur === 0 ? " calme" : ""}`}
              aria-pressed={filtre === s.cle}
              disabled={s.valeur === 0}
              onClick={() => setFiltre(filtre === s.cle ? "" : s.cle)}
            >
              <span className="rc-signal-valeur">{nombre(s.valeur)}</span>
              {s.libelle}
            </button>
          ))}
          {filtre !== "" && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiltre("")}>
              {t("rc.retirerFiltre")}
            </button>
          )}
        </div>

        {/* L'arbre. Un pays se deplie sur ses commerciaux, un commercial
            mene a sa fiche. Trois niveaux et pas davantage : au-dela, on ne
            sait plus ou l'on est en revenant d'un ecran de detail. */}
        <div className="arbre">
          {arbre.length === 0 ? (
            <p className="suivi-vide">{t("rc.arbreVide")}</p>
          ) : (
            arbre.map((n) => {
              const cle = n.pays ?? "";
              const ouvert = paysOuverts.includes(cle);
              return (
                <div className={`arbre-pays${ouvert ? " ouvert" : ""}`} key={cle}>
                  <button
                    type="button"
                    className="arbre-tete"
                    aria-expanded={ouvert}
                    onClick={() =>
                      setPaysOuverts(
                        ouvert ? paysOuverts.filter((p) => p !== cle) : [...paysOuverts, cle]
                      )
                    }
                  >
                    <span className="arbre-chevron">
                      <IconChevronDown size={16} />
                    </span>
                    <span className="arbre-nom">
                      {n.pays ?? t("rc.paysInconnu")}
                    </span>
                    <span className="arbre-effectif">
                      {n.membres.length === 1
                        ? t("rc.unCommercial")
                        : t("rc.nCommerciaux", { n: nombre(n.membres.length) })}
                      {n.sansCible > 0 && (
                        <span className="arbre-sans-cible">
                          {t("rc.dontSansCible", { n: nombre(n.sansCible) })}
                        </span>
                      )}
                    </span>
                    <span className="arbre-ca" title={montant(n.ca)}>
                      {montantCompact(n.ca)}
                    </span>
                    {/* L'atteinte du pays, teintee comme celle d'un
                        commercial : c'est la meme mesure a un etage pres. */}
                    <span
                      className={`arbre-taux${
                        n.atteintePct !== null && n.atteintePct < objectif.partEcoulee
                          ? " en-retrait"
                          : ""
                      }`}
                    >
                      {n.atteintePct === null ? "-" : `${nombre(n.atteintePct)}%`}
                    </span>
                  </button>

                  {ouvert && (
                    <div className="table-scroll">
                      <table className="table-nue arbre-table">
                        <thead>
                          <tr>
                            <th>{t("rc.colCommercial")}</th>
                            <th className="num">{t("rc.colCa")}</th>
                            <th className="num">{t("rc.colObjectif")}</th>
                            <th className="num">{t("rc.colAtteinte")}</th>
                            <th>{t("rc.colDerniereVente")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {n.membres.map((c) => (
                            <tr key={c.id}>
                              <td className="td-strong td-main" data-label={t("rc.colCommercial")}>
                                {/* La fiche porte ses metriques, son agenda,
                                    ses cotations et son portefeuille. */}
                                <Link className="cp-lien" to={`/equipes/commerciale/${c.id}`}>
                                  {c.nomComplet}
                                </Link>
                              </td>
                              <td
                                className="num"
                                data-label={t("rc.colCa")}
                                title={montant(c.chiffreAffaires)}
                              >
                                {montantCompact(c.chiffreAffaires)}
                              </td>
                              <td className="num" data-label={t("rc.colObjectif")}>
                                {c.cible === null ? (
                                  <span className="pill pill-warn">{t("rc.aFixer")}</span>
                                ) : (
                                  <span title={montant(c.cible)}>{montantCompact(c.cible)}</span>
                                )}
                              </td>
                              <td className="num" data-label={t("rc.colAtteinte")}>
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
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {fenetre !== null && (
        <div className="modal-backdrop" onClick={() => setFenetre(null)} role="presentation">
          <div
            className="modal modal-forme rc-fenetre"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rc-fenetre-titre"
          >
            <header className="modal-forme-tete">
              <div>
                <h3 id="rc-fenetre-titre">
                  {fenetre === "portefeuille" ? t("rc.fPortefeuilleTitre") : t("rc.fTopTitre")}
                </h3>
                <p className="modal-sub">
                  {fenetre === "portefeuille"
                    ? t("rc.fPortefeuilleSous", { n: nombre(portefeuille.total) })
                    : t("rc.fTopSous", {
                        n: nombre(concentration.tete.length),
                        pct: nombre(concentration.partTetePct ?? 0),
                      })}
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setFenetre(null)}
                aria-label={t("commun.fermer")}
                title={t("commun.fermer")}
              >
                <IconClose size={16} />
              </button>
            </header>

            <div className="modal-forme-corps">
              {/* Quatre colonnes ne tiennent pas dans la largeur d'un
                  telephone : sans ce defilement, la part des clients tombait
                  hors de l'ecran sans aucun moyen de l'atteindre. */}
              <div className="table-scroll">
                <table className="table-nue">
                <thead>
                  <tr>
                    <th>{fenetre === "portefeuille" ? t("rc.colPays") : t("rc.colClient")}</th>
                    {fenetre === "portefeuille" ? (
                      <th className="num">{t("rc.colClients")}</th>
                    ) : (
                      <th>{t("rc.colPays")}</th>
                    )}
                    <th className="num">{t("rc.colCa")}</th>
                    {fenetre === "concentration" && <th className="num">{t("rc.colPart")}</th>}
                  </tr>
                </thead>
                <tbody>
                  {fenetre === "portefeuille"
                    ? portefeuille.parPays.map((p) => (
                        <tr key={p.pays ?? "sans"}>
                          <td className="td-strong">
                            {p.pays ?? <span className="muted-3">{t("rc.paysInconnu")}</span>}
                          </td>
                          <td className="num">{nombre(p.clients)}</td>
                          <td className="num" title={montant(p.ca)}>
                            {p.ca === 0 ? (
                              <span className="muted-3">-</span>
                            ) : (
                              montantCompact(p.ca)
                            )}
                          </td>
                        </tr>
                      ))
                    : concentration.tete.map((c, i) => (
                        <tr key={c.id}>
                          <td className="td-strong">
                            <span className="rc-place">{rang(i + 1)}</span>
                            {c.nom}
                          </td>
                          <td>
                            {c.pays ?? <span className="muted-3">{t("rc.paysInconnu")}</span>}
                          </td>
                          <td className="num" title={montant(c.ca)}>
                            {montantCompact(c.ca)}
                          </td>
                          <td className="num">{nombre(c.partPct)}%</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-forme-pied">
              <Link className="btn btn-ghost" to="/clients">
                {t("rc.voirClients")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
