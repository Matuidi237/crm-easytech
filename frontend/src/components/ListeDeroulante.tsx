import { useEffect, useMemo, useRef, useState } from "react";
import { useLangue } from "../i18n";
import { IconCheck, IconChevronDown, IconSearch } from "./Icons";

/**
 * Liste déroulante dessinée par l'application.
 *
 * Les listes natives, celles d'un « select » ou d'un « datalist », sont
 * rendues par le système et non par la page : sur un poste réglé en thème
 * sombre elles s'ouvrent en noir au milieu d'une interface claire, et aucune
 * règle de style ne peut l'empêcher. On les redessine donc, au prix de
 * quelques lignes, pour que la liste ressemble au reste de l'écran.
 *
 * Deux usages, selon « libre » :
 *   - fermé, c'est un choix parmi des valeurs connues ;
 *   - ouvert, la saisie reste possible et la liste ne fait que proposer.
 */
export default function ListeDeroulante({
  id,
  valeur,
  options,
  onChange,
  placeholder,
  libre = false,
  recherche = false,
  videLibelle,
}: {
  id: string;
  valeur: string;
  options: string[];
  onChange: (valeur: string) => void;
  placeholder?: string;
  /** Autorise une valeur absente de la liste. */
  libre?: boolean;
  /** Ajoute un champ de filtrage, utile au-delà d'une dizaine d'options. */
  recherche?: boolean;
  /** Libellé de l'option vide, pour un filtre qu'on peut retirer. */
  videLibelle?: string;
}) {
  const { t } = useLangue();
  const [ouvert, setOuvert] = useState(false);
  const [filtre, setFiltre] = useState("");
  const [surligne, setSurligne] = useState(-1);
  const boite = useRef<HTMLDivElement>(null);
  const champRecherche = useRef<HTMLInputElement>(null);

  const visibles = useMemo(() => {
    const q = (libre ? valeur : filtre).trim().toLowerCase();
    if (!q) return options;
    /* En saisie libre, le champ sert lui-même de filtre : taper « cam » ne
       doit pas laisser les 40 pays à l'écran. */
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, filtre, valeur, libre]);

  useEffect(() => {
    function auClic(e: MouseEvent) {
      if (boite.current && !boite.current.contains(e.target as Node)) {
        setOuvert(false);
        setFiltre("");
      }
    }
    document.addEventListener("mousedown", auClic);
    return () => document.removeEventListener("mousedown", auClic);
  }, []);

  useEffect(() => {
    if (ouvert && recherche) champRecherche.current?.focus();
  }, [ouvert, recherche]);

  function retenir(v: string) {
    onChange(v);
    setOuvert(false);
    setFiltre("");
    setSurligne(-1);
  }

  function auClavier(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!ouvert) setOuvert(true);
      else setSurligne((i) => (i + 1) % Math.max(1, visibles.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSurligne((i) => (i <= 0 ? visibles.length - 1 : i - 1));
    } else if (e.key === "Enter" && ouvert && surligne >= 0) {
      e.preventDefault();
      retenir(visibles[surligne]);
    } else if (e.key === "Escape") {
      setOuvert(false);
      setFiltre("");
    }
  }

  const liste = (
    <ul className="liste-options" role="listbox" id={`${id}-options`}>
      {videLibelle !== undefined && (
        <li role="option" aria-selected={valeur === ""}>
          <button type="button" className={`liste-option${valeur === "" ? " on" : ""}`} onClick={() => retenir("")}>
            <span className="liste-option-nom muted-3">{videLibelle}</span>
            {valeur === "" && <IconCheck size={14} />}
          </button>
        </li>
      )}
      {visibles.map((o, i) => (
        <li key={o} role="option" aria-selected={o === valeur}>
          <button
            type="button"
            className={`liste-option${i === surligne ? " survol" : ""}${o === valeur ? " on" : ""}`}
            onMouseEnter={() => setSurligne(i)}
            onClick={() => retenir(o)}
          >
            <span className="liste-option-nom">{o}</span>
            {o === valeur && <IconCheck size={14} />}
          </button>
        </li>
      ))}
      {visibles.length === 0 && (
        <li className="liste-vide">
          {/* En saisie libre, une valeur inconnue est légitime : on le dit
              plutôt que de laisser croire à une erreur. */}
          {libre ? t("liste.valeurLibre") : t("liste.aucuneOption")}
        </li>
      )}
    </ul>
  );

  if (libre) {
    return (
      <div className="liste-deroulante" ref={boite}>
        <input
          id={id}
          value={valeur}
          onChange={(e) => {
            onChange(e.target.value);
            setOuvert(true);
            setSurligne(-1);
          }}
          onFocus={() => setOuvert(true)}
          onKeyDown={auClavier}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={ouvert}
          aria-controls={`${id}-options`}
        />
        <span className="liste-chevron" aria-hidden>
          <IconChevronDown size={15} />
        </span>
        {ouvert && options.length > 0 && liste}
      </div>
    );
  }

  return (
    <div className="liste-deroulante" ref={boite}>
      <button
        type="button"
        id={id}
        className={`liste-bouton${valeur ? " rempli" : ""}`}
        onClick={() => setOuvert((o) => !o)}
        onKeyDown={auClavier}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
      >
        <span className="liste-valeur">{valeur || placeholder}</span>
        <IconChevronDown size={15} />
      </button>
      {ouvert && (
        <div className="liste-panneau">
          {recherche && (
            <div className="liste-recherche">
              <IconSearch size={14} />
              <input
                ref={champRecherche}
                value={filtre}
                onChange={(e) => {
                  setFiltre(e.target.value);
                  setSurligne(-1);
                }}
                onKeyDown={auClavier}
                placeholder={t("liste.filtrer")}
                aria-label={t("liste.filtrer")}
              />
            </div>
          )}
          {liste}
        </div>
      )}
    </div>
  );
}
