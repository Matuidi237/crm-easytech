import { useState } from "react";
import type { Repartition } from "../api";
import { useLangue } from "../i18n";

/* Rampe ordinale centrée sur le bleu du logo, définie une seule fois dans styles.css
   (tokens --viz-*). Le plus grand segment porte le pas le plus sombre ; la traîne
   passe en gris neutre. */
const RAMP = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)"];
const REST = "var(--viz-rest)";

type Tip = { x: number; y: number; title: string; detail: string } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }}>
      <b>{tip.title}</b>
      <br />
      {tip.detail}
    </div>
  );
}

/* « libelleReste » porte le libellé du repli, traduit par l'appelant : ce
   module ne connaît pas la langue de la page qui l'affiche. */
export function foldTail(data: Repartition[], keep: number, libelleReste = "Autres"): Repartition[] {
  if (data.length <= keep) return data;
  const reste = data.slice(keep).reduce((s, d) => s + d.count, 0);
  const head = data.slice(0, keep);
  return reste > 0 ? [...head, { label: libelleReste, count: reste }] : head;
}

/* ---------------------------------------------------------------- Barres */

export function BarList({ data, total, unite }: { data: Repartition[]; total: number; unite?: string }) {
  const { t } = useLangue();
  const [tip, setTip] = useState<Tip>(null);
  const uniteLabel = unite ?? t("viz.uniteClients");
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <>
      <div className="bars">
        {data.map((d) => {
          const part = total > 0 ? Math.round((d.count / total) * 100) : 0;
          return (
            <div
              className="bar-row"
              key={d.label}
              onMouseMove={(e) =>
                setTip({
                  x: e.clientX,
                  y: e.clientY,
                  title: d.label,
                  detail: t("viz.detailBarre", { n: d.count, unite: uniteLabel, part }),
                })
              }
              onMouseLeave={() => setTip(null)}
            >
              <span className="bar-label" title={d.label}>
                {d.label}
              </span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(d.count / max) * 100}%` }} />
              </div>
              <span className="bar-value">{d.count}</span>
            </div>
          );
        })}
      </div>
      <Tooltip tip={tip} />
    </>
  );
}

/* ----------------------------------------------------------------- Donut */

export function Donut({ data, centerLabel }: { data: Repartition[]; centerLabel?: string }) {
  const { t, nombre } = useLangue();
  const [tip, setTip] = useState<Tip>(null);
  const labelCentre = centerLabel ?? t("viz.uniteClients");

  const total = data.reduce((s, d) => s + d.count, 0);
  const R = 62;
  const STROKE = 22;
  const CIRC = 2 * Math.PI * R;
  const GAP = 2; // gap en couleur de surface entre segments (jamais un contour)

  let cursor = 0;
  const segments = data.map((d, i) => {
    const frac = total > 0 ? d.count / total : 0;
    const raw = frac * CIRC;
    const len = Math.max(1, raw - GAP);
    const seg = {
      ...d,
      color: d.label === t("viz.autres") ? REST : RAMP[Math.min(i, RAMP.length - 1)],
      len,
      offset: cursor,
      part: total > 0 ? Math.round(frac * 100) : 0,
    };
    cursor += raw;
    return seg;
  });

  const description = segments.map((s) => `${s.label} ${s.part}%`).join(", ");

  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg width="190" height="190" viewBox="0 0 160 160" role="img" aria-label={t("viz.repartition", { description })}>
          {segments.map((s) => (
            <circle
              key={s.label}
              className="donut-seg"
              cx="80"
              cy="80"
              r={R}
              fill="none"
              style={{ stroke: s.color }}
              strokeWidth={STROKE}
              strokeDasharray={`${s.len} ${CIRC - s.len}`}
              strokeDashoffset={-s.offset}
              onMouseMove={(e) =>
                setTip({
                  x: e.clientX,
                  y: e.clientY,
                  title: s.label,
                  detail: t("viz.detailSegment", { n: s.count, part: s.part }),
                })
              }
              onMouseLeave={() => setTip(null)}
            />
          ))}
        </svg>
        <div className="donut-center">
          <div className="dc-value">{nombre(total)}</div>
          <div className="dc-label">{labelCentre}</div>
        </div>
      </div>

      {/* La légende porte l'identité et les valeurs : rien ne repose sur la couleur seule. */}
      <div className="legend">
        {segments.map((s) => (
          <div className="legend-item" key={s.label}>
            <span className="legend-dot" style={{ background: s.color }} />
            <span className="legend-name" title={s.label}>
              {s.label}
            </span>
            <span className="legend-val">{s.part}%</span>
          </div>
        ))}
      </div>

      <Tooltip tip={tip} />
    </div>
  );
}

/* ============================================================== Direction */

/* Rampe catégorielle définie dans styles.css (tokens --cat-*). L'ordre est
   fixe et une entité garde sa couleur quel que soit son rang : changer de
   filtre ne doit jamais repeindre ce qui reste à l'écran. */
const CATEGORIES = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)"];
const CAT_RESTE = "var(--cat-rest)";

export type LigneValeur = { label: string; valeur: number; valeurCourte: string; detail: string };

/**
 * Classement à une seule mesure : barres horizontales, une teinte.
 *
 * Horizontal parce que les libellés sont longs (« République démocratique du
 * Congo », « Conseil & services professionnels ») : à la verticale ils
 * seraient tronqués ou penchés.
 *
 * La barre porte la valeur principale ; le reste (nombre de ventes, part)
 * passe au survol, sinon la colonne de droite mange la place du graphique.
 */
export function Classement({ lignes }: { lignes: LigneValeur[] }) {
  const [tip, setTip] = useState<Tip>(null);
  const max = Math.max(1, ...lignes.map((l) => l.valeur));

  return (
    <>
      <div className="bars">
        {lignes.map((l) => (
          <div
            className="bar-row bar-row-valeur"
            key={l.label}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, title: l.label, detail: l.detail })}
            onMouseLeave={() => setTip(null)}
          >
            <span className="bar-label" title={l.label}>
              {l.label}
            </span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(l.valeur / max) * 100}%` }} />
            </div>
            <span className="bar-value bar-value-large">{l.valeurCourte}</span>
          </div>
        ))}
      </div>
      <Tooltip tip={tip} />
    </>
  );
}

export type LigneProduit = {
  groupe: string;
  produit: string;
  nbVentes: number;
  valeurCourte: string;
  detail: string;
};

/**
 * Pour chaque groupe, le produit qui y domine.
 *
 * La couleur suit le PRODUIT et rien d'autre : on voit d'un coup d'œil qu'un
 * même produit gagne chez plusieurs commerciaux, et changer de filtre ne
 * repeint pas ce qui reste à l'écran. L'ordre de référence vient du serveur
 * (« ordreProduits ») ; s'il manque, on retombe sur l'ordre d'apparition.
 *
 * La couleur ne porte jamais seule l'information : le nom du produit est
 * écrit sur chaque ligne et repris en légende.
 */
export function TopProduits({ lignes, ordreProduits }: { lignes: LigneProduit[]; ordreProduits?: string[] }) {
  const [tip, setTip] = useState<Tip>(null);
  const max = Math.max(1, ...lignes.map((l) => l.nbVentes));

  const reference = ordreProduits ?? [...new Set(lignes.map((l) => l.produit))];
  const couleurDe = (produit: string) => {
    const i = reference.indexOf(produit);
    return i >= 0 && i < CATEGORIES.length ? CATEGORIES[i] : CAT_RESTE;
  };

  // La légende ne montre que les produits réellement présents dans la vue.
  const presents = reference.filter((p) => lignes.some((l) => l.produit === p));
  const nommes = presents.filter((p) => reference.indexOf(p) < CATEGORIES.length);
  const surplus = presents.length - nommes.length;

  return (
    <>
      <div className="bars">
        {lignes.map((l) => (
          <div
            className="bar-row bar-row-double"
            key={l.groupe}
            onMouseMove={(e) =>
              setTip({ x: e.clientX, y: e.clientY, title: `${l.groupe} · ${l.produit}`, detail: l.detail })
            }
            onMouseLeave={() => setTip(null)}
          >
            <span className="bar-label" title={l.groupe}>
              <span className="bar-label-principal">{l.groupe}</span>
              <span className="bar-label-second" title={l.produit}>
                {l.produit}
              </span>
            </span>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${(l.nbVentes / max) * 100}%`, background: couleurDe(l.produit) }}
              />
            </div>
            <span className="bar-value">{l.valeurCourte}</span>
          </div>
        ))}
      </div>

      <div className="legend legend-inline">
        {nommes.map((p) => (
          <div className="legend-item" key={p}>
            <span className="legend-dot" style={{ background: couleurDe(p) }} />
            <span className="legend-name" title={p}>
              {p}
            </span>
          </div>
        ))}
        {surplus > 0 && (
          <div className="legend-item">
            <span className="legend-dot" style={{ background: CAT_RESTE }} />
            <span className="legend-name">+{surplus}</span>
          </div>
        )}
      </div>

      <Tooltip tip={tip} />
    </>
  );
}
