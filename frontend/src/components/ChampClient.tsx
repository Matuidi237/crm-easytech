import { useEffect, useRef, useState } from "react";
import { SuggestionClient, chercherClients } from "../api";
import { useLangue } from "../i18n";

/**
 * Saisie d'un client avec suggestions pendant la frappe.
 *
 * Le champ reste libre : un commercial vend parfois à une entreprise qui n'est
 * pas encore en base, et l'obliger à créer la fiche d'abord le pousserait à
 * saisir la vente plus tard, donc à ne pas la saisir. La suggestion accélère
 * le cas courant sans fermer le cas nouveau.
 */
export default function ChampClient({
  valeur,
  onChange,
  onChoisir,
}: {
  valeur: string;
  /** Appelé à chaque frappe : le rattachement est alors perdu. */
  onChange: (nom: string) => void;
  /** Appelé quand une fiche existante est retenue. */
  onChoisir: (client: SuggestionClient) => void;
}) {
  const { t } = useLangue();
  const [suggestions, setSuggestions] = useState<SuggestionClient[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [surligne, setSurligne] = useState(-1);
  const [recherche, setRecherche] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  /* Vrai juste après un choix : sans ce drapeau, écrire le nom retenu dans le
     champ relancerait une recherche et rouvrirait la liste qu'on vient de
     fermer. */
  const choixFait = useRef(false);

  useEffect(() => {
    if (choixFait.current) {
      choixFait.current = false;
      return;
    }
    const q = valeur.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOuvert(false);
      return;
    }

    /* Frappe au clavier : une requête par caractère saturerait le serveur pour
       des résultats que personne ne lit. On attend une courte pause. */
    const minuteur = setTimeout(() => {
      setRecherche(true);
      chercherClients(q)
        .then((r) => {
          setSuggestions(r);
          setOuvert(r.length > 0);
          setSurligne(-1);
        })
        .catch(() => setSuggestions([]))
        .finally(() => setRecherche(false));
    }, 250);

    return () => clearTimeout(minuteur);
  }, [valeur]);

  useEffect(() => {
    function auClic(e: MouseEvent) {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false);
    }
    document.addEventListener("mousedown", auClic);
    return () => document.removeEventListener("mousedown", auClic);
  }, []);

  function retenir(c: SuggestionClient) {
    choixFait.current = true;
    onChoisir(c);
    setOuvert(false);
    setSurligne(-1);
  }

  function auClavier(e: React.KeyboardEvent) {
    if (!ouvert || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSurligne((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSurligne((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && surligne >= 0) {
      // Uniquement si une ligne est surlignée : sinon Entrée doit valider le
      // formulaire, pas retenir un client que personne n'a désigné.
      e.preventDefault();
      retenir(suggestions[surligne]);
    } else if (e.key === "Escape") {
      setOuvert(false);
    }
  }

  return (
    <div className="auto" ref={boite}>
      <input
        id="vente-client"
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={auClavier}
        onFocus={() => suggestions.length > 0 && setOuvert(true)}
        placeholder={t("ve.clientPlaceholder")}
        autoComplete="off"
        role="combobox"
        aria-expanded={ouvert}
        aria-controls="liste-clients"
        aria-autocomplete="list"
      />
      {recherche && <span className="auto-etat">{t("ve.recherche")}</span>}

      {ouvert && (
        <ul className="auto-liste" id="liste-clients" role="listbox">
          {suggestions.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === surligne}>
              <button
                type="button"
                className={`auto-opt${i === surligne ? " on" : ""}`}
                onMouseEnter={() => setSurligne(i)}
                onClick={() => retenir(c)}
              >
                <span className="auto-nom">{c.nom}</span>
                {/* Le pays et le secteur départagent deux fiches homonymes,
                    fréquentes entre filiales d'un même groupe. */}
                <span className="auto-meta">
                  {[c.pays, c.secteurActivite].filter(Boolean).join(" · ") || t("ve.sansDetail")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
