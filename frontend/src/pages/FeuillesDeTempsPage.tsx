import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FeuilleDeTemps,
  SaisieTemps,
  SuggestionClient,
  creerSaisieTemps,
  fetchActivitesConnues,
  fetchFeuilleDeTemps,
  modifierSaisieTemps,
  supprimerSaisieTemps,
} from "../api";
import { useLangue } from "../i18n";
import { useFilAriane } from "../ContexteEntete";
import ChampClient from "../components/ChampClient";
import NotesDuJour from "../components/NotesDuJour";
import ListeDeroulante from "../components/ListeDeroulante";
import { cleJour, depuisHeure, dureeLongue, enHeure, teinteActivite } from "../lib/activites";
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconEdit,
  IconPlus,
  IconTrash,
} from "../components/Icons";

/** Durées proposées d'un clic : elles fixent l'heure de fin depuis le début. */
const DUREES = [30, 60, 90, 120, 180, 240];

const FORMULAIRE_VIDE = {
  id: null as string | null,
  activite: "",
  debut: "08:00",
  fin: "09:00",
  clientId: null as string | null,
  clientNom: "",
  description: "",
};

/**
 * Feuille de temps, jour par jour.
 *
 * La version précédente était une grille semaine x activités, où l'activité
 * se choisissait dans une liste fermée de douze codes et où le temps se
 * déclarait en durée, sans horaire. Deux défauts : ce qu'on avait fait
 * n'entrait pas toujours dans l'une des douze cases, et une durée sans
 * créneau ne se rattache à rien.
 *
 * On déclare donc une journée comme on la raconte : de telle heure à telle
 * heure, j'ai fait ceci, pour ce client. L'activité est du texte libre, les
 * libellés déjà employés étant simplement reproposés, ce qui garde les
 * statistiques regroupées sans rien interdire.
 */
export default function FeuillesDeTempsPage() {
  const { t, nombre, locale } = useLangue();
  const [jour, setJour] = useState(() => cleJour(new Date()));
  const [feuille, setFeuille] = useState<FeuilleDeTemps | null>(null);
  const [semaine, setSemaine] = useState<FeuilleDeTemps | null>(null);
  const [activites, setActivites] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [form, setForm] = useState(FORMULAIRE_VIDE);
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  useFilAriane("/planning", t("nav.calendrier"), t("pl.feuillesTitre"));

  function recharger() {
    fetchFeuilleDeTemps("JOUR", jour)
      .then(setFeuille)
      .catch((e) => setErreur(e.message));
    fetchFeuilleDeTemps("SEMAINE", jour)
      .then(setSemaine)
      .catch(() => setSemaine(null));
  }

  useEffect(() => {
    setFeuille(null);
    setOuvert(false);
    recharger();
  }, [jour]);

  useEffect(() => {
    fetchActivitesConnues()
      .then(setActivites)
      .catch(() => setActivites([]));
  }, []);

  const date = useMemo(() => new Date(`${jour}T00:00:00`), [jour]);
  const aujourdhui = cleJour(new Date());
  const futur = jour > aujourdhui;

  /* Les créneaux du jour, prévus compris : un rendez-vous pris d'avance se
     voit ici et se confirme d'un geste, plutôt que de se ressaisir. */
  const creneaux = useMemo(
    () => [...(feuille?.saisies ?? [])].sort((a, b) => a.debutMinutes - b.debutMinutes),
    [feuille]
  );
  const realises = creneaux.filter((c) => c.statut === "REALISE");
  const minutesJour = realises.reduce((s, c) => s + (c.finMinutes - c.debutMinutes), 0);
  const cibleJour = feuille?.cibleParJourMinutes ?? 8 * 60;
  const partJour = cibleJour > 0 ? Math.round((minutesJour / cibleJour) * 100) : 0;
  const reste = Math.max(0, cibleJour - minutesJour);

  /** Les sept jours de la semaine affichée, avec leur charge. */
  const bandeSemaine = useMemo(() => {
    const lundi = new Date(date);
    lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lundi);
      d.setDate(d.getDate() + i);
      const cle = cleJour(d);
      return { cle, date: d, minutes: semaine?.parJour[cle] ?? 0 };
    });
  }, [date, semaine]);

  function decaler(jours: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + jours);
    setJour(cleJour(d));
  }

  /**
   * Ouvre le formulaire, enchaîné sur la fin du dernier créneau.
   *
   * Une journée se pointe dans l'ordre : proposer 8 h puis la fin du créneau
   * précédent évite de retaper deux horaires à chaque ligne.
   */
  function ouvrirAjout() {
    const finDerniere = creneaux.reduce((max, c) => Math.max(max, c.finMinutes), 0);
    const debut = finDerniere > 0 ? finDerniere : 8 * 60;
    setForm({
      ...FORMULAIRE_VIDE,
      debut: enHeure(debut),
      fin: enHeure(Math.min(24 * 60, debut + 60)),
    });
    setOuvert(true);
    setErreur(null);
    setSucces(null);
  }

  function ouvrirEdition(c: SaisieTemps) {
    setForm({
      id: c.id,
      activite: c.activite,
      debut: enHeure(c.debutMinutes),
      fin: enHeure(c.finMinutes),
      clientId: c.clientId,
      clientNom: c.clientNom ?? "",
      description: c.description ?? "",
    });
    setOuvert(true);
    setErreur(null);
    setSucces(null);
  }

  const debutMinutes = depuisHeure(form.debut);
  const finMinutes = depuisHeure(form.fin);
  const dureeForm = debutMinutes !== null && finMinutes !== null ? finMinutes - debutMinutes : null;
  const valide = form.activite.trim() !== "" && dureeForm !== null && dureeForm > 0;

  /** Un raccourci fixe l'heure de fin : c'est la durée qu'on a en tête. */
  function poserDuree(minutes: number) {
    if (debutMinutes === null) return;
    setForm((f) => ({ ...f, fin: enHeure(Math.min(24 * 60, debutMinutes + minutes)) }));
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!valide || debutMinutes === null || finMinutes === null) return;

    setErreur(null);
    setSucces(null);
    setEnvoi(true);
    const charge = {
      debutMinutes,
      finMinutes,
      activite: form.activite.trim(),
      description: form.description.trim(),
      clientId: form.clientId,
    };
    try {
      if (form.id) {
        await modifierSaisieTemps(form.id, charge);
        setSucces(t("pl.creneauModifie"));
      } else {
        await creerSaisieTemps({ ...charge, jour });
        setSucces(
          t("pl.creneauAjoute", {
            activite: charge.activite,
            debut: enHeure(debutMinutes),
            fin: enHeure(finMinutes),
          })
        );
      }
      setOuvert(false);
      setForm(FORMULAIRE_VIDE);
      recharger();
      fetchActivitesConnues()
        .then(setActivites)
        .catch(() => undefined);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimer(c: SaisieTemps) {
    if (!confirm(t("pl.confirmerSuppressionCreneau", { activite: c.activite }))) return;
    setErreur(null);
    setSucces(null);
    try {
      await supprimerSaisieTemps(c.id);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("pl.feuillesTitre")}</h1>
      </div>
      <div className="head-actions">
        <Link to="/planning/agenda" className="btn btn-ghost">
          {t("pl.agendaTitre")}
          <IconArrowRight size={14} />
        </Link>
        <button className="btn btn-primary" onClick={ouvrirAjout} disabled={ouvert}>
          <IconPlus size={16} />
          {t("pl.ajouterActivite")}
        </button>
      </div>
    </div>
  );

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

      {/* La journée choisie, et ce qu'elle pèse. La bande des sept jours sert
          à la fois de repère et de navigation : on voit où il manque des
          heures et on y va d'un clic. */}
      <section className="panneau jour-tete">
        <div className="jour-nav">
          <button className="icon-btn" onClick={() => decaler(-1)} aria-label={t("pl.jourPrecedent")}>
            <IconChevronLeft size={17} />
          </button>
          <div className="jour-titre">
            <strong>{date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}</strong>
            <span className="jour-sous">
              {dureeLongue(minutesJour)}
              {" · "}
              {reste > 0 && !futur
                ? t("pl.resteAPointer", { duree: dureeLongue(reste) })
                : t("pl.surCibleJour", { cible: dureeLongue(cibleJour) })}
            </span>
          </div>
          <button className="icon-btn" onClick={() => decaler(1)} aria-label={t("pl.jourSuivant")}>
            <IconChevronRight size={17} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setJour(aujourdhui)}>
            {t("cal.aujourdhui")}
          </button>
        </div>

        <div className="bande-jours" role="group" aria-label={t("pl.semaine")}>
          {bandeSemaine.map((j) => (
            <button
              key={j.cle}
              type="button"
              className={`jour-case${j.cle === jour ? " on" : ""}${j.cle === aujourdhui ? " aujourdhui" : ""}`}
              onClick={() => setJour(j.cle)}
              aria-pressed={j.cle === jour}
            >
              <span className="jour-nom">{j.date.toLocaleDateString(locale, { weekday: "short" })}</span>
              <span className="jour-num">{j.date.getDate()}</span>
              {/* La charge du jour sous son numéro : on cherche les jours
                  creux, et ils doivent se voir sans ouvrir chacun. */}
              <span className={`jour-charge${j.minutes === 0 ? " vide" : ""}`}>
                {j.minutes === 0 ? "—" : dureeLongue(j.minutes)}
              </span>
            </button>
          ))}
        </div>

        <div className="mesure">
          <span className="mesure-remplie" style={{ width: `${Math.min(100, partJour)}%` }} />
        </div>
        <div className="mesure-pied">
          <span>{t("pl.partJournee", { pct: nombre(partJour) })}</span>
          <span>{t("pl.nCreneaux", { n: nombre(creneaux.length) })}</span>
        </div>
      </section>

      {/* Le formulaire s'ouvre au-dessus de la liste : la ligne saisie
          apparaît juste en dessous, là où on regarde déjà. */}
      {ouvert && (
        <form className="panneau" onSubmit={enregistrer}>
          <header className="panneau-tete">
            <h2>{form.id ? t("pl.modifierCreneau") : t("pl.nouveauCreneau")}</h2>
            <span className="panneau-note">
              {dureeForm !== null && dureeForm > 0 ? dureeLongue(dureeForm) : t("pl.dureeAttendue")}
            </span>
          </header>

          <div className="field">
            <label htmlFor="fdt-activite">{t("pl.activiteFaite")}</label>
            {/* Saisie libre : la liste propose les libellés déjà employés,
                elle n'enferme pas. */}
            <ListeDeroulante
              id="fdt-activite"
              valeur={form.activite}
              options={activites}
              onChange={(v) => setForm((f) => ({ ...f, activite: v }))}
              placeholder={t("pl.activitePlaceholder")}
              libre
            />
            <div className="field-hint">{t("pl.activiteAide")}</div>
          </div>

          <div className="form-grid form-grid-trois">
            <div className="field">
              <label htmlFor="fdt-debut">{t("pl.heureDebut")}</label>
              <input
                id="fdt-debut"
                type="time"
                step={300}
                value={form.debut}
                onChange={(e) => setForm((f) => ({ ...f, debut: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="fdt-fin">{t("pl.heureFin")}</label>
              <input
                id="fdt-fin"
                type="time"
                step={300}
                value={form.fin}
                onChange={(e) => setForm((f) => ({ ...f, fin: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <span className="label-bloc">{t("pl.duree")}</span>
              <div className="fdt-chips">
                {DUREES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`fdt-raccourci${dureeForm === m ? " on" : ""}`}
                    onClick={() => poserDuree(m)}
                  >
                    {dureeLongue(m)}
                  </button>
                ))}
              </div>
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
              <div className="field-hint">{t("pl.clientFacultatif")}</div>
            </div>
            <div className="field">
              <label htmlFor="fdt-description">{t("pl.precision")}</label>
              <input
                id="fdt-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t("pl.precisionPlaceholder")}
              />
              <div className="field-hint">{t("pl.precisionAide")}</div>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setOuvert(false);
                setForm(FORMULAIRE_VIDE);
              }}
            >
              <IconClose size={15} />
              {t("commun.annuler")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={envoi || !valide}>
              <IconCheck size={15} />
              {envoi ? t("ag.ajoutEnCours") : form.id ? t("commun.enregistrer") : t("pl.ajouterAuJour")}
            </button>
          </div>
        </form>
      )}

      <section className="panneau">
        <header className="panneau-tete">
          <h2>{t("pl.journeeTitre")}</h2>
          {creneaux.length > 0 && (
            <span className="panneau-note">{dureeLongue(minutesJour)}</span>
          )}
        </header>

        {!feuille ? (
          <p className="panneau-vide">{t("commun.chargementDonnees")}</p>
        ) : creneaux.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconPlus />
            </div>
            <div className="empty-title">{t("pl.journeeVideTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("pl.journeeVideTexte")}
            </p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={ouvrirAjout}>
              <IconPlus size={15} />
              {t("pl.ajouterActivite")}
            </button>
          </div>
        ) : (
          <ul className="creneaux">
            {creneaux.map((c) => (
              <li key={c.id} className="creneau">
                <span
                  className={`creneau-barre${c.statut === "PREVU" ? " prevu" : ""}`}
                  style={{ background: teinteActivite(c.activite) }}
                  aria-hidden
                />
                <span className="creneau-heures">
                  {enHeure(c.debutMinutes)} - {enHeure(c.finMinutes)}
                </span>
                <span className="creneau-corps">
                  <span className="creneau-activite">
                    {c.activite}
                    {c.statut === "PREVU" && <span className="pill pill-neutral">{t("pl.creneauPrevu")}</span>}
                  </span>
                  {(c.clientNom || c.description) && (
                    <span className="creneau-detail">
                      {c.clientNom}
                      {c.clientNom && c.description ? " · " : ""}
                      {c.description}
                    </span>
                  )}
                </span>
                <span className="creneau-duree">{dureeLongue(c.finMinutes - c.debutMinutes)}</span>
                <span className="creneau-actions">
                  <button className="icon-btn" onClick={() => ouvrirEdition(c)} aria-label={t("commun.modifier")}>
                    <IconEdit size={15} />
                  </button>
                  <button className="icon-btn" onClick={() => supprimer(c)} aria-label={t("commun.supprimer")}>
                    <IconTrash size={15} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Les notes après la journée : on les écrit en relisant ce qu'on a
          fait, et ce qu'on retient d'une vente naît souvent là. */}
      <NotesDuJour jour={jour} />
    </>
  );
}
