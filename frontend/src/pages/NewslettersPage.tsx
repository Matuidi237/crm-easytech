import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Newsletter, NewsletterFormat, createNewsletter, fetchAudience, fetchFacets, fetchNewsletters } from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { IconAlert, IconArrowRight, IconInbox, IconMail, IconPlus, IconUsers } from "../components/Icons";

/* Le statut ne porte que sa clé de traduction et sa teinte : le libellé se
   résout à l'affichage, dans la langue de la page. */
export const STATUT_PILL: Record<string, { cle: CleTraduction; cls: string }> = {
  BROUILLON: { cle: "nl.statutBrouillon", cls: "pill-neutral" },
  ENVOI_EN_COURS: { cle: "nl.statutEnvoiEnCours", cls: "pill-warn" },
  ENVOYEE: { cle: "nl.statutEnvoyee", cls: "pill-success" },
  ECHEC: { cle: "nl.statutEchec", cls: "pill-danger" },
};

export default function NewslettersPage() {
  const { t, nombre, dateHeure } = useLangue();
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [secteurs, setSecteurs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const [showForm, setShowForm] = useState(false);
  const [titre, setTitre] = useState("");
  const [sujet, setSujet] = useState("");
  const [format, setFormat] = useState<NewsletterFormat>("TEXTE");
  const [contenu, setContenu] = useState("");
  const [secteursCibles, setSecteursCibles] = useState<string[]>([]);
  const [audience, setAudience] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchNewsletters().then(setNewsletters).catch((e) => setError(e.message));
    fetchFacets()
      .then((f) => setSecteurs(f.secteurs))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAudience(secteursCibles)
      .then((r) => setAudience(r.nbDestinataires))
      .catch(() => setAudience(null));
  }, [secteursCibles]);

  function toggleSecteur(s: string) {
    setSecteursCibles((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function handleCreate() {
    if (!titre || !sujet || !contenu) {
      setError(t("nl.champsRequis"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const nl = await createNewsletter({ titre, sujet, format, contenu, secteursCibles });
      navigate(`/newsletters/${nl.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("nl.titre")}</h1>
          <div className="head-meta">
            <IconMail size={15} />
            <span>
              {t("commun.total")} <b>{newsletters.length}</b>
            </span>
          </div>
        </div>
        <div className="head-actions">
          <button className={showForm ? "btn btn-ghost" : "btn btn-primary"} onClick={() => setShowForm((s) => !s)}>
            {showForm ? (
              t("commun.annuler")
            ) : (
              <>
                <IconPlus />
                {t("nl.nouvelle")}
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <IconAlert />
          {error}
        </div>
      )}

      {showForm && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("nl.nouvelle")}</div>
              <div className="card-sub">{t("nl.nouvelleSousTitre")}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="field">
              <label htmlFor="nl-titre">{t("nl.titreInterne")}</label>
              <input
                id="nl-titre"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder={t("nl.titreInternePlaceholder")}
              />
            </div>
            <div className="field">
              <label htmlFor="nl-sujet">{t("nl.objet")}</label>
              <input
                id="nl-sujet"
                value={sujet}
                onChange={(e) => setSujet(e.target.value)}
                placeholder={t("nl.objetPlaceholder")}
              />
            </div>
          </div>

          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="nl-format">{t("nl.format")}</label>
            <select id="nl-format" value={format} onChange={(e) => setFormat(e.target.value as NewsletterFormat)}>
              <option value="TEXTE">{t("nl.formatTexte")}</option>
              <option value="HTML">{t("nl.formatHtml")}</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="nl-contenu">{t("nl.contenu")}</label>
            <textarea
              id="nl-contenu"
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              rows={format === "HTML" ? 12 : 7}
              style={{ fontFamily: format === "HTML" ? "ui-monospace, monospace" : undefined, fontSize: 13 }}
              placeholder={
                format === "HTML" ? t("nl.contenuPlaceholderHtml") : t("nl.contenuPlaceholderTexte")
              }
            />
            <div className="field-hint">
              {format === "HTML" ? t("nl.aideHtml") : t("nl.aideTexte")}
            </div>
          </div>

          <div className="field">
            <label>{t("nl.secteursCibles")}</label>
            <div className="chip-row">
              {secteurs.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip${secteursCibles.includes(s) ? " on" : ""}`}
                  onClick={() => toggleSecteur(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="field-hint">{t("nl.aideSecteurs")}</div>
          </div>

          <div className="alert alert-info" style={{ marginBottom: 18 }}>
            <IconUsers size={16} />
            {audience === null
              ? t("nl.audienceCalcul")
              : audience > 1
                ? t("nl.audienceN", { n: nombre(audience) })
                : t("nl.audienceUn")}
          </div>

          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? t("nl.creation") : t("nl.creerBrouillon")}
          </button>
        </div>
      )}

      <div className="table-card">
        {newsletters.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconMail />
            </div>
            <div className="empty-title">{t("nl.aucuneTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("nl.aucuneTexte")}
            </p>
            {!showForm && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)} style={{ marginTop: 6 }}>
                <IconPlus size={15} />
                {t("nl.nouvelle")}
              </button>
            )}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("nl.colCampagne")}</th>
                  <th>{t("nl.colStatut")}</th>
                  <th>{t("nl.colSecteurs")}</th>
                  <th>{t("nl.colDestinataires")}</th>
                  <th>{t("nl.colEnvoyeeLe")}</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {newsletters.map((n) => {
                  const st = STATUT_PILL[n.statut];
                  return (
                    <tr key={n.id}>
                      <td className="td-main">
                        <div className="cc-name">{n.titre}</div>
                        <div className="cc-sub">{n.sujet}</div>
                      </td>
                      <td data-label={t("nl.colStatut")}>
                        <span className={`pill ${st?.cls ?? "pill-neutral"}`}>
                          {st ? t(st.cle) : n.statut}
                        </span>
                      </td>
                      <td data-label={t("nl.colSecteurs")}>
                        {n.secteursCibles.length === 0 ? (
                          <span className="tag">{t("nl.tousLesClients")}</span>
                        ) : n.secteursCibles.length <= 2 ? (
                          n.secteursCibles.join(", ")
                        ) : (
                          <>
                            {n.secteursCibles.slice(0, 2).join(", ")}
                            <span className="tag" style={{ marginLeft: 6 }}>
                              +{n.secteursCibles.length - 2}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="num" data-label={t("nl.colDestinataires")}>
                        {n.nbDestinataires ?? "-"}
                      </td>
                      <td data-label={t("nl.colEnvoyeeLe")}>{n.envoyeeLe ? dateHeure(n.envoyeeLe) : "-"}</td>
                      <td className="col-actions">
                        <div className="row-actions">
                          <Link
                            to={`/newsletters/${n.id}`}
                            className="link-action"
                            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                          >
                            {t("commun.ouvrir")}
                            <IconArrowRight size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
