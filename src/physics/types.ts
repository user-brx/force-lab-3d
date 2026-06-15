import type { Vec3 } from "./math";

/** Identificadores estáveis de cada tipo de força (mapeiam para cor/rótulo na UI). */
export type ForceKind =
  | "action"
  | "reaction"
  | "weight"
  | "normal"
  | "drag"
  | "thrust"
  | "lift"
  | "push";

/** Um vetor de força a ser desenhado como seta 3D com rótulo. */
export interface ForceArrow {
  kind: ForceKind;
  label: string;
  /** Ponto de aplicação, em unidades de cena (metros do mundo virtual). */
  origin: Vec3;
  /** Direção unitária. */
  dir: Vec3;
  /** Módulo em newtons (usado para o comprimento da seta e o rótulo). */
  magnitude: number;
}

/** Uma linha de medida no HUD. */
export interface Readout {
  label: string;
  value: string;
  unit?: string;
  /** Destaca a linha como "ponto-chave" didático. */
  highlight?: boolean;
}

/** Uma série numérica para o gráfico em tempo real. */
export interface Metric {
  label: string;
  value: number;
  unit: string;
  color: string;
}

/** Uma barra (energia, combustível, etc.). */
export interface Bar {
  label: string;
  /** 0..1 */
  value: number;
  color: string;
  caption?: string;
}

/** Pose de um corpo rígido para o renderizador posicionar a malha. */
export interface BodyPose {
  id: string;
  position: Vec3;
  /** Rotação em torno do eixo Z (rad), plano da simulação. */
  rotation?: number;
  /** Escala opcional (default 1). */
  scale?: number;
  /** Fase de animação (ex.: passada da caminhada), em radianos. */
  phase?: number;
}

/** Pedido de emissão de uma onda de choque (evento discreto). */
export interface ShockEmit {
  at: Vec3;
  /** "ring" = anel achatado no chão; "blast" = domo/esfera de pressão no ar. */
  kind: "ring" | "blast";
  color: string;
  /** Raio máximo que o choque alcança (unidades de cena). */
  maxRadius: number;
  /** Duração da expansão (s). */
  life: number;
}

/** Pedido de emissão de partículas neste frame (gás, fumaça, poeira). */
export interface ParticleEmit {
  at: Vec3;
  dir: Vec3;
  /** Velocidade base das partículas (m/s de cena). */
  speed: number;
  /** Abertura do cone (rad). */
  spread: number;
  count: number;
  /** Tipo da partícula: gás quente, fumaça, poeira ou fluxo de ar. */
  kind: "exhaust" | "smoke" | "dust" | "air";
}

/** Snapshot que o renderizador consome a cada frame. */
export interface SceneView {
  bodies: BodyPose[];
  forces: ForceArrow[];
  readouts: Readout[];
  bars: Bar[];
  /** Séries para o gráfico em tempo real (opcional). */
  metrics?: Metric[];
  /** Aviso contextual (ex.: "TWR < 1, não decola"). */
  note: string;
  /** Cartão "de onde vem a força". */
  source: string;
  particles: ParticleEmit[];
  /** Ondas de choque a disparar neste frame (opcional). */
  shocks?: ShockEmit[];
  /** Câmera-alvo sugerida (o renderizador segue suavemente). */
  cameraTarget?: Vec3;
  /** Escala de tempo da simulação (1 = normal; <1 = câmera lenta, ex.: bullet time). */
  timeScale?: number;
}

/** Um corpo celeste: define gravidade e atmosfera. */
export interface Planet {
  id: string;
  label: string;
  labelEn: string;
  emoji: string;
  /** Gravidade superficial (m/s²). 0 = sem gravidade. */
  g: number;
  /** Densidade do ar na superfície (kg/m³). 0 = vácuo. */
  airDensity: number;
  /** Altura de escala da atmosfera (m), para o arrasto em altitude. */
  scaleHeight: number;
  /** Massa do astro (kg) — recebe a reação (3ª lei). */
  bodyMass: number;
  /** Raio do astro (m) — para a queda da gravidade com a altitude. */
  radius: number;
  /** Velocidade do som na atmosfera (m/s) — para o número de Mach. */
  soundSpeed: number;
  /** Cor de fundo do céu (hex). */
  skyTint: string;
  desc: string;
  descEn: string;
}

/** Uma superfície de contato: define o atrito. */
export interface Surface {
  id: string;
  label: string;
  labelEn: string;
  muS: number;
  muK: number;
  restitution: number;
  /** Cor base do chão (hex). */
  color: string;
  desc: string;
  descEn: string;
}

/** Ambiente efetivo (planeta + superfície) entregue aos cenários. */
export interface Environment {
  // do planeta
  g: number;
  airDensity: number;
  scaleHeight: number;
  bodyMass: number;
  radius: number;
  soundSpeed: number;
  planetLabel: string;
  skyTint: string;
  // da superfície
  muS: number;
  muK: number;
  restitution: number;
  color: string;
}

/** Entradas transientes do usuário, lidas a cada frame. */
export interface Controls {
  /** Gimbal/empurrão para a esquerda mantido. */
  left: boolean;
  /** Gimbal/empurrão para a direita mantido. */
  right: boolean;
  /** Gatilho de evento único (atirar, empurrar). Consumido pelo cenário. */
  fire: boolean;
  /** Gatilho de disparo em modo Matrix (atirar + acompanhar). */
  matrixFire?: boolean;
  /** Modo "segurar arma" (apenas revólver). */
  hold: boolean;
}

export const emptyControls = (): Controls => ({
  left: false,
  right: false,
  fire: false,
  hold: false,
});

/** Parâmetros ajustáveis por slider, por cenário (todos opcionais). */
export interface Params {
  [key: string]: number;
}

/**
 * Contrato de um cenário. `S` é o tipo do estado mutável interno.
 * Tudo é função pura sobre o estado — fácil de testar contra a solução analítica.
 */
export interface Scenario<S = unknown> {
  id: string;
  label: string;
  labelEn: string;
  icon: string;
  /** Descrição curta para a UI. */
  blurb: string;
  /** Superfícies válidas (ids). Vazio = cenário não usa atrito de contato. */
  surfaces: string[];
  /** Planeta inicial (id). */
  defaultPlanet: string;
  /** Sliders expostos. */
  params: Record<
    string,
    {
      label: string;
      labelEn: string;
      min: number;
      max: number;
      step: number;
      default: number;
      unit: string;
    }
  >;
  /** Cria o estado inicial. */
  init(env: Environment, params: Params): S;
  /** Avança a física em dt segundos (mutável). */
  step(state: S, env: Environment, params: Params, controls: Controls, dt: number): void;
  /** Produz o snapshot para o renderizador. */
  view(state: S, env: Environment, params: Params): SceneView;
}
