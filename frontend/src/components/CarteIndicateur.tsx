import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { IconArrowDown, IconArrowUp, IconArrowRight } from "./Icons";
import { Jauge } from "./Charts";

/**
 * Carte d'indicateur des tableaux de bord.
 *
 * Partagée entre la direction et les commerciaux : deux copies finiraient par
 * diverger, et deux tableaux de bord qui ne se ressemblent plus laissent
 * croire qu'ils ne comptent pas la même chose.
 */
export type Carte = {
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
  /** Page de détail. Renseignée, la carte devient un lien. */
  vers?: string;
  /** Ce qu'on trouvera au bout du lien, annoncé plutôt que deviné. */
  libelleLien?: string;
};

/** Puce de variation. La flèche double la couleur, elle ne la remplace pas. */
export function Delta({
  pct,
  libelle,
  libelleAbsent,
}: {
  pct: number | null | undefined;
  libelle: string;
  libelleAbsent: string;
}) {
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

export default function CarteIndicateur({
  label,
  valeur,
  valeurTexte,
  note,
  icone: Icone,
  fg,
  bg,
  variationPct,
  jauge,
  vers,
  libelleLien,
  libelleVariation,
  libelleSansVariation,
}: Carte & { libelleVariation: string; libelleSansVariation: string }) {
  const corps = (
    <>
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
      {/* Le lien est annoncé en toutes lettres : une carte entièrement
          cliquable sans repère visible ne se découvre qu'au hasard du curseur. */}
      {vers && libelleLien && (
        <span className="stat-lien">
          {libelleLien}
          <IconArrowRight size={14} />
        </span>
      )}
    </>
  );

  if (vers) {
    return (
      <Link to={vers} className="stat stat-riche stat-cliquable">
        {corps}
      </Link>
    );
  }

  return <div className="stat stat-riche">{corps}</div>;
}
