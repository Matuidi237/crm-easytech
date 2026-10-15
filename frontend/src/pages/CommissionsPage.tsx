import { useEffect, useMemo, useState } from "react";
import { ReleveCommissions, fetchReleveCommissions } from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { IconAlert, IconInbox } from "../components/Icons";

type Filtre = "toutes" | "dues" | "versees";

/** Libellé de mois à partir d'une clé « 2026-09 ». */
function libelleMois(cle: string, locale: string) {
  return new Date(`${cle}-01T00:00:00`).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/**
 * Relevé de commissions.
 *
 * Une commission se conteste : la page sert à refaire le calcul, pas seulement
 * à en lire le total. Un seul chiffre la porte, ce qui reste à percevoir, et
 * tout le reste l'explique : le barème appliqué, ce que chaque nature de vente
 * rapporte, le relevé mois par mois, puis chaque vente avec son taux et sa
 * part. Un montant global sans justificatif n'est pas vérifiable, et ce qui
 * n'est pas vérifiable finit par être contesté de travers.
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
        <div className="panneau panneau-vide">{t("commun.chargementDonnees")}</div>
      </>
    );
  }

  const { regle, totaux, parMois, parNature } = releve;
  const partVersee = totaux.attendu > 0 ? Math.round((totaux.recu / totaux.attendu) * 100) : 0;
  const solde = totaux.reste <= 0;
  /* Le maximum sert d'échelle commune aux deux natures : peintes chacune sur
     son propre maximum, elles paraîtraient équivalentes. */
  const maxNature = Math.max(...parNature.map((n) => n.commission), 1);

  return (
    <>
      {entete}

      {/* Ce qui reste à percevoir, et lui seul : c'est la question qu'on vient
          poser sur cette page. La jauge dit où en est le versement. */}
      <section className="panneau heros">
        <div className="heros-haut">
          <div className="heros-principal">
            <span className="heros-contexte">{t("cm.sousTitre")}</span>
            <span className="heros-chiffre" title={montant(totaux.reste)}>
              {montantCompact(totaux.reste)}
            </span>
            <span className="heros-appui">
              {t("cm.surAttendu", { recu: montant(totaux.recu), attendu: montant(totaux.attendu) })}
            </span>
          </div>
          <span className={`etat ${solde ? "etat-bon" : "etat-alerte"}`}>
            {solde ? t("cm.toutSolde") : t("cm.resteAPercevoir", { montant: montantCompact(totaux.reste) })}
          </span>
        </div>

        <div className="mesure">
          <span className="mesure-remplie" style={{ width: `${Math.min(100, partVersee)}%` }} />
        </div>
        <div className="mesure-pied">
          <span>{t("cm.partVersee", { pct: nombre(partVersee) })}</span>
          <span>
            {t("cm.recuNote", { n: nombre(totaux.nbVentesReglees), total: nombre(totaux.nbVentes) })}
          </span>
        </div>

        <dl className="heros-rythme">
          <div>
            <dt>{t("co.ca")}</dt>
            <dd title={montant(totaux.chiffreAffaires)}>{montantCompact(totaux.chiffreAffaires)}</dd>
          </div>
          <div>
            <dt>{t("cm.colBenefice")}</dt>
            <dd title={montant(totaux.benefice)}>{montantCompact(totaux.benefice)}</dd>
          </div>
          <div>
            <dt>{t("cm.attendu")}</dt>
            <dd title={montant(totaux.attendu)}>{montantCompact(totaux.attendu)}</dd>
          </div>
        </dl>
      </section>

      {/* Le barème avant les chiffres : un relevé qui mêle deux taux sans les
          énoncer est impossible à recalculer, et une commission se recalcule. */}
      <section className="panneau">
        <header className="panneau-tete">
          <h2>{t("cm.baremeTitre")}</h2>
          <span className="panneau-note">
            {regle.tauxNegociePct !== null ? t("cm.baremeNegocie") : t("cm.assietteBenefice")}
          </span>
        </header>
        <table className="rangs">
          <tbody>
            {parNature.map((n) => (
              <tr key={n.nature}>
                <td className="rang-num">{nombre(n.tauxPct)}%</td>
                <td className="rang-nom">
                  <span
                    className="rang-fond"
                    style={{ width: `${(n.commission / maxNature) * 100}%` }}
                    aria-hidden
                  />
                  <span className="rang-texte">{t(`nature.${n.nature}` as CleTraduction)}</span>
                </td>
                <td className="rang-chiffre">{t("cm.ventesN", { n: nombre(n.nbVentes) })}</td>
                <td className="rang-chiffre" title={montant(n.benefice)}>
                  {montantCompact(n.benefice)}
                </td>
                <td className="rang-chiffre rang-montant" title={montant(n.commission)}>
                  {montantCompact(n.commission)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Le relevé mensuel. Le mois est celui de la VENTE, pas du versement :
          c'est le travail du mois qui se discute, et une commission réglée en
          retard appartient quand même au mois où elle a été gagnée. */}
      <section className="panneau">
        <header className="panneau-tete">
          <h2>{t("cm.releveTitre")}</h2>
        </header>

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
            <table className="table-nue">
              <thead>
                <tr>
                  <th>{t("cm.colMois")}</th>
                  <th className="num">{t("cm.colVentes")}</th>
                  <th className="num">{t("cm.colBenefice")}</th>
                  <th className="num">{t("cm.colCommission")}</th>
                  <th className="num">{t("cm.colVerse")}</th>
                  <th className="num">{t("cm.colDu")}</th>
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
                    <td
                      className="num td-strong"
                      data-label={t("cm.colCommission")}
                      title={montant(m.commission)}
                    >
                      {montantCompact(m.commission)}
                    </td>
                    <td className="num" data-label={t("cm.colVerse")} title={montant(m.verse)}>
                      {m.verse > 0 ? montantCompact(m.verse) : <span className="muted-3">—</span>}
                    </td>
                    <td className="num" data-label={t("cm.colDu")} title={montant(m.du)}>
                      {m.du > 0 ? (
                        <span>
                          {montantCompact(m.du)}
                          <span className="point-attente" title={t("co.due")} />
                        </span>
                      ) : (
                        <span className="muted-3">—</span>
                      )}
                    </td>
                    <td data-label={t("cm.colDernierVersement")}>
                      {m.dernierVersement ? date(m.dernierVersement) : <span className="muted-3">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panneau">
        <header className="panneau-tete">
          <h2>{t("cm.detailTitre")}</h2>
          {/* Le filtre répond à la seule question qu'on se pose ici : qu'est-ce
              qui reste à me payer. */}
          <div className="segmente" role="group" aria-label={t("cm.filtreEtiquette")}>
            {(["toutes", "dues", "versees"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={f === filtre ? "on" : undefined}
                onClick={() => setFiltre(f)}
                aria-pressed={f === filtre}
              >
                {t(`cm.filtre.${f}` as CleTraduction)}
              </button>
            ))}
          </div>
        </header>

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
            <table className="table-nue">
              <thead>
                <tr>
                  <th>{t("fc.colDate")}</th>
                  <th>{t("fc.colClient")}</th>
                  <th>{t("fc.colProduit")}</th>
                  <th>{t("cm.colNature")}</th>
                  <th className="num">{t("fc.colBenefice")}</th>
                  <th className="num">{t("cm.colTaux")}</th>
                  <th className="num">{t("cm.colPart")}</th>
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
                    <td data-label={t("cm.colNature")}>
                      {v.nature ? t(`nature.${v.nature}` as CleTraduction) : "—"}
                    </td>
                    <td className="num" data-label={t("fc.colBenefice")} title={montant(v.benefice)}>
                      {montantCompact(v.benefice)}
                    </td>
                    {/* Le taux de la ligne, parce que deux taux cohabitent : sans
                        lui, la part ne se recalcule pas de tête. */}
                    <td className="num" data-label={t("cm.colTaux")}>
                      {v.tauxPct === undefined ? "—" : `${nombre(v.tauxPct)}%`}
                    </td>
                    <td
                      className="num td-strong"
                      data-label={t("cm.colPart")}
                      title={t("cm.calculDetail", {
                        benefice: montant(Math.max(0, v.benefice)),
                        taux: nombre(v.tauxPct ?? 0),
                        commission: montant(v.commission ?? 0),
                      })}
                    >
                      {montantCompact(v.commission ?? 0)}
                    </td>
                    <td data-label={t("cm.colStatut")}>
                      {v.commissionVerseeLe ? (
                        t("co.versee", { date: date(v.commissionVerseeLe) })
                      ) : (
                        <span className="pill pill-warn">{t("co.due")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
