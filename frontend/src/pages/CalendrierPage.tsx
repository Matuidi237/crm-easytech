import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ACTIVITES,
  PlageCalendrier,
  SaisieTemps,
  SuggestionClient,
  TypeActivite,
  creerSaisieTemps,
  fetchCalendrier,
  modifierSaisieTemps,
  supprimerSaisieTemps,
} from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import ChampClient from "../components/ChampClient";
import {
  IconAlert,
  IconArrowRight,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconPlus,
  IconTrash,
} from "../components/Icons";

type Vue = "MOIS" | "SEMAINE" | "JOUR";

/* La grille horaire s'arrête aux bornes d'une journée de travail. Afficher
   minuit à minuit ferait passer les deux tiers de la hauteur en bandes vides,
   et obligerait à défiler pour atteindre 9 h. */
const HEURE_DEBUT = 6;
const HEURE_FIN = 21;
const MINUTES_VISIBLES = (HEURE_FIN - HEURE_DEBUT) * 60;
const HAUTEUR_HEURE = 52;

/* Une teinte par activité : la couleur suit l'activité et jamais sa place
   dans la journée, de sorte qu'un même type se reconnaisse d'une semaine à
   l'autre. */
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

function cleJour(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function minuit(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Lundi de la semaine : norme ISO, et l'usage au Cameroun. */
function lundiDe(d: Date) {
  const j = minuit(d);
  j.setDate(j.getDate() - ((j.getDay() + 6) % 7));
  return j;
}

function enHeure(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function enMinutes(heure: string) {
  const [h, m] = heure.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

function duree(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/**
 * Place les créneaux qui se chevauchent côte à côte.
 *
 * Les créneaux sont regroupés en grappes qui se recouvrent, puis chaque
 * grappe se partage la largeur en colonnes. Sans cela, deux créneaux
 * simultanés se superposent et le second devient invisible.
 */
function disposer(saisies: SaisieTemps[]) {
  const tries = [...saisies].sort((a, b) => a.debutMinutes - b.debutMinutes || a.finMinutes - b.finMinutes);
  const placés: { saisie: SaisieTemps; colonne: number; colonnes: number }[] = [];

  let grappe: SaisieTemps[] = [];
  let finGrappe = -1;

  const vider = () => {
    if (grappe.length === 0) return;
    const colonnes: SaisieTemps[][] = [];
    for (const s of grappe) {
      // Première colonne dont le dernier créneau s'achève avant celui-ci.
      let i = colonnes.findIndex((col) => col[col.length - 1].finMinutes <= s.debutMinutes);
      if (i === -1) {
        colonnes.push([s]);
        i = colonnes.length - 1;
      } else {
        colonnes[i].push(s);
      }
    }
    for (const [i, col] of colonnes.entries()) {
      for (const s of col) placés.push({ saisie: s, colonne: i, colonnes: colonnes.length });
    }
    grappe = [];
    finGrappe = -1;
  };

  for (const s of tries) {
    if (grappe.length > 0 && s.debutMinutes >= finGrappe) vider();
    grappe.push(s);
    finGrappe = Math.max(finGrappe, s.finMinutes);
  }
  vider();

  return placés;
}

const VIDE = {
  activite: "RENDEZ_VOUS" as TypeActivite,
  debut: "09:00",
  fin: "10:00",
  description: "",
  clientId: null as string | null,
  clientNom: "",
};

/**
 * Calendrier du commercial, et la fiche du jour sélectionné.
 *
 * Trois vues, mois, semaine et jour, sur le modèle des agendas que tout le
 * monde connaît déjà : la grille horaire montre la forme de la journée, ce
 * qu'une liste de créneaux ne donne jamais. Les trous s'y voient, et ce sont
 * eux qui portent l'information utile.
 *
 * La fiche journalière reste sous la grille plutôt que dans une fenêtre : on
 * saisit en regardant ce qui est déjà posé, et une fenêtre modale masquerait
 * précisément ce qu'on vérifie.
 */
export default function CalendrierPage() {
  const { t, nombre, locale } = useLangue();
  const [vue, setVue] = useState<Vue>("SEMAINE");
  const [ancre, setAncre] = useState(() => new Date());
  const [jourActif, setJourActif] = useState(() => cleJour(new Date()));
  const [plage, setPlage] = useState<PlageCalendrier | null>(null);
  const [form, setForm] = useState(VIDE);
  const [edition, setEdition] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const grille = useRef<HTMLDivElement>(null);

  /* Fenêtre à charger : la vue mensuelle couvre six semaines pleines, donc
     des jours des mois voisins, exactement ce que montre la grille. */
  const fenetre = useMemo(() => {
    if (vue === "JOUR") {
      const d = minuit(ancre);
      const fin = new Date(d);
      fin.setDate(fin.getDate() + 1);
      return { debut: d, fin };
    }
    if (vue === "SEMAINE") {
      const d = lundiDe(ancre);
      const fin = new Date(d);
      fin.setDate(fin.getDate() + 7);
      return { debut: d, fin };
    }
    const premier = new Date(ancre.getFullYear(), ancre.getMonth(), 1);
    const debut = lundiDe(premier);
    const fin = new Date(debut);
    fin.setDate(fin.getDate() + 42);
    return { debut, fin };
  }, [vue, ancre]);

  function recharger() {
    fetchCalendrier(cleJour(fenetre.debut), cleJour(fenetre.fin))
      .then(setPlage)
      .catch((e) => setErreur(e.message));
  }

  useEffect(recharger, [fenetre.debut.getTime(), fenetre.fin.getTime()]);

  /* La grille s'ouvre sur le début de matinée plutôt qu'à 6 h : personne ne
     commence sa lecture par une bande vide. */
  useEffect(() => {
    if (grille.current) grille.current.scrollTop = (8 - HEURE_DEBUT) * HAUTEUR_HEURE;
  }, [vue]);

  const jours = useMemo(() => {
    const n = vue === "JOUR" ? 1 : vue === "SEMAINE" ? 7 : 42;
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(fenetre.debut);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [fenetre, vue]);

  const aujourdhui = cleJour(new Date());
  const parJourSaisies = useMemo(() => {
    const m = new Map<string, SaisieTemps[]>();
    for (const s of plage?.saisies ?? []) {
      const cle = s.jour.slice(0, 10);
      m.set(cle, [...(m.get(cle) ?? []), s]);
    }
    return m;
  }, [plage]);

  const saisiesDuJour = parJourSaisies.get(jourActif) ?? [];
  const futur = jourActif > aujourdhui;
  const libelleActivite = (a: TypeActivite) => t(`activite.${a}` as CleTraduction);

  function decaler(pas: number) {
    const d = new Date(ancre);
    if (vue === "JOUR") d.setDate(d.getDate() + pas);
    else if (vue === "SEMAINE") d.setDate(d.getDate() + pas * 7);
    else d.setMonth(d.getMonth() + pas);
    setAncre(d);
    if (vue === "JOUR") setJourActif(cleJour(d));
  }

  function libelleFenetre() {
    if (vue === "JOUR")
      return ancre.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (vue === "MOIS") return ancre.toLocaleDateString(locale, { month: "long", year: "numeric" });
    const fin = new Date(fenetre.fin);
    fin.setDate(fin.getDate() - 1);
    return `${fenetre.debut.toLocaleDateString(locale, { day: "numeric", month: "short" })} - ${fin.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`;
  }

  /** Ouvre la fiche du jour sur un créneau vide, à l'heure visée. */
  function poserCreneau(jour: Date, heure: number) {
    const cle = cleJour(jour);
    if (cle > aujourdhui) return;
    setJourActif(cle);
    setEdition(null);
    setForm({ ...VIDE, debut: enHeure(heure * 60), fin: enHeure(Math.min((heure + 1) * 60, 24 * 60)) });
    document.getElementById("fiche-du-jour")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function ouvrirCreneau(s: SaisieTemps) {
    setJourActif(s.jour.slice(0, 10));
    setEdition(s.id);
    setForm({
      activite: s.activite,
      debut: enHeure(s.debutMinutes),
      fin: enHeure(s.finMinutes),
      description: s.description ?? "",
      clientId: s.clientId,
      clientNom: s.clientNom ?? "",
    });
    document.getElementById("fiche-du-jour")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const debutMinutes = enMinutes(form.debut);
    const finMinutes = enMinutes(form.fin);
    if (debutMinutes === null || finMinutes === null) return;

    setErreur(null);
    setEnvoi(true);
    try {
      const charge = {
        debutMinutes,
        finMinutes,
        activite: form.activite,
        description: form.description,
        clientId: form.clientId,
      };
      if (edition) {
        await modifierSaisieTemps(edition, charge);
        setEdition(null);
        setForm(VIDE);
      } else {
        await creerSaisieTemps({ jour: jourActif, ...charge });
        /* Le créneau suivant démarre où celui-ci s'arrête : une journée se
           pointe en continu, et retaper l'heure use. */
        const suite = Math.min(finMinutes + 60, 24 * 60);
        setForm({ ...VIDE, activite: form.activite, debut: enHeure(finMinutes), fin: enHeure(suite) });
      }
      recharger();
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
      if (edition === id) {
        setEdition(null);
        setForm(VIDE);
      }
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  /* Trait de l'heure courante : c'est le repère qu'on cherche en ouvrant un
     agenda, avant même de lire les rendez-vous. */
  const maintenant = new Date();
  const minutesMaintenant = maintenant.getHours() * 60 + maintenant.getMinutes();
  const traitVisible = minutesMaintenant >= HEURE_DEBUT * 60 && minutesMaintenant <= HEURE_FIN * 60;
  const positionTrait = ((minutesMaintenant - HEURE_DEBUT * 60) / MINUTES_VISIBLES) * 100;

  const heures = Array.from({ length: HEURE_FIN - HEURE_DEBUT + 1 }, (_, i) => HEURE_DEBUT + i);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("nav.calendrier")}</h1>
          <div className="page-sub">{t("cal.sousTitre")}</div>
        </div>
        <div className="head-actions">
          <Link to="/planning/objectifs" className="btn btn-ghost">
            {t("ag.objectifsTitre")}
            <IconArrowRight size={14} />
          </Link>
        </div>
      </div>

      {erreur && (
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      )}

      {/* Barre de navigation, comme tout agenda : aujourd'hui, les flèches,
          la période, puis le choix de la vue. */}
      <div className="cal-barre">
        <div className="cal-nav">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setAncre(new Date());
              setJourActif(aujourdhui);
            }}
          >
            {t("cal.aujourdhui")}
          </button>
          <button className="icon-btn" onClick={() => decaler(-1)} aria-label={t("ag.precedent")}>
            <IconChevronLeft size={17} />
          </button>
          <button className="icon-btn" onClick={() => decaler(1)} aria-label={t("ag.suivant")}>
            <IconChevronRight size={17} />
          </button>
          <span className="cal-titre">{libelleFenetre()}</span>
        </div>

        <div className="dim-switch" role="group" aria-label={t("cal.choisirVue")}>
          {(["JOUR", "SEMAINE", "MOIS"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`dim-opt${v === vue ? " on" : ""}`}
              onClick={() => {
                setVue(v);
                if (v === "JOUR") setAncre(new Date(`${jourActif}T00:00:00`));
              }}
              aria-pressed={v === vue}
            >
              {t(`cal.vue.${v}` as CleTraduction)}
            </button>
          ))}
        </div>
      </div>

      {/* Grille ------------------------------------------------------- */}
      {vue === "MOIS" ? (
        <div className="cal-mois">
          <div className="cal-mois-entete">
            {jours.slice(0, 7).map((j) => (
              <span key={j.getDay()}>{j.toLocaleDateString(locale, { weekday: "short" })}</span>
            ))}
          </div>
          <div className="cal-mois-grille">
            {jours.map((j) => {
              const cle = cleJour(j);
              const duJour = parJourSaisies.get(cle) ?? [];
              const horsMois = j.getMonth() !== ancre.getMonth();
              return (
                <div
                  key={cle}
                  className={`cal-case${horsMois ? " hors-mois" : ""}${cle === aujourdhui ? " aujourdhui" : ""}${cle === jourActif ? " actif" : ""}`}
                  onClick={() => {
                    setJourActif(cle);
                    setEdition(null);
                  }}
                >
                  <div className="cal-case-tete">
                    <span className="cal-case-num">{j.getDate()}</span>
                    {duJour.length > 0 && (
                      <span className="cal-case-total">
                        {duree((plage?.parJour[cle] ?? 0))}
                      </span>
                    )}
                  </div>
                  {/* Trois pastilles au plus, puis un compteur : empiler dix
                      lignes dans une case de 90 px les rend toutes illisibles. */}
                  {duJour.slice(0, 3).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="cal-pastille"
                      style={{ borderLeftColor: TEINTES[s.activite] }}
                      onClick={(e) => {
                        e.stopPropagation();
                        ouvrirCreneau(s);
                      }}
                      title={`${enHeure(s.debutMinutes)} ${libelleActivite(s.activite)}`}
                    >
                      <span className="cal-pastille-heure">{enHeure(s.debutMinutes)}</span>
                      <span className="cal-pastille-nom">{s.clientNom || libelleActivite(s.activite)}</span>
                    </button>
                  ))}
                  {duJour.length > 3 && (
                    <button
                      type="button"
                      className="cal-reste"
                      onClick={(e) => {
                        e.stopPropagation();
                        setJourActif(cle);
                        setVue("JOUR");
                        setAncre(j);
                      }}
                    >
                      {duJour.length === 4 ? t("cal.etUnAutre") : t("cal.etNAutres", { n: nombre(duJour.length - 3) })}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="cal-temps">
          <div className="cal-temps-entete">
            <span className="cal-gouttiere" />
            {jours.map((j) => {
              const cle = cleJour(j);
              return (
                <button
                  key={cle}
                  type="button"
                  className={`cal-jour-tete${cle === aujourdhui ? " aujourdhui" : ""}${cle === jourActif ? " actif" : ""}`}
                  onClick={() => {
                    setJourActif(cle);
                    setEdition(null);
                  }}
                >
                  <span className="cal-jour-nom">{j.toLocaleDateString(locale, { weekday: "short" })}</span>
                  <span className="cal-jour-num">{j.getDate()}</span>
                  {(plage?.parJour[cle] ?? 0) > 0 && (
                    <span className="cal-jour-total">{duree(plage!.parJour[cle])}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="cal-temps-corps" ref={grille}>
            {/* Étiquettes posées en absolu sur la hauteur exacte de la
                grille. Empilées en flux, la dernière ajoutait une bande de
                plus et décalait toute la colonne d'une heure. */}
            <div className="cal-heures" style={{ height: (HEURE_FIN - HEURE_DEBUT) * HAUTEUR_HEURE }}>
              {heures.map((h) => (
                <span key={h} className="cal-heure" style={{ top: (h - HEURE_DEBUT) * HAUTEUR_HEURE }}>
                  {enHeure(h * 60)}
                </span>
              ))}
            </div>

            {jours.map((j) => {
              const cle = cleJour(j);
              const places = disposer(parJourSaisies.get(cle) ?? []);
              return (
                <div key={cle} className="cal-colonne" style={{ height: (HEURE_FIN - HEURE_DEBUT) * HAUTEUR_HEURE }}>
                  {heures.slice(0, -1).map((h) => (
                    <button
                      key={h}
                      type="button"
                      className="cal-creneau-vide"
                      style={{ height: HAUTEUR_HEURE }}
                      onClick={() => poserCreneau(j, h)}
                      aria-label={t("cal.ajouterA", { heure: enHeure(h * 60) })}
                    />
                  ))}

                  {cle === aujourdhui && traitVisible && (
                    <span className="cal-maintenant" style={{ top: `${positionTrait}%` }} aria-hidden />
                  )}

                  {places.map(({ saisie: s, colonne, colonnes }) => {
                    const haut = ((s.debutMinutes - HEURE_DEBUT * 60) / MINUTES_VISIBLES) * 100;
                    const hauteur = ((s.finMinutes - s.debutMinutes) / MINUTES_VISIBLES) * 100;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`cal-event${edition === s.id ? " en-edition" : ""}`}
                        style={{
                          top: `${Math.max(0, haut)}%`,
                          height: `${Math.max(2.2, hauteur)}%`,
                          left: `${(colonne / colonnes) * 100}%`,
                          width: `${(1 / colonnes) * 100}%`,
                          background: TEINTES[s.activite],
                        }}
                        onClick={() => ouvrirCreneau(s)}
                        title={`${enHeure(s.debutMinutes)} - ${enHeure(s.finMinutes)} · ${libelleActivite(s.activite)}`}
                      >
                        <span className="cal-event-titre">{libelleActivite(s.activite)}</span>
                        <span className="cal-event-detail">
                          {enHeure(s.debutMinutes)}
                          {s.clientNom ? ` · ${s.clientNom}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fiche du jour ------------------------------------------------ */}
      <form className="card" id="fiche-du-jour" onSubmit={soumettre}>
        <div className="card-head">
          <div>
            <div className="card-title">
              {new Date(`${jourActif}T00:00:00`).toLocaleDateString(locale, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </div>
            <div className="card-sub">{edition ? t("ag.editionCreneau") : t("cal.ficheSousTitre")}</div>
          </div>
          {saisiesDuJour.length > 0 && <span className="tag">{duree(plage?.parJour[jourActif] ?? 0)}</span>}
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
                <label htmlFor="cal-activite">{t("ag.activite")}</label>
                <select
                  id="cal-activite"
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
                <label htmlFor="cal-debut">{t("ag.debut")}</label>
                <input
                  id="cal-debut"
                  type="time"
                  step={300}
                  value={form.debut}
                  onChange={(e) => setForm((f) => ({ ...f, debut: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="cal-fin">{t("ag.fin")}</label>
                <input
                  id="cal-fin"
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
                <div className="field-hint">{t("ag.clientAide")}</div>
              </div>
              <div className="field">
                <label htmlFor="cal-desc">{t("ag.description")}</label>
                <input
                  id="cal-desc"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={t("ag.descriptionPlaceholder")}
                />
              </div>
            </div>

            <div className="form-actions">
              {edition && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEdition(null);
                    setForm(VIDE);
                  }}
                >
                  <IconClose size={15} />
                  {t("commun.annuler")}
                </button>
              )}
              <button className="btn btn-primary" type="submit" disabled={envoi}>
                {!edition && <IconPlus size={16} />}
                {envoi ? t("ag.ajoutEnCours") : edition ? t("commun.enregistrer") : t("ag.ajouter")}
              </button>
            </div>
          </>
        )}

        {saisiesDuJour.length > 0 && (
          <ul className="creneaux">
            {[...saisiesDuJour]
              .sort((a, b) => a.debutMinutes - b.debutMinutes)
              .map((s) => (
                <li key={s.id} className={`creneau${edition === s.id ? " en-edition" : ""}`}>
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
                  <button type="button" className="link-action" onClick={() => ouvrirCreneau(s)}>
                    {t("ag.modifier")}
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => retirer(s.id)}
                    aria-label={t("ag.supprimerCreneau")}
                  >
                    <IconTrash size={15} />
                  </button>
                </li>
              ))}
          </ul>
        )}

        {!futur && saisiesDuJour.length === 0 && (
          <p className="muted-3" style={{ margin: "16px 0 0", fontSize: 13 }}>
            {t("cal.jourVide")}
          </p>
        )}
      </form>
    </>
  );
}
