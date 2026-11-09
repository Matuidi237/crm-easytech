import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  EtapePipeline,
  NATURES_VENTE,
  NatureVente,
  Opportunite,
  PRIORITES,
  PrioriteOpportunite,
  SuggestionClient,
  TableauPipeline,
  creerOpportunite,
  deplacerOpportunite,
  fetchPipeline,
  modifierOpportunite,
  supprimerOpportunite,
} from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import ChampClient from "../components/ChampClient";
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconInbox,
  IconPlus,
  IconTrash,
} from "../components/Icons";

/** Date du jour au format attendu par un champ date, dans le fuseau local. */
function aujourdhui() {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${String(d.getDate()).padStart(2, "0")}`;
}

const VIDE = {
  id: null as string | null,
  titre: "",
  clientId: null as string | null,
  clientNom: "",
  montantEstime: "",
  nature: "MATERIEL" as NatureVente,
  priorite: "MOYENNE" as PrioriteOpportunite,
  description: "",
  clotureEstimeeLe: "",
};

/**
 * Pipeline commercial, en tableau d'étapes.
 *
 * Le reste de l'outil ne connaît que les ventes conclues. Cette page montre ce
 * qui est en train de se jouer, c'est-à-dire la seule matière sur laquelle un
 * commercial peut encore agir.
 *
 * Trois partis pris, visibles à l'écran :
 *
 * La valeur pondérée accompagne toujours le montant brut. Additionner les
 * montants espérés donne un chiffre qui flatte et qui ne se réalise jamais ;
 * le pondérer par la probabilité de l'étape donne un ordre de grandeur de ce
 * qui va effectivement rentrer.
 *
 * L'immobilité est signalée. Le danger d'un pipeline n'est pas la petite
 * affaire, c'est le dossier qui n'a pas bougé depuis trois semaines et que
 * personne ne regarde plus.
 *
 * Les affaires perdues n'ont pas de colonne. Une colonne de perdues se remplit
 * sans fin et chasse de l'écran celles qui appellent une action.
 */
export default function PipelinePage() {
  const { t, nombre, montant, montantCompact, date } = useLangue();
  const [tableau, setTableau] = useState<TableauPipeline | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [form, setForm] = useState(VIDE);
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  /* Carte en cours de glissement, et colonne survolée : la seconde sert à
     dessiner la cible, sans quoi on lâche à l'aveugle. */
  const [saisie, setSaisie] = useState<string | null>(null);
  const [survolee, setSurvolee] = useState<EtapePipeline | null>(null);
  /* Clôture en attente de sa précision : motif pour une affaire perdue,
     référence du document pour une affaire gagnée. */
  const [cloture, setCloture] = useState<{ o: Opportunite; etape: EtapePipeline } | null>(null);
  const [precision, setPrecision] = useState("");

  function recharger() {
    fetchPipeline()
      .then(setTableau)
      .catch((e) => setErreur(e.message));
  }

  useEffect(recharger, []);

  const libelleEtape = (e: EtapePipeline) => t(`pipe.etape.${e}` as CleTraduction);

  function ouvrirCreation(etape?: EtapePipeline) {
    setForm({ ...VIDE });
    setOuvert(true);
    setErreur(null);
    setSucces(null);
    void etape;
  }

  function ouvrirEdition(o: Opportunite) {
    setForm({
      id: o.id,
      titre: o.titre,
      clientId: o.clientId,
      clientNom: o.clientNom,
      montantEstime: String(o.montantEstime),
      nature: o.nature,
      priorite: o.priorite,
      description: o.description ?? "",
      clotureEstimeeLe: o.clotureEstimeeLe ? o.clotureEstimeeLe.slice(0, 10) : "",
    });
    setOuvert(true);
    setErreur(null);
    setSucces(null);
  }

  const complet =
    form.titre.trim() !== "" && form.clientNom.trim() !== "" && form.montantEstime !== "";

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!complet) return;
    setErreur(null);
    setSucces(null);
    setEnvoi(true);
    const charge = {
      titre: form.titre.trim(),
      montantEstime: Number(form.montantEstime),
      nature: form.nature,
      priorite: form.priorite,
      description: form.description.trim(),
      clotureEstimeeLe: form.clotureEstimeeLe || null,
    };
    try {
      if (form.id) {
        await modifierOpportunite(form.id, charge);
        setSucces(t("pipe.affaireModifiee"));
      } else {
        await creerOpportunite({ ...charge, clientId: form.clientId, clientNom: form.clientNom.trim() });
        setSucces(t("pipe.affaireCreee", { titre: charge.titre }));
      }
      setOuvert(false);
      setForm(VIDE);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  /**
   * Déplace une affaire, en demandant ce que l'étape exige.
   *
   * Une affaire perdue sans motif n'apprend rien, et c'est ce qu'on voudra
   * analyser dans six mois. Le serveur le refuse, l'interface le demande ici
   * plutôt que de laisser l'utilisateur buter sur une erreur.
   */
  /**
   * Déplace une affaire, en demandant d'abord ce que l'étape exige.
   *
   * Les deux étapes de clôture réclament une précision, et elle se demande dans
   * une boîte dessinée par l'application. Les boîtes natives du navigateur sont
   * rendues par le système, sans rapport avec le reste de l'écran, et ne
   * laissent pas la place d'expliquer pourquoi on demande.
   */
  function deplacer(o: Opportunite, etape: EtapePipeline) {
    if (o.etape === etape) return;
    setErreur(null);
    setSucces(null);
    if (etape === "PERDUE" || etape === "GAGNEE") {
      setPrecision("");
      setCloture({ o, etape });
      return;
    }
    void appliquerDeplacement(o, etape);
  }

  async function appliquerDeplacement(
    o: Opportunite,
    etape: EtapePipeline,
    extra: { motifPerte?: string; referenceCommande?: string } = {}
  ) {
    try {
      await deplacerOpportunite(o.id, etape, extra);
      /* L'erreur précédente disparaît avec la réussite : un refus toujours
         affiché à côté d'une confirmation laisse croire que les deux valent
         encore. */
      setErreur(null);
      setSucces(t("pipe.affaireDeplacee", { titre: o.titre, etape: libelleEtape(etape) }));
      setCloture(null);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function confirmerCloture(e: FormEvent) {
    e.preventDefault();
    if (!cloture) return;
    const valeur = precision.trim();
    /* Une affaire perdue sans motif n'apprend rien, et c'est ce qu'on voudra
       analyser dans six mois. Le serveur le refuse ; l'interface l'empêche
       plutôt que de laisser l'utilisateur buter sur une erreur. */
    if (cloture.etape === "PERDUE" && valeur === "") {
      setErreur(t("pipe.motifObligatoire"));
      return;
    }
    await appliquerDeplacement(
      cloture.o,
      cloture.etape,
      cloture.etape === "PERDUE" ? { motifPerte: valeur } : { referenceCommande: valeur }
    );
  }

  async function retirer(o: Opportunite) {
    if (!confirm(t("pipe.confirmerSuppression", { titre: o.titre }))) return;
    setErreur(null);
    try {
      await supprimerOpportunite(o.id);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  const toutes = useMemo(
    () => (tableau?.colonnes ?? []).flatMap((c) => c.opportunites),
    [tableau]
  );

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("nav.pipeline")}</h1>
      </div>
      <div className="head-actions">
        <button className="btn btn-primary" onClick={() => ouvrirCreation()} disabled={ouvert}>
          <IconPlus size={16} />
          {t("pipe.nouvelleAffaire")}
        </button>
      </div>
    </div>
  );

  if (!tableau) {
    return (
      <>
        {entete}
        {erreur ? (
          <div className="alert alert-error">
            <IconAlert />
            {erreur}
          </div>
        ) : (
          <div className="panneau panneau-vide">{t("commun.chargementDonnees")}</div>
        )}
      </>
    );
  }

  const { totaux } = tableau;

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

      {/* La valeur pondérée porte la page, pas le montant brut. Le brut est la
          somme de ce qu'on espère, le pondéré l'ordre de grandeur de ce qui
          rentrera. Afficher le premier seul promettrait ce qui n'arrivera pas. */}
      <section className="panneau heros">
        <div className="heros-haut">
          <div className="heros-principal">
            <span className="heros-contexte">
              {t("pipe.nAffairesOuvertes", { n: nombre(totaux.nbOuvertes) })}
            </span>
            <span className="heros-chiffre" title={montant(totaux.valeurPonderee)}>
              {montantCompact(totaux.valeurPonderee)}
            </span>
            <span className="heros-appui">
              {t("pipe.surMontantBrut", { montant: montant(totaux.montantOuvert) })}
            </span>
          </div>
          {totaux.nbStagnantes > 0 && (
            <span className="etat etat-alerte">
              {totaux.nbStagnantes === 1
                ? t("pipe.uneStagnante")
                : t("pipe.nStagnantes", { n: nombre(totaux.nbStagnantes) })}
            </span>
          )}
        </div>
      </section>

      {/* Le formulaire au-dessus du tableau : la carte créée apparaît juste en
          dessous, dans la première colonne, là où on regarde déjà. */}
      {ouvert && (
        <form className="panneau" onSubmit={enregistrer}>
          <header className="panneau-tete">
            <h2>{form.id ? t("pipe.modifierAffaire") : t("pipe.nouvelleAffaire")}</h2>
          </header>

          <div className="field">
            <label htmlFor="pipe-titre">{t("pipe.intitule")}</label>
            <input
              id="pipe-titre"
              value={form.titre}
              onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))}
              placeholder={t("pipe.intitulePlaceholder")}
              maxLength={120}
              autoFocus
              required
            />
            <div className="field-hint">{t("pipe.intituleAide")}</div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="vente-client">{t("ve.client")}</label>
              {/* Le client ne se change pas sur une affaire existante : déplacer
                  une opportunité d'un client à l'autre revient à en créer une
                  autre, et brouillerait l'historique des deux fiches. */}
              {form.id ? (
                <input value={form.clientNom} disabled />
              ) : (
                <ChampClient
                  valeur={form.clientNom}
                  onChange={(nom) => setForm((f) => ({ ...f, clientNom: nom, clientId: null }))}
                  onChoisir={(c: SuggestionClient) =>
                    setForm((f) => ({ ...f, clientNom: c.nom, clientId: c.id }))
                  }
                />
              )}
            </div>
            <div className="field">
              <label htmlFor="pipe-montant">{t("pipe.montantEstime")}</label>
              <div className="champ-montant">
                <input
                  id="pipe-montant"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={form.montantEstime}
                  onChange={(e) => setForm((f) => ({ ...f, montantEstime: e.target.value }))}
                  placeholder="0"
                  required
                />
                <span className="champ-suffixe">XAF</span>
              </div>
              <div className="field-hint">{t("pipe.montantAide")}</div>
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <span className="label-bloc">{t("pipe.priorite")}</span>
              <div className="segmente" role="group" aria-label={t("pipe.priorite")}>
                {PRIORITES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={form.priorite === p ? "on" : undefined}
                    onClick={() => setForm((f) => ({ ...f, priorite: p }))}
                    aria-pressed={form.priorite === p}
                  >
                    {t(`pipe.priorite.${p}` as CleTraduction)}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="pipe-cloture">{t("pipe.clotureEstimee")}</label>
              <input
                id="pipe-cloture"
                type="date"
                value={form.clotureEstimeeLe}
                min={aujourdhui()}
                onChange={(e) => setForm((f) => ({ ...f, clotureEstimeeLe: e.target.value }))}
              />
              <div className="field-hint">{t("pipe.clotureAide")}</div>
            </div>
          </div>

          {/* La nature sert à estimer la commission que l'affaire produirait. */}
          <div className="field">
            <span className="label-bloc">{t("ve.nature")}</span>
            <div className="segmente" role="group" aria-label={t("ve.nature")}>
              {NATURES_VENTE.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={form.nature === n ? "on" : undefined}
                  onClick={() => setForm((f) => ({ ...f, nature: n }))}
                  aria-pressed={form.nature === n}
                >
                  {t(`nature.${n}` as CleTraduction)}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="pipe-description">{t("pipe.description")}</label>
            <input
              id="pipe-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t("pipe.descriptionPlaceholder")}
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setOuvert(false);
                setForm(VIDE);
              }}
            >
              <IconClose size={15} />
              {t("commun.annuler")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={envoi || !complet}>
              <IconCheck size={15} />
              {envoi ? t("ag.ajoutEnCours") : t("commun.enregistrer")}
            </button>
          </div>
        </form>
      )}

      {/* La clôture d'une affaire, gagnée ou perdue, demande sa précision. */}
      {cloture && (
        <form className="panneau" onSubmit={confirmerCloture}>
          <header className="panneau-tete">
            <h2>
              {cloture.etape === "PERDUE"
                ? t("pipe.cloturePerdueTitre", { titre: cloture.o.titre })
                : t("pipe.clotureGagneeTitre", { titre: cloture.o.titre })}
            </h2>
          </header>

          <div className="field">
            <label htmlFor="pipe-precision">
              {cloture.etape === "PERDUE" ? t("pipe.motifPerte") : t("ve.reference")}
            </label>
            <input
              id="pipe-precision"
              value={precision}
              onChange={(ev) => setPrecision(ev.target.value)}
              placeholder={
                cloture.etape === "PERDUE"
                  ? t("pipe.motifPertePlaceholder")
                  : t("ve.referencePlaceholder")
              }
              autoFocus
            />
            <div className="field-hint">
              {cloture.etape === "PERDUE" ? t("pipe.motifPerteAide") : t("pipe.referenceAide")}
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setCloture(null)}>
              <IconClose size={15} />
              {t("commun.annuler")}
            </button>
            <button type="submit" className="btn btn-primary">
              <IconCheck size={15} />
              {t("commun.enregistrer")}
            </button>
          </div>
        </form>
      )}

      {toutes.length === 0 && !ouvert ? (
        <section className="panneau">
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("pipe.videTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("pipe.videTexte")}
            </p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={() => ouvrirCreation()}>
              <IconPlus size={15} />
              {t("pipe.nouvelleAffaire")}
            </button>
          </div>
        </section>
      ) : (
        <div className="kanban">
          {tableau.colonnes.map((colonne) => {
            const sommeColonne = colonne.opportunites.reduce((s, o) => s + o.montantEstime, 0);
            return (
              <section
                key={colonne.etape}
                className={`kan-colonne${survolee === colonne.etape ? " cible" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setSurvolee(colonne.etape);
                }}
                onDragLeave={() => setSurvolee((s) => (s === colonne.etape ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setSurvolee(null);
                  const o = toutes.find((x) => x.id === saisie);
                  setSaisie(null);
                  if (o) deplacer(o, colonne.etape);
                }}
              >
                <header className="kan-tete">
                  <span className="kan-titre">
                    {libelleEtape(colonne.etape)}
                    <span className="kan-compte">{nombre(colonne.opportunites.length)}</span>
                  </span>
                  {/* La probabilité sur la colonne, pas sur chaque carte : elle
                      dépend de l'étape, donc elle est la même pour toute la
                      colonne, et la répéter serait du bruit. */}
                  <span className="kan-proba">{nombre(colonne.probabilitePct)}%</span>
                </header>

                <div className="kan-somme">
                  {sommeColonne > 0 ? montantCompact(sommeColonne) : <span className="muted-3">—</span>}
                </div>

                <div className="kan-pile">
                  {colonne.opportunites.map((o) => (
                    <article
                      key={o.id}
                      className={`kan-carte${o.stagne ? " stagne" : ""}${saisie === o.id ? " saisie" : ""}`}
                      draggable
                      onDragStart={() => setSaisie(o.id)}
                      onDragEnd={() => {
                        setSaisie(null);
                        setSurvolee(null);
                      }}
                    >
                      <div className="kan-carte-haut">
                        <span className={`pill pill-priorite-${o.priorite.toLowerCase()}`}>
                          {t(`pipe.priorite.${o.priorite}` as CleTraduction)}
                        </span>
                        {/* Le nombre de jours dans l'étape, pas depuis la
                            création : c'est l'immobilité qui alerte. */}
                        <span className="kan-jours" title={t("pipe.joursDansEtapeAide")}>
                          {t("pipe.nJours", { n: nombre(o.joursDansEtape) })}
                        </span>
                      </div>

                      <button type="button" className="kan-carte-corps" onClick={() => ouvrirEdition(o)}>
                        <span className="kan-carte-titre">{o.titre}</span>
                        <span className="kan-carte-client">{o.clientNom}</span>
                        {o.description && <span className="kan-carte-note">{o.description}</span>}
                      </button>

                      <div className="kan-carte-pied">
                        <span className="kan-montant" title={montant(o.montantEstime)}>
                          {montantCompact(o.montantEstime)}
                        </span>
                        {o.clotureEstimeeLe && (
                          <span className="kan-echeance">{date(o.clotureEstimeeLe)}</span>
                        )}
                      </div>

                      {/* Le glissement ne se fait pas au clavier et ne se voit
                          pas sur un écran étroit : la même action reste
                          disponible en liste. */}
                      <div className="kan-carte-actions">
                        <label className="kan-deplacer">
                          <select
                            value={o.etape}
                            onChange={(e) => deplacer(o, e.target.value as EtapePipeline)}
                            aria-label={t("pipe.deplacerVers")}
                          >
                            {(["NOUVELLE", "QUALIFIEE", "DEVIS_ENVOYE", "NEGOCIATION", "GAGNEE", "PERDUE"] as const).map(
                              (e) => (
                                <option key={e} value={e}>
                                  {libelleEtape(e)}
                                </option>
                              )
                            )}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => retirer(o)}
                          aria-label={t("commun.supprimer")}
                          title={t("commun.supprimer")}
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </article>
                  ))}

                  {colonne.opportunites.length === 0 && (
                    <p className="kan-vide">{t("pipe.colonneVide")}</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
