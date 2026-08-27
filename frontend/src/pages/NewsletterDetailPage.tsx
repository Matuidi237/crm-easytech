import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Newsletter, NewsletterEnvoi, deleteNewsletter, fetchNewsletter, sendNewsletter } from "../api";
import { IconAlert, IconArrowLeft, IconCheck, IconInbox, IconSend, IconTrash } from "../components/Icons";
import { STATUT_PILL } from "./NewslettersPage";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export default function NewsletterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [newsletter, setNewsletter] = useState<(Newsletter & { envois: NewsletterEnvoi[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mailerNote, setMailerNote] = useState<{ live: boolean; text: string } | null>(null);

  function load() {
    if (!id) return;
    fetchNewsletter(id).then(setNewsletter).catch((e) => setError(e.message));
  }

  useEffect(load, [id]);

  async function handleSend() {
    if (!id || !newsletter) return;
    const cible =
      newsletter.secteursCibles.length === 0
        ? "tous les clients disposant d'une adresse email"
        : `les clients des secteurs : ${newsletter.secteursCibles.join(", ")}`;
    if (!confirm(`Envoyer « ${newsletter.titre} » à ${cible} ?`)) return;

    setSending(true);
    setError(null);
    try {
      const res = await sendNewsletter(id);
      setMailerNote({
        live: res.mailerLive,
        text: res.mailerLive
          ? "Envoi réel effectué via Resend."
          : "Mode simulé : aucun email réel n'a quitté le serveur (clé Resend non configurée). L'historique ci-dessous reflète ce qui aurait été envoyé.",
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm("Supprimer cette newsletter et son historique d'envoi ?")) return;
    setDeleting(true);
    try {
      await deleteNewsletter(id);
      navigate("/newsletters");
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  if (error && !newsletter) {
    return (
      <div className="alert alert-error">
        <IconAlert />
        {error}
      </div>
    );
  }
  if (!newsletter) return <div className="card"><p className="muted-3" style={{ margin: 0 }}>Chargement…</p></div>;

  const st = STATUT_PILL[newsletter.statut] ?? { label: newsletter.statut, cls: "pill-neutral" };
  const echecs = newsletter.envois.filter((e) => e.statut === "ECHEC").length;

  return (
    <>
      <Link
        to="/newsletters"
        className="link-action"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
      >
        <IconArrowLeft size={15} />
        Toutes les newsletters
      </Link>

      <div className="page-head">
        <div>
          <h1>{newsletter.titre}</h1>
          <div className="page-sub">{newsletter.sujet}</div>
        </div>
        <div className="head-actions">
          {newsletter.statut === "BROUILLON" && (
            <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
              <IconSend size={16} />
              {sending ? "Envoi en cours…" : "Envoyer"}
            </button>
          )}
          <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
            <IconTrash size={15} />
            {deleting ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <IconAlert />
          {error}
        </div>
      )}

      {mailerNote && (
        <div className={mailerNote.live ? "alert alert-success" : "alert alert-info"}>
          {mailerNote.live ? <IconCheck /> : <IconAlert />}
          {mailerNote.text}
        </div>
      )}

      <div className="card">
        <div className="meta-grid">
          <div className="meta-item">
            <div className="meta-label">Statut</div>
            <div className="meta-value">
              <span className={`pill ${st.cls}`}>{st.label}</span>
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-label">Secteurs ciblés</div>
            <div className="meta-value">
              {newsletter.secteursCibles.length === 0 ? "Tous les clients" : newsletter.secteursCibles.join(", ")}
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-label">Destinataires</div>
            <div className="meta-value">{newsletter.nbDestinataires ?? "-"}</div>
          </div>
          <div className="meta-item">
            <div className="meta-label">Envoyés / Échecs</div>
            <div className="meta-value">
              {newsletter.nbEnvoyes ?? "-"} / {newsletter.nbEchecs ?? "-"}
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-label">Envoyée le</div>
            <div className="meta-value">{newsletter.envoyeeLe ? formatDate(newsletter.envoyeeLe) : "-"}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Aperçu du contenu</div>
            <div className="card-sub">
              {newsletter.format === "HTML" ? "Rendu HTML isolé" : "Texte simple"}
            </div>
          </div>
          <span className="pill pill-neutral">{newsletter.format}</span>
        </div>

        {newsletter.format === "HTML" ? (
          <iframe
            title="Aperçu de la newsletter"
            className="preview-frame"
            sandbox=""
            srcDoc={newsletter.contenu}
          />
        ) : (
          <div className="preview-text">{newsletter.contenu}</div>
        )}
      </div>

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">Historique d'envoi</div>
            <div className="card-sub">
              {newsletter.envois.length === 0
                ? "Aucun envoi enregistré"
                : `${newsletter.envois.length} destinataire${newsletter.envois.length > 1 ? "s" : ""}${
                    echecs > 0 ? ` · ${echecs} échec${echecs > 1 ? "s" : ""}` : ""
                  }`}
            </div>
          </div>
        </div>

        {newsletter.envois.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">Pas encore d'envoi</div>
            <p className="empty-text" style={{ margin: 0 }}>
              Lancez l'envoi pour voir ici le détail destinataire par destinataire.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Adresses</th>
                  <th>Statut</th>
                  <th>Détail</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {newsletter.envois.map((e) => (
                  <tr key={e.id}>
                    <td className="td-strong td-main">{e.clientNom}</td>
                    <td data-label="Adresses">{e.email}</td>
                    <td data-label="Statut">
                      <span className={`pill ${e.statut === "ENVOYE" ? "pill-success" : "pill-danger"}`}>
                        {e.statut === "ENVOYE" ? "Envoyé" : "Échec"}
                      </span>
                    </td>
                    <td data-label="Détail">{e.erreur ?? "-"}</td>
                    <td data-label="Date">{formatDate(e.createdAt)}</td>
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
