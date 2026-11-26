import { useState, type ReactNode } from "react";
import { IconChevronDown } from "./Icons";

/**
 * Un bloc de fiche qu'on déplie.
 *
 * Replié, il annonce ce qu'il contient : « 26 clients », « 3 demandes en
 * cours ». C'est la raison d'être du composant. Une fiche qui empile quatre
 * tableaux ouverts oblige à faire défiler un écran entier pour savoir s'il y
 * a quelque chose à y voir, alors que le compte suffit la plupart du temps.
 *
 * Replié par défaut, sauf ce qu'on vient consulter en premier : l'état
 * d'ouverture est un choix de l'appelant, qui seul sait ce qui compte sur sa
 * page.
 *
 * Un bloc vide se déplie quand même. Masquer la section ferait croire qu'elle
 * n'existe pas, alors que « aucune demande en cours » est une information.
 */
export default function BlocDepliable({
  titre,
  sousTitre,
  compteur,
  ouvertParDefaut = false,
  children,
}: {
  titre: string;
  sousTitre?: string;
  /** Ce que le bloc contient, lisible sans l'ouvrir. */
  compteur?: string;
  ouvertParDefaut?: boolean;
  children: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut);

  return (
    <div className={`table-card bloc-depliable${ouvert ? " ouvert" : ""}`}>
      <button
        type="button"
        className="bloc-tete"
        aria-expanded={ouvert}
        onClick={() => setOuvert(!ouvert)}
      >
        <span className="bloc-chevron">
          <IconChevronDown size={16} />
        </span>
        <span className="bloc-titres">
          <span className="card-title">{titre}</span>
          {sousTitre && <span className="card-sub">{sousTitre}</span>}
        </span>
        {compteur && <span className="tag">{compteur}</span>}
      </button>

      {/* Monté seulement une fois ouvert : quatre tableaux rendus d'avance
          pour en montrer un seul coûtent le temps de chargement de la fiche,
          qui est la premiere chose qu'on remarque. */}
      {ouvert && <div className="bloc-corps">{children}</div>}
    </div>
  );
}
