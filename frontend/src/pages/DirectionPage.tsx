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
import { Classement, TopProduits } from "../components/Charts";
import { IconAlert, IconAward, IconBox, IconCoins, IconInbox, IconTrend } from "../components/Icons";

/* Dimensions offertes par chaque encart. La première est celle qui s'affiche
   à l'ouverture : le pays pour le chiffre d'affaires, le commercial pour les
   produits. */
const DIMS_CA: DimensionCa[] = ["pays", "secteur", "commercial", "produit"];
const DIMS_TOP: DimensionTop[] = ["commercial", "pays", "secteur"];

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
  note: string;
  icone: ComponentType<{ size?: number }>;
  fg: string;
  bg: string;
};

function CarteIndicateur({ label, valeur, note, icone: Icone, fg, bg }: Carte) {
  return (
    <div className="stat">
      <div className="stat-top">
        <div className="stat-badge" style={{ background: bg, color: fg }}>
          <Icone size={21} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="stat-label">{label}</div>
          <div className="stat-value stat-value-texte">{valeur}</div>
        </div>
      </div>
      <div className="stat-note">{note}</div>
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
  const { t, nombre, dateHeure } = useLangue();
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

  const xaf = (montant: number) => `${nombre(montant)} XAF`;
  const rien = t("dg.aucuneDonnee");

  const cartes: Carte[] = [
    {
      label: t("dg.ca"),
      valeur: ind.aDesVentes ? xaf(ind.chiffreAffaires) : rien,
      note: ind.aDesVentes
        ? ind.nbClientsFactures > 0
          ? t("dg.caNote", { n: nombre(ind.nbVentes), clients: nombre(ind.nbClientsFactures) })
          : t("dg.caNoteSansClient", { n: nombre(ind.nbVentes) })
        : t("dg.periodeDepuisToujours"),
      icone: IconTrend,
      fg: "#0c8074",
      bg: "#e2f4f1",
    },
    {
      label: t("dg.meilleurVendeur"),
      valeur: ind.meilleurVendeur?.nom ?? rien,
      note: ind.meilleurVendeur
        ? t("dg.meilleurVendeurNote", {
            ca: nombre(ind.meilleurVendeur.ca),
            part: ind.meilleurVendeur.partPct,
          })
        : t("dg.periodeDepuisToujours"),
      icone: IconAward,
      fg: "#9e6b06",
      bg: "#fcf2e0",
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
    },
    {
      label: t("dg.beneficeMoyen"),
      valeur: ind.beneficeMoyen === null ? rien : xaf(ind.beneficeMoyen),
      note:
        ind.beneficeMoyen === null
          ? t("dg.periodeDepuisToujours")
          : t("dg.beneficeMoyenNote", { marge: ind.margeMoyennePct ?? 0 }),
      icone: IconCoins,
      fg: "#2a79ae",
      bg: "#e8f3fb",
    },
  ];

  return (
    <>
      {entete}

      <div className="stat-grid">
        {cartes.map((c) => (
          <CarteIndicateur key={c.label} {...c} />
        ))}
      </div>

      {ind.aDesVentes && analyses && (
        <>
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
              <Classement
                lignes={analyses.chiffreAffaires[dimCa].map((l) => ({
                  label: l.label,
                  valeur: l.montant,
                  valeurCourte: `${nombre(l.montant)} XAF`,
                  detail:
                    l.nbVentes === 1
                      ? t("dg.caDetailUn", { montant: nombre(l.montant) })
                      : t("dg.caDetail", { montant: nombre(l.montant), n: nombre(l.nbVentes) }),
                }))}
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
                      <td className="num" data-label={t("dg.colMontant")}>
                        {nombre(v.montant)} XAF
                      </td>
                      <td className="num" data-label={t("dg.colBenefice")}>
                        {nombre(v.benefice)} XAF
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
