import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EquipeProjet, fetchEquipeProjet } from "../api";
import { useLangue } from "../i18n";
import { useFilAriane } from "../ContexteEntete";
import { IconAlert, IconChevronDown, IconInbox, IconSearch } from "../components/Icons";

function initiales(nom: string) {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

/**
 * Liste de l'équipe projet, classée par charge en cours.
 *
 * La question d'un directeur général n'est pas qui a le plus livré depuis
 * toujours, mais qui porte quoi en ce moment : les projets ouverts priment donc
 * sur le cumul. Même contrat que l'équipe commerciale pour la recherche et le
 * filtre pays, appliqués en base.
 */
export default function EquipeProjetPage() {
  const { t, nombre, montant, montantCompact } = useLangue();
  const navigate = useNavigate();

  const [saisie, setSaisie] = useState("");
  const [recherche, setRecherche] = useState("");
  const [pays, setPays] = useState("");
  const [donnees, setDonnees] = useState<EquipeProjet | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setRecherche(saisie.trim()), 300);
    return () => clearTimeout(id);
  }, [saisie]);

  useEffect(() => {
    setChargement(true);
    fetchEquipeProjet({ recherche, pays })
      .then(setDonnees)
      .catch((e) => setErreur(e.message))
      .finally(() => setChargement(false));
  }, [recherche, pays]);

  useFilAriane("/equipes", t("ep.retour"), t("ep.titre"));

  const filtreActif = recherche !== "" || pays !== "";
  const membres = donnees?.membres ?? [];

  function reinitialiser() {
    setSaisie("");
    setRecherche("");
    setPays("");
  }

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("ep.titre")}</h1>
        <div className="page-sub">
          {membres.length === 1 ? t("ep.sousTitreUn") : t("ep.sousTitre", { n: nombre(membres.length) })}
        </div>
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

  return (
    <>
      {entete}

      <div className="filters-row">
        <div className="search search-large">
          <IconSearch />
          <input
            type="search"
            placeholder={t("ep.rechercher")}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            aria-label={t("ep.rechercher")}
          />
        </div>

        <div className={`select-pill${pays ? " on" : ""}`}>
          <select value={pays} onChange={(e) => setPays(e.target.value)} aria-label={t("ep.colPays")}>
            <option value="">{t("ec.tousPays")}</option>
            {(donnees?.pays ?? []).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <IconChevronDown size={14} />
        </div>

        {filtreActif && (
          <button className="link-action" onClick={reinitialiser}>
            {t("commun.reinitialiser")}
          </button>
        )}
      </div>

      <div className="table-card">
        {chargement && membres.length === 0 ? (
          <p className="muted-3" style={{ margin: 0, padding: 20 }}>
            {t("commun.chargement")}
          </p>
        ) : membres.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{filtreActif ? t("ep.aucunResultatTitre") : t("ep.videTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {filtreActif ? t("ep.aucunResultatTexte") : t("ep.videTexte")}
            </p>
            {filtreActif && (
              <button className="btn btn-ghost btn-sm" onClick={reinitialiser} style={{ marginTop: 6 }}>
                {t("ec.reinitialiser")}
              </button>
            )}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("ep.colChef")}</th>
                  <th>{t("ep.colPays")}</th>
                  <th>{t("ep.colEnCours")}</th>
                  <th>{t("ep.colLivres")}</th>
                  <th>{t("ep.colDelais")}</th>
                  <th>{t("ep.colBudget")}</th>
                </tr>
              </thead>
              <tbody>
                {membres.map((m) => (
                  <tr
                    key={m.id}
                    className="ligne-cliquable"
                    tabIndex={0}
                    role="link"
                    aria-label={t("ep.ouvrirFiche", { nom: m.nomComplet })}
                    onClick={() => navigate(`/equipes/projet/${m.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/equipes/projet/${m.id}`);
                      }
                    }}
                  >
                    <td className="td-main">
                      <div className="cell-client">
                        <span
                          className="avatar-mono"
                          style={{ background: "#eeebfa", color: "#5b4bc4" }}
                        >
                          {initiales(m.nomComplet)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="cc-name">
                            {m.nomComplet}
                            {!m.actif && (
                              <span className="tag" style={{ marginLeft: 7 }}>
                                {t("equipes.inactif")}
                              </span>
                            )}
                          </div>
                          <div className="cc-sub">{m.email || m.identifiant}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label={t("ep.colPays")}>
                      {m.pays ?? <span className="muted-3">{t("ec.paysNonRenseigne")}</span>}
                    </td>
                    {/* Les projets en retard sont signalés ici, sur la charge
                        courante : c'est le seul endroit où le DG peut les voir
                        sans ouvrir chaque fiche. */}
                    <td className="num" data-label={t("ep.colEnCours")}>
                      {nombre(m.ouverts)}
                      {m.enRetard > 0 && (
                        <span className="pill pill-danger" style={{ marginLeft: 8 }}>
                          {m.enRetard === 1 ? t("ep.retardUn") : t("ep.retardN", { n: nombre(m.enRetard) })}
                        </span>
                      )}
                    </td>
                    <td className="num" data-label={t("ep.colLivres")}>
                      {nombre(m.livres)}
                    </td>
                    <td className="num" data-label={t("ep.colDelais")}>
                      {m.respectDelaisPct === null ? (
                        <span className="muted-3">-</span>
                      ) : (
                        <span className={m.respectDelaisPct >= 75 ? "num-positif" : "num-negatif"}>
                          {m.respectDelaisPct}%
                        </span>
                      )}
                    </td>
                    <td className="num" data-label={t("ep.colBudget")} title={montant(m.budgetPilote)}>
                      {m.total > 0 ? montantCompact(m.budgetPilote) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
