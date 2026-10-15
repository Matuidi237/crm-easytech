/**
 * Teintes et formats des activités d'une feuille de temps.
 *
 * Les activités sont du texte libre : leur couleur ne peut donc plus être
 * écrite en dur à côté d'un code. Elle est tirée du libellé lui-même, ce qui
 * donne à « Prospection » la même teinte partout, du calendrier à la feuille
 * de temps, sans que personne ait à la déclarer.
 */

/**
 * Palette des activités.
 *
 * Reprise telle quelle de l'ancienne table par code, donc déjà éprouvée à
 * l'écran : douze teintes assez éloignées pour que deux activités voisines ne
 * se confondent pas. La couleur ne porte jamais seule l'information, le
 * libellé est toujours écrit à côté.
 */
const PALETTE = [
  "#1f86c8",
  "#0c8074",
  "#7c4dcc",
  "#c07a00",
  "#a33d5b",
  "#2a9fd6",
  "#12a594",
  "#9b5de5",
  "#d97706",
  "#6b6462",
  "#8a8582",
  "#9a9290",
];

/** Minuscules sans accents : « Démonstration » et « demonstration » sont une. */
function comparable(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Teinte stable d'un libellé.
 *
 * Un hachage simple suffit : on ne cherche pas à répartir idéalement, mais à
 * ce que le même mot donne toujours la même couleur, d'un écran à l'autre et
 * d'une session à l'autre.
 */
export function teinteActivite(activite: string): string {
  const texte = comparable(activite);
  let h = 0;
  for (let i = 0; i < texte.length; i++) {
    h = (h * 31 + texte.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

/** « 09:00 » depuis des minutes écoulées depuis minuit. */
export function enHeure(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Lit « 09:00 », et rien d'autre : c'est ce que rend un champ de type time. */
export function depuisHeure(valeur: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(valeur.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Durée en toutes lettres : « 1 h 30 ».
 *
 * Forme longue et non « 1:30 » : une durée isolée se lit, elle ne s'aligne
 * pas en colonne, et « 1:30 » se confond avec une heure de la journée.
 */
export function dureeLongue(minutes: number): string {
  const signe = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${signe}${m} min`;
  return m === 0 ? `${signe}${h} h` : `${signe}${h} h ${String(m).padStart(2, "0")}`;
}

/** Clé « 2026-10-15 » d'une date locale, sans passer par UTC. */
export function cleJour(d: Date): string {
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${String(d.getDate()).padStart(2, "0")}`;
}
