// Constantes físicas reais (SI). Valores de referência CODATA / padrão.
// Nenhum número aqui é "chutado" — todos têm fonte física.

/** Gravidade padrão na superfície da Terra (m/s²). */
export const G0 = 9.80665;

/** Constante da gravitação universal (N·m²/kg²). */
export const G_UNIVERSAL = 6.6743e-11;

/** Massa da Terra (kg). */
export const EARTH_MASS = 5.972e24;

/** Raio médio da Terra (m). */
export const EARTH_RADIUS = 6.371e6;

/** Densidade do ar ao nível do mar, 15 °C (kg/m³). */
export const AIR_DENSITY_SL = 1.225;

/** Altura de escala da atmosfera para o modelo isotérmico (m). rho(h)=rho0·e^(-h/H). */
export const ATMOS_SCALE_HEIGHT = 8500;

/** Linha de Kármán — fronteira convencional do espaço (m). */
export const KARMAN_LINE = 100_000;

/** Velocidade do som ao nível do mar, ar a 15 °C (m/s). */
export const SOUND_SPEED_SL = 340.3;

/**
 * Gravidade em função da altitude h (m), pela lei do inverso do quadrado.
 * g(h) = gSup · (R / (R + h))², com o raio R do próprio astro.
 */
export const gravityAt = (h: number, gSurface: number = G0, radius: number = EARTH_RADIUS): number => {
  const r = radius / (radius + Math.max(0, h));
  return gSurface * r * r;
};

/** Densidade do ar em função da altitude (modelo exponencial isotérmico). */
export const airDensityAt = (
  h: number,
  rho0: number = AIR_DENSITY_SL,
  scaleHeight: number = ATMOS_SCALE_HEIGHT,
): number => rho0 * Math.exp(-Math.max(0, h) / scaleHeight);
