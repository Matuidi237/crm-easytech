import { LANGUES, useLangue } from "../i18n";

/**
 * Bascule de langue.
 *
 * Avec deux langues seulement, un menu déroulant serait une étape de trop :
 * les deux options tiennent côte à côte, l'état courant se lit sans ouvrir
 * quoi que ce soit, et changer de langue coûte un seul clic.
 */
export default function SelecteurLangue({ compact = false }: { compact?: boolean }) {
  const { langue, definirLangue, t } = useLangue();

  return (
    <div
      className={`lang-switch${compact ? " compact" : ""}`}
      role="group"
      aria-label={t("topbar.changerLangue")}
    >
      {LANGUES.map((l) => (
        <button
          key={l.code}
          type="button"
          className={`lang-opt${langue === l.code ? " on" : ""}`}
          onClick={() => definirLangue(l.code)}
          aria-pressed={langue === l.code}
          title={l.libelle}
        >
          {l.court}
        </button>
      ))}
    </div>
  );
}
