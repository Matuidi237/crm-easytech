import { useMemo, useState, useEffect } from "react";
import { DetailPortefeuille, fetchDetailPortefeuille } from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { useFilAriane } from "../ContexteEntete";
import { IconAlert, IconInbox, IconSearch } from "../components/Icons";

type Filtre = "tous" | "servis" | "dormants";

/**
 * Détail du portefeuille.
 *
 * La liste des clients existe déjà sous son propre onglet. L'apport de cette
 * page est ailleurs : séparer ceux qui achètent de ceux qui dorment. Un
 * portefeuille de trente fiches dont dix ont commandé ne se travaille pas
 * comme un portefeuille de dix fiches, et c'est la seconde moitié qui porte
 * le travail à venir.
 */
export default function DetailPortefeuillePage() {
  const { t, nombre, montant, montantCompact, date } = useLangue();
  const [donnees, setDonnees] = useState<DetailPortefeuille | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [recherche, setRecherche] = useState("");

  useFilAriane("/", t("co.retourTableau"), t("co.detailPortefeuilleTitre"));

  useEffect(() => {
    fetchDetailPortefeuille()
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }, []);

  const lignes = useMemo(() => {
    if (!donnees) return [];
    const q = recherche.trim().toLowerCase();
    return donnees.clients
      .filter((c) => (filtre === "servis" ? c.nbVentes > 0 : filtre === "dormants" ? c.nbVentes === 0 : true))
      .filter((c) => (q ? c.nom.toLowerCase().includes(q) : true));
  }, [donnees, filtre, recherche]);

  if (erreur) {
    return (
      <div className="alert alert-error">
        <IconAlert />
        {erreur}
      </div>
    );
  }

  if (!donnees) {
    return (
      <div className="card">
        <p className="muted-3" style={{ margin: 0 }}>
          {t("commun.chargementDonnees")}
        </p>
      </div>
    );
  }

  const dormants = donnees.total - donnees.avecVente;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("co.detailPortefeuilleTitre")}</h1>
          <div className="page-sub">{t("co.detailPortefeuilleSousTitre")}</div>
        </div>
      </div>

      <div className="card">
        <div className="chiffres-cles">
          <div>
            <span className="chiffre-label">{t("co.detailFiches")}</span>
            <strong>{nombre(donnees.total)}</strong>
          </div>
          <div>
            <span className="chiffre-label">{t("co.detailServis")}</span>
            <strong>{nombre(donnees.avecVente)}</strong>
          </div>
          <div>
            <span className="chiffre-label">{t("co.detailDormants")}</span>
            <strong className={dormants > 0 ? "valeur-negative" : ""}>{nombre(dormants)}</strong>
          </div>
          <div>
            <span className="chiffre-label">{t("co.detailCaPortefeuille")}</span>
            <strong>{montantCompact(donnees.chiffreAffaires)}</strong>
          </div>
        </div>

        <div className="cible-rail" style={{ marginTop: 18 }}>
          <span className="cible-barre" style={{ width: `${donnees.couverturePct ?? 0}%` }} />
        </div>
        <div className="cible-pied">
          <span>{t("co.detailCouverture", { pct: nombre(donnees.couverturePct ?? 0) })}</span>
        </div>
      </div>

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("co.detailListeTitre")}</div>
            <div className="card-sub">{t("co.detailListeSousTitre", { n: nombre(lignes.length) })}</div>
          </div>
          <div className="dim-switch" role="group" aria-label={t("co.detailFiltreEtiquette")}>
            {(["tous", "servis", "dormants"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`dim-opt${f === filtre ? " on" : ""}`}
                onClick={() => setFiltre(f)}
                aria-pressed={f === filtre}
              >
                {t(`co.detailFiltre.${f}` as CleTraduction)}
              </button>
            ))}
          </div>
        </div>

        {/* Une recherche locale, sans appel serveur : la liste tient déjà en
            mémoire, et un aller-retour par caractère serait du gaspillage. */}
        <div className="search search-encart">
          <IconSearch />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder={t("co.detailRecherche")}
            aria-label={t("co.detailRecherche")}
          />
        </div>

        {lignes.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("co.detailListeVideTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("co.detailListeVideTexte")}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("fc.colClient")}</th>
                  <th>{t("clients.filtrePays")}</th>
                  <th>{t("clients.filtreSecteur")}</th>
                  <th>{t("cm.colVentes")}</th>
                  <th>{t("co.ca")}</th>
                  <th>{t("co.derniereVenteCol")}</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((c) => (
                  <tr key={c.id ?? c.nom}>
                    <td className="td-strong td-main" data-label={t("fc.colClient")}>
                      {c.nom}
                    </td>
                    <td data-label={t("clients.filtrePays")}>
                      {c.pays ?? <span className="muted-3">-</span>}
                    </td>
                    <td data-label={t("clients.filtreSecteur")}>
                      {c.secteurActivite ?? <span className="muted-3">-</span>}
                    </td>
                    <td className="num" data-label={t("cm.colVentes")}>
                      {c.nbVentes > 0 ? nombre(c.nbVentes) : <span className="muted-3">-</span>}
                    </td>
                    <td className="num" data-label={t("co.ca")} title={montant(c.chiffreAffaires)}>
                      {c.nbVentes > 0 ? montantCompact(c.chiffreAffaires) : <span className="muted-3">-</span>}
                    </td>
                    <td data-label={t("co.derniereVenteCol")}>
                      {/* Un client sans vente est signalé comme tel, pas laissé
                          vide : c'est l'information qui appelle une action. */}
                      {c.derniereVente ? (
                        date(c.derniereVente)
                      ) : (
                        <span className="pill pill-warn">{t("co.detailJamaisServi")}</span>
                      )}
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
