import { fmt } from "../format";
import { L } from "../i18n";
import { vec, type Vec3 } from "../math";
import type { Scenario, SceneView, ShockEmit, ForceArrow, Readout, Metric, SceneLabel, ParticleEmit } from "../types";

// Fuzil .50 BMG (Barrett M82A1) sobre um carrinho de teste com bipé.
// O gás da pólvora empurra a projétil para frente E o fundo do cano para trás,
// com a MESMA força. Projétil e arma ganham momentos iguais e opostos (soma = 0).
// O freio de boca (muzzle brake) desvia ~60 % dos gases para os lados,
// reduzindo o recuo transmitido ao carrinho - mas NÃO viola a 3ª lei:
// o impulso total (projétil + gases + arma) ainda soma zero.
// O cano fica acima do centro de massa: o recuo gera torque (cano sobe / gira).

// Cada projétil em voo é independente: dá para atirar várias vezes e ver todas
// as balas viajando ao mesmo tempo, uma atrás da outra, até sumirem.
interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dist: number;   // distância percorrida (m)
  shockT: number; // acumulador para emitir ondas de choque
  hit: boolean;   // já interagiu com a barreira (não reprocessa)
  spent: boolean; // cravou na barreira (marcada para remoção)
}

// Resultado do último impacto numa barreira (para o HUD).
interface BarrierHit {
  materialId: string;
  vImpact: number;   // m/s na hora do impacto
  energyJ: number;   // energia depositada na barreira (J)
  penDepth: number;  // profundidade num alvo semi-infinito (m)
  thickness: number; // espessura da barreira (m)
  perforated: boolean;
  vResidual: number; // m/s ao sair (0 se parou dentro)
}

interface RevolverState {
  gunX: number;
  gunY: number;
  gunVx: number;
  gunVy: number;
  gunAngle: number; // rad (cano sobe = positivo)
  gunOmega: number; // rad/s
  bullets: Bullet[];
  matrixActive: boolean; // câmera lenta seguindo a última bala que saiu do cano
  firedMomentum: number;
  tSinceFire: number;
  prevFire: boolean;
  events: ShockEmit[];
  particleQueue: ParticleEmit[]; // rajadas de partículas a emitir uma vez (impacto)
  barrierHit: BarrierHit | null; // último impacto numa barreira (para o HUD)
  focusAt: Vec3 | null; // a câmera trava neste ponto (impacto na barreira) por focusT
  focusT: number;       // tempo restante de foco na barreira (s de simulação)
}

// .50 BMG / Barrett M82A1 com projétil M33 Ball (661 gr ≈ 42 g a 890 m/s) - valores reais
const BARREL_ABOVE_COM = 0.10;  // m (cano acima do CdM do conjunto bipé+arma)
const I_GUN_FACTOR    = 0.15;  // m² (momento de inércia / massa: fuzil longo e pesado)
const MUZZLE_BRAKE    = 0.38;  // fração do recuo transmitida ao carrinho (~62 % absorvido pelo freio)
const SHOT_WINDOW     = 0.05;  // s (janela para força média)
const MATRIX_RANGE    = 1000;  // m (segue a bala até 1 km em câmera lenta)
const MAX_BULLETS     = 16;    // teto de balas simultâneas (= pool de modelos na cena)
const FOCUS_DUR       = 0.35;  // s de simulação que a câmera trava na barreira (~4,4 s reais a 0,08×)
// Projétil .50 BMG: diâmetro 12,95 mm → área frontal = π·(0,006475)² ≈ 1,317×10⁻⁴ m²
const BULLET_AREA     = 1.317e-4; // m²

// Coeficiente de arrasto do projétil .50 BMG em função do número de Mach.
// Curva derivada de dados balísticos do M33 Ball: subsônico baixo (~0,14), pico
// transônico agudo (~0,43 perto de Mach 1) e queda lenta no supersônico (~0,29).
// Interpolação linear por trechos - é assim que Cd realmente varia com a velocidade.
const CD_MACH = [0.0, 0.70, 0.85, 0.95, 1.05, 1.20, 1.50, 2.00, 2.50, 3.00, 4.00];
const CD_VAL  = [0.14, 0.14, 0.16, 0.30, 0.43, 0.42, 0.37, 0.32, 0.30, 0.29, 0.28];
function bulletCd(mach: number): number {
  if (mach <= CD_MACH[0]) return CD_VAL[0];
  for (let i = 1; i < CD_MACH.length; i++) {
    if (mach <= CD_MACH[i]) {
      const t = (mach - CD_MACH[i - 1]) / (CD_MACH[i] - CD_MACH[i - 1]);
      return CD_VAL[i - 1] + t * (CD_VAL[i] - CD_VAL[i - 1]);
    }
  }
  return CD_VAL[CD_VAL.length - 1];
}

// --- Barreira-alvo: materiais reais + penetração de Poncelet -----------------
// Modelo de Poncelet: a resistência do alvo tem um termo estático R (resistência
// dinâmica de penetração, maior que o escoamento estático) e um inercial ρ·v².
//   Profundidade (alvo semi-infinito):  P = (m / (2·A·ρ)) · ln(1 + ρ·v²/R)
//   Velocidade residual após espessura T: v_r² = (v² + R/ρ)·e^(-2·A·ρ·T/m) − R/ρ
// Os valores de ρ e R são calibrados para reproduzir a penetração real do .50 BMG
// (42 g a 890 m/s): aço ~29 mm, concreto ~12 cm, areia ~0,5 m, gel ~1 m.
export interface BarrierMaterial {
  id: string;
  label: string;
  labelEn: string;
  rho: number;      // densidade (kg/m³)
  Rt: number;       // resistência de penetração (Pa)
  color: string;    // cor do modelo 3D
  brittle: boolean; // estilhaça (vidro, concreto) → mais fragmentos
}

export const BARRIER_MATERIALS: BarrierMaterial[] = [
  { id: "aco",      label: "Aço",           labelEn: "Steel",         rho: 7850, Rt: 2.0e9, color: "#8a929e", brittle: false },
  { id: "concreto", label: "Concreto",      labelEn: "Concrete",      rho: 2400, Rt: 4.0e8, color: "#b7b3a6", brittle: true  },
  { id: "madeira",  label: "Madeira",       labelEn: "Wood",          rho: 700,  Rt: 4.5e7, color: "#9b6b3f", brittle: false },
  { id: "gel",      label: "Gel balístico", labelEn: "Ballistic gel", rho: 1040, Rt: 1.5e6, color: "#bfe6c8", brittle: false },
  { id: "vidro",    label: "Vidro",         labelEn: "Glass",         rho: 2500, Rt: 9.0e7, color: "#a9d4e0", brittle: true  },
  { id: "areia",    label: "Areia",         labelEn: "Sand",          rho: 1600, Rt: 9.0e6, color: "#cda874", brittle: false },
];

// Geometria da barreira (compartilhada com o modelo 3D). Encosta no chão.
export const BARRIER_CENTER_Y = 0.8; // m (centro vertical)
export const BARRIER_HEIGHT   = 1.6; // m (cobre a linha do cano ~0,5 m)

/** Profundidade de penetração num alvo semi-infinito (m) - equação de Poncelet. */
export function penetrationDepth(mat: BarrierMaterial, v: number, mB: number): number {
  return (mB / (2 * BULLET_AREA * mat.rho)) * Math.log(1 + (mat.rho * v * v) / mat.Rt);
}

/** Velocidade ao atravessar uma espessura T (m); 0 se a bala parar dentro. */
export function residualVel(mat: BarrierMaterial, v: number, mB: number, T: number): number {
  const v2 = (v * v + mat.Rt / mat.rho) * Math.exp((-2 * BULLET_AREA * mat.rho * T) / mB) - mat.Rt / mat.rho;
  return v2 > 0 ? Math.sqrt(v2) : 0;
}

/** Formata uma profundidade em mm / cm / m conforme a escala. */
function fmtDepth(m: number): { value: string; unit: string } {
  if (m < 0.01) return { value: fmt(m * 1000, 1), unit: "mm" };
  if (m < 1) return { value: fmt(m * 100, 1), unit: "cm" };
  return { value: fmt(m, 2), unit: "m" };
}

/** Efeitos visuais do impacto na barreira (clarão + poeira/fragmentos). */
function spawnImpact(s: RevolverState, mat: BarrierMaterial, at: Vec3, perforated: boolean) {
  s.events.push({ at, kind: "blast", color: "#ffd27a", maxRadius: 1.2, life: 0.3 }); // clarão
  const puffs = mat.brittle ? 3 : 2;
  for (let i = 0; i < puffs; i++) {
    s.events.push({ at, kind: "blast", color: mat.color, maxRadius: 1.4 + i * 0.5, life: 0.5 });
  }
  // Fragmentos para trás (lado da entrada).
  s.particleQueue.push({ at, dir: vec(-1, 0.35, 0), speed: 9, spread: 0.7, count: mat.brittle ? 14 : 9, kind: "dust" });
  // Spall para frente (lado da saída), só se atravessou.
  if (perforated) s.particleQueue.push({ at, dir: vec(1, 0.2, 0), speed: 11, spread: 0.5, count: mat.brittle ? 12 : 7, kind: "dust" });
}

export const revolver: Scenario<RevolverState> = {
  id: "revolver",
  label: "Fuzil .50",
  labelEn: ".50 Rifle",
  icon: "🎯",
  blurb: "Fuzil Barrett .50 BMG: recuo brutal, bala supersônica a 890 m/s e trajetória balística real.",
  surfaces: ["asfalto", "areia", "gelo"],
  defaultPlanet: "terra",
  params: {
    massaBala: { label: "Massa do projétil", labelEn: "Bullet mass",    min: 30, max: 60,   step: 1,   default: 42,  unit: "g"   },
    velBala:   { label: "Velocidade de saída", labelEn: "Muzzle velocity", min: 700, max: 1200, step: 10,  default: 890, unit: "m/s" },
    massaArma: { label: "Massa fuzil+bipé",  labelEn: "Rifle+bipod mass", min: 5,  max: 30,   step: 0.5, default: 14,  unit: "kg"  },
    // Barreira-alvo (UI customizada em Controls; não renderizar como slider genérico).
    barreira:  { label: "Barreira",  labelEn: "Barrier",   min: 0, max: 1, step: 1, default: 1, unit: "" },
    material:  { label: "Material",  labelEn: "Material",  min: 0, max: BARRIER_MATERIALS.length - 1, step: 1, default: 0, unit: "" },
    espessura: { label: "Espessura", labelEn: "Thickness", min: 1, max: 50, step: 1, default: 10, unit: "cm" },
    distancia: { label: "Distância", labelEn: "Distance",  min: 5, max: 150, step: 5, default: 25, unit: "m" },
  },

  init: () => ({
    gunX: 0, gunY: 0,
    gunVx: 0, gunVy: 0,
    gunAngle: 0, gunOmega: 0,
    bullets: [],
    matrixActive: false,
    firedMomentum: 0,
    tSinceFire: 999,
    prevFire: false,
    events: [],
    particleQueue: [],
    barrierHit: null,
    focusAt: null,
    focusT: 0,
  }),

  step(s, env, params, c, dt) {
    const mB = (params.massaBala ?? 42) / 1000; // g → kg
    const vB = params.velBala   ?? 890;
    const mG = params.massaArma ?? 14;
    const space = env.g <= 0;
    s.tSinceFire += dt;
    if (s.focusT > 0) s.focusT = Math.max(0, s.focusT - dt);

    // Barreira-alvo.
    const barrierOn = (params.barreira ?? 1) >= 0.5;
    const mat = BARRIER_MATERIALS[Math.round(params.material ?? 0)] ?? BARRIER_MATERIALS[0];
    const barrierT = (params.espessura ?? 10) / 100; // cm → m
    const barrierD = params.distancia ?? 25;          // m (face frontal)

    // Disparo: gatilho de subida (rising-edge) - nunca re-dispara no mesmo substep.
    if ((c.fire || c.matrixFire) && !s.prevFire) {
      const p = mB * vB; // módulo do momento do projétil (kg·m/s)
      s.firedMomentum = p;
      const dx = Math.cos(s.gunAngle);
      const dy = Math.sin(s.gunAngle);
      const muzzle = muzzlePos(s);

      // Nova bala (não apaga as anteriores): entra no fim da lista. A mais recente
      // é sempre a última do array e é a que a câmera Matrix segue.
      s.bullets.push({ x: muzzle.x, y: muzzle.y, vx: vB * dx, vy: vB * dy, dist: 0, shockT: 0, hit: false, spent: false });
      if (s.bullets.length > MAX_BULLETS) s.bullets.shift(); // descarta a mais antiga
      if (c.matrixFire) s.matrixActive = true;
      s.tSinceFire = 0;

      // Efeitos visuais.
      s.events.push({ at: muzzle, kind: "blast", color: "#ff6b2b", maxRadius: 3.2, life: 0.5 });
      s.events.push({ at: vec(s.gunX - 0.3 * dx, 0.45 + s.gunY, 0), kind: "blast", color: "#4d9fff", maxRadius: 2.2, life: 0.5 });
      if (!space) {
        s.events.push({ at: vec(s.gunX, 0.05, 0), kind: "ring", color: "#9fc3ff", maxRadius: 3.5, life: 0.7 });
      }

      // Recuo: o freio de boca absorve ~62 % - o carrinho recebe apenas MUZZLE_BRAKE·p.
      const recoil = (p * MUZZLE_BRAKE) / mG;
      if (c.hold) {
        s.gunVx  += -recoil * dx * 0.06;
        s.gunOmega += ((p * MUZZLE_BRAKE * BARREL_ABOVE_COM) / (mG * I_GUN_FACTOR)) * 0.5;
      } else if (space) {
        s.gunVx  += -recoil * dx;
        s.gunVy  += -recoil * dy;
        s.gunOmega += (p * MUZZLE_BRAKE * BARREL_ABOVE_COM) / (mG * I_GUN_FACTOR);
      } else {
        s.gunVx  += -recoil * dx;
        s.gunOmega += ((p * MUZZLE_BRAKE * BARREL_ABOVE_COM) / (mG * I_GUN_FACTOR)) * 0.45;
      }
    }
    s.prevFire = c.fire || !!c.matrixFire;

    // --- Arma ---
    if (!space) {
      const fricA = env.muK * env.g;
      const vNew = s.gunVx + Math.sign(-s.gunVx) * fricA * dt;
      s.gunVx = Math.sign(vNew) !== Math.sign(s.gunVx) ? 0 : vNew;
      s.gunVy = 0;
      s.gunY  = 0;
    }
    s.gunX += s.gunVx * dt;
    s.gunY += s.gunVy * dt;

    // Mola torcional amortecida (bipé absorve parte do giro).
    if (c.hold || !space) {
      const k = 80; const cd = 12;
      s.gunOmega += (-k * s.gunAngle - cd * s.gunOmega) * dt;
    }
    s.gunAngle += s.gunOmega * dt;

    // --- Projéteis .50 BMG (cada bala é independente) ---
    for (const b of s.bullets) {
      const speed = Math.hypot(b.vx, b.vy);

      // Arrasto do ar: F = ½·ρ·v²·Cd·A. Cd varia com Mach (curva real do M33).
      if (env.airDensity > 0 && speed > 0) {
        const cd = bulletCd(speed / env.soundSpeed);
        const dragAcc = (0.5 * env.airDensity * speed * speed * cd * BULLET_AREA) / mB;
        b.vx -= dragAcc * (b.vx / speed) * dt;
        b.vy -= dragAcc * (b.vy / speed) * dt;
      }

      if (env.g > 0) b.vy -= env.g * dt;
      const x0 = b.x;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.dist += speed * dt;

      // Impacto na barreira: a bala cruzou o plano x = D dentro da altura do alvo.
      if (barrierOn && !b.hit && b.vx > 0 && x0 < barrierD && b.x >= barrierD &&
          Math.abs(b.y - BARRIER_CENTER_Y) <= BARRIER_HEIGHT / 2) {
        b.hit = true;
        // Se a câmera lenta estava seguindo ESTA bala, trava na parede um
        // instante para dar tempo de ver o resultado do impacto.
        if (s.matrixActive && b === s.bullets[s.bullets.length - 1]) {
          s.focusAt = vec(barrierD, b.y, 0);
          s.focusT = FOCUS_DUR;
        }
        const vImpact = speed; // velocidade ao chegar (≈ a deste substep)
        const P = penetrationDepth(mat, vImpact, mB);
        if (P > barrierT) {
          // Atravessa: continua com velocidade residual, emergindo na face traseira.
          const vr = residualVel(mat, vImpact, mB, barrierT);
          const k = vImpact > 0 ? vr / vImpact : 0;
          b.vx *= k;
          b.vy *= k;
          b.x = barrierD + barrierT;
          s.barrierHit = { materialId: mat.id, vImpact, energyJ: 0.5 * mB * (vImpact * vImpact - vr * vr), penDepth: P, thickness: barrierT, perforated: true, vResidual: vr };
          spawnImpact(s, mat, vec(barrierD, b.y, 0), true);
        } else {
          // Crava: para dentro da barreira (toda a energia é depositada).
          b.vx = 0;
          b.vy = 0;
          b.spent = true;
          s.barrierHit = { materialId: mat.id, vImpact, energyJ: 0.5 * mB * vImpact * vImpact, penDepth: P, thickness: barrierT, perforated: false, vResidual: 0 };
          spawnImpact(s, mat, vec(barrierD, b.y, 0), false);
        }
      }

      // Ondas de choque supersônicas.
      const mach = speed / env.soundSpeed;
      if (mach > 1 && env.airDensity > 0) {
        b.shockT += dt;
        if (b.shockT >= 0.04) {
          b.shockT = 0;
          s.events.push({ at: vec(b.x, b.y, 0), kind: "blast", color: "#bfe0ff", maxRadius: 1.4, life: 0.4 });
        }
      } else {
        b.shockT = 0;
      }
    }

    // Remove as balas que sumiram (cravaram na barreira, caíram ou saíram longe).
    s.bullets = s.bullets.filter((b) => {
      const far = Math.hypot(b.x - s.gunX, b.y - s.gunY) > 50000;
      return !(b.spent || far || (env.g > 0 && b.y < 0));
    });

    // Matrix segue a última bala que saiu do cano (a mais recente da lista).
    // Encerra quando não há mais bala viva ou quando ela passa de MATRIX_RANGE.
    if (s.matrixActive) {
      const newest = s.bullets[s.bullets.length - 1];
      if (!newest || newest.dist > MATRIX_RANGE) s.matrixActive = false;
    }
  },

  view(s, env, params): SceneView {
    const mB = (params.massaBala ?? 42) / 1000;
    const vB = params.velBala   ?? 890;
    const mG = params.massaArma ?? 14;
    const fired = s.firedMomentum;
    const hasFired = fired > 0;
    const pBullet  = fired;
    const vRecoil0 = hasFired ? (fired * MUZZLE_BRAKE) / mG : 0;
    const keBullet = hasFired ? 0.5 * mB * vB * vB : 0;
    const keGun    = 0.5 * mG * vRecoil0 * vRecoil0;
    const recoilSpeed = Math.hypot(s.gunVx, s.gunVy);

    const showShot = s.tSinceFire < SHOT_WINDOW;
    const avgForce = pBullet / SHOT_WINDOW;
    const muzzle = muzzlePos(s);
    const dx = Math.cos(s.gunAngle);
    const dy = Math.sin(s.gunAngle);
    const shocks = s.events;
    s.events = [];
    const queued = s.particleQueue;
    s.particleQueue = [];

    const comY = 0.40 + s.gunY;
    const bodies: SceneView["bodies"] = [{ id: "gun", position: vec(s.gunX, comY, 0), rotation: s.gunAngle }];
    s.bullets.forEach((b, i) => {
      bodies.push({ id: `bullet${i}`, position: vec(b.x, b.y, 0), rotation: Math.atan2(b.vy, b.vx) });
    });
    const newest = s.bullets[s.bullets.length - 1]; // bala mais recente (a que a Matrix segue)
    const hasBullets = s.bullets.length > 0;

    const forces: ForceArrow[] = [];
    if (showShot) {
      forces.push({ kind: "action",   label: L("AÇÃO - gás empurra o projétil", "ACTION - gas pushes bullet"),   origin: muzzle, dir: vec(dx, dy, 0), magnitude: avgForce });
      forces.push({ kind: "reaction", label: L("REAÇÃO - gás empurra a arma",  "REACTION - gas pushes rifle"), origin: vec(s.gunX - 0.4 * dx, comY + 0.12, 0), dir: vec(-dx, -dy, 0), magnitude: avgForce });
    }

    const readouts: Readout[] = [];
    const metrics: Metric[]   = [];
    const labels: SceneLabel[] = [];

    if (hasBullets) {
      const bSpeed = Math.hypot(newest.vx, newest.vy);
      const bMach  = env.soundSpeed > 0 ? bSpeed / env.soundSpeed : 0;
      const bDrag  = env.airDensity > 0 ? 0.5 * env.airDensity * bSpeed * bSpeed * bulletCd(bMach) * BULLET_AREA : 0;
      const bWeight = mB * env.g;

      if (env.g > 0)    forces.push({ kind: "weight", label: "PESO",    origin: vec(newest.x, newest.y, 0), dir: vec(0, -1, 0),                               magnitude: bWeight });
      if (bDrag > 0 && bSpeed > 1e-6) forces.push({ kind: "drag", label: "ARRASTO", origin: vec(newest.x, newest.y, 0), dir: vec(-newest.vx / bSpeed, -newest.vy / bSpeed, 0), magnitude: bDrag });

      readouts.push(
        { label: L("Velocidade do projétil", "Bullet speed"),      value: fmt(bSpeed, 1),        unit: "m/s", highlight: true },
        { label: L("Distância percorrida",   "Distance traveled"), value: fmt(newest.dist, 1),   unit: "m"   },
        { label: L("Altitude do projétil",   "Bullet altitude"),   value: fmt(newest.y, 2),      unit: "m"   },
        { label: L("Mach",                   "Mach"),              value: fmt(bMach, 2), unit: "" },
      );
      if (s.bullets.length > 1) readouts.push({ label: L("Balas no ar", "Bullets in flight"), value: fmt(s.bullets.length, 0), unit: "" });
      if (env.airDensity > 0) readouts.push({ label: L("Arrasto do ar", "Air drag"), value: fmt(bDrag, 2), unit: "N" });
      if (env.g > 0)          readouts.push({ label: L("Queda balística", "Ballistic drop"), value: fmt(muzzle.y - newest.y, 2), unit: "m" });

      metrics.push(
        { label: L("Velocidade", "Speed"),    value: bSpeed,       unit: "m/s", color: "#e7c96a" },
        { label: L("Distância",  "Distance"), value: newest.dist,  unit: "m",   color: "#4d9fff" },
      );

      // Rótulo flutuante sobre cada bala viva: velocidade + distância (legível no
      // Matrix). Da mais recente para a mais antiga, para a bala atual ter prioridade
      // quando há mais balas que slots de rótulo na cena.
      for (let i = s.bullets.length - 1; i >= 0; i--) {
        const b = s.bullets[i];
        const sp = Math.hypot(b.vx, b.vy);
        labels.push({
          at: vec(b.x, b.y, 0),
          title: `${fmt(sp, 0)} m/s`,
          subtitle: `${fmt(b.dist, 0)} m · Mach ${fmt(env.soundSpeed > 0 ? sp / env.soundSpeed : 0, 1)}`,
          color: "#e7c96a",
        });
      }
    } else {
      readouts.push(
        { label: L("Momento do projétil",      "Bullet momentum"),     value: fmt(pBullet, 2),          unit: "kg·m/s" },
        { label: L("Momento da arma (recuo)",  "Rifle recoil momentum"), value: fmt(pBullet * MUZZLE_BRAKE, 2), unit: "kg·m/s", highlight: true },
        { label: L("Velocidade de saída",      "Muzzle velocity"),     value: fmt(hasFired ? vB : 0, 0), unit: "m/s" },
        { label: L("Veloc. de recuo atual",    "Current recoil speed"), value: fmt(recoilSpeed, 2),      unit: "m/s" },
        { label: L("E. cinética projétil",     "Bullet kinetic energy"), value: fmt(keBullet / 1000, 1), unit: "kJ"  },
        { label: L("E. cinética fuzil",        "Rifle kinetic energy"), value: fmt(keGun, 1),            unit: "J"   },
      );
      metrics.push({ label: L("Veloc. de recuo", "Recoil speed"), value: recoilSpeed, unit: "m/s", color: "#4D9FFF" });
    }

    // Resultado do último impacto na barreira (persiste até o próximo tiro/reset).
    if (s.barrierHit) {
      const h = s.barrierHit;
      const hMat = BARRIER_MATERIALS.find((m) => m.id === h.materialId) ?? BARRIER_MATERIALS[0];
      const pen = fmtDepth(h.penDepth);
      readouts.push(
        { label: L("Barreira atingida", "Barrier hit"), value: L(hMat.label, hMat.labelEn), unit: "", highlight: true },
        { label: L("Veloc. de impacto", "Impact speed"), value: fmt(h.vImpact, 0), unit: "m/s" },
        { label: L("Energia de impacto", "Impact energy"), value: fmt((0.5 * mB * h.vImpact * h.vImpact) / 1000, 1), unit: "kJ" },
        { label: L("Penetração máx.", "Max penetration"), value: pen.value, unit: pen.unit },
        { label: L("Resultado", "Result"), value: h.perforated ? L("ATRAVESSOU", "PERFORATED") : L("PAROU DENTRO", "STOPPED"), unit: "", highlight: true },
      );
      if (h.perforated) readouts.push({ label: L("Veloc. de saída", "Exit speed"), value: fmt(h.vResidual, 0), unit: "m/s" });
      readouts.push({ label: L("Energia na barreira", "Energy into barrier"), value: fmt(h.energyJ / 1000, 1), unit: "kJ" });
    }

    return {
      bodies,
      forces,
      readouts,
      bars: [],
      metrics,
      labels,
      note: s.tSinceFire > 900
        ? L("Pressione DISPARAR para atirar. Matrix ativa câmera lenta.", "Press FIRE to shoot. Matrix enables slow-motion follow.")
        : env.g <= 0
          ? L(
              "Vácuo: a arma recua E gira. Atire de novo - cada tiro sai pelo cano inclinado.",
              "Vacuum: the rifle recoils AND spins. Fire again - each shot leaves along the tilted barrel.",
            )
          : L(
              "O freio de boca absorve ~62 % do recuo. Ative SEGURAR para o bipé absorver ainda mais.",
              "The muzzle brake absorbs ~62 % of recoil. Enable HOLD so the bipod absorbs even more.",
            ),
      source: L(
        "O .50 BMG M33 (12,7×99 mm NATO) lança um projétil de 42 g a 890 m/s - energia cinética de ~17 kJ, " +
        "Mach 2,6 na Terra. O freio de boca deflecte os gases para os lados, reduzindo o impulso transmitido " +
        "à arma (~62 %); a conservação do momento total (projétil + gases + arma) ainda é exata: p_total = 0. " +
        "O arrasto (Cd varia com Mach: pico transônico ~0,43, supersônico ~0,30) freia a bala a ~450 m/s²; o " +
        "tiro horizontal de ~0,5 m de altura toca o solo a algumas centenas de metros (queda = ½·g·t²). " +
        "Em elevação ótima (~30°) o alcance máximo chega a ~6,8 km.",
        "The .50 BMG M33 (12.7×99 mm NATO) launches a 42 g projectile at 890 m/s - kinetic energy ~17 kJ, " +
        "Mach 2.6 on Earth. The muzzle brake deflects gases sideways, cutting the impulse transferred to the " +
        "rifle (~62 %); total momentum conservation still holds exactly: p_total = 0. " +
        "Drag (Cd varies with Mach: transonic peak ~0.43, supersonic ~0.30) slows the bullet at ~450 m/s²; a " +
        "horizontal shot from ~0.5 m height hits the ground within a few hundred metres (drop = ½·g·t²). " +
        "At optimal elevation (~30°) the maximum range reaches ~6.8 km.",
      ),
      particles: [
        ...(showShot
          ? [
              { at: muzzle, dir: vec(dx, dy + 0.05, 0), speed: 14, spread: 0.25, count: 8, kind: "exhaust" as const },
              { at: vec(s.gunX - 0.3 * dx, comY + 0.12, 0), dir: vec(-dx, 0.15, 0), speed: 4, spread: 0.5, count: 4, kind: "smoke" as const },
            ]
          : []),
        ...queued, // rajadas de impacto na barreira
      ],
      shocks,
      // Câmera: 1º trava na parede após impacto (foco); senão segue a bala no
      // Matrix; senão volta para a arma. O foco mantém a câmera lenta para ver o
      // resultado mesmo depois de a bala cravar e sumir.
      cameraTarget: s.focusT > 0 && s.focusAt
        ? s.focusAt
        : (s.matrixActive && newest) ? vec(newest.x, newest.y, 0) : vec(s.gunX, 0.7 + s.gunY, 0),
      timeScale: (s.focusT > 0 && s.focusAt) || (s.matrixActive && newest) ? 0.08 : 1,
    };
  },
};

// Posição da boca do cano (cano comprido do .50 BMG - ~73 cm de cano).
function muzzlePos(s: RevolverState) {
  const pivotY = 0.40 + s.gunY;
  const dx = 1.05; // boca à frente do CdM (cano mais longo que o revólver)
  const dy = 0.10; // freio de boca ligeiramente acima do CdM
  const ca = Math.cos(s.gunAngle);
  const sa = Math.sin(s.gunAngle);
  return vec(s.gunX + dx * ca - dy * sa, pivotY + dx * sa + dy * ca, 0);
}
