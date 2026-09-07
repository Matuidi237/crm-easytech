import { ComponentType, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Stats, fetchStats } from "../api";
import { useLangue } from "../i18n";
import { BarList, Donut, foldTail } from "../components/Charts";
import { IconAlert, IconArrowRight, IconInbox, IconLayers, IconMail, IconSend, IconUsers } from "../components/Icons";

type StatDef = {
  label: string;
  value: string;
  note: string;
  icon: ComponentType<{ size?: number }>;
  fg: string;
  bg: string;
};

function StatCard({ label, value, note, icon: Icon, fg, bg }: StatDef) {
  return (
    <div className="stat">
      <div className="stat-top">
        <div className="stat-badge" style={{ background: bg, color: fg }}>
          <Icon size={21} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
        </div>
      </div>
      <div className="stat-note">{note}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { t, nombre } = useLangue();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats().then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="alert alert-error">
        <IconAlert />
        {error}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="card">
        <p className="muted-3" style={{ margin: 0 }}>
          {t("commun.chargementDonnees")}
        </p>
      </div>
    );
  }

  const topSecteur = stats.repartitionSecteur[0];

  const cards: StatDef[] = [
    {
      label: t("dash.carte.clients"),
      value: nombre(stats.totalClients),
      note: stats.nbPays > 0 ? t("dash.carte.clientsNote", { n: stats.nbPays }) : t("dash.carte.clientsNoteVide"),
      icon: IconUsers,
      fg: "#2a79ae",
      bg: "#e8f3fb",
    },
    {
      label: t("dash.carte.contacts"),
      value: nombre(stats.nbContacts),
      note: t("dash.carte.contactsNote", {
        joignables: nombre(stats.nbClientsAvecEmail),
        total: nombre(stats.totalClients),
      }),
      icon: IconMail,
      fg: "#0c8074",
      bg: "#e2f4f1",
    },
    {
      label: t("dash.carte.secteurs"),
      value: nombre(stats.nbSecteurs),
      note: topSecteur
        ? t("dash.carte.secteursNote", { label: topSecteur.label, n: topSecteur.count })
        : t("dash.carte.secteursNoteVide"),
      icon: IconLayers,
      fg: "#5b4bc4",
      bg: "#eeebfa",
    },
    {
      label: t("dash.carte.newsletters"),
      value: nombre(stats.newslettersEnvoyees),
      note:
        stats.newslettersEnvoyees > 0
          ? t("dash.carte.newslettersNote")
          : t("dash.carte.newslettersNoteVide"),
      icon: IconSend,
      fg: "#9e6b06",
      bg: "#fcf2e0",
    },
  ];

  const secteursTop = stats.repartitionSecteur.slice(0, 8);
  const paysDonut = foldTail(stats.repartitionPays, 5, t("viz.autres"));
  const clientsLocalises = stats.repartitionPays.reduce((s, p) => s + p.count, 0);
  const sansPays = stats.totalClients - clientsLocalises;
  const vide = stats.totalClients === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("dash.titre")}</h1>
          <div className="page-sub">{t("dash.sousTitre")}</div>
        </div>
        <Link to="/import" className="btn btn-soft">
          {t("dash.importerClients")}
        </Link>
      </div>

      <div className="stat-grid">
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      {vide ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("dash.videTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("dash.videTexte")}
            </p>
            <Link to="/import" className="btn btn-primary" style={{ marginTop: 6 }}>
              {t("dash.importerFichier")}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="dash-grid">
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">{t("dash.secteursTitre")}</div>
                  <div className="card-sub">
                    {t("dash.secteursSousTitre", { n: secteursTop.length, total: stats.nbSecteurs })}
                  </div>
                </div>
                <Link to="/clients" className="btn btn-ghost btn-sm">
                  {t("dash.filtrer")}
                </Link>
              </div>
              <BarList data={secteursTop} total={stats.totalClients} />
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">{t("dash.paysTitre")}</div>
                  <div className="card-sub">
                    {t("dash.paysSousTitre", { n: stats.nbPays })}
                    {sansPays > 0 && t("dash.paysSansPays", { n: sansPays })}
                  </div>
                </div>
              </div>
              <Donut data={paysDonut} centerLabel={t("dash.clientsLocalises")} />
            </div>
          </div>

          <div className="table-card">
            <div className="card-head">
              <div className="card-title">{t("dash.derniersClients")}</div>
              <Link
                to="/clients"
                className="link-action"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {t("dash.tousLesClients")}
                <IconArrowRight size={15} />
              </Link>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("dash.colClient")}</th>
                    <th>{t("dash.colSecteur")}</th>
                    <th>{t("dash.colPays")}</th>
                    <th>{t("dash.colContact")}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.dernierClients.map((c) => (
                    <tr key={c.id}>
                      <td className="td-strong td-main">{c.nom}</td>
                      <td data-label={t("dash.colSecteur")}>{c.secteurActivite ?? "-"}</td>
                      <td data-label={t("dash.colPays")}>{c.pays ?? "-"}</td>
                      <td data-label={t("dash.colContact")}>{c.emailContact?.split(";")[0].trim() ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
