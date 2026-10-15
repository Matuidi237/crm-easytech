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
 *
 * Un seul chiffre porte la page, le rang ; le reste l'explique.
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

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("co.detailClassementTitre")}</h1>
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
        <div className="panneau panneau-vide">{t("commun.chargementDonnees")}</div>
      </>
    );
  }

  const { moi, equipe } = donnees;
  const ecartPremier = equipe.caPremier - moi.chiffreAffaires;
  const moisClasses = donnees.parMois.filter((m) => m.rang !== null);
  /* Le premier tiers de l'effectif : un rang se juge relativement à la taille
     de l'équipe, troisième sur quatre n'est pas troisième sur vingt. */
  const dansLeHaut = donnees.rang !== null && donnees.rang <= Math.max(1, Math.ceil(donnees.effectif / 3));
  const partDuPremier = equipe.caPremier > 0 ? (moi.chiffreAffaires / equipe.caPremier) * 100 : 0;

  const reperes = [
    { cle: "premier", valeur: equipe.caPremier, libelle: t("co.detailPremier") },
    { cle: "moyen", valeur: equipe.caMoyen, libelle: t("co.detailMoyenne") },
    { cle: "median", valeur: equipe.caMedian, libelle: t("co.detailMediane") },
    { cle: "moi", valeur: moi.chiffreAffaires, libelle: t("co.detailVous") },
  ].sort((a, b) => b.valeur - a.valeur);
  const maxRepere = Math.max(...reperes.map((r) => r.valeur), 1);
  const maxMois = Math.max(...donnees.parMois.map((m) => m.ca), 1);

  return (
    <>
      {entete}

      {/* Le rang, et lui seul. La jauge le traduit en distance au premier :
          une place ne dit pas si l'on joue à un contrat près ou au double. */}
      <section className="panneau heros">
        <div className="heros-haut">
          <div className="heros-principal">
            <span className="heros-contexte">{t("co.detailClassementFormule")}</span>
            <span className="heros-chiffre">{donnees.rang ? rang(donnees.rang) : "—"}</span>
            <span className="heros-appui">{t("co.surNCommerciaux", { n: nombre(donnees.effectif) })}</span>
          </div>
          {donnees.rang !== null && (
            <span className={`etat ${dansLeHaut ? "etat-bon" : "etat-alerte"}`}>
              {ecartPremier > 0
                ? t("co.ecartAuPremier", { montant: montantCompact(ecartPremier) })
                : t("co.detailVousEtesPremier")}
            </span>
          )}
        </div>

        <div className="mesure">
          <span
            className={`mesure-remplie${dansLeHaut ? "" : " alerte"}`}
            style={{ width: `${Math.min(100, partDuPremier)}%` }}
          />
        </div>
        <div className="mesure-pied">
          <span title={montant(moi.chiffreAffaires)}>{montantCompact(moi.chiffreAffaires)}</span>
          <span title={montant(equipe.caPremier)}>
            {t("co.detailPremier")} · {montantCompact(equipe.caPremier)}
          </span>
        </div>

        <dl className="heros-rythme">
          <div>
            <dt>{t("co.detailRangCa")}</dt>
            <dd>{donnees.rangChiffreAffaires ? rang(donnees.rangChiffreAffaires) : "—"}</dd>
          </div>
          <div>
            <dt>{t("co.detailRangMarge")}</dt>
            <dd>{donnees.rangRentabilite ? rang(donnees.rangRentabilite) : "—"}</dd>
          </div>
          <div>
            <dt>{t("co.detailMaMarge")}</dt>
            <dd>{moi.margePct === null ? "—" : `${nombre(moi.margePct)}%`}</dd>
          </div>
        </dl>
      </section>

      {/* Repères d'équipe, anonymes. */}
      <section className="panneau">
        <header className="panneau-tete">
          <h2>{t("co.detailReperesTitre")}</h2>
        </header>
        <table className="rangs">
          <tbody>
            {reperes.map((r, i) => (
              <tr key={r.cle}>
                <td className="rang-num">{i + 1}</td>
                <td className="rang-nom">
                  <span
                    className="rang-fond"
                    style={{ width: `${(r.valeur / maxRepere) * 100}%` }}
                    aria-hidden
                  />
                  <span className="rang-texte">
                    {r.cle === "moi" ? <strong>{r.libelle}</strong> : r.libelle}
                  </span>
                </td>
                <td className="rang-chiffre rang-montant" title={montant(r.valeur)}>
                  {montantCompact(r.valeur)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* La trajectoire. Un rang isolé ne dit pas si l'on monte ou si l'on
          décroche, et c'est la trajectoire qui se discute en revue. */}
      <section className="panneau">
        <header className="panneau-tete">
          <h2>{t("co.detailTendanceTitre")}</h2>
        </header>

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
            <table className="table-nue">
              <thead>
                <tr>
                  <th>{t("cm.colMois")}</th>
                  <th>{t("co.ca")}</th>
                  <th className="num">{t("co.detailRangDuMois")}</th>
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
                    {/* Le montant est porté par la longueur et par le chiffre :
                        douze lignes se comparent d'un regard, pas en lisant. */}
                    <td className="rang-nom" data-label={t("co.ca")} title={montant(m.ca)}>
                      <span className="rang-fond" style={{ width: `${(m.ca / maxMois) * 100}%` }} aria-hidden />
                      <span className="rang-texte">{m.ca > 0 ? montantCompact(m.ca) : "—"}</span>
                    </td>
                    <td className="num" data-label={t("co.detailRangDuMois")}>
                      {/* Null quand on n'a rien vendu : se voir « dernier »
                          parce qu'on était en congé n'apprend rien. */}
                      {m.rang === null ? (
                        <span className="muted-3">{t("co.detailSansVente")}</span>
                      ) : (
                        t("co.rangSur", { rang: rang(m.rang), n: m.classes })
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
