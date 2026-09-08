import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { fr } from "./fr";
import { en } from "./en";

/**
 * Traduction de l'interface.
 *
 * Le français reste la langue de référence : c'est lui qui définit les clés
 * disponibles, et l'anglais doit les couvrir toutes (le typage ci-dessous
 * l'impose, une clé oubliée ne compile pas). Les textes ne sont donc jamais
 * écrits en dur dans les pages.
 *
 * Les libellés qui viennent du serveur (rôles, catalogue des permissions)
 * sont traduits ici plutôt qu'en base : ce sont des étiquettes d'interface,
 * et les clés techniques, elles, ne changent pas d'une langue à l'autre.
 */

export type Langue = "fr" | "en";

export const LANGUES: { code: Langue; libelle: string; court: string }[] = [
  { code: "fr", libelle: "Français", court: "FR" },
  { code: "en", libelle: "English", court: "EN" },
];

export type CleTraduction = keyof typeof fr;

const DICTIONNAIRES: Record<Langue, Record<CleTraduction, string>> = { fr, en };

/** Locales utilisées pour les nombres et les dates. */
const LOCALES: Record<Langue, string> = { fr: "fr-FR", en: "en-GB" };

/** Locales du seul format abrégé. Voir le commentaire à son point d'usage. */
const LOCALES_COMPACT: Record<Langue, string> = { fr: "fr-FR", en: "en-US" };

const CLE_STOCKAGE = "crm.langue";

function langueInitiale(): Langue {
  const enregistree = localStorage.getItem(CLE_STOCKAGE);
  if (enregistree === "fr" || enregistree === "en") return enregistree;
  // Premier passage : on suit la langue du navigateur, avec le français par défaut.
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "fr";
}

type ContexteLangue = {
  langue: Langue;
  definirLangue: (l: Langue) => void;
  /** Traduit une clé. Les valeurs entre accolades sont remplacées : t("x", { n: 3 }). */
  t: (cle: CleTraduction, valeurs?: Record<string, string | number>) => string;
  /** Formate un nombre selon la langue active. */
  nombre: (n: number) => string;
  /**
   * Montant abrégé, unité comprise : « 31,5 M XAF » en français,
   * « 31.5M XAF » en anglais. Pour les graphiques et les tuiles, où le montant
   * exact tient rarement et n'aide pas à comparer. La valeur exacte reste
   * accessible au survol.
   */
  montantCompact: (n: number) => string;
  /** Montant exact avec sa devise : « 31 500 000 XAF ». */
  montant: (n: number) => string;
  /** Formate une date ISO en date et heure lisibles. */
  dateHeure: (iso: string | null | undefined) => string;
  /** Formate une date ISO sans l'heure. */
  date: (iso: string | null | undefined) => string;
  locale: string;
};

const LangueContext = createContext<ContexteLangue | null>(null);

export function LangueProvider({ children }: { children: ReactNode }) {
  const [langue, setLangue] = useState<Langue>(langueInitiale);

  useEffect(() => {
    localStorage.setItem(CLE_STOCKAGE, langue);
    // Les lecteurs d'écran et la césure du navigateur se fient à cet attribut.
    document.documentElement.lang = langue;
  }, [langue]);

  const t = useCallback(
    (cle: CleTraduction, valeurs?: Record<string, string | number>) => {
      const dico = DICTIONNAIRES[langue];
      // Repli sur le français plutôt que d'afficher la clé brute à l'écran.
      let texte: string = dico[cle] ?? fr[cle] ?? cle;
      if (valeurs) {
        for (const [nom, valeur] of Object.entries(valeurs)) {
          texte = texte.split(`{${nom}}`).join(String(valeur));
        }
      }
      return texte;
    },
    [langue]
  );

  const valeur = useMemo<ContexteLangue>(() => {
    const locale = LOCALES[langue];

    /* « compact » produit « 31,5 M » et « 31.5M », espace insécable et
       abréviation compris ; le faire à la main reviendrait à réécrire ces
       règles typographiques langue par langue.
       L'anglais utilise ici une locale distincte de celle des dates : en-GB
       abrège en minuscule (« 194.2m »), ce qui se lit comme des mètres sur un
       montant, là où en-US donne « 194.2M ». */
    const abrege = new Intl.NumberFormat(LOCALES_COMPACT[langue], {
      notation: "compact",
      maximumFractionDigits: 1,
    });

    return {
      langue,
      definirLangue: setLangue,
      t,
      locale,
      nombre: (n) => n.toLocaleString(locale),
      montant: (n) => `${n.toLocaleString(locale)} XAF`,
      montantCompact: (n) => `${abrege.format(n)} XAF`,
      dateHeure: (iso) =>
        iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "",
      date: (iso) => (iso ? new Date(iso).toLocaleDateString(locale, { dateStyle: "medium" }) : ""),
    };
  }, [langue, t]);

  return <LangueContext.Provider value={valeur}>{children}</LangueContext.Provider>;
}

/**
 * Contexte de repli, utilisé si le fournisseur manque à l'appel.
 *
 * Volontairement pas une exception : la langue est une préoccupation
 * d'affichage, avec un défaut évident. Faire échouer le rendu de toute
 * l'application parce qu'un contexte manque coûterait un écran blanc là où
 * du français correct suffit. Le cas se produit en développement quand le
 * rechargement à chaud remplace ce module alors que des composants pointent
 * encore sur l'ancien contexte.
 */
const REPLI: ContexteLangue = {
  langue: "fr",
  definirLangue: () => {},
  t: (cle, valeurs) => {
    let texte: string = fr[cle] ?? cle;
    if (valeurs) for (const [n, v] of Object.entries(valeurs)) texte = texte.split(`{${n}}`).join(String(v));
    return texte;
  },
  nombre: (n) => n.toLocaleString(LOCALES.fr),
  montant: (n) => `${n.toLocaleString(LOCALES.fr)} XAF`,
  montantCompact: (n) =>
    `${new Intl.NumberFormat(LOCALES_COMPACT.fr, { notation: "compact", maximumFractionDigits: 1 }).format(n)} XAF`,
  dateHeure: (iso) => (iso ? new Date(iso).toLocaleString(LOCALES.fr, { dateStyle: "medium", timeStyle: "short" }) : ""),
  date: (iso) => (iso ? new Date(iso).toLocaleDateString(LOCALES.fr, { dateStyle: "medium" }) : ""),
  locale: LOCALES.fr,
};

export function useLangue() {
  const ctx = useContext(LangueContext);
  if (!ctx) {
    console.warn("useLangue appelé hors LangueProvider : repli sur le français.");
    return REPLI;
  }
  return ctx;
}

/** Raccourci pour les composants qui n'ont besoin que de traduire du texte. */
export function useT() {
  return useLangue().t;
}

/**
 * Libellés dérivés de clés techniques envoyées par le serveur.
 *
 * Le serveur parle en identifiants stables (« COMMERCIAL », « clients.voirTous ») ;
 * la traduction reste ici, côté interface, où elle a sa place.
 */
export function useLibelles() {
  const { t } = useLangue();
  return useMemo(
    () => ({
      role: (role: string) => t(`role.${role}` as CleTraduction),
      permissionLibelle: (cle: string) => t(`perm.${cle}.libelle` as CleTraduction),
      permissionDetail: (cle: string) => t(`perm.${cle}.detail` as CleTraduction),
      groupe: (groupe: string) => t(`permGroupe.${groupe}` as CleTraduction),
    }),
    [t]
  );
}
