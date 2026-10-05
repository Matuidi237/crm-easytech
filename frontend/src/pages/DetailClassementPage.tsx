import { useEffect, useState } from "react";
import { DetailClassement, fetchDetailClassement } from "../api";
import { useLangue } from "../i18n";
import { useFilAriane } from "../ContexteEntete";
import { IconAlert, IconInbox } from "../components/Icons";

/**
 * Détail du classement.
 *
 * Aucun collègue n'est nommé. Un commercial a le droit de savoir où il se
 * situe et de quoi sa place dépend ; le chiffre d'affaires nominatif des
 * autres relève de l'encadrement, et le publier transformerait un outil de
 * pilotage en tableau d'affichage.
 *
 * Les repères sont donc agrégés : le premier, la moyenne, la médiane. Ils
 * situent sans désigner, et la médiane dit ce que la moyenne cache quand un
 * seul gros contrat la tire vers le haut.
 */
export default function DetailClassementPage() {
  const { t, nombre, rang, montant, montantCompact, locale } = useLangue();
  const [donnees, setDonnees] = useState<DetailClassement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useFilAriane("/", t("co.retourTableau"), t("co.detailClassementTitre"));

  useEffect(() => {
    fetchDetailClassement()
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

  const { moi, equipe } = donnees;
  const ecartPremier = equipe.caPremier - moi.chiffreAffaires;
  const moisClasses = donnees.parMois.filter((m) => m.rang !== null);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("co.detailClassementTitre")}</h1>
          <div className="page-sub">{t("co.detailClassementSousTitre")}</div>
        </div>
      </div>

      {/* Le rang combiné, puis ses deux composantes. La formule est dite en
          clair : un classement qu'on ne peut pas refaire de tête se conteste
          de travers. */}
      <div className="card">
        <div className="objectif-entete">
          <div>
            <div className="objectif-taux">
              {donnees.rang ? t("co.rangSur", { rang: rang(donnees.rang), n: donnees.effectif }) : "-"}
            </div>
            <div className="objectif-legende">{t("co.detailClassementFormule")}</div>
          </div>
        </div>

        <div className="chiffres-cles" style={{ marginTop: 16 }}>
          <div>
            <span className="chiffre-label">{t("co.detailRangCa")}</span>
            <strong>{donnees.rangChiffreAffaires ? rang(donnees.rangChiffreAffaires) : "-"}</strong>
          </div>
          <div>
            <span className="chiffre-label">{t("co.detailRangMarge")}</span>
            <strong>{donnees.rangRentabilite ? rang(donnees.rangRentabilite) : "-"}</strong>
          </div>
          <div>
            <span className="chiffre-label">{t("co.detailMonCa")}</span>
            <strong>{montantCompact(moi.chiffreAffaires)}</strong>
          </div>
          <div>
            <span className="chiffre-label">{t("co.detailMaMarge")}</span>
            <strong>{moi.margePct === null ? "-" : `${nombre(moi.margePct)}%`}</strong>
          </div>
        </div>
      </div>

      {/* Repères d'équipe, anonymes. */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("co.detailReperesTitre")}</div>
            <div className="card-sub">{t("co.detailReperesSousTitre")}</div>
          </div>
        </div>

        <ul className="reperes">
          {[
            { cle: "premier", valeur: equipe.caPremier, libelle: t("co.detailPremier") },
            { cle: "moyen", valeur: equipe.caMoyen, libelle: t("co.detailMoyenne") },
            { cle: "median", valeur: equipe.caMedian, libelle: t("co.detailMediane") },
            { cle: "moi", valeur: moi.chiffreAffaires, libelle: t("co.detailVous") },
          ]
            .sort((a, b) => b.valeur - a.valeur)
            .map((r) => (
              <li key={r.cle} className={`repere-ligne${r.cle === "moi" ? " moi" : ""}`}>
                <span className="repere-nom">{r.libelle}</span>
                <span className="repere-rail">
                  <span
                    className="repere-barre"
                    style={{ width: `${equipe.caPremier > 0 ? (r.valeur / equipe.caPremier) * 100 : 0}%` }}
                  />
                </span>
                <span className="repere-valeur" title={montant(r.valeur)}>
                  {montantCompact(r.valeur)}
                </span>
              </li>
            ))}
        </ul>

        <p className="objectif-note">
          {ecartPremier > 0
            ? t("co.detailEcartPremier", { montant: montant(ecartPremier) })
            : t("co.detailVousEtesPremier")}
        </p>
      </div>

      {/* Tendance : une place isolée ne dit pas si l'on monte ou si l'on
          décroche, et c'est la trajectoire qui se discute en revue. */}
      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("co.detailTendanceTitre")}</div>
            <div className="card-sub">{t("co.detailTendanceSousTitre")}</div>
          </div>
        </div>

        {moisClasses.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("co.historiqueVideTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("co.detailTendanceVide")}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("cm.colMois")}</th>
                  <th>{t("co.ca")}</th>
                  <th>{t("co.detailRangDuMois")}</th>
                </tr>
              </thead>
              <tbody>
                {donnees.parMois.map((m) => (
                  <tr key={m.mois}>
                    <td className="td-strong td-main" data-label={t("cm.colMois")}>
                      {new Date(`${m.mois}-01T00:00:00`).toLocaleDateString(locale, {
                        month: "long",
                        year: "numeric",
                      })}
                    </td>
                    <td className="num" data-label={t("co.ca")} title={montant(m.ca)}>
                      {m.ca > 0 ? montantCompact(m.ca) : <span className="muted-3">-</span>}
                    </td>
                    <td data-label={t("co.detailRangDuMois")}>
                      {/* Null quand on n'a rien vendu : se voir « dernier »
                          parce qu'on était en congé n'apprend rien. */}
                      {m.rang === null ? (
                        <span className="muted-3">{t("co.detailSansVente")}</span>
                      ) : (
                        <span className={`pill ${m.rang <= 3 ? "pill-success" : "pill-neutral"}`}>
                          {t("co.rangSur", { rang: rang(m.rang), n: m.classes })}
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
    </>
  );
}
