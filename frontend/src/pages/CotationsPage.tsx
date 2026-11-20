import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DemandeCotation,
  FileCotations,
  PieceCotation,
  StatutCotation,
  SuggestionClient,
  Traitant,
  UrgenceCotation,
  creerCotation,
  demanderRevisionCotation,
  fetchCotation,
  fetchCotations,
  prendreEnChargeCotation,
  reaffecterCotation,
  receptionnerCotation,
  repondreCotation,
  supprimerCotation,
  telechargerPieceCotation,
} from "../api";
import { useAuth } from "../AuthContext";
import { useLangue, type CleTraduction } from "../i18n";
import ChampClient from "../components/ChampClient";
import ListeDeroulante from "../components/ListeDeroulante";
import CarteIndicateur, { type Carte } from "../components/CarteIndicateur";
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconClose,
  IconDownload,
  IconInbox,
  IconLayers,
  IconPaperclip,
  IconPlus,
  IconQuote,
  IconSearch,
  IconSend,
  IconTrash,
  IconTrend,
  IconUserCircle,
} from "../components/Icons";

/** Date du jour au format attendu par un champ date, dans le fuseau local. */
function aujourdhui() {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Initiale d'un nom, pour la pastille de responsable. */
function initiale(nom: string) {
  return nom.trim().slice(0, 1).toUpperCase() || "?";
}

const VIDE = {
  objet: "",
  description: "",
  clientId: null as string | null,
  clientNom: "",
  echeanceLe: "",
  piece: null as File | null,
};

const STATUTS: StatutCotation[] = ["NON_TRAITEE", "EN_COURS", "TRAITEE", "CLOTUREE"];
const URGENCES: UrgenceCotation[] = ["CRITIQUE", "HAUTE", "MOYENNE", "BASSE"];

/* La file se rafraîchit toute seule. Un commercial laisse cette page ouverte
   en attendant sa cotation ; s'il doit recharger pour savoir où elle en est,
   le « temps réel » promis n'existe pas. Trente secondes suffisent : la file
   bouge quelques fois par jour, pas à la seconde. */
const PERIODE_RAFRAICHISSEMENT_MS = 30_000;

/**
 * Le circuit des demandes de cotation, du commercial vers le chef de projet.
 *
 * Quatre partis pris, visibles à l'écran.
 *
 * Toute demande porte un nom dès la soumission. La répartition désigne un
 * responsable avant que quiconque ait ouvert le dossier, parce qu'une demande
 * qui n'est à personne attend sans que personne s'en aperçoive.
 *
 * Affecter et prendre en charge sont deux gestes distincts. Consulter un
 * dossier ne vaut plus prise de responsabilité : la prise en charge est un
 * bouton, et c'est entre l'affectation et ce bouton que se loge l'attente
 * qu'on veut mesurer.
 *
 * L'urgence se déduit de l'échéance et ne se saisit pas. Un champ de priorité
 * libre finit coché « haute » par tout le monde et cesse de trier quoi que ce
 * soit ; l'échéance, elle, engage celui qui l'annonce.
 *
 * Une cotation transmise n'est pas une demande finie. Elle reste dans la file
 * jusqu'à ce que le commercial en accuse réception, ou la renvoie pour
 * correction.
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
  const [recherche, setRecherche] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreUrgence, setFiltreUrgence] = useState("");

  /* Le filtre par responsable vit dans l'adresse, et lui seul : la carte
     « Mes demandes » y mène par un lien, ce qui la rend cliquable sans
     inventer un composant de carte-bouton, et la vue filtrée se transmet
     telle quelle à un collègue. Les autres filtres restent locaux, personne
     n'ayant besoin de partager « les demandes dont le titre contient ate ». */
  const [adresse, setAdresse] = useSearchParams();
  const filtreResponsable = adresse.get("responsable") ?? "";

  const [detail, setDetail] = useState<DemandeCotation | null>(null);
  const [reponse, setReponse] = useState("");
  const [pieceReponse, setPieceReponse] = useState<File | null>(null);
  const [envoiReponse, setEnvoiReponse] = useState(false);

  const [revision, setRevision] = useState<DemandeCotation | null>(null);
  const [motifRevision, setMotifRevision] = useState("");

  const [reaffectation, setReaffectation] = useState<DemandeCotation | null>(null);
  const [nouveauResponsable, setNouveauResponsable] = useState("");
  const [motifReaffectation, setMotifReaffectation] = useState("");

  const champBesoin = useRef<HTMLInputElement>(null);
  const champCotation = useRef<HTMLInputElement>(null);

  const recharger = useCallback(
    (avecHistorique = historique, responsable = filtreResponsable) => {
      fetchCotations(avecHistorique, responsable)
        .then(setFile)
        .catch((e) => setErreur((e as Error).message));
    },
    [historique, filtreResponsable]
  );

  useEffect(() => {
    recharger();
  }, [recharger]);

  /* Ouverture directe sur un dossier, « /cotations?demande=... ». C'est ce que
     vise le clic sur une notification : atterrir sur la file sans savoir
     laquelle des quarante lignes a motivé l'avis ne servirait à rien.
     L'identifiant reste dans l'adresse, de sorte que le lien se recharge et se
     transmet ; un drapeau évite seulement de rouvrir le même dossier si la
     personne vient de le fermer. */
  const demandeVisee = adresse.get("demande");
  const dejaOuverte = useRef<string | null>(null);
  useEffect(() => {
    if (!demandeVisee || dejaOuverte.current === demandeVisee) return;
    dejaOuverte.current = demandeVisee;
    fetchCotation(demandeVisee)
      .then(setDetail)
      .catch((e) => setErreur((e as Error).message));
  }, [demandeVisee]);

  /** Ferme la fenêtre de soumission et vide ce qui y avait été saisi. */
  function fermerFormulaire() {
    setOuvert(false);
    setForm(VIDE);
    if (champBesoin.current) champBesoin.current.value = "";
  }

  /* Échap ferme la fenêtre ouverte, quelle qu'elle soit. C'est le réflexe de
     tout le monde devant une fenêtre modale, et ne pas y répondre donne
     l'impression d'être coincé. Les trois ne s'ouvrent jamais ensemble, ouvrir
     l'une refermant les autres. */
  useEffect(() => {
    if (!ouvert && !reaffectation && !revision) return;
    function auClavier(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (ouvert) fermerFormulaire();
      else if (reaffectation) setReaffectation(null);
      else setRevision(null);
    }
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, reaffectation, revision]);

  /** Ferme la fiche, et retire de l'adresse le dossier qu'elle visait. */
  function fermerDetail() {
    setDetail(null);
    if (!adresse.has("demande")) return;
    const suivant = new URLSearchParams(adresse);
    suivant.delete("demande");
    setAdresse(suivant, { replace: true });
  }

  /* Le rafraîchissement s'interrompt pendant une saisie : recharger sous les
     doigts de quelqu'un qui écrit ne lui apprend rien et risque de lui faire
     perdre le fil. */
  useEffect(() => {
    if (ouvert || detail || revision || reaffectation) return;
    const minuteur = window.setInterval(() => recharger(), PERIODE_RAFRAICHISSEMENT_MS);
    return () => window.clearInterval(minuteur);
  }, [ouvert, detail, revision, reaffectation, recharger]);

  const droits = file?.droits ?? {
    traiter: false,
    affecter: false,
    superviser: false,
    fileGlobale: false,
  };
  /* Un compte qui ne fait que surveiller la file n'a rien à y soumettre. */
  const peutSoumettre = droits.traiter || !droits.superviser;
  const traitants: Traitant[] = file?.traitants ?? [];

  const toutes = file?.demandes ?? [];

  const demandes = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return toutes
      .filter((d) => filtreStatut === "" || d.statut === filtreStatut)
      .filter((d) => filtreUrgence === "" || d.urgence === filtreUrgence)
      .filter(
        (d) =>
          q === "" ||
          d.objet.toLowerCase().includes(q) ||
          d.clientNom.toLowerCase().includes(q) ||
          d.reference.toLowerCase().includes(q) ||
          d.commercialNom.toLowerCase().includes(q) ||
          (d.responsableNom ?? "").toLowerCase().includes(q)
      );
  }, [toutes, filtreStatut, filtreUrgence, recherche]);

  /* Les dossiers repartis pour correction, à part. Un chiffrage refait est du
     travail payé deux fois, et c'est le seul endroit de la page où on peut
     s'en apercevoir. */
  const reprises = useMemo(
    () => toutes.filter((d) => d.nbRevisions > 0 && d.enCircuit),
    [toutes]
  );

  /** Heures d'attente du dossier qui attend depuis le plus longtemps. */
  const attenteLaPlusAncienne = useMemo(() => {
    const enAttente = toutes.filter((d) => d.statut === "NON_TRAITEE" || d.statut === "EN_COURS");
    if (enAttente.length === 0) return null;
    const plusAncienne = Math.min(...enAttente.map((d) => new Date(d.createdAt).getTime()));
    return Math.round(((Date.now() - plusAncienne) / 3_600_000) * 10) / 10;
  }, [toutes]);

  /* ------------------------------------------------------- Soumission */

  const complet =
    form.objet.trim() !== "" && form.clientNom.trim() !== "" && form.echeanceLe !== "";

  function fermerTout() {
    setOuvert(false);
    setDetail(null);
    setRevision(null);
    setReaffectation(null);
  }

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
      setSucces(
        creee.responsableNom
          ? t("cot.demandeAffectee", { reference: creee.reference, nom: creee.responsableNom })
          : t("cot.demandeEnvoyee", { reference: creee.reference })
      );
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

  async function ouvrirDetail(d: DemandeCotation) {
    setErreur(null);
    setSucces(null);
    setReponse("");
    setPieceReponse(null);
    setRevision(null);
    setReaffectation(null);
    setDetail(d);
    try {
      setDetail(await fetchCotation(d.id));
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function prendreEnCharge(d: DemandeCotation) {
    setErreur(null);
    try {
      const maj = await prendreEnChargeCotation(d.id);
      setDetail(maj);
      setSucces(t("cot.priseEnChargeFaite", { reference: maj.reference }));
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

  async function envoyerReaffectation(e: FormEvent) {
    e.preventDefault();
    if (!reaffectation) return;
    const motif = motifReaffectation.trim();
    const cible = traitants.find((x) => x.nomComplet === nouveauResponsable);
    if (!cible) {
      setErreur(t("cot.choisirResponsable"));
      return;
    }
    if (motif === "") {
      setErreur(t("cot.motifReaffectationAide"));
      return;
    }
    setErreur(null);
    try {
      const maj = await reaffecterCotation(reaffectation.id, cible.id, motif);
      setReaffectation(null);
      setMotifReaffectation("");
      setNouveauResponsable("");
      setDetail(maj);
      setSucces(
        t("cot.reaffectationFaite", { reference: maj.reference, nom: cible.nomComplet })
      );
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
  const libelleUrgence = (u: UrgenceCotation) => t(`cot.urgence.${u}` as CleTraduction);

  /** Un délai en heures, rendu dans l'unité qui se lit. */
  function delai(heures: number | null): string {
    if (heures === null) return "—";
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

  function changerResponsable(valeur: string) {
    const suivant = new URLSearchParams(adresse);
    if (valeur === "") suivant.delete("responsable");
    else suivant.set("responsable", valeur);
    setAdresse(suivant, { replace: true });
  }

  /** Options du filtre par responsable, en libellés pour la liste déroulante. */
  const optionsResponsable = useMemo(
    () => [t("cot.mesDemandes"), ...traitants.map((x) => x.nomComplet), t("cot.nonAffectee")],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [traitants, t]
  );

  const libelleFiltreResponsable =
    filtreResponsable === ""
      ? ""
      : filtreResponsable === "moi"
        ? t("cot.mesDemandes")
        : filtreResponsable === "aucun"
          ? t("cot.nonAffectee")
          : (traitants.find((x) => x.id === filtreResponsable)?.nomComplet ?? "");

  function choisirFiltreResponsable(libelle: string) {
    if (libelle === "") return changerResponsable("");
    if (libelle === t("cot.mesDemandes")) return changerResponsable("moi");
    if (libelle === t("cot.nonAffectee")) return changerResponsable("aucun");
    const cible = traitants.find((x) => x.nomComplet === libelle);
    changerResponsable(cible ? cible.id : "");
  }

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("nav.cotations")}</h1>
        <div className="page-sub">{t("cot.sousTitre")}</div>
      </div>
      <div className="head-actions">
        {peutSoumettre && (
          <button
            className="btn btn-primary"
            onClick={() => {
              fermerTout();
              setOuvert(true);
            }}
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

  /** « 3 en retard », ou rien à signaler. */
  function noteRetard(n: number, defaut: string): string {
    if (n === 0) return defaut;
    return n === 1 ? t("cot.uneEnRetardCourt") : t("cot.nEnRetardCourt", { n: nombre(n) });
  }

  /**
   * Les quatre compteurs de la page.
   *
   * Des états, et non un mélange de comptes et de moyennes. Chacun se
   * vérifie en comptant les lignes du tableau en dessous, ce qui n'est pas
   * vrai d'un délai moyen : les deux ne se lisent pas au même rythme, et leur
   * donner le même poids visuel brouillait la page.
   *
   * La quatrième dépend de qui regarde. Un chef de projet veut savoir ce
   * qu'il doit personnellement ; pour les autres, c'est l'étape où la balle
   * est revenue dans le camp du commercial.
   */
  const cartes: Carte[] = [
    {
      label: t("cot.kpiTotal"),
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
      label: t("cot.kpiEnAttente"),
      valeur: nombre(totaux.nonTraitees),
      /* Le retard passe avant la définition de l'étape : c'est lui qui appelle
         une action. Ventilé par étape, sinon on ne saurait pas si les dossiers
         pourrissent avant d'être pris en charge ou pendant le chiffrage. */
      note: noteRetard(totaux.enRetardAttente, t("cot.kpiEnAttenteNote")),
      icone: IconClock,
      fg: "#9e6b06",
      bg: "#fcf2e0",
    },
    {
      label: t("cot.kpiEnCours"),
      valeur: nombre(totaux.enCours),
      note: noteRetard(totaux.enRetardEnCours, t("cot.kpiEnCoursNote")),
      icone: IconTrend,
      fg: "#5b4bc4",
      bg: "#eeebfa",
    },
    /* « Mes demandes » ne s'affiche qu'à qui entre dans la répartition. Le
       directeur peut traiter une cotation, puisqu'il peut tout, mais on ne lui
       en affecte jamais : la carte lui annoncerait éternellement zéro. */
    droits.traiter && !droits.superviser
      ? {
          label: t("cot.mesDemandes"),
          valeur: nombre(totaux.mesDemandes),
          note:
            totaux.mesDemandes === 0
              ? t("cot.kpiMesDemandesAucune")
              : t("cot.kpiMesDemandesNote", { n: nombre(totaux.aPrendreEnCharge) }),
          icone: IconUserCircle,
          fg: "#0c8074",
          bg: "#e2f4f1",
          /* La carte mène à la file filtrée sur soi. C'est la façon la plus
             courte d'aller de « j'en ai sept » à « lesquelles ». */
          vers: "/cotations?responsable=moi",
          libelleLien: t("cot.voirMesDemandes"),
        }
      : {
          label: t("cot.kpiAReceptionner"),
          valeur: nombre(totaux.traitees),
          note: t("cot.kpiAReceptionnerNote"),
          icone: IconCheck,
          fg: "#0c8074",
          bg: "#e2f4f1",
        },
  ];

  /**
   * La ligne de qualité, sous les compteurs.
   *
   * Délai moyen et respect de la promesse. Ce sont des mesures qu'on regarde
   * une fois par semaine, pas des compteurs qu'on surveille : en carte, elles
   * prenaient le quart de l'écran pour une information qui ne commande
   * aucun geste du jour.
   */
  const ligneQualite =
    totaux.nbRendues === 0
      ? attenteLaPlusAncienne !== null
        ? `${t("cot.qualiteAucune")} · ${t("cot.heroAppuiAttente", {
            valeur: delai(attenteLaPlusAncienne),
          })}`
        : t("cot.qualiteAucune")
      : `${t("cot.qualiteDelai", { valeur: delai(totaux.heuresMoyennesTraitement) })} · ${
          totaux.nbRendues === 1
            ? totaux.nbDansLeDelai === 1
              ? t("cot.qualiteTenueUne")
              : t("cot.qualiteTenueUneRatee")
            : t("cot.qualiteTenue", {
                n: nombre(totaux.nbDansLeDelai),
                total: nombre(totaux.nbRendues),
              })
        }`;

  /** Le bandeau de responsabilité, en tête de la fiche détaillée. */
  function Responsabilite({ d }: { d: DemandeCotation }) {
    return (
      <div className="cot-responsable">
        <span className="cot-responsable-pastille">
          {d.responsableNom ? initiale(d.responsableNom) : "?"}
        </span>
        <div className="cot-responsable-colonne">
          <span className="cot-responsable-libelle">{t("cot.responsable")}</span>
          <span className="cot-responsable-nom">
            {d.responsableNom ?? t("cot.nonAffectee")}
          </span>
        </div>
        {/* Prise en charge ou non : l'écart entre les deux est ce que cette
            refonte rend visible. */}
        <span className={`etat ${d.priseEnChargeLe ? "etat-bon" : "etat-alerte"}`}>
          {d.priseEnChargeLe ? t("cot.priseEnCharge") : t("cot.aPrendreEnCharge")}
        </span>
        <div className="cot-responsable-actions">
          {droits.traiter &&
            d.priseEnChargeLe === null &&
            d.enCircuit &&
            d.statut !== "TRAITEE" &&
            (d.responsableId === null || d.responsableId === utilisateur?.id) && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => prendreEnCharge(d)}>
                <IconCheck size={15} />
                {t("cot.prendreEnCharge")}
              </button>
            )}
          {droits.affecter && d.statut !== "CLOTUREE" && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              /* La fiche reste ouverte derrière la fenêtre : on y revient
                 juste après, et la refermer ferait perdre le dossier qu'on
                 était en train de lire. */
              onClick={() => {
                setNouveauResponsable("");
                setMotifReaffectation("");
                setReaffectation(d);
              }}
            >
              {t("cot.reaffecter")}
            </button>
          )}
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

      <p className="cot-qualite">
        <IconTrend size={15} />
        {ligneQualite}
      </p>

      {/* La soumission dans une fenêtre. En panneau au fil de la page, elle
          poussait la liste vers le bas et laissait croire qu'on pouvait
          continuer à travailler à côté, alors qu'on est en train de rédiger
          une demande. La fenêtre pose la question une bonne fois. */}
      {ouvert && (
        <div
          className="modal-backdrop"
          onClick={fermerFormulaire}
          role="presentation"
        >
          <form
            className="modal modal-forme"
            onClick={(e) => e.stopPropagation()}
            onSubmit={soumettre}
            role="dialog"
            aria-modal
            aria-label={t("cot.titreFormulaire")}
          >
            <header className="modal-forme-tete">
              <div>
                <h3>{t("cot.titreFormulaire")}</h3>
                <p className="modal-sub">{t("cot.titreFormulaireAide")}</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={fermerFormulaire}
                aria-label={t("commun.fermer")}
              >
                <IconClose size={18} />
              </button>
            </header>

            <div className="modal-forme-corps">
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
            </div>

            <div className="modal-forme-pied">
              <button type="button" className="btn btn-ghost" onClick={fermerFormulaire}>
                {t("commun.annuler")}
              </button>
              <button type="submit" className="btn btn-primary" disabled={envoi || !complet}>
                <IconSend size={15} />
                {envoi ? t("cot.envoiEnCours") : t("cot.soumettre")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* La réaffectation, en fenêtre comme les deux autres saisies : on est
          en train de retirer un dossier à quelqu'un, pas de régler un filtre
          en passant. */}
      {reaffectation && (
        <div className="modal-backdrop" onClick={() => setReaffectation(null)} role="presentation">
          <form
            className="modal modal-forme"
            onClick={(e) => e.stopPropagation()}
            onSubmit={envoyerReaffectation}
            role="dialog"
            aria-modal
            aria-label={t("cot.reaffecterTitre")}
          >
            <header className="modal-forme-tete">
              <div>
                <h3>{t("cot.reaffecterTitre")}</h3>
                <p className="modal-sub">
                  {t("cot.cotationN", { reference: reaffectation.reference })} ·{" "}
                  {reaffectation.objet}
                  {reaffectation.responsableNom
                    ? ` · ${t("cot.responsableActuel", { nom: reaffectation.responsableNom })}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setReaffectation(null)}
                aria-label={t("commun.fermer")}
              >
                <IconClose size={18} />
              </button>
            </header>

            <div className="modal-forme-corps">
              <div className="field">
                <label htmlFor="cot-nouveau-responsable">{t("cot.nouveauResponsable")}</label>
                <ListeDeroulante
                  id="cot-nouveau-responsable"
                  valeur={nouveauResponsable}
                  options={traitants.map((x) => x.nomComplet)}
                  onChange={setNouveauResponsable}
                  placeholder={t("cot.choisirResponsable")}
                />
              </div>

              <div className="field">
                <label htmlFor="cot-motif-reaffectation">{t("cot.motifReaffectation")}</label>
                <textarea
                  id="cot-motif-reaffectation"
                  rows={3}
                  value={motifReaffectation}
                  onChange={(e) => setMotifReaffectation(e.target.value)}
                  placeholder={t("cot.motifReaffectationPlaceholder")}
                />
                <div className="field-hint">{t("cot.motifReaffectationAide")}</div>
              </div>
            </div>

            <div className="modal-forme-pied">
              <button type="button" className="btn btn-ghost" onClick={() => setReaffectation(null)}>
                {t("commun.annuler")}
              </button>
              <button type="submit" className="btn btn-primary">
                <IconSend size={15} />
                {t("cot.reaffecter")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* La demande de correction, en fenêtre elle aussi. */}
      {revision && (
        <div className="modal-backdrop" onClick={() => setRevision(null)} role="presentation">
          <form
            className="modal modal-forme"
            onClick={(e) => e.stopPropagation()}
            onSubmit={envoyerRevision}
            role="dialog"
            aria-modal
            aria-label={t("cot.demanderRevision")}
          >
            <header className="modal-forme-tete">
              <div>
                <h3>{t("cot.demanderRevision")}</h3>
                <p className="modal-sub">
                  {t("cot.cotationN", { reference: revision.reference })} · {revision.objet}
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setRevision(null)}
                aria-label={t("commun.fermer")}
              >
                <IconClose size={18} />
              </button>
            </header>

            <div className="modal-forme-corps">
              <div className="field">
                <label htmlFor="cot-motif">{t("cot.motifRevision")}</label>
                <textarea
                  id="cot-motif"
                  rows={4}
                  value={motifRevision}
                  onChange={(e) => setMotifRevision(e.target.value)}
                  placeholder={t("cot.motifRevisionPlaceholder")}
                  autoFocus
                />
                <div className="field-hint">{t("cot.motifRevisionAide")}</div>
              </div>
            </div>

            <div className="modal-forme-pied">
              <button type="button" className="btn btn-ghost" onClick={() => setRevision(null)}>
                {t("commun.annuler")}
              </button>
              <button type="submit" className="btn btn-primary">
                <IconSend size={15} />
                {t("cot.demanderRevision")}
              </button>
            </div>
          </form>
        </div>
      )}

      {detail && (
        <section className="panneau cot-detail">
          <header className="panneau-tete">
            <h2>
              <span className="cot-ref">{t("cot.cotationN", { reference: detail.reference })}</span>
              {detail.objet}
            </h2>
            <button
              type="button"
              className="icon-btn"
              onClick={fermerDetail}
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

          <Responsabilite d={detail} />

          {detail.description && <p className="cot-texte">{detail.description}</p>}

          {/* Le fil du dossier : qui l'a demandé, à qui il revient, qui s'en
              est saisi, quand. C'est cette trace, et non le statut seul, qui
              manquait. Les réaffectations y figurent avec leur motif. */}
          <span className="cot-sous-titre">{t("cot.suiviDossier")}</span>
          <ol className="cot-fil">
            <li>
              <IconClock size={15} />
              {t("cot.demandeeLe", { date: dateHeure(detail.createdAt), nom: detail.commercialNom })}
            </li>
            {detail.affectations.map((a) => (
              <li key={a.id}>
                <IconLayers size={15} />
                {a.ancienResponsableNom
                  ? t("cot.reaffecteeDe", {
                      ancien: a.ancienResponsableNom,
                      nouveau: a.nouveauResponsableNom,
                      par: a.parNom ?? "",
                      date: dateHeure(a.createdAt),
                    })
                  : a.automatique
                    ? t("cot.affecteeAuto", {
                        nom: a.nouveauResponsableNom,
                        date: dateHeure(a.createdAt),
                      })
                    : t("cot.affecteePar", {
                        nom: a.nouveauResponsableNom,
                        par: a.parNom ?? "",
                        date: dateHeure(a.createdAt),
                      })}
                {a.motif && <span className="cot-motif">{a.motif}</span>}
              </li>
            ))}
            {detail.priseEnChargeLe && detail.traiteParNom && (
              <li>
                <IconCheck size={15} />
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

          {/* Le chiffrage ne s'ouvre qu'une fois le dossier pris en charge :
              laisser transmettre sans prise en charge rendrait le bouton
              « Prendre en charge » décoratif, et le délai qu'il sert à mesurer
              resterait inconnu. */}
          {droits.traiter &&
            detail.statut !== "CLOTUREE" &&
            detail.responsableId === utilisateur?.id &&
            detail.priseEnChargeLe !== null && (
              <form className="cot-action" onSubmit={envoyerReponse}>
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

          {/* Les deux issues du demandeur. */}
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

      {/* La liste. Un seul panneau : l'en-tête porte la recherche et les
          filtres, le corps porte le tableau pleine largeur. */}
      <section className="panneau panneau-liste">
        <header className="cot-liste-tete">
          <h2>
            <IconQuote size={18} />
            {t("cot.tableTitre")}
          </h2>
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

        <div className="cot-filtres">
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
          <ListeDeroulante
            id="cot-filtre-statut"
            valeur={filtreStatut === "" ? "" : libelleStatut(filtreStatut as StatutCotation)}
            options={STATUTS.map(libelleStatut)}
            onChange={(libelle) =>
              setFiltreStatut(STATUTS.find((s) => libelleStatut(s) === libelle) ?? "")
            }
            placeholder={t("cot.filtreStatut")}
            videLibelle={t("cot.filtreStatut")}
          />
          <ListeDeroulante
            id="cot-filtre-urgence"
            valeur={filtreUrgence === "" ? "" : libelleUrgence(filtreUrgence as UrgenceCotation)}
            options={URGENCES.map(libelleUrgence)}
            onChange={(libelle) =>
              setFiltreUrgence(URGENCES.find((u) => libelleUrgence(u) === libelle) ?? "")
            }
            placeholder={t("cot.filtreUrgence")}
            videLibelle={t("cot.filtreUrgence")}
          />
          {/* Le filtre par responsable n'a de sens que pour qui voit la file
              entière : un commercial n'a qu'un interlocuteur à la fois. */}
          {droits.fileGlobale && (
            <ListeDeroulante
              id="cot-filtre-responsable"
              valeur={libelleFiltreResponsable}
              options={optionsResponsable}
              onChange={choisirFiltreResponsable}
              placeholder={t("cot.filtreResponsable")}
              videLibelle={t("cot.filtreResponsable")}
            />
          )}
        </div>

        {demandes.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">
              {recherche.trim() !== "" || filtreStatut || filtreUrgence || filtreResponsable
                ? t("cot.aucunResultat")
                : t("cot.videTitre")}
            </div>
            {recherche.trim() === "" && !filtreStatut && !filtreUrgence && !filtreResponsable && (
              <p className="empty-text" style={{ margin: 0 }}>
                {droits.traiter
                  ? t("cot.videTraitant")
                  : droits.superviser
                    ? t("cot.videSuperviseur")
                    : t("cot.videCommercial")}
              </p>
            )}
          </div>
        ) : (
          <div className="cot-tableau">
            <table className="table-nue">
              <thead>
                <tr>
                  <th>{t("cot.colReference")}</th>
                  <th>{t("cot.colObjet")}</th>
                  <th>{t("cot.colUrgence")}</th>
                  <th>{t("cot.colStatut")}</th>
                  <th>{t("cot.colResponsable")}</th>
                  <th className="td-date">{t("cot.colEcheance")}</th>
                  <th />
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
                      {/* Le client, puis le demandeur quand la file en mélange
                          plusieurs. En colonne, ils auraient fait deux
                          colonnes de plus sur un tableau qui en compte déjà
                          sept ; sous l'objet, ils se lisent d'un seul regard
                          avec lui. */}
                      <span className="cot-sous-ligne">
                        {droits.fileGlobale ? `${d.clientNom} · ${d.commercialNom}` : d.clientNom}
                        {d.pieces.length > 0 && (
                          <span className="cot-trombone" title={t("cot.piecesJointes")}>
                            <IconPaperclip size={12} />
                            {nombre(d.pieces.length)}
                          </span>
                        )}
                      </span>
                    </td>
                    <td>
                      {d.urgence ? (
                        <span className={`pill pill-urg-${d.urgence.toLowerCase()}`}>
                          {libelleUrgence(d.urgence)}
                        </span>
                      ) : (
                        <span className="muted-3">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`pill pill-cot-${d.statut.toLowerCase()}`}>
                        {libelleStatut(d.statut)}
                      </span>
                    </td>
                    <td>
                      {d.responsableNom ? (
                        <span className="cot-qui">
                          <span className="cot-qui-pastille">{initiale(d.responsableNom)}</span>
                          <span className="cot-qui-nom">{d.responsableNom}</span>
                          {/* Affectée mais pas entamée : le point qui manquait. */}
                          {d.enAttenteDePriseEnCharge && (
                            <span className="cot-qui-attente" title={t("cot.aPrendreEnCharge")}>
                              <IconClock size={13} />
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="muted-3">{t("cot.nonAffectee")}</span>
                      )}
                    </td>
                    <td className={`td-date${d.enRetard ? " cot-retard" : ""}`}>
                      {echeanceTexte(d)}
                    </td>
                    <td className="cot-voir">
                      <span>
                        {t("cot.voir")}
                        <IconArrowRight size={14} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Les dossiers repris. Section à part, et non une pastille de plus sur
          la ligne : une reprise n'est pas un état du dossier, c'est un coût
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
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => ouvrirDetail(d)}>
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
                  <span className="cot-reprise-avatar">{initiale(d.commercialNom)}</span>
                  <div className="cot-reprise-colonne">
                    <span className="cot-reprise-nom">{d.commercialNom}</span>
                    <span className="cot-reprise-detail">{d.clientNom}</span>
                  </div>
                  <div className="cot-reprise-colonne">
                    <span className="cot-reprise-detail">{t("cot.colObjet")}</span>
                    <span className="cot-reprise-nom">{d.objet}</span>
                  </div>
                  <div className="cot-reprise-colonne">
                    <span className="cot-reprise-detail">{t("cot.responsable")}</span>
                    <span className="cot-reprise-nom">{d.responsableNom ?? "—"}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <p className="cot-pied-page">
        <IconClock size={14} />
        {t("cot.majAuto")}
      </p>
    </>
  );
}
