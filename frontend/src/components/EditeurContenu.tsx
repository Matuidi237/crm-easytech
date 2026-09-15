import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import {
  IconBox,
  IconExternal,
  IconImport,
  IconMail,
} from "./Icons";

/** Poids au-delà duquel une image ne doit pas entrer dans le contenu. */
const POIDS_MAX_IMAGE = 400 * 1024;

type Props = {
  valeur: string;
  onChange: (html: string) => void;
  placeholder: string;
};

/**
 * Éditeur de contenu d'une campagne : texte mis en forme, images et GIF.
 *
 * Volontairement sans bibliothèque : le besoin tient en six commandes, et une
 * dépendance d'édition riche pèse plus lourd que tout le reste de
 * l'application.
 *
 * Les images insérées depuis le poste sont encodées dans le contenu lui-même.
 * C'est tenable pour un visuel léger, pas pour une image de plusieurs méga :
 * d'où le plafond, et le message qui renvoie vers l'insertion par adresse.
 * Un vrai hébergement d'images est à prévoir en même temps que le SMTP.
 */
export default function EditeurContenu({ valeur, onChange, placeholder }: Props) {
  const t = useT();
  const zone = useRef<HTMLDivElement>(null);
  const fichierRef = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [vide, setVide] = useState(true);

  /* Le HTML n'est réinjecté que s'il diffère de ce que porte déjà la zone :
     réécrire à chaque frappe replacerait le curseur au début. */
  useEffect(() => {
    if (zone.current && zone.current.innerHTML !== valeur) {
      zone.current.innerHTML = valeur;
      setVide(zone.current.textContent?.trim() === "" && !zone.current.querySelector("img"));
    }
  }, [valeur]);

  function publier() {
    if (!zone.current) return;
    onChange(zone.current.innerHTML);
    setVide(zone.current.textContent?.trim() === "" && !zone.current.querySelector("img"));
  }

  /* document.execCommand est officiellement déprécié mais reste la seule API
     d'édition disponible dans tous les navigateurs. Son remplaçant n'existe
     pas encore : la remplacer supposerait de réécrire un moteur d'édition. */
  function commande(nom: string, valeurCommande?: string) {
    zone.current?.focus();
    document.execCommand(nom, false, valeurCommande);
    publier();
  }

  function insererImage(src: string) {
    zone.current?.focus();
    document.execCommand("insertHTML", false, `<img src="${src}" alt="" />`);
    publier();
  }

  async function ajouterFichier(fichier: File) {
    setErreur(null);
    if (!fichier.type.startsWith("image/")) {
      setErreur(t("editeur.pasUneImage"));
      return;
    }
    if (fichier.size > POIDS_MAX_IMAGE) {
      setErreur(t("editeur.imageTropLourde", { poids: Math.round(fichier.size / 1024) }));
      return;
    }
    const lecteur = new FileReader();
    lecteur.onload = () => insererImage(String(lecteur.result));
    lecteur.readAsDataURL(fichier);
  }

  function ajouterParAdresse() {
    const url = window.prompt(t("editeur.adresseImage"));
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setErreur(t("editeur.adresseInvalide"));
      return;
    }
    setErreur(null);
    insererImage(url);
  }

  function ajouterLien() {
    const url = window.prompt(t("editeur.adresseLien"));
    if (!url) return;
    commande("createLink", url);
  }

  return (
    <div className="editeur">
      <div className="editeur-barre" role="toolbar" aria-label={t("editeur.miseEnForme")}>
        <button type="button" className="editeur-bouton" onClick={() => commande("bold")} title={t("editeur.gras")}>
          <b>B</b>
        </button>
        <button type="button" className="editeur-bouton" onClick={() => commande("italic")} title={t("editeur.italique")}>
          <i>I</i>
        </button>
        <button
          type="button"
          className="editeur-bouton"
          onClick={() => commande("formatBlock", "<h2>")}
          title={t("editeur.titre")}
        >
          H
        </button>
        <button
          type="button"
          className="editeur-bouton"
          onClick={() => commande("insertUnorderedList")}
          title={t("editeur.liste")}
        >
          ≡
        </button>

        <span className="editeur-separateur" aria-hidden />

        <button type="button" className="editeur-bouton" onClick={ajouterLien} title={t("editeur.lien")}>
          <IconMail size={15} />
        </button>
        <button
          type="button"
          className="editeur-bouton"
          onClick={() => fichierRef.current?.click()}
          title={t("editeur.imageFichier")}
        >
          <IconImport size={15} />
        </button>
        <button type="button" className="editeur-bouton" onClick={ajouterParAdresse} title={t("editeur.imageAdresse")}>
          <IconExternal size={15} />
        </button>

        <span className="editeur-separateur" aria-hidden />

        <button
          type="button"
          className="editeur-bouton"
          onClick={() => commande("removeFormat")}
          title={t("editeur.effacerMiseEnForme")}
        >
          <IconBox size={15} />
        </button>

        <input
          ref={fichierRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) ajouterFichier(f);
            e.target.value = "";
          }}
        />
      </div>

      <div
        ref={zone}
        className={`editeur-zone${vide ? " vide" : ""}`}
        contentEditable
        role="textbox"
        aria-multiline
        aria-label={placeholder}
        data-placeholder={placeholder}
        onInput={publier}
        onBlur={publier}
        /* Le collage est ramené au texte brut : coller depuis un traitement de
           texte injecte sinon des styles qui ne survivent pas aux clients de
           messagerie et cassent le rendu. */
        onPaste={(e) => {
          e.preventDefault();
          const texte = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, texte);
          publier();
        }}
      />

      {erreur && <div className="editeur-erreur">{erreur}</div>}
      <p className="editeur-aide">{t("editeur.aideImages")}</p>
    </div>
  );
}
