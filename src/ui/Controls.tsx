import {
  BARRIER_MATERIALS,
  FALL_SHAPES,
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
        <h1>{L("Lab de Forças", "Force Lab")}</h1>
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
      <a
        className="langtoggle"
        href={lang === "en" ? "docs/en/" : "docs/"}
        target="_blank"
        rel="noopener"
        title={L("Guia do professor", "Teacher's guide")}
      >
        📖 {L("Docs", "Docs")}
      </a>
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
  useStore((s) => s.lang);

  const sc = SCENARIOS[scenarioId];
  const hasGravity = PLANETS[planetId].g > 0;
  const showSurfaces = sc.surfaces.length > 0 && hasGravity;

  // Params com UI própria (botões), fora dos sliders genéricos.
  const BARRIER_KEYS = ["jato", "barreira", "material", "espessura", "distancia", "forma"];

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
          .filter(([key]) => !BARRIER_KEYS.includes(key))
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
      </div>

      {scenarioId === "revolver" && <BarrierPanel params={params} setParam={setParam} />}
      {scenarioId === "queda" && <ShapePanel params={params} setParam={setParam} />}
    </div>
  );
}

/** Seletor de forma do objeto que cai (muda o arrasto aerodinâmico). */
function ShapePanel({
  params,
  setParam,
}: {
  params?: Record<string, number>;
  setParam: (key: string, value: number) => void;
}) {
  useStore((s) => s.lang);
  const idx = Math.round(params?.forma ?? 0);
  return (
    <div className="panel">
      <h2>{L("Forma do objeto", "Object shape")}</h2>
      <div className="btn-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
        {FALL_SHAPES.map((sh, i) => (
          <button
            key={sh.id}
            className={`btn ${idx === i ? "on" : ""}`}
            style={{ flex: "0 0 auto" }}
            onClick={() => setParam("forma", i)}
          >
            {L(sh.label, sh.labelEn)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Painel da barreira-alvo do Fuzil .50: liga/desliga, material, espessura, distância. */
function BarrierPanel({
  params,
  setParam,
}: {
  params?: Record<string, number>;
  setParam: (key: string, value: number) => void;
}) {
  useStore((s) => s.lang);
  const on = (params?.barreira ?? 1) >= 0.5;
  const matIdx = Math.round(params?.material ?? 0);
  const esp = params?.espessura ?? 10;
  const dist = params?.distancia ?? 25;

  return (
    <div className="panel">
      <h2>{L("Barreira-alvo", "Target barrier")}</h2>

      {!on && (
        <div className="planet-desc">
          {L("Ligue a barreira no botão 🧱 da barra de ações.", "Turn the barrier on with the 🧱 button in the action bar.")}
        </div>
      )}

      {on && (
        <>
          <div className="btn-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            {BARRIER_MATERIALS.map((m, i) => (
              <button
                key={m.id}
                className={`btn ${matIdx === i ? "on" : ""}`}
                style={{ flex: "0 0 auto" }}
                onClick={() => setParam("material", i)}
              >
                {L(m.label, m.labelEn)}
              </button>
            ))}
          </div>

          <div className="slider" style={{ marginTop: 12 }}>
            <div className="row">
              <span>{L("Espessura", "Thickness")}</span>
              <span className="val">{esp} cm</span>
            </div>
            <input type="range" min={1} max={50} step={1} value={esp} onChange={(e) => setParam("espessura", Number(e.target.value))} />
          </div>
          <div className="slider">
            <div className="row">
              <span>{L("Distância", "Distance")}</span>
              <span className="val">{dist} m</span>
            </div>
            <input type="range" min={5} max={150} step={5} value={dist} onChange={(e) => setParam("distancia", Number(e.target.value))} />
          </div>
        </>
      )}
    </div>
  );
}

export function ActionBar() {
  const scenarioId = useStore((s) => s.scenarioId);
  const hold = useStore((s) => s.hold);
  const toggleHold = useStore((s) => s.toggleHold);
  const params = useStore((s) => s.params[s.scenarioId]);
  const setParam = useStore((s) => s.setParam);
  useStore((s) => s.lang);

  const barrierOn = (params?.barreira ?? 1) >= 0.5;

  if (scenarioId === "revolver") {
    return (
      <div className="actionbar">
        <div>
          <button className="btn fire" onClick={() => (runtime.input.fire = true)}>
            🎯 {L("Disparar", "Fire")}
          </button>
          <button className={`btn ${hold ? "on" : ""}`} onClick={toggleHold}>
            ✋ {L("Segurar", "Hold")}
          </button>
          <button className="btn fire" onClick={() => (runtime.input.matrixFire = true)}>
            ⏱️ {L("Matrix", "Matrix")}
          </button>
          <button className={`btn ${barrierOn ? "on" : ""}`} onClick={() => setParam("barreira", barrierOn ? 0 : 1)}>
            🧱 {L("Barreira", "Barrier")}
          </button>
        </div>
      </div>
    );
  }

  if (scenarioId === "aviao") {
    const jet = (params?.jato ?? 0) >= 0.5;
    return (
      <div className="actionbar">
        <div>
          <button className={`btn ${!jet ? "on" : ""}`} onClick={() => setParam("jato", 0)}>
            ✈️ {L("Hélice", "Propeller")}
          </button>
          <button className={`btn ${jet ? "on" : ""}`} onClick={() => setParam("jato", 1)}>
            🛩️ {L("Jato", "Jet")}
          </button>
        </div>
      </div>
    );
  }

  if (scenarioId === "foguete") {
    return (
      <div className="actionbar">
        <div>
          <HoldButton dir="left" label={L("◀ Inclinar", "◀ Tilt")} />
          <HoldButton dir="right" label={L("Inclinar ▶", "Tilt ▶")} />
        </div>
      </div>
    );
  }

  if (scenarioId === "patinadores") {
    return (
      <div className="actionbar">
        <div>
          <button className="btn fire" onClick={() => (runtime.input.fire = true)}>
            👐 {L("Empurrar", "Push")}
          </button>
        </div>
      </div>
    );
  }

  if (scenarioId === "queda") {
    return (
      <div className="actionbar">
        <div>
          <button className="btn fire" onClick={() => (runtime.input.fire = true)}>
            ⬇️ {L("Soltar", "Drop")}
          </button>
        </div>
      </div>
    );
  }

  return null;
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
