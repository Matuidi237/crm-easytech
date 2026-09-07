import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Newsletter, NewsletterEnvoi, deleteNewsletter, fetchNewsletter, sendNewsletter } from "../api";
import { useLangue } from "../i18n";
import { IconAlert, IconArrowLeft, IconCheck, IconInbox, IconSend, IconTrash } from "../components/Icons";
import { STATUT_PILL } from "./NewslettersPage";

export default function NewsletterDetailPage() {
  const { t, dateHeure } = useLangue();
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
        ? t("nld.cibleTous")
        : t("nld.cibleSecteurs", { secteurs: newsletter.secteursCibles.join(", ") });
    if (!confirm(t("nld.confirmerEnvoi", { titre: newsletter.titre, cible }))) return;

    setSending(true);
    setError(null);
    try {
      const res = await sendNewsletter(id);
      setMailerNote({
        live: res.mailerLive,
        text: res.mailerLive ? t("nld.envoiReel") : t("nld.envoiSimule"),
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
    if (!confirm(t("nld.confirmerSuppression"))) return;
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
  if (!newsletter)
    return (
      <div className="card">
        <p className="muted-3" style={{ margin: 0 }}>
          {t("commun.chargement")}
        </p>
      </div>
    );

  const st = STATUT_PILL[newsletter.statut];
  const echecs = newsletter.envois.filter((e) => e.statut === "ECHEC").length;

  return (
    <>
      <Link
        to="/newsletters"
        className="link-action"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
      >
        <IconArrowLeft size={15} />
        {t("nld.retour")}
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
              {sending ? t("nld.envoiEnCours") : t("nld.envoyer")}
            </button>
          )}
          <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
            <IconTrash size={15} />
            {deleting ? t("commun.suppression") : t("commun.supprimer")}
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
            <div className="meta-label">{t("nld.metaStatut")}</div>
            <div className="meta-value">
              <span className={`pill ${st?.cls ?? "pill-neutral"}`}>{st ? t(st.cle) : newsletter.statut}</span>
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-label">{t("nld.metaSecteurs")}</div>
            <div className="meta-value">
              {newsletter.secteursCibles.length === 0
                ? t("nl.tousLesClients")
                : newsletter.secteursCibles.join(", ")}
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-label">{t("nld.metaDestinataires")}</div>
            <div className="meta-value">{newsletter.nbDestinataires ?? "-"}</div>
          </div>
          <div className="meta-item">
            <div className="meta-label">{t("nld.metaEnvoyesEchecs")}</div>
            <div className="meta-value">
              {newsletter.nbEnvoyes ?? "-"} / {newsletter.nbEchecs ?? "-"}
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-label">{t("nld.metaEnvoyeeLe")}</div>
            <div className="meta-value">{newsletter.envoyeeLe ? dateHeure(newsletter.envoyeeLe) : "-"}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("nld.apercuTitre")}</div>
            <div className="card-sub">
              {newsletter.format === "HTML" ? t("nld.apercuHtml") : t("nld.apercuTexte")}
            </div>
          </div>
          <span className="pill pill-neutral">{newsletter.format}</span>
        </div>

        {newsletter.format === "HTML" ? (
          <iframe
            title={t("nld.apercuIframe")}
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
            <div className="card-title">{t("nld.historiqueTitre")}</div>
            <div className="card-sub">
              {newsletter.envois.length === 0
                ? t("nld.historiqueVide")
                : (newsletter.envois.length > 1
                    ? t("nld.historiqueN", { n: newsletter.envois.length })
                    : t("nld.historiqueUn")) +
                  (echecs > 0
                    ? echecs > 1
                      ? t("nld.historiqueEchecN", { n: echecs })
                      : t("nld.historiqueEchecUn")
                    : "")}
            </div>
          </div>
        </div>

        {newsletter.envois.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("nld.pasEncoreTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("nld.pasEncoreTexte")}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("nld.colClient")}</th>
                  <th>{t("nld.colAdresses")}</th>
                  <th>{t("nld.colStatut")}</th>
                  <th>{t("nld.colDetail")}</th>
                  <th>{t("nld.colDate")}</th>
                </tr>
              </thead>
              <tbody>
                {newsletter.envois.map((e) => (
                  <tr key={e.id}>
                    <td className="td-strong td-main">{e.clientNom}</td>
                    <td data-label={t("nld.colAdresses")}>{e.email}</td>
                    <td data-label={t("nld.colStatut")}>
                      <span className={`pill ${e.statut === "ENVOYE" ? "pill-success" : "pill-danger"}`}>
                        {e.statut === "ENVOYE" ? t("nld.envoye") : t("nld.echec")}
                      </span>
                    </td>
                    <td data-label={t("nld.colDetail")}>{e.erreur ?? "-"}</td>
                    <td data-label={t("nld.colDate")}>{dateHeure(e.createdAt)}</td>
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
