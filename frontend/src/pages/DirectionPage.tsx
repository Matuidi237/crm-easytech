import { ComponentType, useEffect, useState } from "react";
import { IndicateursDirection, fetchIndicateursDirection } from "../api";
import { useAuth } from "../AuthContext";
import { useLangue } from "../i18n";
import { IconAlert, IconAward, IconBox, IconCoins, IconInbox, IconTrend } from "../components/Icons";

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
  const { t, nombre } = useLangue();
  const { utilisateur } = useAuth();
  const [ind, setInd] = useState<IndicateursDirection | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetchIndicateursDirection()
      .then(setInd)
      .catch((e) => setErreur(e.message));
  }, []);

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
              {t("dg.videAide")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
