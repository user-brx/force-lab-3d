// Ponto de entrada do núcleo de física.

export * from "./math";
export * from "./constants";
export * from "./types";
export * from "./i18n";
export {
  PLANETS,
  SURFACES,
  PLANET_ORDER,
  SURFACE_ORDER,
  makeEnvironment,
  planetLabel,
  planetDesc,
  surfaceLabel,
  surfaceDesc,
} from "./environments";

export { BARRIER_MATERIALS, BARRIER_CENTER_Y, BARRIER_HEIGHT } from "./scenarios/revolver";
export type { BarrierMaterial } from "./scenarios/revolver";

import { airplane } from "./scenarios/airplane";
import { car } from "./scenarios/car";
import { person } from "./scenarios/person";
import { revolver } from "./scenarios/revolver";
import { rocket } from "./scenarios/rocket";
import { skaters } from "./scenarios/skaters";
import type { Scenario } from "./types";

/** Registro de todos os cenários, na ordem de exibição. */
export const SCENARIOS: Record<string, Scenario<unknown>> = {
  pessoa: person as Scenario<unknown>,
  carro: car as Scenario<unknown>,
  aviao: airplane as Scenario<unknown>,
  foguete: rocket as Scenario<unknown>,
  revolver: revolver as Scenario<unknown>,
  patinadores: skaters as Scenario<unknown>,
};

export type ScenarioId = keyof typeof SCENARIOS;

export const SCENARIO_ORDER: string[] = ["pessoa", "carro", "aviao", "foguete", "revolver", "patinadores"];
