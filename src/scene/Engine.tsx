import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { SCENARIOS, makeEnvironment, type Environment, type Scenario } from "../physics";
import { useStore } from "../state/store";
import { runtime } from "./runtime";

const STEP = 1 / 240; // passo fixo de integração (s)
const MAX_SUBSTEPS = 12;
const HUD_INTERVAL = 0.12; // s

interface Sim {
  state: unknown;
  scenario: Scenario<unknown>;
  env: Environment;
  scenarioId: string;
  planetId: string;
  surfaceId: string;
  token: number;
}

// Coração do app: avança a física com passo fixo e publica o snapshot.
// Vive dentro do <Canvas> mas não renderiza nada.
export function Engine() {
  const sim = useRef<Sim | null>(null);
  const acc = useRef(0);
  const hudClock = useRef(0);

  useFrame((_, delta) => {
    const st = useStore.getState();
    const scenario = SCENARIOS[st.scenarioId];
    const env = makeEnvironment(st.planetId, st.surfaceId);
    const params = st.params[st.scenarioId] ?? {};

    // (Re)inicializa quando muda o cenário, planeta, superfície, ou um slider (token).
    if (
      !sim.current ||
      sim.current.token !== st.resetToken ||
      sim.current.scenarioId !== st.scenarioId ||
      sim.current.planetId !== st.planetId ||
      sim.current.surfaceId !== st.surfaceId
    ) {
      sim.current = {
        state: scenario.init(env, params),
        scenario,
        env,
        scenarioId: st.scenarioId,
        planetId: st.planetId,
        surfaceId: st.surfaceId,
        token: st.resetToken,
      };
      acc.current = 0;
    }

    const s = sim.current;
    const controls = {
      left: runtime.input.left,
      right: runtime.input.right,
      fire: runtime.input.fire,
      matrixFire: runtime.input.matrixFire,
      hold: st.hold,
    };

    let dt = Math.min(delta, 0.05);
    if (st.slowmo) dt *= 0.25;
    // Escala de tempo pedida pelo cenário (ex.: bullet time do revólver) — vem
    // do snapshot do frame anterior. Só desacelera DEPOIS que a bala existe, então
    // não "fome" o pulso de disparo no frame em que o tiro acontece.
    dt *= runtime.view?.timeScale ?? 1;
    if (st.paused) dt = 0;

    // Passo semi-fixo: avança a física por EXATAMENTE dt a cada frame, em
    // sub-passos de no máximo STEP. Em câmera lenta (dt < STEP) isso dá 1
    // sub-passo pequeno por frame — a bala se move um pouco SEMPRE, sem pulos.
    acc.current += dt;
    let steps = 0;
    while (acc.current > 1e-6 && steps < MAX_SUBSTEPS) {
      const h = Math.min(STEP, acc.current);
      scenario.step(s.state, env, params, controls, h);
      acc.current -= h;
      steps++;
    }
    // Só consome os pulsos quando um passo realmente rodou — assim um disparo
    // nunca é perdido se o frame não avançou física (pausa/câmera lenta extrema).
    if (steps > 0) {
      runtime.input.fire = false;
      runtime.input.matrixFire = false;
    }

    runtime.view = scenario.view(s.state, env, params);

    hudClock.current += delta;
    if (hudClock.current >= HUD_INTERVAL) {
      hudClock.current = 0;
      const v = runtime.view;
      st.setHud({ readouts: v.readouts, bars: v.bars, note: v.note, source: v.source });
    }
  });

  return null;
}
