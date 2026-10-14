import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Beneficiaire,
  Client,
  ClientFilters,
  Facets,
  accorderAcces,
  deleteClient,
  fetchBeneficiaires,
  fetchClients,
  fetchFacets,
} from "../api";
import { useAuth } from "../AuthContext";
import { useLangue, useLibelles } from "../i18n";
import DialogueClient from "../components/DialogueClient";
import ListeDeroulante from "../components/ListeDeroulante";
import {
  IconAlert,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconClose,
  IconCopy,
  IconDownload,
  IconEdit,
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
  const { t, nombre } = useLangue();
  const libelles = useLibelles();
  const [octroiOuvert, setOctroiOuvert] = useState(false);
  const [beneficiaires, setBeneficiaires] = useState<Beneficiaire[]>([]);
  const [beneficiaire, setBeneficiaire] = useState("");
  const [octroiEnCours, setOctroiEnCours] = useState(false);
  const [succes, setSucces] = useState<string | null>(null);
  const [nouveauOuvert, setNouveauOuvert] = useState(false);
  const [ficheAModifier, setFicheAModifier] = useState<Client | null>(null);
  /* Incrémenté après une création : il force le rechargement de la liste sans
     dupliquer la requête, et sans deviner où la nouvelle fiche se range dans
     le tri et la pagination en cours. */
  const [version, setVersion] = useState(0);

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
  }, [filters, page, tri, version]);

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
    if (!confirm(t("clients.confirmerSuppression", { libelle }))) return;
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
      const nom = beneficiaires.find((b) => b.id === beneficiaire)?.nomComplet ?? t("clients.ceCompte");
      const dejaOuverts = r.dejaOuverts > 0 ? t("clients.octroiDejaOuverts", { n: r.dejaOuverts }) : "";
      setSucces(
        r.accordes > 0
          ? t("clients.octroiFait", { n: r.accordes, nom }) + dejaOuverts
          : t("clients.octroiRien", { nom })
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

      // Les entêtes du CSV suivent la langue affichée : le fichier part chez
      // la personne qui l'a demandé, il n'a pas vocation à servir de format
      // d'échange figé.
      const colonnes: [string, (c: Client) => string][] = [
        [t("clients.exportNom"), (c) => c.nom],
        [t("clients.exportSecteur"), (c) => c.secteurActivite ?? ""],
        [t("clients.exportPays"), (c) => c.pays ?? ""],
        [t("clients.exportVille"), (c) => c.ville ?? ""],
        [t("clients.exportAdresse"), (c) => c.adressePhysique ?? ""],
        [t("clients.exportSite"), (c) => c.siteWeb ?? ""],
        [t("clients.exportEmail"), (c) => c.emailContact ?? ""],
        [t("clients.exportTelephone"), (c) => c.telephone ?? ""],
        [t("clients.exportContact"), (c) => c.nomContactInterne ?? ""],
        [t("clients.exportCommercial"), (c) => c.commercialEnCharge ?? ""],
        [t("clients.exportCa"), (c) => (c.chiffreAffaires ? String(c.chiffreAffaires) : "")],
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

  /* Le compte ne voit que son portefeuille : c'est la règle d'accès, et
     l'écran doit la dire plutôt que de laisser croire à une base vide. */
  const perimetreRestreint = !peut("clients.voirTous");

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
          <h1>{perimetreRestreint ? t("nav.portefeuille") : t("clients.titre")}</h1>
          <div className="head-meta">
            <IconUsers size={15} />
            {loading ? (
              t("commun.chargement")
            ) : (
              <span>
                {t("commun.total")} <b>{nombre(total)}</b>
              </span>
            )}
            {/* Dire d'emblée pourquoi la liste est courte : sans cette phrase,
                un commercial croit la base vide et redemande un import. */}
            {perimetreRestreint && <span className="head-perimetre">{t("clients.perimetreNote")}</span>}
          </div>
        </div>
        <div className="head-actions">
          <button className="btn btn-ghost" onClick={exporter} disabled={busy || total === 0}>
            <IconDownload />
            {t("clients.exporter")}
          </button>
          {/* Importer reste disponible pour un lot ; ajouter couvre le cas le
              plus fréquent, le prospect rencontré hier, qui ne justifie pas de
              fabriquer un fichier. */}
          {peut("clients.importer") && (
            <Link to="/import" className="btn btn-ghost">
              <IconDownload />
              {t("clients.importerClients")}
            </Link>
          )}
          {peut("clients.creer") && (
            <button className="btn btn-primary" onClick={() => setNouveauOuvert(true)}>
              <IconPlus />
              {t("clients.nouveau")}
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="filters-row">
          <div className="search" style={{ flex: "0 1 280px" }}>
            <IconSearch />
            <input
              type="search"
              placeholder={t("clients.rechercher")}
              style={{ height: 36 }}
              value={filters.recherche ?? ""}
              onChange={(e) => updateFilter("recherche", e.target.value)}
            />
          </div>

          <ListeDeroulante
            id="filtre-pays"
            valeur={filters.pays ?? ""}
            options={facets.pays}
            onChange={(v) => updateFilter("pays", v)}
            placeholder={t("clients.filtrePays")}
            videLibelle={t("clients.filtrePays")}
          />

          <ListeDeroulante
            id="filtre-secteurActivite"
            valeur={filters.secteurActivite ?? ""}
            options={facets.secteurs}
            onChange={(v) => updateFilter("secteurActivite", v)}
            placeholder={t("clients.filtreSecteur")}
            videLibelle={t("clients.filtreSecteur")}
            recherche
          />

          {facets.commerciaux.length > 0 && (
          <ListeDeroulante
            id="filtre-commercialEnCharge"
            valeur={filters.commercialEnCharge ?? ""}
            options={facets.commerciaux}
            onChange={(v) => updateFilter("commercialEnCharge", v)}
            placeholder={t("clients.filtreCommercial")}
            videLibelle={t("clients.filtreCommercial")}
            recherche
          />
          )}

          <button className={`btn-filters${avances ? " on" : ""}`} onClick={() => setAvances((a) => !a)}>
            <IconFilter />
            {t("clients.plusDeFiltres")}
          </button>

          {filtresActifs > 0 && (
            <button className="link-action" onClick={resetFilters}>
              {t("commun.reinitialiser")}
            </button>
          )}
        </div>

        {/* Les filtres posés, rappelés et retirables un par un. Sans eux, il
            faut retrouver le bon menu déroulant pour en annuler un seul, et
            la liste réduite finit par passer pour la liste entière. */}
        {filtresActifs > 0 && (
          <div className="filtres-poses">
            {(
              [
                ["recherche", t("clients.rechercher")],
                ["pays", t("clients.filtrePays")],
                ["ville", t("clients.filtreVille")],
                ["secteurActivite", t("clients.filtreSecteur")],
                ["commercialEnCharge", t("clients.filtreCommercial")],
                ["caMin", t("clients.caMin")],
                ["caMax", t("clients.caMax")],
              ] as const
            )
              .filter(([cle]) => filters[cle] !== undefined && filters[cle] !== "")
              .map(([cle, libelle]) => (
                <button
                  key={cle}
                  type="button"
                  className="filtre-pose"
                  onClick={() => updateFilter(cle, "")}
                  aria-label={t("clients.retirerFiltre", { filtre: libelle })}
                >
                  <span className="filtre-pose-cle">{libelle}</span>
                  <span className="filtre-pose-valeur">{String(filters[cle])}</span>
                  <IconClose size={13} />
                </button>
              ))}
          </div>
        )}

        {avances && (
          <div className="filters-advanced">
            {facets.villes.length > 0 && (
          <ListeDeroulante
            id="filtre-ville"
            valeur={filters.ville ?? ""}
            options={facets.villes}
            onChange={(v) => updateFilter("ville", v)}
            placeholder={t("clients.filtreVille")}
            videLibelle={t("clients.filtreVille")}
            recherche
          />
            )}
            <input
              className="input"
              type="number"
              placeholder={t("clients.caMin")}
              style={{ maxWidth: 150 }}
              value={filters.caMin ?? ""}
              onChange={(e) => updateFilter("caMin", e.target.value)}
            />
            <input
              className="input"
              type="number"
              placeholder={t("clients.caMax")}
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
              {selection.size > 1 ? t("clients.selectionN", { n: selection.size }) : t("clients.selectionUn")}
            </span>
            <div className="bulk-spacer" />
            <button className="link-action" onClick={() => setSelection(new Set())}>
              {t("clients.toutDeselectionner")}
            </button>
            {peut("acces.accorder") && (
              <button className="btn btn-soft btn-sm" onClick={ouvrirOctroi}>
                <IconShield size={14} />
                {t("clients.donnerAcces")}
              </button>
            )}
            {peut("clients.supprimer") && (
              <button
                className="btn btn-danger btn-sm"
                disabled={busy}
                onClick={() =>
                  supprimer(
                    [...selection],
                    selection.size > 1 ? t("clients.libelleN", { n: selection.size }) : t("clients.libelleUn")
                  )
                }
              >
                <IconTrash size={14} />
                {t("commun.supprimer")}
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
                    aria-label={t("clients.toutSelectionner")}
                  />
                </th>
                <Th champ="nom">{t("clients.colClient")}</Th>
                <Th champ="secteurActivite">{t("clients.colSecteur")}</Th>
                <Th champ="pays">{t("clients.colLocalisation")}</Th>
                <th>{t("clients.colContacts")}</th>
                <Th champ="commercialEnCharge">{t("clients.colCommercial")}</Th>
                <Th champ="chiffreAffaires">{t("clients.colChiffreAffaires")}</Th>
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
                        aria-label={t("clients.selectionner", { nom: c.nom })}
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
                    <td data-label={t("clients.colSecteur")}>{c.secteurActivite ?? "-"}</td>
                    <td data-label={t("clients.colLocalisation")}>{[c.ville, c.pays].filter(Boolean).join(", ") || "-"}</td>
                    <td data-label={t("clients.colContacts")}>
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
                    <td data-label={t("clients.colCommercial")}>{c.commercialEnCharge ?? "-"}</td>
                    <td className="num" data-label={t("clients.colChiffreAffaires")}>
                      {c.chiffreAffaires ? `${nombre(Number(c.chiffreAffaires))} XAF` : "-"}
                    </td>
                    <td className="col-actions">
                      <div className="row-actions">
                        {contacts.length > 0 && (
                          <a
                            className="icon-btn-xs"
                            href={`mailto:${contacts.join(",")}`}
                            title={t("clients.ecrireA", { nom: c.nom })}
                            aria-label={t("clients.ecrireA", { nom: c.nom })}
                          >
                            <IconMail size={15} />
                          </a>
                        )}
                        <button
                          className="icon-btn-xs plain"
                          aria-label={t("clients.actionsPour", { nom: c.nom })}
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
                      <div className="empty-title">{t("clients.aucunTitre")}</div>
                      <p className="empty-text" style={{ margin: 0 }}>
                        {filtresActifs > 0 ? t("clients.aucunAvecFiltres") : t("clients.aucunSansFiltres")}
                      </p>
                      {filtresActifs > 0 ? (
                        <button className="btn btn-ghost btn-sm" onClick={resetFilters} style={{ marginTop: 6 }}>
                          {t("clients.reinitialiserFiltres")}
                        </button>
                      ) : (
                        /* Ajouter avant importer : un portefeuille vide se
                           remplit presque toujours par la première rencontre,
                           pas par un fichier déjà constitué. */
                        <div className="empty-actions">
                          {peut("clients.creer") && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => setNouveauOuvert(true)}
                            >
                              <IconPlus size={15} />
                              {t("clients.nouveau")}
                            </button>
                          )}
                          {peut("clients.importer") && (
                            <Link to="/import" className="btn btn-ghost btn-sm">
                              {t("clients.importerFichier")}
                            </Link>
                          )}
                        </div>
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
            <span>{t("clients.plage", { debut, fin, total: nombre(total) })}</span>
            <div className="pager">
              <button disabled={page <= 1} onClick={() => setPage(1)} aria-label={t("clients.premierePage")}>
                <IconChevronsLeft />
              </button>
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label={t("clients.pagePrecedente")}>
                <IconChevronLeft />
              </button>
              <span className="pager-page">{t("clients.pagination", { page, total: totalPages })}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label={t("clients.pageSuivante")}>
                <IconChevronRight />
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} aria-label={t("clients.dernierePage")}>
                <IconChevronsRight />
              </button>
            </div>
          </div>
        )}
      </div>

      {(nouveauOuvert || ficheAModifier) && (
        <DialogueClient
          facets={facets}
          client={ficheAModifier}
          onFermer={() => {
            setNouveauOuvert(false);
            setFicheAModifier(null);
          }}
          onEnregistre={(client, creation) => {
            setNouveauOuvert(false);
            setFicheAModifier(null);
            setSucces(
              creation
                ? t("clients.nouveauCree", { nom: client.nom })
                : t("clients.ficheModifiee", { nom: client.nom })
            );
            setVersion((v) => v + 1);
            // Les listes de pays, villes et secteurs viennent de changer.
            fetchFacets().then(setFacets).catch(() => {});
          }}
        />
      )}

      {octroiOuvert && (
        <div className="modal-backdrop" onClick={() => setOctroiOuvert(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t("clients.octroiTitre")}</h3>
            <p className="modal-sub">
              {selection.size > 1
                ? t("clients.octroiSousTitreN", { n: selection.size })
                : t("clients.octroiSousTitreUn")}
            </p>

            {beneficiaires.length === 0 ? (
              <div className="alert alert-info">
                <IconAlert />
                {t("clients.octroiAucunBeneficiaire")}
              </div>
            ) : (
              <div className="field">
                <label htmlFor="beneficiaire">{t("clients.octroiBeneficiaire")}</label>
                <select id="beneficiaire" value={beneficiaire} onChange={(e) => setBeneficiaire(e.target.value)}>
                  {beneficiaires.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nomComplet} · {libelles.role(b.role).toLowerCase()} ·{" "}
                      {t("clients.octroiAcces", { n: b.nbAcces })}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setOctroiOuvert(false)}>
                {t("commun.annuler")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={validerOctroi}
                disabled={octroiEnCours || beneficiaires.length === 0}
              >
                {octroiEnCours ? t("clients.octroiEnCours") : t("clients.octroiValider")}
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
          {/* La modification en tête du menu : c'est l'action qu'on vient
              chercher le plus souvent sur une fiche, avant de copier une
              adresse ou d'ouvrir un site. */}
          {peut("clients.modifier") && (
            <button
              className="menu-item"
              onClick={() => {
                setFicheAModifier(menu.client);
                setMenu(null);
              }}
            >
              <IconEdit />
              {t("clients.modifierClient")}
            </button>
          )}
          {contactsDe(menu.client).length > 0 && (
            <button
              className="menu-item"
              onClick={() => {
                navigator.clipboard?.writeText(contactsDe(menu.client).join("; "));
                setMenu(null);
              }}
            >
              <IconCopy />
              {t("clients.copierAdresses")}
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
              {t("clients.ouvrirSite")}
            </a>
          )}
          <div className="menu-sep" />
          <button
            className="menu-item danger"
            onClick={() => {
              const c = menu.client;
              setMenu(null);
              supprimer([c.id], t("clients.libelleFiche", { nom: c.nom }));
            }}
          >
            <IconTrash />
            {t("clients.supprimerClient")}
          </button>
        </div>
      )}
    </>
  );
}
