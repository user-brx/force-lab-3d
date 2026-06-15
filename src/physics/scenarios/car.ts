import { fmt } from "../format";
import { L } from "../i18n";
import { vec } from "../math";
import type { Scenario, SceneView, ShockEmit } from "../types";

// Carro. O motor gira a roda; a roda empurra o chão para trás por atrito;
// o chão empurra o carro para frente (3ª lei). Arrasto do ar ~ ρ·v².
// No gelo a roda patina: a força do motor passa do atrito disponível.

interface CarState {
  x: number;
  v: number;
  fEngineReq: number;
  fTraction: number;
  fDrag: number;
  spinning: boolean;
  throttle: number;
  shockT: number;
  events: ShockEmit[];
}

// Coeficientes aerodinâmicos de um hatch compacto.
const CD = 0.3;
const FRONTAL_AREA = 2.2; // m²
const CRR = 0.012; // resistência de rolamento

export const car: Scenario<CarState> = {
  id: "carro",
  label: "Carro",
  labelEn: "Car",
  icon: "🚗",
  blurb: "Tração por atrito e arrasto que cresce com o quadrado da velocidade.",
  surfaces: ["asfalto", "gelo", "areia"],
  defaultPlanet: "terra",
  params: {
    massa: { label: "Massa", labelEn: "Mass", min: 700, max: 2500, step: 50, default: 1200, unit: "kg" },
    forca: { label: "Força do motor", labelEn: "Engine force", min: 1000, max: 9000, step: 100, default: 4500, unit: "N" },
  },

  init: () => ({
    x: 0,
    v: 0,
    fEngineReq: 0,
    fTraction: 0,
    fDrag: 0,
    spinning: false,
    throttle: 0,
    shockT: 0,
    events: [],
  }),

  step(s, env, params, _c, dt) {
    const m = params.massa ?? 1200;
    const fMax = params.forca ?? 4500;
    const N = m * env.g;

    s.throttle = Math.min(1, s.throttle + dt * 0.7);
    s.fEngineReq = fMax * s.throttle;

    const tractionLimit = env.muS * N;
    if (s.fEngineReq <= tractionLimit) {
      s.fTraction = s.fEngineReq;
      s.spinning = false;
    } else {
      s.spinning = true;
      s.fTraction = env.muK * N;
    }

    s.fDrag = 0.5 * env.airDensity * CD * FRONTAL_AREA * s.v * s.v;
    const fRoll = s.v > 0.01 ? CRR * N : 0;

    const net = s.fTraction - s.fDrag - fRoll;
    const a = net / m;
    s.v = Math.max(0, s.v + a * dt);
    s.x += s.v * dt;

    // Onda de choque: pneu patinando arranca anéis do chão.
    s.shockT += dt;
    const cadence = s.spinning ? 0.12 : 0.4;
    if (env.g > 0 && (s.spinning || s.v > 1) && s.shockT > cadence) {
      s.shockT = 0;
      s.events.push({
        at: vec(s.x - 0.9, 0.02, 0),
        kind: "ring",
        color: s.spinning ? "#ff8a3c" : "#8fb4e0",
        maxRadius: s.spinning ? 1.8 : 1.2,
        life: 0.6,
      });
    }
  },

  view(s, env, params): SceneView {
    const m = params.massa ?? 1200;
    const weight = m * env.g;
    const a = (s.fTraction - s.fDrag) / m;
    const wheel = vec(s.x - 0.9, 0.33, 0);
    const body = vec(s.x, 0.7, 0);
    const shocks = s.events;
    s.events = [];

    return {
      bodies: [{ id: "car", position: vec(s.x, 0, 0) }],
      forces: [
        {
          kind: "action",
          label: "AÇÃO — pneu empurra o chão",
          origin: wheel,
          dir: vec(-1, 0, 0),
          magnitude: s.fTraction,
        },
        {
          kind: "reaction",
          label: "REAÇÃO — chão empurra o carro",
          origin: wheel,
          dir: vec(1, 0, 0),
          magnitude: s.fTraction,
        },
        {
          kind: "drag",
          label: "ARRASTO do ar",
          origin: vec(s.x + 1.3, 1.0, 0),
          dir: vec(-1, 0, 0),
          magnitude: s.fDrag,
        },
        { kind: "weight", label: "PESO", origin: body, dir: vec(0, -1, 0), magnitude: weight },
        { kind: "normal", label: "NORMAL", origin: wheel, dir: vec(0, 1, 0), magnitude: weight },
      ],
      readouts: [
        { label: L("Velocidade", "Speed"), value: fmt(s.v * 3.6, 0), unit: "km/h" },
        { label: L("Velocidade", "Speed"), value: fmt(s.v, 1), unit: "m/s" },
        { label: L("Força do motor", "Engine force"), value: fmt(s.fEngineReq, 0), unit: "N" },
        { label: L("Força de tração", "Traction force"), value: fmt(s.fTraction, 0), unit: "N", highlight: true },
        { label: L("Arrasto do ar", "Air drag"), value: fmt(s.fDrag, 0), unit: "N" },
        { label: L("Aceleração", "Acceleration"), value: fmt(a, 2), unit: "m/s²" },
      ],
      bars: [],
      metrics: [{ label: L("Velocidade", "Speed"), value: s.v, unit: "m/s", color: "#4D9FFF" }],
      note:
        env.g <= 0
          ? L("Sem gravidade não há atrito: a roda gira sem empurrar nada.", "No gravity, no friction: the wheel spins without pushing anything.")
          : s.spinning
            ? L(
                "Patinando! A força do motor passou do atrito disponível — a roda gira sem empurrar.",
                "Wheelspin! The engine force exceeded the available friction — the wheel spins without pushing.",
              )
            : s.fDrag >= s.fTraction - 1 && s.v > 1
              ? L("Velocidade máxima: o arrasto igualou a tração.", "Top speed: drag has matched traction.")
              : L("Acelerando: a tração vence o arrasto.", "Accelerating: traction beats drag."),
      source: L(
        "O motor não empurra o carro diretamente — ele gira a roda, que empurra o chão para trás. " +
          "O chão responde empurrando o carro para frente. Sem atrito (gelo), a roda patina e quase não há reação.",
        "The engine doesn't push the car directly — it spins the wheel, which pushes the ground backward. " +
          "The ground responds by pushing the car forward. Without friction (ice), the wheel spins and there's almost no reaction.",
      ),
      particles: s.spinning
        ? [{ at: wheel, dir: vec(-1, 0.3, 0), speed: 3, spread: 0.6, count: 3, kind: "smoke" }]
        : s.v > 0.3 && env.color === "#cda874"
          ? [{ at: wheel, dir: vec(-1, 0.4, 0), speed: 1.5, spread: 0.5, count: 1, kind: "dust" }]
          : [],
      shocks,
      cameraTarget: body,
    };
  },
};
