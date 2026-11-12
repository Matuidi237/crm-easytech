import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DemandeCotation,
  FileCotations,
  PieceCotation,
  StatutCotation,
  SuggestionClient,
  creerCotation,
  demanderRevisionCotation,
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
import CarteIndicateur, { type Carte } from "../components/CarteIndicateur";
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconClose,
  IconDownload,
  IconFile,
  IconInbox,
  IconMore,
  IconPaperclip,
  IconPlus,
  IconQuote,
  IconSearch,
  IconSend,
  IconTrash,
  IconTrend,
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
 * disait l'état. Quatre choix en découlent, visibles à l'écran.
 *
 * La file se lit en fiches et non en tableau. Une demande de cotation est un
 * dossier qu'on ouvre, pas une ligne qu'on compare à ses voisines : les trois
 * renseignements qui décident d'y toucher ou non (le client, l'échéance, les
 * pièces) tiennent sur la fiche, et le reste est à un clic.
 *
 * Les fiches se trient par échéance, jamais par date de saisie. L'échéance est
 * le seul renseignement qui dise ce qui est urgent ; trier par ancienneté
 * ferait passer une demande sans enjeu avant un appel d'offres qui ferme
 * vendredi.
 *
 * Une cotation transmise n'est pas une demande finie. Elle reste dans la file
 * jusqu'à ce que le commercial en accuse réception, ou la renvoie pour
 * correction.
 *
 * Le chiffre qui porte la page est un nombre de demandes, et non un montant :
 * ce module mesure de l'attente, pas de l'argent.
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
  const [recherche, setRecherche] = useState("");

  /* La demande ouverte au détail. Tenue à part de la file pour que le
     rafraîchissement automatique ne la referme pas sous les doigts. */
  const [detail, setDetail] = useState<DemandeCotation | null>(null);
  const [reponse, setReponse] = useState("");
  const [pieceReponse, setPieceReponse] = useState<File | null>(null);
  const [envoiReponse, setEnvoiReponse] = useState(false);
  /* La demande de correction se saisit dans l'application et non dans une
     boîte du navigateur : celle-ci est dessinée par le système, sans rapport
     avec l'écran, et ne laisse pas la place d'expliquer ce qu'on attend. */
  const [revision, setRevision] = useState<DemandeCotation | null>(null);
  const [motifRevision, setMotifRevision] = useState("");

  /** Fiche dont le menu d'actions est déplié. Une seule à la fois. */
  const [menu, setMenu] = useState<string | null>(null);

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
    if (ouvert || detail || revision) return;
    const minuteur = window.setInterval(() => recharger(), PERIODE_RAFRAICHISSEMENT_MS);
    return () => window.clearInterval(minuteur);
  }, [ouvert, detail, revision, recharger]);

  /* Un menu qui ne se referme qu'en rouvrant le même bouton finit toujours par
     rester ouvert derrière un autre écran. */
  useEffect(() => {
    if (!menu) return;
    const fermer = () => setMenu(null);
    window.addEventListener("click", fermer);
    return () => window.removeEventListener("click", fermer);
  }, [menu]);

  const droits = file?.droits ?? { traiter: false, superviser: false, fileGlobale: false };
  /* Un compte qui ne fait que surveiller la file n'a rien à y soumettre. */
  const peutSoumettre = droits.traiter || !droits.superviser;

  const toutes = file?.demandes ?? [];

  const demandes = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return toutes
      .filter((d) => filtre === "TOUTES" || d.statut === filtre)
      .filter(
        (d) =>
          q === "" ||
          d.objet.toLowerCase().includes(q) ||
          d.clientNom.toLowerCase().includes(q) ||
          d.reference.toLowerCase().includes(q) ||
          d.commercialNom.toLowerCase().includes(q)
      );
  }, [toutes, filtre, recherche]);

  /* Les dossiers repartis pour correction, à part. Un chiffrage refait est du
     travail payé deux fois, et c'est le seul endroit de la page où on peut
     s'en apercevoir. */
  const reprises = useMemo(
    () => toutes.filter((d) => d.nbRevisions > 0 && d.enCircuit),
    [toutes]
  );

  /**
   * Heures d'attente de la demande qui attend depuis le plus longtemps, parmi
   * celles qui attendent encore le chef de projet.
   *
   * Calculée sur la file affichée et non sur l'ensemble : c'est de celle-là
   * qu'on parle quand on regarde cet écran.
   */
  const attenteLaPlusAncienne = useMemo(() => {
    const enAttente = toutes.filter((d) => d.statut === "NON_TRAITEE" || d.statut === "EN_COURS");
    if (enAttente.length === 0) return null;
    const plusAncienne = Math.min(...enAttente.map((d) => new Date(d.createdAt).getTime()));
    return Math.round(((Date.now() - plusAncienne) / 3_600_000) * 10) / 10;
  }, [toutes]);

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
    setRevision(null);
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

  async function envoyerRevision(e: FormEvent) {
    e.preventDefault();
    if (!revision) return;
    const motif = motifRevision.trim();
    /* Un renvoi sans motif renvoie le chef de projet à la case départ sans lui
       dire ce qu'il doit reprendre. Le serveur le refuse ; l'interface
       l'empêche plutôt que de laisser l'utilisateur buter sur une erreur. */
    if (motif === "") {
      setErreur(t("cot.motifRevisionAide"));
      return;
    }
    setErreur(null);
    try {
      const maj = await demanderRevisionCotation(revision.id, motif);
      setRevision(null);
      setMotifRevision("");
      setDetail(maj);
      setSucces(t("cot.revisionEnvoyee", { reference: maj.reference }));
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

  function nbDocuments(d: DemandeCotation): string {
    if (d.pieces.length === 0) return t("cot.aucunDocument");
    if (d.pieces.length === 1) return t("cot.unDocument");
    return t("cot.nDocuments", { n: nombre(d.pieces.length) });
  }

  /* --------------------------------------------------------- Fiches */

  /**
   * Une fiche de la file.
   *
   * La fiche entière est cliquable, et le menu d'actions en est détaché pour
   * que le clic ne le déclenche pas. Les trois lignes retenues sont celles qui
   * décident d'ouvrir ou non le dossier ; le pied porte l'échéance, parce que
   * c'est elle qui fait agir.
   */
  function Fiche({ d }: { d: DemandeCotation }) {
    const sienne = d.commercialId === utilisateur?.id;
    return (
      <article
        className={`cot-fiche${d.enRetard ? " en-retard" : ""}${detail?.id === d.id ? " active" : ""}`}
      >
        <header className="cot-fiche-haut">
          <span className="cot-fiche-date">{dateHeure(d.createdAt)}</span>
          <div className="cot-menu">
            <button
              type="button"
              className="icon-btn"
              aria-label={t("cot.actionsLigne")}
              aria-expanded={menu === d.id}
              onClick={(e) => {
                e.stopPropagation();
                setMenu((m) => (m === d.id ? null : d.id));
              }}
            >
              <IconMore size={16} />
            </button>
            {menu === d.id && (
              <div className="cot-menu-liste" role="menu" onClick={(e) => e.stopPropagation()}>
                <button type="button" role="menuitem" onClick={() => { setMenu(null); ouvrirDetail(d); }}>
                  {t("cot.ouvrirDossier")}
                </button>
                {d.statut === "TRAITEE" && sienne && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setMenu(null); confirmerReception(d); }}
                    >
                      {t("cot.confirmerReception")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(null);
                        setMotifRevision("");
                        setDetail(null);
                        setRevision(d);
                      }}
                    >
                      {t("cot.demanderRevision")}
                    </button>
                  </>
                )}
                {d.statut === "NON_TRAITEE" && sienne && (
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => { setMenu(null); retirer(d); }}
                  >
                    {t("cot.retirer")}
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        <button type="button" className="cot-fiche-corps" onClick={() => ouvrirDetail(d)}>
          <span className="cot-fiche-ref">{t("cot.cotationN", { reference: d.reference })}</span>
          <span className="cot-fiche-objet">{d.objet}</span>
          {/* Une seule pastille par fiche : le statut. La reprise est dite en
              texte gris, parce que ce n'est pas un état mais un antécédent. */}
          <span className={`pill pill-cot-${d.statut.toLowerCase()}`}>{libelleStatut(d.statut)}</span>

          <dl className="cot-fiche-lignes">
            <div>
              <dt>{t("ve.client")}</dt>
              <dd>{d.clientNom}</dd>
            </div>
            {droits.fileGlobale && (
              <div>
                <dt>{t("cot.colDemandeur")}</dt>
                <dd>{d.commercialNom}</dd>
              </div>
            )}
            <div>
              <dt>{t("cot.carteDocuments")}</dt>
              <dd>{nbDocuments(d)}</dd>
            </div>
          </dl>

          <div className="cot-fiche-pied">
            <span className="cot-fiche-pied-libelle">
              <IconClock size={15} />
              {t("cot.carteEcheance")}
            </span>
            <span className={`cot-fiche-pied-valeur${d.enRetard ? " alerte" : ""}`}>
              {echeanceTexte(d)}
            </span>
          </div>
        </button>
      </article>
    );
  }

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("nav.cotations")}</h1>
      </div>
      <div className="head-actions">
        {peutSoumettre && (
          <button
            className="btn btn-primary"
            onClick={() => { setOuvert(true); setDetail(null); setRevision(null); }}
            disabled={ouvert}
          >
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
  const enAttente = totaux.nonTraitees + totaux.enCours;

  /**
   * Les quatre indicateurs de la page.
   *
   * Volume, attente, délai, tenue de la promesse. Dans cet ordre parce que
   * c'est celui des questions qu'on se pose : combien de travail passe par ce
   * circuit, combien en reste, en combien de temps il sort, et si le délai
   * annoncé au commercial a été tenu.
   *
   * Aucune variation mois à mois : le circuit n'a pas encore d'historique, et
   * une flèche calculée sur deux semaines de données dirait n'importe quoi.
   */
  const cartes: Carte[] = [
    {
      label: t("cot.kpiSoumises"),
      valeur: nombre(totaux.soumises),
      note:
        totaux.cloturees === 0
          ? t("cot.kpiSoumisesNoteAucune")
          : totaux.cloturees === 1
            ? t("cot.kpiSoumisesNoteUne")
            : t("cot.kpiSoumisesNote", { n: nombre(totaux.cloturees) }),
      icone: IconQuote,
      fg: "#2a79ae",
      bg: "#e8f3fb",
    },
    {
      label: t("cot.kpiAttente"),
      valeur: nombre(enAttente),
      /* Le retard passe avant le détail du découpage : c'est lui qui appelle
         une action, et il doit se lire sans avoir à comparer deux chiffres. */
      note:
        totaux.enRetard > 0
          ? totaux.enRetard === 1
            ? t("cot.uneEnRetard")
            : t("cot.nEnRetard", { n: nombre(totaux.enRetard) })
          : enAttente > 0
            ? t("cot.kpiAttenteNote", { n: nombre(totaux.nonTraitees) })
            : t("cot.aucunRetard"),
      icone: IconClock,
      fg: "#9e6b06",
      bg: "#fcf2e0",
    },
    {
      label: t("cot.kpiDelai"),
      valeur: delai(totaux.heuresMoyennesTraitement),
      /* Rendu en toutes lettres (« moins d'une heure », « 3 j ») : le corps
         prévu pour un montant serait trop grand pour ce texte. */
      valeurTexte: totaux.heuresMoyennesTraitement === null,
      /* Sans cotation transmise, aucun délai n'est mesurable. Plutôt que
         d'afficher un tiret muet, la note montre ce qui attend depuis le plus
         longtemps, qui est la question du moment. */
      note:
        totaux.nbRendues === 0
          ? attenteLaPlusAncienne !== null
            ? t("cot.heroAppuiAttente", { valeur: delai(attenteLaPlusAncienne) })
            : t("cot.heroAppuiAucun")
          : totaux.nbRendues === 1
            ? t("cot.kpiDelaiNoteUne")
            : t("cot.kpiDelaiNote", { n: nombre(totaux.nbRendues) }),
      icone: IconTrend,
      fg: "#5b4bc4",
      bg: "#eeebfa",
    },
    {
      label: t("cot.kpiTenue"),
      /* La valeur porte le compte et la jauge le pourcentage : y mettre le
         pourcentage aussi l'écrirait deux fois sur la même carte. Le compte
         dit en plus sur combien de dossiers le taux est calculé, ce qu'un
         pourcentage seul cache. */
      valeur:
        totaux.nbRendues === 0
          ? "—"
          : `${nombre(totaux.nbDansLeDelai)} / ${nombre(totaux.nbRendues)}`,
      note: totaux.nbRendues === 0 ? t("cot.tenueAucune") : t("cot.kpiTenueNote"),
      icone: IconCheck,
      fg: "#0c8074",
      bg: "#e2f4f1",
      /* La jauge remplace l'icône quand un pourcentage double utilement le
         chiffre. Elle vire à l'ambre sous 80 % : une promesse tenue quatre
         fois sur cinq n'est pas une bonne nouvelle. */
      jauge:
        totaux.tauxTenuePct === null
          ? undefined
          : {
              valeurPct: totaux.tauxTenuePct,
              couleur: totaux.tauxTenuePct < 80 ? "#c07a00" : "#0c8074",
            },
    },
  ];

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

      {/* Les mêmes cartes que les tableaux de bord, et pour la même raison :
          un chiffre sans intitulé ni note se lit de travers. Chacune dit ce
          qu'elle compte, et la note en dessous dit sur quoi elle le compte. */}
      <div className="stat-grid">
        {cartes.map((c) => (
          <CarteIndicateur
            key={c.label}
            {...c}
            libelleVariation={t("dg.depuisMoisDernier")}
            libelleSansVariation={t("dg.pasDeComparaison")}
          />
        ))}
      </div>

      {/* La soumission au-dessus de la file : la fiche créée apparaît juste en
          dessous, là où on regarde déjà. */}
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

      {/* La demande de correction, dans un panneau de l'application. */}
      {revision && (
        <form className="panneau" onSubmit={envoyerRevision}>
          <header className="panneau-tete">
            <h2>{t("cot.demanderRevision")}</h2>
          </header>
          <p className="panneau-note">
            {t("cot.cotationN", { reference: revision.reference })} · {revision.objet}
          </p>
          <div className="field">
            <label htmlFor="cot-motif">{t("cot.motifRevision")}</label>
            <textarea
              id="cot-motif"
              rows={3}
              value={motifRevision}
              onChange={(e) => setMotifRevision(e.target.value)}
              placeholder={t("cot.motifRevisionPlaceholder")}
              autoFocus
            />
            <div className="field-hint">{t("cot.motifRevisionAide")}</div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setRevision(null)}>
              <IconClose size={15} />
              {t("commun.annuler")}
            </button>
            <button type="submit" className="btn btn-primary">
              <IconSend size={15} />
              {t("cot.demanderRevision")}
            </button>
          </div>
        </form>
      )}

      {detail && (
        <section className="panneau cot-detail">
          <header className="panneau-tete">
            <h2>
              <span className="cot-fiche-ref">
                {t("cot.cotationN", { reference: detail.reference })}
              </span>
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
          <span className="cot-sous-titre">{t("cot.suiviDossier")}</span>
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
            {detail.revisionDemandeeLe && (
              <li>
                <IconAlert size={15} />
                {t("cot.revisionDemandeeLe", { date: dateHeure(detail.revisionDemandeeLe) })}
                {detail.motifRevision && <span className="cot-motif">{detail.motifRevision}</span>}
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

          {/* Le chef de projet transmet sa cotation. Le document est facultatif
              au cas où la réponse tient en deux lignes, mais l'un des deux au
              moins est exigé : une demande qui repasse « traitée » sans rien de
              joint ni rien d'écrit ne renseigne personne. */}
          {droits.traiter && detail.statut !== "CLOTUREE" && (
            <form className="cot-action" onSubmit={envoyerReponse}>
              {/* Le formulaire reste ouvert après l'envoi, sous un autre
                  intitulé : une cotation se corrige, et refuser la correction
                  obligerait à créer une seconde demande pour la même affaire. */}
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

          {/* Les deux issues du demandeur. L'accusé de réception est l'action
              principale ; demander une correction est l'autre chemin, et se
              présente comme tel. */}
          {detail.statut === "TRAITEE" && detail.commercialId === utilisateur?.id && (
            <div className="cot-action">
              <div className="form-actions form-actions-entre">
                <span className="field-hint">{t("cot.receptionAide")}</span>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setMotifRevision("");
                      setDetail(null);
                      setRevision(detail);
                    }}
                  >
                    {t("cot.demanderRevision")}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => confirmerReception(detail)}>
                    <IconCheck size={15} />
                    {t("cot.confirmerReception")}
                  </button>
                </div>
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

      {/* La file, en fiches. L'en-tête porte la recherche et les filtres, comme
          partout ailleurs dans l'outil. */}
      <section className="cot-section">
        <header className="cot-section-tete">
          <h2>{t("cot.sectionEnCours")}</h2>
          <div className="cot-outils">
            <div className="champ-recherche">
              <IconSearch size={16} />
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder={t("cot.recherche", { n: nombre(toutes.length) })}
                aria-label={t("cot.recherche", { n: nombre(toutes.length) })}
              />
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
          </div>
        </header>

        <div className="segmente cot-filtres" role="group" aria-label={t("cot.colStatut")}>
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

        {demandes.length === 0 ? (
          <div className="panneau">
            <div className="empty">
              <div className="empty-icon">
                <IconInbox />
              </div>
              <div className="empty-title">
                {recherche.trim() !== "" ? t("cot.aucunResultat") : t("cot.videTitre")}
              </div>
              {recherche.trim() === "" && (
                <p className="empty-text" style={{ margin: 0 }}>
                  {droits.traiter
                    ? t("cot.videTraitant")
                    : droits.superviser
                      ? t("cot.videSuperviseur")
                      : t("cot.videCommercial")}
                </p>
              )}
              {peutSoumettre && !ouvert && recherche.trim() === "" && (
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
          </div>
        ) : (
          <div className="cot-grille">
            {demandes.map((d) => (
              <Fiche key={d.id} d={d} />
            ))}
          </div>
        )}
      </section>

      {/* Les dossiers repris. Section à part, et non une pastille de plus sur
          la fiche : une reprise n'est pas un état du dossier, c'est un coût
          pour l'entreprise, et il ne se voit qu'en les regroupant. */}
      {reprises.length > 0 && (
        <section className="cot-section">
          <header className="cot-section-tete">
            <h2>{t("cot.sectionRevision")}</h2>
          </header>
          <div className="panneau cot-reprises">
            {reprises.map((d) => (
              <article key={d.id} className="cot-reprise">
                <div className="cot-reprise-haut">
                  <span className="cot-reprise-motif">{d.motifRevision}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => ouvrirDetail(d)}
                  >
                    {t("cot.ouvrirDossier")}
                  </button>
                </div>
                <div className="cot-reprise-meta">
                  <span>
                    {d.revisionDemandeeLe
                      ? t("cot.revisionDemandeeLe", { date: date(d.revisionDemandeeLe) })
                      : ""}
                  </span>
                  <span className="cot-reprise-sep">·</span>
                  <span>{t("cot.cotationN", { reference: d.reference })}</span>
                  <span className="cot-reprise-sep">·</span>
                  <span>
                    {d.nbRevisions === 1
                      ? t("cot.repriseUneFois")
                      : t("cot.reprisesFois", { n: nombre(d.nbRevisions) })}
                  </span>
                </div>
                <div className="cot-reprise-pied">
                  <span className="cot-reprise-avatar">{d.commercialNom.slice(0, 1)}</span>
                  <div className="cot-reprise-colonne">
                    <span className="cot-reprise-nom">{d.commercialNom}</span>
                    <span className="cot-reprise-detail">{d.clientNom}</span>
                  </div>
                  <div className="cot-reprise-colonne">
                    <span className="cot-reprise-detail">{t("cot.colObjet")}</span>
                    <span className="cot-reprise-nom">{d.objet}</span>
                  </div>
                  <div className="cot-reprise-colonne">
                    <span className="cot-reprise-detail">{t("cot.chefDeProjet")}</span>
                    <span className="cot-reprise-nom">{d.traiteParNom ?? "—"}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <p className="cot-pied-page">
        <IconFile size={14} />
        {t("cot.majAuto")}
      </p>
    </>
  );
}
