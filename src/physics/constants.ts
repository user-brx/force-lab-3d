// Constantes físicas reais (SI). Valores de referência CODATA / padrão.
// Nenhum número aqui é "chutado" - todos têm fonte física.

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

/** Linha de Kármán - fronteira convencional do espaço (m). */
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

/**
 * Densidade do ar na Terra pelo modelo da Atmosfera Padrão Internacional (ISA).
 * Considera 3 camadas: Troposfera (até 11km), Tropopausa (11-20km) e Estratosfera (20-47km).
 */
export const airDensityISA = (h: number): number => {
  if (h <= 0) return AIR_DENSITY_SL;
  
  const T0 = 288.15;
  const g = G0;
  const R = 287.05;

  if (h <= 11000) {
    const L = -0.0065;
    const T = T0 + L * h;
    return AIR_DENSITY_SL * Math.pow(T / T0, -g / (R * L) - 1);
  } else if (h <= 20000) {
    const h11 = 11000;
    const T11 = 216.65;
    const L = -0.0065;
    const rho11 = AIR_DENSITY_SL * Math.pow(T11 / T0, -g / (R * L) - 1);
    return rho11 * Math.exp(-g * (h - h11) / (R * T11));
  } else {
    const h20 = 20000;
    const T11 = 216.65;
    const L11 = -0.0065;
    const rho11 = AIR_DENSITY_SL * Math.pow(T11 / T0, -g / (R * L11) - 1);
    const rho20 = rho11 * Math.exp(-g * (20000 - 11000) / (R * T11));
    const L = 0.001;
    const T = T11 + L * (h - h20);
    
    if (h <= 47000) {
      return rho20 * Math.pow(T / T11, -g / (R * L) - 1);
    } else {
      const T47 = T11 + L * (47000 - h20);
      const rho47 = rho20 * Math.pow(T47 / T11, -g / (R * L) - 1);
      return rho47 * Math.exp(-g * (h - 47000) / (R * T47));
    }
  }
};

/** Densidade do ar em função da altitude (modelo exponencial para exoplanetas, ISA para a Terra). */
export const airDensityAt = (
  h: number,
  rho0: number = AIR_DENSITY_SL,
  scaleHeight: number = ATMOS_SCALE_HEIGHT,
): number => {
  if (rho0 === AIR_DENSITY_SL && scaleHeight === ATMOS_SCALE_HEIGHT) {
    return airDensityISA(h);
  }
  return rho0 * Math.exp(-Math.max(0, h) / scaleHeight);
};

/**
 * Velocidade do som em função da altitude (m), baseada na variação de temperatura (Lapse Rate ISA).
 * Para a Terra: a(h) = a0 * sqrt(T(h) / T0). T0 = 288.15 K.
 */
export const soundSpeedAt = (h: number, soundSpeed0: number = SOUND_SPEED_SL): number => {
  if (soundSpeed0 <= 0) return 0;
  // Lapse rate ISA simplificado: T cai a -6.5 K/km até 11km, depois constante
  const T0 = 288.15;
  const T = Math.max(216.65, T0 - 0.0065 * Math.max(0, h));
  return soundSpeed0 * Math.sqrt(T / T0);
};
