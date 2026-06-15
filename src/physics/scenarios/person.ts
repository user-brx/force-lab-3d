import { EARTH_MASS } from "../constants";
import { auto, fmt } from "../format";
import { L } from "../i18n";
import { clamp, vec } from "../math";
import type { Scenario, SceneView, ShockEmit } from "../types";

// Pessoa caminhando.
// Os músculos aplicam uma força contra o chão para manter a velocidade de
// caminhada, vencendo uma resistência (ar + perdas). O atrito estático limita
// quanto dessa força vira propulsão. 3ª lei: a MESMA força de propulsão vai
// para o astro — que mal acelera (massa enorme).

interface PersonState {
  x: number;
  v: number;
  propulsion: number; // força de propulsão (pé↔chão), N
  resist: number; // resistência ao movimento, N
  accel: number; // aceleração real (líquida), m/s²
  slipping: boolean;
  aBody: number; // aceleração do astro, m/s²
  fsMax: number; // atrito estático máximo, N
  stepPhase: number;
  shockT: number;
  events: ShockEmit[];
}

const V_TARGET = 1.5; // velocidade de caminhada confortável (m/s)
const B_RESIST = 20; // resistência ~ ar + perdas (N por m/s)

export const person: Scenario<PersonState> = {
  id: "pessoa",
  label: "Pessoa",
  labelEn: "Person",
  icon: "🚶",
  blurb: "Ação e reação no caminhar — e por que o chão não se move.",
  surfaces: ["asfalto", "gelo", "areia"],
  defaultPlanet: "terra",
  params: {
    massa: { label: "Massa", labelEn: "Mass", min: 40, max: 120, step: 1, default: 70, unit: "kg" },
    forca: { label: "Força muscular", labelEn: "Muscle force", min: 100, max: 800, step: 10, default: 380, unit: "N" },
  },

  init: () => ({
    x: 0,
    v: 0,
    propulsion: 0,
    resist: 0,
    accel: 0,
    slipping: false,
    aBody: 0,
    fsMax: 0,
    stepPhase: 0,
    shockT: 0,
    events: [],
  }),

  step(s, env, params, _c, dt) {
    const m = params.massa ?? 70;
    const fMax = params.forca ?? 380;
    const N = m * env.g;
    s.fsMax = env.muS * N;

    if (env.g <= 0) {
      s.propulsion = 0;
      s.resist = 0;
      s.accel = 0;
      s.slipping = false;
      s.aBody = 0;
      return;
    }

    s.resist = B_RESIST * s.v;
    const desired = clamp((V_TARGET - s.v) * m * 2.5 + s.resist, -fMax, fMax);

    if (Math.abs(desired) <= s.fsMax) {
      s.propulsion = desired;
      s.slipping = false;
    } else {
      s.slipping = true;
      s.propulsion = Math.sign(desired) * env.muK * N;
    }

    const net = s.propulsion - s.resist;
    s.accel = net / m; // 2ª lei (aceleração real da pessoa)
    s.aBody = s.propulsion / (env.bodyMass || EARTH_MASS); // 2ª lei para o astro

    s.v = Math.max(0, s.v + s.accel * dt);
    s.x += s.v * dt;
    s.stepPhase += Math.abs(s.v) * dt * 2.2;

    // Onda de choque a cada passada (a força sendo entregue ao chão).
    s.shockT += dt;
    if (s.v > 0.25 && s.shockT > 0.34) {
      s.shockT = 0;
      s.events.push({
        at: vec(s.x, 0.02, 0),
        kind: "ring",
        color: s.slipping ? "#ff8a3c" : "#8fb4e0",
        maxRadius: 1.1,
        life: 0.6,
      });
    }
  },

  view(s, env, params): SceneView {
    const m = params.massa ?? 70;
    const weight = m * env.g;
    const com = vec(s.x, 0.95, 0);
    const foot = vec(s.x, 0.02, 0);
    const shocks = s.events;
    s.events = [];

    return {
      bodies: [{ id: "person", position: vec(s.x, 0, 0), rotation: 0, phase: s.stepPhase }],
      forces: [
        {
          kind: "action",
          label: "AÇÃO — pé empurra o chão",
          origin: foot,
          dir: vec(-1, 0, 0),
          magnitude: Math.abs(s.propulsion),
        },
        {
          kind: "reaction",
          label: "REAÇÃO — chão empurra a pessoa",
          origin: foot,
          dir: vec(1, 0, 0),
          magnitude: Math.abs(s.propulsion),
        },
        {
          kind: "drag",
          label: "RESISTÊNCIA",
          origin: vec(s.x, 1.0, 0),
          dir: vec(-1, 0, 0),
          magnitude: s.resist,
        },
        { kind: "weight", label: "PESO", origin: com, dir: vec(0, -1, 0), magnitude: weight },
        { kind: "normal", label: "NORMAL", origin: foot, dir: vec(0, 1, 0), magnitude: weight },
      ],
      readouts: [
        { label: L("Velocidade", "Speed"), value: fmt(s.v, 2), unit: "m/s" },
        { label: L("Força de propulsão", "Propulsion force"), value: fmt(Math.abs(s.propulsion), 0), unit: "N" },
        { label: L("Atrito estático máx.", "Max static friction"), value: fmt(s.fsMax, 0), unit: "N" },
        { label: L("Aceleração da pessoa", "Person's acceleration"), value: fmt(s.accel, 3), unit: "m/s²", highlight: true },
        {
          label: L(`Aceleração d${artigo(env.planetLabel)} ${env.planetLabel}`, `${env.planetLabel}'s acceleration`),
          value: auto(Math.abs(s.aBody), 2),
          unit: "m/s²",
          highlight: true,
        },
      ],
      bars: [],
      metrics: [{ label: L("Velocidade", "Speed"), value: s.v, unit: "m/s", color: "#4D9FFF" }],
      note:
        env.g <= 0
          ? L("Sem gravidade não há atrito para empurrar — sem caminhada.", "No gravity means no friction to push against — no walking.")
          : s.slipping
            ? L(
                "Escorregando: a força pedida passou do atrito estático. Só o atrito cinético empurra.",
                "Slipping: the requested force exceeded static friction. Only kinetic friction pushes.",
              )
            : L(
                `Caminhada: o atrito estático segura a força muscular. A mesma força vai para ${env.planetLabel}.`,
                `Walking: static friction holds the muscle force. The same force goes into ${env.planetLabel}.`,
              ),
      source: L(
        `A pessoa empurra o chão para trás; o chão empurra a pessoa para frente com a MESMA força. ` +
          `Essa força também vai para ${env.planetLabel} — mas a massa de ${auto(env.bodyMass, 1)} kg faz a aceleração dele ser praticamente zero.`,
        `The person pushes the ground backward; the ground pushes the person forward with the SAME force. ` +
          `That force also goes into ${env.planetLabel} — but its mass of ${auto(env.bodyMass, 1)} kg makes its acceleration practically zero.`,
      ),
      particles:
        env.g > 0 && (s.slipping || Math.abs(s.v) > 0.2)
          ? [
              {
                at: foot,
                dir: vec(-1, 0.4, 0),
                speed: s.slipping ? 2.5 : 0.8,
                spread: 0.5,
                count: s.slipping ? 3 : 1,
                kind: "dust",
              },
            ]
          : [],
      shocks,
      cameraTarget: com,
    };
  },
};

// Artigo para o nome do astro: femininos levam "a", os demais "o".
function artigo(label: string): string {
  return ["Terra", "Lua", "Vênus"].includes(label) ? "a" : "o";
}
