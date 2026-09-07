import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Role,
  Utilisateur,
  createUtilisateur,
  deleteUtilisateur,
  fetchOptionsComptes,
  fetchUtilisateurs,
  reinitialiserMotDePasse,
  updateUtilisateur,
} from "../api";
import { useAuth } from "../AuthContext";
import { useLangue, useLibelles } from "../i18n";
import { IconAlert, IconCheck, IconKey, IconMore, IconPlus, IconShield, IconTrash } from "../components/Icons";

function initiales(nom: string) {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

/** Teinte de pastille par famille de rôle, pour repérer la hiérarchie d'un coup d'œil. */
const TEINTE_ROLE: Record<Role, string> = {
  SUPER_ADMIN: "pill-danger",
  ADMIN: "pill-brand",
  DG: "pill-danger",
  RESPONSABLE_COMMERCIAL: "pill-brand",
  CHEF_DE_PROJET: "pill-warn",
  COMPTABLE: "pill-warn",
  COMMERCIAL: "pill-neutral",
};

export default function UtilisateursPage() {
  const { t, dateHeure } = useLangue();
  const libelles = useLibelles();
  const { utilisateur: moi } = useAuth();
  const [comptes, setComptes] = useState<Utilisateur[]>([]);
  const [options, setOptions] = useState<{
    roles: { valeur: Role; libelle: string }[];
    responsables: { id: string; nomComplet: string; role: Role }[];
  }>({ roles: [], responsables: [] });
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const [formOuvert, setFormOuvert] = useState(false);
  const [identifiant, setIdentifiant] = useState("");
  const [nomComplet, setNomComplet] = useState("");
  const [email, setEmail] = useState("");
  const [fonction, setFonction] = useState("");
  const [role, setRole] = useState<Role>("COMMERCIAL");
  const [responsableId, setResponsableId] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [creation, setCreation] = useState(false);

  const [menu, setMenu] = useState<{ compte: Utilisateur; x: number; y: number } | null>(null);
  const [resetCible, setResetCible] = useState<Utilisateur | null>(null);
  const [resetMdp, setResetMdp] = useState("");
  const [roleCible, setRoleCible] = useState<Utilisateur | null>(null);
  const [nouveauRole, setNouveauRole] = useState<Role>("COMMERCIAL");
  const resetInput = useRef<HTMLInputElement>(null);

  function charger() {
    setChargement(true);
    Promise.all([fetchUtilisateurs(), fetchOptionsComptes()])
      .then(([u, o]) => {
        setComptes(u);
        setOptions(o);
        if (o.roles.length && !o.roles.some((r) => r.valeur === role)) setRole(o.roles[0].valeur);
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setChargement(false));
  }

  useEffect(charger, []);

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

  useEffect(() => {
    if (resetCible) resetInput.current?.focus();
  }, [resetCible]);

  async function creer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    setCreation(true);
    try {
      await createUtilisateur({ identifiant, nomComplet, email, fonction, role, motDePasse, responsableId: responsableId || null });
      setSucces(t("users.compteCree", { identifiant }));
      setIdentifiant("");
      setNomComplet("");
      setEmail("");
      setFonction("");
      setMotDePasse("");
      setResponsableId("");
      setFormOuvert(false);
      charger();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setCreation(false);
    }
  }

  async function modifier(compte: Utilisateur, data: Partial<{ role: Role; actif: boolean }>) {
    setErreur(null);
    setSucces(null);
    try {
      await updateUtilisateur(compte.id, data);
      charger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function supprimer(compte: Utilisateur) {
    if (!confirm(t("users.confirmerSuppression", { identifiant: compte.identifiant }))) return;
    setErreur(null);
    try {
      await deleteUtilisateur(compte.id);
      setSucces(t("users.compteSupprime", { identifiant: compte.identifiant }));
      charger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function validerReset(e: FormEvent) {
    e.preventDefault();
    if (!resetCible) return;
    if (resetMdp.length < 8) {
      setErreur(t("users.mdpTropCourt"));
      return;
    }
    try {
      await reinitialiserMotDePasse(resetCible.id, resetMdp);
      setSucces(t("users.mdpReinitialise", { identifiant: resetCible.identifiant }));
      setResetCible(null);
      setResetMdp("");
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function validerRole(e: FormEvent) {
    e.preventDefault();
    if (!roleCible) return;
    const cible = roleCible;
    setRoleCible(null);
    await modifier(cible, { role: nouveauRole });
    setSucces(t("users.roleChange", { nom: cible.nomComplet, role: libelles.role(nouveauRole).toLowerCase() }));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("users.titre")}</h1>
          <div className="head-meta">
            <IconShield size={15} />
            <span>
              {t("commun.total")} <b>{comptes.length}</b>
            </span>
          </div>
        </div>
        <div className="head-actions">
          <button className={formOuvert ? "btn btn-ghost" : "btn btn-primary"} onClick={() => setFormOuvert((o) => !o)}>
            {formOuvert ? (
              t("commun.annuler")
            ) : (
              <>
                <IconPlus />
                {t("users.nouveauCompte")}
              </>
            )}
          </button>
        </div>
      </div>

      {erreur && (
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      )}
      {succes && (
        <div className="alert alert-success">
          <IconCheck />
          {succes}
        </div>
      )}

      {formOuvert && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("users.nouveauCompte")}</div>
              <div className="card-sub">{t("users.nouveauSousTitre")}</div>
            </div>
          </div>

          <form onSubmit={creer}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="u-identifiant">{t("users.identifiant")}</label>
                <input id="u-identifiant" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} placeholder={t("users.identifiantPlaceholder")} autoComplete="off" required />
              </div>
              <div className="field">
                <label htmlFor="u-nom">{t("users.nomComplet")}</label>
                <input id="u-nom" value={nomComplet} onChange={(e) => setNomComplet(e.target.value)} placeholder={t("users.nomCompletPlaceholder")} required />
              </div>
              <div className="field">
                <label htmlFor="u-email">{t("users.email")}</label>
                <input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("users.emailPlaceholder")} />
              </div>
              <div className="field">
                <label htmlFor="u-fonction">{t("users.fonction")}</label>
                <input id="u-fonction" value={fonction} onChange={(e) => setFonction(e.target.value)} placeholder={t("users.fonctionPlaceholder")} />
              </div>
              <div className="field">
                <label htmlFor="u-role">{t("users.role")}</label>
                <select id="u-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {options.roles.map((r) => (
                    <option key={r.valeur} value={r.valeur}>
                      {r.libelle}
                    </option>
                  ))}
                </select>
              </div>
              {moi?.role !== "RESPONSABLE_COMMERCIAL" && (
                <div className="field">
                  <label htmlFor="u-resp">{t("users.rattacheA")}</label>
                  <select id="u-resp" value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
                    <option value="">{t("users.aucunResponsable")}</option>
                    {options.responsables.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nomComplet} ({libelles.role(r.role).toLowerCase()})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field full">
                <label htmlFor="u-mdp">{t("users.mdpProvisoire")}</label>
                <input id="u-mdp" type="text" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} placeholder={t("users.mdpPlaceholder")} autoComplete="off" required />
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={creation}>
                {creation ? t("users.creation") : t("users.creerCompte")}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-card">
        {comptes.length === 0 && !chargement ? (
          <div className="empty">
            <div className="empty-icon">
              <IconShield />
            </div>
            <div className="empty-title">{t("users.aucunTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("users.aucunTexte")}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("users.colUtilisateur")}</th>
                  <th>{t("users.colRole")}</th>
                  <th>{t("users.colRattacheA")}</th>
                  <th>{t("users.colPerimetre")}</th>
                  <th>{t("users.colDernierAcces")}</th>
                  <th>{t("users.colStatut")}</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {comptes.map((c) => {
                  const cestMoi = c.id === moi?.id;
                  const restreint = c.role === "COMMERCIAL";
                  return (
                    <tr key={c.id}>
                      <td className="td-main">
                        <div className="cell-client">
                          <span className="avatar-mono" style={{ background: "var(--brand-100)", color: "var(--brand-700)" }}>
                            {initiales(c.nomComplet)}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="cc-name">
                              {c.nomComplet}
                              {cestMoi && (
                                <span className="tag" style={{ marginLeft: 7 }}>
                                  {t("users.vous")}
                                </span>
                              )}
                            </div>
                            <div className="cc-sub">
                              {c.identifiant}
                              {c.fonction ? ` · ${c.fonction}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td data-label={t("users.colRole")}>
                        <span className={`pill ${TEINTE_ROLE[c.role]}`}>{libelles.role(c.role)}</span>
                      </td>
                      <td data-label={t("users.colRattacheA")}>{c.responsable?.nomComplet ?? "-"}</td>
                      <td data-label={t("users.colPerimetre")}>
                        {restreint ? (
                          <>
                            {t("users.perimetreCrees", { n: c.nbClientsPossedes ?? 0 })}
                            {(c.nbAccesAccordes ?? 0) > 0 && (
                              <span className="tag" style={{ marginLeft: 6 }}>
                                {t("users.perimetreOuverts", { n: c.nbAccesAccordes ?? 0 })}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="muted-3">{t("users.perimetreTout")}</span>
                        )}
                      </td>
                      <td data-label={t("users.colDernierAcces")}>
                        {dateHeure(c.dernierAcces) || t("commun.jamais")}
                      </td>
                      <td data-label={t("users.colStatut")}>
                        <span className={`pill ${c.actif ? "pill-success" : "pill-danger"}`}>
                          {c.actif ? t("users.actif") : t("users.desactive")}
                        </span>
                      </td>
                      <td className="col-actions">
                        <div className="row-actions">
                          <button
                            className="icon-btn-xs plain"
                            aria-label={t("users.actionsPour", { nom: c.nomComplet })}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setMenu(menu?.compte.id === c.id ? null : { compte: c, x: r.right, y: r.bottom });
                            }}
                          >
                            <IconMore />
                          </button>
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

      {menu && (
        <div
          className="menu menu--fixed"
          style={{ left: Math.max(12, menu.x - 220), top: menu.y + 6 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="menu-item"
            onClick={() => {
              const c = menu.compte;
              setMenu(null);
              setNouveauRole(c.role);
              setRoleCible(c);
            }}
          >
            <IconShield size={16} />
            {t("users.changerRole")}
          </button>
          <button
            className="menu-item"
            onClick={() => {
              const c = menu.compte;
              setMenu(null);
              setResetCible(c);
            }}
          >
            <IconKey size={16} />
            {t("users.reinitialiserMdp")}
          </button>
          <button
            className="menu-item"
            onClick={() => {
              const c = menu.compte;
              setMenu(null);
              modifier(c, { actif: !c.actif });
            }}
          >
            <IconAlert size={16} />
            {menu.compte.actif ? t("users.desactiverCompte") : t("users.reactiverCompte")}
          </button>
          <div className="menu-sep" />
          <button
            className="menu-item danger"
            disabled={menu.compte.id === moi?.id}
            onClick={() => {
              const c = menu.compte;
              setMenu(null);
              supprimer(c);
            }}
          >
            <IconTrash size={16} />
            {t("users.supprimerCompte")}
          </button>
        </div>
      )}

      {roleCible && (
        <div className="modal-backdrop" onClick={() => setRoleCible(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={validerRole}>
            <h3>{t("users.changerRole")}</h3>
            <p className="modal-sub">{t("users.modaleRoleSousTitre", { nom: roleCible.nomComplet })}</p>
            <div className="field">
              <label htmlFor="role-cible">{t("users.nouveauRole")}</label>
              <select id="role-cible" value={nouveauRole} onChange={(e) => setNouveauRole(e.target.value as Role)}>
                {options.roles.map((r) => (
                  <option key={r.valeur} value={r.valeur}>
                    {r.libelle}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setRoleCible(null)}>
                {t("commun.annuler")}
              </button>
              <button type="submit" className="btn btn-primary">
                {t("commun.appliquer")}
              </button>
            </div>
          </form>
        </div>
      )}

      {resetCible && (
        <div className="modal-backdrop" onClick={() => setResetCible(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={validerReset}>
            <h3>{t("users.reinitialiserMdp")}</h3>
            <p className="modal-sub">
              {t("users.modaleResetSousTitre", {
                nom: resetCible.nomComplet,
                identifiant: resetCible.identifiant,
              })}
            </p>
            <div className="field">
              <label htmlFor="reset-mdp">{t("profil.mdpNouveau")}</label>
              <input id="reset-mdp" ref={resetInput} type="text" value={resetMdp} onChange={(e) => setResetMdp(e.target.value)} placeholder={t("users.mdpPlaceholder")} autoComplete="off" />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setResetCible(null)}>
                {t("commun.annuler")}
              </button>
              <button type="submit" className="btn btn-primary">
                {t("commun.reinitialiser")}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
