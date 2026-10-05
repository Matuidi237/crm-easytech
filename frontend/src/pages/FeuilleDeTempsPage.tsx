import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ACTIVITES,
  FeuilleDeTemps,
  PERIODES,
  PeriodeObjectif,
  SaisieTemps,
  SuggestionClient,
  TypeActivite,
  creerSaisieTemps,
  fetchFeuilleDeTemps,
  modifierSaisieTemps,
  supprimerSaisieTemps,
} from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { useFilAriane } from "../ContexteEntete";
import ChampClient from "../components/ChampClient";
import {
  IconAlert,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCoins,
  IconInbox,
  IconPlus,
  IconTag,
  IconTrash,
  IconUsers,
} from "../components/Icons";

/** Jour au format ISO court, en heure locale. */
function cleJour(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

/* Durées en heures et minutes, jamais en décimal : « 1,75 h » oblige à une
   conversion mentale que « 1 h 45 » évite. */
function duree(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** Décale la date de référence d'un cran de la granularité choisie. */
function decaler(periode: PeriodeObjectif, d: Date, pas: number) {
  const n = new Date(d);
  if (periode === "JOUR") n.setDate(n.getDate() + pas);
  else if (periode === "SEMAINE") n.setDate(n.getDate() + pas * 7);
  else if (periode === "MOIS") n.setMonth(n.getMonth() + pas);
  else if (periode === "TRIMESTRE") n.setMonth(n.getMonth() + pas * 3);
  else if (periode === "SEMESTRE") n.setMonth(n.getMonth() + pas * 6);
  else n.setFullYear(n.getFullYear() + pas);
  return n;
}

/* Une teinte par activité : le temps commercial, le temps de production et le
   temps interne se distinguent d'un coup d'œil. La couleur suit l'activité,
   jamais sa position dans la liste. */
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
 * Feuille de temps.
 *
 * Six granularités de lecture, mais une seule de saisie : on pointe une
 * journée, jamais un trimestre. Les périodes longues servent à voir où le
 * temps passe, les courtes à le déclarer, et mélanger les deux produirait un
 * écran qui ne fait bien ni l'un ni l'autre.
 *
 * La saisie reprend l'horaire de fin du dernier créneau comme nouveau départ :
 * une journée se pointe en continu, et retaper « 10:00 » après avoir fini à
 * 10:00 est le genre de friction qui fait abandonner l'exercice.
 */
export default function FeuilleDeTempsPage() {
  const { t, nombre, locale } = useLangue();
  const [periode, setPeriode] = useState<PeriodeObjectif>("SEMAINE");
  const [reference, setReference] = useState(() => new Date());
  const [jourActif, setJourActif] = useState(() => cleJour(new Date()));
  const [donnees, setDonnees] = useState<FeuilleDeTemps | null>(null);
  const [form, setForm] = useState(VIDE);
  const [edition, setEdition] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useFilAriane("/planning", t("ag.retour"), t("ag.feuilleTitre"));

  function recharger() {
    fetchFeuilleDeTemps(periode, cleJour(reference))
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }

  useEffect(() => {
    setDonnees(null);
    setEdition(null);
    recharger();
  }, [periode, reference]);

  /* Les jours de la fenêtre, pour la bande de conformité. Au-delà du mois
     elle devient illisible et cède la place au récapitulatif mensuel. */
  const jours = useMemo(() => {
    if (!donnees || periode === "TRIMESTRE" || periode === "SEMESTRE" || periode === "ANNEE") return [];
    const liste: Date[] = [];
    const fin = new Date(donnees.fin);
    for (const d = new Date(donnees.debut); d < fin; d.setDate(d.getDate() + 1)) liste.push(new Date(d));
    return liste;
  }, [donnees, periode]);

  const aujourdhui = cleJour(new Date());
  const saisiesDuJour = (donnees?.saisies ?? []).filter((s) => s.jour.slice(0, 10) === jourActif);
  const futur = jourActif > aujourdhui;
  const libelleActivite = (a: TypeActivite) => t(`activite.${a}` as CleTraduction);

  /* Le jour de saisie suit la fenêtre : rester sur un jour absent de l'écran
     afficherait une liste vide sans dire pourquoi. */
  useEffect(() => {
    if (!donnees || !donnees.detaille) return;
    if (jourActif >= donnees.debut.slice(0, 10) && jourActif < donnees.fin.slice(0, 10)) return;
    const debut = new Date(donnees.debut);
    const dansLaFenetre = aujourdhui >= donnees.debut.slice(0, 10) && aujourdhui < donnees.fin.slice(0, 10);
    setJourActif(dansLaFenetre ? aujourdhui : cleJour(debut));
  }, [donnees]);

  function commencerEdition(s: SaisieTemps) {
    setEdition(s.id);
    setForm({
      activite: s.activite,
      debut: enHeure(s.debutMinutes),
      fin: enHeure(s.finMinutes),
      description: s.description ?? "",
      clientId: s.clientId,
      clientNom: s.clientNom ?? "",
    });
  }

  function annulerEdition() {
    setEdition(null);
    setForm(VIDE);
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
        /* Le créneau suivant démarre où celui-ci s'arrête, sur une heure par
           défaut : c'est la façon dont une journée se remplit. */
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
      if (edition === id) annulerEdition();
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  /** Libellé de la fenêtre courante, adapté à sa granularité. */
  function libelleFenetre(d: FeuilleDeTemps) {
    const debut = new Date(d.debut);
    const fin = new Date(d.fin);
    fin.setDate(fin.getDate() - 1);
    if (d.periode === "JOUR") {
      return debut.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }
    if (d.periode === "SEMAINE") {
      return `${debut.toLocaleDateString(locale, { day: "numeric", month: "short" })} - ${fin.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`;
    }
    if (d.periode === "MOIS") return debut.toLocaleDateString(locale, { month: "long", year: "numeric" });
    if (d.periode === "TRIMESTRE")
      return t("ag.trimestreN", { n: Math.floor(debut.getMonth() / 3) + 1, annee: debut.getFullYear() });
    if (d.periode === "SEMESTRE")
      return t("ag.semestreN", { n: debut.getMonth() < 6 ? 1 : 2, annee: debut.getFullYear() });
    return String(debut.getFullYear());
  }

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("ag.feuilleTitre")}</h1>
        <div className="page-sub">{t("ag.feuilleSousTitre")}</div>
      </div>
    </div>
  );

  if (!donnees) {
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

  const partCible = donnees.cibleMinutes > 0 ? Math.round((donnees.totalMinutes / donnees.cibleMinutes) * 100) : null;

  return (
    <>
      {entete}

      {erreur && (
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      )}

      {/* Granularité et navigation. */}
      <div className="card">
        <div className="dim-switch dim-switch-large" role="group" aria-label={t("ag.granularite")}>
          {PERIODES.map((p) => (
            <button
              key={p}
              type="button"
              className={`dim-opt${p === periode ? " on" : ""}`}
              onClick={() => setPeriode(p)}
              aria-pressed={p === periode}
            >
              {t(`periode.${p}` as CleTraduction)}
            </button>
          ))}
        </div>

        <div className="semaine-tete" style={{ marginTop: 14 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setReference((d) => decaler(periode, d, -1))}
            aria-label={t("ag.precedent")}
          >
            <IconChevronLeft size={15} />
          </button>
          <div className="semaine-titre">
            <div className="semaine-libelle">{libelleFenetre(donnees)}</div>
            <div className="semaine-total">
              {t("ag.totalSemaine", { duree: duree(donnees.totalMinutes) })}
              {partCible !== null && (
                <span className="semaine-part">
                  {t("ag.surCibleHeures", { pct: nombre(partCible), cible: duree(donnees.cibleMinutes) })}
                </span>
              )}
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setReference((d) => decaler(periode, d, 1))}
            aria-label={t("ag.suivant")}
          >
            <IconChevronRight size={15} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setReference(new Date())}>
            {t("ag.maintenant")}
          </button>
        </div>
      </div>

      {/* Les quatre chiffres de la période. */}
      <div className="stat-grid">
        <div className="stat stat-riche">
          <div className="stat-riche-haut">
            <div style={{ minWidth: 0 }}>
              <div className="stat-label">{t("ag.kpiTotal")}</div>
              <div className="stat-riche-valeur texte">{duree(donnees.totalMinutes)}</div>
            </div>
            <div className="stat-icone" style={{ background: "#e8f3fb", color: "#2a79ae" }}>
              <IconCoins size={21} />
            </div>
          </div>
          <div className="stat-riche-bas">
            <span className="stat-note">{t("ag.kpiTotalNote", { n: nombre(donnees.nbCreneaux) })}</span>
          </div>
        </div>

        <div className="stat stat-riche">
          <div className="stat-riche-haut">
            <div style={{ minWidth: 0 }}>
              <div className="stat-label">{t("ag.kpiCible")}</div>
              <div className="stat-riche-valeur texte">{duree(donnees.cibleMinutes)}</div>
            </div>
            <div className="stat-icone" style={{ background: "#eeebfa", color: "#5b4bc4" }}>
              <IconTag size={21} />
            </div>
          </div>
          <div className="stat-riche-bas">
            <span className="stat-note">
              {t("ag.kpiCibleNote", { n: nombre(donnees.joursOuvres), h: duree(donnees.cibleParJourMinutes) })}
            </span>
          </div>
        </div>

        <div className="stat stat-riche">
          <div className="stat-riche-haut">
            <div style={{ minWidth: 0 }}>
              <div className="stat-label">{t("ag.kpiTenus")}</div>
              <div className="stat-riche-valeur texte">
                {nombre(donnees.joursTenus)}
                <span className="stat-sur">/{nombre(donnees.joursOuvres)}</span>
              </div>
            </div>
            <div className="stat-icone" style={{ background: "#e2f4f1", color: "#0c8074" }}>
              <IconCheck size={21} />
            </div>
          </div>
          <div className="stat-riche-bas">
            <span className="stat-note">{t("ag.kpiTenusNote")}</span>
          </div>
        </div>

        <div className="stat stat-riche">
          <div className="stat-riche-haut">
            <div style={{ minWidth: 0 }}>
              <div className="stat-label">{t("ag.kpiClients")}</div>
              <div className="stat-riche-valeur texte">{nombre(donnees.nbClients)}</div>
            </div>
            <div className="stat-icone" style={{ background: "#fcf2e0", color: "#9e6b06" }}>
              <IconUsers size={21} />
            </div>
          </div>
          <div className="stat-riche-bas">
            {/* Un jour pointé sous la cible n'est pas un jour vide : confondre
                les deux accuserait quiconque prend des congés. */}
            <span className="stat-note">
              {t("ag.kpiSousCible", { n: nombre(donnees.joursSousCible) })}
            </span>
          </div>
        </div>
      </div>

      {/* Bande des jours, jusqu'au mois. */}
      {jours.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("ag.bandeTitre")}</div>
              <div className="card-sub">{t("ag.bandeSousTitre", { h: duree(donnees.cibleParJourMinutes) })}</div>
            </div>
          </div>
          <div className={`bande-jours${jours.length > 7 ? " bande-mois" : ""}`}>
            {jours.map((j) => {
              const cle = cleJour(j);
              const minutes = donnees.parJour[cle] ?? 0;
              const weekend = j.getDay() === 0 || j.getDay() === 6;
              const part = Math.min(100, Math.round((minutes / donnees.cibleParJourMinutes) * 100));
              const tenu = minutes >= donnees.cibleParJourMinutes;
              return (
                <button
                  key={cle}
                  type="button"
                  className={`jour-case${cle === jourActif && donnees.detaille ? " on" : ""}${cle === aujourdhui ? " aujourdhui" : ""}${weekend ? " weekend" : ""}`}
                  onClick={() => {
                    setJourActif(cle);
                    /* Depuis une vue mensuelle, cliquer un jour y descend :
                       sélectionner une case qui ne change rien à l'écran
                       laisse croire à un bouton cassé. */
                    if (!donnees.detaille) {
                      setReference(j);
                      setPeriode("JOUR");
                    }
                  }}
                  aria-pressed={cle === jourActif && donnees.detaille}
                  title={`${j.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })} · ${duree(minutes)}`}
                >
                  <span className="jour-nom">{j.toLocaleDateString(locale, { weekday: "narrow" })}</span>
                  <span className="jour-num">{j.getDate()}</span>
                  <span className={`jour-charge${minutes === 0 ? " vide" : ""}`}>
                    {minutes === 0 ? "-" : duree(minutes)}
                  </span>
                  {/* Jauge plutôt qu'une pastille : elle dit de combien on est
                      loin, là où « Sous l'objectif » ne dit que le verdict. */}
                  <span className="jour-rail">
                    <span
                      className={`jour-barre${tenu ? " tenu" : ""}`}
                      style={{ width: `${part}%` }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Saisie, seulement sur les fenêtres courtes. */}
      {donnees.detaille ? (
        <form className="card" onSubmit={soumettre}>
          <div className="card-head">
            <div>
              <div className="card-title">
                {new Date(`${jourActif}T00:00:00`).toLocaleDateString(locale, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </div>
              <div className="card-sub">{edition ? t("ag.editionCreneau") : t("ag.saisieSousTitre")}</div>
            </div>
            {saisiesDuJour.length > 0 && (
              <span className="tag">{duree(donnees.parJour[jourActif] ?? 0)}</span>
            )}
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
                {edition && (
                  <button type="button" className="btn btn-ghost" onClick={annulerEdition}>
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
              {saisiesDuJour.map((s) => (
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
                  <button
                    type="button"
                    className="link-action"
                    onClick={() => commencerEdition(s)}
                    aria-label={t("ag.modifierCreneau")}
                  >
                    {t("ag.modifier")}
                  </button>
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

          {!futur && saisiesDuJour.length === 0 && (
            <p className="muted-3" style={{ margin: "16px 0 0", fontSize: 13 }}>
              {t("ag.jourVide")}
            </p>
          )}
        </form>
      ) : (
        <div className="alert alert-info">
          <IconAlert />
          {t("ag.saisieHorsPortee")}
        </div>
      )}

      {/* Récapitulatif mensuel, sur les longues périodes. */}
      {!donnees.detaille && donnees.parMois.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("ag.parMoisTitre")}</div>
              <div className="card-sub">{t("ag.parMoisSousTitre")}</div>
            </div>
          </div>
          <ul className="repartition">
            {donnees.parMois.map((m) => {
              const max = Math.max(...donnees.parMois.map((x) => x.minutes), 1);
              return (
                <li key={m.mois} className="repartition-ligne">
                  <span className="repartition-nom">
                    {new Date(`${m.mois}-01T00:00:00`).toLocaleDateString(locale, {
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  <span className="repartition-rail">
                    <span className="repartition-barre" style={{ width: `${(m.minutes / max) * 100}%` }} />
                  </span>
                  <span className="repartition-valeur">{duree(m.minutes)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Où est passé le temps. */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("ag.repartitionTitre")}</div>
            <div className="card-sub">{t("ag.repartitionSousTitre")}</div>
          </div>
        </div>

        {donnees.parActivite.length === 0 ? (
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
