import { AIR_DENSITY_SL, airDensityAt } from "../constants";
import { auto, fmt } from "../format";
import { L } from "../i18n";
import { clamp, vec } from "../math";
import type { Scenario, SceneView, ShockEmit } from "../types";

// Avião (hélice ou jato).
// A hélice/turbina joga AR para trás → o ar empurra o avião para frente (3ª lei).
// As asas defletem o ar para baixo → o ar empurra as asas para cima (sustentação).
// Empuxo e sustentação dependem da densidade do ar: SEM AR, o avião não voa
// (contraste direto com o foguete, que voa no vácuo).
//
// Modelo 2D no plano vertical: x horizontal, y altitude, climb = ângulo de subida.

interface PlaneState {
  x: number;
  y: number;
  v: number; // velocidade aerodinâmica ao longo da trajetória (m/s)
  climb: number; // ângulo de subida (rad)
  airborne: boolean;
  T: number; // empuxo (N)
  D: number; // arrasto (N)
  lift: number; // sustentação (N)
  throttle: number;
  propSpin: number;
  shockT: number;
  events: ShockEmit[];
}

const WING_AREA = 30; // m²
const CL_MAX = 1.5; // coeficiente de sustentação máximo
const CD0 = 0.03; // arrasto parasita
const K_IND = 0.045; // fator de arrasto induzido
const MAX_CLIMB = 0.35; // rad (~20°)

export const airplane: Scenario<PlaneState> = {
  id: "aviao",
  label: "Avião",
  labelEn: "Airplane",
  icon: "✈️",
  blurb: "Empuxo joga ar para trás; asas jogam ar para baixo. Sem ar, não voa.",
  surfaces: ["asfalto", "gelo", "areia"],
  defaultPlanet: "terra",
  params: {
    massa: { label: "Massa", labelEn: "Mass", min: 1000, max: 20000, step: 250, default: 3000, unit: "kg" },
    empuxo: { label: "Empuxo máx.", labelEn: "Max thrust", min: 5, max: 80, step: 1, default: 22, unit: "kN" },
    // 0 = hélice, 1 = jato. Renderizado como botão (não como slider).
    jato: { label: "Motor", labelEn: "Engine", min: 0, max: 1, step: 1, default: 0, unit: "" },
  },

  init: () => ({
    x: 0,
    y: 0,
    v: 0,
    climb: 0,
    airborne: false,
    T: 0,
    D: 0,
    lift: 0,
    throttle: 0,
    propSpin: 0,
    shockT: 0,
    events: [],
  }),

  step(s, env, params, _c, dt) {
    const m = params.massa ?? 3000;
    const Tmax = (params.empuxo ?? 22) * 1000;
    const jet = (params.jato ?? 0) >= 0.5;
    const g = env.g;
    const W = m * g;

    // Densidade do ar na altitude atual (0 = vácuo).
    const rho = env.airDensity > 0 ? airDensityAt(s.y, env.airDensity, env.scaleHeight) : 0;
    const rhoRatio = rho / AIR_DENSITY_SL; // relativo ao nível do mar da Terra

    s.throttle = Math.min(1, s.throttle + dt * 0.5);
    s.propSpin += dt * (jet ? 0 : 40) * s.throttle;

    // Empuxo: precisa de ar. Jato ~ constante; hélice rende mais em baixa velocidade.
    let T = 0;
    if (rhoRatio > 0) {
      T = jet
        ? Tmax * rhoRatio * s.throttle
        : Tmax * rhoRatio * s.throttle * (60 / (s.v + 60));
    }
    s.T = T;

    // Pressão dinâmica e arrasto.
    const q = 0.5 * rho * s.v * s.v;
    const clOp = q > 1 ? clamp(W / (q * WING_AREA), 0, CL_MAX) : CL_MAX;
    const cd = CD0 + K_IND * clOp * clOp;
    const D = q * WING_AREA * cd;
    s.D = D;

    // Sustentação máxima disponível agora.
    const liftMax = q * WING_AREA * CL_MAX;

    if (!s.airborne) {
      // Corrida na pista.
      const roll = s.v > 0.1 ? 0.02 * W : 0;
      const net = T - D - roll;
      s.v = Math.max(0, s.v + (net / m) * dt);
      s.climb = 0;
      s.lift = Math.min(liftMax, W);
      s.y = 0;
      s.x += s.v * dt;
      if (g > 0 && liftMax >= W && s.v > 1) s.airborne = true;
      // poeira na decolagem
      s.shockT += dt;
      if (s.v > 3 && s.shockT > 0.18 && env.g > 0) {
        s.shockT = 0;
        s.events.push({ at: vec(s.x - 1, 0.05, 0), kind: "ring", color: "#8fb4e0", maxRadius: 1.4, life: 0.6 });
      }
    } else {
      // Voo: ângulo de subida vem do excesso de empuxo sobre o arrasto.
      const excess = T - D;
      const target = clamp(excess / Math.max(W, 1), -0.5, MAX_CLIMB);
      s.climb += (target - s.climb) * Math.min(1, dt * 1.5);
      const dv = (T - D - W * Math.sin(s.climb)) / m;
      s.v = Math.max(0, s.v + dv * dt);
      s.lift = W * Math.cos(s.climb);

      // Estol: sem sustentação suficiente (ar rarefeito/lento), começa a cair.
      if (liftMax < W) s.climb = Math.min(s.climb, -0.25);

      s.x += s.v * Math.cos(s.climb) * dt;
      s.y += s.v * Math.sin(s.climb) * dt;
      if (s.y <= 0) {
        s.y = 0;
        s.climb = 0;
        if (s.v < 1) s.airborne = false;
      }
    }
  },

  view(s, env, params): SceneView {
    const m = params.massa ?? 3000;
    const jet = (params.jato ?? 0) >= 0.5;
    const W = m * env.g;
    const noAir = env.airDensity <= 0;
    const rho = env.airDensity > 0 ? airDensityAt(s.y, env.airDensity, env.scaleHeight) : 0;
    const cs = Math.cos(s.climb);
    const sn = Math.sin(s.climb);
    const body = vec(s.x, 1 + s.y, 0);
    const nose = vec(s.x + cs * 1.6, 1 + s.y + sn * 1.6, 0);
    const tail = vec(s.x - cs * 1.6, 1 + s.y - sn * 1.6, 0);
    const shocks = s.events;
    s.events = [];

    // Fluxo de ar sobre a asa: quantidade ∝ densidade do ar × velocidade.
    // O ar é defletido para BAIXO (downwash) - é a reação que sustenta o avião.
    const airFlow = Math.min(1, (rho / AIR_DENSITY_SL) * (s.v / 28));
    const dwCount = Math.round(airFlow * 4);
    const airParticles =
      dwCount > 0
        ? [
            // downwash: o ar saindo para baixo atrás da asa (gera sustentação)
            {
              at: vec(s.x - cs * 0.3, 1 + s.y - 0.25, 0),
              dir: vec(-cs * 0.4, -1, 0),
              speed: 2 + s.v * 0.22,
              spread: 0.25,
              count: dwCount,
              kind: "air" as const,
            },
            // linhas de corrente passando sobre a asa
            {
              at: vec(s.x + cs * 1.1, 1 + s.y + 0.18, 0),
              dir: vec(-cs, -sn * 0.4 - 0.12, 0),
              speed: 2 + s.v * 0.5,
              spread: 0.12,
              count: dwCount,
              kind: "air" as const,
            },
          ]
        : [];

    const forces = [
      { kind: "action" as const, label: "EMPUXO - motor joga ar para trás", origin: body, dir: vec(cs, sn, 0), magnitude: s.T },
      { kind: "drag" as const, label: "ARRASTO do ar", origin: body, dir: vec(-cs, -sn, 0), magnitude: s.D },
      { kind: "lift" as const, label: "SUSTENTAÇÃO - asas jogam ar para baixo", origin: body, dir: vec(-sn, cs, 0), magnitude: s.lift },
      { kind: "weight" as const, label: "PESO", origin: body, dir: vec(0, -1, 0), magnitude: W },
    ];

    let note: string;
    if (noAir)
      note = L(
        "Sem ar: a hélice/turbina não tem o que empurrar e as asas não geram sustentação. Sem atmosfera o avião NÃO voa (o foguete sim).",
        "No air: the propeller/turbine has nothing to push and the wings make no lift. Without an atmosphere the airplane does NOT fly (the rocket does).",
      );
    else if (!s.airborne)
      note = L("Acelerando na pista. Ao atingir a velocidade de decolagem, as asas geram sustentação ≥ peso e ele sobe.", "Accelerating down the runway. At takeoff speed the wings make lift ≥ weight and it climbs.");
    else if (s.climb > 0.02)
      note = L("Subindo: há empuxo sobrando além do arrasto.", "Climbing: there's thrust to spare beyond drag.");
    else if (s.climb < -0.02)
      note = L("Perdendo sustentação (ar rarefeito ou lento demais): começa a descer.", "Losing lift (thin air or too slow): starting to descend.");
    else note = L("Voo nivelado: empuxo = arrasto e sustentação = peso.", "Level flight: thrust = drag and lift = weight.");

    return {
      bodies: [{ id: "plane", position: body, rotation: s.climb, phase: s.propSpin }],
      forces,
      readouts: [
        { label: L("Velocidade", "Speed"), value: fmt(s.v * 3.6, 0), unit: "km/h" },
        { label: L("Velocidade", "Speed"), value: fmt(s.v, 0), unit: "m/s" },
        { label: L("Altitude", "Altitude"), value: fmt(s.y, 0), unit: "m" },
        { label: L("Empuxo", "Thrust"), value: fmt(s.T / 1000, 1), unit: "kN" },
        { label: L("Sustentação", "Lift"), value: fmt(s.lift / 1000, 1), unit: "kN", highlight: true },
        { label: L("Densidade do ar", "Air density"), value: auto(rho, 2), unit: "kg/m³", highlight: true },
        { label: L("Arrasto", "Drag"), value: fmt(s.D / 1000, 1), unit: "kN" },
        { label: L("Peso", "Weight"), value: fmt(W / 1000, 1), unit: "kN" },
        { label: L("Ângulo de subida", "Climb angle"), value: fmt((s.climb * 180) / Math.PI, 0), unit: "°" },
        { label: L("Motor", "Engine"), value: jet ? L("Jato", "Jet") : L("Hélice", "Propeller") },
      ],
      bars: [],
      metrics: [
        { label: L("Velocidade", "Speed"), value: s.v, unit: "m/s", color: "#4D9FFF" },
        { label: L("Altitude", "Altitude"), value: s.y, unit: "m", color: "#F5B83D" },
      ],
      note,
      source: L(
        "A hélice/turbina joga AR para trás e o ar empurra o avião para frente (3ª lei). As asas defletem o ar para baixo e o ar empurra as asas para cima (sustentação). " +
          "Tudo depende do ar - por isso o avião não voa no vácuo, enquanto o foguete (que carrega sua própria massa de reação) voa.",
        "The propeller/turbine throws AIR backward and the air pushes the plane forward (3rd law). The wings deflect air downward and the air pushes the wings up (lift). " +
          "It all depends on the air - that's why an airplane can't fly in vacuum, while a rocket (which carries its own reaction mass) can.",
      ),
      particles: [
        ...airParticles,
        ...(jet && s.T > 0
          ? [{ at: tail, dir: vec(-cs, -sn, 0), speed: 14, spread: 0.12, count: 4, kind: "exhaust" as const }]
          : !jet && s.T > 0
            ? [{ at: nose, dir: vec(cs, sn, 0), speed: 5, spread: 0.5, count: 1, kind: "smoke" as const }]
            : []),
      ],
      shocks,
      cameraTarget: body,
    };
  },
};
