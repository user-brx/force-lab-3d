import { L } from "./i18n";
import type { Environment, Planet, Surface } from "./types";

// ---------------------------------------------------------------------------
// PLANETAS - gravidade + atmosfera + massa do astro (recebe a reação).
// Valores reais: gravidade superficial (m/s²), densidade do ar na superfície
// (kg/m³), altura de escala da atmosfera (m), massa (kg).
// ---------------------------------------------------------------------------
export const PLANETS: Record<string, Planet> = {
  vacuo: {
    id: "vacuo",
    label: "Vácuo",
    labelEn: "Vacuum",
    emoji: "🌌",
    g: 0,
    airDensity: 0,
    scaleHeight: 1,
    bodyMass: 0,
    radius: 6.371e6,
    soundSpeed: 340,
    skyTint: "#05070d",
    desc: "Espaço aberto: sem gravidade nem ar. Sistema isolado.",
    descEn: "Open space: no gravity and no air. An isolated system.",
  },
  lua: {
    id: "lua",
    label: "Lua",
    labelEn: "Moon",
    emoji: "🌙",
    g: 1.62,
    airDensity: 0,
    scaleHeight: 1,
    bodyMass: 7.342e22,
    radius: 1.737e6,
    soundSpeed: 340,
    skyTint: "#05070d",
    desc: "Gravidade fraca e sem ar - o céu é preto e estrelado.",
    descEn: "Weak gravity and no air - the sky is black and starry.",
  },
  marte: {
    id: "marte",
    label: "Marte",
    labelEn: "Mars",
    emoji: "🔴",
    g: 3.71,
    airDensity: 0.02,
    scaleHeight: 11100,
    bodyMass: 6.417e23,
    radius: 3.3895e6,
    soundSpeed: 240,
    skyTint: "#6e4a36",
    desc: "Atmosfera rarefeita de CO₂; arrasto quase desprezível.",
    descEn: "Thin CO₂ atmosphere; drag is almost negligible.",
  },
  venus: {
    id: "venus",
    label: "Vênus",
    labelEn: "Venus",
    emoji: "🟡",
    g: 8.87,
    airDensity: 65,
    scaleHeight: 15900,
    bodyMass: 4.867e24,
    radius: 6.0518e6,
    soundSpeed: 410,
    skyTint: "#caa84f",
    desc: "Atmosfera densíssima de CO₂: arrasto enorme.",
    descEn: "Extremely dense CO₂ atmosphere: enormous drag.",
  },
  terra: {
    id: "terra",
    label: "Terra",
    labelEn: "Earth",
    emoji: "🌍",
    g: 9.80665,
    airDensity: 1.225,
    scaleHeight: 8500,
    bodyMass: 5.972e24,
    radius: 6.371e6,
    soundSpeed: 340.3,
    skyTint: "#6ea8e0",
    desc: "Nível do mar: gravidade e ar de referência.",
    descEn: "Sea level: reference gravity and air.",
  },
  jupiter: {
    id: "jupiter",
    label: "Júpiter",
    labelEn: "Jupiter",
    emoji: "🟠",
    g: 24.79,
    airDensity: 0.16,
    scaleHeight: 27000,
    bodyMass: 1.898e27,
    radius: 6.9911e7,
    soundSpeed: 850,
    skyTint: "#c2a07a",
    desc: "Topo das nuvens: gravidade brutal, sem superfície sólida.",
    descEn: "Cloud tops: brutal gravity, no solid surface.",
  },
};

// Ordem do slider (gravidade crescente).
export const PLANET_ORDER = ["vacuo", "lua", "marte", "venus", "terra", "jupiter"];

// ---------------------------------------------------------------------------
// SUPERFÍCIES - atrito do contato (só importam quando há gravidade).
// ---------------------------------------------------------------------------
export const SURFACES: Record<string, Surface> = {
  asfalto: {
    id: "asfalto",
    label: "Asfalto",
    labelEn: "Asphalt",
    muS: 0.9,
    muK: 0.7,
    restitution: 0.6,
    color: "#3a4356",
    desc: "Atrito alto: o pé e o pneu agarram.",
    descEn: "High friction: foot and tire grip.",
  },
  gelo: {
    id: "gelo",
    label: "Gelo",
    labelEn: "Ice",
    muS: 0.1,
    muK: 0.03,
    restitution: 0.75,
    color: "#7698b3",
    desc: "Atrito quase nulo: tudo escorrega.",
    descEn: "Almost no friction: everything slides.",
  },
  areia: {
    id: "areia",
    label: "Areia",
    labelEn: "Sand",
    muS: 0.6,
    muK: 0.45,
    restitution: 0.12,
    color: "#cda874",
    desc: "Atrito médio; absorve energia.",
    descEn: "Medium friction; absorbs energy.",
  },
};

export const SURFACE_ORDER = ["asfalto", "gelo", "areia"];

// Helpers de tradução (resolvem conforme o idioma atual).
export const planetLabel = (p: Planet): string => L(p.label, p.labelEn);
export const planetDesc = (p: Planet): string => L(p.desc, p.descEn);
export const surfaceLabel = (s: Surface): string => L(s.label, s.labelEn);
export const surfaceDesc = (s: Surface): string => L(s.desc, s.descEn);

// Junta planeta + superfície no ambiente efetivo que os cenários recebem.
export function makeEnvironment(planetId: string, surfaceId: string): Environment {
  const p = PLANETS[planetId] ?? PLANETS.terra;
  const s = SURFACES[surfaceId] ?? SURFACES.asfalto;
  return {
    g: p.g,
    airDensity: p.airDensity,
    scaleHeight: p.scaleHeight,
    bodyMass: p.bodyMass,
    radius: p.radius,
    soundSpeed: p.soundSpeed,
    planetLabel: planetLabel(p),
    skyTint: p.skyTint,
    muS: s.muS,
    muK: s.muK,
    restitution: s.restitution,
    color: s.color,
  };
}
