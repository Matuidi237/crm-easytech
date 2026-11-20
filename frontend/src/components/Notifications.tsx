import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Notification,
  fetchNotifications,
  marquerAvisLu,
  marquerTousAvisLus,
} from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { IconBell, IconCheck, IconInbox } from "./Icons";

/* Les avis arrivent par interrogation périodique. Une liaison permanente
   serait plus élégante, mais elle demanderait un canal temps réel sur le
   serveur pour un gain qui se compte en secondes sur des événements qui se
   produisent quelques fois par jour. */
const PERIODE_MS = 60_000;

/**
 * La cloche et sa liste, dans la barre du haut.
 *
 * Le texte des avis n'est pas stocké en base : le serveur envoie un type
 * stable et ses valeurs, la phrase se compose ici. Un avis écrit en français
 * au moment de l'émission ne se relirait jamais en anglais.
 */
export default function Notifications() {
  const { t, dateHeure } = useLangue();
  const naviguer = useNavigate();
  const [avis, setAvis] = useState<Notification[]>([]);
  const [nonLus, setNonLus] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);

  const recharger = useCallback(() => {
    fetchNotifications()
      .then(({ avis, nonLus }) => {
        setAvis(avis);
        setNonLus(nonLus);
      })
      /* Silence volontaire : la cloche est un confort, et un message d'erreur
         en travers de la barre du haut gênerait un travail qui n'a rien à
         voir avec elle. */
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    recharger();
    const minuteur = window.setInterval(recharger, PERIODE_MS);
    return () => window.clearInterval(minuteur);
  }, [recharger]);

  /* Un panneau qui ne se referme qu'en rouvrant le même bouton finit toujours
     par rester ouvert derrière un autre écran. */
  useEffect(() => {
    if (!ouvert) return;
    function auClic(e: MouseEvent) {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false);
    }
    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") setOuvert(false);
    }
    window.addEventListener("mousedown", auClic);
    window.addEventListener("keydown", auClavier);
    return () => {
      window.removeEventListener("mousedown", auClic);
      window.removeEventListener("keydown", auClavier);
    };
  }, [ouvert]);

  /** Compose la phrase. La clé manquante retombe sur le type, jamais sur du vide. */
  function phrase(a: Notification): string {
    return t(`notif.${a.type}` as CleTraduction, a.donnees ?? undefined);
  }

  async function ouvrirAvis(a: Notification) {
    setOuvert(false);
    if (!a.lueLe) {
      /* L'état local change tout de suite : attendre le serveur pour éteindre
         la pastille donnerait l'impression que le clic n'a rien fait. */
      setAvis((liste) => liste.map((x) => (x.id === a.id ? { ...x, lueLe: new Date().toISOString() } : x)));
      setNonLus((n) => Math.max(0, n - 1));
      await marquerAvisLu(a.id).catch(() => undefined);
    }
    if (a.lien) naviguer(a.lien);
  }

  async function toutMarquer() {
    const maintenant = new Date().toISOString();
    setAvis((liste) => liste.map((x) => (x.lueLe ? x : { ...x, lueLe: maintenant })));
    setNonLus(0);
    await marquerTousAvisLus().catch(() => undefined);
    recharger();
  }

  return (
    <div className="avis" ref={boite}>
      <button
        type="button"
        className="icon-btn avis-cloche"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-label={
          nonLus > 0
            ? t("notif.nNonLus", { n: String(nonLus) })
            : t("notif.titre")
        }
        title={t("notif.titre")}
      >
        <IconBell size={18} />
        {/* Le nombre et non une simple pastille : « trois avis » et « un
            avis » n'appellent pas le même empressement. */}
        {nonLus > 0 && <span className="avis-compteur">{nonLus > 9 ? "9+" : nonLus}</span>}
      </button>

      {ouvert && (
        <div className="avis-panneau" role="dialog" aria-label={t("notif.titre")}>
          <header className="avis-tete">
            <span className="avis-titre">{t("notif.titre")}</span>
            {nonLus > 0 && (
              <button type="button" className="avis-tout-lu" onClick={toutMarquer}>
                <IconCheck size={14} />
                {t("notif.toutMarquer")}
              </button>
            )}
          </header>

          {avis.length === 0 ? (
            <div className="avis-vide">
              <IconInbox size={22} />
              <span>{t("notif.aucun")}</span>
            </div>
          ) : (
            <ul className="avis-liste">
              {avis.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={`avis-ligne${a.lueLe ? "" : " non-lu"}`}
                    onClick={() => ouvrirAvis(a)}
                  >
                    <span className="avis-texte">{phrase(a)}</span>
                    <span className="avis-date">{dateHeure(a.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
