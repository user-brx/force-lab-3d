import { AIR_DENSITY_SL, G0, KARMAN_LINE, airDensityAt, gravityAt, soundSpeedAt } from "../constants";
import { auto, fmt } from "../format";
import { L } from "../i18n";
import { clamp, vec } from "../math";
import type { Scenario, SceneView, ShockEmit } from "../types";

// Foguete. O empuxo nasce DENTRO do motor: o gás é expelido por um sentido e
// o foguete vai no sentido oposto, com a mesma força (3ª lei) - o mesmo
// fenômeno do revólver. Não precisa de ar para empurrar; funciona melhor no vácuo.
//
// Modelagem 2D no plano vertical: x horizontal, y = altitude, φ = inclinação.

interface RocketState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phi: number;
  omega: number;
  gimbal: number;
  mProp: number;
  mProp0: number;
  mDry: number;
  exploded: boolean;
  shockT: number;
  prevMach: number;
  eDrag: number;
  events: ShockEmit[];
}

const ISP_VAC = 311; // impulso específico no vácuo (s), ex: Merlin 1D
const ISP_SL = 260; // impulso específico no nível do mar (s)
const LENGTH = 8; // comprimento do foguete (m) - usado para inércia/braço
const DRAG_CD = 0.5;
const DRAG_AREA = 1.0; // m²
const GIMBAL_MAX = (5 * Math.PI) / 180; // 5°

export const rocket: Scenario<RocketState> = {
  id: "foguete",
  label: "Foguete",
  labelEn: "Rocket",
  icon: "🚀",
  blurb: "Empuxo por expulsão de massa, gravidade, arrasto e direção por gimbal.",
  surfaces: [],
  defaultPlanet: "terra",
  params: {
    empuxo: { label: "Empuxo", labelEn: "Thrust", min: 5, max: 120, step: 1, default: 30, unit: "kN" },
    massaSeca: { label: "Massa seca", labelEn: "Dry mass", min: 100, max: 2000, step: 50, default: 500, unit: "kg" },
    combustivel: { label: "Combustível", labelEn: "Fuel", min: 10, max: 100, step: 5, default: 100, unit: "%" },
  },

  init: (_env, params) => {
    const mDry = params.massaSeca ?? 500;
    const fuel = (params.combustivel ?? 100) / 100;
    const mProp0 = 3 * mDry * fuel;
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      phi: 0,
      omega: 0,
      gimbal: 0,
      mProp: mProp0,
      mProp0,
      mDry,
      exploded: false,
      shockT: 0,
      prevMach: 0,
      eDrag: 0,
      events: [],
    };
  },

  step(s, env, params, c, dt) {
    if (s.exploded) return;

    const rho = env.airDensity > 0 ? airDensityAt(s.y, env.airDensity, env.scaleHeight) : 0;
    const rhoRatio = env.airDensity > 0 ? rho / AIR_DENSITY_SL : 0;
    const ispEff = ISP_VAC - (ISP_VAC - ISP_SL) * rhoRatio;

    const nominalThrust = (params.empuxo ?? 30) * 1000;
    const mdot = nominalThrust / (ISP_SL * G0); // Fluxo de massa é constante
    const thrust = mdot * ispEff * G0;

    const mass = s.mDry + s.mProp;
    const firing = s.mProp > 0;

    const target = (c.left ? GIMBAL_MAX : 0) + (c.right ? -GIMBAL_MAX : 0);
    s.gimbal += clamp(target - s.gimbal, -dt * 0.6, dt * 0.6);

    const axis = vec(Math.sin(s.phi), Math.cos(s.phi), 0);

    let fx = 0;
    let fy = 0;

    if (firing) {
      fx += thrust * axis.x;
      fy += thrust * axis.y;
      const arm = LENGTH / 2;
      const torque = thrust * Math.sin(s.gimbal) * arm;
      const I = (mass * LENGTH * LENGTH) / 12;
      s.omega += (torque / I) * dt;
    }

    if (env.g > 0) {
      fy -= mass * gravityAt(s.y, env.g, env.radius);
    }

    const speed = Math.hypot(s.vx, s.vy);
    if (env.airDensity > 0 && speed > 0.01) {
      const rho = airDensityAt(s.y, env.airDensity, env.scaleHeight);
      const drag = 0.5 * rho * DRAG_CD * DRAG_AREA * speed * speed;
      fx -= drag * (s.vx / speed);
      fy -= drag * (s.vy / speed);
      s.eDrag += drag * speed * dt;
    }

    // Amortecimento aerodinâmico da rotação: existe só na atmosfera.
    // No vácuo a rotação segue a 1ª lei (apenas o gimbal a altera).
    if (env.airDensity > 0) {
      const damp = Math.min(1, (airDensityAt(s.y, env.airDensity, env.scaleHeight) / AIR_DENSITY_SL) * 0.4 * dt);
      s.omega -= s.omega * damp;
    }

    const ax = fx / mass;
    const ay = fy / mass;
    s.vx += ax * dt;
    s.vy += ay * dt;

    if (firing) s.mProp = Math.max(0, s.mProp - mdot * dt);

    if (s.y <= 0) {
      if (s.vy <= 0) {
        s.y = 0;
        s.vy = Math.max(0, s.vy);
        s.vx = 0;
        if (speed > 12 || Math.abs(s.phi) > 0.5) {
          if (s.mProp0 - s.mProp > 1) s.exploded = true;
        }
      }
    }

    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.phi += s.omega * dt;

    // --- Ondas de choque ---
    // Jato batendo na plataforma durante a decolagem (precisa de chão = gravidade).
    s.shockT += dt;
    if (firing && env.g > 0 && s.y < 90 && s.shockT > 0.1) {
      s.shockT = 0;
      s.events.push({
        at: vec(s.x, 0.05, 0),
        kind: "ring",
        color: "#ff8a3c",
        maxRadius: 4 + (1 - s.y / 90) * 6,
        life: 0.7,
      });
    }
    // Estouro do som (cone de Mach) ao cruzar Mach 1 na atmosfera.
    if (env.airDensity > 0.05) {
      const mach = speed / env.soundSpeed;
      if (s.prevMach < 1 && mach >= 1) {
        s.events.push({
          at: vec(s.x, s.y, 0),
          kind: "blast",
          color: "#cfe3ff",
          maxRadius: 6,
          life: 0.6,
        });
      }
      s.prevMach = mach;
    }
  },

  view(s, env, params): SceneView {
    const rhoRatioView = env.airDensity > 0 ? airDensityAt(s.y, env.airDensity, env.scaleHeight) / AIR_DENSITY_SL : 0;
    const ispView = ISP_VAC - (ISP_VAC - ISP_SL) * rhoRatioView;
    const nominalThrust = (params.empuxo ?? 30) * 1000;
    const thrust = (nominalThrust / (ISP_SL * G0)) * ispView * G0;

    const mass = s.mDry + s.mProp;
    const firing = s.mProp > 0 && !s.exploded;
    const g = gravityAt(s.y, env.g, env.radius);
    const twr = env.g > 0 ? thrust / (mass * g) : Infinity;
    const speed = Math.hypot(s.vx, s.vy);
    const dv = ispView * G0 * Math.log((s.mDry + s.mProp) / s.mDry);

    const axis = vec(Math.sin(s.phi), Math.cos(s.phi), 0);
    const base = vec(s.x, s.y, 0);
    const com = vec(s.x + axis.x * (LENGTH / 2), s.y + axis.y * (LENGTH / 2), 0);
    const nozzleDir = vec(-axis.x, -axis.y, 0);

    const grounded = s.y <= 0.01;
    const cantLift = env.g > 0 && twr <= 1;
    const shocks = s.events;
    s.events = [];

    const forces = [];
    if (firing) {
      forces.push({
        kind: "thrust" as const,
        label: "EMPUXO (reação)",
        origin: base,
        dir: axis,
        magnitude: thrust,
      });
      forces.push({
        kind: "action" as const,
        label: "AÇÃO - foguete expele o gás",
        origin: base,
        dir: nozzleDir,
        magnitude: thrust,
      });
    }
    if (env.g > 0) {
      forces.push({
        kind: "weight" as const,
        label: "PESO",
        origin: com,
        dir: vec(0, -1, 0),
        magnitude: mass * g,
      });
    }
    if (env.airDensity > 0 && speed > 5) {
      const rho = airDensityAt(s.y, env.airDensity, env.scaleHeight);
      const drag = 0.5 * rho * DRAG_CD * DRAG_AREA * speed * speed;
      forces.push({
        kind: "drag" as const,
        label: "ARRASTO do ar",
        origin: com,
        dir: vec(-s.vx / speed, -s.vy / speed, 0),
        magnitude: drag,
      });
    }

    const readouts = [
      { label: L("Altitude", "Altitude"), value: fmt(s.y / 1000, 2), unit: "km" },
      { label: L("Velocidade", "Speed"), value: fmt(speed, 0), unit: "m/s" },
      { label: L("Empuxo", "Thrust"), value: fmt(thrust / 1000, 1), unit: "kN" },
      { label: L("Massa atual", "Current mass"), value: fmt(mass, 0), unit: "kg" },
      {
        label: L("TWR (empuxo÷peso)", "TWR (thrust÷weight)"),
        value: env.g > 0 ? fmt(twr, 2) : L("∞ (vácuo)", "∞ (vacuum)"),
        unit: "",
        highlight: true,
      },
      { label: L("Veloc. de exaustão", "Exhaust velocity"), value: fmt(ispView * G0, 0), unit: "m/s" },
      { label: L("Δv restante (Tsiolkovsky)", "Remaining Δv (Tsiolkovsky)"), value: fmt(dv, 0), unit: "m/s", highlight: true },
    ];
    if (env.airDensity > 0) {
      const sndSpeed = soundSpeedAt(s.y, env.soundSpeed);
      readouts.push({ label: "Mach", value: fmt(speed / sndSpeed, 2), unit: "" });
      readouts.push({
        label: L("Densidade do ar", "Air density"),
        value: auto(airDensityAt(s.y, env.airDensity, env.scaleHeight), 2),
        unit: "kg/m³",
      });
    }

    let note: string;
    if (s.exploded) note = L("💥 Explodiu no pouso (rápido ou torto demais).", "💥 Crashed on landing (too fast or too tilted).");
    else if (cantLift && grounded)
      note = L(
        "TWR ≤ 1: o empuxo não vence o peso. Aumente o empuxo, reduza a massa ou tente um astro de gravidade menor.",
        "TWR ≤ 1: thrust can't beat weight. Increase thrust, reduce mass, or try a lower-gravity world.",
      );
    else if (!firing)
      note = env.g <= 0
        ? L("Sem combustível: segue em linha reta para sempre (1ª lei).", "Out of fuel: it coasts in a straight line forever (1st law).")
        : L("Sem combustível: agora é só gravidade e arrasto.", "Out of fuel: now it's just gravity and drag.");
    else if (env.g <= 0)
      note = L(
        "Vácuo: o foguete NÃO empurra nada. Ele joga gás para trás e, por conservação de momento (3ª lei), recua para frente. Use ←/→ para girar.",
        "Vacuum: the rocket pushes against NOTHING. It throws gas backward and, by conservation of momentum (3rd law), recoils forward. Use ←/→ to rotate.",
      );
    else if (s.y > KARMAN_LINE)
      note = L("Passou a linha de Kármán (100 km): você está no espaço.", "Past the Kármán line (100 km): you're in space.");
    else note = L("Subindo. Segure ←/→ para inclinar o bocal (gimbal) e girar o foguete.", "Climbing. Hold ←/→ to gimbal the nozzle and rotate the rocket.");

    return {
      bodies: [{ id: "rocket", position: com, rotation: s.phi }],
      forces,
      readouts,
      bars: [
        {
          label: L("Combustível", "Fuel"),
          value: s.mProp0 > 0 ? s.mProp / s.mProp0 : 0,
          color: "#F5B83D",
          caption: `${fmt((s.mProp0 > 0 ? s.mProp / s.mProp0 : 0) * 100, 0)}%`,
        },
      ],
      metrics: [
        { label: L("Velocidade", "Speed"), value: speed, unit: "m/s", color: "#4D9FFF" },
        { label: L("Altitude", "Altitude"), value: s.y / 1000, unit: "km", color: "#F5B83D" },
      ],
      energies: [
        { label: L("Cinética", "Kinetic"), value: 0.5 * mass * speed * speed, color: "#4d9fff" },
        { label: L("Potencial", "Potential"), value: env.g > 0 ? mass * env.g * env.radius * (s.y / (env.radius + s.y)) : 0, color: "#e7c96a" },
        { label: L("Dissipada", "Dissipated"), value: s.eDrag, color: "#ff6b2b" },
      ],
      note,
      source: L(
        "O empuxo acontece DENTRO do motor, no instante em que o gás é expelido. O gás é jogado para um lado e o foguete " +
          "vai para o outro com a mesma força - exatamente como o revólver. Por isso funciona (melhor!) no vácuo.",
        "Thrust happens INSIDE the engine, the moment the gas is expelled. The gas is thrown one way and the rocket " +
          "goes the other with the same force - exactly like the revolver. That's why it works (better!) in vacuum.",
      ),
      particles: firing
        ? [
            // Jato central rápido (gás expelido para BAIXO - empurra o foguete para cima).
            {
              at: base,
              dir: nozzleDir,
              // No vácuo o jato se expande mais (sem contrapressão do ar).
              speed: env.airDensity <= 0.01 ? 64 : 40,
              spread: (env.airDensity <= 0.01 ? 0.45 : 0.1) + Math.abs(s.gimbal) * 2,
              count: env.airDensity <= 0.01 ? 30 : 16,
              kind: "exhaust",
            },
            // Plume mais lento e largo dá volume ao gás (bem aberto no vácuo).
            {
              at: base,
              dir: nozzleDir,
              speed: env.airDensity <= 0.01 ? 34 : 20,
              spread: (env.airDensity <= 0.01 ? 0.9 : 0.25) + Math.abs(s.gimbal) * 2,
              count: env.airDensity <= 0.01 ? 18 : 8,
              kind: "smoke",
            },
          ]
        : [],
      shocks,
      cameraTarget: com,
    };
  },
};
