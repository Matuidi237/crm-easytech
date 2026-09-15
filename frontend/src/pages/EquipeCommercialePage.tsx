import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EquipeCommerciale, fetchEquipeCommerciale } from "../api";
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
 * Liste de l'équipe commerciale, classée par chiffre d'affaires.
 *
 * Recherche et filtre pays sont envoyés au serveur, pas appliqués à l'écran :
 * la liste grandira, et tout télécharger pour en cacher la moitié ne tient pas.
 * La frappe est temporisée pour ne pas lancer une requête par lettre.
 */
export default function EquipeCommercialePage() {
  const { t, nombre, montant, montantCompact, date } = useLangue();
  const navigate = useNavigate();

  const [saisie, setSaisie] = useState("");
  const [recherche, setRecherche] = useState("");
  const [pays, setPays] = useState("");
  const [donnees, setDonnees] = useState<EquipeCommerciale | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // 300 ms : assez pour laisser finir un mot, assez court pour rester vif.
  useEffect(() => {
    const id = setTimeout(() => setRecherche(saisie.trim()), 300);
    return () => clearTimeout(id);
  }, [saisie]);

  useEffect(() => {
    setChargement(true);
    fetchEquipeCommerciale({ recherche, pays })
      .then(setDonnees)
      .catch((e) => setErreur(e.message))
      .finally(() => setChargement(false));
  }, [recherche, pays]);

  useFilAriane("/equipes", t("ec.retour"), t("ec.titre"));

  const filtreActif = recherche !== "" || pays !== "";

  function reinitialiser() {
    setSaisie("");
    setRecherche("");
    setPays("");
  }

  const membres = donnees?.membres ?? [];

  const entete = (
    <>
      <div className="page-head">
        <div>
          <h1>{t("ec.titre")}</h1>
          <div className="page-sub">
            {membres.length === 1 ? t("ec.sousTitreUn") : t("ec.sousTitre", { n: nombre(membres.length) })}
          </div>
        </div>
      </div>
    </>
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
            placeholder={t("ec.rechercher")}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            aria-label={t("ec.rechercher")}
          />
        </div>

        <div className={`select-pill${pays ? " on" : ""}`}>
          <select value={pays} onChange={(e) => setPays(e.target.value)} aria-label={t("ec.colPays")}>
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
            <div className="empty-title">{filtreActif ? t("ec.aucunResultatTitre") : t("ec.videTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {filtreActif ? t("ec.aucunResultatTexte") : t("ec.videTexte")}
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
                  <th>{t("ec.colCommercial")}</th>
                  <th>{t("ec.colPays")}</th>
                  <th>{t("ec.colCa")}</th>
                  <th>{t("ec.colDerniereVente")}</th>
                  <th>{t("ec.colBenefice")}</th>
                </tr>
              </thead>
              <tbody>
                {membres.map((m) => (
                  <tr
                    key={m.id}
                    className="ligne-cliquable"
                    tabIndex={0}
                    role="link"
                    aria-label={t("ec.ouvrirFiche", { nom: m.nomComplet })}
                    onClick={() => navigate(`/equipes/commerciale/${m.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/equipes/commerciale/${m.id}`);
                      }
                    }}
                  >
                    <td className="td-main">
                      <div className="cell-client">
                        <span
                          className="avatar-mono"
                          style={{ background: "var(--brand-100)", color: "var(--brand-700)" }}
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
                    <td data-label={t("ec.colPays")}>
                      {m.pays ?? <span className="muted-3">{t("ec.paysNonRenseigne")}</span>}
                    </td>
                    <td className="num" data-label={t("ec.colCa")} title={montant(m.chiffreAffaires)}>
                      {m.nbVentes > 0 ? montantCompact(m.chiffreAffaires) : "-"}
                    </td>
                    <td data-label={t("ec.colDerniereVente")}>
                      {m.derniereVente ? date(m.derniereVente) : <span className="muted-3">{t("ec.aucuneVente")}</span>}
                    </td>
                    <td
                      className={`num ${m.nbVentes > 0 ? (m.benefice >= 0 ? "num-positif" : "num-negatif") : ""}`}
                      data-label={t("ec.colBenefice")}
                      title={m.nbVentes > 0 ? montant(m.benefice) : undefined}
                    >
                      {m.nbVentes > 0 ? montantCompact(m.benefice) : "-"}
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
