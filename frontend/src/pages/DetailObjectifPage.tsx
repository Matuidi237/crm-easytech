import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activite, PERIODES_ACTIVITE, PeriodeActivite, fetchActivite } from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { useFilAriane } from "../ContexteEntete";
import { CourbeEvolution } from "../components/Charts";
import { IconAlert, IconArrowDown, IconArrowRight, IconArrowUp, IconInbox } from "../components/Icons";

/** Écart en pourcentage d'une période à l'autre, null faute de base. */
function evolution(actuel: number, precedent: number): number | null {
  if (precedent <= 0) return null;
  return Math.round(((actuel - precedent) / precedent) * 100);
}

/**
 * Activité commerciale détaillée.
 *
 * La carte du tableau de bord donne un engagement et un taux ; cette page dit
 * ce qui l'a produit. Quatre questions, dans cet ordre : où j'en suis, ce
 * qu'il reste et à quel rythme, ce qui fait le chiffre, et qui l'achète.
 *
 * Chaque chiffre est comparé à la période équivalente précédente, jamais à
 * rien : un montant seul ne dit pas si la tendance monte.
 */
export default function DetailObjectifPage() {
  const { t, nombre, montant, montantCompact, date, dateHeure, locale } = useLangue();
  const [periode, setPeriode] = useState<PeriodeActivite>("ANNEE");
  const [a, setA] = useState<Activite | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useFilAriane("/", t("co.retourTableau"), t("co.detailObjectifTitre"));

  useEffect(() => {
    setA(null);
    fetchActivite(periode)
      .then(setA)
      .catch((e) => setErreur(e.message));
  }, [periode]);

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("co.detailObjectifTitre")}</h1>
        <div className="page-sub">{t("co.detailObjectifSousTitre2")}</div>
      </div>
    </div>
  );

  if (!a) {
    return (
      <>
        {entete}
        {erreur ? (
          <div className="alert alert-error">
            <IconAlert />
            {erreur}
          </div>
        ) : (
          <div className="card">
            <p className="muted-3" style={{ margin: 0 }}>
              {t("commun.chargementDonnees")}
            </p>
          </div>
        )}
      </>
    );
  }

  const cible = a.objectif?.cibleCaXAF ?? null;
  const completion = cible && cible > 0 ? Math.round((a.courant.ca / cible) * 100) : null;
  const reste = cible === null ? null : Math.max(0, cible - a.courant.ca);

  /* Rythme : ce qu'il reste à faire réparti sur les mois qui restent. Le mois
     en cours compte comme restant, il n'est pas terminé. */
  const debut = new Date(a.debut);
  const fin = new Date(a.fin);
  const moisTotal = Math.max(1, (fin.getFullYear() - debut.getFullYear()) * 12 + fin.getMonth() - debut.getMonth());
  const moisEcoules = Math.min(moisTotal, Math.max(1, a.parMois.filter((m) => m.mois <= cleMois(new Date())).length));
  const moisRestants = Math.max(1, moisTotal - moisEcoules + 1);
  const rythmeNecessaire = reste === null ? null : Math.round(reste / moisRestants);
  const rythmeTenu = Math.round(a.courant.ca / moisEcoules);

  function cleMois(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function libelleFenetre() {
    if (a!.periode === "MOIS") return debut.toLocaleDateString(locale, { month: "long", year: "numeric" });
    if (a!.periode === "TRIMESTRE")
      return t("ag.trimestreN", { n: Math.floor(debut.getMonth() / 3) + 1, annee: debut.getFullYear() });
    if (a!.periode === "SEMESTRE")
      return t("ag.semestreN", { n: debut.getMonth() < 6 ? 1 : 2, annee: debut.getFullYear() });
    return String(debut.getFullYear());
  }

  /** Un chiffre, son évolution par rapport à la période précédente. */
  function Chiffre({
    libelle,
    valeur,
    titre,
    delta,
    sens = "haut",
  }: {
    libelle: string;
    valeur: string;
    titre?: string;
    delta?: number | null;
    /** « bas » quand la baisse est une bonne nouvelle. Aucun cas ici, mais la
        couleur ne doit pas être figée dans le composant. */
    sens?: "haut" | "bas";
  }) {
    const bon = delta === null || delta === undefined ? null : sens === "haut" ? delta >= 0 : delta <= 0;
    return (
      <div className="chiffre-cle">
        <span className="chiffre-label">{libelle}</span>
        <strong title={titre}>{valeur}</strong>
        {delta !== undefined && (
          <span className={`chiffre-delta${bon === null ? " neutre" : bon ? " hausse" : " baisse"}`}>
            {delta === null ? (
              t("dg.pasDeComparaison")
            ) : (
              <>
                {delta >= 0 ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />}
                {delta >= 0 ? "+" : ""}
                {nombre(delta)}% {t("co.vsPeriodePrecedente")}
              </>
            )}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      {entete}

      {erreur && (
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      )}

      {/* Granularité : la même activité se juge autrement sur un mois et sur
          une année, et l'engagement change avec elle. */}
      <div className="card">
        <div className="dim-switch dim-switch-large" role="group" aria-label={t("ag.granularite")}>
          {PERIODES_ACTIVITE.map((p) => (
            <button
              key={p}
              type="button"
              className={`dim-opt${p === periode ? " on" : ""}`}
              onClick={() => setPeriode(p)}
              aria-pressed={p === periode}
            >
              {t(`periode.${p}` as CleTraduction)}
            </button>
          ))}
        </div>

        <div className="semaine-tete" style={{ marginTop: 14 }}>
          <div className="semaine-titre">
            <div className="semaine-libelle">{libelleFenetre()}</div>
            <div className="semaine-total">
              {a.objectif?.titre
                ? t("co.objectifIntitule", { titre: a.objectif.titre, auteur: a.objectif.definiParNom })
                : t("ag.tempsEcoule", { pct: a.partEcoulee })}
            </div>
          </div>
        </div>
      </div>

      {/* 1. Où j'en suis. */}
      {cible === null ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("co.objectifAbsentTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("co.objectifAbsentTexte")}
            </p>
            <Link to="/planning/objectifs" className="btn btn-primary btn-sm" style={{ marginTop: 6 }}>
              {t("co.allerObjectifs")}
              <IconArrowRight size={14} />
            </Link>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="objectif-entete">
            <div>
              <div className="objectif-legende">{t("co.detailMontantAReal")}</div>
              <div className="objectif-taux">{montant(cible)}</div>
              <div className="objectif-legende">
                {t("co.detailRealiseSur", { realise: montant(a.courant.ca), cible: montant(cible) })}
              </div>
            </div>
            <span className={`pill ${(completion ?? 0) + 5 >= a.partEcoulee ? "pill-success" : "pill-warn"}`}>
              {(completion ?? 0) + 5 >= a.partEcoulee ? t("ag.etat.en-ligne") : t("ag.etat.en-retard")}
            </span>
          </div>

          <div className="cible-rail" style={{ marginTop: 16 }}>
            <span className="cible-barre" style={{ width: `${Math.min(100, completion ?? 0)}%` }} />
            {/* Repère du temps consommé : sans lui, un taux ne dit ni bien ni
                mal. 70 % en octobre et 70 % en mars n'ont rien à voir. */}
            <span
              className="cible-repere"
              style={{ left: `${a.partEcoulee}%` }}
              title={t("ag.repereTemps", { pct: a.partEcoulee })}
            />
          </div>
          <div className="cible-pied">
            <span>{t("co.detailCompletion", { pct: nombre(completion ?? 0) })}</span>
            <span className="muted-3">{t("ag.tempsEcoule", { pct: a.partEcoulee })}</span>
          </div>
        </div>
      )}

      {/* 2. Les chiffres de la période, comparés à la précédente. */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("co.detailChiffresTitre")}</div>
            <div className="card-sub">{t("co.detailChiffresSousTitre")}</div>
          </div>
        </div>
        <div className="chiffres-cles">
          <Chiffre
            libelle={t("co.ca")}
            valeur={montantCompact(a.courant.ca)}
            titre={montant(a.courant.ca)}
            delta={evolution(a.courant.ca, a.precedent.ca)}
          />
          <Chiffre
            libelle={t("cm.colBenefice")}
            valeur={montantCompact(a.courant.benefice)}
            titre={montant(a.courant.benefice)}
            delta={evolution(a.courant.benefice, a.precedent.benefice)}
          />
          <Chiffre
            libelle={t("co.detailMaMarge")}
            valeur={a.courant.margePct === null ? "-" : `${nombre(a.courant.margePct)}%`}
            delta={
              a.courant.margePct === null || a.precedent.margePct === null
                ? null
                : a.courant.margePct - a.precedent.margePct
            }
          />
          <Chiffre
            libelle={t("cm.colVentes")}
            valeur={nombre(a.courant.nbVentes)}
            delta={evolution(a.courant.nbVentes, a.precedent.nbVentes)}
          />
          <Chiffre
            libelle={t("co.detailPanier")}
            valeur={montantCompact(a.courant.panierMoyen)}
            titre={montant(a.courant.panierMoyen)}
            delta={evolution(a.courant.panierMoyen, a.precedent.panierMoyen)}
          />
          <Chiffre libelle={t("co.detailClientsServis")} valeur={nombre(a.courant.nbClients)} />
          <Chiffre
            libelle={t("co.commissions")}
            valeur={montantCompact(a.courant.commissions)}
            titre={montant(a.courant.commissions)}
          />
          {reste !== null && <Chiffre libelle={t("co.detailReste")} valeur={montantCompact(reste)} titre={montant(reste)} />}
        </div>
      </div>

      {/* 3. Le rythme, qui transforme un constat en décision. */}
      {reste !== null && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("co.detailResteTitre")}</div>
              <div className="card-sub">{t("co.detailResteSousTitre")}</div>
            </div>
          </div>
          <div className="chiffres-cles">
            <div className="chiffre-cle">
              <span className="chiffre-label">{t("co.detailMoisRestants")}</span>
              <strong>{nombre(moisRestants)}</strong>
            </div>
            <div className="chiffre-cle">
              <span className="chiffre-label">{t("co.detailRythmeNecessaire")}</span>
              <strong>{montant(rythmeNecessaire ?? 0)}</strong>
            </div>
            <div className="chiffre-cle">
              <span className="chiffre-label">{t("co.detailRythmeActuel")}</span>
              <strong className={rythmeTenu < (rythmeNecessaire ?? 0) ? "valeur-negative" : ""}>
                {montant(rythmeTenu)}
              </strong>
            </div>
            <div className="chiffre-cle">
              <span className="chiffre-label">{t("co.detailEffort")}</span>
              <strong>
                {rythmeTenu > 0 && rythmeNecessaire !== null
                  ? t("co.detailEffortValeur", { x: nombre(Math.round((rythmeNecessaire / rythmeTenu) * 10) / 10) })
                  : "-"}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* 4. L'évolution. */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("co.detailAnneeTitre", { annee: libelleFenetre() })}</div>
            <div className="card-sub">{t("co.detailAnneeSousTitre")}</div>
          </div>
        </div>
        {a.parMois.length === 0 ? (
          <p className="muted-3" style={{ margin: "14px 0 0", fontSize: 13 }}>
            {t("co.aucuneVente")}
          </p>
        ) : (
          <CourbeEvolution
            points={a.parMois.map((p) => ({
              ...p,
              libelle: new Date(`${p.mois}-01T00:00:00`).toLocaleDateString(locale, { month: "short" }),
            }))}
          />
        )}
      </div>

      {/* 5. Ce qui fait le chiffre. */}
      <div className="deux-colonnes">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("co.detailProduitsTitre")}</div>
              <div className="card-sub">{t("co.detailProduitsSousTitre")}</div>
            </div>
          </div>
          {a.parProduit.length === 0 ? (
            <p className="muted-3" style={{ margin: "14px 0 0", fontSize: 13 }}>
              {t("co.aucuneVente")}
            </p>
          ) : (
            <ul className="repartition">
              {a.parProduit.slice(0, 8).map((p) => {
                const part = a.courant.ca > 0 ? Math.round((p.ca / a.courant.ca) * 100) : 0;
                return (
                  <li key={p.produit} className="repartition-ligne">
                    <span className="repartition-nom" title={p.produit}>
                      {p.produit}
                    </span>
                    <span className="repartition-rail">
                      <span className="repartition-barre" style={{ width: `${part}%` }} />
                    </span>
                    <span className="repartition-valeur" title={montant(p.ca)}>
                      {montantCompact(p.ca)}
                      <span className="repartition-part">{nombre(part)}%</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("co.detailClientsTitre")}</div>
              <div className="card-sub">{t("co.detailClientsSousTitre")}</div>
            </div>
          </div>
          {a.parClient.length === 0 ? (
            <p className="muted-3" style={{ margin: "14px 0 0", fontSize: 13 }}>
              {t("co.aucuneVente")}
            </p>
          ) : (
            <>
              <ul className="repartition">
                {a.parClient.slice(0, 8).map((c) => {
                  const part = a.courant.ca > 0 ? Math.round((c.ca / a.courant.ca) * 100) : 0;
                  return (
                    <li key={c.nom} className="repartition-ligne">
                      <span className="repartition-nom" title={c.nom}>
                        {c.nom}
                      </span>
                      <span className="repartition-rail">
                        <span className="repartition-barre" style={{ width: `${part}%` }} />
                      </span>
                      <span className="repartition-valeur" title={montant(c.ca)}>
                        {montantCompact(c.ca)}
                        <span className="repartition-part">{nombre(part)}%</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {/* Concentration : un chiffre porté par trois clients est fragile,
                  et c'est une information que la liste seule ne donne pas. */}
              {a.parClient.length >= 3 && a.courant.ca > 0 && (
                <p className="objectif-note">
                  {t("co.detailConcentration", {
                    pct: nombre(
                      Math.round(
                        (a.parClient.slice(0, 3).reduce((s, c) => s + c.ca, 0) / a.courant.ca) * 100
                      )
                    ),
                  })}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* 6. Les dernières ventes de la période. */}
      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("co.detailDernieresTitre")}</div>
            <div className="card-sub">{t("co.detailDernieresSousTitre")}</div>
          </div>
          <Link to="/ventes" className="btn btn-ghost btn-sm">
            {t("co.detailToutesVentes")}
            <IconArrowRight size={14} />
          </Link>
        </div>

        {a.dernieresVentes.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("co.historiqueVideTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("ve.listeVideTexte")}
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
                  <th>{t("fc.colMontant")}</th>
                  <th>{t("fc.colBenefice")}</th>
                  <th>{t("fc.colCommission")}</th>
                </tr>
              </thead>
              <tbody>
                {a.dernieresVentes.map((v) => (
                  <tr key={v.id}>
                    <td data-label={t("fc.colDate")}>{dateHeure(v.dateVente)}</td>
                    <td className="td-strong td-main" data-label={t("fc.colClient")}>
                      {v.clientNom}
                    </td>
                    <td data-label={t("fc.colProduit")}>{v.produit}</td>
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
