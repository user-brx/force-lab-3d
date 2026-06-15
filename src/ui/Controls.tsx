import {
  L,
  PLANETS,
  PLANET_ORDER,
  SCENARIOS,
  SCENARIO_ORDER,
  SURFACES,
  locale,
  planetDesc,
  planetLabel,
  surfaceLabel,
} from "../physics";
import { useStore } from "../state/store";
import { runtime } from "../scene/runtime";

export function TopBar() {
  const scenarioId = useStore((s) => s.scenarioId);
  const setScenario = useStore((s) => s.setScenario);
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);

  return (
    <div className="topbar">
      <div className="brand">
        <h1>{L("Laboratório de Forças 3D", "3D Force Lab")}</h1>
        <p>{L("Veja, em tempo real, de onde vem cada força.", "See, in real time, where every force comes from.")}</p>
      </div>
      <div className="chips">
        {SCENARIO_ORDER.map((id) => {
          const sc = SCENARIOS[id];
          return (
            <button
              key={id}
              className={`chip ${scenarioId === id ? "active" : ""}`}
              onClick={() => setScenario(id)}
            >
              <span className="ico">{sc.icon}</span>
              {L(sc.label, sc.labelEn)}
            </button>
          );
        })}
      </div>
      <button
        className="langtoggle"
        onClick={() => setLang(lang === "pt" ? "en" : "pt")}
        title="Idioma / Language"
        aria-label="Idioma / Language"
      >
        🌐 {lang.toUpperCase()}
      </button>
    </div>
  );
}

/** Botão que mantém uma entrada ativa enquanto pressionado. */
function HoldButton({ dir, label }: { dir: "left" | "right"; label: string }) {
  const on = () => (runtime.input[dir] = true);
  const off = () => (runtime.input[dir] = false);
  return (
    <button
      className="btn"
      onPointerDown={on}
      onPointerUp={off}
      onPointerLeave={off}
      onPointerCancel={off}
    >
      {label}
    </button>
  );
}

function airText(rho: number): string {
  if (rho === 0) return L("vácuo", "vacuum");
  if (rho < 0.1) return `${rho.toFixed(2)} kg/m³ (${L("rarefeito", "thin")})`;
  return `${rho.toLocaleString(locale())} kg/m³`;
}

function PlanetPicker() {
  const planetId = useStore((s) => s.planetId);
  const setPlanet = useStore((s) => s.setPlanet);
  useStore((s) => s.lang);
  const planet = PLANETS[planetId];
  const idx = PLANET_ORDER.indexOf(planetId);

  return (
    <div className="panel">
      <h2>{L("Planeta · atmosfera", "Planet · atmosphere")}</h2>
      <div className="planet-head">
        <span className="planet-emoji">{planet.emoji}</span>
        <div>
          <div className="planet-name">{planetLabel(planet)}</div>
          <div className="planet-meta">
            g {planet.g.toFixed(2)} m/s² · {L("ar", "air")} {airText(planet.airDensity)}
          </div>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={PLANET_ORDER.length - 1}
        step={1}
        value={idx < 0 ? 0 : idx}
        onChange={(e) => setPlanet(PLANET_ORDER[Number(e.target.value)])}
      />
      <div className="planet-ticks">
        {PLANET_ORDER.map((id) => (
          <span key={id} className={id === planetId ? "on" : ""}>
            {PLANETS[id].emoji}
          </span>
        ))}
      </div>
      <div className="planet-desc">{planetDesc(planet)}</div>
    </div>
  );
}

export function SidePanel() {
  const scenarioId = useStore((s) => s.scenarioId);
  const planetId = useStore((s) => s.planetId);
  const surfaceId = useStore((s) => s.surfaceId);
  const setSurface = useStore((s) => s.setSurface);
  const params = useStore((s) => s.params[s.scenarioId]);
  const setParam = useStore((s) => s.setParam);
  const hold = useStore((s) => s.hold);
  const toggleHold = useStore((s) => s.toggleHold);
  useStore((s) => s.lang);

  const sc = SCENARIOS[scenarioId];
  const hasGravity = PLANETS[planetId].g > 0;
  const showSurfaces = sc.surfaces.length > 0 && hasGravity;
  const jet = (params?.jato ?? 0) >= 0.5;

  return (
    <div className="left-col">
      <PlanetPicker />

      {showSurfaces && (
        <div className="panel">
          <h2>{L("Superfície (atrito)", "Surface (friction)")}</h2>
          <div className="btn-row">
            {sc.surfaces.map((id) => (
              <button
                key={id}
                className={`btn ${surfaceId === id ? "on" : ""}`}
                onClick={() => setSurface(id)}
              >
                {surfaceLabel(SURFACES[id])}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h2>{L("Ajustes", "Settings")}</h2>
        {Object.entries(sc.params)
          .filter(([key]) => key !== "jato")
          .map(([key, def]) => (
            <div className="slider" key={key}>
              <div className="row">
                <span>{L(def.label, def.labelEn)}</span>
                <span className="val">
                  {params?.[key] ?? def.default} {def.unit}
                </span>
              </div>
              <input
                type="range"
                min={def.min}
                max={def.max}
                step={def.step}
                value={params?.[key] ?? def.default}
                onChange={(e) => setParam(key, Number(e.target.value))}
              />
            </div>
          ))}

        {scenarioId === "aviao" && (
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className={`btn ${!jet ? "on" : ""}`} onClick={() => setParam("jato", 0)}>
              ✈️ {L("Hélice", "Propeller")}
            </button>
            <button className={`btn ${jet ? "on" : ""}`} onClick={() => setParam("jato", 1)}>
              🛩️ {L("Jato", "Jet")}
            </button>
          </div>
        )}

        {scenarioId === "foguete" && (
          <div className="btn-row" style={{ marginTop: 10 }}>
            <HoldButton dir="left" label={L("◀ inclinar", "◀ tilt")} />
            <HoldButton dir="right" label={L("inclinar ▶", "tilt ▶")} />
          </div>
        )}
        {scenarioId === "revolver" && (
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn fire" onClick={() => (runtime.input.fire = true)}>
              🔫 {L("Disparar", "Fire")}
            </button>
            <button className={`btn ${hold ? "on" : ""}`} onClick={toggleHold}>
              ✋ {L("Segurar", "Hold")}
            </button>
            <button className="btn fire" onClick={() => (runtime.input.matrixFire = true)}>
              ⏱️ {L("Matrix", "Matrix")}
            </button>
          </div>
        )}
        {scenarioId === "patinadores" && (
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn fire" onClick={() => (runtime.input.fire = true)}>
              👐 {L("Empurrar / Reiniciar", "Push / Reset")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function BottomBar() {
  const paused = useStore((s) => s.paused);
  const slowmo = useStore((s) => s.slowmo);
  const showVectors = useStore((s) => s.showVectors);
  const showParticles = useStore((s) => s.showParticles);
  const autoRotate = useStore((s) => s.autoRotate);
  const togglePause = useStore((s) => s.togglePause);
  const toggleSlowmo = useStore((s) => s.toggleSlowmo);
  const toggleVectors = useStore((s) => s.toggleVectors);
  const toggleParticles = useStore((s) => s.toggleParticles);
  const toggleAutoRotate = useStore((s) => s.toggleAutoRotate);
  const reset = useStore((s) => s.reset);
  const scenarioId = useStore((s) => s.scenarioId);
  useStore((s) => s.lang);

  return (
    <div>
      <div className="bottombar">
        <button className="btn" onClick={togglePause}>
          {paused ? `▶ ${L("Continuar", "Resume")}` : `⏸ ${L("Pausar", "Pause")}`}
        </button>
        <button className={`btn ${slowmo ? "on" : ""}`} onClick={toggleSlowmo}>
          🐢 {L("Câmera lenta", "Slow motion")}
        </button>
        <button className={`btn ${showVectors ? "on" : ""}`} onClick={toggleVectors}>
          ➳ {L("Vetores", "Vectors")}
        </button>
        <button className={`btn ${showParticles ? "on" : ""}`} onClick={toggleParticles}>
          💨 {L("Efeitos", "Effects")}
        </button>
        <button className={`btn ${autoRotate ? "on" : ""}`} onClick={toggleAutoRotate}>
          🔄 {L("Girar", "Rotate")}
        </button>
        <button className="btn" onClick={reset}>
          ↺ {L("Reiniciar", "Reset")}
        </button>
      </div>
      <div className="hint">
        {scenarioId === "foguete"
          ? L(
              "Arraste o slider de planeta · ←/→ inclinam o foguete · arraste para girar a câmera",
              "Drag the planet slider · ←/→ tilt the rocket · drag to orbit the camera",
            )
          : L(
              "Arraste o slider para mudar de planeta · arraste para girar a câmera",
              "Drag the slider to change planet · drag to orbit the camera",
            )}
      </div>
    </div>
  );
}
