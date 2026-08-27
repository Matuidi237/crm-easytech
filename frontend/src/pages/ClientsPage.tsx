import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Beneficiaire,
  Client,
  ClientFilters,
  Facets,
  LIBELLES_ROLES,
  accorderAcces,
  deleteClient,
  fetchBeneficiaires,
  fetchClients,
  fetchFacets,
} from "../api";
import { useAuth } from "../AuthContext";
import {
  IconAlert,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconCopy,
  IconDownload,
  IconExternal,
  IconFilter,
  IconInbox,
  IconMail,
  IconMore,
  IconPlus,
  IconCheck,
  IconSearch,
  IconShield,
  IconTrash,
  IconUsers,
} from "../components/Icons";

const PAGE_SIZE = 25;

/* Pastilles de monogramme — repère visuel de ligne, pas un encodage de donnée. */
const TINTS = [
  { bg: "#e8f3fb", fg: "#1f5f8b" },
  { bg: "#e2f4f1", fg: "#0c7a6f" },
  { bg: "#eeebfa", fg: "#544ab8" },
  { bg: "#fcf2e0", fg: "#8a5f05" },
  { bg: "#fae9ee", fg: "#a33d5b" },
];

function tintDe(nom: string) {
  let h = 0;
  for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

function initialesDe(nom: string) {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

function contactsDe(client: Client) {
  return (client.emailContact ?? "")
    .split(";")
    .map((e) => e.trim())
    .filter(Boolean);
}

type Tri = { champ: string; ordre: "asc" | "desc" };

export default function ClientsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tri, setTri] = useState<Tri>({ champ: "nom", ordre: "asc" });
  const [facets, setFacets] = useState<Facets>({ pays: [], villes: [], secteurs: [], commerciaux: [] });
  const [filters, setFilters] = useState<ClientFilters>({ recherche: searchParams.get("recherche") ?? "" });
  const [avances, setAvances] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ client: Client; x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headCheck = useRef<HTMLInputElement>(null);

  const { peut } = useAuth();
  const [octroiOuvert, setOctroiOuvert] = useState(false);
  const [beneficiaires, setBeneficiaires] = useState<Beneficiaire[]>([]);
  const [beneficiaire, setBeneficiaire] = useState("");
  const [octroiEnCours, setOctroiEnCours] = useState(false);
  const [succes, setSucces] = useState<string | null>(null);

  useEffect(() => {
    fetchFacets().then(setFacets).catch(() => {});
  }, []);

  useEffect(() => {
    const q = searchParams.get("recherche") ?? "";
    setFilters((f) => (f.recherche === q ? f : { ...f, recherche: q }));
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchClients({ ...filters, page, pageSize: PAGE_SIZE, tri: tri.champ, ordre: tri.ordre })
      .then((res) => {
        setClients(res.clients);
        setTotal(res.total);
        setSelection(new Set());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filters, page, tri]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const toutSelectionne = clients.length > 0 && selection.size === clients.length;
  useEffect(() => {
    if (headCheck.current) headCheck.current.indeterminate = selection.size > 0 && !toutSelectionne;
  }, [selection, toutSelectionne]);

  function updateFilter<K extends keyof ClientFilters>(key: K, value: ClientFilters[K]) {
    setPage(1);
    if (key === "recherche") {
      const q = String(value ?? "");
      setSearchParams(q ? { recherche: q } : {}, { replace: true });
    }
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function resetFilters() {
    setSearchParams({}, { replace: true });
    setFilters({});
    setPage(1);
  }

  function trierPar(champ: string) {
    setPage(1);
    setTri((t) => (t.champ === champ ? { champ, ordre: t.ordre === "asc" ? "desc" : "asc" } : { champ, ordre: "asc" }));
  }

  function basculerLigne(id: string) {
    setSelection((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function supprimer(ids: string[], libelle: string) {
    if (!confirm(`Supprimer ${libelle} ? Cette action est définitive.`)) return;
    setBusy(true);
    setError(null);
    try {
      for (const id of ids) await deleteClient(id);
      setClients((cs) => cs.filter((c) => !ids.includes(c.id)));
      setTotal((t) => t - ids.length);
      setSelection(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function ouvrirOctroi() {
    setSucces(null);
    setError(null);
    fetchBeneficiaires()
      .then((b) => {
        setBeneficiaires(b);
        setBeneficiaire(b[0]?.id ?? "");
        setOctroiOuvert(true);
      })
      .catch((e) => setError(e.message));
  }

  async function validerOctroi() {
    if (!beneficiaire) return;
    setOctroiEnCours(true);
    setError(null);
    try {
      const r = await accorderAcces(beneficiaire, [...selection]);
      const nom = beneficiaires.find((b) => b.id === beneficiaire)?.nomComplet ?? "ce compte";
      const dejaOuverts = r.dejaOuverts > 0 ? ` ${r.dejaOuverts} l'étaient déjà.` : "";
      setSucces(
        r.accordes > 0
          ? `${r.accordes} client(s) désormais accessibles à ${nom}.` + dejaOuverts
          : `Ces clients étaient déjà accessibles à ${nom}.`
      );
      setOctroiOuvert(false);
      setSelection(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOctroiEnCours(false);
    }
  }

  async function exporter() {
    setBusy(true);
    setError(null);
    try {
      const lignes: Client[] = [];
      let p = 1;
      for (;;) {
        const res = await fetchClients({ ...filters, page: p, pageSize: 500, tri: tri.champ, ordre: tri.ordre });
        lignes.push(...res.clients);
        if (res.clients.length === 0 || lignes.length >= res.total) break;
        p++;
      }

      const colonnes: [string, (c: Client) => string][] = [
        ["Nom du client", (c) => c.nom],
        ["Secteur d'activité", (c) => c.secteurActivite ?? ""],
        ["Pays", (c) => c.pays ?? ""],
        ["Ville", (c) => c.ville ?? ""],
        ["Adresse physique", (c) => c.adressePhysique ?? ""],
        ["Site web", (c) => c.siteWeb ?? ""],
        ["Adresse mail", (c) => c.emailContact ?? ""],
        ["Téléphone", (c) => c.telephone ?? ""],
        ["Nom du contact (interne)", (c) => c.nomContactInterne ?? ""],
        ["Commercial en charge", (c) => c.commercialEnCharge ?? ""],
        ["Chiffre d'affaires", (c) => (c.chiffreAffaires ? String(c.chiffreAffaires) : "")],
      ];

      const esc = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      const csv = [
        colonnes.map(([t]) => esc(t)).join(","),
        ...lignes.map((c) => colonnes.map(([, f]) => esc(f(c))).join(",")),
      ].join("\n");

      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clients-easytech-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtresActifs = useMemo(
    () => Object.entries(filters).filter(([, v]) => v !== undefined && v !== "").length,
    [filters]
  );
  const debut = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const fin = Math.min(page * PAGE_SIZE, total);

  const Th = ({ champ, children }: { champ: string; children: string }) => {
    const actif = tri.champ === champ;
    return (
      <th className={`sortable${actif ? " active" : ""}`}>
        <button onClick={() => trierPar(champ)}>
          {children}
          <span className={`sort-arrows${actif ? ` ${tri.ordre}` : ""}`}>
            <i />
            <i />
          </span>
        </button>
      </th>
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <div className="head-meta">
            <IconUsers size={15} />
            {loading ? "Chargement…" : <span>Total : <b>{total.toLocaleString("fr-FR")}</b></span>}
          </div>
        </div>
        <div className="head-actions">
          <button className="btn btn-ghost" onClick={exporter} disabled={busy || total === 0}>
            <IconDownload />
            Exporter
          </button>
          <Link to="/import" className="btn btn-primary">
            <IconPlus />
            Importer des clients
          </Link>
        </div>
      </div>

      <div>
        <div className="filters-row">
          <div className="search" style={{ flex: "0 1 280px" }}>
            <IconSearch />
            <input
              type="search"
              placeholder="Nom, email, contact…"
              style={{ height: 36 }}
              value={filters.recherche ?? ""}
              onChange={(e) => updateFilter("recherche", e.target.value)}
            />
          </div>

          <div className={`select-pill${filters.pays ? " on" : ""}`}>
            <select value={filters.pays ?? ""} onChange={(e) => updateFilter("pays", e.target.value)}>
              <option value="">Pays</option>
              {facets.pays.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <IconChevronDown size={14} />
          </div>

          <div className={`select-pill${filters.secteurActivite ? " on" : ""}`}>
            <select
              value={filters.secteurActivite ?? ""}
              onChange={(e) => updateFilter("secteurActivite", e.target.value)}
            >
              <option value="">Secteur</option>
              {facets.secteurs.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <IconChevronDown size={14} />
          </div>

          {facets.commerciaux.length > 0 && (
            <div className={`select-pill${filters.commercialEnCharge ? " on" : ""}`}>
              <select
                value={filters.commercialEnCharge ?? ""}
                onChange={(e) => updateFilter("commercialEnCharge", e.target.value)}
              >
                <option value="">Commercial</option>
                {facets.commerciaux.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <IconChevronDown size={14} />
            </div>
          )}

          <button className={`btn-filters${avances ? " on" : ""}`} onClick={() => setAvances((a) => !a)}>
            <IconFilter />
            Plus de filtres
          </button>

          {filtresActifs > 0 && (
            <button className="link-action" onClick={resetFilters}>
              Réinitialiser
            </button>
          )}
        </div>

        {avances && (
          <div className="filters-advanced">
            {facets.villes.length > 0 && (
              <div className={`select-pill${filters.ville ? " on" : ""}`}>
                <select value={filters.ville ?? ""} onChange={(e) => updateFilter("ville", e.target.value)}>
                  <option value="">Ville</option>
                  {facets.villes.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <IconChevronDown size={14} />
              </div>
            )}
            <input
              className="input"
              type="number"
              placeholder="CA min (XAF)"
              style={{ maxWidth: 150 }}
              value={filters.caMin ?? ""}
              onChange={(e) => updateFilter("caMin", e.target.value)}
            />
            <input
              className="input"
              type="number"
              placeholder="CA max (XAF)"
              style={{ maxWidth: 150 }}
              value={filters.caMax ?? ""}
              onChange={(e) => updateFilter("caMax", e.target.value)}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error">
          <IconAlert />
          {error}
        </div>
      )}
      {succes && (
        <div className="alert alert-success">
          <IconCheck />
          {succes}
        </div>
      )}

      <div className="table-card">
        {selection.size > 0 && (
          <div className="bulk-bar">
            <span>
              {selection.size} client{selection.size > 1 ? "s" : ""} sélectionné{selection.size > 1 ? "s" : ""}
            </span>
            <div className="bulk-spacer" />
            <button className="link-action" onClick={() => setSelection(new Set())}>
              Tout désélectionner
            </button>
            {peut("acces.accorder") && (
              <button className="btn btn-soft btn-sm" onClick={ouvrirOctroi}>
                <IconShield size={14} />
                Donner l'accès à…
              </button>
            )}
            {peut("clients.supprimer") && (
              <button
                className="btn btn-danger btn-sm"
                disabled={busy}
                onClick={() =>
                  supprimer([...selection], `${selection.size} client${selection.size > 1 ? "s" : ""}`)
                }
              >
                <IconTrash size={14} />
                Supprimer
              </button>
            )}
          </div>
        )}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="col-check">
                  <input
                    ref={headCheck}
                    type="checkbox"
                    checked={toutSelectionne}
                    onChange={() => setSelection(toutSelectionne ? new Set() : new Set(clients.map((c) => c.id)))}
                    aria-label="Tout sélectionner"
                  />
                </th>
                <Th champ="nom">Client</Th>
                <Th champ="secteurActivite">Secteur</Th>
                <Th champ="pays">Localisation</Th>
                <th>Contacts</th>
                <Th champ="commercialEnCharge">Commercial</Th>
                <Th champ="chiffreAffaires">Chiffre d'affaires</Th>
                <th className="col-actions" />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const contacts = contactsDe(c);
                const tint = tintDe(c.nom);
                const selectionne = selection.has(c.id);
                return (
                  <tr key={c.id} className={selectionne ? "row-selected" : undefined}>
                    <td className="col-check">
                      <input
                        type="checkbox"
                        checked={selectionne}
                        onChange={() => basculerLigne(c.id)}
                        aria-label={`Sélectionner ${c.nom}`}
                      />
                    </td>
                    <td className="td-main">
                      <div className="cell-client">
                        <span className="avatar-mono" style={{ background: tint.bg, color: tint.fg }}>
                          {initialesDe(c.nom)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="cc-name">{c.nom}</div>
                          {c.siteWeb && <div className="cc-sub">{c.siteWeb.replace(/^https?:\/\//, "")}</div>}
                        </div>
                      </div>
                    </td>
                    <td data-label="Secteur">{c.secteurActivite ?? "-"}</td>
                    <td data-label="Localisation">{[c.ville, c.pays].filter(Boolean).join(", ") || "-"}</td>
                    <td data-label="Contacts">
                      {contacts.length === 0 ? (
                        "-"
                      ) : (
                        <>
                          {contacts[0]}
                          {contacts.length > 1 && (
                            <span className="tag" style={{ marginLeft: 6 }}>
                              +{contacts.length - 1}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td data-label="Commercial">{c.commercialEnCharge ?? "-"}</td>
                    <td className="num" data-label="Chiffre d'affaires">
                      {c.chiffreAffaires ? `${Number(c.chiffreAffaires).toLocaleString("fr-FR")} XAF` : "-"}
                    </td>
                    <td className="col-actions">
                      <div className="row-actions">
                        {contacts.length > 0 && (
                          <a
                            className="icon-btn-xs"
                            href={`mailto:${contacts.join(",")}`}
                            title={`Écrire à ${c.nom}`}
                            aria-label={`Écrire à ${c.nom}`}
                          >
                            <IconMail size={15} />
                          </a>
                        )}
                        <button
                          className="icon-btn-xs plain"
                          aria-label={`Actions pour ${c.nom}`}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setMenu(menu?.client.id === c.id ? null : { client: c, x: r.right, y: r.bottom });
                          }}
                        >
                          <IconMore />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && clients.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 0 }}>
                    <div className="empty">
                      <div className="empty-icon">
                        <IconInbox />
                      </div>
                      <div className="empty-title">Aucun client trouvé</div>
                      <p className="empty-text" style={{ margin: 0 }}>
                        {filtresActifs > 0
                          ? "Aucun résultat pour ces critères. Essayez d'en retirer un."
                          : "La base est vide, importez un fichier pour commencer."}
                      </p>
                      {filtresActifs > 0 ? (
                        <button className="btn btn-ghost btn-sm" onClick={resetFilters} style={{ marginTop: 6 }}>
                          Réinitialiser les filtres
                        </button>
                      ) : (
                        <Link to="/import" className="btn btn-primary btn-sm" style={{ marginTop: 6 }}>
                          Importer un fichier
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {clients.length > 0 && (
          <div className="table-foot">
            <span>
              {debut} à {fin} sur {total.toLocaleString("fr-FR")}
            </span>
            <div className="pager">
              <button disabled={page <= 1} onClick={() => setPage(1)} aria-label="Première page">
                <IconChevronsLeft />
              </button>
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Page précédente">
                <IconChevronLeft />
              </button>
              <span className="pager-page">
                Page {page} sur {totalPages}
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Page suivante">
                <IconChevronRight />
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} aria-label="Dernière page">
                <IconChevronsRight />
              </button>
            </div>
          </div>
        )}
      </div>

      {octroiOuvert && (
        <div className="modal-backdrop" onClick={() => setOctroiOuvert(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Donner accès à ces clients</h3>
            <p className="modal-sub">
              {selection.size} client{selection.size > 1 ? "s" : ""} sélectionné{selection.size > 1 ? "s" : ""}. Le
              compte choisi pourra les consulter, en plus de ses propres prospects. Les comptes qui voient déjà toute
              la base ne figurent pas dans cette liste.
            </p>

            {beneficiaires.length === 0 ? (
              <div className="alert alert-info">
                <IconAlert />
                Aucun compte à périmètre restreint pour le moment. Créez un commercial depuis la page Utilisateurs.
              </div>
            ) : (
              <div className="field">
                <label htmlFor="beneficiaire">Compte bénéficiaire</label>
                <select id="beneficiaire" value={beneficiaire} onChange={(e) => setBeneficiaire(e.target.value)}>
                  {beneficiaires.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nomComplet} · {LIBELLES_ROLES[b.role].toLowerCase()} · {b.nbAcces} accès
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setOctroiOuvert(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={validerOctroi}
                disabled={octroiEnCours || beneficiaires.length === 0}
              >
                {octroiEnCours ? "Ouverture…" : "Ouvrir l'accès"}
              </button>
            </div>
          </div>
        </div>
      )}

      {menu && (
        <div
          className="menu menu--fixed"
          style={{ left: menu.x - 186, top: menu.y + 6 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {contactsDe(menu.client).length > 0 && (
            <button
              className="menu-item"
              onClick={() => {
                navigator.clipboard?.writeText(contactsDe(menu.client).join("; "));
                setMenu(null);
              }}
            >
              <IconCopy />
              Copier les adresses
            </button>
          )}
          {menu.client.siteWeb && (
            <a
              className="menu-item"
              href={menu.client.siteWeb.startsWith("http") ? menu.client.siteWeb : `https://${menu.client.siteWeb}`}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => setMenu(null)}
            >
              <IconExternal />
              Ouvrir le site web
            </a>
          )}
          <div className="menu-sep" />
          <button
            className="menu-item danger"
            onClick={() => {
              const c = menu.client;
              setMenu(null);
              supprimer([c.id], `« ${c.nom} »`);
            }}
          >
            <IconTrash />
            Supprimer le client
          </button>
        </div>
      )}
    </>
  );
}
