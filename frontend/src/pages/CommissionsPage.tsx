import { useEffect, useMemo, useState } from "react";
import { ReleveCommissions, fetchReleveCommissions } from "../api";
import { useLangue } from "../i18n";
import CarteIndicateur, { type Carte } from "../components/CarteIndicateur";
import { IconAlert, IconCheck, IconCoins, IconInbox } from "../components/Icons";

type Filtre = "toutes" | "dues" | "versees";

/** Libellé de mois à partir d'une clé « 2026-09 ». */
function libelleMois(cle: string, locale: string) {
  return new Date(`${cle}-01T00:00:00`).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/**
 * Relevé de commissions.
 *
 * Une commission se conteste : la page sert à refaire le calcul, pas
 * seulement à en lire le total. Elle commence donc par énoncer la règle
 * appliquée, donne le relevé mois par mois, puis chaque vente avec sa part.
 * Un montant global sans justificatif n'est pas vérifiable, et ce qui n'est
 * pas vérifiable finit par être contesté de travers.
 */
export default function CommissionsPage() {
  const { t, nombre, montant, montantCompact, date, locale } = useLangue();
  const [releve, setReleve] = useState<ReleveCommissions | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>("toutes");

  useEffect(() => {
    fetchReleveCommissions()
      .then(setReleve)
      .catch((e) => setErreur(e.message));
  }, []);

  const lignes = useMemo(() => {
    if (!releve) return [];
    if (filtre === "dues") return releve.ventes.filter((v) => v.commissionVerseeLe === null);
    if (filtre === "versees") return releve.ventes.filter((v) => v.commissionVerseeLe !== null);
    return releve.ventes;
  }, [releve, filtre]);

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("nav.commissions")}</h1>
        <div className="page-sub">{t("cm.sousTitre")}</div>
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

  if (!releve) {
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

  const { regle, totaux, parMois } = releve;
  const partVersee = totaux.attendu > 0 ? Math.round((totaux.recu / totaux.attendu) * 100) : null;

  const cartes: Carte[] = [
    {
      label: t("cm.attendu"),
      valeur: montantCompact(totaux.attendu),
      note: t("cm.attenduNote", { n: nombre(totaux.nbVentes), benefice: montantCompact(totaux.benefice) }),
      icone: IconCoins,
      fg: "#2a79ae",
      bg: "#e8f3fb",
    },
    {
      label: t("cm.recu"),
      valeur: montantCompact(totaux.recu),
      note: t("cm.recuNote", { n: nombre(totaux.nbVentesReglees), total: nombre(totaux.nbVentes) }),
      icone: IconCheck,
      fg: "#0c8074",
      bg: "#e2f4f1",
      /* La jauge porte sur la part déjà versée : c'est la question qu'on se
         pose devant ce chiffre, et deux montants côte à côte obligeraient à
         faire la division de tête. */
      jauge: partVersee !== null ? { valeurPct: partVersee, couleur: "#0c8074" } : undefined,
    },
    {
      label: t("cm.reste"),
      valeur: montantCompact(totaux.reste),
      note:
        totaux.reste > 0
          ? t("cm.resteNote", { n: nombre(totaux.nbVentes - totaux.nbVentesReglees) })
          : t("cm.resteSolde"),
      icone: IconCoins,
      fg: "#9e6b06",
      bg: "#fcf2e0",
    },
  ];

  return (
    <>
      {entete}

      {/* La règle avant les chiffres : beaucoup de commerciaux attendent un
          pourcentage du chiffre d'affaires, et découvrir l'assiette au moment
          de contester est le pire moment pour l'apprendre. */}
      <div className="regle-commission">
        <div className="regle-taux">{nombre(regle.tauxPct)}%</div>
        <div>
          <div className="regle-titre">{t("cm.regleTitre")}</div>
          <p className="regle-texte">
            {t(regle.tauxNegocie ? "cm.regleNegociee" : "cm.regleMaison", { taux: nombre(regle.tauxPct) })}
          </p>
        </div>
      </div>

      <div className="stat-grid stat-grid-trois">
        {cartes.map((c) => (
          <CarteIndicateur
            key={c.label}
            {...c}
            libelleVariation={t("dg.depuisMoisDernier")}
            libelleSansVariation={t("dg.pasDeComparaison")}
          />
        ))}
      </div>

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("cm.releveTitre")}</div>
            <div className="card-sub">{t("cm.releveSousTitre")}</div>
          </div>
        </div>

        {parMois.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("co.historiqueVideTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("cm.videTexte")}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("cm.colMois")}</th>
                  <th>{t("cm.colVentes")}</th>
                  <th>{t("cm.colBenefice")}</th>
                  <th>{t("cm.colCommission")}</th>
                  <th>{t("cm.colVerse")}</th>
                  <th>{t("cm.colDu")}</th>
                  <th>{t("cm.colDernierVersement")}</th>
                </tr>
              </thead>
              <tbody>
                {parMois.map((m) => (
                  <tr key={m.mois}>
                    <td className="td-strong td-main" data-label={t("cm.colMois")}>
                      {libelleMois(m.mois, locale)}
                    </td>
                    <td className="num" data-label={t("cm.colVentes")}>
                      {nombre(m.nbVentes)}
                    </td>
                    <td className="num" data-label={t("cm.colBenefice")} title={montant(m.benefice)}>
                      {montantCompact(m.benefice)}
                    </td>
                    <td className="num td-strong" data-label={t("cm.colCommission")} title={montant(m.commission)}>
                      {montantCompact(m.commission)}
                    </td>
                    <td className="num num-positif" data-label={t("cm.colVerse")} title={montant(m.verse)}>
                      {m.verse > 0 ? montantCompact(m.verse) : <span className="muted-3">-</span>}
                    </td>
                    <td
                      className={`num ${m.du > 0 ? "num-negatif" : ""}`}
                      data-label={t("cm.colDu")}
                      title={montant(m.du)}
                    >
                      {m.du > 0 ? montantCompact(m.du) : <span className="muted-3">-</span>}
                    </td>
                    <td data-label={t("cm.colDernierVersement")}>
                      {m.dernierVersement ? date(m.dernierVersement) : <span className="muted-3">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("cm.detailTitre")}</div>
            <div className="card-sub">{t("cm.detailSousTitre")}</div>
          </div>
          {/* Le filtre répond à la seule question qu'on se pose ici : qu'est-ce
              qui reste à me payer. */}
          <div className="dim-switch" role="group" aria-label={t("cm.filtreEtiquette")}>
            {(["toutes", "dues", "versees"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`dim-opt${f === filtre ? " on" : ""}`}
                onClick={() => setFiltre(f)}
                aria-pressed={f === filtre}
              >
                {t(`cm.filtre.${f}` as "cm.filtre.toutes")}
              </button>
            ))}
          </div>
        </div>

        {lignes.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("cm.filtreVideTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("cm.filtreVideTexte")}
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
                  <th>{t("fc.colBenefice")}</th>
                  <th>{t("cm.colPart")}</th>
                  <th>{t("cm.colStatut")}</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((v) => (
                  <tr key={v.id}>
                    <td data-label={t("fc.colDate")}>{date(v.dateVente)}</td>
                    <td className="td-strong td-main" data-label={t("fc.colClient")}>
                      {v.clientNom}
                    </td>
                    <td data-label={t("fc.colProduit")}>{v.produit}</td>
                    <td
                      className={`num ${v.benefice >= 0 ? "num-positif" : "num-negatif"}`}
                      data-label={t("fc.colBenefice")}
                      title={montant(v.benefice)}
                    >
                      {v.benefice >= 0 ? "+" : ""}
                      {montantCompact(v.benefice)}
                    </td>
                    {/* Le calcul est rappelé en infobulle : bénéfice fois taux,
                        c'est l'opération que le commercial veut vérifier. */}
                    <td
                      className="num td-strong"
                      data-label={t("cm.colPart")}
                      title={t("cm.calculDetail", {
                        benefice: montant(Math.max(0, v.benefice)),
                        taux: nombre(regle.tauxPct),
                        commission: montant(v.commission ?? 0),
                      })}
                    >
                      {montantCompact(v.commission ?? 0)}
                    </td>
                    <td data-label={t("cm.colStatut")}>
                      <span className={`pill ${v.commissionVerseeLe ? "pill-success" : "pill-warn"}`}>
                        {v.commissionVerseeLe ? t("co.versee", { date: date(v.commissionVerseeLe) }) : t("co.due")}
                      </span>
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
