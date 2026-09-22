import { useEffect, useState } from "react";
import { TableauCommercial, fetchTableauCommercial } from "../api";
import { useAuth } from "../AuthContext";
import { useLangue } from "../i18n";
import CarteIndicateur, { type Carte } from "../components/CarteIndicateur";
import { EvolutionMensuelle } from "../components/Charts";
import { IconAlert, IconAward, IconCoins, IconInbox, IconTrend, IconUsers } from "../components/Icons";

/**
 * Tableau de bord d'un commercial.
 *
 * Quatre indicateurs, tous tirés de ses propres ventes : ce qu'il a réalisé,
 * où il se situe dans l'équipe, l'état de son portefeuille et ce qu'il a
 * effectivement touché. Les mêmes cartes que la direction, parce qu'un chiffre
 * présenté différemment d'un écran à l'autre finit par être lu comme un autre
 * chiffre.
 */
export default function CommercialPage() {
  const { t, nombre, montant, montantCompact, rang, date, dateHeure, locale } = useLangue();
  const { utilisateur } = useAuth();
  const [donnees, setDonnees] = useState<TableauCommercial | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetchTableauCommercial()
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }, []);

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("co.bienvenue", { nom: utilisateur?.nomComplet ?? "" })}</h1>
        <div className="page-sub">{t("co.sousTitre")}</div>
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

  const { chiffreAffaires: ca, classement, portefeuille, commissions } = donnees;
  const rien = t("dg.aucuneDonnee");
  const aVendu = ca.nbVentes > 0;

  /* Part du premier : elle situe l'écart. « Troisième sur sept » ne dit pas si
     la place se joue à deux ventes ou à une année de travail. */
  const ecartPremier = classement.caPremier > 0 ? Math.round((ca.total / classement.caPremier) * 100) : null;

  const cartes: Carte[] = [
    {
      label: t("co.ca"),
      valeur: aVendu ? montantCompact(ca.total) : rien,
      note: aVendu
        ? ca.partEquipePct !== null
          ? t("co.caNote", { n: nombre(ca.nbVentes), part: ca.partEquipePct })
          : t("co.caNoteSansPart", { n: nombre(ca.nbVentes) })
        : t("co.aucuneVente"),
      icone: IconTrend,
      fg: "#0c8074",
      bg: "#e2f4f1",
      variationPct: ca.variationMois,
    },
    {
      label: t("co.classement"),
      /* Le rang est un ordinal, pas un nombre : « 3e » en français, « 3rd » en
         anglais, ce que seul Intl.PluralRules sait produire correctement. */
      valeur: classement.rang ? t("co.rangSur", { rang: rang(classement.rang), n: classement.effectif }) : rien,
      valeurTexte: true,
      note:
        classement.rangChiffreAffaires && classement.rangRentabilite
          ? t("co.classementNote", {
              ca: rang(classement.rangChiffreAffaires),
              marge: rang(classement.rangRentabilite),
            })
          : t("co.aucuneVente"),
      icone: IconAward,
      fg: "#9e6b06",
      bg: "#fcf2e0",
      /* Jauge sur l'écart au premier, pas sur le rang : un rang n'a pas de
         fraction, et le dessiner en proportion inventerait une distance. */
      jauge: ecartPremier !== null ? { valeurPct: Math.min(100, ecartPremier), couleur: "#c07a00" } : undefined,
    },
    {
      label: t("co.portefeuille"),
      valeur: portefeuille.total > 0 ? nombre(portefeuille.total) : rien,
      note:
        portefeuille.total > 0
          ? t("co.portefeuilleNote", {
              n: nombre(portefeuille.avecVente),
              pct: portefeuille.couverturePct ?? 0,
            })
          : t("co.portefeuilleVide"),
      icone: IconUsers,
      fg: "#5b4bc4",
      bg: "#eeebfa",
      jauge:
        portefeuille.couverturePct !== null
          ? { valeurPct: portefeuille.couverturePct, couleur: "#7c4dcc" }
          : undefined,
    },
    {
      label: t("co.commissions"),
      /* Reçu / attendu sur une seule ligne : c'est la comparaison qui
         intéresse, et deux cartes séparées obligeraient à la faire de tête. */
      valeur:
        commissions.attendu === null
          ? t("co.tauxNonDefini")
          : `${montantCompact(commissions.recu ?? 0).replace(" XAF", "")} / ${montantCompact(commissions.attendu)}`,
      /* Corps réduit : « 600 k / 782 k XAF » est une comparaison, pas un
         nombre unique, et au corps des montants elle passait à la ligne. */
      valeurTexte: true,
      note:
        commissions.attendu === null
          ? t("co.tauxNonDefiniNote")
          : t("co.commissionsNote", {
              n: nombre(commissions.nbVentesReglees),
              total: nombre(ca.nbVentes),
              /* Formaté et non interpolé brut : un taux de 6,5 s'écrivait
                 « 6.5% » en français, avec le point décimal anglais. */
              taux: nombre(commissions.tauxPct ?? 0),
            }),
      icone: IconCoins,
      fg: "#2a79ae",
      bg: "#e8f3fb",
    },
  ];

  const resteDu = commissions.attendu !== null ? commissions.attendu - (commissions.recu ?? 0) : null;

  return (
    <>
      {entete}

      <div className="stat-grid">
        {cartes.map((c) => (
          <CarteIndicateur
            key={c.label}
            {...c}
            libelleVariation={t("dg.depuisMoisDernier")}
            libelleSansVariation={t("dg.pasDeComparaison")}
          />
        ))}
      </div>

      {/* Le détail derrière les quatre chiffres : un commercial doit pouvoir
          refaire le calcul, pas seulement lire le résultat. */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("co.detailTitre")}</div>
            <div className="card-sub">{t("co.detailSousTitre")}</div>
          </div>
        </div>

        <dl className="detail-grille">
          <div className="detail-ligne">
            <dt>{t("co.caMois")}</dt>
            <dd>{montant(ca.mois)}</dd>
          </div>
          <div className="detail-ligne">
            <dt>{t("co.beneficeRealise")}</dt>
            <dd>
              {montant(ca.benefice)}
              {ca.margePct !== null && <span className="detail-appoint">{t("co.margeDe", { pct: ca.margePct })}</span>}
            </dd>
          </div>
          <div className="detail-ligne">
            <dt>{t("co.derniereVente")}</dt>
            <dd>{ca.derniereVente ? date(ca.derniereVente) : t("co.jamais")}</dd>
          </div>
          <div className="detail-ligne">
            <dt>{t("co.clientsSansVente")}</dt>
            <dd>{nombre(portefeuille.total - portefeuille.avecVente)}</dd>
          </div>
          <div className="detail-ligne">
            <dt>{t("co.commissionsRecues")}</dt>
            <dd>{commissions.recu === null ? t("co.tauxNonDefini") : montant(commissions.recu)}</dd>
          </div>
          <div className="detail-ligne">
            <dt>{t("co.resteDu")}</dt>
            <dd>{resteDu === null ? t("co.tauxNonDefini") : montant(resteDu)}</dd>
          </div>
        </dl>
      </div>

      {/* Même évolution que celle du DG sur une fiche : il n'y a aucune raison
          qu'un commercial découvre sa saisonnalité autrement que son directeur. */}
      {aVendu && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("co.evolutionTitre")}</div>
              <div className="card-sub">{t("co.evolutionSousTitre")}</div>
            </div>
          </div>
          <EvolutionMensuelle
            points={donnees.parMois.map((p) => ({
              ...p,
              libelle: new Date(`${p.mois}-01T00:00:00`).toLocaleDateString(locale, { month: "short" }),
            }))}
          />
        </div>
      )}

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("co.historiqueTitre")}</div>
            <div className="card-sub">{t("co.historiqueSousTitre", { n: nombre(ca.nbVentes) })}</div>
          </div>
          {ca.derniereVente && <span className="tag">{date(ca.derniereVente)}</span>}
        </div>

        {donnees.ventes.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("co.historiqueVideTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("co.historiqueVideTexte")}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("fc.colDate")}</th>
                  <th>{t("fc.colClient")}</th>
                  <th>{t("fc.colProduit")}</th>
                  <th>{t("fc.colQuantite")}</th>
                  <th>{t("fc.colMontant")}</th>
                  <th>{t("fc.colBenefice")}</th>
                  <th>{t("fc.colCommission")}</th>
                </tr>
              </thead>
              <tbody>
                {donnees.ventes.map((v) => (
                  <tr key={v.id}>
                    <td data-label={t("fc.colDate")}>{dateHeure(v.dateVente)}</td>
                    <td className="td-strong td-main" data-label={t("fc.colClient")}>
                      {v.clientNom}
                    </td>
                    <td data-label={t("fc.colProduit")}>{v.produit}</td>
                    <td className="num" data-label={t("fc.colQuantite")}>
                      {nombre(v.quantite)}
                    </td>
                    <td className="num" data-label={t("fc.colMontant")} title={montant(v.montant)}>
                      {montantCompact(v.montant)}
                    </td>
                    <td
                      className={`num ${v.benefice >= 0 ? "num-positif" : "num-negatif"}`}
                      data-label={t("fc.colBenefice")}
                      title={montant(v.benefice)}
                    >
                      {v.benefice >= 0 ? "+" : ""}
                      {montantCompact(v.benefice)}
                    </td>
                    {/* La colonne du DG porte le montant ; celle-ci y ajoute le
                        règlement. C'est la question que se pose l'intéressé, et
                        elle décompose l'écart affiché en haut de page. */}
                    <td className="num" data-label={t("fc.colCommission")}>
                      {v.commission === null ? (
                        <span className="muted-3">-</span>
                      ) : (
                        <>
                          <span title={montant(v.commission)}>{montantCompact(v.commission)}</span>
                          <span className={`pill ${v.commissionVerseeLe ? "pill-success" : "pill-warn"} pill-reglement`}>
                            {v.commissionVerseeLe ? t("co.versee", { date: date(v.commissionVerseeLe) }) : t("co.due")}
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
