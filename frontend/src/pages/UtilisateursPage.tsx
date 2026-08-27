import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Role,
  Utilisateur,
  createUtilisateur,
  deleteUtilisateur,
  fetchUtilisateurs,
  reinitialiserMotDePasse,
  updateUtilisateur,
} from "../api";
import { useAuth } from "../AuthContext";
import { IconAlert, IconCheck, IconKey, IconMore, IconPlus, IconShield, IconTrash } from "../components/Icons";

function initiales(nom: string) {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

function formatDate(iso: string | null) {
  if (!iso) return "Jamais";
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export default function UtilisateursPage() {
  const { utilisateur: moi } = useAuth();
  const [comptes, setComptes] = useState<Utilisateur[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const [formOuvert, setFormOuvert] = useState(false);
  const [identifiant, setIdentifiant] = useState("");
  const [nomComplet, setNomComplet] = useState("");
  const [email, setEmail] = useState("");
  const [fonction, setFonction] = useState("");
  const [role, setRole] = useState<Role>("COMMERCIAL");
  const [motDePasse, setMotDePasse] = useState("");
  const [creation, setCreation] = useState(false);

  const [menu, setMenu] = useState<{ compte: Utilisateur; x: number; y: number } | null>(null);
  const [resetCible, setResetCible] = useState<Utilisateur | null>(null);
  const [resetMdp, setResetMdp] = useState("");
  const [resetEnCours, setResetEnCours] = useState(false);
  const resetInput = useRef<HTMLInputElement>(null);

  function charger() {
    setChargement(true);
    fetchUtilisateurs()
      .then(setComptes)
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
      const nouveau = await createUtilisateur({ identifiant, nomComplet, email, fonction, role, motDePasse });
      setComptes((c) => [nouveau, ...c]);
      setSucces(`Compte « ${nouveau.identifiant} » créé.`);
      setIdentifiant("");
      setNomComplet("");
      setEmail("");
      setFonction("");
      setRole("COMMERCIAL");
      setMotDePasse("");
      setFormOuvert(false);
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
      const maj = await updateUtilisateur(compte.id, data);
      setComptes((cs) => cs.map((c) => (c.id === maj.id ? maj : c)));
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function supprimer(compte: Utilisateur) {
    if (!confirm(`Supprimer définitivement le compte « ${compte.identifiant} » ?`)) return;
    setErreur(null);
    setSucces(null);
    try {
      await deleteUtilisateur(compte.id);
      setComptes((cs) => cs.filter((c) => c.id !== compte.id));
      setSucces(`Compte « ${compte.identifiant} » supprimé.`);
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function validerReset(e: FormEvent) {
    e.preventDefault();
    if (!resetCible) return;
    if (resetMdp.length < 8) {
      setErreur("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    setResetEnCours(true);
    setErreur(null);
    try {
      await reinitialiserMotDePasse(resetCible.id, resetMdp);
      setSucces(`Mot de passe réinitialisé pour « ${resetCible.identifiant} ».`);
      setResetCible(null);
      setResetMdp("");
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setResetEnCours(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Utilisateurs</h1>
          <div className="head-meta">
            <IconShield size={15} />
            <span>
              Total : <b>{comptes.length}</b>
            </span>
          </div>
        </div>
        <div className="head-actions">
          <button
            className={formOuvert ? "btn btn-ghost" : "btn btn-primary"}
            onClick={() => setFormOuvert((o) => !o)}
          >
            {formOuvert ? (
              "Annuler"
            ) : (
              <>
                <IconPlus />
                Nouveau compte
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
              <div className="card-title">Nouveau compte</div>
              <div className="card-sub">
                L'utilisateur pourra ensuite modifier ses informations et son mot de passe depuis son profil.
              </div>
            </div>
          </div>

          <form onSubmit={creer}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="u-identifiant">Identifiant de connexion</label>
                <input
                  id="u-identifiant"
                  value={identifiant}
                  onChange={(e) => setIdentifiant(e.target.value)}
                  placeholder="p.nom"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="u-nom">Nom complet</label>
                <input
                  id="u-nom"
                  value={nomComplet}
                  onChange={(e) => setNomComplet(e.target.value)}
                  placeholder="Prénom Nom"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="u-email">Adresse email</label>
                <input
                  id="u-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom.nom@easytechgroup.com"
                />
              </div>
              <div className="field">
                <label htmlFor="u-fonction">Fonction</label>
                <input
                  id="u-fonction"
                  value={fonction}
                  onChange={(e) => setFonction(e.target.value)}
                  placeholder="Commercial grands comptes"
                />
              </div>
              <div className="field">
                <label htmlFor="u-role">Rôle</label>
                <select id="u-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="COMMERCIAL">Commercial (accès aux clients et campagnes)</option>
                  <option value="ADMIN">Administrateur (gère aussi les comptes)</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="u-mdp">Mot de passe provisoire</label>
                <input
                  id="u-mdp"
                  type="text"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  placeholder="8 caractères minimum"
                  autoComplete="off"
                  required
                />
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={creation}>
                {creation ? "Création…" : "Créer le compte"}
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
            <div className="empty-title">Aucun compte</div>
            <p className="empty-text" style={{ margin: 0 }}>
              Créez un compte pour chaque personne devant accéder au CRM.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Rôle</th>
                  <th>Email</th>
                  <th>Dernier accès</th>
                  <th>Statut</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {comptes.map((c) => {
                  const cestMoi = c.id === moi?.id;
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
                                  vous
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
                      <td data-label="Rôle">
                        <span className={`pill ${c.role === "ADMIN" ? "pill-brand" : "pill-neutral"}`}>
                          {c.role === "ADMIN" ? "Administrateur" : "Commercial"}
                        </span>
                      </td>
                      <td data-label="Email">{c.email ?? "-"}</td>
                      <td data-label="Dernier accès">{formatDate(c.dernierAcces)}</td>
                      <td data-label="Statut">
                        <span className={`pill ${c.actif ? "pill-success" : "pill-danger"}`}>
                          {c.actif ? "Actif" : "Désactivé"}
                        </span>
                      </td>
                      <td className="col-actions">
                        <div className="row-actions">
                          <button
                            className="icon-btn-xs plain"
                            aria-label={`Actions pour ${c.nomComplet}`}
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
          style={{ left: Math.max(12, menu.x - 210), top: menu.y + 6 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="menu-item"
            onClick={() => {
              const c = menu.compte;
              setMenu(null);
              modifier(c, { role: c.role === "ADMIN" ? "COMMERCIAL" : "ADMIN" });
            }}
          >
            <IconShield size={16} />
            {menu.compte.role === "ADMIN" ? "Passer en commercial" : "Passer en administrateur"}
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
            Réinitialiser le mot de passe
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
            {menu.compte.actif ? "Désactiver le compte" : "Réactiver le compte"}
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
            Supprimer le compte
          </button>
        </div>
      )}

      {resetCible && (
        <div className="modal-backdrop" onClick={() => setResetCible(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={validerReset}>
            <h3>Réinitialiser le mot de passe</h3>
            <p className="modal-sub">
              Nouveau mot de passe pour <strong>{resetCible.nomComplet}</strong> ({resetCible.identifiant}).
              Communiquez-le lui pour qu'il le change depuis son profil.
            </p>

            <div className="field">
              <label htmlFor="reset-mdp">Nouveau mot de passe</label>
              <input
                id="reset-mdp"
                ref={resetInput}
                type="text"
                value={resetMdp}
                onChange={(e) => setResetMdp(e.target.value)}
                placeholder="8 caractères minimum"
                autoComplete="off"
              />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setResetCible(null)}>
                Annuler
              </button>
              <button type="submit" className="btn btn-primary" disabled={resetEnCours}>
                {resetEnCours ? "Application…" : "Réinitialiser"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
