import { useEffect, useRef, useState } from "react";
import {
  COULEURS_NOTE,
  CouleurNote,
  Note,
  SuggestionClient,
  creerNote,
  epinglerNote,
  fetchNotes,
  modifierNote,
  supprimerNote,
} from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import ChampClient from "./ChampClient";
import { IconAlert, IconCheck, IconClose, IconPlus, IconTag, IconTrash } from "./Icons";

const BROUILLON = {
  id: null as string | null,
  texte: "",
  couleur: "JAUNE" as CouleurNote,
  epinglee: false,
  clientId: null as string | null,
  clientNom: "",
};

/**
 * Notes de la journée, façon pense-bête.
 *
 * Ce qui décide d'une vente tient rarement dans un créneau horaire : « le DAF
 * veut une remise avant de signer », « rappeler après le conseil du 12 ». Ces
 * phrases-là n'ont ni durée ni activité, et se perdent si l'outil n'offre pas
 * où les écrire.
 *
 * Une note épinglée reste affichée sur toutes les journées jusqu'à ce qu'on
 * la décroche : un point ouvert dans un cycle de vente doit rester sous les
 * yeux, et non attendre qu'on retrouve le jour où on l'a noté.
 */
export default function NotesDuJour({ jour }: { jour: string }) {
  const { t, date } = useLangue();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [brouillon, setBrouillon] = useState(BROUILLON);
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const champTexte = useRef<HTMLTextAreaElement>(null);

  function recharger() {
    fetchNotes(jour)
      .then(setNotes)
      .catch((e) => setErreur(e.message));
  }

  useEffect(() => {
    setNotes(null);
    setOuvert(false);
    setBrouillon(BROUILLON);
    recharger();
  }, [jour]);

  /* Le curseur arrive dans le texte : une note s'écrit, le reste n'est qu'un
     réglage qu'on ne touche souvent pas. */
  useEffect(() => {
    if (ouvert) champTexte.current?.focus();
  }, [ouvert]);

  function ouvrirEdition(n: Note) {
    setBrouillon({
      id: n.id,
      texte: n.texte,
      couleur: n.couleur,
      epinglee: n.epinglee,
      clientId: n.clientId,
      clientNom: n.clientNom ?? "",
    });
    setOuvert(true);
    setErreur(null);
  }

  async function enregistrer() {
    const texte = brouillon.texte.trim();
    if (!texte) return;
    setErreur(null);
    setEnvoi(true);
    const charge = {
      texte,
      couleur: brouillon.couleur,
      epinglee: brouillon.epinglee,
      clientId: brouillon.clientId,
    };
    try {
      if (brouillon.id) await modifierNote(brouillon.id, charge);
      else await creerNote({ ...charge, jour });
      setOuvert(false);
      setBrouillon(BROUILLON);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  async function basculerEpingle(n: Note) {
    setErreur(null);
    try {
      await epinglerNote(n.id, !n.epinglee);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function retirer(n: Note) {
    if (!confirm(t("pl.confirmerSuppressionNote"))) return;
    setErreur(null);
    try {
      await supprimerNote(n.id);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  return (
    <section className="panneau">
      <header className="panneau-tete">
        <h2>{t("pl.notesTitre")}</h2>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setBrouillon(BROUILLON);
            setOuvert(true);
            setErreur(null);
          }}
          disabled={ouvert}
        >
          <IconPlus size={15} />
          {t("pl.ajouterNote")}
        </button>
      </header>

      {erreur && (
        <div className="alert alert-error" style={{ marginBottom: 14 }}>
          <IconAlert />
          {erreur}
        </div>
      )}

      {ouvert && (
        <div className={`note-saisie couleur-${brouillon.couleur.toLowerCase()}`}>
          <textarea
            ref={champTexte}
            className="note-texte"
            rows={3}
            value={brouillon.texte}
            onChange={(e) => setBrouillon((b) => ({ ...b, texte: e.target.value }))}
            placeholder={t("pl.notePlaceholder")}
            maxLength={800}
            /* Entrée valide, Maj+Entrée va à la ligne : on écrit une note
               courte bien plus souvent qu'un paragraphe. */
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enregistrer();
              }
              if (e.key === "Escape") {
                setOuvert(false);
                setBrouillon(BROUILLON);
              }
            }}
          />

          <div className="note-reglages">
            <div className="note-couleurs" role="radiogroup" aria-label={t("pl.couleurNote")}>
              {COULEURS_NOTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={brouillon.couleur === c}
                  aria-label={t(`couleur.${c}` as CleTraduction)}
                  title={t(`couleur.${c}` as CleTraduction)}
                  className={`note-pastille couleur-${c.toLowerCase()}${brouillon.couleur === c ? " on" : ""}`}
                  onClick={() => setBrouillon((b) => ({ ...b, couleur: c }))}
                />
              ))}
            </div>

            <label className="note-epingle-choix">
              <input
                type="checkbox"
                checked={brouillon.epinglee}
                onChange={(e) => setBrouillon((b) => ({ ...b, epinglee: e.target.checked }))}
              />
              {t("pl.epinglerNote")}
            </label>
          </div>

          <div className="note-client field">
            <ChampClient
              valeur={brouillon.clientNom}
              onChange={(nom) => setBrouillon((b) => ({ ...b, clientNom: nom, clientId: null }))}
              onChoisir={(c: SuggestionClient) =>
                setBrouillon((b) => ({ ...b, clientNom: c.nom, clientId: c.id }))
              }
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOuvert(false);
                setBrouillon(BROUILLON);
              }}
            >
              <IconClose size={15} />
              {t("commun.annuler")}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={enregistrer}
              disabled={envoi || brouillon.texte.trim() === ""}
            >
              <IconCheck size={15} />
              {envoi ? t("ag.ajoutEnCours") : t("commun.enregistrer")}
            </button>
          </div>
        </div>
      )}

      {notes === null ? (
        <p className="panneau-vide">{t("commun.chargementDonnees")}</p>
      ) : notes.length === 0 ? (
        !ouvert && <p className="panneau-vide">{t("pl.aucuneNote")}</p>
      ) : (
        <ul className="notes">
          {notes.map((n) => (
            <li
              key={n.id}
              className={`note couleur-${n.couleur.toLowerCase()}${n.epinglee ? " epinglee" : ""}`}
            >
              {/* L'épingle est un bouton sur la note elle-même : c'est le
                  geste le plus courant, il ne passe pas par l'édition. */}
              <button
                type="button"
                className={`note-epingle${n.epinglee ? " on" : ""}`}
                onClick={() => basculerEpingle(n)}
                title={n.epinglee ? t("pl.decrocherNote") : t("pl.epinglerNote")}
                aria-label={n.epinglee ? t("pl.decrocherNote") : t("pl.epinglerNote")}
                aria-pressed={n.epinglee}
              >
                <IconTag size={14} />
              </button>

              <button
                type="button"
                className="note-corps"
                onClick={() => ouvrirEdition(n)}
                title={t("commun.modifier")}
              >
                <span className="note-contenu">{n.texte}</span>
              </button>

              <div className="note-pied">
                <span className="note-meta">
                  {n.clientNom && <span className="note-client-nom">{n.clientNom}</span>}
                  {/* La date n'apparaît que sur une note épinglée : sur les
                      autres, c'est le jour affiché, et la répéter n'apprend
                      rien. */}
                  {n.epinglee && <span className="note-date">{date(n.jour)}</span>}
                </span>
                <button
                  type="button"
                  className="note-supprimer"
                  onClick={() => retirer(n)}
                  aria-label={t("commun.supprimer")}
                  title={t("commun.supprimer")}
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
