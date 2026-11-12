import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DemandeCotation,
  FileCotations,
  PieceCotation,
  StatutCotation,
  SuggestionClient,
  creerCotation,
  fetchCotation,
  fetchCotations,
  receptionnerCotation,
  repondreCotation,
  supprimerCotation,
  telechargerPieceCotation,
} from "../api";
import { useAuth } from "../AuthContext";
import { useLangue, type CleTraduction } from "../i18n";
import ChampClient from "../components/ChampClient";
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconClose,
  IconDownload,
  IconInbox,
  IconPaperclip,
  IconPlus,
  IconSend,
  IconTrash,
} from "../components/Icons";

/** Date du jour au format attendu par un champ date, dans le fuseau local. */
function aujourdhui() {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${String(d.getDate()).padStart(2, "0")}`;
}

const VIDE = {
  objet: "",
  description: "",
  clientId: null as string | null,
  clientNom: "",
  echeanceLe: "",
  piece: null as File | null,
};

/** Les filtres de la file, dans l'ordre du circuit. */
const FILTRES = ["TOUTES", "NON_TRAITEE", "EN_COURS", "TRAITEE"] as const;
type Filtre = (typeof FILTRES)[number];

/* La file se rafraîchit toute seule. Un commercial laisse cette page ouverte
   en attendant sa cotation ; s'il doit recharger pour savoir où elle en est,
   le « temps réel » promis n'existe pas. Trente secondes suffisent : la file
   bouge quelques fois par jour, pas à la seconde. */
const PERIODE_RAFRAICHISSEMENT_MS = 30_000;

/**
 * Le circuit des demandes de cotation, du commercial vers le chef de projet.
 *
 * Le reproche fait au fonctionnement précédent n'était pas le délai mais
 * l'absence de trace : une demande partait par message, et plus rien n'en
 * disait l'état. Trois choix en découlent, visibles à l'écran.
 *
 * La file se trie par échéance, jamais par date de saisie. L'échéance est le
 * seul renseignement qui dise ce qui est urgent ; trier par ancienneté ferait
 * passer une demande sans enjeu avant un appel d'offres qui ferme vendredi.
 *
 * Une cotation rendue n'est pas une demande finie. Elle reste dans la file
 * jusqu'à ce que le commercial confirme l'avoir reçue, et c'est cette
 * confirmation qui manquait.
 *
 * Le chiffre qui porte la page est le nombre de demandes en circuit, et non
 * un montant : ce module mesure de l'attente, pas de l'argent.
 */
export default function CotationsPage() {
  const { t, nombre, date, dateHeure } = useLangue();
  const { utilisateur } = useAuth();
  const [file, setFile] = useState<FileCotations | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const [form, setForm] = useState(VIDE);
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const [historique, setHistorique] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>("TOUTES");

  /* La demande ouverte au détail. Tenue à part de la file pour que le
     rafraîchissement automatique ne la referme pas sous les doigts. */
  const [detail, setDetail] = useState<DemandeCotation | null>(null);
  const [reponse, setReponse] = useState("");
  const [pieceReponse, setPieceReponse] = useState<File | null>(null);
  const [envoiReponse, setEnvoiReponse] = useState(false);

  const champBesoin = useRef<HTMLInputElement>(null);
  const champCotation = useRef<HTMLInputElement>(null);

  const recharger = useCallback(
    (avecHistorique = historique) => {
      fetchCotations(avecHistorique)
        .then(setFile)
        .catch((e) => setErreur((e as Error).message));
    },
    [historique]
  );

  useEffect(() => {
    recharger();
  }, [recharger]);

  /* Le rafraîchissement s'interrompt pendant une saisie : recharger sous les
     doigts de quelqu'un qui écrit ne lui apprend rien et risque de lui faire
     perdre le fil. */
  useEffect(() => {
    if (ouvert || detail) return;
    const minuteur = window.setInterval(() => recharger(), PERIODE_RAFRAICHISSEMENT_MS);
    return () => window.clearInterval(minuteur);
  }, [ouvert, detail, recharger]);

  const droits = file?.droits ?? { traiter: false, superviser: false, fileGlobale: false };
  /* Un compte qui ne fait que surveiller la file n'a rien à y soumettre. */
  const peutSoumettre = droits.traiter || !droits.superviser;

  const demandes = useMemo(() => {
    const toutes = file?.demandes ?? [];
    return filtre === "TOUTES" ? toutes : toutes.filter((d) => d.statut === filtre);
  }, [file, filtre]);

  /**
   * Heures d'attente de la demande qui attend depuis le plus longtemps, parmi
   * celles qui attendent encore le chef de projet.
   *
   * Calculée sur la file affichée et non sur l'ensemble : c'est de celle-là
   * qu'on parle quand on regarde cet écran.
   */
  const attenteLaPlusAncienne = useMemo(() => {
    const enAttente = (file?.demandes ?? []).filter(
      (d) => d.statut === "NON_TRAITEE" || d.statut === "EN_COURS"
    );
    if (enAttente.length === 0) return null;
    const plusAncienne = Math.min(...enAttente.map((d) => new Date(d.createdAt).getTime()));
    return Math.round(((Date.now() - plusAncienne) / 3_600_000) * 10) / 10;
  }, [file]);

  /* ------------------------------------------------------- Soumission */

  const complet =
    form.objet.trim() !== "" && form.clientNom.trim() !== "" && form.echeanceLe !== "";

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (!complet) return;
    setErreur(null);
    setSucces(null);
    setEnvoi(true);
    try {
      const creee = await creerCotation({
        objet: form.objet.trim(),
        description: form.description.trim(),
        clientId: form.clientId,
        clientNom: form.clientNom.trim(),
        echeanceLe: form.echeanceLe,
        piece: form.piece,
      });
      setSucces(t("cot.demandeEnvoyee", { reference: creee.reference }));
      setOuvert(false);
      setForm(VIDE);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  /* ---------------------------------------------------------- Détail */

  /**
   * Ouvre une demande.
   *
   * Pour un chef de projet, cette seule ouverture fait passer la demande « en
   * traitement » : c'est le serveur qui le décide, à la lecture. Un bouton
   * « j'ai vu » ne serait jamais cliqué, et le commercial resterait devant un
   * « non traitée » faux.
   */
  async function ouvrirDetail(d: DemandeCotation) {
    setErreur(null);
    setSucces(null);
    setReponse("");
    setPieceReponse(null);
    setDetail(d);
    try {
      const frais = await fetchCotation(d.id);
      setDetail(frais);
      // Le statut a pu changer du fait même de cette lecture : la file doit
      // en rendre compte, sans quoi elle contredirait le détail ouvert.
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function envoyerReponse(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    if (reponse.trim() === "" && !pieceReponse) {
      setErreur(t("cot.reponseAide"));
      return;
    }
    setErreur(null);
    setEnvoiReponse(true);
    try {
      const maj = await repondreCotation(detail.id, reponse.trim(), pieceReponse);
      setDetail(maj);
      setReponse("");
      setPieceReponse(null);
      setSucces(t("cot.cotationEnvoyee", { reference: maj.reference }));
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoiReponse(false);
    }
  }

  async function confirmerReception(d: DemandeCotation) {
    setErreur(null);
    try {
      const maj = await receptionnerCotation(d.id);
      setDetail(maj);
      setSucces(t("cot.receptionEnregistree", { reference: maj.reference }));
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function retirer(d: DemandeCotation) {
    if (!confirm(t("cot.confirmerRetrait", { objet: d.objet }))) return;
    setErreur(null);
    try {
      await supprimerCotation(d.id);
      setDetail(null);
      setSucces(t("cot.demandeRetiree"));
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  /* ------------------------------------------------------- Formatage */

  const libelleStatut = (s: StatutCotation) => t(`cot.statut.${s}` as CleTraduction);

  /**
   * Un délai en heures, rendu dans l'unité qui se lit.
   *
   * Au-delà de deux jours, « 73 h » demande un calcul mental pour n'apporter
   * aucune précision utile.
   */
  function delai(heures: number | null): string {
    if (heures === null) return "—";
    /* « 0 h » se lirait comme une absence de délai, alors que c'est un délai
       trop court pour l'unité choisie. */
    if (heures < 1) return t("cot.moinsDUneHeure");
    if (heures < 48) return t("cot.enHeures", { n: nombre(Math.round(heures)) });
    return t("cot.enJours", { n: nombre(Math.round(heures / 24)) });
  }

  /** L'échéance en clair : ce qui compte est le temps restant, pas la date. */
  function echeanceTexte(d: DemandeCotation): string {
    if (!d.enCircuit || d.statut === "TRAITEE") return date(d.echeanceLe);
    const n = d.joursRestants;
    if (n < 0) return t("cot.retardNJours", { n: nombre(-n) });
    if (n === 0) return t("cot.aujourdhui");
    if (n === 1) return t("cot.demain");
    return t("cot.dansNJours", { n: nombre(n) });
  }

  /** Ce que la demande attend, dit du point de vue de celui qui regarde. */
  function attente(d: DemandeCotation): string | null {
    if (d.statut === "NON_TRAITEE" || d.statut === "EN_COURS") return t("cot.attenteReponse");
    if (d.statut === "TRAITEE") {
      return d.commercialId === utilisateur?.id
        ? t("cot.attenteReception")
        : t("cot.attenteReceptionTiers");
    }
    return null;
  }

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("nav.cotations")}</h1>
      </div>
      <div className="head-actions">
        {peutSoumettre && (
          <button className="btn btn-primary" onClick={() => { setOuvert(true); setDetail(null); }} disabled={ouvert}>
            <IconPlus size={16} />
            {t("cot.nouvelleDemande")}
          </button>
        )}
      </div>
    </div>
  );

  if (!file) {
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

  const { totaux } = file;

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

      {/* Le chiffre héros est un nombre de demandes, pas un montant : ce module
          mesure de l'attente. La jauge en dessous dit si la promesse faite au
          commercial a été tenue, seule mesure qu'un dossier précis reconnaît. */}
      <section className="panneau heros">
        <div className="heros-haut">
          <div className="heros-principal">
            <span className="heros-contexte">
              {droits.fileGlobale ? t("cot.heroFileGlobale") : t("cot.heroFileMienne")}
            </span>
            <span className="heros-chiffre">{nombre(totaux.enCircuit)}</span>
            {/* Tant qu'aucune cotation n'a été rendue, un délai moyen n'existe
                pas. Plutôt que de l'annoncer deux fois (la jauge le dit déjà
                juste en dessous), la ligne d'appui montre alors ce qui attend
                depuis le plus longtemps, qui est la question du moment. */}
            <span className="heros-appui">
              {totaux.heuresMoyennesTraitement !== null
                ? t("cot.heroAppuiDelai", { valeur: delai(totaux.heuresMoyennesTraitement) })
                : attenteLaPlusAncienne !== null
                  ? t("cot.heroAppuiAttente", { valeur: delai(attenteLaPlusAncienne) })
                  : t("cot.heroAppuiAucun")}
            </span>
          </div>
          {totaux.enRetard > 0 && (
            <span className="etat etat-alerte">
              {totaux.enRetard === 1
                ? t("cot.uneEnRetard")
                : t("cot.nEnRetard", { n: nombre(totaux.enRetard) })}
            </span>
          )}
        </div>

        {totaux.tauxTenuePct === null ? (
          <p className="panneau-note">{t("cot.tenueAucune")}</p>
        ) : (
          <>
            <span className="mesure" aria-hidden>
              <span
                className={`mesure-remplie${totaux.tauxTenuePct < 80 ? " alerte" : ""}`}
                style={{ width: `${totaux.tauxTenuePct}%` }}
              />
            </span>
            <div className="mesure-pied">
              <span>{t("cot.tenueTitre")}</span>
              <span>
                {nombre(totaux.tauxTenuePct)}%
                {" · "}
                {/* Une seule cotation rendue ne se dit pas « 1 cotations
                    rendues sur 1 » : le compte se lit alors en toutes
                    lettres. */}
                {totaux.nbRendues === 1
                  ? totaux.nbDansLeDelai === 1
                    ? t("cot.tenueUneTenue")
                    : t("cot.tenueUneRatee")
                  : t("cot.tenueDetail", {
                      n: nombre(totaux.nbDansLeDelai),
                      total: nombre(totaux.nbRendues),
                    })}
              </span>
            </div>
          </>
        )}
      </section>

      <section className="tuiles">
        <div className="tuile">
          <span className="tuile-libelle">{t("cot.tuileNonTraitees")}</span>
          <span className="tuile-valeur">{nombre(totaux.nonTraitees)}</span>
        </div>
        <div className="tuile">
          <span className="tuile-libelle">{t("cot.tuileEnCours")}</span>
          <span className="tuile-valeur">{nombre(totaux.enCours)}</span>
        </div>
        <div className="tuile">
          <span className="tuile-libelle">{t("cot.tuileAReceptionner")}</span>
          <span className="tuile-valeur">{nombre(totaux.traitees)}</span>
        </div>
        {/* Le délai avant prise en charge et le délai de traitement accusent
            deux choses différentes, la charge et la réactivité. Les confondre
            empêcherait de savoir laquelle corriger. */}
        <div className="tuile">
          <span className="tuile-libelle">{t("cot.tuilePriseEnCharge")}</span>
          <span className="tuile-valeur">{delai(totaux.heuresMoyennesPriseEnCharge)}</span>
        </div>
      </section>

      {/* La soumission au-dessus de la file : la demande créée apparaît juste
          en dessous, là où on regarde déjà. */}
      {ouvert && (
        <form className="panneau" onSubmit={soumettre}>
          <header className="panneau-tete">
            <h2>{t("cot.titreFormulaire")}</h2>
          </header>

          <div className="field">
            <label htmlFor="cot-objet">{t("cot.objet")}</label>
            <input
              id="cot-objet"
              value={form.objet}
              onChange={(e) => setForm((f) => ({ ...f, objet: e.target.value }))}
              placeholder={t("cot.objetPlaceholder")}
              maxLength={150}
              autoFocus
              required
            />
            <div className="field-hint">{t("cot.objetAide")}</div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="vente-client">{t("ve.client")}</label>
              <ChampClient
                valeur={form.clientNom}
                onChange={(nom) => setForm((f) => ({ ...f, clientNom: nom, clientId: null }))}
                onChoisir={(c: SuggestionClient) =>
                  setForm((f) => ({ ...f, clientNom: c.nom, clientId: c.id }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="cot-echeance">{t("cot.echeance")}</label>
              <input
                id="cot-echeance"
                type="date"
                value={form.echeanceLe}
                min={aujourdhui()}
                onChange={(e) => setForm((f) => ({ ...f, echeanceLe: e.target.value }))}
                required
              />
              <div className="field-hint">{t("cot.echeanceAide")}</div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="cot-description">{t("cot.description")}</label>
            <textarea
              id="cot-description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t("cot.descriptionPlaceholder")}
            />
            <div className="field-hint">{t("cot.descriptionAide")}</div>
          </div>

          <div className="field">
            <span className="label-bloc">{t("cot.piece")}</span>
            <div className="depot">
              <input
                ref={champBesoin}
                type="file"
                className="depot-champ"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.docx,.doc"
                onChange={(e) => setForm((f) => ({ ...f, piece: e.target.files?.[0] ?? null }))}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => champBesoin.current?.click()}>
                <IconPaperclip size={15} />
                {form.piece ? t("cot.remplacerFichier") : t("cot.choisirFichier")}
              </button>
              <span className={form.piece ? "depot-nom" : "depot-nom vide"}>
                {form.piece ? form.piece.name : t("cot.aucunFichier")}
              </span>
              {form.piece && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => {
                    setForm((f) => ({ ...f, piece: null }));
                    if (champBesoin.current) champBesoin.current.value = "";
                  }}
                  aria-label={t("cot.retirerPiece")}
                  title={t("cot.retirerPiece")}
                >
                  <IconClose size={15} />
                </button>
              )}
            </div>
            <div className="field-hint">{t("cot.pieceAide")}</div>
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
              <IconSend size={15} />
              {envoi ? t("cot.envoiEnCours") : t("cot.soumettre")}
            </button>
          </div>
        </form>
      )}

      {detail && (
        <section className="panneau cot-detail">
          <header className="panneau-tete">
            <h2>
              <span className="cot-ref">{detail.reference}</span>
              {detail.objet}
            </h2>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setDetail(null)}
              aria-label={t("commun.fermer")}
              title={t("commun.fermer")}
            >
              <IconClose size={16} />
            </button>
          </header>

          <div className="cot-entete">
            <span className={`pill pill-cot-${detail.statut.toLowerCase()}`}>
              {libelleStatut(detail.statut)}
            </span>
            <span className="cot-client">{detail.clientNom}</span>
            {detail.enRetard && (
              <span className="etat etat-alerte">
                {t("cot.retardNJours", { n: nombre(-detail.joursRestants) })}
              </span>
            )}
          </div>

          {detail.description && <p className="cot-texte">{detail.description}</p>}

          {/* Le fil du dossier : qui l'a demandé, qui s'en est saisi, quand.
              C'est cette trace, et non le statut seul, qui manquait. */}
          <ol className="cot-fil">
            <li>
              <IconClock size={15} />
              {t("cot.demandeeLe", { date: dateHeure(detail.createdAt), nom: detail.commercialNom })}
            </li>
            {detail.priseEnChargeLe && detail.traiteParNom && (
              <li>
                <IconClock size={15} />
                {t("cot.priseEnChargePar", {
                  nom: detail.traiteParNom,
                  date: dateHeure(detail.priseEnChargeLe),
                })}
              </li>
            )}
            {detail.traiteeLe && (
              <li>
                <IconCheck size={15} />
                {t("cot.rendueLe", { date: dateHeure(detail.traiteeLe) })}
              </li>
            )}
            {detail.recueLe && (
              <li>
                <IconCheck size={15} />
                {t("cot.recueLeDate", { date: dateHeure(detail.recueLe) })}
              </li>
            )}
          </ol>

          {detail.reponse && (
            <div className="cot-reponse">
              <span className="cot-sous-titre">{t("cot.reponseDuPM")}</span>
              <p className="cot-texte">{detail.reponse}</p>
            </div>
          )}

          <div className="cot-pieces">
            <span className="cot-sous-titre">{t("cot.piecesJointes")}</span>
            {detail.pieces.length === 0 ? (
              <p className="cot-texte muted-3">{t("cot.aucunePiece")}</p>
            ) : (
              <ul className="cot-liste-pieces">
                {detail.pieces.map((p: PieceCotation) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="cot-piece"
                      onClick={() => telechargerPieceCotation(p).catch((e) => setErreur((e as Error).message))}
                    >
                      <IconDownload size={15} />
                      <span className="cot-piece-nom">{p.nomFichier}</span>
                      <span className={`pill pill-piece-${p.origine.toLowerCase()}`}>
                        {p.origine === "BESOIN" ? t("cot.pieceBesoin") : t("cot.pieceCotation")}
                      </span>
                      <span className="cot-piece-meta">
                        {t("cot.deposeePar", { nom: p.deposeParNom, date: date(p.createdAt) })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Le chef de projet rend sa cotation. La pièce est facultative au
              cas où la réponse tient en deux lignes, mais l'un des deux au
              moins est exigé : une demande qui repasse « traitée » sans rien
              de joint ni rien d'écrit ne renseigne personne. */}
          {droits.traiter && detail.statut !== "CLOTUREE" && (
            <form className="cot-action" onSubmit={envoyerReponse}>
              {/* Le formulaire reste ouvert après l'envoi, sous un autre
                  intitulé : une cotation se corrige, et refuser la correction
                  obligerait à créer une seconde demande pour la même affaire.
                  Mais inviter à « rendre la cotation » une demande déjà rendue
                  laisserait croire que rien n'est parti. */}
              <span className="cot-sous-titre">
                {detail.statut === "TRAITEE" ? t("cot.corrigerCotation") : t("cot.rendreCotation")}
              </span>
              <div className="field">
                <label htmlFor="cot-reponse">{t("cot.reponse")}</label>
                <textarea
                  id="cot-reponse"
                  rows={3}
                  value={reponse}
                  onChange={(e) => setReponse(e.target.value)}
                  placeholder={t("cot.reponsePlaceholder")}
                />
              </div>
              <div className="depot">
                <input
                  ref={champCotation}
                  type="file"
                  className="depot-champ"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.docx,.doc"
                  onChange={(e) => setPieceReponse(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => champCotation.current?.click()}
                >
                  <IconPaperclip size={15} />
                  {pieceReponse ? t("cot.remplacerFichier") : t("cot.joindreCotation")}
                </button>
                <span className={pieceReponse ? "depot-nom" : "depot-nom vide"}>
                  {pieceReponse ? pieceReponse.name : t("cot.aucunFichier")}
                </span>
              </div>
              <div className="field-hint">{t("cot.reponseAide")}</div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={envoiReponse}>
                  <IconSend size={15} />
                  {envoiReponse
                    ? t("cot.envoiEnCours")
                    : detail.statut === "TRAITEE"
                      ? t("cot.renvoyer")
                      : t("cot.envoyerAuCommercial")}
                </button>
              </div>
            </form>
          )}

          {/* La réception, réservée au demandeur. C'est elle qui fait sortir la
              demande du circuit, et personne ne peut la déclarer à sa place. */}
          {detail.statut === "TRAITEE" && detail.commercialId === utilisateur?.id && (
            <div className="cot-action">
              <div className="form-actions form-actions-entre">
                <span className="field-hint">{t("cot.receptionAide")}</span>
                <button type="button" className="btn btn-primary" onClick={() => confirmerReception(detail)}>
                  <IconCheck size={15} />
                  {t("cot.confirmerReception")}
                </button>
              </div>
            </div>
          )}

          {detail.statut === "NON_TRAITEE" && detail.commercialId === utilisateur?.id && (
            <div className="form-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => retirer(detail)}>
                <IconTrash size={14} />
                {t("cot.retirer")}
              </button>
            </div>
          )}
        </section>
      )}

      <section className="panneau">
        <header className="panneau-tete">
          <div className="segmente" role="group" aria-label={t("cot.colStatut")}>
            {FILTRES.map((f) => (
              <button
                key={f}
                type="button"
                className={filtre === f ? "on" : undefined}
                onClick={() => setFiltre(f)}
                aria-pressed={filtre === f}
              >
                {f === "TOUTES" ? t("cot.filtreToutes") : libelleStatut(f)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const suivant = !historique;
              setHistorique(suivant);
              recharger(suivant);
            }}
          >
            {historique ? t("cot.masquerHistorique") : t("cot.voirHistorique")}
          </button>
        </header>

        {demandes.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("cot.videTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {droits.traiter
                ? t("cot.videTraitant")
                : droits.superviser
                  ? t("cot.videSuperviseur")
                  : t("cot.videCommercial")}
            </p>
            {peutSoumettre && !ouvert && (
              <button
                className="btn btn-primary btn-sm"
                style={{ marginTop: 6 }}
                onClick={() => setOuvert(true)}
              >
                <IconPlus size={15} />
                {t("cot.nouvelleDemande")}
              </button>
            )}
          </div>
        ) : (
          <table className="table-nue cot-table">
            <thead>
              <tr>
                <th>{t("cot.colReference")}</th>
                <th>{t("cot.colObjet")}</th>
                {/* La colonne du demandeur n'a de sens que sur une file qui en
                    mélange plusieurs. Sur la sienne, elle répéterait son nom. */}
                {droits.fileGlobale && <th>{t("cot.colDemandeur")}</th>}
                <th className="td-date">{t("cot.colEcheance")}</th>
                <th>{t("cot.colStatut")}</th>
              </tr>
            </thead>
            <tbody>
              {demandes.map((d) => (
                <tr
                  key={d.id}
                  className={`cot-ligne${d.enRetard ? " en-retard" : ""}${detail?.id === d.id ? " active" : ""}`}
                  onClick={() => ouvrirDetail(d)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      ouvrirDetail(d);
                    }
                  }}
                >
                  <td className="cot-ref">{d.reference}</td>
                  <td>
                    <span className="td-strong">{d.objet}</span>
                    <span className="cot-sous-ligne">
                      {d.clientNom}
                      {d.pieces.length > 0 && (
                        <span className="cot-trombone" title={t("cot.piecesJointes")}>
                          <IconPaperclip size={12} />
                          {nombre(d.pieces.length)}
                        </span>
                      )}
                    </span>
                  </td>
                  {droits.fileGlobale && <td>{d.commercialNom}</td>}
                  <td className={`td-date${d.enRetard ? " cot-retard" : ""}`}>{echeanceTexte(d)}</td>
                  <td>
                    <span className={`pill pill-cot-${d.statut.toLowerCase()}`}>
                      {libelleStatut(d.statut)}
                    </span>
                    {attente(d) && <span className="cot-sous-ligne">{attente(d)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="panneau-note">{t("cot.majAuto")}</p>
      </section>
    </>
  );
}
