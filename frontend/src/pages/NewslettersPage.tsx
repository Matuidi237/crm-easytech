import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Newsletter, NewsletterFormat, createNewsletter, fetchAudience, fetchFacets, fetchNewsletters } from "../api";
import { IconAlert, IconArrowRight, IconInbox, IconMail, IconPlus, IconUsers } from "../components/Icons";

export const STATUT_PILL: Record<string, { label: string; cls: string }> = {
  BROUILLON: { label: "Brouillon", cls: "pill-neutral" },
  ENVOI_EN_COURS: { label: "Envoi en cours", cls: "pill-warn" },
  ENVOYEE: { label: "Envoyée", cls: "pill-success" },
  ECHEC: { label: "Échec", cls: "pill-danger" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export default function NewslettersPage() {
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
      setError("Titre, sujet et contenu sont requis.");
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
          <h1>Newsletters</h1>
          <div className="head-meta">
            <IconMail size={15} />
            <span>
              Total : <b>{newsletters.length}</b>
            </span>
          </div>
        </div>
        <div className="head-actions">
          <button className={showForm ? "btn btn-ghost" : "btn btn-primary"} onClick={() => setShowForm((s) => !s)}>
            {showForm ? (
              "Annuler"
            ) : (
              <>
                <IconPlus />
                Nouvelle newsletter
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
              <div className="card-title">Nouvelle newsletter</div>
              <div className="card-sub">Elle sera créée en brouillon, vous déciderez de l'envoi ensuite.</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="field">
              <label htmlFor="nl-titre">Titre interne</label>
              <input
                id="nl-titre"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Offre partenaire Microsoft, septembre"
              />
            </div>
            <div className="field">
              <label htmlFor="nl-sujet">Objet de l'email</label>
              <input
                id="nl-sujet"
                value={sujet}
                onChange={(e) => setSujet(e.target.value)}
                placeholder="Ce que verra le destinataire dans sa boîte mail"
              />
            </div>
          </div>

          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="nl-format">Format du contenu</label>
            <select id="nl-format" value={format} onChange={(e) => setFormat(e.target.value as NewsletterFormat)}>
              <option value="TEXTE">Texte simple</option>
              <option value="HTML">HTML (coller le code d'un partenaire)</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="nl-contenu">Contenu</label>
            <textarea
              id="nl-contenu"
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              rows={format === "HTML" ? 12 : 7}
              style={{ fontFamily: format === "HTML" ? "ui-monospace, monospace" : undefined, fontSize: 13 }}
              placeholder={
                format === "HTML"
                  ? "<html>… collez ici le code reçu du partenaire, images comprises …</html>"
                  : "Rédigez votre message. Pour intégrer des images, utilisez le format HTML."
              }
            />
            <div className="field-hint">
              {format === "HTML"
                ? "Les images du partenaire restent hébergées chez lui. Un aperçu fidèle s'affichera après création."
                : "Le texte sera mis en forme automatiquement dans un email propre."}
            </div>
          </div>

          <div className="field">
            <label>Secteurs ciblés</label>
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
            <div className="field-hint">Aucun secteur sélectionné = envoi à tous les clients joignables.</div>
          </div>

          <div className="alert alert-info" style={{ marginBottom: 18 }}>
            <IconUsers size={16} />
            {audience === null
              ? "Calcul de l'audience…"
              : `${audience.toLocaleString("fr-FR")} client${audience > 1 ? "s" : ""} avec adresse email ${
                  audience > 1 ? "recevront" : "recevra"
                } cette newsletter.`}
          </div>

          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? "Création…" : "Créer le brouillon"}
          </button>
        </div>
      )}

      <div className="table-card">
        {newsletters.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconMail />
            </div>
            <div className="empty-title">Aucune newsletter</div>
            <p className="empty-text" style={{ margin: 0 }}>
              Créez une campagne et ciblez les clients par secteur d'activité.
            </p>
            {!showForm && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)} style={{ marginTop: 6 }}>
                <IconPlus size={15} />
                Nouvelle newsletter
              </button>
            )}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Campagne</th>
                  <th>Statut</th>
                  <th>Secteurs ciblés</th>
                  <th>Destinataires</th>
                  <th>Envoyée le</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {newsletters.map((n) => {
                  const st = STATUT_PILL[n.statut] ?? { label: n.statut, cls: "pill-neutral" };
                  return (
                    <tr key={n.id}>
                      <td className="td-main">
                        <div className="cc-name">{n.titre}</div>
                        <div className="cc-sub">{n.sujet}</div>
                      </td>
                      <td data-label="Statut">
                        <span className={`pill ${st.cls}`}>{st.label}</span>
                      </td>
                      <td data-label="Secteurs">
                        {n.secteursCibles.length === 0 ? (
                          <span className="tag">Tous les clients</span>
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
                      <td className="num" data-label="Destinataires">
                        {n.nbDestinataires ?? "-"}
                      </td>
                      <td data-label="Envoyée le">{n.envoyeeLe ? formatDate(n.envoyeeLe) : "-"}</td>
                      <td className="col-actions">
                        <div className="row-actions">
                          <Link
                            to={`/newsletters/${n.id}`}
                            className="link-action"
                            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                          >
                            Ouvrir
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
