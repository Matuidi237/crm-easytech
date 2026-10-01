import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ACTIVITES,
  SemaineTemps,
  SuggestionClient,
  TypeActivite,
  creerSaisieTemps,
  fetchSemaineTemps,
  supprimerSaisieTemps,
} from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { useFilAriane } from "../ContexteEntete";
import ChampClient from "../components/ChampClient";
import { IconAlert, IconChevronLeft, IconChevronRight, IconInbox, IconPlus, IconTrash } from "../components/Icons";

/** Jour au format ISO court, en heure locale. */
function cleJour(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lundi de la semaine contenant la date, comme côté serveur. */
function lundiDe(d: Date) {
  const j = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  j.setDate(j.getDate() - ((j.getDay() + 6) % 7));
  return j;
}

/** « 09:30 » depuis des minutes, et l'inverse. */
function enHeure(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function enMinutes(heure: string) {
  const [h, m] = heure.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/* Durées affichées en heures et minutes, jamais en décimal : « 1,75 h » oblige
   à une conversion mentale que « 1 h 45 » évite. */
function duree(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/* Une teinte par famille d'activité : le temps commercial, le temps de
   production et le temps interne se distinguent d'un coup d'œil sur la bande
   de la semaine. La couleur suit l'activité, jamais sa position. */
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

const VIDE = {
  activite: "PROSPECTION" as TypeActivite,
  debut: "09:00",
  fin: "10:00",
  description: "",
  clientId: null as string | null,
  clientNom: "",
};

/**
 * Feuille de temps hebdomadaire.
 *
 * Une semaine à la fois, et le jour sélectionné au centre : une grille
 * mensuelle donne le sentiment de tout voir, mais ne permet de rien saisir
 * sans viser une case de quelques pixels.
 *
 * La saisie reprend les horaires du dernier créneau comme nouveau départ :
 * une journée se pointe en continu, et retaper « 10:00 » après avoir fini à
 * 10:00 est le genre de friction qui fait abandonner l'exercice.
 */
export default function FeuilleDeTempsPage() {
  const { t, nombre, locale } = useLangue();
  const [semaine, setSemaine] = useState(() => lundiDe(new Date()));
  const [jourActif, setJourActif] = useState(() => cleJour(new Date()));
  const [donnees, setDonnees] = useState<SemaineTemps | null>(null);
  const [form, setForm] = useState(VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useFilAriane("/agenda", t("ag.retour"), t("ag.feuilleTitre"));

  function recharger(lundi: Date) {
    fetchSemaineTemps(cleJour(lundi))
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }

  useEffect(() => {
    setDonnees(null);
    recharger(semaine);
  }, [semaine]);

  const jours = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(semaine);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [semaine]);

  const aujourdhui = cleJour(new Date());
  const saisiesDuJour = (donnees?.saisies ?? []).filter((s) => s.jour.slice(0, 10) === jourActif);
  const futur = jourActif > aujourdhui;

  function changerSemaine(pas: number) {
    const d = new Date(semaine);
    d.setDate(d.getDate() + pas * 7);
    setSemaine(d);
    /* Le jour actif suit la semaine : rester sur un jour absent de l'écran
       afficherait une liste vide sans dire pourquoi. */
    const nouveau = new Date(d);
    nouveau.setDate(nouveau.getDate() + ((new Date(jourActif).getDay() + 6) % 7));
    setJourActif(cleJour(nouveau));
  }

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    const debutMinutes = enMinutes(form.debut);
    const finMinutes = enMinutes(form.fin);
    if (debutMinutes === null || finMinutes === null) return;

    setErreur(null);
    setEnvoi(true);
    try {
      await creerSaisieTemps({
        jour: jourActif,
        debutMinutes,
        finMinutes,
        activite: form.activite,
        description: form.description,
        clientId: form.clientId,
      });
      /* Le créneau suivant démarre où celui-ci s'arrête, sur une durée d'une
         heure par défaut : c'est la façon dont une journée se remplit. */
      const suite = Math.min(finMinutes + 60, 24 * 60);
      setForm({ ...VIDE, activite: form.activite, debut: enHeure(finMinutes), fin: enHeure(suite) });
      recharger(semaine);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  async function retirer(id: string) {
    setErreur(null);
    try {
      await supprimerSaisieTemps(id);
      recharger(semaine);
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  const libelleActivite = (a: TypeActivite) => t(`activite.${a}` as CleTraduction);
  const totalSemaine = donnees?.totalMinutes ?? 0;
  /* Repère de 35 heures : sans lui, « 28 h » ne dit pas si la semaine est
     pleine. Le pourcentage reste indicatif, aucun seuil n'est imposé. */
  const REFERENCE_HEBDO = 35 * 60;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("ag.feuilleTitre")}</h1>
          <div className="page-sub">{t("ag.feuilleSousTitre")}</div>
        </div>
      </div>

      {erreur && (
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      )}

      {/* Bande de la semaine : sept jours, leur charge, et le jour choisi. */}
      <div className="card">
        <div className="semaine-tete">
          <button className="btn btn-ghost btn-sm" onClick={() => changerSemaine(-1)} aria-label={t("ag.semainePrecedente")}>
            <IconChevronLeft size={15} />
          </button>
          <div className="semaine-titre">
            <div className="semaine-libelle">
              {jours[0].toLocaleDateString(locale, { day: "numeric", month: "short" })} -{" "}
              {jours[6].toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
            </div>
            <div className="semaine-total">
              {t("ag.totalSemaine", { duree: duree(totalSemaine) })}
              <span className="semaine-part">
                {Math.round((totalSemaine / REFERENCE_HEBDO) * 100)}% {t("ag.deLaReference")}
              </span>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => changerSemaine(1)} aria-label={t("ag.semaineSuivante")}>
            <IconChevronRight size={15} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setSemaine(lundiDe(new Date())); setJourActif(aujourdhui); }}>
            {t("ag.cetteSemaine")}
          </button>
        </div>

        <div className="bande-jours">
          {jours.map((j) => {
            const cle = cleJour(j);
            const minutes = donnees?.parJour[cle] ?? 0;
            return (
              <button
                key={cle}
                type="button"
                className={`jour-case${cle === jourActif ? " on" : ""}${cle === aujourdhui ? " aujourdhui" : ""}`}
                onClick={() => setJourActif(cle)}
                aria-pressed={cle === jourActif}
              >
                <span className="jour-nom">{j.toLocaleDateString(locale, { weekday: "short" })}</span>
                <span className="jour-num">{j.getDate()}</span>
                <span className={`jour-charge${minutes === 0 ? " vide" : ""}`}>
                  {minutes === 0 ? "-" : duree(minutes)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Saisie du jour sélectionné. */}
      <form className="card" onSubmit={ajouter}>
        <div className="card-head">
          <div>
            <div className="card-title">
              {new Date(`${jourActif}T00:00:00`).toLocaleDateString(locale, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </div>
            <div className="card-sub">{t("ag.saisieSousTitre")}</div>
          </div>
        </div>

        {futur ? (
          <div className="alert alert-info" style={{ marginTop: 14 }}>
            <IconAlert />
            {t("ag.jourFutur")}
          </div>
        ) : (
          <>
            <div className="form-grid form-grid-creneau" style={{ marginTop: 14 }}>
              <div className="field">
                <label htmlFor="ft-activite">{t("ag.activite")}</label>
                <select
                  id="ft-activite"
                  value={form.activite}
                  onChange={(e) => setForm((f) => ({ ...f, activite: e.target.value as TypeActivite }))}
                >
                  {ACTIVITES.map((a) => (
                    <option key={a} value={a}>
                      {libelleActivite(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ft-debut">{t("ag.debut")}</label>
                <input
                  id="ft-debut"
                  type="time"
                  step={300}
                  value={form.debut}
                  onChange={(e) => setForm((f) => ({ ...f, debut: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="ft-fin">{t("ag.fin")}</label>
                <input
                  id="ft-fin"
                  type="time"
                  step={300}
                  value={form.fin}
                  onChange={(e) => setForm((f) => ({ ...f, fin: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="vente-client">{t("ag.client")}</label>
                <ChampClient
                  valeur={form.clientNom}
                  onChange={(nom) => setForm((f) => ({ ...f, clientNom: nom, clientId: null }))}
                  onChoisir={(c: SuggestionClient) => setForm((f) => ({ ...f, clientNom: c.nom, clientId: c.id }))}
                />
                {/* Facultatif : une réunion interne ou une formation ne vise
                    aucun client, et exiger un nom ferait inventer une entrée. */}
                <div className="field-hint">{t("ag.clientAide")}</div>
              </div>
              <div className="field">
                <label htmlFor="ft-desc">{t("ag.description")}</label>
                <input
                  id="ft-desc"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={t("ag.descriptionPlaceholder")}
                />
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={envoi}>
                <IconPlus size={16} />
                {envoi ? t("ag.ajoutEnCours") : t("ag.ajouter")}
              </button>
            </div>
          </>
        )}

        {saisiesDuJour.length > 0 && (
          <ul className="creneaux">
            {saisiesDuJour.map((s) => (
              <li key={s.id} className="creneau">
                <span className="creneau-barre" style={{ background: TEINTES[s.activite] }} aria-hidden />
                <span className="creneau-heures">
                  {enHeure(s.debutMinutes)} - {enHeure(s.finMinutes)}
                </span>
                <span className="creneau-corps">
                  <span className="creneau-activite">{libelleActivite(s.activite)}</span>
                  {(s.clientNom || s.description) && (
                    <span className="creneau-detail">
                      {[s.clientNom, s.description].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="creneau-duree">{duree(s.finMinutes - s.debutMinutes)}</span>
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={() => retirer(s.id)}
                  aria-label={t("ag.supprimerCreneau")}
                  title={t("ag.supprimerCreneau")}
                >
                  <IconTrash size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {!futur && saisiesDuJour.length === 0 && donnees !== null && (
          <p className="muted-3" style={{ margin: "16px 0 0", fontSize: 13 }}>
            {t("ag.jourVide")}
          </p>
        )}
      </form>

      {/* Où est passée la semaine. */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("ag.repartitionTitre")}</div>
            <div className="card-sub">{t("ag.repartitionSousTitre")}</div>
          </div>
        </div>

        {!donnees || donnees.parActivite.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("ag.repartitionVideTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("ag.repartitionVideTexte")}
            </p>
          </div>
        ) : (
          <ul className="repartition">
            {donnees.parActivite.map((a) => {
              const part = Math.round((a.minutes / donnees.totalMinutes) * 100);
              return (
                <li key={a.activite} className="repartition-ligne">
                  <span className="repartition-nom">{libelleActivite(a.activite)}</span>
                  <span className="repartition-rail">
                    <span
                      className="repartition-barre"
                      style={{ width: `${part}%`, background: TEINTES[a.activite] }}
                    />
                  </span>
                  <span className="repartition-valeur">
                    {duree(a.minutes)}
                    <span className="repartition-part">{nombre(part)}%</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
