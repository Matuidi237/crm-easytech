import { FormEvent, useEffect, useState } from "react";
import {
  Objectif,
  PERIODES,
  PeriodeObjectif,
  SuiviObjectifs,
  definirSourceObjectifs,
  enregistrerObjectif,
  fetchObjectifs,
  supprimerObjectif,
} from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { useFilAriane } from "../ContexteEntete";
import { IconAlert, IconCheck, IconChevronLeft, IconChevronRight, IconShield, IconUserCircle } from "../components/Icons";

function cleJour(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

const VIDE = { cibleCaXAF: "", cibleVentes: "", cibleRendezVous: "", note: "" };

/**
 * Objectifs commerciaux, de la journée à l'année.
 *
 * Deux plannings coexistent : celui que fixe le responsable et celui que le
 * commercial se donne. Un seul pilote le suivi, mais les deux restent
 * affichés. Masquer celui du responsable quand on travaille en libre
 * supprimerait justement la comparaison qui rend la conversation possible.
 *
 * Chaque avancement est confronté au temps écoulé : 40 % du chiffre au tiers
 * du trimestre est une avance, le même chiffre la veille de la clôture est un
 * échec. Une barre sans ce repère ne dit rien d'utile.
 */
export default function ObjectifsPage() {
  const { t, nombre, montant, montantCompact, locale } = useLangue();
  const [periode, setPeriode] = useState<PeriodeObjectif>("MOIS");
  const [reference, setReference] = useState(() => new Date());
  const [suivi, setSuivi] = useState<SuiviObjectifs | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [edition, setEdition] = useState(false);
  const [form, setForm] = useState(VIDE);
  const [envoi, setEnvoi] = useState(false);

  useFilAriane("/agenda", t("ag.retour"), t("ag.objectifsTitre"));

  function recharger() {
    fetchObjectifs(periode, cleJour(reference))
      .then(setSuivi)
      .catch((e) => setErreur(e.message));
  }

  useEffect(() => {
    setSuivi(null);
    setEdition(false);
    recharger();
  }, [periode, reference]);

  async function basculer(personnel: boolean) {
    setErreur(null);
    try {
      await definirSourceObjectifs(personnel);
      recharger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  function ouvrirEdition() {
    const o = suivi?.objectifPersonnel;
    setForm({
      cibleCaXAF: o?.cibleCaXAF !== null && o?.cibleCaXAF !== undefined ? String(o.cibleCaXAF) : "",
      cibleVentes: o?.cibleVentes != null ? String(o.cibleVentes) : "",
      cibleRendezVous: o?.cibleRendezVous != null ? String(o.cibleRendezVous) : "",
      note: o?.note ?? "",
    });
    setEdition(true);
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    setEnvoi(true);
    const chiffre = (v: string) => (v.trim() === "" ? null : Number(v));
    try {
      await enregistrerObjectif({
        periode,
        date: cleJour(reference),
        cibleCaXAF: chiffre(form.cibleCaXAF),
        cibleVentes: chiffre(form.cibleVentes),
        cibleRendezVous: chiffre(form.cibleRendezVous),
        note: form.note,
      });
      setSucces(t("ag.objectifEnregistre"));
      setEdition(false);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  async function retirer(o: Objectif) {
    if (!confirm(t("ag.confirmerSuppressionObjectif"))) return;
    setErreur(null);
    try {
      await supprimerObjectif(o.id);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  /** Libellé de la fenêtre courante, adapté à sa granularité. */
  function libelleFenetre(s: SuiviObjectifs) {
    const d = new Date(s.debut);
    if (s.periode === "JOUR") {
      return d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }
    if (s.periode === "SEMAINE") {
      const fin = new Date(s.fin);
      fin.setDate(fin.getDate() - 1);
      return `${d.toLocaleDateString(locale, { day: "numeric", month: "short" })} - ${fin.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`;
    }
    if (s.periode === "MOIS") return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
    if (s.periode === "TRIMESTRE") return t("ag.trimestreN", { n: Math.floor(d.getMonth() / 3) + 1, annee: d.getFullYear() });
    if (s.periode === "SEMESTRE") return t("ag.semestreN", { n: d.getMonth() < 6 ? 1 : 2, annee: d.getFullYear() });
    return String(d.getFullYear());
  }

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("ag.objectifsTitre")}</h1>
        <div className="page-sub">{t("ag.objectifsSousTitre")}</div>
      </div>
    </div>
  );

  if (!suivi) {
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

  const pilote = suivi.source === "PERSONNEL" ? suivi.objectifPersonnel : suivi.objectifEncadrement;

  /** Une cible, son réalisé, et la comparaison au temps écoulé. */
  function Avancement({
    libelle,
    cible,
    realise,
    formater,
  }: {
    libelle: string;
    cible: number;
    realise: number;
    formater: (n: number) => string;
  }) {
    const part = cible > 0 ? Math.round((realise / cible) * 100) : 0;
    /* « En avance » se juge sur le temps, pas sur le chiffre seul. La marge de
       5 points évite de qualifier d'échec un écart insignifiant. */
    const etat = part >= 100 ? "atteint" : part + 5 >= suivi!.partEcoulee ? "en-ligne" : "en-retard";
    return (
      <div className="avancement">
        <div className="avancement-tete">
          <span className="avancement-libelle">{libelle}</span>
          <span className={`pill pill-${etat === "atteint" ? "success" : etat === "en-ligne" ? "brand" : "warn"}`}>
            {t(`ag.etat.${etat}` as CleTraduction)}
          </span>
        </div>
        <div className="avancement-chiffres">
          <strong>{formater(realise)}</strong>
          <span className="avancement-cible">{t("ag.surCible", { cible: formater(cible) })}</span>
        </div>
        <div className="avancement-rail">
          <span className="avancement-barre" style={{ width: `${Math.min(100, part)}%` }} />
          {/* Repère du temps écoulé : c'est lui qui transforme une barre en
              jugement. Sans lui, 40 % ne dit ni bien ni mal. */}
          <span className="avancement-repere" style={{ left: `${suivi!.partEcoulee}%` }} title={t("ag.repereTemps", { pct: suivi!.partEcoulee })} />
        </div>
        <div className="avancement-pied">
          <span>{nombre(part)}%</span>
          <span className="muted-3">{t("ag.tempsEcoule", { pct: suivi!.partEcoulee })}</span>
        </div>
      </div>
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

      {/* Granularité, puis navigation dans le temps. */}
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
            <div className="semaine-libelle">{libelleFenetre(suivi)}</div>
            <div className="semaine-total">{t("ag.tempsEcoule", { pct: suivi.partEcoulee })}</div>
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
            className={`planning-option${suivi.source === "ENCADREMENT" ? " on" : ""}`}
            onClick={() => basculer(false)}
            aria-pressed={suivi.source === "ENCADREMENT"}
          >
            <IconShield size={18} />
            <span>
              <span className="planning-titre">{t("ag.planningEncadrement")}</span>
              <span className="planning-texte">
                {suivi.responsableNom
                  ? t("ag.planningEncadrementNote", { nom: suivi.responsableNom })
                  : t("ag.planningSansResponsable")}
              </span>
            </span>
          </button>
          <button
            type="button"
            className={`planning-option${suivi.source === "PERSONNEL" ? " on" : ""}`}
            onClick={() => basculer(true)}
            aria-pressed={suivi.source === "PERSONNEL"}
          >
            <IconUserCircle size={18} />
            <span>
              <span className="planning-titre">{t("ag.planningPersonnel")}</span>
              <span className="planning-texte">{t("ag.planningPersonnelNote")}</span>
            </span>
          </button>
        </div>
      </div>

      {/* Avancement sur le planning retenu. */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("ag.avancementTitre")}</div>
            <div className="card-sub">
              {pilote
                ? t("ag.avancementSousTitre", { auteur: pilote.definiParNom })
                : t("ag.avancementSansObjectif")}
            </div>
          </div>
          {suivi.source === "PERSONNEL" && (
            <button className="btn btn-ghost btn-sm" onClick={ouvrirEdition}>
              {suivi.objectifPersonnel ? t("ag.modifierObjectif") : t("ag.definirObjectif")}
            </button>
          )}
        </div>

        {!pilote ? (
          <div className="alert alert-info" style={{ marginTop: 14 }}>
            <IconAlert />
            {suivi.source === "PERSONNEL" ? t("ag.aucunObjectifPersonnel") : t("ag.aucunObjectifEncadrement")}
          </div>
        ) : (
          <div className="avancements">
            {pilote.cibleCaXAF !== null && (
              <Avancement
                libelle={t("ag.cibleCa")}
                cible={pilote.cibleCaXAF}
                realise={suivi.realise.chiffreAffaires}
                formater={montantCompact}
              />
            )}
            {pilote.cibleVentes !== null && (
              <Avancement
                libelle={t("ag.cibleVentes")}
                cible={pilote.cibleVentes}
                realise={suivi.realise.nbVentes}
                formater={(n) => nombre(n)}
              />
            )}
            {pilote.cibleRendezVous !== null && (
              <Avancement
                libelle={t("ag.cibleRendezVous")}
                cible={pilote.cibleRendezVous}
                realise={suivi.realise.nbRendezVous}
                formater={(n) => nombre(n)}
              />
            )}
          </div>
        )}

        {pilote?.note && <p className="objectif-note">{pilote.note}</p>}

        {pilote && !pilote.fixeParEncadrement && (
          <div className="form-actions">
            <button className="link-action danger" onClick={() => retirer(pilote)}>
              {t("ag.supprimerObjectif")}
            </button>
          </div>
        )}
      </div>

      {/* Saisie d'un objectif personnel. */}
      {edition && (
        <form className="card" onSubmit={enregistrer}>
          <div className="card-head">
            <div>
              <div className="card-title">{t("ag.editionTitre", { fenetre: libelleFenetre(suivi) })}</div>
              <div className="card-sub">{t("ag.editionSousTitre")}</div>
            </div>
          </div>

          <div className="form-grid form-grid-trois" style={{ marginTop: 14 }}>
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
              {/* Les rendez-vous se comptent dans la feuille de temps : une
                  seconde saisie du même fait produirait deux chiffres. */}
              <div className="field-hint">{t("ag.cibleRendezVousAide")}</div>
            </div>
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

      {/* Le planning qui ne pilote pas reste visible : c'est la comparaison
          qui permet d'en discuter. */}
      {suivi.source === "PERSONNEL" && suivi.objectifEncadrement && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("ag.rappelEncadrement")}</div>
              <div className="card-sub">
                {t("ag.rappelEncadrementNote", { nom: suivi.objectifEncadrement.definiParNom })}
              </div>
            </div>
          </div>
          <dl className="rappel-cibles">
            {suivi.objectifEncadrement.cibleCaXAF !== null && (
              <div>
                <dt>{t("ag.cibleCa")}</dt>
                <dd>{montant(suivi.objectifEncadrement.cibleCaXAF)}</dd>
              </div>
            )}
            {suivi.objectifEncadrement.cibleVentes !== null && (
              <div>
                <dt>{t("ag.cibleVentes")}</dt>
                <dd>{nombre(suivi.objectifEncadrement.cibleVentes)}</dd>
              </div>
            )}
            {suivi.objectifEncadrement.cibleRendezVous !== null && (
              <div>
                <dt>{t("ag.cibleRendezVous")}</dt>
                <dd>{nombre(suivi.objectifEncadrement.cibleRendezVous)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </>
  );
}
