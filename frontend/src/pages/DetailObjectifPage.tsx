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

function cleMois(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Activité commerciale détaillée.
 *
 * Un seul chiffre porte la page : le taux de complétion de l'engagement. Tout
 * le reste l'explique, dans cet ordre, ce qui a été fait, à quel rythme, sur
 * quoi et avec qui.
 *
 * Les intitulés ne sont pas commentés. Un tableau qui s'appelle « Produits »
 * n'a pas besoin qu'on écrive en dessous qu'il classe les produits : la glose
 * sous chaque titre alourdit la lecture sans rien apprendre.
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

  function libelleFenetre(act: Activite) {
    const d = new Date(act.debut);
    if (act.periode === "MOIS") return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
    if (act.periode === "TRIMESTRE")
      return t("ag.trimestreN", { n: Math.floor(d.getMonth() / 3) + 1, annee: d.getFullYear() });
    if (act.periode === "SEMESTRE")
      return t("ag.semestreN", { n: d.getMonth() < 6 ? 1 : 2, annee: d.getFullYear() });
    return String(d.getFullYear());
  }

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("co.detailObjectifTitre")}</h1>
      </div>
      <div className="head-actions">
        <div className="segmente" role="group" aria-label={t("ag.granularite")}>
          {PERIODES_ACTIVITE.map((p) => (
            <button
              key={p}
              type="button"
              className={p === periode ? "on" : undefined}
              onClick={() => setPeriode(p)}
              aria-pressed={p === periode}
            >
              {t(`periode.${p}` as CleTraduction)}
            </button>
          ))}
        </div>
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
          <div className="panneau panneau-vide">{t("commun.chargementDonnees")}</div>
        )}
      </>
    );
  }

  const cible = a.objectif?.cibleCaXAF ?? null;
  const completion = cible && cible > 0 ? Math.round((a.courant.ca / cible) * 100) : null;
  const reste = cible === null ? null : Math.max(0, cible - a.courant.ca);

  const debut = new Date(a.debut);
  const fin = new Date(a.fin);
  const moisTotal = Math.max(
    1,
    (fin.getFullYear() - debut.getFullYear()) * 12 + fin.getMonth() - debut.getMonth()
  );
  const moisEcoules = Math.min(moisTotal, Math.max(1, a.parMois.filter((m) => m.mois <= cleMois(new Date())).length));
  const moisRestants = Math.max(1, moisTotal - moisEcoules + 1);
  const rythmeNecessaire = reste === null ? null : Math.round(reste / moisRestants);
  const rythmeTenu = Math.round(a.courant.ca / moisEcoules);
  /* En avance quand le chiffre devance le calendrier. La marge de 5 points
     évite de qualifier d'échec un écart insignifiant. */
  const dansLesTemps = (completion ?? 0) + 5 >= a.partEcoulee;

  /** Une tuile : intitulé, valeur, et son écart à la période précédente. */
  function Tuile({
    libelle,
    valeur,
    titre,
    delta,
  }: {
    libelle: string;
    valeur: string;
    titre?: string;
    delta?: number | null;
  }) {
    return (
      <div className="tuile">
        <span className="tuile-libelle">{libelle}</span>
        <strong className="tuile-valeur" title={titre}>
          {valeur}
        </strong>
        {delta !== undefined &&
          (delta === null ? (
            <span className="tuile-delta neutre">{t("co.sansComparaison")}</span>
          ) : (
            <span className={`tuile-delta${delta >= 0 ? " hausse" : " baisse"}`}>
              {delta >= 0 ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />}
              {delta >= 0 ? "+" : ""}
              {nombre(delta)}%
            </span>
          ))}
      </div>
    );
  }

  /** Un tableau classé : rang, libellé, part en fond de ligne, montant. */
  function Classement({
    titre,
    lignes,
    total,
    lien,
  }: {
    titre: string;
    lignes: { nom: string; ca: number; nbVentes: number }[];
    total: number;
    lien?: string;
  }) {
    if (lignes.length === 0) {
      return (
        <section className="panneau">
          <header className="panneau-tete">
            <h2>{titre}</h2>
          </header>
          <p className="panneau-vide">{t("co.aucuneVente")}</p>
        </section>
      );
    }
    const tete = lignes.slice(0, 7);
    const reste = lignes.slice(7);
    const cumulReste = reste.reduce((s, l) => s + l.ca, 0);

    return (
      <section className="panneau">
        <header className="panneau-tete">
          <h2>{titre}</h2>
          {lien && (
            <Link to={lien} className="panneau-lien">
              {t("co.detailToutesVentes")}
              <IconArrowRight size={14} />
            </Link>
          )}
        </header>
        <table className="rangs">
          <tbody>
            {tete.map((l, i) => {
              const part = total > 0 ? (l.ca / total) * 100 : 0;
              return (
                <tr key={l.nom}>
                  <td className="rang-num">{i + 1}</td>
                  <td className="rang-nom">
                    {/* La part est peinte en fond de ligne plutôt qu'en barre
                        séparée : la longueur se compare, et la ligne reste
                        une ligne de tableau. */}
                    <span className="rang-fond" style={{ width: `${part}%` }} aria-hidden />
                    <span className="rang-texte" title={l.nom}>
                      {l.nom}
                    </span>
                  </td>
                  <td className="rang-chiffre">{nombre(l.nbVentes)}</td>
                  <td className="rang-chiffre rang-montant" title={montant(l.ca)}>
                    {montantCompact(l.ca)}
                  </td>
                  <td className="rang-part">{nombre(Math.round(part))}%</td>
                </tr>
              );
            })}
            {reste.length > 0 && (
              <tr className="rang-reste">
                <td />
                <td className="rang-nom">
                  <span className="rang-texte">{t("co.autresN", { n: nombre(reste.length) })}</span>
                </td>
                <td className="rang-chiffre">{nombre(reste.reduce((s, l) => s + l.nbVentes, 0))}</td>
                <td className="rang-chiffre rang-montant">{montantCompact(cumulReste)}</td>
                <td className="rang-part">{nombre(Math.round(total > 0 ? (cumulReste / total) * 100 : 0))}%</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    );
  }

  const concentration =
    a.parClient.length >= 3 && a.courant.ca > 0
      ? Math.round((a.parClient.slice(0, 3).reduce((s, c) => s + c.ca, 0) / a.courant.ca) * 100)
      : null;

  return (
    <>
      {entete}

      {erreur && (
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      )}

      {/* Le chiffre qui porte la page, et lui seul. */}
      {cible === null ? (
        <section className="panneau">
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
        </section>
      ) : (
        <section className="panneau heros">
          <div className="heros-haut">
            <div className="heros-principal">
              <span className="heros-contexte">
                {libelleFenetre(a)}
                {a.objectif?.titre ? ` · ${a.objectif.titre}` : ""}
              </span>
              <span className="heros-chiffre">{nombre(completion ?? 0)}%</span>
              <span className="heros-appui">
                {t("co.realiseSurCible", { realise: montant(a.courant.ca), cible: montant(cible) })}
              </span>
            </div>
            <span className={`etat ${dansLesTemps ? "etat-bon" : "etat-alerte"}`}>
              {dansLesTemps ? t("ag.etat.en-ligne") : t("ag.etat.en-retard")}
            </span>
          </div>

          {/* Jauge : la piste est un pas clair de la même teinte, et le repère
              du temps écoulé transforme le taux en jugement. */}
          <div className="mesure">
            <span className={`mesure-remplie${dansLesTemps ? "" : " alerte"}`} style={{ width: `${Math.min(100, completion ?? 0)}%` }} />
            <span className="mesure-seuil" style={{ left: `${a.partEcoulee}%` }} />
          </div>
          <div className="mesure-pied">
            <span>{t("co.tempsEcouleSeuil", { pct: a.partEcoulee })}</span>
            <span>{t("co.resteN", { montant: montantCompact(reste ?? 0) })}</span>
          </div>

          <dl className="heros-rythme">
            <div>
              <dt>{t("co.detailRythmeNecessaire")}</dt>
              <dd>{montant(rythmeNecessaire ?? 0)}</dd>
            </div>
            <div>
              <dt>{t("co.detailRythmeActuel")}</dt>
              <dd className={rythmeTenu < (rythmeNecessaire ?? 0) ? "en-deca" : undefined}>{montant(rythmeTenu)}</dd>
            </div>
            <div>
              <dt>{t("co.detailMoisRestants")}</dt>
              <dd>{nombre(moisRestants)}</dd>
            </div>
          </dl>
        </section>
      )}

      {/* Les chiffres de la période. */}
      <section className="panneau">
        <header className="panneau-tete">
          <h2>{t("co.performance")}</h2>
          {/* Une phrase par granularité plutôt qu'une interpolation : « au
              année précédent » n'est pas du français. */}
          <span className="panneau-note">{t(`co.compare.${a.periode}` as CleTraduction)}</span>
        </header>
        <div className="tuiles">
          <Tuile
            libelle={t("co.ca")}
            valeur={montantCompact(a.courant.ca)}
            titre={montant(a.courant.ca)}
            delta={evolution(a.courant.ca, a.precedent.ca)}
          />
          <Tuile
            libelle={t("cm.colBenefice")}
            valeur={montantCompact(a.courant.benefice)}
            titre={montant(a.courant.benefice)}
            delta={evolution(a.courant.benefice, a.precedent.benefice)}
          />
          <Tuile
            libelle={t("co.detailMaMarge")}
            valeur={a.courant.margePct === null ? "—" : `${nombre(a.courant.margePct)}%`}
            delta={
              a.courant.margePct === null || a.precedent.margePct === null
                ? null
                : a.courant.margePct - a.precedent.margePct
            }
          />
          <Tuile
            libelle={t("cm.colVentes")}
            valeur={nombre(a.courant.nbVentes)}
            delta={evolution(a.courant.nbVentes, a.precedent.nbVentes)}
          />
          <Tuile
            libelle={t("co.detailPanier")}
            valeur={montantCompact(a.courant.panierMoyen)}
            titre={montant(a.courant.panierMoyen)}
            delta={evolution(a.courant.panierMoyen, a.precedent.panierMoyen)}
          />
          <Tuile libelle={t("co.detailClientsServis")} valeur={nombre(a.courant.nbClients)} />
          <Tuile
            libelle={t("co.commissions")}
            valeur={montantCompact(a.courant.commissions)}
            titre={montant(a.courant.commissions)}
          />
        </div>
      </section>

      {/* L'évolution. */}
      <section className="panneau">
        <header className="panneau-tete">
          <h2>{t("co.evolution")}</h2>
        </header>
        {a.parMois.length === 0 ? (
          <p className="panneau-vide">{t("co.aucuneVente")}</p>
        ) : (
          <CourbeEvolution
            points={a.parMois.map((p) => ({
              ...p,
              libelle: new Date(`${p.mois}-01T00:00:00`).toLocaleDateString(locale, { month: "short" }),
            }))}
          />
        )}
      </section>

      <div className="deux-colonnes">
        <Classement
          titre={t("co.produits")}
          lignes={a.parProduit.map((p) => ({ nom: p.produit, ca: p.ca, nbVentes: p.nbVentes }))}
          total={a.courant.ca}
        />
        <Classement
          titre={t("co.clients")}
          lignes={a.parClient.map((c) => ({ nom: c.nom, ca: c.ca, nbVentes: c.nbVentes }))}
          total={a.courant.ca}
        />
      </div>

      {/* La concentration ne se voit pas dans un classement trié : elle se
          dit, une fois, sous les deux tableaux. */}
      {concentration !== null && (
        <p className="remarque">{t("co.detailConcentration", { pct: nombre(concentration) })}</p>
      )}

      {/* Les dernières ventes. */}
      <section className="panneau">
        <header className="panneau-tete">
          <h2>{t("co.detailDernieresTitre")}</h2>
          <Link to="/ventes" className="panneau-lien">
            {t("co.detailToutesVentes")}
            <IconArrowRight size={14} />
          </Link>
        </header>

        {a.dernieresVentes.length === 0 ? (
          <p className="panneau-vide">{t("ve.listeVideTexte")}</p>
        ) : (
          <div className="table-scroll">
            <table className="table-nue">
              <thead>
                <tr>
                  <th>{t("fc.colDate")}</th>
                  <th>{t("fc.colClient")}</th>
                  <th>{t("fc.colProduit")}</th>
                  <th className="num">{t("fc.colMontant")}</th>
                  <th className="num">{t("fc.colBenefice")}</th>
                  <th className="num">{t("fc.colCommission")}</th>
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
                    <td className="num" data-label={t("fc.colBenefice")} title={montant(v.benefice)}>
                      {montantCompact(v.benefice)}
                    </td>
                    <td className="num" data-label={t("fc.colCommission")}>
                      {v.commission === null ? (
                        "—"
                      ) : (
                        <span title={montant(v.commission)}>
                          {montantCompact(v.commission)}
                          {!v.commissionVerseeLe && <span className="point-attente" title={t("co.due")} />}
                        </span>
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
