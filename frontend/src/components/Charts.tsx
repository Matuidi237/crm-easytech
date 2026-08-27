import { useState } from "react";
import type { Repartition } from "../api";

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

export function foldTail(data: Repartition[], keep: number): Repartition[] {
  if (data.length <= keep) return data;
  const reste = data.slice(keep).reduce((s, d) => s + d.count, 0);
  const head = data.slice(0, keep);
  return reste > 0 ? [...head, { label: "Autres", count: reste }] : head;
}

/* ---------------------------------------------------------------- Barres */

export function BarList({ data, total, unite = "clients" }: { data: Repartition[]; total: number; unite?: string }) {
  const [tip, setTip] = useState<Tip>(null);
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
                setTip({ x: e.clientX, y: e.clientY, title: d.label, detail: `${d.count} ${unite} · ${part}% de la base` })
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

export function Donut({ data, centerLabel = "clients" }: { data: Repartition[]; centerLabel?: string }) {
  const [tip, setTip] = useState<Tip>(null);

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
      color: d.label === "Autres" ? REST : RAMP[Math.min(i, RAMP.length - 1)],
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
        <svg width="190" height="190" viewBox="0 0 160 160" role="img" aria-label={`Répartition : ${description}`}>
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
                setTip({ x: e.clientX, y: e.clientY, title: s.label, detail: `${s.count} clients · ${s.part}%` })
              }
              onMouseLeave={() => setTip(null)}
            />
          ))}
        </svg>
        <div className="donut-center">
          <div className="dc-value">{total.toLocaleString("fr-FR")}</div>
          <div className="dc-label">{centerLabel}</div>
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
