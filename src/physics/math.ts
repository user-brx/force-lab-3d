// Pequena biblioteca de vetores 3D, pura e sem dependências.
// O núcleo de física não conhece Three.js; o renderizador converte Vec3 -> THREE.Vector3.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

export const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : vec(0, 0, 0);
};

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Sinal "seguro": devolve 0 quando o valor é (quase) zero. */
export const sign0 = (v: number, eps = 1e-9): number => (v > eps ? 1 : v < -eps ? -1 : 0);
