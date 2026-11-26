import type { ComponentType } from "react";

/**
 * Les encarts d'état des tableaux de bord.
 *
 * Un chiffre, son intitulé, une ligne de contexte, et un ton qui dit comment
 * le lire. Pas de jauge : une barre de progression à côté d'un pourcentage
 * affiche deux fois la même chose, et le chiffre se lit plus vite.
 *
 * Partagés entre les écrans plutôt que recopiés : la file des cotations et le
 * pilotage commercial montraient les mêmes états avec deux implémentations,
 * et deux copies finissent toujours par diverger.
 *
 * Le ton ne porte jamais l'information seul. L'intitulé le dit en toutes
 * lettres et l'icône le redouble, parce qu'un lecteur daltonien ne distingue
 * pas l'ambre du vert.
 */
export type TonEncart = "ambre" | "vert" | "rouge" | "bleu" | "neutre";

export type Encart = {
  /** Identifiant stable, et clé de rendu. */
  cle: string;
  ton: TonEncart;
  label: string;
  /** Déjà formaté par l'appelant : lui seul sait si c'est un montant, un
      compte ou un taux, et le formatage dépend de la langue. */
  valeur: string;
  /** Valeur exacte en infobulle, quand l'affichage est abrégé. */
  titre?: string;
  note: string;
  icone: ComponentType<{ size?: number }>;
  /** Renseigné, l'encart devient un bouton qui filtre ce qu'il compte. */
  onClick?: () => void;
  actif?: boolean;
};

function Contenu({ e }: { e: Encart }) {
  const Icone = e.icone;
  return (
    <>
      <span className="encart-pastille">
        <Icone size={20} />
      </span>
      <span className="encart-corps">
        <span className="encart-label">{e.label}</span>
        <span className="encart-valeur" title={e.titre}>
          {e.valeur}
        </span>
        <span className="encart-note">{e.note}</span>
      </span>
    </>
  );
}

export default function Encarts({ encarts }: { encarts: Encart[] }) {
  return (
    <div className="encarts" data-nombre={encarts.length}>
      {encarts.map((e) =>
        e.onClick ? (
          <button
            type="button"
            key={e.cle}
            className={`encart encart-${e.ton}${e.actif ? " actif" : ""}`}
            aria-pressed={e.actif ?? false}
            onClick={e.onClick}
          >
            <Contenu e={e} />
          </button>
        ) : (
          <div key={e.cle} className={`encart encart-${e.ton}`}>
            <Contenu e={e} />
          </div>
        )
      )}
    </div>
  );
}
