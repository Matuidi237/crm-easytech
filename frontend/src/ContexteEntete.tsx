import { createContext, useContext, useEffect } from "react";

/**
 * Fil d'Ariane remonté dans la barre du haut.
 *
 * Sur les pages sans recherche client, la moitié gauche de la barre restait
 * vide pendant que la page répétait un lien de retour juste en dessous. Une
 * page qui a un parent le déclare ici, et la barre l'affiche : le retour et
 * l'identité de ce qu'on regarde occupent l'espace disponible au lieu de
 * consommer une ligne de contenu.
 *
 * L'état vit dans Layout, qui dessine la barre. Les pages ne font que le
 * renseigner à l'affichage et le libérer en partant.
 */
export type FilAriane = {
  /** Route du parent, celle qu'ouvre la flèche de retour. */
  vers: string;
  /** Nom du parent, écrit à côté de la flèche. */
  versLibelle: string;
  /** Ce qu'on regarde. Absent tant que la donnée n'est pas chargée. */
  courant?: string;
};

type Contexte = { fil: FilAriane | null; definirFil: (f: FilAriane | null) => void };

export const ContexteEntete = createContext<Contexte>({ fil: null, definirFil: () => {} });

/**
 * Déclare le fil d'Ariane de la page courante.
 *
 * À appeler inconditionnellement, avant tout retour anticipé : c'est un hook.
 * Pendant le chargement, « courant » vaut undefined et seul le retour
 * s'affiche, ce qui laisse quand même une issue si la page échoue.
 */
export function useFilAriane(vers: string, versLibelle: string, courant?: string) {
  const { definirFil } = useContext(ContexteEntete);
  useEffect(() => {
    definirFil({ vers, versLibelle, courant });
    // Libéré au départ, sinon le fil survivrait sur la page suivante.
    return () => definirFil(null);
  }, [vers, versLibelle, courant, definirFil]);
}
