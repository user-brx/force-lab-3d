import { create } from "zustand";
import {
  PLANETS,
  SCENARIOS,
  SURFACES,
  setLang as setLangCore,
  type Bar,
  type Lang,
  type Readout,
} from "../physics";

export interface HudData {
  readouts: Readout[];
  bars: Bar[];
  note: string;
  source: string;
}

interface AppState {
  scenarioId: string;
  planetId: string;
  surfaceId: string;
  /** Valores atuais dos sliders, por cenário. */
  params: Record<string, Record<string, number>>;
  paused: boolean;
  slowmo: boolean;
  showVectors: boolean;
  showParticles: boolean;
  /** Auto-órbita da câmera (ver de vários ângulos). */
  autoRotate: boolean;
  /** Idioma da interface. */
  lang: Lang;
  /** Painéis laterais abertos (relevante no mobile). */
  panelsOpen: boolean;
  /** Modo "segurar arma" (revólver). */
  hold: boolean;
  /** Incrementado para forçar reinício da simulação. */
  resetToken: number;
  hud: HudData;

  setScenario: (id: string) => void;
  setPlanet: (id: string) => void;
  setSurface: (id: string) => void;
  setParam: (key: string, value: number) => void;
  togglePause: () => void;
  toggleSlowmo: () => void;
  toggleVectors: () => void;
  toggleParticles: () => void;
  toggleAutoRotate: () => void;
  setLang: (l: Lang) => void;
  togglePanels: () => void;
  toggleHold: () => void;
  reset: () => void;
  setHud: (hud: HudData) => void;
}

function defaultParams(scenarioId: string): Record<string, number> {
  const out: Record<string, number> = {};
  const sc = SCENARIOS[scenarioId];
  for (const [k, def] of Object.entries(sc.params)) out[k] = def.default;
  return out;
}

function buildAllParams(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const id of Object.keys(SCENARIOS)) out[id] = defaultParams(id);
  return out;
}

const defaultSurface = (scenarioId: string): string => SCENARIOS[scenarioId].surfaces[0] ?? "asfalto";

const LANG_KEY = "forcas-lang";

// Idioma inicial: preferência salva > idioma do navegador > português.
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "pt" || saved === "en") return saved;
    if (navigator.language?.toLowerCase().startsWith("en")) return "en";
  } catch {
    /* ambiente sem localStorage/navigator */
  }
  return "pt";
}

const startLang = initialLang();
setLangCore(startLang); // sincroniza o núcleo de física já na carga

const emptyHud: HudData = { readouts: [], bars: [], note: "", source: "" };

export const useStore = create<AppState>((set, get) => ({
  scenarioId: "pessoa",
  planetId: SCENARIOS.pessoa.defaultPlanet,
  surfaceId: defaultSurface("pessoa"),
  params: buildAllParams(),
  paused: false,
  slowmo: false,
  showVectors: true,
  showParticles: true,
  autoRotate: false,
  lang: startLang,
  panelsOpen: false,
  hold: false,
  resetToken: 0,
  hud: emptyHud,

  setScenario: (id) => {
    if (!SCENARIOS[id]) return;
    set((s) => ({
      scenarioId: id,
      planetId: SCENARIOS[id].defaultPlanet,
      surfaceId: defaultSurface(id),
      hold: false,
      resetToken: s.resetToken + 1,
    }));
  },
  setPlanet: (id) => {
    if (!PLANETS[id]) return;
    set((s) => ({ planetId: id, resetToken: s.resetToken + 1 }));
  },
  setSurface: (id) => {
    if (!SURFACES[id]) return;
    set((s) => ({ surfaceId: id, resetToken: s.resetToken + 1 }));
  },
  setParam: (key, value) => {
    const { scenarioId, params } = get();
    set({
      params: { ...params, [scenarioId]: { ...params[scenarioId], [key]: value } },
      resetToken: get().resetToken + 1,
    });
  },
  togglePause: () => set((s) => ({ paused: !s.paused })),
  toggleSlowmo: () => set((s) => ({ slowmo: !s.slowmo })),
  toggleVectors: () => set((s) => ({ showVectors: !s.showVectors })),
  toggleParticles: () => set((s) => ({ showParticles: !s.showParticles })),
  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  setLang: (l) => {
    setLangCore(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignora */
    }
    set({ lang: l });
  },
  togglePanels: () => set((s) => ({ panelsOpen: !s.panelsOpen })),
  toggleHold: () => set((s) => ({ hold: !s.hold })),
  reset: () => set((s) => ({ resetToken: s.resetToken + 1 })),
  setHud: (hud) => set({ hud }),
}));
