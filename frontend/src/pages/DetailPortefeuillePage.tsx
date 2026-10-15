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
 * le travail à venir. Le taux de couverture porte donc la page.
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

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("co.detailPortefeuilleTitre")}</h1>
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

  if (!donnees) {
    return (
      <>
        {entete}
        <div className="panneau panneau-vide">{t("commun.chargementDonnees")}</div>
      </>
    );
  }

  const dormants = donnees.total - donnees.avecVente;
  const couverture = donnees.couverturePct ?? 0;
  const bonne = couverture >= 50;
  const panier = donnees.avecVente > 0 ? Math.round(donnees.chiffreAffaires / donnees.avecVente) : 0;

  /** Une répartition : rang, libellé, part en fond de ligne, effectif. */
  function Repartition({ titre, cle }: { titre: string; cle: "pays" | "secteurActivite" }) {
    const groupes = new Map<string, { n: number; ca: number }>();
    for (const c of donnees!.clients) {
      const k = c[cle] ?? t("co.detailNonRenseigne");
      const g = groupes.get(k) ?? { n: 0, ca: 0 };
      g.n += 1;
      g.ca += c.chiffreAffaires;
      groupes.set(k, g);
    }
    const tete = [...groupes.entries()].sort((a, b) => b[1].n - a[1].n);
    const visibles = tete.slice(0, 7);
    const reste = tete.slice(7);
    const total = donnees!.clients.length || 1;

    return (
      <section className="panneau">
        <header className="panneau-tete">
          <h2>{titre}</h2>
        </header>
        <table className="rangs">
          <tbody>
            {visibles.map(([nom, g], i) => (
              <tr key={nom}>
                <td className="rang-num">{i + 1}</td>
                <td className="rang-nom">
                  <span className="rang-fond" style={{ width: `${(g.n / total) * 100}%` }} aria-hidden />
                  <span className="rang-texte" title={nom}>
                    {nom}
                  </span>
                </td>
                <td className="rang-chiffre">{nombre(g.n)}</td>
                <td className="rang-chiffre rang-montant" title={montant(g.ca)}>
                  {g.ca > 0 ? montantCompact(g.ca) : "—"}
                </td>
                <td className="rang-part">{nombre(Math.round((g.n / total) * 100))}%</td>
              </tr>
            ))}
            {reste.length > 0 && (
              <tr className="rang-reste">
                <td />
                <td className="rang-nom">
                  <span className="rang-texte">{t("co.autresN", { n: nombre(reste.length) })}</span>
                </td>
                <td className="rang-chiffre">{nombre(reste.reduce((s, [, g]) => s + g.n, 0))}</td>
                <td className="rang-chiffre rang-montant">
                  {montantCompact(reste.reduce((s, [, g]) => s + g.ca, 0))}
                </td>
                <td className="rang-part">
                  {nombre(Math.round((reste.reduce((s, [, g]) => s + g.n, 0) / total) * 100))}%
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    );
  }

  const concentration =
    donnees.avecVente >= 3 && donnees.chiffreAffaires > 0
      ? Math.round(
          (donnees.clients
            .filter((c) => c.nbVentes > 0)
            .slice(0, 3)
            .reduce((s, c) => s + c.chiffreAffaires, 0) /
            donnees.chiffreAffaires) *
            100
        )
      : null;

  return (
    <>
      {entete}

      {/* La couverture, et elle seule. Le reste du portefeuille est le travail
          qui reste à faire : c'est ce que dit le pied de jauge. */}
      <section className="panneau heros">
        <div className="heros-haut">
          <div className="heros-principal">
            <span className="heros-contexte">{t("co.detailPortefeuilleSousTitre")}</span>
            <span className="heros-chiffre">{nombre(couverture)}%</span>
            <span className="heros-appui">
              {t("co.servisSurTotal", { servis: nombre(donnees.avecVente), total: nombre(donnees.total) })}
            </span>
          </div>
          <span className={`etat ${bonne ? "etat-bon" : "etat-alerte"}`}>
            {bonne ? t("co.couvertureBonne") : t("co.couvertureFaible")}
          </span>
        </div>

        <div className="mesure">
          <span
            className={`mesure-remplie${bonne ? "" : " alerte"}`}
            style={{ width: `${Math.min(100, couverture)}%` }}
          />
        </div>
        <div className="mesure-pied">
          <span>{t("co.detailFiches")} · {nombre(donnees.total)}</span>
          <span>{t("co.dormantsRestants", { n: nombre(dormants) })}</span>
        </div>

        <dl className="heros-rythme">
          <div>
            <dt>{t("co.detailCaPortefeuille")}</dt>
            <dd title={montant(donnees.chiffreAffaires)}>{montantCompact(donnees.chiffreAffaires)}</dd>
          </div>
          <div>
            <dt>{t("co.detailPanier")}</dt>
            <dd title={montant(panier)}>{montantCompact(panier)}</dd>
          </div>
          <div>
            <dt>{t("co.detailDormants")}</dt>
            <dd className={dormants > 0 ? "en-deca" : undefined}>{nombre(dormants)}</dd>
          </div>
        </dl>
      </section>

      {/* Où se trouve le portefeuille : deux répartitions qui disent, mieux
          qu'une liste de trente noms, sur quel terrain on travaille. */}
      {donnees.clients.length > 0 && (
        <div className="deux-colonnes">
          <Repartition titre={t("co.detailParPays")} cle="pays" />
          <Repartition titre={t("co.detailParSecteur")} cle="secteurActivite" />
        </div>
      )}

      {/* Concentration : un portefeuille porté par trois clients est fragile,
          et la liste triée ne le dit pas d'elle-même. */}
      {concentration !== null && (
        <p className="remarque">{t("co.detailConcentrationPortefeuille", { pct: nombre(concentration) })}</p>
      )}

      <section className="panneau">
        <header className="panneau-tete">
          <h2>{t("co.detailListeTitre")}</h2>
          <div className="segmente" role="group" aria-label={t("co.detailFiltreEtiquette")}>
            {(["tous", "servis", "dormants"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={f === filtre ? "on" : undefined}
                onClick={() => setFiltre(f)}
                aria-pressed={f === filtre}
              >
                {t(`co.detailFiltre.${f}` as CleTraduction)}
              </button>
            ))}
          </div>
        </header>

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
            <table className="table-nue">
              <thead>
                <tr>
                  <th>{t("fc.colClient")}</th>
                  <th>{t("clients.filtrePays")}</th>
                  <th>{t("clients.filtreSecteur")}</th>
                  <th className="num">{t("cm.colVentes")}</th>
                  <th className="num">{t("co.ca")}</th>
                  <th>{t("co.derniereVenteCol")}</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((c) => (
                  <tr key={c.id ?? c.nom}>
                    <td className="td-strong td-main" data-label={t("fc.colClient")}>
                      {c.nom}
                    </td>
                    <td data-label={t("clients.filtrePays")}>{c.pays ?? <span className="muted-3">—</span>}</td>
                    <td data-label={t("clients.filtreSecteur")}>
                      {c.secteurActivite ?? <span className="muted-3">—</span>}
                    </td>
                    <td className="num" data-label={t("cm.colVentes")}>
                      {c.nbVentes > 0 ? nombre(c.nbVentes) : <span className="muted-3">—</span>}
                    </td>
                    <td className="num" data-label={t("co.ca")} title={montant(c.chiffreAffaires)}>
                      {c.nbVentes > 0 ? montantCompact(c.chiffreAffaires) : <span className="muted-3">—</span>}
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
      </section>
    </>
  );
}
