import { ComponentType, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Stats, fetchStats } from "../api";
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
          Chargement des données…
        </p>
      </div>
    );
  }

  const topSecteur = stats.repartitionSecteur[0];
  const nombre = (n: number) => n.toLocaleString("fr-FR");

  const cards: StatDef[] = [
    {
      label: "Clients",
      value: nombre(stats.totalClients),
      note: stats.nbPays > 0 ? `Répartis sur ${stats.nbPays} pays` : "Aucun pays renseigné",
      icon: IconUsers,
      fg: "#2a79ae",
      bg: "#e8f3fb",
    },
    {
      label: "Contacts email",
      value: nombre(stats.nbContacts),
      note: `${nombre(stats.nbClientsAvecEmail)} clients joignables sur ${nombre(stats.totalClients)}`,
      icon: IconMail,
      fg: "#0c8074",
      bg: "#e2f4f1",
    },
    {
      label: "Secteurs d'activité",
      value: nombre(stats.nbSecteurs),
      note: topSecteur ? `Principal : ${topSecteur.label} (${topSecteur.count})` : "Aucun secteur renseigné",
      icon: IconLayers,
      fg: "#5b4bc4",
      bg: "#eeebfa",
    },
    {
      label: "Newsletters envoyées",
      value: nombre(stats.newslettersEnvoyees),
      note: stats.newslettersEnvoyees > 0 ? "Historique disponible par campagne" : "Aucune campagne envoyée",
      icon: IconSend,
      fg: "#9e6b06",
      bg: "#fcf2e0",
    },
  ];

  const secteursTop = stats.repartitionSecteur.slice(0, 8);
  const paysDonut = foldTail(stats.repartitionPays, 5);
  const clientsLocalises = stats.repartitionPays.reduce((s, p) => s + p.count, 0);
  const sansPays = stats.totalClients - clientsLocalises;
  const vide = stats.totalClients === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tableau de bord</h1>
          <div className="page-sub">Vue d'ensemble de la base clients</div>
        </div>
        <Link to="/import" className="btn btn-soft">
          Importer des clients
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
            <div className="empty-title">Aucun client dans la base</div>
            <p className="empty-text" style={{ margin: 0 }}>
              Importez un fichier CSV, Excel ou JSON pour commencer à exploiter vos données.
            </p>
            <Link to="/import" className="btn btn-primary" style={{ marginTop: 6 }}>
              Importer un fichier
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="dash-grid">
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Secteurs d'activité</div>
                  <div className="card-sub">
                    {secteursTop.length} principaux sur {stats.nbSecteurs}
                  </div>
                </div>
                <Link to="/clients" className="btn btn-ghost btn-sm">
                  Filtrer
                </Link>
              </div>
              <BarList data={secteursTop} total={stats.totalClients} />
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Répartition par pays</div>
                  <div className="card-sub">
                    {stats.nbPays} pays représentés
                    {sansPays > 0 && ` · ${sansPays} clients sans pays renseigné`}
                  </div>
                </div>
              </div>
              <Donut data={paysDonut} centerLabel="clients localisés" />
            </div>
          </div>

          <div className="table-card">
            <div className="card-head">
              <div className="card-title">Derniers clients ajoutés</div>
              <Link
                to="/clients"
                className="link-action"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                Tous les clients
                <IconArrowRight size={15} />
              </Link>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Secteur</th>
                    <th>Pays</th>
                    <th>Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.dernierClients.map((c) => (
                    <tr key={c.id}>
                      <td className="td-strong td-main">{c.nom}</td>
                      <td data-label="Secteur">{c.secteurActivite ?? "-"}</td>
                      <td data-label="Pays">{c.pays ?? "-"}</td>
                      <td data-label="Contact">{c.emailContact?.split(";")[0].trim() ?? "-"}</td>
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
