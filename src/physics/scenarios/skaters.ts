import { fmt } from "../format";
import { L } from "../i18n";
import { vec } from "../math";
import type { Scenario, SceneView, ShockEmit } from "../types";

// Dois patinadores se empurram. A força é IDÊNTICA nos dois (3ª lei),
// mas a = F/m faz o mais leve sair mais rápido. Momentos iguais e opostos,
// somando zero (no sistema isolado).

interface SkaterState {
  t: number;
  armed: boolean; // só empurram depois de apertar "Empurrar" (Reiniciar deixa parados)
  x1: number;
  v1: number;
  x2: number;
  v2: number;
  F: number; // força de contato atual (N)
  prevPushing: boolean;
  events: ShockEmit[];
}

const PUSH_START = 0.35; // s (pequena espera antes do empurrão, ao apertar o botão)
const PUSH_DUR = 0.4; // s
const GAP = 0.55; // meia-distância inicial entre eles (m)

export const skaters: Scenario<SkaterState> = {
  id: "patinadores",
  label: "Patinadores",
  labelEn: "Skaters",
  icon: "⛸️",
  blurb: "Mesma força, massas diferentes: o leve dispara, o pesado mal anda.",
  surfaces: ["gelo", "asfalto"],
  defaultPlanet: "terra",
  params: {
    massaA: { label: "Massa (azul)", labelEn: "Mass (blue)", min: 30, max: 120, step: 1, default: 60, unit: "kg" },
    massaB: { label: "Massa (vermelho)", labelEn: "Mass (red)", min: 30, max: 120, step: 1, default: 90, unit: "kg" },
    forca: { label: "Força do empurrão", labelEn: "Push force", min: 100, max: 600, step: 10, default: 300, unit: "N" },
  },

  init: () => ({ t: 0, armed: false, x1: -GAP, v1: 0, x2: GAP, v2: 0, F: 0, prevPushing: false, events: [] }),

  step(s, env, params, c, dt) {
    // "Empurrar" reinicia as posições e dispara o empurrão. "Reiniciar" (reset
    // global) recria o estado com armed=false: ficam parados até apertar Empurrar.
    if (c.fire) {
      s.t = 0;
      s.armed = true;
      s.x1 = -GAP;
      s.x2 = GAP;
      s.v1 = 0;
      s.v2 = 0;
    }
    const m1 = params.massaA ?? 60;
    const m2 = params.massaB ?? 90;
    const F = params.forca ?? 300;
    s.t += dt;

    const pushing = s.armed && s.t >= PUSH_START && s.t < PUSH_START + PUSH_DUR;
    s.F = pushing ? F : 0;

    let a1 = 0;
    let a2 = 0;
    if (pushing) {
      a1 = -F / m1;
      a2 = F / m2;
    }

    // Atrito do solo após soltarem (depende do planeta + superfície).
    const fric = (v: number) => {
      if (env.g <= 0 || v === 0) return 0;
      return -Math.sign(v) * env.muK * env.g;
    };
    if (!pushing) {
      a1 += fric(s.v1);
      a2 += fric(s.v2);
    }

    const v1n = s.v1 + a1 * dt;
    const v2n = s.v2 + a2 * dt;
    s.v1 = !pushing && Math.sign(v1n) !== Math.sign(s.v1) ? 0 : v1n;
    s.v2 = !pushing && Math.sign(v2n) !== Math.sign(s.v2) ? 0 : v2n;
    s.x1 += s.v1 * dt;
    s.x2 += s.v2 * dt;

    // Onda de choque no instante do empurrão.
    if (pushing && !s.prevPushing) {
      const cx = (s.x1 + s.x2) / 2;
      s.events.push({ at: vec(cx, 0.9, 0), kind: "blast", color: "#9fc3ff", maxRadius: 1.8, life: 0.5 });
      if (env.g > 0) {
        s.events.push({ at: vec(s.x1, 0.05, 0), kind: "ring", color: "#8fb4e0", maxRadius: 1.3, life: 0.6 });
        s.events.push({ at: vec(s.x2, 0.05, 0), kind: "ring", color: "#8fb4e0", maxRadius: 1.3, life: 0.6 });
      }
    }
    s.prevPushing = pushing;
  },

  view(s, env, params): SceneView {
    const m1 = params.massaA ?? 60;
    const m2 = params.massaB ?? 90;
    const p1 = m1 * s.v1;
    const p2 = m2 * s.v2;
    const total = Math.abs(p1 + p2) < 1e-6 ? 0 : p1 + p2;
    const pushing = s.F > 0;
    const contact = vec((s.x1 + s.x2) / 2, 0.9, 0);
    const shocks = s.events;
    s.events = [];

    return {
      bodies: [
        { id: "skaterA", position: vec(s.x1, 0, 0) },
        { id: "skaterB", position: vec(s.x2, 0, 0) },
      ],
      forces: pushing
        ? [
            {
              kind: "action",
              label: "FORÇA no vermelho",
              origin: contact,
              dir: vec(1, 0, 0),
              magnitude: s.F,
            },
            {
              kind: "reaction",
              label: "FORÇA no azul (igual e oposta)",
              origin: contact,
              dir: vec(-1, 0, 0),
              magnitude: s.F,
            },
          ]
        : [],
      readouts: [
        { label: L("Força em cada um", "Force on each"), value: fmt(s.F, 0), unit: "N" },
        { label: L("Acel. azul (a=F/m)", "Blue accel. (a=F/m)"), value: fmt(s.F / m1, 2), unit: "m/s²" },
        { label: L("Acel. vermelho", "Red accel."), value: fmt(s.F / m2, 2), unit: "m/s²" },
        { label: L("Veloc. azul", "Blue speed"), value: fmt(Math.abs(s.v1), 2), unit: "m/s" },
        { label: L("Veloc. vermelho", "Red speed"), value: fmt(Math.abs(s.v2), 2), unit: "m/s" },
        { label: L("Momento azul", "Blue momentum"), value: fmt(Math.abs(p1), 1), unit: "kg·m/s" },
        { label: L("Momento vermelho", "Red momentum"), value: fmt(Math.abs(p2), 1), unit: "kg·m/s" },
        { label: L("Momento total", "Total momentum"), value: fmt(total, 2), unit: "kg·m/s", highlight: true },
      ],
      bars: [],
      metrics: [
        { label: L("Veloc. azul", "Blue speed"), value: Math.abs(s.v1), unit: "m/s", color: "#4D9FFF" },
        { label: L("Veloc. vermelho", "Red speed"), value: Math.abs(s.v2), unit: "m/s", color: "#FF5A4D" },
      ],
      note: !s.armed
        ? L("Pressione EMPURRAR para os patinadores se empurrarem.", "Press PUSH to make the skaters shove each other.")
        : pushing
          ? L("Empurrando: a mesma força nos dois. O azul (mais leve) acelera mais.", "Pushing: the same force on both. Blue (lighter) accelerates more.")
          : env.g > 0
            ? L(
                "Soltaram. O atrito (força externa) freia os dois e retira momento - por isso o total deixa de ser zero.",
                "They let go. Friction (an external force) slows both and removes momentum - so the total stops being zero.",
              )
            : L(
                "Soltaram. Sistema isolado: o momento total continua exatamente zero, para sempre.",
                "They let go. Isolated system: total momentum stays exactly zero, forever.",
              ),
      source: L(
        "A força que o azul faz no vermelho é idêntica à que o vermelho faz no azul (3ª lei). " +
          "Como a = F/m, o mais leve sai mais rápido. Os momentos são iguais e opostos e somam zero.",
        "The force blue exerts on red is identical to the one red exerts on blue (3rd law). " +
          "Since a = F/m, the lighter one moves away faster. The momenta are equal and opposite and sum to zero.",
      ),
      particles: [],
      shocks,
      cameraTarget: contact,
    };
  },
};
