import { L } from "../physics";
import { useStore } from "../state/store";
import { FORCE_COLORS, forceLegend } from "./theme";
import { Graph } from "./Graph";
import { fmt } from "../physics/format";

export function Hud() {
  const hud = useStore((s) => s.hud);
  const showVectors = useStore((s) => s.showVectors);
  useStore((s) => s.lang); // re-renderiza ao trocar idioma

  return (
    <div className="right-col">
      <div className="panel">
        <h2>{L("Medidas ao vivo", "Live readings")}</h2>
        {hud.readouts.map((r, i) => (
          <div key={i} className={`readout ${r.highlight ? "hl" : ""}`}>
            <span className="label">{r.label}</span>
            <span className="value">
              {r.value}
              {r.unit ? ` ${r.unit}` : ""}
            </span>
          </div>
        ))}
        {hud.bars.map((b, i) => (
          <div className="bar" key={i}>
            <div className="row">
              <span>{b.label}</span>
              <span>{b.caption ?? ""}</span>
            </div>
            <div className="track">
              <div
                className="fill"
                style={{
                  width: `${Math.max(0, Math.min(1, b.value)) * 100}%`,
                  background: b.color,
                }}
              />
            </div>
          </div>
        ))}
        {hud.energies && hud.energies.length > 0 && (
          <div className="bar energies-bar">
            <div className="row">
              <span>{L("Energia (Total)", "Energy (Total)")}</span>
              <span>{fmt(hud.energies.reduce((sum, e) => sum + e.value, 0) / 1000, 1)} kJ</span>
            </div>
            <div className="track stacked">
              {hud.energies.map((e, i) => {
                const total = Math.max(0.001, hud.energies!.reduce((s, ee) => s + ee.value, 0));
                const pct = (e.value / total) * 100;
                return (
                  <div
                    key={i}
                    className="fill"
                    style={{ width: `${pct}%`, background: e.color }}
                    title={`${e.label}: ${fmt(e.value / 1000, 1)} kJ`}
                  />
                );
              })}
            </div>
            <div className="energy-legend">
              {hud.energies.map((e, i) => (
                <div className="item" key={i}>
                  <span className="dot" style={{ background: e.color }} />
                  {e.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Graph />

      {showVectors && (
        <div className="panel">
          <h2>{L("Vetores de força", "Force vectors")}</h2>
          <div className="legend">
            {forceLegend().map((l) => (
              <div className="item" key={l.kind}>
                <span className="dot" style={{ background: FORCE_COLORS[l.kind] }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {hud.note && (
        <div className="panel">
          <div className="note">{hud.note}</div>
        </div>
      )}

      {hud.source && (
        <div className="panel">
          <h2>{L("De onde vem a força", "Where the force comes from")}</h2>
          <div className="source">{hud.source}</div>
        </div>
      )}
    </div>
  );
}
