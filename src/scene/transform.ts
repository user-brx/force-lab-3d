import type { Vec3 } from "../physics";

// O foguete sobe até ~100 km - impossível renderizar linearmente numa tela.
// Comprimimos a altitude em escala logarítmica acima de 120 m (a decolagem
// permanece linear, onde a leitura importa). A física continua em metros reais.
export function compressAltitude(y: number): number {
  if (y <= 120) return y;
  return 120 + 70 * Math.log10(y / 120);
}

/** Converte uma posição da física (metros reais) para coordenadas de cena. */
export function toScene(v: Vec3, scenarioId: string): [number, number, number] {
  // Foguete e queda do espaço sobem/caem dezenas de km: comprime a altitude.
  if (scenarioId === "foguete" || scenarioId === "queda") return [v.x, compressAltitude(v.y), v.z];
  return [v.x, v.y, v.z];
}
