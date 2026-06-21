import { airDensityAt } from "../constants";
import { fmt, sci } from "../format";
import { L } from "../i18n";
import { vec } from "../math";
import type { Scenario, SceneView, ShockEmit, SceneLabel } from "../types";

// Queda livre / Energia cinética. Um objeto cai de uma altura h com velocidade
// inicial v0. A energia potencial (m·g·h) vira cinética (½·m·v²); o arrasto do ar
// (depende da FORMA) dissipa parte. No impacto, a energia cinética é "liberada".
// Tudo em SI, fórmulas reais - dá para simular de uma pedra a um pequeno asteroide.

interface FallState {
  y: number; // altura atual (m)
  v: number; // velocidade (m/s, para baixo positivo)
  t: number; // tempo de queda (s)
  dropped: boolean;
  landed: boolean;
  eDrag: number; // energia dissipada por arrasto (J)
  impactV: number; // velocidade no impacto (m/s)
  impactKE: number; // energia cinética no impacto (J)
  prevFire: boolean;
  events: ShockEmit[];
}

// Densidade de referência do objeto (rocha) - define o TAMANHO a partir da massa.
// Objetos maiores têm menor razão área/massa → o ar quase não os freia (como meteoros).
const RHO_OBJ = 3000; // kg/m³
const TNT_J = 4.184e6; // J por kg de TNT
const HIROSHIMA_J = 6.3e13; // J (~15 kton)

interface Shape {
  id: string;
  label: string;
  labelEn: string;
  cd: number;
  areaFactor: number; // fração da área da esfera equivalente (cubo é tratado à parte)
}

export const FALL_SHAPES: Shape[] = [
  { id: "bola", label: "Bola", labelEn: "Ball", cd: 0.47, areaFactor: 1.0 },
  { id: "cubo", label: "Cubo", labelEn: "Cube", cd: 1.05, areaFactor: 1.0 },
  { id: "lanca", label: "Lança", labelEn: "Spear", cd: 0.1, areaFactor: 0.22 },
  { id: "aero", label: "Aerodinâmico", labelEn: "Streamlined", cd: 0.04, areaFactor: 0.55 },
];

/** Coeficiente de arrasto e área frontal a partir da massa e da forma. */
function shapeProps(idx: number, mass: number): { cd: number; area: number; shape: Shape } {
  const shape = FALL_SHAPES[idx] ?? FALL_SHAPES[0];
  const V = mass / RHO_OBJ;
  const rSphere = Math.cbrt((3 * V) / (4 * Math.PI));
  const area = shape.id === "cubo" ? Math.cbrt(V) ** 2 : Math.PI * rSphere * rSphere * shape.areaFactor;
  return { cd: shape.cd, area, shape };
}

/** Energia em equivalente de TNT / bombas de Hiroshima, para dar escala ao impacto. */
function energyEquivalent(j: number): string {
  if (j >= HIROSHIMA_J) return `${fmt(j / HIROSHIMA_J, 1)}× ${L("bomba de Hiroshima", "Hiroshima bomb")}`;
  const tnt = j / TNT_J; // kg de TNT
  if (tnt >= 1e6) return `${fmt(tnt / 1e6, 1)} ${L("kton de TNT", "kton TNT")}`;
  if (tnt >= 1e3) return `${fmt(tnt / 1e3, 1)} ${L("t de TNT", "t TNT")}`;
  if (tnt >= 1) return `${fmt(tnt, 1)} ${L("kg de TNT", "kg TNT")}`;
  return `${fmt(tnt * 1000, 0)} ${L("g de TNT", "g TNT")}`;
}

// --- Efeitos do impacto (cratera + onda de choque) ---------------------------
const RHO_TARGET = 2500; // densidade do solo-alvo (rocha, kg/m³)

/** Diâmetro do impactor (m), tratado como esfera. */
function impactorDiameter(mass: number): number {
  return Math.cbrt((6 * mass) / (Math.PI * RHO_OBJ));
}

/**
 * Diâmetro da cratera final (m) pela lei de escala de Collins, Melosh & Marcus
 * (2005), "Earth Impact Effects Program" - regime de gravidade, impacto vertical:
 *   D_transiente = 1.161·(ρi/ρt)^(1/3)·L^0.78·v^0.44·g^(-0.22)
 *   D_final ≈ 1.25·D_transiente (cratera simples)
 */
function craterDiameter(mass: number, v: number, g: number): number {
  if (g <= 0 || v <= 0) return 0;
  const L = impactorDiameter(mass);
  const Dtc = 1.161 * Math.cbrt(RHO_OBJ / RHO_TARGET) * L ** 0.78 * v ** 0.44 * g ** -0.22;
  return 1.25 * Dtc;
}

/**
 * Raio (m) de uma dada sobrepressão pela escala cubo-raiz (Hopkinson-Cranz):
 * R = Z·(kg de TNT)^(1/3). Z em m/kg^(1/3): ~9.5 → destruição severa (~5 psi),
 * ~35 → vidros quebrados (~1 psi). Glasstone & Dolan, "Effects of Nuclear Weapons".
 */
function blastRadius(energyJ: number, z: number): number {
  return z * Math.cbrt(energyJ / TNT_J);
}

/** Formata uma distância em m ou km. */
function fmtDist(m: number): string {
  if (m >= 1000) return `${fmt(m / 1000, m >= 10000 ? 0 : 1)} km`;
  return `${fmt(m, m < 10 ? 1 : 0)} m`;
}

export const freefall: Scenario<FallState> = {
  id: "queda",
  label: "Queda / Energia",
  labelEn: "Free Fall / Energy",
  icon: "☄️",
  blurb: "Objeto caindo: energia potencial vira cinética; a forma muda o arrasto. Dá até para soltar um asteroide.",
  surfaces: [],
  defaultPlanet: "terra",
  params: {
    // Até 100 km (linha de Kármán) - dá para soltar do espaço e ver a reentrada.
    altura: { label: "Altura", labelEn: "Height", min: 5, max: 100000, step: 5, default: 100, unit: "m" },
    massa: { label: "Massa", labelEn: "Mass", min: 1, max: 1000000, step: 1, default: 10, unit: "kg" },
    velInicial: { label: "Veloc. inicial", labelEn: "Initial speed", min: 0, max: 30000, step: 10, default: 0, unit: "m/s" },
    // 0=bola, 1=cubo, 2=lança, 3=aerodinâmico. UI por botões (não slider).
    forma: { label: "Forma", labelEn: "Shape", min: 0, max: FALL_SHAPES.length - 1, step: 1, default: 0, unit: "" },
  },

  init: (_env, params) => ({
    y: params.altura ?? 50,
    v: 0,
    t: 0,
    dropped: false,
    landed: false,
    eDrag: 0,
    impactV: 0,
    impactKE: 0,
    prevFire: false,
    events: [],
  }),

  step(s, env, params, c, dt) {
    const h = params.altura ?? 50;
    const m = params.massa ?? 10;
    const v0 = params.velInicial ?? 0;
    const { cd, area } = shapeProps(Math.round(params.forma ?? 0), m);
    const g = env.g;

    // Soltar (rising-edge): inicia a queda com velocidade inicial v0 (para baixo).
    if (c.fire && !s.prevFire) {
      s.dropped = true;
      s.landed = false;
      s.y = h;
      s.v = v0;
      s.t = 0;
      s.eDrag = 0;
      s.impactV = 0;
      s.impactKE = 0;
    }
    s.prevFire = c.fire;

    if (!s.dropped || s.landed) return;

    // Arrasto do ar: F = ½·ρ·v²·Cd·A (oposto ao movimento). ρ varia com a altitude.
    const rho = env.airDensity > 0 ? airDensityAt(s.y, env.airDensity, env.scaleHeight) : 0;
    const drag = 0.5 * rho * cd * area * s.v * s.v;
    const a = g - (s.v > 0 ? drag / m : 0); // arrasto só freia enquanto desce
    s.v += a * dt;
    s.y -= s.v * dt;
    s.t += dt;
    if (s.v > 0) s.eDrag += drag * s.v * dt;

    if (s.y <= 0) {
      s.y = 0;
      s.landed = true;
      s.impactV = s.v;
      s.impactKE = 0.5 * m * s.v * s.v;
      // Onda de choque: o tamanho cresce (em log) com a energia liberada.
      const mag = Math.min(1, Math.log10(1 + s.impactKE) / 14);
      s.events.push({ at: vec(0, 0.3, 0), kind: "blast", color: "#ffffff", maxRadius: 1.5 + mag * 7, life: 0.18 }); // clarão
      s.events.push({ at: vec(0, 0.6, 0), kind: "blast", color: "#ffc24d", maxRadius: 2 + mag * 15, life: 0.45 }); // bola de fogo
      s.events.push({ at: vec(0, 1.0, 0), kind: "blast", color: "#ff7a2c", maxRadius: 1.5 + mag * 11, life: 0.75 }); // fumaça subindo
      s.events.push({ at: vec(0, 0.05, 0), kind: "ring", color: "#ffce8a", maxRadius: 4 + mag * 36, life: 1.0 }); // onda de choque no solo
      s.events.push({ at: vec(0, 0.05, 0), kind: "ring", color: "#9fb0c8", maxRadius: 2 + mag * 24, life: 0.75 }); // anel de poeira
    }
  },

  view(s, env, params): SceneView {
    const h = params.altura ?? 50;
    const m = params.massa ?? 10;
    const v0 = params.velInicial ?? 0;
    const { cd, area } = shapeProps(Math.round(params.forma ?? 0), m);
    const g = env.g;

    const speed = s.v;
    const ke = 0.5 * m * speed * speed;
    const pe = g > 0 ? m * g * Math.max(0, s.y) : 0;
    const e0 = (g > 0 ? m * g * h : 0) + 0.5 * m * v0 * v0;
    const vTerm =
      g > 0 && env.airDensity > 0 && area > 0 ? Math.sqrt((2 * m * g) / (env.airDensity * cd * area)) : Infinity;
    const drag = env.airDensity > 0 ? 0.5 * env.airDensity * cd * area * speed * speed : 0;

    const objPos = vec(0, Math.max(0.3, s.y), 0);
    const shocks = s.events;
    s.events = [];

    const forces = [];
    if (s.dropped && !s.landed) {
      forces.push({ kind: "weight" as const, label: L("PESO (m·g)", "WEIGHT (m·g)"), origin: objPos, dir: vec(0, -1, 0), magnitude: m * g });
      if (drag > 0) forces.push({ kind: "drag" as const, label: L("ARRASTO do ar", "Air DRAG"), origin: objPos, dir: vec(0, 1, 0), magnitude: drag });
    }

    const readouts = [
      { label: L("Altura", "Height"), value: fmt(Math.max(0, s.y), 1), unit: "m" },
      { label: L("Velocidade", "Speed"), value: fmt(speed, 1), unit: "m/s", highlight: true },
      { label: L("Veloc. terminal", "Terminal speed"), value: isFinite(vTerm) ? fmt(vTerm, 1) : "∞", unit: "m/s" },
      { label: L("Energia cinética", "Kinetic energy"), value: sci(ke, 2), unit: "J" },
      { label: L("Energia potencial", "Potential energy"), value: sci(pe, 2), unit: "J" },
      { label: L("Tempo de queda", "Fall time"), value: fmt(s.t, 2), unit: "s" },
    ];
    if (s.landed) {
      const craterD = craterDiameter(m, s.impactV, g);
      const craterDepth = craterD * 0.2; // cratera simples ~1:5
      readouts.push(
        { label: L("Veloc. de impacto", "Impact speed"), value: fmt(s.impactV, 1), unit: "m/s", highlight: true },
        { label: L("Energia no impacto", "Impact energy"), value: sci(s.impactKE, 2), unit: "J", highlight: true },
        { label: L("Equivale a", "Equivalent to"), value: energyEquivalent(s.impactKE), unit: "", highlight: true },
      );
      if (g > 0 && craterD > 0) {
        readouts.push(
          { label: L("Cratera (diâmetro)", "Crater (diameter)"), value: fmtDist(craterD), unit: "" },
          { label: L("Cratera (profundidade)", "Crater (depth)"), value: fmtDist(craterDepth), unit: "" },
          { label: L("Destruição severa até", "Severe destruction to"), value: fmtDist(blastRadius(s.impactKE, 9.5)), unit: "" },
          { label: L("Vidros quebrados até", "Windows shattered to"), value: fmtDist(blastRadius(s.impactKE, 35)), unit: "" },
        );
      }
    }

    let note: string;
    if (g <= 0) note = L("Sem gravidade: o objeto não cai (1ª lei). Escolha um planeta com gravidade.", "No gravity: the object doesn't fall (1st law). Pick a planet with gravity.");
    else if (!s.dropped) note = L("Pressione SOLTAR. A energia potencial m·g·h vira cinética ½·m·v² na queda.", "Press DROP. Potential energy m·g·h becomes kinetic ½·m·v² as it falls.");
    else if (s.landed) note = L("Impacto! Toda a energia cinética é liberada de uma vez (calor, som, deformação, cratera).", "Impact! All the kinetic energy is released at once (heat, sound, deformation, crater).");
    else if (isFinite(vTerm) && speed > vTerm * 0.97) note = L("Velocidade terminal: o arrasto igualou o peso, a queda para de acelerar.", "Terminal speed: drag matched weight, the fall stops accelerating.");
    else note = L("Caindo: a potencial vira cinética. A forma muda o arrasto (a aerodinâmica cai mais rápido).", "Falling: potential turns into kinetic. The shape changes drag (the streamlined one falls faster).");

    const labels: SceneLabel[] =
      s.dropped && !s.landed
        ? [{ at: objPos, title: `${fmt(speed, 0)} m/s`, subtitle: sci(ke, 1) + " J", color: "#4d9fff" }]
        : [];

    return {
      bodies: [{ id: "fallobj", position: objPos }],
      forces,
      readouts,
      bars: [],
      metrics: [
        { label: L("Velocidade", "Speed"), value: speed, unit: "m/s", color: "#4D9FFF" },
        { label: L("Altura", "Height"), value: Math.max(0, s.y), unit: "m", color: "#F5B83D" },
      ],
      energies: [
        { label: L("Potencial (m·g·h)", "Potential (m·g·h)"), value: pe, color: "#e7c96a" },
        { label: L("Cinética (½·m·v²)", "Kinetic (½·m·v²)"), value: ke, color: "#4d9fff" },
        { label: L("Dissipada (arrasto)", "Dissipated (drag)"), value: s.eDrag, color: "#ff6b2b" },
      ],
      labels,
      note,
      source: L(
        `Conservação de energia: a energia total começa como potencial gravitacional E = m·g·h e vira ` +
          `cinética ½·m·v² conforme cai. Com ar, parte vira calor (arrasto) e existe uma velocidade terminal ` +
          `v = √(2·m·g / (ρ·Cd·A)). No impacto, a energia cinética (${energyEquivalent(e0)} no total) é liberada ` +
          `de uma vez. A cratera segue a lei de escala de Collins, Melosh & Marcus (2005); o raio de destruição ` +
          `usa a escala cubo-raiz de explosões (Glasstone & Dolan). É assim que um meteoro abre uma cratera.`,
        `Energy conservation: total energy starts as gravitational potential E = m·g·h and becomes kinetic ` +
          `½·m·v² as it falls. With air, some becomes heat (drag) and there is a terminal speed ` +
          `v = √(2·m·g / (ρ·Cd·A)). On impact, the kinetic energy (${energyEquivalent(e0)} total) is released at once. ` +
          `The crater uses Collins, Melosh & Marcus (2005) scaling; the destruction radius uses cube-root blast ` +
          `scaling (Glasstone & Dolan). That's how a meteor digs a crater.`,
      ),
      particles: s.landed
        ? [
            { at: vec(0, 0.3, 0), dir: vec(0, 1, 0), speed: 10, spread: 1.3, count: 22, kind: "dust" as const },
            { at: vec(0, 0.5, 0), dir: vec(0, 1, 0), speed: 6, spread: 1.0, count: 12, kind: "smoke" as const },
          ]
        : // rastro tipo meteoro: quanto mais rápido na atmosfera, mais brilha
          s.dropped && env.airDensity > 0 && speed > 80
          ? [
              {
                at: objPos,
                dir: vec(0, 1, 0), // atrás do objeto (ele cai, o rastro fica para cima)
                speed: Math.min(22, speed * 0.06),
                spread: 0.22,
                count: Math.min(10, Math.round(speed / 120) + 2),
                kind: speed > 300 ? ("exhaust" as const) : ("smoke" as const),
              },
            ]
          : [],
      shocks,
      // segue o objeto na queda (antes de soltar, enquadra ele lá no alto)
      cameraTarget: vec(0, Math.max(0.8, s.y), 0),
      // câmera lenta automática para velocidades altíssimas (meteoro), senão some num piscar
      timeScale: s.dropped && !s.landed && speed > 400 ? 0.15 : 1,
    };
  },
};
