import { fmt } from "../format";
import { L } from "../i18n";
import { vec } from "../math";
import type { Scenario, SceneView, ShockEmit, ForceArrow, Readout, Metric, SceneLabel } from "../types";

// Fuzil .50 BMG (Barrett M82A1) sobre um carrinho de teste com bipé.
// O gás da pólvora empurra a projétil para frente E o fundo do cano para trás,
// com a MESMA força. Projétil e arma ganham momentos iguais e opostos (soma = 0).
// O freio de boca (muzzle brake) desvia ~60 % dos gases para os lados,
// reduzindo o recuo transmitido ao carrinho — mas NÃO viola a 3ª lei:
// o impulso total (projétil + gases + arma) ainda soma zero.
// O cano fica acima do centro de massa: o recuo gera torque (cano sobe / gira).

interface RevolverState {
  gunX: number;
  gunY: number;
  gunVx: number;
  gunVy: number;
  gunAngle: number; // rad (cano sobe = positivo)
  gunOmega: number; // rad/s
  bulletX: number;
  bulletY: number;
  bulletVx: number;
  bulletVy: number;
  bulletLive: boolean;
  matrixFollow: boolean;
  firedMomentum: number;
  tSinceFire: number;
  prevFire: boolean;
  events: ShockEmit[];
  bulletDist: number;
  bulletShockT: number;
}

// .50 BMG / Barrett M82A1 com projétil M33 Ball (661 gr ≈ 42 g a 890 m/s) — valores reais
const BARREL_ABOVE_COM = 0.10;  // m (cano acima do CdM do conjunto bipé+arma)
const I_GUN_FACTOR    = 0.15;  // m² (momento de inércia / massa: fuzil longo e pesado)
const MUZZLE_BRAKE    = 0.38;  // fração do recuo transmitida ao carrinho (~62 % absorvido pelo freio)
const SHOT_WINDOW     = 0.05;  // s (janela para força média)
const MATRIX_RANGE    = 1000;  // m (segue a bala até 1 km em câmera lenta)
// Projétil .50 BMG: diâmetro 12,95 mm → área frontal = π·(0,006475)² ≈ 1,317×10⁻⁴ m²
const BULLET_AREA     = 1.317e-4; // m²

// Coeficiente de arrasto do projétil .50 BMG em função do número de Mach.
// Curva derivada de dados balísticos do M33 Ball: subsônico baixo (~0,14), pico
// transônico agudo (~0,43 perto de Mach 1) e queda lenta no supersônico (~0,29).
// Interpolação linear por trechos — é assim que Cd realmente varia com a velocidade.
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
  },

  init: () => ({
    gunX: 0, gunY: 0,
    gunVx: 0, gunVy: 0,
    gunAngle: 0, gunOmega: 0,
    bulletX: 0, bulletY: 0,
    bulletVx: 0, bulletVy: 0,
    bulletLive: false,
    matrixFollow: false,
    firedMomentum: 0,
    tSinceFire: 999,
    prevFire: false,
    events: [],
    bulletDist: 0,
    bulletShockT: 0,
  }),

  step(s, env, params, c, dt) {
    const mB = (params.massaBala ?? 42) / 1000; // g → kg
    const vB = params.velBala   ?? 890;
    const mG = params.massaArma ?? 14;
    const space = env.g <= 0;
    s.tSinceFire += dt;

    // Disparo: gatilho de subida (rising-edge) — nunca re-dispara no mesmo substep.
    if ((c.fire || c.matrixFire) && !s.prevFire) {
      const p = mB * vB; // módulo do momento do projétil (kg·m/s)
      s.firedMomentum = p;
      const dx = Math.cos(s.gunAngle);
      const dy = Math.sin(s.gunAngle);
      const muzzle = muzzlePos(s);

      // Posição e velocidade iniciais do projétil.
      s.bulletX = muzzle.x;
      s.bulletY = muzzle.y;
      s.bulletVx = vB * dx;
      s.bulletVy = vB * dy;
      s.bulletLive = true;
      s.matrixFollow = !!c.matrixFire;
      s.tSinceFire = 0;
      s.bulletDist = 0;     // ← zera para a régua do Matrix funcionar no 2º tiro
      s.bulletShockT = 0;

      // Efeitos visuais.
      s.events.push({ at: muzzle, kind: "blast", color: "#ff6b2b", maxRadius: 3.2, life: 0.5 });
      s.events.push({ at: vec(s.gunX - 0.3 * dx, 0.45 + s.gunY, 0), kind: "blast", color: "#4d9fff", maxRadius: 2.2, life: 0.5 });
      if (!space) {
        s.events.push({ at: vec(s.gunX, 0.05, 0), kind: "ring", color: "#9fc3ff", maxRadius: 3.5, life: 0.7 });
      }

      // Recuo: o freio de boca absorve ~62 % — o carrinho recebe apenas MUZZLE_BRAKE·p.
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

    // --- Projétil .50 BMG ---
    if (s.bulletLive) {
      const speed = Math.hypot(s.bulletVx, s.bulletVy);

      // Arrasto do ar: F = ½·ρ·v²·Cd·A. Cd varia com Mach (curva real do M33).
      if (env.airDensity > 0 && speed > 0) {
        const cd = bulletCd(speed / env.soundSpeed);
        const dragAcc = (0.5 * env.airDensity * speed * speed * cd * BULLET_AREA) / mB;
        s.bulletVx -= dragAcc * (s.bulletVx / speed) * dt;
        s.bulletVy -= dragAcc * (s.bulletVy / speed) * dt;
      }

      if (env.g > 0) s.bulletVy -= env.g * dt;
      s.bulletX += s.bulletVx * dt;
      s.bulletY += s.bulletVy * dt;
      s.bulletDist += speed * dt;

      // Ondas de choque supersônicas.
      const mach = speed / env.soundSpeed;
      if (mach > 1 && env.airDensity > 0) {
        s.bulletShockT += dt;
        if (s.bulletShockT >= 0.04) {
          s.bulletShockT = 0;
          s.events.push({ at: vec(s.bulletX, s.bulletY, 0), kind: "blast", color: "#bfe0ff", maxRadius: 1.4, life: 0.4 });
        }
      } else {
        s.bulletShockT = 0;
      }

      const far = Math.hypot(s.bulletX - s.gunX, s.bulletY - s.gunY) > 50000;
      if (far || (env.g > 0 && s.bulletY < 0)) s.bulletLive = false;
    }

    // Encerra o bullet-time após MATRIX_RANGE metros.
    if (s.matrixFollow && (!s.bulletLive || s.bulletDist > MATRIX_RANGE)) {
      s.matrixFollow = false;
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

    const comY = 0.40 + s.gunY;
    const bodies: SceneView["bodies"] = [{ id: "gun", position: vec(s.gunX, comY, 0), rotation: s.gunAngle }];
    if (s.bulletLive) bodies.push({ id: "bullet", position: vec(s.bulletX, s.bulletY, 0), rotation: Math.atan2(s.bulletVy, s.bulletVx) });

    const forces: ForceArrow[] = [];
    if (showShot) {
      forces.push({ kind: "action",   label: L("AÇÃO — gás empurra o projétil", "ACTION — gas pushes bullet"),   origin: muzzle, dir: vec(dx, dy, 0), magnitude: avgForce });
      forces.push({ kind: "reaction", label: L("REAÇÃO — gás empurra a arma",  "REACTION — gas pushes rifle"), origin: vec(s.gunX - 0.4 * dx, comY + 0.12, 0), dir: vec(-dx, -dy, 0), magnitude: avgForce });
    }

    const readouts: Readout[] = [];
    const metrics: Metric[]   = [];
    const labels: SceneLabel[] = [];

    if (s.bulletLive) {
      const bSpeed = Math.hypot(s.bulletVx, s.bulletVy);
      const bMach  = env.soundSpeed > 0 ? bSpeed / env.soundSpeed : 0;
      const bDrag  = env.airDensity > 0 ? 0.5 * env.airDensity * bSpeed * bSpeed * bulletCd(bMach) * BULLET_AREA : 0;
      const bWeight = mB * env.g;

      if (env.g > 0)    forces.push({ kind: "weight", label: "PESO",    origin: vec(s.bulletX, s.bulletY, 0), dir: vec(0, -1, 0),                               magnitude: bWeight });
      if (bDrag > 0 && bSpeed > 1e-6) forces.push({ kind: "drag", label: "ARRASTO", origin: vec(s.bulletX, s.bulletY, 0), dir: vec(-s.bulletVx / bSpeed, -s.bulletVy / bSpeed, 0), magnitude: bDrag });

      readouts.push(
        { label: L("Velocidade do projétil", "Bullet speed"),      value: fmt(bSpeed, 1),        unit: "m/s", highlight: true },
        { label: L("Distância percorrida",   "Distance traveled"), value: fmt(s.bulletDist, 1),  unit: "m"   },
        { label: L("Altitude do projétil",   "Bullet altitude"),   value: fmt(s.bulletY, 2),     unit: "m"   },
        { label: L("Mach",                   "Mach"),              value: fmt(bMach, 2), unit: "" },
      );
      if (env.airDensity > 0) readouts.push({ label: L("Arrasto do ar", "Air drag"), value: fmt(bDrag, 2), unit: "N" });
      if (env.g > 0)          readouts.push({ label: L("Queda balística", "Ballistic drop"), value: fmt(muzzle.y - s.bulletY, 2), unit: "m" });

      metrics.push(
        { label: L("Velocidade", "Speed"),    value: bSpeed,        unit: "m/s", color: "#e7c96a" },
        { label: L("Distância",  "Distance"), value: s.bulletDist,  unit: "m",   color: "#4d9fff" },
      );

      // Rótulo flutuante sobre a bala: velocidade + distância (legível no Matrix).
      labels.push({
        at: vec(s.bulletX, s.bulletY, 0),
        title: `${fmt(bSpeed, 0)} m/s`,
        subtitle: `${fmt(s.bulletDist, 0)} m · Mach ${fmt(bMach, 1)}`,
        color: "#e7c96a",
      });
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
              "Vácuo: a arma recua E gira. Atire de novo — cada tiro sai pelo cano inclinado.",
              "Vacuum: the rifle recoils AND spins. Fire again — each shot leaves along the tilted barrel.",
            )
          : L(
              "O freio de boca absorve ~62 % do recuo. Ative SEGURAR para o bipé absorver ainda mais.",
              "The muzzle brake absorbs ~62 % of recoil. Enable HOLD so the bipod absorbs even more.",
            ),
      source: L(
        "O .50 BMG M33 (12,7×99 mm NATO) lança um projétil de 42 g a 890 m/s — energia cinética de ~17 kJ, " +
        "Mach 2,6 na Terra. O freio de boca deflecte os gases para os lados, reduzindo o impulso transmitido " +
        "à arma (~62 %); a conservação do momento total (projétil + gases + arma) ainda é exata: p_total = 0. " +
        "O arrasto (Cd varia com Mach: pico transônico ~0,43, supersônico ~0,30) freia a bala a ~450 m/s²; o " +
        "tiro horizontal de ~0,5 m de altura toca o solo a algumas centenas de metros (queda = ½·g·t²). " +
        "Em elevação ótima (~30°) o alcance máximo chega a ~6,8 km.",
        "The .50 BMG M33 (12.7×99 mm NATO) launches a 42 g projectile at 890 m/s — kinetic energy ~17 kJ, " +
        "Mach 2.6 on Earth. The muzzle brake deflects gases sideways, cutting the impulse transferred to the " +
        "rifle (~62 %); total momentum conservation still holds exactly: p_total = 0. " +
        "Drag (Cd varies with Mach: transonic peak ~0.43, supersonic ~0.30) slows the bullet at ~450 m/s²; a " +
        "horizontal shot from ~0.5 m height hits the ground within a few hundred metres (drop = ½·g·t²). " +
        "At optimal elevation (~30°) the maximum range reaches ~6.8 km.",
      ),
      particles: showShot
        ? [
            { at: muzzle, dir: vec(dx, dy + 0.05, 0), speed: 14, spread: 0.25, count: 8, kind: "exhaust" },
            { at: vec(s.gunX - 0.3 * dx, comY + 0.12, 0), dir: vec(-dx, 0.15, 0), speed: 4, spread: 0.5, count: 4, kind: "smoke" },
          ]
        : [],
      shocks,
      cameraTarget: (s.bulletLive && s.matrixFollow) ? vec(s.bulletX, s.bulletY, 0) : vec(s.gunX, 0.7 + s.gunY, 0),
      timeScale: s.bulletLive && s.matrixFollow ? 0.08 : 1, // câmera ainda mais lenta para .50 BMG
    };
  },
};

// Posição da boca do cano (cano comprido do .50 BMG — ~73 cm de cano).
function muzzlePos(s: RevolverState) {
  const pivotY = 0.40 + s.gunY;
  const dx = 1.05; // boca à frente do CdM (cano mais longo que o revólver)
  const dy = 0.10; // freio de boca ligeiramente acima do CdM
  const ca = Math.cos(s.gunAngle);
  const sa = Math.sin(s.gunAngle);
  return vec(s.gunX + dx * ca - dy * sa, pivotY + dx * sa + dy * ca, 0);
}
