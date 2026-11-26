import { useEffect, useMemo, useState } from "react";
import { PilotageCommercial, fetchPilotageCommercial } from "../api";
import { useAuth } from "../AuthContext";
import { useLangue } from "../i18n";
import { IconAlert, IconBell, IconSearch } from "../components/Icons";

/**
 * Aperçu d'une autre peau d'interface.
 *
 * Page de démonstration, volontairement hors de l'application : aucune entrée
 * de menu n'y mène, elle ne s'atteint qu'en tapant son adresse. Tout son style
 * est préfixé « ap- » et ne touche rien d'autre, ce qui permet de juger un
 * parti pris visuel sans mettre en jeu les vingt-cinq écrans en service.
 *
 * Les données sont réelles, celles du pilotage commercial. Une maquette
 * remplie de « Project A1 » et de « Lorem » ne dit pas si une interface tient
 * debout : ce sont les noms longs, les montants à sept chiffres et les
 * valeurs manquantes qui la cassent.
 */
export default function ApercuUIPage() {
  const { t, nombre, montant, montantCompact, locale } = useLangue();
  const { utilisateur } = useAuth();
  const [d, setD] = useState<PilotageCommercial | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetchPilotageCommercial()
      .then(setD)
      .catch((e) => setErreur(e.message));
  }, []);

  const mois = useMemo(
    () =>
      (d?.parMois ?? []).map((m) => ({
        ...m,
        libelle: new Date(`${m.mois}-01T00:00:00`).toLocaleDateString(locale, { month: "short" }),
      })),
    [d, locale]
  );

  if (erreur) {
    return (
      <div className="ap-page">
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      </div>
    );
  }

  if (!d) {
    return (
      <div className="ap-page">
        <p className="ap-vide">{t("commun.chargementDonnees")}</p>
      </div>
    );
  }

  const cartes = [
    {
      cle: "ca",
      label: t("rc.caAnnee", { annee: d.objectif.annee }),
      valeur: montantCompact(d.objectif.realise),
      titre: montant(d.objectif.realise),
      delta: d.mois.variationPct,
      serie: mois.map((m) => m.ca),
    },
    {
      cle: "portefeuille",
      label: t("rc.portefeuille"),
      valeur: nombre(d.portefeuille.total),
      delta: null,
      serie: mois.map((m) => m.nbVentes),
    },
    {
      cle: "objectif",
      label: t("rc.objectifContexte", { annee: d.objectif.annee }),
      valeur: d.objectif.atteintePct === null ? "-" : `${nombre(d.objectif.atteintePct)}%`,
      delta: d.objectif.atteintePct === null ? null : d.objectif.atteintePct - d.objectif.partEcoulee,
      serie: mois.map((m) => m.ca),
    },
    {
      cle: "concentration",
      label: t("rc.concentration"),
      valeur:
        d.concentration.partTetePct === null ? "-" : `${nombre(d.concentration.partTetePct)}%`,
      delta: null,
      serie: d.concentration.tete.slice(0, 12).map((c) => c.ca),
    },
  ];

  return (
    <div className="ap-page">
      <div className="ap-cadre">
        {/* La barre latérale translucide de la maquette. Reproduite pour le
            rendu, elle ne navigue nulle part : cette page est un aperçu. */}
        <aside className="ap-rail">
          <div className="ap-marque">
            <span className="ap-logo">N</span>
            <span>
              <strong>EASYTECH</strong>
              <em>ERP</em>
            </span>
          </div>
          <nav className="ap-nav">
            {[
              t("nav.dashboard"),
              t("rc.equipeTitre"),
              t("nav.clients"),
              t("nav.cotations"),
              t("nav.calendrier"),
            ].map((n, i) => (
              <span className={`ap-nav-item${i === 0 ? " actif" : ""}`} key={n}>
                <span className="ap-nav-puce" />
                {n}
              </span>
            ))}
          </nav>
        </aside>

        <main className="ap-corps">
          <header className="ap-tete">
            <h1>{t("nav.dashboard")}</h1>
            <div className="ap-outils">
              <span className="ap-recherche">
                <IconSearch size={15} />
                {t("rc.apercuRecherche")}
              </span>
              <span className="ap-cloche">
                <IconBell size={16} />
                <i />
              </span>
              <span className="ap-avatar">
                {(utilisateur?.nomComplet ?? "?").slice(0, 1).toUpperCase()}
              </span>
            </div>
          </header>

          <div className="ap-cartes">
            {cartes.map((c) => (
              <div className="ap-carte" key={c.cle}>
                <div className="ap-carte-haut">
                  <span className="ap-carte-label">{c.label}</span>
                  {c.delta !== null && (
                    <span className={`ap-delta ${c.delta >= 0 ? "hausse" : "baisse"}`}>
                      {c.delta >= 0 ? "▲" : "▼"} {nombre(Math.abs(c.delta))}%
                    </span>
                  )}
                </div>
                <div className="ap-carte-valeur" data-long={c.valeur.length > 7} title={c.titre}>
                  {c.valeur}
                </div>
                <Mini serie={c.serie} />
              </div>
            ))}
          </div>

          <section className="ap-bloc">
            <div className="ap-bloc-tete">
              <h2>{t("rc.apercuCourbe")}</h2>
              <span className="ap-select">{t("rc.apercuDouzeMois")}</span>
            </div>
            <Aire points={mois} montantCompact={montantCompact} />
          </section>

          <div className="ap-bas">
            <section className="ap-bloc">
              <div className="ap-bloc-tete">
                <h2>{t("rc.equipeTitre")}</h2>
                <span className="ap-select">{t("rc.apercuTousPays")}</span>
              </div>
              <table className="ap-table">
                <thead>
                  <tr>
                    <th>{t("rc.colCommercial")}</th>
                    <th>{t("rc.colPays")}</th>
                    <th>{t("rc.colAtteinte")}</th>
                    <th className="num">{t("rc.colCa")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.commerciaux.slice(0, 5).map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="ap-ligne-qui">
                          <span className="ap-mini-avatar">
                            {c.nomComplet.slice(0, 1).toUpperCase()}
                          </span>
                          {c.nomComplet}
                        </span>
                      </td>
                      <td className="ap-discret">{c.pays ?? t("rc.paysInconnu")}</td>
                      <td>
                        {c.atteintePct === null ? (
                          <span className="ap-etat neutre">{t("rc.aFixer")}</span>
                        ) : (
                          <span
                            className={`ap-etat ${
                              c.atteintePct >= d.objectif.partEcoulee ? "bon" : "alerte"
                            }`}
                          >
                            {nombre(c.atteintePct)}%
                          </span>
                        )}
                      </td>
                      <td className="num" title={montant(c.chiffreAffaires)}>
                        {montantCompact(c.chiffreAffaires)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="ap-bloc">
              <div className="ap-bloc-tete">
                <h2>{t("rc.apercuMarches")}</h2>
              </div>
              <Anneau
                /* Les marches sous 1 % sont ecartes : une part invisible
                   dans l anneau mais listee en legende a « 0 % » se lit
                   comme une erreur de calcul. */
                parts={d.portefeuille.parPays
                  .filter(
                    (p) =>
                      p.ca > 0 &&
                      p.ca / d.portefeuille.parPays.reduce((s, x) => s + x.ca, 0) >= 0.01
                  )
                  .slice(0, 4)
                  .map((p) => ({ label: p.pays ?? t("rc.paysInconnu"), valeur: p.ca }))}
              />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * La courbe de tendance des cartes.
 *
 * Sans axe ni valeur : elle ne se lit pas, elle se reconnaît. C'est la seule
 * chose de la maquette que l'outil n'a pas aujourd'hui, et son apport est
 * réel : un même chiffre n'appelle pas la même réaction selon qu'il monte ou
 * qu'il redescend.
 */
function Mini({ serie }: { serie: number[] }) {
  if (serie.length < 2) return <div className="ap-mini" />;
  const max = Math.max(...serie);
  const min = Math.min(...serie);
  const amplitude = max - min || 1;
  const pas = 100 / (serie.length - 1);
  const points = serie
    .map((v, i) => `${(i * pas).toFixed(2)},${(26 - ((v - min) / amplitude) * 24).toFixed(2)}`)
    .join(" ");
  return (
    <svg className="ap-mini" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** La grande aire, avec son dégradé et ses repères de mois. */
function Aire({
  points,
  montantCompact,
}: {
  points: { mois: string; libelle: string; ca: number }[];
  montantCompact: (n: number) => string;
}) {
  if (points.length < 2) return null;
  const max = Math.max(1, ...points.map((p) => p.ca));
  const pas = 100 / (points.length - 1);
  const xy = points.map((p, i) => ({
    x: i * pas,
    y: 60 - (p.ca / max) * 52,
    ...p,
  }));
  const ligne = xy.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  /* Le plus haut point porte son montant, les autres non : une valeur sur
     chaque point rend la courbe illisible, et c'est le sommet qu'on cherche. */
  const sommet = xy.reduce((a, b) => (b.ca > a.ca ? b : a));

  return (
    <div className="ap-aire">
      <svg viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="ap-degrade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ap-trait)" stopOpacity="0.26" />
            <stop offset="100%" stopColor="var(--ap-trait)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,64 ${ligne} 100,64`} fill="url(#ap-degrade)" />
        <polyline points={ligne} fill="none" stroke="var(--ap-trait)" strokeWidth="1.1" />
      </svg>
      <span className="ap-sommet" style={{ left: `${sommet.x}%` }}>
        {montantCompact(sommet.ca)}
      </span>
      <div className="ap-mois">
        {points.map((p) => (
          <span key={p.mois}>{p.libelle}</span>
        ))}
      </div>
    </div>
  );
}

/** L'anneau de répartition, et sa légende. */
function Anneau({ parts }: { parts: { label: string; valeur: number }[] }) {
  const total = parts.reduce((s, p) => s + p.valeur, 0);
  if (total === 0) return null;
  const rayon = 54;
  const perimetre = 2 * Math.PI * rayon;
  let depart = 0;

  return (
    <div className="ap-anneau">
      <svg viewBox="0 0 140 140" aria-hidden="true">
        {parts.map((p, i) => {
          const part = p.valeur / total;
          const dash = `${(part * perimetre).toFixed(2)} ${perimetre.toFixed(2)}`;
          const decalage = -depart * perimetre;
          depart += part;
          return (
            <circle
              key={p.label}
              cx="70"
              cy="70"
              r={rayon}
              fill="none"
              strokeWidth="18"
              stroke={`var(--viz-${i + 1})`}
              strokeDasharray={dash}
              strokeDashoffset={decalage}
              transform="rotate(-90 70 70)"
            />
          );
        })}
      </svg>
      <ul className="ap-legende">
        {parts.map((p, i) => (
          <li key={p.label}>
            <i style={{ background: `var(--viz-${i + 1})` }} />
            {p.label}
            <b>{Math.round((p.valeur / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
