import { FormEvent, useEffect, useState } from "react";
import { Client, Facets, createClient } from "../api";
import { useLangue } from "../i18n";
import { IconAlert } from "../components/Icons";

const VIDE = {
  nom: "",
  pays: "",
  ville: "",
  secteurActivite: "",
  nomContactInterne: "",
  emailContact: "",
  telephone: "",
  siteWeb: "",
  adressePhysique: "",
  notes: "",
};

/**
 * Création d'une fiche client, une à la fois.
 *
 * L'import de fichier couvre l'arrivée d'un lot ; il ne couvre pas le cas le
 * plus fréquent, qui est le prospect rencontré hier. Devoir fabriquer un
 * tableur pour saisir une ligne décourage la saisie, et une base qui n'est
 * pas tenue à jour cesse d'être consultée.
 *
 * Seul le nom est exigé. Le reste se complète au fil des échanges, et bloquer
 * sur un numéro de téléphone inconnu ferait perdre la fiche entière.
 */
export default function DialogueClient({
  facets,
  onFermer,
  onCree,
}: {
  /** Valeurs déjà présentes en base, proposées pour éviter les variantes. */
  facets: Facets;
  onFermer: () => void;
  onCree: (client: Client) => void;
}) {
  const { t } = useLangue();
  const [form, setForm] = useState(VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") onFermer();
    }
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [onFermer]);

  const champ = (cle: keyof typeof VIDE, valeur: string) => setForm((f) => ({ ...f, [cle]: valeur }));

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      onCree(await createClient(form));
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onFermer}>
      <form className="modal modal-large" onClick={(e) => e.stopPropagation()} onSubmit={envoyer}>
        <h3>{t("clients.nouveauTitre")}</h3>
        <p className="modal-sub">{t("clients.nouveauSousTitre")}</p>

        {erreur && (
          <div className="alert alert-error">
            <IconAlert />
            {erreur}
          </div>
        )}

        <div className="field">
          <label htmlFor="nc-nom">{t("clients.colClient")}</label>
          <input
            id="nc-nom"
            value={form.nom}
            onChange={(e) => champ("nom", e.target.value)}
            placeholder={t("clients.nouveauNomPlaceholder")}
            autoFocus
            required
          />
        </div>

        {/* Les trois champs qui alimentent les ventilations : ils viennent
            avant les coordonnées, parce qu'ils manquent plus souvent et
            coûtent plus cher à retrouver après coup. */}
        <div className="form-grid form-grid-trois">
          <div className="field">
            <label htmlFor="nc-pays">{t("clients.filtrePays")}</label>
            {/* Les valeurs déjà en base sont proposées : « Côte d'Ivoire » et
                « Cote dIvoire » feraient deux parts dans le même graphique. */}
            <input id="nc-pays" list="nc-pays-connus" value={form.pays} onChange={(e) => champ("pays", e.target.value)} />
            <datalist id="nc-pays-connus">
              {facets.pays.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="nc-ville">{t("clients.filtreVille")}</label>
            <input
              id="nc-ville"
              list="nc-villes-connues"
              value={form.ville}
              onChange={(e) => champ("ville", e.target.value)}
            />
            <datalist id="nc-villes-connues">
              {facets.villes.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="nc-secteur">{t("clients.filtreSecteur")}</label>
            <input
              id="nc-secteur"
              list="nc-secteurs-connus"
              value={form.secteurActivite}
              onChange={(e) => champ("secteurActivite", e.target.value)}
            />
            <datalist id="nc-secteurs-connus">
              {facets.secteurs.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="form-grid form-grid-trois">
          <div className="field">
            <label htmlFor="nc-contact">{t("clients.nouveauContact")}</label>
            <input
              id="nc-contact"
              value={form.nomContactInterne}
              onChange={(e) => champ("nomContactInterne", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="nc-email">{t("clients.nouveauEmail")}</label>
            <input
              id="nc-email"
              type="email"
              value={form.emailContact}
              onChange={(e) => champ("emailContact", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="nc-tel">{t("clients.nouveauTelephone")}</label>
            <input id="nc-tel" value={form.telephone} onChange={(e) => champ("telephone", e.target.value)} />
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="nc-site">{t("clients.nouveauSite")}</label>
            <input
              id="nc-site"
              value={form.siteWeb}
              onChange={(e) => champ("siteWeb", e.target.value)}
              placeholder="https://"
            />
          </div>
          <div className="field">
            <label htmlFor="nc-adresse">{t("clients.nouveauAdresse")}</label>
            <input
              id="nc-adresse"
              value={form.adressePhysique}
              onChange={(e) => champ("adressePhysique", e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="nc-notes">{t("clients.nouveauNotes")}</label>
          <textarea
            id="nc-notes"
            rows={3}
            value={form.notes}
            onChange={(e) => champ("notes", e.target.value)}
            placeholder={t("clients.nouveauNotesPlaceholder")}
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onFermer}>
            {t("commun.annuler")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={envoi || !form.nom.trim()}>
            {envoi ? t("clients.nouveauEnCours") : t("clients.nouveauValider")}
          </button>
        </div>
      </form>
    </div>
  );
}
