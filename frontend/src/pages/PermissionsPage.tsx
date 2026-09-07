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
import { useLangue, useLibelles } from "../i18n";
import { IconAlert, IconCheck, IconShield } from "../components/Icons";

export default function PermissionsPage() {
  const { t } = useLangue();
  const libelles = useLibelles();
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
      const noms = rolesModifies.map((r) => libelles.role(r.role)).join(", ");
      setSucces(t("perms.succes", { roles: noms }));
      charger();
      rafraichir();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnregistrement(false);
    }
  }

  async function reinitialiser(r: RolePermissions) {
    if (!confirm(t("perms.confirmerReset", { role: libelles.role(r.role) }))) return;
    setErreur(null);
    try {
      await reinitialiserPermissions(r.role);
      setSucces(t("perms.reinitialiseRole", { role: libelles.role(r.role) }));
      charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  if (chargement) {
    return (
      <div className="card">
        <p className="muted-3" style={{ margin: 0 }}>
          {t("perms.chargement")}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("perms.titre")}</h1>
          <div className="head-meta">
            <IconShield size={15} />
            <span>{t("perms.sousTitre")}</span>
          </div>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={enregistrer} disabled={rolesModifies.length === 0 || enregistrement}>
            {enregistrement
              ? t("commun.enregistrement")
              : rolesModifies.length === 0
                ? t("perms.aucuneModification")
                : t("perms.enregistrerN", { n: rolesModifies.length })}
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
        <div>{t("perms.avertissementSuperAdmin")}</div>
      </div>

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("perms.matriceTitre")}</div>
            <div className="card-sub">{t("perms.matriceSousTitre")}</div>
          </div>
        </div>

        <div className="table-scroll">
          <table className="matrice">
            <thead>
              <tr>
                <th>{t("perms.colPermission")}</th>
                {roles.map((r) => (
                  <th key={r.role} className="col-role">
                    <div className="role-tete">
                      <span>{libelles.role(r.role)}</span>
                      {!r.modifiable && <span className="tag">{t("perms.verrouille")}</span>}
                      {r.surcharge && <span className="pill pill-warn">{t("perms.modifie")}</span>}
                      {r.surcharge && (
                        <button className="link-action" onClick={() => reinitialiser(r)}>
                          {t("perms.retablir")}
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
                    <td colSpan={roles.length + 1}>{libelles.groupe(groupe)}</td>
                  </tr>
                  {lignes.map((l) => (
                    <tr key={l.cle}>
                      <td className="td-main">
                        <div className="cc-name">{libelles.permissionLibelle(l.cle)}</div>
                        <div className="cc-sub">{libelles.permissionDetail(l.cle)}</div>
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
                              aria-label={t("perms.caseAria", {
                                permission: libelles.permissionLibelle(l.cle),
                                role: libelles.role(r.role),
                              })}
                              title={
                                ecart
                                  ? parDefaut
                                    ? t("perms.ecartRetire")
                                    : t("perms.ecartAjoute")
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
