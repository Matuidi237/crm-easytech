import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TableauCommercial, fetchTableauCommercial } from "../api";
import { useLangue } from "../i18n";
import { useFilAriane } from "../ContexteEntete";
import { CourbeEvolution } from "../components/Charts";
import { IconAlert, IconArrowRight, IconInbox } from "../components/Icons";

/**
 * Détail de l'objectif annuel.
 *
 * La carte du tableau de bord donne un taux ; cette page dit de quoi il est
 * fait. Un chiffre de complétion qu'on ne peut pas décomposer ne se discute
 * pas en revue d'activité, il se subit.
 *
 * Le rythme nécessaire pour finir l'année y figure en clair : c'est la seule
 * information qui transforme un constat en décision.
 */
export default function DetailObjectifPage() {
  const { t, nombre, montant, montantCompact, locale } = useLangue();
  const [donnees, setDonnees] = useState<TableauCommercial | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useFilAriane("/", t("co.retourTableau"), t("co.detailObjectifTitre"));

  useEffect(() => {
    fetchTableauCommercial()
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }, []);

  if (erreur) {
    return (
      <div className="alert alert-error">
        <IconAlert />
        {erreur}
      </div>
    );
  }

  if (!donnees) {
    return (
      <div className="card">
        <p className="muted-3" style={{ margin: 0 }}>
          {t("commun.chargementDonnees")}
        </p>
      </div>
    );
  }

  const o = donnees.objectifAnnuel;
  const completionPct = o.cible && o.cible > 0 ? Math.round((o.realise / o.cible) * 100) : null;
  const reste = o.cible === null ? null : Math.max(0, o.cible - o.realise);

  /* Mois restants dans l'année, le mois en cours compris : c'est sur eux que
     se répartit ce qui reste à faire. */
  const moisRestants = Math.max(1, 12 - new Date().getMonth());
  const rythmeNecessaire = reste === null ? null : Math.round(reste / moisRestants);

  /* Rythme tenu jusqu'ici, pour comparer. Le mois en cours est incomplet, il
     compte quand même : l'exclure gonflerait artificiellement la moyenne. */
  const moisEcoules = new Date().getMonth() + 1;
  const rythmeActuel = Math.round(o.realise / moisEcoules);

  /* Seuls les mois de l'année civile : la courbe du tableau de bord glisse sur
     douze mois et mêlerait l'exercice précédent à celui qu'on juge ici. */
  const moisAnnee = donnees.parMois.filter((m) => m.mois.startsWith(String(o.annee)));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("co.detailObjectifTitre")}</h1>
          <div className="page-sub">
            {o.definiParNom
              ? t("co.detailObjectifSousTitre", { annee: o.annee, auteur: o.definiParNom })
              : t("co.detailObjectifSansAuteur", { annee: o.annee })}
          </div>
        </div>
      </div>

      {o.cible === null ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("co.objectifAbsentTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("co.objectifAbsentTexte")}
            </p>
            <Link to="/agenda/objectifs" className="btn btn-primary btn-sm" style={{ marginTop: 6 }}>
              {t("co.allerObjectifs")}
              <IconArrowRight size={14} />
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Le taux, et surtout sa confrontation au temps écoulé. */}
          <div className="card">
            <div className="objectif-entete">
              <div>
                <div className="objectif-taux">{nombre(completionPct ?? 0)}%</div>
                <div className="objectif-legende">
                  {t("co.detailRealiseSur", {
                    realise: montant(o.realise),
                    cible: montant(o.cible),
                  })}
                </div>
              </div>
              <span className={`pill ${(completionPct ?? 0) + 5 >= o.partEcoulee ? "pill-success" : "pill-warn"}`}>
                {(completionPct ?? 0) + 5 >= o.partEcoulee ? t("ag.etat.en-ligne") : t("ag.etat.en-retard")}
              </span>
            </div>

            <div className="cible-rail" style={{ marginTop: 16 }}>
              <span className="cible-barre" style={{ width: `${Math.min(100, completionPct ?? 0)}%` }} />
              {/* Repère du temps consommé : sans lui, un taux ne dit ni bien
                  ni mal. 70 % en octobre et 70 % en mars n'ont rien à voir. */}
              <span
                className="cible-repere"
                style={{ left: `${o.partEcoulee}%` }}
                title={t("ag.repereTemps", { pct: o.partEcoulee })}
              />
            </div>
            <div className="cible-pied">
              <span>{t("co.detailCompletion", { pct: nombre(completionPct ?? 0) })}</span>
              <span className="muted-3">{t("ag.tempsEcoule", { pct: o.partEcoulee })}</span>
            </div>
          </div>

          {/* Ce qu'il reste à faire, et à quel rythme. */}
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">{t("co.detailResteTitre")}</div>
                <div className="card-sub">{t("co.detailResteSousTitre")}</div>
              </div>
            </div>
            <div className="chiffres-cles">
              <div>
                <span className="chiffre-label">{t("co.detailReste")}</span>
                <strong>{montant(reste ?? 0)}</strong>
              </div>
              <div>
                <span className="chiffre-label">{t("co.detailMoisRestants")}</span>
                <strong>{nombre(moisRestants)}</strong>
              </div>
              <div>
                <span className="chiffre-label">{t("co.detailRythmeNecessaire")}</span>
                <strong>{montant(rythmeNecessaire ?? 0)}</strong>
              </div>
              <div>
                <span className="chiffre-label">{t("co.detailRythmeActuel")}</span>
                <strong className={rythmeActuel < (rythmeNecessaire ?? 0) ? "valeur-negative" : ""}>
                  {montant(rythmeActuel)}
                </strong>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("co.detailAnneeTitre", { annee: o.annee })}</div>
            <div className="card-sub">{t("co.detailAnneeSousTitre")}</div>
          </div>
        </div>
        {moisAnnee.length === 0 ? (
          <p className="muted-3" style={{ margin: "14px 0 0", fontSize: 13 }}>
            {t("co.aucuneVente")}
          </p>
        ) : (
          <CourbeEvolution
            points={moisAnnee.map((p) => ({
              ...p,
              libelle: new Date(`${p.mois}-01T00:00:00`).toLocaleDateString(locale, { month: "short" }),
            }))}
          />
        )}
      </div>

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("co.detailMoisTitre")}</div>
            <div className="card-sub">{t("co.detailMoisSousTitre")}</div>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("cm.colMois")}</th>
                <th>{t("cm.colVentes")}</th>
                <th>{t("co.ca")}</th>
                <th>{t("cm.colBenefice")}</th>
                <th>{t("co.detailCumul")}</th>
              </tr>
            </thead>
            <tbody>
              {moisAnnee.map((m, i) => {
                const cumul = moisAnnee.slice(0, i + 1).reduce((s, x) => s + x.ca, 0);
                return (
                  <tr key={m.mois}>
                    <td className="td-strong td-main" data-label={t("cm.colMois")}>
                      {new Date(`${m.mois}-01T00:00:00`).toLocaleDateString(locale, {
                        month: "long",
                        year: "numeric",
                      })}
                    </td>
                    <td className="num" data-label={t("cm.colVentes")}>
                      {nombre(m.nbVentes)}
                    </td>
                    <td className="num" data-label={t("co.ca")} title={montant(m.ca)}>
                      {montantCompact(m.ca)}
                    </td>
                    <td className="num" data-label={t("cm.colBenefice")} title={montant(m.benefice)}>
                      {montantCompact(m.benefice)}
                    </td>
                    {/* Le cumul est la colonne qui compte : c'est lui qu'on
                        compare à l'objectif, pas le mois isolé. */}
                    <td className="num td-strong" data-label={t("co.detailCumul")} title={montant(cumul)}>
                      {montantCompact(cumul)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
