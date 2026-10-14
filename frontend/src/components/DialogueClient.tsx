import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Client, ErreurDoublon, Facets, createClient, updateClient } from "../api";
import { useLangue } from "../i18n";
import ListeDeroulante from "./ListeDeroulante";
import { IconAlert, IconChevronDown, IconClose } from "./Icons";

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
 * Création et modification d'une fiche client.
 *
 * Le formulaire est découpé en deux : ce qu'on sait toujours au moment de
 * créer la fiche, et le reste. Les dix champs présentés à plat donnaient un
 * mur où rien ne se détachait, alors qu'un seul est obligatoire ; la
 * deuxième moitié se replie donc, et s'ouvre d'elle-même en modification,
 * quand elle est déjà remplie.
 *
 * Les listes de pays, villes et secteurs sont dessinées par l'application et
 * non par le système : les listes natives s'ouvrent en noir sur un poste
 * réglé en thème sombre, au milieu d'une interface claire.
 */
export default function DialogueClient({
  facets,
  client,
  onFermer,
  onEnregistre,
}: {
  /** Valeurs déjà présentes en base, proposées pour éviter les variantes. */
  facets: Facets;
  /** Renseigné, le dialogue modifie la fiche au lieu d'en créer une. */
  client?: Client | null;
  onFermer: () => void;
  onEnregistre: (client: Client, creation: boolean) => void;
}) {
  const { t } = useLangue();
  const modification = !!client;

  const [form, setForm] = useState(() =>
    client
      ? {
          nom: client.nom ?? "",
          pays: client.pays ?? "",
          ville: client.ville ?? "",
          secteurActivite: client.secteurActivite ?? "",
          nomContactInterne: client.nomContactInterne ?? "",
          emailContact: client.emailContact ?? "",
          telephone: client.telephone ?? "",
          siteWeb: client.siteWeb ?? "",
          adressePhysique: client.adressePhysique ?? "",
          notes: client.notes ?? "",
        }
      : VIDE
  );
  /* Déplié d'emblée en modification : replier des champs déjà renseignés les
     cacherait à qui vient précisément les corriger. */
  const [details, setDetails] = useState(
    modification &&
      !!(client?.siteWeb || client?.adressePhysique || client?.notes || client?.nomContactInterne)
  );
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [doublon, setDoublon] = useState<NonNullable<ErreurDoublon["doublon"]> | null>(null);

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
    setDoublon(null);
    setEnvoi(true);
    try {
      const enregistre = modification ? await updateClient(client!.id, form) : await createClient(form);
      onEnregistre(enregistre, !modification);
    } catch (err) {
      /* Le doublon n'est pas une erreur de saisie mais un fait à constater :
         il mérite son propre encart, avec le nom trouvé et, si la fiche est
         visible, le moyen d'y aller. */
      const d = (err as ErreurDoublon).doublon;
      if (d) setDoublon(d);
      else setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onFermer}>
      <form className="modal modal-client" onClick={(e) => e.stopPropagation()} onSubmit={envoyer}>
        <header className="modal-client-tete">
          <div>
            <h3>{modification ? t("clients.modifierTitre") : t("clients.nouveauTitre")}</h3>
            <p className="modal-sub">
              {modification ? t("clients.modifierSousTitre") : t("clients.nouveauSousTitre")}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onFermer} aria-label={t("commun.annuler")}>
            <IconClose size={18} />
          </button>
        </header>

        <div className="modal-client-corps">
          {erreur && (
            <div className="alert alert-error">
              <IconAlert />
              {erreur}
            </div>
          )}

          {doublon && (
            <div className="alert alert-warn">
              <IconAlert />
              <div>
                <strong>{t("clients.doublonTitre")}</strong>
                <div style={{ marginTop: 3 }}>
                  {doublon.nomExistant}
                  {" · "}
                  {doublon.id ? t("clients.doublonChezVous") : t("clients.doublonAilleurs")}
                </div>
                {doublon.id && (
                  <Link
                    to={`/clients?recherche=${encodeURIComponent(doublon.nomExistant)}`}
                    className="link-action"
                  >
                    {t("clients.doublonVoir")}
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* L'essentiel : le nom, puis ce qui alimente les ventilations. */}
          <div className="field field-vedette">
            <label htmlFor="nc-nom">{t("clients.colClient")}</label>
            <input
              id="nc-nom"
              value={form.nom}
              onChange={(e) => champ("nom", e.target.value)}
              placeholder={t("clients.nouveauNomPlaceholder")}
              autoFocus
              required
            />
            <div className="field-hint">{t("clients.nomAide")}</div>
          </div>

          <div className="form-grid form-grid-trois">
            <div className="field">
              <label htmlFor="nc-pays">{t("clients.filtrePays")}</label>
              <ListeDeroulante
                id="nc-pays"
                valeur={form.pays}
                options={facets.pays}
                onChange={(v) => champ("pays", v)}
                placeholder={t("clients.paysPlaceholder")}
                libre
              />
            </div>
            <div className="field">
              <label htmlFor="nc-ville">{t("clients.filtreVille")}</label>
              <ListeDeroulante
                id="nc-ville"
                valeur={form.ville}
                options={facets.villes}
                onChange={(v) => champ("ville", v)}
                placeholder={t("clients.villePlaceholder")}
                libre
              />
            </div>
            <div className="field">
              <label htmlFor="nc-secteur">{t("clients.filtreSecteur")}</label>
              <ListeDeroulante
                id="nc-secteur"
                valeur={form.secteurActivite}
                options={facets.secteurs}
                onChange={(v) => champ("secteurActivite", v)}
                placeholder={t("clients.secteurPlaceholder")}
                libre
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="nc-email">{t("clients.nouveauEmail")}</label>
              <input
                id="nc-email"
                type="email"
                value={form.emailContact}
                onChange={(e) => champ("emailContact", e.target.value)}
                placeholder="contact@entreprise.cm"
              />
            </div>
            <div className="field">
              <label htmlFor="nc-tel">{t("clients.nouveauTelephone")}</label>
              <input
                id="nc-tel"
                value={form.telephone}
                onChange={(e) => champ("telephone", e.target.value)}
                placeholder="+237 6 00 00 00 00"
              />
            </div>
          </div>

          {/* Le reste se replie : un seul champ est obligatoire, et dix
              présentés à plat donnaient un mur où rien ne se détachait. */}
          <button
            type="button"
            className={`modal-replier${details ? " ouvert" : ""}`}
            onClick={() => setDetails((d) => !d)}
            aria-expanded={details}
          >
            <IconChevronDown size={15} />
            {details ? t("clients.moinsDeDetails") : t("clients.plusDeDetails")}
          </button>

          {details && (
            <div className="modal-details">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="nc-contact">{t("clients.nouveauContact")}</label>
                  <input
                    id="nc-contact"
                    value={form.nomContactInterne}
                    onChange={(e) => champ("nomContactInterne", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="nc-site">{t("clients.nouveauSite")}</label>
                  <input
                    id="nc-site"
                    value={form.siteWeb}
                    onChange={(e) => champ("siteWeb", e.target.value)}
                    placeholder="https://"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="nc-adresse">{t("clients.nouveauAdresse")}</label>
                <input
                  id="nc-adresse"
                  value={form.adressePhysique}
                  onChange={(e) => champ("adressePhysique", e.target.value)}
                />
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
            </div>
          )}
        </div>

        <footer className="modal-client-pied">
          <button type="button" className="btn btn-ghost" onClick={onFermer}>
            {t("commun.annuler")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={envoi || !form.nom.trim()}>
            {envoi
              ? t("clients.nouveauEnCours")
              : modification
                ? t("commun.enregistrer")
                : t("clients.nouveauValider")}
          </button>
        </footer>
      </form>
    </div>
  );
}
