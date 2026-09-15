import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AnalyseDestinataires,
  CampagneResume,
  TypeCampagne,
  analyserDestinataires,
  creerCampagne,
  fetchCampagnes,
  supprimerCampagne,
} from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { useFilAriane } from "../ContexteEntete";
import EditeurContenu from "../components/EditeurContenu";
import { IconAlert, IconCheck, IconImport, IconInbox } from "../components/Icons";

const TEINTE_STATUT: Record<string, string> = {
  BROUILLON: "pill-neutral",
  PRETE: "pill-brand",
  ENVOYEE: "pill-success",
  ECHEC: "pill-danger",
};

/**
 * Composition d'une campagne, puis historique du même type.
 *
 * Deux étapes numérotées, comme la page d'import de clients : écrire, puis
 * désigner à qui. L'ordre compte, on n'adresse pas un message qu'on n'a pas
 * encore écrit.
 */
export default function ComposerCampagnePage() {
  const { type: typeUrl } = useParams<{ type: string }>();
  const type: TypeCampagne = typeUrl === "newsletter" ? "NEWSLETTER" : "MAILING";
  const { t, nombre, dateHeure } = useLangue();

  const [titre, setTitre] = useState("");
  const [objet, setObjet] = useState("");
  const [contenu, setContenu] = useState("");
  const [analyse, setAnalyse] = useState<AnalyseDestinataires | null>(null);
  const [analyseEnCours, setAnalyseEnCours] = useState(false);
  const [drag, setDrag] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [historique, setHistorique] = useState<CampagneResume[] | null>(null);
  const fichierRef = useRef<HTMLInputElement>(null);

  const titrePage = type === "NEWSLETTER" ? t("ca.newsletterTitre") : t("ca.mailingTitre");
  useFilAriane("/campagnes", t("ca.retour"), titrePage);

  function chargerHistorique() {
    fetchCampagnes(type)
      .then((r) => setHistorique(r.campagnes))
      .catch((e) => setErreur(e.message));
  }

  useEffect(() => {
    setHistorique(null);
    chargerHistorique();
    // Changer de type vide le formulaire : garder le brouillon d'un mailing
    // en passant à la newsletter mènerait à envoyer le mauvais message.
    setTitre("");
    setObjet("");
    setContenu("");
    setAnalyse(null);
    setSucces(null);
    setErreur(null);
  }, [type]);

  async function traiterFichier(fichier: File) {
    setErreur(null);
    setAnalyseEnCours(true);
    try {
      setAnalyse(await analyserDestinataires(fichier));
    } catch (e) {
      setErreur((e as Error).message);
      setAnalyse(null);
    } finally {
      setAnalyseEnCours(false);
    }
  }

  async function enregistrer() {
    if (!titre.trim() || !objet.trim()) {
      setErreur(t("ca.titreRequis"));
      return;
    }
    setEnregistrement(true);
    setErreur(null);
    try {
      const creee = await creerCampagne({
        type,
        titre,
        objet,
        contenuHtml: contenu,
        fichierSource: analyse?.fichier ?? null,
        destinataires: analyse?.destinataires ?? [],
      });
      setSucces(t("ca.creee", { titre: creee.titre }));
      setTitre("");
      setObjet("");
      setContenu("");
      setAnalyse(null);
      chargerHistorique();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnregistrement(false);
    }
  }

  async function supprimer(c: CampagneResume) {
    if (!confirm(t("ca.confirmerSuppression", { titre: c.titre }))) return;
    try {
      await supprimerCampagne(c.id);
      chargerHistorique();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{titrePage}</h1>
          <div className="page-sub">{t("ca.sousTitre")}</div>
        </div>
      </div>

      {erreur && (
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      )}
      {succes && (
        <div className="alert alert-success">
          <IconCheck />
          <div>
            <strong>{succes}</strong>
            {/* Dire tout de suite que rien ne part : croire un message envoyé
                alors qu'il dort en base est la pire issue possible. */}
            <div style={{ marginTop: 3 }}>{t("ca.envoiIndisponible")}</div>
          </div>
        </div>
      )}

      {/* Étape 1 : écrire */}
      <div className="card">
        <div className="steps">
          <span className="step-num">1</span>
          <div className="card-title">{t("ca.etape1")}</div>
        </div>

        <div className="form-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="ca-titre">{t("ca.champTitre")}</label>
            <input
              id="ca-titre"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder={t("ca.champTitrePlaceholder")}
            />
          </div>
          <div className="field">
            <label htmlFor="ca-objet">{t("ca.champObjet")}</label>
            <input
              id="ca-objet"
              value={objet}
              onChange={(e) => setObjet(e.target.value)}
              placeholder={t("ca.champObjetPlaceholder")}
            />
          </div>
        </div>

        <div className="field full">
          <label>{t("ca.champContenu")}</label>
          <EditeurContenu valeur={contenu} onChange={setContenu} placeholder={t("ca.contenuPlaceholder")} />
        </div>
      </div>

      {/* Étape 2 : à qui */}
      <div className="card">
        <div className="steps">
          <span className="step-num">2</span>
          <div className="card-title">{t("ca.etape2")}</div>
        </div>

        {!analyse ? (
          <div
            className={`dropzone${drag ? " drag" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) traiterFichier(f);
            }}
            onClick={() => fichierRef.current?.click()}
            style={{ marginTop: 14 }}
          >
            <div className="dz-icon">
              <IconImport size={22} />
            </div>
            <div className="dz-title">{analyseEnCours ? t("ca.analyse") : t("ca.deposer")}</div>
            <div className="dz-text">{t("ca.parcourir")}</div>
            <input
              ref={fichierRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) traiterFichier(f);
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          <div className="analyse" style={{ marginTop: 14 }}>
            <div className="analyse-tete">
              <div style={{ minWidth: 0 }}>
                <div className="td-strong">
                  {t("ca.resultatFichier", { fichier: analyse.fichier, lignes: nombre(analyse.lignesLues) })}
                </div>
                <div className="cc-sub">
                  {analyse.colonneEmail
                    ? t("ca.colonneRetenue", { colonne: analyse.colonneEmail })
                    : analyse.sansEntete
                      ? t("ca.sansEntete")
                      : t("ca.colonneDeduite")}
                </div>
              </div>
              <button className="link-action" onClick={() => setAnalyse(null)}>
                {t("ca.changerFichier")}
              </button>
            </div>

            <div className="analyse-chiffres">
              <span className={`pill ${analyse.nbDestinataires > 0 ? "pill-success" : "pill-danger"}`}>
                {analyse.nbDestinataires === 1
                  ? t("ca.destinataireRetenu")
                  : t("ca.destinatairesRetenus", { n: nombre(analyse.nbDestinataires) })}
              </span>
              {/* Ce qui a été écarté est annoncé : une liste silencieusement
                  amputée de moitié se découvre trop tard. */}
              {analyse.rejetees > 0 && (
                <span className="pill pill-warn">
                  {analyse.rejetees === 1 ? t("ca.rejeteeUne") : t("ca.rejetees", { n: nombre(analyse.rejetees) })}
                </span>
              )}
            </div>

            {analyse.nbDestinataires === 0 ? (
              <div className="alert alert-warn" style={{ marginTop: 14 }}>
                <IconAlert />
                {t("ca.aucunDestinataire")}
              </div>
            ) : (
              <>
                <div className="partenaire-etiquette" style={{ marginTop: 16 }}>
                  {t("ca.apercuDestinataires")}
                </div>
                <ul className="apercu-destinataires">
                  {analyse.apercu.map((d) => (
                    <li key={d.email}>
                      <span className="destinataire-email">{d.email}</span>
                      {d.nom && <span className="destinataire-nom">{d.nom}</span>}
                    </li>
                  ))}
                </ul>
                {analyse.nbDestinataires > analyse.apercu.length && (
                  <div className="cc-sub">
                    {t("ca.etAutres", { n: nombre(analyse.nbDestinataires - analyse.apercu.length) })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="form-actions">
          <button className="btn btn-primary" onClick={enregistrer} disabled={enregistrement}>
            {enregistrement ? t("ca.enregistrement") : t("ca.enregistrer")}
          </button>
        </div>
      </div>

      {/* Historique du même type */}
      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("ca.historiqueTitre")}</div>
            <div className="card-sub">
              {historique === null
                ? t("commun.chargement")
                : historique.length === 1
                  ? t("ca.campagnesUne")
                  : t("ca.campagnesN", { n: nombre(historique.length) })}
            </div>
          </div>
        </div>

        {historique === null ? (
          <p className="muted-3" style={{ margin: 0, padding: 20 }}>
            {t("commun.chargement")}
          </p>
        ) : historique.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("ca.historiqueVideTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("ca.historiqueVideTexte")}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("ca.colCampagne")}</th>
                  <th>{t("ca.colStatut")}</th>
                  <th>{t("ca.colDestinataires")}</th>
                  <th>{t("ca.colSource")}</th>
                  <th>{t("ca.colAuteur")}</th>
                  <th>{t("ca.colDate")}</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {historique.map((c) => (
                  <tr key={c.id}>
                    <td className="td-main">
                      <div className="cc-name">{c.titre}</div>
                      <div className="cc-sub">{c.objet}</div>
                    </td>
                    <td data-label={t("ca.colStatut")}>
                      <span className={`pill ${TEINTE_STATUT[c.statut] ?? "pill-neutral"}`}>
                        {t(`statutCampagne.${c.statut}` as CleTraduction)}
                      </span>
                    </td>
                    <td className="num" data-label={t("ca.colDestinataires")}>
                      {nombre(c.nbDestinataires)}
                    </td>
                    <td data-label={t("ca.colSource")}>
                      {c.fichierSource ?? <span className="muted-3">{t("ca.sansFichier")}</span>}
                    </td>
                    <td data-label={t("ca.colAuteur")}>{c.creeParNom}</td>
                    <td data-label={t("ca.colDate")}>{dateHeure(c.createdAt)}</td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <button className="link-action danger" onClick={() => supprimer(c)}>
                          {t("ca.supprimer")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
