import { Fragment, useEffect, useMemo, useState } from "react";
import {
  LignePermission,
  Permission,
  Role,
  RolePermissions,
  enregistrerPermissions,
  fetchMatricePermissions,
  reinitialiserPermissions,
} from "../api";
import { useAuth } from "../AuthContext";
import { IconAlert, IconCheck, IconShield } from "../components/Icons";

export default function PermissionsPage() {
  const { rafraichir } = useAuth();
  const [catalogue, setCatalogue] = useState<LignePermission[]>([]);
  const [roles, setRoles] = useState<RolePermissions[]>([]);
  const [brouillon, setBrouillon] = useState<Record<string, Set<Permission>>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [chargement, setChargement] = useState(true);

  function charger() {
    setChargement(true);
    fetchMatricePermissions()
      .then(({ catalogue, roles }) => {
        setCatalogue(catalogue);
        setRoles(roles);
        setBrouillon(Object.fromEntries(roles.map((r) => [r.role, new Set(r.permissions)])));
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setChargement(false));
  }

  useEffect(charger, []);

  const groupes = useMemo(() => {
    const m = new Map<string, LignePermission[]>();
    for (const l of catalogue) {
      if (!m.has(l.groupe)) m.set(l.groupe, []);
      m.get(l.groupe)!.push(l);
    }
    return [...m.entries()];
  }, [catalogue]);

  /** Écarts entre l'état affiché et ce qui est réellement enregistré. */
  const rolesModifies = useMemo(
    () =>
      roles.filter((r) => {
        if (!r.modifiable) return false;
        const actuel = brouillon[r.role];
        if (!actuel) return false;
        return actuel.size !== r.permissions.length || r.permissions.some((p) => !actuel.has(p));
      }),
    [roles, brouillon]
  );

  function basculer(role: Role, cle: Permission) {
    setSucces(null);
    setBrouillon((b) => {
      const copie = new Set(b[role]);
      copie.has(cle) ? copie.delete(cle) : copie.add(cle);
      return { ...b, [role]: copie };
    });
  }

  async function enregistrer() {
    setEnregistrement(true);
    setErreur(null);
    setSucces(null);
    try {
      for (const r of rolesModifies) {
        await enregistrerPermissions(r.role, [...brouillon[r.role]]);
      }
      const noms = rolesModifies.map((r) => r.libelle).join(", ");
      setSucces(`Permissions enregistrées pour : ${noms}. Effet immédiat pour tous les comptes concernés.`);
      charger();
      rafraichir();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnregistrement(false);
    }
  }

  async function reinitialiser(r: RolePermissions) {
    if (!confirm(`Rétablir les droits par défaut pour « ${r.libelle} » ?`)) return;
    setErreur(null);
    try {
      await reinitialiserPermissions(r.role);
      setSucces(`Droits par défaut rétablis pour ${r.libelle}.`);
      charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  if (chargement) {
    return (
      <div className="card">
        <p className="muted-3" style={{ margin: 0 }}>
          Chargement de la matrice…
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Permissions</h1>
          <div className="head-meta">
            <IconShield size={15} />
            <span>Ce que chaque rôle a le droit de faire</span>
          </div>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={enregistrer} disabled={rolesModifies.length === 0 || enregistrement}>
            {enregistrement
              ? "Enregistrement…"
              : rolesModifies.length === 0
                ? "Aucune modification"
                : `Enregistrer (${rolesModifies.length})`}
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

      <div className="alert alert-info">
        <IconAlert />
        <div>
          Les droits du <strong>super administrateur</strong> ne sont pas modifiables. C'est ce qui garantit de pouvoir
          toujours reprendre la main : sans cette règle, une case décochée par erreur verrouillerait l'application sans
          aucun recours.
        </div>
      </div>

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">Matrice des droits</div>
            <div className="card-sub">
              Une pastille orange signale un rôle qui s'écarte de la configuration livrée. Les modifications prennent
              effet dès l'enregistrement, sans reconnexion.
            </div>
          </div>
        </div>

        <div className="table-scroll">
          <table className="matrice">
            <thead>
              <tr>
                <th>Permission</th>
                {roles.map((r) => (
                  <th key={r.role} className="col-role">
                    <div className="role-tete">
                      <span>{r.libelle}</span>
                      {!r.modifiable && <span className="tag">verrouillé</span>}
                      {r.surcharge && <span className="pill pill-warn">modifié</span>}
                      {r.surcharge && (
                        <button className="link-action" onClick={() => reinitialiser(r)}>
                          rétablir
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupes.map(([groupe, lignes]) => (
                <Fragment key={groupe}>
                  <tr className="ligne-groupe">
                    <td colSpan={roles.length + 1}>{groupe}</td>
                  </tr>
                  {lignes.map((l) => (
                    <tr key={l.cle}>
                      <td className="td-main">
                        <div className="cc-name">{l.libelle}</div>
                        <div className="cc-sub">{l.detail}</div>
                      </td>
                      {roles.map((r) => {
                        const coche = brouillon[r.role]?.has(l.cle) ?? false;
                        const parDefaut = r.parDefaut.includes(l.cle);
                        const ecart = r.modifiable && coche !== parDefaut;
                        return (
                          <td key={r.role} className={`col-role${ecart ? " ecart" : ""}`}>
                            <input
                              type="checkbox"
                              checked={r.modifiable ? coche : true}
                              disabled={!r.modifiable}
                              onChange={() => basculer(r.role, l.cle)}
                              aria-label={`${l.libelle} pour ${r.libelle}`}
                              title={
                                ecart
                                  ? parDefaut
                                    ? "Retiré par rapport à la configuration par défaut"
                                    : "Ajouté par rapport à la configuration par défaut"
                                  : undefined
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
