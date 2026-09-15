import { useEffect, useState } from "react";
import { Partenaire, fetchPartenaires } from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { IconAlert, IconCheck, IconExternal, IconHandshake, IconInbox, IconMail } from "../components/Icons";

/**
 * Partenaires technologiques.
 *
 * Une carte par partenariat : son niveau, la place de ce niveau dans l'échelle
 * du programme, ce qui reste à remplir pour monter, et qui appeler. Une carte
 * plutôt qu'une ligne de tableau parce que ces quatre choses ne se lisent pas
 * en colonnes : la liste des conditions est de longueur variable.
 */
export default function PartenairesPage() {
  const { t, nombre, montant, montantCompact, date } = useLangue();
  const [partenaires, setPartenaires] = useState<Partenaire[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetchPartenaires()
      .then((r) => setPartenaires(r.partenaires))
      .catch((e) => setErreur(e.message));
  }, []);

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("pa.titre")}</h1>
        <div className="head-meta">
          <IconHandshake size={15} />
          <span>
            {partenaires === null
              ? t("commun.chargement")
              : partenaires.length === 1
                ? t("pa.sousTitreUn")
                : t("pa.sousTitre", { n: nombre(partenaires.length) })}
          </span>
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

  if (!partenaires) {
    return (
      <>
        {entete}
        <div className="card">
          <p className="muted-3" style={{ margin: 0 }}>
            {t("commun.chargementDonnees")}
          </p>
        </div>
      </>
    );
  }

  if (partenaires.length === 0) {
    return (
      <>
        {entete}
        <div className="card">
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("pa.videTitre")}</div>
            <p className="empty-text" style={{ margin: 0, maxWidth: 560 }}>
              {t("pa.videTexte")}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {entete}

      <div className="partenaires-grille">
        {partenaires.map((p) => (
          <article className="card partenaire" key={p.id}>
            <header className="partenaire-tete">
              <div style={{ minWidth: 0 }}>
                <div className="partenaire-nom">{p.nom}</div>
                <div className="partenaire-type">{t(`typePartenaire.${p.type}` as CleTraduction)}</div>
              </div>
              {p.siteWeb && (
                <a
                  className="link-action"
                  href={p.siteWeb}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                >
                  {t("pa.siteProgramme")}
                  <IconExternal size={14} />
                </a>
              )}
            </header>

            {/* Niveau et position dans l'échelle du programme. */}
            <section className="partenaire-niveau">
              <div>
                <div className="partenaire-etiquette">{t("pa.niveauActuel")}</div>
                <div className="partenaire-palier-nom">
                  {p.niveauActuel}
                  {p.depuis && <span className="partenaire-depuis">{t("pa.depuis", { date: date(p.depuis) })}</span>}
                </div>
              </div>
              <span className="tag">
                {p.rangActuel < 0
                  ? t("pa.palierInconnu")
                  : t("pa.palier", { n: p.rangActuel + 1, total: p.paliers.length })}
              </span>
            </section>

            {/* L'échelle entière : savoir où l'on est suppose de voir d'où et
                vers où. Le palier atteint est plein, les suivants en creux. */}
            <ol className="echelle" aria-label={t("pa.niveauActuel")}>
              {p.paliers.map((palier, i) => (
                <li
                  key={palier}
                  className={`echelle-palier${i < p.rangActuel ? " passe" : ""}${
                    i === p.rangActuel ? " actuel" : ""
                  }${i === p.rangActuel + 1 ? " vise" : ""}`}
                >
                  <span className="echelle-point" aria-hidden />
                  <span className="echelle-nom">{palier}</span>
                </li>
              ))}
            </ol>

            {/* Volume réalisé sous ce programme, mesuré sur les ventes. */}
            <section className="partenaire-volume">
              <div>
                <div className="partenaire-etiquette">{t("pa.caDouzeMois")}</div>
                <div className="partenaire-ca" title={montant(p.caDouzeMois)}>
                  {montantCompact(p.caDouzeMois)}
                </div>
              </div>
              <div className="partenaire-volume-note">
                {p.nbVentesDouzeMois === 0
                  ? t("pa.aucuneVente")
                  : p.nbVentesDouzeMois === 1
                    ? t("pa.ventesDouzeMoisUne")
                    : t("pa.ventesDouzeMois", { n: nombre(p.nbVentesDouzeMois) })}
                {p.produits.length > 0 && <span className="partenaire-produits">{p.produits.join(" · ")}</span>}
              </div>
            </section>

            {/* Conditions pour monter d'un cran. */}
            <section>
              <div className="partenaire-sous-titre">
                {p.auSommet ? t("pa.auSommet") : t("pa.versNiveau", { niveau: p.niveauSuivant ?? "" })}
              </div>
              <div className="partenaire-etiquette" style={{ marginTop: 3 }}>
                {p.conditionsTotal === 0
                  ? t("pa.conditionsAucune")
                  : p.conditionsRemplies === 1
                    ? t("pa.conditionsUne", { total: p.conditionsTotal })
                    : t("pa.conditions", { remplies: p.conditionsRemplies, total: p.conditionsTotal })}
              </div>

              {p.conditions.length > 0 && (
                <ul className="conditions">
                  {p.conditions.map((c) => (
                    <li key={c.id} className={`condition${c.satisfaite ? " remplie" : ""}`}>
                      <span className="condition-marque" aria-hidden>
                        {c.satisfaite ? <IconCheck size={13} /> : null}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="condition-libelle">{c.libelle}</div>
                        <div className="condition-exigence">{c.exigence}</div>
                        {/* Une condition mesurée affiche le réalisé face au
                            seuil : son verdict vient des ventes, pas d'une
                            saisie, et doit pouvoir se vérifier. */}
                        {c.mesuree && c.realise !== null && c.seuil !== null ? (
                          <div className="condition-mesure">
                            <div className="avancement-rail">
                              <div
                                className={`avancement-jauge${c.satisfaite ? "" : " en-attente"}`}
                                style={{ width: `${c.progressionPct ?? 0}%` }}
                              />
                            </div>
                            <span className="condition-chiffre">
                              {t("pa.realiseSurSeuil", {
                                realise: montantCompact(c.realise),
                                seuil: montantCompact(c.seuil),
                              })}
                            </span>
                          </div>
                        ) : (
                          c.situation && <div className="condition-situation">{c.situation}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Qui appeler. Son absence est affichée, pas masquée. */}
            <section className="partenaire-contact">
              <div className="partenaire-etiquette">{t("pa.channelManager")}</div>
              {p.channelManager ? (
                <div className="contact-bloc">
                  <div className="contact-nom">{p.channelManager.nom}</div>
                  <div className="contact-liens">
                    {p.channelManager.email && (
                      <a className="contact-lien" href={`mailto:${p.channelManager.email}`}>
                        <IconMail size={14} />
                        {p.channelManager.email}
                      </a>
                    )}
                    {p.channelManager.telephone && (
                      <a className="contact-lien" href={`tel:${p.channelManager.telephone.replace(/\s/g, "")}`}>
                        {p.channelManager.telephone}
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="contact-absent">
                  <div className="contact-nom">{t("pa.sansChannelManager")}</div>
                  <div className="condition-exigence">{t("pa.sansChannelManagerAide")}</div>
                </div>
              )}
            </section>

            {p.notes && (
              <section className="partenaire-notes">
                <div className="partenaire-etiquette">{t("pa.notes")}</div>
                <p className="partenaire-notes-texte">{p.notes}</p>
              </section>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
