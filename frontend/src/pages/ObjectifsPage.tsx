import { FormEvent, useEffect, useState } from "react";
import {
  Jalon,
  ObjectifSuivi,
  PERIODES,
  PeriodeObjectif,
  UNITES_JALON,
  UniteJalon,
  FeuilleDeRoute,
  ajouterJalon,
  definirSourceObjectifs,
  enregistrerObjectif,
  fetchFeuilleDeRoute,
  majAvancementJalon,
  supprimerJalon,
  supprimerObjectif,
} from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { useFilAriane } from "../ContexteEntete";
import { IconAlert, IconCheck, IconInbox, IconPlus, IconShield, IconTrash, IconUserCircle } from "../components/Icons";

function cleJour(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const FORM_VIDE = {
  titre: "",
  description: "",
  periode: "MOIS" as PeriodeObjectif,
  date: cleJour(new Date()),
  cibleCaXAF: "",
  cibleVentes: "",
  cibleRendezVous: "",
  note: "",
};

const JALON_VIDE = { libelle: "", unite: "NOMBRE" as UniteJalon, cible: "", echeance: "" };

const TEINTE_STATUT: Record<string, string> = {
  A_VENIR: "pill-neutral",
  EN_COURS: "pill-brand",
  ATTEINT: "pill-success",
  MANQUE: "pill-danger",
};

/**
 * Objectifs commerciaux, en feuille de route.
 *
 * Un objectif annuel, ses trimestres et ses mois se lisent ensemble ou pas du
 * tout : les consulter un par un en changeant de granularité oblige à tenir
 * la hiérarchie de tête. La page les empile donc dans l'ordre du calendrier,
 * chacun avec sa fenêtre, son cible-bloc et ses jalons.
 *
 * Deux plannings coexistent, celui du responsable et le sien. Un seul pilote
 * le suivi, mais les deux restent en base : basculer ne détruit rien, et on
 * peut revenir.
 */
export default function ObjectifsPage() {
  const { t, nombre, montant, montantCompact, date, locale } = useLangue();
  const [route, setRoute] = useState<FeuilleDeRoute | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [edition, setEdition] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [jalonPour, setJalonPour] = useState<string | null>(null);
  const [jalonForm, setJalonForm] = useState(JALON_VIDE);

  useFilAriane("/planning", t("ag.retour"), t("ag.objectifsTitre"));

  function recharger() {
    fetchFeuilleDeRoute()
      .then(setRoute)
      .catch((e) => setErreur(e.message));
  }

  useEffect(recharger, []);

  async function basculer(personnel: boolean) {
    setErreur(null);
    try {
      await definirSourceObjectifs(personnel);
      recharger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    setEnvoi(true);
    const chiffre = (v: string) => (v.trim() === "" ? null : Number(v));
    try {
      await enregistrerObjectif({
        titre: form.titre,
        description: form.description,
        periode: form.periode,
        date: form.date,
        cibleCaXAF: chiffre(form.cibleCaXAF),
        cibleVentes: chiffre(form.cibleVentes),
        cibleRendezVous: chiffre(form.cibleRendezVous),
        note: form.note,
      });
      setSucces(t("ag.objectifEnregistre"));
      setEdition(false);
      setForm(FORM_VIDE);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  function ouvrirEdition(o?: ObjectifSuivi) {
    setForm(
      o
        ? {
            titre: o.titre ?? "",
            description: o.description ?? "",
            periode: o.periode,
            date: o.debut.slice(0, 10),
            cibleCaXAF: o.cibleCaXAF !== null ? String(o.cibleCaXAF) : "",
            cibleVentes: o.cibleVentes !== null ? String(o.cibleVentes) : "",
            cibleRendezVous: o.cibleRendezVous !== null ? String(o.cibleRendezVous) : "",
            note: o.note ?? "",
          }
        : FORM_VIDE
    );
    setEdition(true);
  }

  async function retirerObjectif(o: ObjectifSuivi) {
    if (!confirm(t("ag.confirmerSuppressionObjectif"))) return;
    setErreur(null);
    try {
      await supprimerObjectif(o.id);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function poserJalon(e: FormEvent, objectifId: string) {
    e.preventDefault();
    setErreur(null);
    try {
      await ajouterJalon(objectifId, {
        libelle: jalonForm.libelle,
        unite: jalonForm.unite,
        cible: jalonForm.unite === "BINAIRE" ? 1 : Number(jalonForm.cible),
        echeance: jalonForm.echeance,
      });
      setJalonForm(JALON_VIDE);
      setJalonPour(null);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function avancerJalon(j: Jalon, valeur: number) {
    setErreur(null);
    try {
      await majAvancementJalon(j.id, valeur);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function retirerJalon(id: string) {
    setErreur(null);
    try {
      await supprimerJalon(id);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  function libelleFenetre(o: ObjectifSuivi) {
    const d = new Date(o.debut);
    if (o.periode === "JOUR")
      return d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (o.periode === "SEMAINE") {
      const fin = new Date(o.fin);
      fin.setDate(fin.getDate() - 1);
      return `${d.toLocaleDateString(locale, { day: "numeric", month: "short" })} - ${fin.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`;
    }
    if (o.periode === "MOIS") return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
    if (o.periode === "TRIMESTRE") return t("ag.trimestreN", { n: Math.floor(d.getMonth() / 3) + 1, annee: d.getFullYear() });
    if (o.periode === "SEMESTRE") return t("ag.semestreN", { n: d.getMonth() < 6 ? 1 : 2, annee: d.getFullYear() });
    return String(d.getFullYear());
  }

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("ag.objectifsTitre")}</h1>
        <div className="page-sub">{t("ag.objectifsSousTitre")}</div>
      </div>
      {route?.source === "PERSONNEL" && (
        <div className="head-actions">
          <button className="btn btn-primary" onClick={() => ouvrirEdition()}>
            <IconPlus size={16} />
            {t("ag.definirObjectif")}
          </button>
        </div>
      )}
    </div>
  );

  if (!route) {
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

  const encadrement = route.source === "ENCADREMENT";
  const pilotes = route.objectifs.filter((o) => o.fixeParEncadrement === encadrement);
  const autres = route.objectifs.filter((o) => o.fixeParEncadrement !== encadrement);

  /** Une cible chiffrée, son réalisé, et la comparaison au temps écoulé. */
  function Avancement({
    libelle,
    cible,
    realise,
    partEcoulee,
    formater,
  }: {
    libelle: string;
    cible: number;
    realise: number;
    partEcoulee: number;
    formater: (n: number) => string;
  }) {
    const part = cible > 0 ? Math.round((realise / cible) * 100) : 0;
    /* « Dans les temps » se juge sur le temps, pas sur le chiffre seul. La
       marge de 5 points évite de qualifier d'échec un écart insignifiant. */
    const etat = part >= 100 ? "atteint" : part + 5 >= partEcoulee ? "en-ligne" : "en-retard";
    return (
      <div className="cible-bloc">
        <div className="cible-tete">
          <span className="cible-libelle">{libelle}</span>
          <span className={`pill pill-${etat === "atteint" ? "success" : etat === "en-ligne" ? "brand" : "warn"}`}>
            {t(`ag.etat.${etat}` as CleTraduction)}
          </span>
        </div>
        <div className="cible-chiffres">
          <strong>{formater(realise)}</strong>
          <span className="cible-reference">{t("ag.surCible", { cible: formater(cible) })}</span>
        </div>
        <div className="cible-rail">
          <span className="cible-barre" style={{ width: `${Math.min(100, part)}%` }} />
          <span
            className="cible-repere"
            style={{ left: `${partEcoulee}%` }}
            title={t("ag.repereTemps", { pct: partEcoulee })}
          />
        </div>
        <div className="cible-pied">
          <span>{nombre(part)}%</span>
          <span className="muted-3">{t("ag.tempsEcoule", { pct: partEcoulee })}</span>
        </div>
      </div>
    );
  }

  /** Un objectif, sa fenêtre, ses cibles et ses jalons. */
  function CarteObjectif({ o, modifiable }: { o: ObjectifSuivi; modifiable: boolean }) {
    const enRetard = (j: Jalon) => j.realise < j.cible && new Date(j.echeance) < new Date();

    return (
      <article className="objectif-carte">
        <header className="objectif-carte-tete">
          <div style={{ minWidth: 0 }}>
            <div className="objectif-periode">
              {t(`periode.${o.periode}` as CleTraduction)} · {libelleFenetre(o)}
            </div>
            <h3 className="objectif-titre">{o.titre || libelleFenetre(o)}</h3>
            <div className="objectif-auteur">
              {o.fixeParEncadrement
                ? t("ag.fixeParNom", { nom: o.definiParNom })
                : t("ag.fixeParVous")}
            </div>
          </div>
          <span className={`pill ${TEINTE_STATUT[o.statut] ?? "pill-neutral"}`}>
            {t(`ag.statut.${o.statut}` as CleTraduction)}
          </span>
        </header>

        {o.description && <p className="objectif-description">{o.description}</p>}

        <div className="cibles-bloc">
          {o.cibleCaXAF !== null && (
            <Avancement
              libelle={t("ag.cibleCa")}
              cible={o.cibleCaXAF}
              realise={o.realise.chiffreAffaires}
              partEcoulee={o.partEcoulee}
              formater={montantCompact}
            />
          )}
          {o.cibleVentes !== null && (
            <Avancement
              libelle={t("ag.cibleVentes")}
              cible={o.cibleVentes}
              realise={o.realise.nbVentes}
              partEcoulee={o.partEcoulee}
              formater={(n) => nombre(n)}
            />
          )}
          {o.cibleRendezVous !== null && (
            <Avancement
              libelle={t("ag.cibleRendezVous")}
              cible={o.cibleRendezVous}
              realise={o.realise.nbRendezVous}
              partEcoulee={o.partEcoulee}
              formater={(n) => nombre(n)}
            />
          )}
        </div>

        {/* Jalons : ce qui rend l'engagement vérifiable en cours de route. */}
        <div className="jalons">
          <div className="jalons-tete">
            <span className="jalons-titre">
              {t("ag.jalonsTitre", { n: nombre(o.jalons.length) })}
            </span>
            {modifiable && (
              <button
                type="button"
                className="link-action"
                onClick={() => {
                  setJalonPour(jalonPour === o.id ? null : o.id);
                  setJalonForm({ ...JALON_VIDE, echeance: o.fin.slice(0, 10) });
                }}
              >
                {jalonPour === o.id ? t("commun.annuler") : t("ag.ajouterJalon")}
              </button>
            )}
          </div>

          {o.jalons.length === 0 ? (
            <p className="jalons-vide">{modifiable ? t("ag.jalonsVide") : t("ag.jalonsVideEncadrement")}</p>
          ) : (
            <ul className="jalons-liste">
              {o.jalons.map((j) => {
                const part = j.cible > 0 ? Math.round((j.realise / j.cible) * 100) : 0;
                const fait = j.realise >= j.cible;
                return (
                  <li key={j.id} className={`jalon${fait ? " fait" : enRetard(j) ? " retard" : ""}`}>
                    <span className="jalon-puce" aria-hidden>
                      {fait ? <IconCheck size={12} /> : null}
                    </span>
                    <div className="jalon-corps">
                      <div className="jalon-ligne">
                        <span className="jalon-libelle">{j.libelle}</span>
                        <span className="jalon-echeance">{date(j.echeance)}</span>
                      </div>
                      <div className="jalon-mesure">
                        <span className="jalon-rail">
                          <span className="jalon-barre" style={{ width: `${Math.min(100, part)}%` }} />
                        </span>
                        <span className="jalon-valeur">
                          {j.unite === "BINAIRE"
                            ? fait
                              ? t("ag.jalonFait")
                              : t("ag.jalonAFaire")
                            : j.unite === "MONTANT"
                              ? `${montantCompact(j.realise)} / ${montantCompact(j.cible)}`
                              : `${nombre(j.realise)} / ${nombre(j.cible)}`}
                        </span>
                      </div>
                    </div>

                    {modifiable && (
                      <div className="jalon-actions">
                        {j.unite === "BINAIRE" ? (
                          <button
                            type="button"
                            className="link-action"
                            onClick={() => avancerJalon(j, fait ? 0 : 1)}
                          >
                            {fait ? t("ag.jalonRouvrir") : t("ag.jalonCocher")}
                          </button>
                        ) : (
                          <input
                            type="number"
                            className="jalon-saisie"
                            min={0}
                            max={j.cible}
                            defaultValue={j.realise}
                            aria-label={t("ag.jalonAvancement")}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (Number.isFinite(v) && v !== j.realise) avancerJalon(j, v);
                            }}
                          />
                        )}
                        <button
                          type="button"
                          className="icon-btn danger"
                          onClick={() => retirerJalon(j.id)}
                          aria-label={t("ag.supprimerJalon")}
                          title={t("ag.supprimerJalon")}
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {jalonPour === o.id && (
            <form className="jalon-form" onSubmit={(e) => poserJalon(e, o.id)}>
              <div className="form-grid form-grid-jalon">
                <div className="field">
                  <label htmlFor={`jl-${o.id}`}>{t("ag.jalonLibelle")}</label>
                  <input
                    id={`jl-${o.id}`}
                    value={jalonForm.libelle}
                    onChange={(e) => setJalonForm((f) => ({ ...f, libelle: e.target.value }))}
                    placeholder={t("ag.jalonLibellePlaceholder")}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor={`ju-${o.id}`}>{t("ag.jalonUnite")}</label>
                  <select
                    id={`ju-${o.id}`}
                    value={jalonForm.unite}
                    onChange={(e) => setJalonForm((f) => ({ ...f, unite: e.target.value as UniteJalon }))}
                  >
                    {UNITES_JALON.map((u) => (
                      <option key={u} value={u}>
                        {t(`uniteJalon.${u}` as CleTraduction)}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Un jalon binaire vaut 1 par construction : demander sa cible
                    ouvrirait la porte à « 0 sur 3 », qui ne veut rien dire
                    pour un fait accompli ou non. */}
                {jalonForm.unite !== "BINAIRE" && (
                  <div className="field">
                    <label htmlFor={`jc-${o.id}`}>{t("ag.jalonCible")}</label>
                    <input
                      id={`jc-${o.id}`}
                      type="number"
                      min={1}
                      value={jalonForm.cible}
                      onChange={(e) => setJalonForm((f) => ({ ...f, cible: e.target.value }))}
                      required
                    />
                  </div>
                )}
                <div className="field">
                  <label htmlFor={`je-${o.id}`}>{t("ag.jalonEcheance")}</label>
                  <input
                    id={`je-${o.id}`}
                    type="date"
                    min={o.debut.slice(0, 10)}
                    max={o.fin.slice(0, 10)}
                    value={jalonForm.echeance}
                    onChange={(e) => setJalonForm((f) => ({ ...f, echeance: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="form-actions">
                <button className="btn btn-primary btn-sm" type="submit">
                  {t("ag.ajouterJalon")}
                </button>
              </div>
            </form>
          )}
        </div>

        {o.note && <p className="objectif-note">{o.note}</p>}

        {modifiable && (
          <div className="objectif-pied">
            <button className="link-action" onClick={() => ouvrirEdition(o)}>
              {t("ag.modifierObjectif")}
            </button>
            <button className="link-action danger" onClick={() => retirerObjectif(o)}>
              {t("ag.supprimerObjectif")}
            </button>
          </div>
        )}
      </article>
    );
  }

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

      {/* Quel planning pilote le suivi. */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("ag.sourceTitre")}</div>
            <div className="card-sub">{t("ag.sourceSousTitre")}</div>
          </div>
        </div>

        <div className="choix-planning">
          <button
            type="button"
            className={`planning-option${encadrement ? " on" : ""}`}
            onClick={() => basculer(false)}
            aria-pressed={encadrement}
          >
            <IconShield size={18} />
            <span>
              <span className="planning-titre">{t("ag.planningEncadrement")}</span>
              <span className="planning-texte">
                {route.responsableNom
                  ? t("ag.planningEncadrementNote", { nom: route.responsableNom })
                  : t("ag.planningSansResponsable")}
              </span>
            </span>
          </button>
          <button
            type="button"
            className={`planning-option${!encadrement ? " on" : ""}`}
            onClick={() => basculer(true)}
            aria-pressed={!encadrement}
          >
            <IconUserCircle size={18} />
            <span>
              <span className="planning-titre">{t("ag.planningPersonnel")}</span>
              <span className="planning-texte">{t("ag.planningPersonnelNote")}</span>
            </span>
          </button>
        </div>
      </div>

      {/* Création ou modification. */}
      {edition && (
        <form className="card" onSubmit={enregistrer}>
          <div className="card-head">
            <div>
              <div className="card-title">{t("ag.editionTitreLibre")}</div>
              <div className="card-sub">{t("ag.editionSousTitre")}</div>
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: 14 }}>
            <div className="field">
              <label htmlFor="ob-titre">{t("ag.objectifIntitule")}</label>
              <input
                id="ob-titre"
                value={form.titre}
                onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))}
                placeholder={t("ag.objectifIntitulePlaceholder")}
              />
              {/* Un objectif qui ne s'appelle que « mois d'octobre » ne se cite
                  pas en réunion et ne se retient pas. */}
              <div className="field-hint">{t("ag.objectifIntituleAide")}</div>
            </div>
            <div className="field">
              <label htmlFor="ob-periode">{t("ag.objectifPeriode")}</label>
              <select
                id="ob-periode"
                value={form.periode}
                onChange={(e) => setForm((f) => ({ ...f, periode: e.target.value as PeriodeObjectif }))}
              >
                {PERIODES.map((p) => (
                  <option key={p} value={p}>
                    {t(`periode.${p}` as CleTraduction)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="ob-desc">{t("ag.objectifDescription")}</label>
            <textarea
              id="ob-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t("ag.objectifDescriptionPlaceholder")}
            />
            <div className="field-hint">{t("ag.objectifDescriptionAide")}</div>
          </div>

          <div className="form-grid form-grid-trois">
            <div className="field">
              <label htmlFor="ob-date">{t("ag.objectifDate")}</label>
              <input
                id="ob-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
              <div className="field-hint">{t("ag.objectifDateAide")}</div>
            </div>
            <div className="field">
              <label htmlFor="ob-ca">{t("ag.cibleCa")}</label>
              <div className="champ-montant">
                <input
                  id="ob-ca"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={form.cibleCaXAF}
                  onChange={(e) => setForm((f) => ({ ...f, cibleCaXAF: e.target.value }))}
                />
                <span className="champ-suffixe">XAF</span>
              </div>
            </div>
            <div className="field">
              <label htmlFor="ob-ventes">{t("ag.cibleVentes")}</label>
              <input
                id="ob-ventes"
                type="number"
                min={0}
                step={1}
                value={form.cibleVentes}
                onChange={(e) => setForm((f) => ({ ...f, cibleVentes: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="ob-rdv">{t("ag.cibleRendezVous")}</label>
              <input
                id="ob-rdv"
                type="number"
                min={0}
                step={1}
                value={form.cibleRendezVous}
                onChange={(e) => setForm((f) => ({ ...f, cibleRendezVous: e.target.value }))}
              />
              <div className="field-hint">{t("ag.cibleRendezVousAide")}</div>
            </div>
            <div className="field">
              <label htmlFor="ob-note">{t("ag.note")}</label>
              <input
                id="ob-note"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder={t("ag.notePlaceholder")}
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setEdition(false)}>
              {t("commun.annuler")}
            </button>
            <button className="btn btn-primary" type="submit" disabled={envoi}>
              {envoi ? t("commun.enregistrement") : t("commun.enregistrer")}
            </button>
          </div>
        </form>
      )}

      {/* La feuille de route proprement dite. */}
      {pilotes.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">
              {encadrement ? t("ag.aucunObjectifEncadrement") : t("ag.aucunObjectifPersonnel")}
            </div>
            <p className="empty-text" style={{ margin: 0 }}>
              {encadrement ? t("ag.aucunObjectifEncadrementTexte") : t("ag.aucunObjectifPersonnelTexte")}
            </p>
          </div>
        </div>
      ) : (
        <div className="feuille-de-route">
          {pilotes.map((o) => (
            <CarteObjectif key={o.id} o={o} modifiable={!o.fixeParEncadrement} />
          ))}
        </div>
      )}

      {/* Le planning qui ne pilote pas reste consultable : c'est la
          comparaison qui rend la conversation possible. */}
      {autres.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">
                {encadrement ? t("ag.rappelPersonnel") : t("ag.rappelEncadrement")}
              </div>
              <div className="card-sub">{t("ag.rappelNote")}</div>
            </div>
          </div>
          <ul className="rappel-liste">
            {autres.map((o) => (
              <li key={o.id}>
                <span className="rappel-periode">{libelleFenetre(o)}</span>
                <span className="rappel-cible">
                  {o.cibleCaXAF !== null ? montant(o.cibleCaXAF) : t("ag.sansCibleChiffre")}
                </span>
                <span className="rappel-auteur">{o.definiParNom}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
