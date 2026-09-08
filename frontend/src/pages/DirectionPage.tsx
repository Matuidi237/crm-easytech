import { ComponentType, useEffect, useState } from "react";
import {
  AnalysesDirection,
  DimensionCa,
  DimensionTop,
  IndicateursDirection,
  fetchAnalysesDirection,
  fetchIndicateursDirection,
} from "../api";
import { useAuth } from "../AuthContext";
import { useLangue, type CleTraduction } from "../i18n";
import { DonutInteractif, EvolutionMensuelle, Jauge, TopProduits } from "../components/Charts";
import {
  IconAlert,
  IconArrowDown,
  IconArrowUp,
  IconAward,
  IconBox,
  IconCoins,
  IconInbox,
  IconTrend,
} from "../components/Icons";

/* Dimensions offertes par chaque encart. La première est celle qui s'affiche
   à l'ouverture : le pays pour le chiffre d'affaires, le commercial pour les
   produits. */
const DIMS_CA: DimensionCa[] = ["pays", "secteur", "commercial", "produit"];
const DIMS_TOP: DimensionTop[] = ["commercial", "pays", "secteur"];

/* Un donut cesse d'être lisible au-delà de six parts : les voisines deviennent
   impossibles à comparer. La traîne se replie donc en « Autres ». La vue en
   barres, elle, n'a pas cette limite et garde les huit lignes. */
const MAX_PARTS = 6;

type PartDonut = { label: string; valeur: number; valeurCourte: string; detail: string };

/** Replie tout ce qui dépasse la lisibilité du donut en une part « Autres ». */
function replierParts(
  parts: PartDonut[],
  libelleReste: string,
  formater: (n: number) => string,
  detailReste: (n: number) => string
): PartDonut[] {
  if (parts.length <= MAX_PARTS) return parts;
  const tete = parts.slice(0, MAX_PARTS - 1);
  const reste = parts.slice(MAX_PARTS - 1).reduce((s, p) => s + p.valeur, 0);
  return [
    ...tete,
    { label: libelleReste, valeur: reste, valeurCourte: formater(reste), detail: detailReste(reste) },
  ];
}

function SelecteurDimension<T extends string>({
  dimensions,
  active,
  onChange,
  libelle,
  etiquette,
}: {
  dimensions: readonly T[];
  active: T;
  onChange: (d: T) => void;
  libelle: (d: T) => string;
  etiquette: string;
}) {
  return (
    <div className="dim-switch" role="group" aria-label={etiquette}>
      {dimensions.map((d) => (
        <button
          key={d}
          type="button"
          className={`dim-opt${d === active ? " on" : ""}`}
          onClick={() => onChange(d)}
          aria-pressed={d === active}
        >
          {libelle(d)}
        </button>
      ))}
    </div>
  );
}

type Carte = {
  label: string;
  valeur: string;
  /** Vrai pour un nom : le corps prévu pour des chiffres serait trop grand. */
  valeurTexte?: boolean;
  note: string;
  icone: ComponentType<{ size?: number }>;
  fg: string;
  bg: string;
  /** Variation mois à mois. null = aucune base de comparaison. */
  variationPct?: number | null;
  /** Jauge circulaire, quand un pourcentage double utilement le chiffre. */
  jauge?: { valeurPct: number; couleur: string };
};

/** Puce de variation. La flèche double la couleur, elle ne la remplace pas. */
function Delta({ pct, libelle, libelleAbsent }: { pct: number | null | undefined; libelle: string; libelleAbsent: string }) {
  if (pct === null || pct === undefined) {
    return <span className="delta delta-neutre">{libelleAbsent}</span>;
  }
  const hausse = pct >= 0;
  return (
    <span className={`delta ${hausse ? "delta-hausse" : "delta-baisse"}`}>
      {hausse ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />}
      {hausse ? "+" : ""}
      {pct}% <span className="delta-libelle">{libelle}</span>
    </span>
  );
}

function CarteIndicateur({
  label,
  valeur,
  valeurTexte,
  note,
  icone: Icone,
  fg,
  bg,
  variationPct,
  jauge,
  libelleVariation,
  libelleSansVariation,
}: Carte & { libelleVariation: string; libelleSansVariation: string }) {
  return (
    <div className="stat stat-riche">
      <div className="stat-riche-haut">
        <div style={{ minWidth: 0 }}>
          <div className="stat-label">{label}</div>
          <div className={`stat-riche-valeur${valeurTexte ? " texte" : ""}`}>{valeur}</div>
        </div>
        {jauge ? (
          <Jauge valeurPct={jauge.valeurPct} couleur={jauge.couleur} />
        ) : (
          <div className="stat-icone" style={{ background: bg, color: fg }}>
            <Icone size={21} />
          </div>
        )}
      </div>
      <div className="stat-riche-bas">
        {variationPct !== undefined && (
          <Delta pct={variationPct} libelle={libelleVariation} libelleAbsent={libelleSansVariation} />
        )}
        <span className="stat-note">{note}</span>
      </div>
    </div>
  );
}

/**
 * Tableau de bord de la direction générale.
 *
 * Quatre indicateurs, tous issus des ventes enregistrées. Le DG n'ouvre pas
 * l'outil pour savoir combien de fiches contient la base, mais ce qu'elles
 * ont rapporté.
 */
export default function DirectionPage() {
  const { t, nombre, montant, montantCompact, dateHeure, locale } = useLangue();
  const { utilisateur } = useAuth();
  const [ind, setInd] = useState<IndicateursDirection | null>(null);
  const [analyses, setAnalyses] = useState<AnalysesDirection | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  /* Les quatre ventilations arrivent ensemble : changer de filtre ne relance
     aucun appel, l'affichage bascule sur place. */
  const [dimCa, setDimCa] = useState<DimensionCa>("pays");
  const [dimTop, setDimTop] = useState<DimensionTop>("commercial");

  useEffect(() => {
    fetchIndicateursDirection()
      .then(setInd)
      .catch((e) => setErreur(e.message));
    fetchAnalysesDirection()
      .then(setAnalyses)
      .catch((e) => setErreur(e.message));
  }, []);

  const libelleDim = (d: string) => t(`dg.dim${d[0].toUpperCase()}${d.slice(1)}` as CleTraduction);
  const libelleDimMin = (d: string) => t(`dg.dim${d[0].toUpperCase()}${d.slice(1)}Min` as CleTraduction);

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("dg.bienvenue", { nom: utilisateur?.nomComplet ?? "" })}</h1>
        <div className="page-sub">{t("dg.sousTitre")}</div>
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

  if (!ind) {
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

  const rien = t("dg.aucuneDonnee");

  const cartes: Carte[] = [
    {
      label: t("dg.ca"),
      // Abrégé : « 194,2 M XAF » se compare d'un coup d'œil, pas neuf chiffres.
      valeur: ind.aDesVentes ? montantCompact(ind.chiffreAffaires) : rien,
      note: ind.aDesVentes
        ? ind.nbClientsFactures > 0
          ? t("dg.caNote", { n: nombre(ind.nbVentes), clients: nombre(ind.nbClientsFactures) })
          : t("dg.caNoteSansClient", { n: nombre(ind.nbVentes) })
        : t("dg.periodeDepuisToujours"),
      icone: IconTrend,
      fg: "#0c8074",
      bg: "#e2f4f1",
      variationPct: ind.variations.chiffreAffaires,
    },
    {
      label: t("dg.meilleurVendeur"),
      valeur: ind.meilleurVendeur?.nom ?? rien,
      note: ind.meilleurVendeur
        ? t("dg.meilleurVendeurNote", {
            ca: montantCompact(ind.meilleurVendeur.ca).replace(" XAF", ""),
            part: ind.meilleurVendeur.partPct,
          })
        : t("dg.periodeDepuisToujours"),
      icone: IconAward,
      fg: "#9e6b06",
      bg: "#fcf2e0",
      valeurTexte: true,
      // La part du meilleur vendeur se lit mieux en fraction de cercle.
      jauge: ind.meilleurVendeur ? { valeurPct: ind.meilleurVendeur.partPct, couleur: "#c07a00" } : undefined,
    },
    {
      label: t("dg.meilleurProduit"),
      valeur: ind.meilleurProduit?.nom ?? rien,
      note: ind.meilleurProduit
        ? t("dg.meilleurProduitNote", {
            n: nombre(ind.meilleurProduit.nbVentes),
            part: ind.meilleurProduit.partPct,
          })
        : t("dg.periodeDepuisToujours"),
      icone: IconBox,
      fg: "#5b4bc4",
      bg: "#eeebfa",
      valeurTexte: true,
      jauge: ind.meilleurProduit ? { valeurPct: ind.meilleurProduit.partPct, couleur: "#7c4dcc" } : undefined,
    },
    {
      label: t("dg.beneficeMoyen"),
      valeur: ind.beneficeMoyen === null ? rien : montantCompact(ind.beneficeMoyen),
      note:
        ind.beneficeMoyen === null
          ? t("dg.periodeDepuisToujours")
          : t("dg.beneficeMoyenNote", { marge: ind.margeMoyennePct ?? 0 }),
      icone: IconCoins,
      fg: "#2a79ae",
      bg: "#e8f3fb",
      variationPct: ind.variations.beneficeMoyen,
    },
  ];

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

      {ind.aDesVentes && analyses && (
        <>
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">{t("dg.evolutionTitre")}</div>
                <div className="card-sub">{t("dg.evolutionSousTitre")}</div>
              </div>
              <span className="tag">{t("dg.moisEnCours")}</span>
            </div>
            <EvolutionMensuelle
              points={analyses.parMois.map((m) => ({
                ...m,
                libelle: new Date(`${m.mois}-01T00:00:00`).toLocaleDateString(locale, { month: "short" }),
              }))}
            />
          </div>

          <div className="dash-grid dash-grid-egal">
            <div className="card">
              <div className="card-head card-head-filtre">
                <div>
                  <div className="card-title">{t("dg.caTitre")}</div>
                  <div className="card-sub">
                    {t("dg.caSousTitre", { dimension: libelleDimMin(dimCa) })}
                  </div>
                </div>
                <SelecteurDimension
                  dimensions={DIMS_CA}
                  active={dimCa}
                  onChange={setDimCa}
                  libelle={libelleDim}
                  etiquette={t("dg.changerDimension")}
                />
              </div>
              {/* La clé remonte le graphique à chaque changement de dimension :
                  c'est ce qui rejoue l'animation d'entrée. */}
              <DonutInteractif
                key={`donut-${dimCa}`}
                lignes={replierParts(
                  analyses.chiffreAffaires[dimCa].map((l) => ({
                    label: l.label,
                    valeur: l.montant,
                    valeurCourte: montantCompact(l.montant),
                    // Le montant exact et le nombre de ventes restent au survol.
                    detail:
                      l.nbVentes === 1
                        ? t("dg.caDetailUn", { montant: nombre(l.montant) })
                        : t("dg.caDetail", { montant: nombre(l.montant), n: nombre(l.nbVentes) }),
                  })),
                  t("dg.autres"),
                  montantCompact,
                  (n) => t("dg.caDetailReste", { montant: nombre(n) })
                )}
                libelleCentre={t("dg.totalCentre")}
                totalFormate={montantCompact(ind.chiffreAffaires)}
              />
            </div>

            <div className="card">
              <div className="card-head card-head-filtre">
                <div>
                  <div className="card-title">{t("dg.topTitre")}</div>
                  <div className="card-sub">
                    {t("dg.topSousTitre", { dimension: libelleDimMin(dimTop) })}
                  </div>
                </div>
                <SelecteurDimension
                  dimensions={DIMS_TOP}
                  active={dimTop}
                  onChange={setDimTop}
                  libelle={libelleDim}
                  etiquette={t("dg.changerDimension")}
                />
              </div>
              <TopProduits
                key={`top-${dimTop}`}
                ordreProduits={analyses.ordreProduits}
                lignes={analyses.meilleursProduits[dimTop].map((l) => ({
                  groupe: l.groupe,
                  produit: l.produit,
                  nbVentes: l.nbVentes,
                  valeurCourte:
                    l.nbVentes === 1
                      ? t("dg.venteUne")
                      : t("dg.ventesN", { n: nombre(l.nbVentes) }),
                  detail:
                    l.nbVentes === 1
                      ? t("dg.topDetailUn", { part: l.partPct })
                      : t("dg.topDetail", { n: nombre(l.nbVentes), part: l.partPct }),
                }))}
              />
            </div>
          </div>

          <div className="table-card">
            <div className="card-head">
              <div>
                <div className="card-title">{t("dg.historiqueTitre")}</div>
                <div className="card-sub">{t("dg.historiqueSousTitre")}</div>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("dg.colDate")}</th>
                    <th>{t("dg.colClient")}</th>
                    <th>{t("dg.colProduit")}</th>
                    <th>{t("dg.colVendeur")}</th>
                    <th>{t("dg.colQuantite")}</th>
                    <th>{t("dg.colMontant")}</th>
                    <th>{t("dg.colBenefice")}</th>
                  </tr>
                </thead>
                <tbody>
                  {analyses.dernieresVentes.map((v, i) => (
                    <tr key={`${v.dateVente}-${i}`}>
                      <td data-label={t("dg.colDate")}>{dateHeure(v.dateVente)}</td>
                      <td className="td-strong td-main" data-label={t("dg.colClient")}>
                        {v.clientNom}
                      </td>
                      <td data-label={t("dg.colProduit")}>{v.produit}</td>
                      <td data-label={t("dg.colVendeur")}>{v.vendeurNom}</td>
                      <td className="num" data-label={t("dg.colQuantite")}>
                        {nombre(v.quantite)}
                      </td>
                      <td className="num" data-label={t("dg.colMontant")} title={montant(v.montant)}>
                        {montantCompact(v.montant)}
                      </td>
                      <td
                        className={`num ${v.benefice >= 0 ? "num-positif" : "num-negatif"}`}
                        data-label={t("dg.colBenefice")}
                      >
                        {v.benefice >= 0 ? "+" : ""}
                        {montantCompact(v.benefice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Sans vente, les quatre cartes affichent « pas encore de donnée ».
          On explique pourquoi, plutôt que de laisser croire à un outil cassé
          ou à un trimestre catastrophique. */}
      {!ind.aDesVentes && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("dg.videTitre")}</div>
            <p className="empty-text" style={{ margin: 0, maxWidth: 620 }}>
              {t("dg.videTexte")}
            </p>
            <p className="empty-text muted-3" style={{ margin: "4px 0 0", maxWidth: 620 }}>
              {t("dg.videAide")} {t("dg.analysesVides")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
