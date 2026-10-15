import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ACTIVITES,
  FeuilleHebdo,
  LigneFeuille,
  SuggestionClient,
  TypeActivite,
  fetchFeuilleHebdo,
  poserCellule,
} from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { useFilAriane } from "../ContexteEntete";
import ChampClient from "../components/ChampClient";
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconPlus,
} from "../components/Icons";

function cleJour(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lundiDe(d: Date) {
  const j = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  j.setDate(j.getDate() - ((j.getDay() + 6) % 7));
  return j;
}

/** « 2:30 » depuis des minutes. */
function enDuree(minutes: number) {
  const signe = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  return `${signe}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

/** Forme longue, pour les totaux qui se lisent et ne se comparent pas. */
function dureeLongue(minutes: number) {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const signe = minutes < 0 ? "-" : "";
  if (h === 0) return `${signe}${m} min`;
  return m === 0 ? `${signe}${h} h` : `${signe}${h} h ${String(m).padStart(2, "0")}`;
}

/**
 * Lit « 2:30 », « 2h30 », « 2,5 » ou « 150m ».
 *
 * Une feuille de temps se remplit vite et chacun a sa notation. Refuser tout
 * sauf un format fait retaper la cellule, et la cellule retapée finit par ne
 * plus être remplie du tout.
 */
function enMinutes(texte: string): number | null {
  const t = texte.trim().toLowerCase().replace(",", ".");
  if (t === "" || t === "-" || t === "—") return 0;
  let m = /^(\d+)\s*[:h]\s*(\d{1,2})$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+)\s*h$/.exec(t);
  if (m) return Number(m[1]) * 60;
  m = /^(\d+)\s*m(?:in)?$/.exec(t);
  if (m) return Number(m[1]);
  m = /^(\d+(?:\.\d+)?)$/.exec(t);
  if (m) return Math.round(Number(m[1]) * 60);
  return null;
}

/* La même teinte que dans l'agenda : un commercial doit reconnaître une
   activité d'une vue à l'autre sans relire son libellé. */
const TEINTES: Record<TypeActivite, string> = {
  PROSPECTION: "#1f86c8",
  RELANCE: "#2a9fd6",
  RENDEZ_VOUS: "#0c8074",
  DEMONSTRATION: "#12a594",
  DEVIS: "#7c4dcc",
  NEGOCIATION: "#9b5de5",
  SUIVI_CLIENT: "#c07a00",
  REUNION_INTERNE: "#8a8582",
  FORMATION: "#d97706",
  DEPLACEMENT: "#a33d5b",
  ADMINISTRATIF: "#6b6462",
  AUTRE: "#9a9290",
};

/* Durées proposées d'un clic. Une journée de commercial se compte en demies
   et en quarts d'heure, pas en minutes. */
const RACCOURCIS = [30, 60, 90, 120, 180, 240];

const NOUVELLE_LIGNE = {
  activite: "PROSPECTION" as TypeActivite,
  clientId: null as string | null,
  clientNom: "",
  jour: "",
  duree: "",
};

/**
 * Feuille de temps hebdomadaire, en grille.
 *
 * Une ligne par activité, une colonne par jour, la durée dans la case. C'est
 * la forme qu'ont prise tous les outils de pointage, parce qu'elle permet de
 * remplir une semaine entière sans changer d'écran et de voir d'un regard ce
 * qui manque.
 *
 * Les cases vides portent un tiret et non « 0:00 » : une grille de zéros se
 * lit comme un mur, et l'œil ne distingue plus ce qui est rempli de ce qui
 * ne l'est pas.
 */
export default function FeuillesDeTempsPage() {
  const { t, nombre, locale } = useLangue();
  const [ancre, setAncre] = useState(() => lundiDe(new Date()));
  const [feuille, setFeuille] = useState<FeuilleHebdo | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [nouvelle, setNouvelle] = useState(NOUVELLE_LIGNE);
  /* Case active : elle reçoit les raccourcis de durée, qui autrement ne
     sauraient pas où écrire. */
  const [caseActive, setCaseActive] = useState<{ ligne: LigneFeuille; jour: string } | null>(null);
  /* Lignes posées à la main et encore vides : sans elles, une ligne ajoutée
     disparaîtrait au rechargement avant d'avoir reçu la moindre heure. */
  const [lignesVides, setLignesVides] = useState<LigneFeuille[]>([]);

  useFilAriane("/planning", t("nav.calendrier"), t("pl.feuillesTitre"));

  function recharger() {
    fetchFeuilleHebdo(cleJour(ancre))
      .then(setFeuille)
      .catch((e) => setErreur(e.message));
  }

  useEffect(() => {
    setFeuille(null);
    setLignesVides([]);
    setCaseActive(null);
    recharger();
  }, [ancre]);

  const aujourdhui = cleJour(new Date());
  const libelleActivite = (a: TypeActivite) => t(`activite.${a}` as CleTraduction);

  /* On ne pointe pas un jour à venir : la liste s'arrête à aujourd'hui, et
     propose le jour courant quand la semaine affichée est celle en cours. */
  const joursSaisissables = useMemo(
    () => (feuille?.jours ?? []).filter((j) => j.jour <= aujourdhui),
    [feuille, aujourdhui]
  );
  const jourParDefaut = useMemo(() => {
    if (joursSaisissables.some((j) => j.jour === aujourdhui)) return aujourdhui;
    return joursSaisissables[joursSaisissables.length - 1]?.jour ?? aujourdhui;
  }, [joursSaisissables, aujourdhui]);

  const lignes = useMemo(() => {
    if (!feuille) return [];
    const connues = new Set(feuille.lignes.map((l) => l.cle));
    return [...feuille.lignes, ...lignesVides.filter((l) => !connues.has(l.cle))];
  }, [feuille, lignesVides]);

  async function enregistrerCase(ligne: LigneFeuille, jour: string, texte: string) {
    const minutes = enMinutes(texte);
    if (minutes === null) {
      setErreur(t("pl.dureeIllisible", { valeur: texte }));
      return;
    }
    const actuel = ligne.parJour[jour]?.minutes ?? 0;
    if (minutes === actuel) return;

    setErreur(null);
    setSucces(null);
    setEnCours(`${ligne.cle}|${jour}`);
    try {
      await poserCellule({ jour, activite: ligne.activite, clientId: ligne.clientId, minutes });
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
      recharger();
    } finally {
      setEnCours(null);
    }
  }

  /**
   * Ajoute une ligne, et ses heures dans la foulée si elles sont données.
   *
   * Partir d'une semaine vide demandait trois gestes : ouvrir le formulaire,
   * poser une ligne nue, puis retrouver la bonne case dans la grille. La
   * durée et le jour figurent donc ici, et un seul envoi suffit à déclarer
   * « trois heures de prospection mardi ».
   */
  async function ajouterLigne(e: FormEvent) {
    e.preventDefault();
    const cle = `${nouvelle.activite}::${nouvelle.clientId ?? ""}`;
    const dejaLa = lignes.find((l) => l.cle === cle);
    const minutes = nouvelle.duree.trim() === "" ? 0 : enMinutes(nouvelle.duree);

    if (minutes === null) {
      setErreur(t("pl.dureeIllisible", { valeur: nouvelle.duree }));
      return;
    }
    if (dejaLa && minutes === 0) {
      setErreur(t("pl.ligneExistante"));
      return;
    }

    setErreur(null);
    setSucces(null);

    if (minutes > 0) {
      const jour = nouvelle.jour || jourParDefaut;
      setEnvoi(true);
      try {
        await poserCellule({ jour, activite: nouvelle.activite, clientId: nouvelle.clientId, minutes });
        setSucces(
          t("pl.heuresAjoutees", {
            duree: dureeLongue(minutes),
            activite: libelleActivite(nouvelle.activite),
            jour: new Date(`${jour}T00:00:00`).toLocaleDateString(locale, { weekday: "long", day: "numeric" }),
          })
        );
        setNouvelle({ ...NOUVELLE_LIGNE, jour });
        setAjout(false);
        recharger();
      } catch (err) {
        setErreur((err as Error).message);
      } finally {
        setEnvoi(false);
      }
      return;
    }

    /* Sans durée, la ligne est simplement préparée dans la grille : elle
       n'existe que dans l'écran tant qu'elle n'a pas reçu d'heures. */
    setLignesVides((v) => [
      ...v,
      {
        cle,
        activite: nouvelle.activite,
        clientId: nouvelle.clientId,
        clientNom: nouvelle.clientNom || null,
        parJour: {},
        total: 0,
      },
    ]);
    setSucces(t("pl.ligneAjoutee", { activite: libelleActivite(nouvelle.activite) }));
    setNouvelle(NOUVELLE_LIGNE);
    setAjout(false);
  }

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("pl.feuillesTitre")}</h1>
        <div className="page-sub">{t("pl.feuillesSousTitre")}</div>
      </div>
      <div className="head-actions">
        <Link to="/planning/agenda" className="btn btn-ghost">
          {t("pl.agendaTitre")}
          <IconArrowRight size={14} />
        </Link>
        {/* L'action principale en tête et en plein : dans la version
            precedente c'etait un lien minuscule au bas du tableau, que
            personne ne pouvait trouver. */}
        <button className="btn btn-primary" onClick={() => setAjout(true)} disabled={ajout}>
          <IconPlus size={16} />
          {t("pl.ajouterLigne")}
        </button>
      </div>
    </div>
  );

  if (!feuille) {
    return (
      <>
        {entete}
        {erreur ? (
          <div className="alert alert-error">
            <IconAlert />
            {erreur}
          </div>
        ) : (
          <div className="card">
            <p className="muted-3" style={{ margin: 0 }}>
              {t("commun.chargementDonnees")}
            </p>
          </div>
        )}
      </>
    );
  }

  const finSemaine = new Date(feuille.fin);
  finSemaine.setDate(finSemaine.getDate() - 1);
  const partSemaine = feuille.cible > 0 ? Math.round((feuille.total / feuille.cible) * 100) : 0;
  const reste = Math.max(0, feuille.cible - feuille.total);

  return (
    <>
      {entete}

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

      {/* En-tête de semaine : la navigation à gauche, l'avancement à droite.
          Le même chiffre qu'au pied du tableau, mais vu avant de saisir. */}
      <div className="fdt-entete">
        <div className="fdt-nav">
          <button className="btn btn-ghost btn-sm" onClick={() => setAncre(lundiDe(new Date()))}>
            {t("cal.aujourdhui")}
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              const d = new Date(ancre);
              d.setDate(d.getDate() - 7);
              setAncre(d);
            }}
            aria-label={t("ag.semainePrecedente")}
          >
            <IconChevronLeft size={17} />
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              const d = new Date(ancre);
              d.setDate(d.getDate() + 7);
              setAncre(d);
            }}
            aria-label={t("ag.semaineSuivante")}
          >
            <IconChevronRight size={17} />
          </button>
          <span className="fdt-periode">
            {new Date(feuille.debut).toLocaleDateString(locale, { day: "numeric", month: "short" })} -{" "}
            {finSemaine.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>

        <div className="fdt-avancement">
          <div className="fdt-avancement-chiffres">
            <strong>{dureeLongue(feuille.total)}</strong>
            <span>{t("pl.surCibleSemaine", { cible: dureeLongue(feuille.cible) })}</span>
          </div>
          <div className="fdt-jauge">
            <span
              className={`fdt-jauge-barre${partSemaine >= 100 ? " pleine" : ""}`}
              style={{ width: `${Math.min(100, partSemaine)}%` }}
            />
          </div>
          <div className="fdt-avancement-pied">
            <span>{nombre(partSemaine)}%</span>
            <span className="muted-3">
              {reste > 0 ? t("pl.resteAPointer", { duree: dureeLongue(reste) }) : t("pl.semaineComplete")}
            </span>
          </div>
          {/* Les heures planifiées sont dites, mais hors du total : les y
              ajouter déclarerait du travail qui n'a pas encore eu lieu. */}
          {feuille.prevuMinutes > 0 && (
            <Link to="/planning/agenda" className="fdt-prevu">
              {t("pl.prevuSemaine", { duree: dureeLongue(feuille.prevuMinutes) })}
            </Link>
          )}
        </div>
      </div>

      {/* Formulaire d'ajout, ouvert au-dessus de la grille : la nouvelle
          ligne apparaît là où on regarde déjà. */}
      {ajout && (
        <form className="card fdt-form" onSubmit={ajouterLigne}>
          <div className="card-head">
            <div>
              <div className="card-title">{t("pl.nouvelleLigneTitre")}</div>
              <div className="card-sub">{t("pl.nouvelleLigneSousTitre")}</div>
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: 14 }}>
            <div className="field">
              <label htmlFor="fdt-activite">{t("ag.activite")}</label>
              <select
                id="fdt-activite"
                value={nouvelle.activite}
                onChange={(e) => setNouvelle((n) => ({ ...n, activite: e.target.value as TypeActivite }))}
                autoFocus
              >
                {ACTIVITES.map((a) => (
                  <option key={a} value={a}>
                    {libelleActivite(a)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="vente-client">{t("ag.client")}</label>
              <ChampClient
                valeur={nouvelle.clientNom}
                onChange={(nom) => setNouvelle((n) => ({ ...n, clientNom: nom, clientId: null }))}
                onChoisir={(c: SuggestionClient) => setNouvelle((n) => ({ ...n, clientNom: c.nom, clientId: c.id }))}
              />
              <div className="field-hint">{t("ag.clientAide")}</div>
            </div>
          </div>

          {/* Le jour et la durée ici : sans eux, déclarer trois heures de
              prospection mardi demandait d'ouvrir ce formulaire, de poser une
              ligne nue, puis de retrouver la bonne case dans la grille. */}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="fdt-jour">{t("pl.jour")}</label>
              <select
                id="fdt-jour"
                value={nouvelle.jour || jourParDefaut}
                onChange={(e) => setNouvelle((n) => ({ ...n, jour: e.target.value }))}
              >
                {joursSaisissables.map((j) => (
                  <option key={j.jour} value={j.jour}>
                    {new Date(`${j.jour}T00:00:00`).toLocaleDateString(locale, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                    {j.jour === aujourdhui ? ` · ${t("cal.aujourdhui")}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="fdt-duree">{t("pl.duree")}</label>
              <input
                id="fdt-duree"
                value={nouvelle.duree}
                onChange={(e) => setNouvelle((n) => ({ ...n, duree: e.target.value }))}
                placeholder={t("pl.dureePlaceholder")}
                inputMode="text"
              />
              <div className="fdt-chips">
                {RACCOURCIS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`fdt-raccourci${enMinutes(nouvelle.duree) === m ? " on" : ""}`}
                    onClick={() => setNouvelle((n) => ({ ...n, duree: enDuree(m) }))}
                  >
                    {enDuree(m)}
                  </button>
                ))}
              </div>
              <div className="field-hint">{t("pl.dureeFacultative")}</div>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setAjout(false)}>
              <IconClose size={15} />
              {t("commun.annuler")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={envoi}>
              <IconPlus size={15} />
              {envoi ? t("ag.ajoutEnCours") : t("pl.enregistrerLigne")}
            </button>
          </div>
        </form>
      )}

      {lignes.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">
              <IconPlus />
            </div>
            <div className="empty-title">{t("pl.grilleVideTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("pl.grilleVide")}
            </p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={() => setAjout(true)}>
              <IconPlus size={15} />
              {t("pl.ajouterLigne")}
            </button>
          </div>
        </div>
      ) : (
        <div className="fdt">
          <div className="fdt-defile">
            <table className="fdt-table">
              <thead>
                <tr>
                  <th className="fdt-col-activite">{t("ag.activite")}</th>
                  {feuille.jours.map((j) => {
                    const d = new Date(`${j.jour}T00:00:00`);
                    return (
                      <th
                        key={j.jour}
                        className={`fdt-col-jour${j.jour === aujourdhui ? " aujourdhui" : ""}${j.ouvre ? "" : " repos"}`}
                      >
                        <span className="fdt-jour-nom">{d.toLocaleDateString(locale, { weekday: "short" })}</span>
                        <span className="fdt-jour-num">{d.getDate()}</span>
                      </th>
                    );
                  })}
                  <th className="fdt-col-total">{t("pl.tempsPasse")}</th>
                </tr>
              </thead>

              <tbody>
                {lignes.map((l) => (
                  <tr key={l.cle}>
                    <th scope="row" className="fdt-col-activite">
                      {/* Pastille de couleur : la même que dans l'agenda, pour
                          reconnaître une activité sans relire son libellé. */}
                      <span className="fdt-puce" style={{ background: TEINTES[l.activite] }} aria-hidden />
                      <span className="fdt-libelle">
                        <span className="fdt-activite">{libelleActivite(l.activite)}</span>
                        {l.clientNom && <span className="fdt-client">{l.clientNom}</span>}
                      </span>
                    </th>

                    {feuille.jours.map((j) => {
                      const case_ = l.parJour[j.jour];
                      const minutes = case_?.minutes ?? 0;
                      const futur = j.jour > aujourdhui;
                      const multiple = (case_?.nbSaisies ?? 0) > 1;
                      const cleCase = `${l.cle}|${j.jour}`;
                      const active = caseActive?.ligne.cle === l.cle && caseActive?.jour === j.jour;
                      return (
                        <td
                          key={j.jour}
                          className={[
                            "fdt-case",
                            j.ouvre ? "" : "repos",
                            minutes === 0 ? "vide" : "remplie",
                            enCours === cleCase ? "en-cours" : "",
                            j.jour === aujourdhui ? "colonne-active" : "",
                            active ? "active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {futur || multiple ? (
                            <span
                              className="fdt-lecture"
                              title={multiple ? t("pl.caseMultiple", { n: nombre(case_!.nbSaisies) }) : undefined}
                            >
                              {minutes === 0 ? "—" : enDuree(minutes)}
                              {multiple && <span className="fdt-marque">*</span>}
                            </span>
                          ) : (
                            <input
                              className="fdt-saisie"
                              defaultValue={minutes === 0 ? "" : enDuree(minutes)}
                              placeholder="—"
                              aria-label={`${libelleActivite(l.activite)} ${j.jour}`}
                              onFocus={(e) => {
                                e.currentTarget.select();
                                setCaseActive({ ligne: l, jour: j.jour });
                              }}
                              onBlur={(e) => enregistrerCase(l, j.jour, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                                if (e.key === "Escape") {
                                  e.currentTarget.value = minutes === 0 ? "" : enDuree(minutes);
                                  e.currentTarget.blur();
                                }
                              }}
                            />
                          )}
                        </td>
                      );
                    })}

                    <td className={`fdt-total-ligne${l.total === 0 ? " vide" : ""}`}>
                      {l.total === 0 ? "—" : enDuree(l.total)}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="fdt-totaux">
                  <th scope="row" className="fdt-col-activite">
                    {t("commun.total")}
                  </th>
                  {feuille.jours.map((j) => (
                    <td
                      key={j.jour}
                      className={`fdt-total-jour${j.ouvre ? "" : " repos"}${j.jour === aujourdhui ? " colonne-active" : ""}`}
                    >
                      <span className="fdt-total-valeur">{j.minutes === 0 ? "—" : enDuree(j.minutes)}</span>
                      {/* L'écart sous le total : un total seul n'apprend rien
                          tant qu'on ignore ce qui était attendu. */}
                      {j.ouvre && j.ecart !== 0 && (
                        <span className={`fdt-ecart${j.ecart > 0 ? " surplus" : " manque"}`}>
                          {j.ecart > 0 ? "+" : ""}
                          {enDuree(j.ecart)}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="fdt-total-general">
                    <span className="fdt-total-valeur">{enDuree(feuille.total)}</span>
                    {feuille.ecart !== 0 && (
                      <span className={`fdt-ecart${feuille.ecart > 0 ? " surplus" : " manque"}`}>
                        {feuille.ecart > 0 ? "+" : ""}
                        {enDuree(feuille.ecart)}
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Raccourcis de durée : une journée se compte en demies et en
              quarts d'heure, et six boutons évitent six frappes. */}
          <div className="fdt-pied">
            {caseActive ? (
              <div className="fdt-raccourcis">
                <span className="fdt-raccourcis-cible">
                  {libelleActivite(caseActive.ligne.activite)}
                  {" · "}
                  {new Date(`${caseActive.jour}T00:00:00`).toLocaleDateString(locale, {
                    weekday: "long",
                    day: "numeric",
                  })}
                </span>
                {RACCOURCIS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="fdt-raccourci"
                    // onMouseDown : le clic ne doit pas faire perdre le focus
                    // de la case avant d'avoir pu y écrire.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      enregistrerCase(caseActive.ligne, caseActive.jour, enDuree(m));
                    }}
                  >
                    {enDuree(m)}
                  </button>
                ))}
                <button
                  type="button"
                  className="fdt-raccourci effacer"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    enregistrerCase(caseActive.ligne, caseActive.jour, "0");
                  }}
                >
                  {t("pl.effacer")}
                </button>
              </div>
            ) : (
              <p className="fdt-aide">{t("pl.aideSaisie")}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
