import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { IconAlert, IconChevronLeft, IconChevronRight, IconClose, IconPlus } from "../components/Icons";

function cleJour(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lundiDe(d: Date) {
  const j = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  j.setDate(j.getDate() - ((j.getDay() + 6) % 7));
  return j;
}

/** « 2:30 » depuis des minutes. Zéro s'écrit « 0:00 », comme dans la grille. */
function enDuree(minutes: number) {
  const signe = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  return `${signe}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
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
  if (t === "" || t === "-") return 0;
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

const NOUVELLE_LIGNE = {
  activite: "PROSPECTION" as TypeActivite,
  clientId: null as string | null,
  clientNom: "",
};

/**
 * Feuille de temps hebdomadaire, en grille.
 *
 * Une ligne par activité, une colonne par jour, et la durée dans la case.
 * C'est la forme qu'ont prise tous les outils de pointage, parce qu'elle
 * permet de remplir une semaine entière sans changer d'écran et de voir d'un
 * regard ce qui manque.
 *
 * Les totaux de bas de colonne portent leur écart à la cible : un total seul
 * n'apprend rien tant qu'on ignore ce qui était attendu.
 */
export default function FeuillesDeTempsPage() {
  const { t, nombre, locale } = useLangue();
  const [ancre, setAncre] = useState(() => lundiDe(new Date()));
  const [feuille, setFeuille] = useState<FeuilleHebdo | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);
  const [nouvelle, setNouvelle] = useState(NOUVELLE_LIGNE);
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
    recharger();
  }, [ancre]);

  const aujourdhui = cleJour(new Date());
  const libelleActivite = (a: TypeActivite) => t(`activite.${a}` as CleTraduction);

  /* Les lignes du serveur, plus celles qu'on vient d'ajouter et qui n'ont pas
     encore d'heures. Une ligne sert d'abord à préparer la saisie. */
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

  function ajouterLigne(e: FormEvent) {
    e.preventDefault();
    const cle = `${nouvelle.activite}::${nouvelle.clientId ?? ""}`;
    if (!lignes.some((l) => l.cle === cle)) {
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
    }
    setNouvelle(NOUVELLE_LIGNE);
    setAjout(false);
  }

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("pl.feuillesTitre")}</h1>
        <div className="page-sub">{t("pl.feuillesSousTitre")}</div>
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

  return (
    <>
      {entete}

      {erreur && (
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      )}

      <div className="fdt">
        <div className="fdt-barre">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setAncre(lundiDe(new Date()))}
          >
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
                    <span className="fdt-activite">{libelleActivite(l.activite)}</span>
                    {l.clientNom && <span className="fdt-client">{l.clientNom}</span>}
                  </th>

                  {feuille.jours.map((j) => {
                    const case_ = l.parJour[j.jour];
                    const minutes = case_?.minutes ?? 0;
                    const futur = j.jour > aujourdhui;
                    /* Une case composée de plusieurs créneaux ne se réduit pas
                       à une durée sans choisir lequel écourter : elle reste en
                       lecture seule et renvoie vers l'agenda. */
                    const multiple = (case_?.nbSaisies ?? 0) > 1;
                    const cleCase = `${l.cle}|${j.jour}`;
                    return (
                      <td
                        key={j.jour}
                        className={`fdt-case${j.ouvre ? "" : " repos"}${minutes === 0 ? " vide" : ""}${enCours === cleCase ? " en-cours" : ""}`}
                      >
                        {futur || multiple ? (
                          <span
                            className="fdt-lecture"
                            title={multiple ? t("pl.caseMultiple", { n: nombre(case_!.nbSaisies) }) : undefined}
                          >
                            {enDuree(minutes)}
                            {multiple && <span className="fdt-marque">*</span>}
                          </span>
                        ) : (
                          <input
                            className="fdt-saisie"
                            defaultValue={enDuree(minutes)}
                            aria-label={`${libelleActivite(l.activite)} ${j.jour}`}
                            onFocus={(e) => e.currentTarget.select()}
                            onBlur={(e) => enregistrerCase(l, j.jour, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") {
                                e.currentTarget.value = enDuree(minutes);
                                e.currentTarget.blur();
                              }
                            }}
                          />
                        )}
                      </td>
                    );
                  })}

                  <td className="fdt-total-ligne">{enDuree(l.total)}</td>
                </tr>
              ))}

              {lignes.length === 0 && (
                <tr>
                  <td colSpan={9} className="fdt-vide">
                    {t("pl.grilleVide")}
                  </td>
                </tr>
              )}

              <tr className="fdt-ajout">
                <td colSpan={9}>
                  {ajout ? (
                    <form className="fdt-form" onSubmit={ajouterLigne}>
                      <div className="field">
                        <label htmlFor="fdt-activite">{t("ag.activite")}</label>
                        <select
                          id="fdt-activite"
                          value={nouvelle.activite}
                          onChange={(e) => setNouvelle((n) => ({ ...n, activite: e.target.value as TypeActivite }))}
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
                          onChoisir={(c: SuggestionClient) =>
                            setNouvelle((n) => ({ ...n, clientNom: c.nom, clientId: c.id }))
                          }
                        />
                      </div>
                      <div className="fdt-form-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAjout(false)}>
                          <IconClose size={14} />
                          {t("commun.annuler")}
                        </button>
                        <button type="submit" className="btn btn-primary btn-sm">
                          {t("pl.ajouterLigne")}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button type="button" className="fdt-ajout-lien" onClick={() => setAjout(true)}>
                      <IconPlus size={15} />
                      {t("pl.ajouterLigne")}
                    </button>
                  )}
                </td>
              </tr>
            </tbody>

            <tfoot>
              <tr className="fdt-totaux">
                <th scope="row" className="fdt-col-activite" />
                {feuille.jours.map((j) => (
                  <td
                    key={j.jour}
                    className={`fdt-total-jour${j.ouvre ? "" : " repos"}${j.ecart < 0 && j.ouvre ? " manque" : ""}${j.ecart > 0 ? " surplus" : ""}`}
                  >
                    {enDuree(j.minutes)}
                  </td>
                ))}
                <td className={`fdt-total-general${feuille.ecart < 0 ? " manque" : ""}`}>{enDuree(feuille.total)}</td>
              </tr>
              {/* L'écart sous le total : un total seul n'apprend rien tant
                  qu'on ignore ce qui était attendu. */}
              <tr className="fdt-ecarts">
                <th scope="row" className="fdt-col-activite" />
                {feuille.jours.map((j) => (
                  <td key={j.jour} className={j.ouvre ? "" : "repos"}>
                    {j.ouvre && j.ecart !== 0 && (
                      <span className={`fdt-ecart${j.ecart > 0 ? " surplus" : " manque"}`}>
                        {j.ecart > 0 ? "+" : ""}
                        {enDuree(j.ecart)}
                      </span>
                    )}
                  </td>
                ))}
                <td>
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

        <p className="fdt-aide">{t("pl.aideSaisie")}</p>
      </div>
    </>
  );
}
