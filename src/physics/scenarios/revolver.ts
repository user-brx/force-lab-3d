import { fmt } from "../format";
import { L } from "../i18n";
import { vec } from "../math";
import type { Scenario, SceneView, ShockEmit, ForceArrow, Readout, Metric } from "../types";

// Revólver sobre um carrinho de teste.
// O gás da pólvora empurra a bala para frente E o fundo do cano para trás,
// com a MESMA força. Bala e arma ganham momentos iguais e opostos (soma = 0).
// O cano fica acima do centro de massa: o recuo gera torque (cano sobe / gira).
// No chão o carrinho só desliza na horizontal; no vácuo recua e gira em 2D livre.

interface RevolverState {
  gunX: number;
  gunY: number; // só varia no vácuo
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
  firedMomentum: number; // |momento| transferido no disparo (kg·m/s)
  tSinceFire: number;
  prevFire: boolean;
  events: ShockEmit[];
  bulletDist: number; // distância percorrida
  bulletShockT: number; // timer das ondas de choque supersônicas
}

const BARREL_ABOVE_COM = 0.18; // m (cano acima do centro de massa)
const I_GUN_FACTOR = 0.05; // raio de giração² efetivo do conjunto (m²)
const SHOT_WINDOW = 0.05; // janela para a força média de disparo (s)

export const revolver: Scenario<RevolverState> = {
  id: "revolver",
  label: "Revólver",
  labelEn: "Revolver",
  icon: "🔫",
  blurb: "Conservação de momento: a bala vai, a arma recua — e o cano sobe.",
  surfaces: ["asfalto", "gelo"],
  defaultPlanet: "terra",
  params: {
    massaBala: { label: "Massa da bala", labelEn: "Bullet mass", min: 2, max: 50, step: 1, default: 8, unit: "g" },
    velBala: { label: "Velocidade de saída", labelEn: "Muzzle velocity", min: 100, max: 500, step: 10, default: 380, unit: "m/s" },
    massaArma: { label: "Massa arma+carrinho", labelEn: "Gun+cart mass", min: 0.5, max: 6, step: 0.1, default: 1.5, unit: "kg" },
  },

  init: () => ({
    gunX: 0,
    gunY: 0,
    gunVx: 0,
    gunVy: 0,
    gunAngle: 0,
    gunOmega: 0,
    bulletX: 0,
    bulletY: 0,
    bulletVx: 0,
    bulletVy: 0,
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
    const mB = (params.massaBala ?? 8) / 1000; // g -> kg
    const vB = params.velBala ?? 380;
    const mG = params.massaArma ?? 1.5;
    const space = env.g <= 0;
    s.tSinceFire += dt;

    // Disparo: gatilho de subida.
    if ((c.fire || c.matrixFire) && !s.prevFire) {
      const p = mB * vB; // módulo do momento (kg·m/s)
      s.firedMomentum = p;
      // Direção do cano (gunAngle=0 aponta para +x).
      const dx = Math.cos(s.gunAngle);
      const dy = Math.sin(s.gunAngle);
      const muzzle = muzzlePos(s);
      s.bulletX = muzzle.x;
      s.bulletY = muzzle.y;
      s.bulletVx = vB * dx;
      s.bulletVy = vB * dy;
      s.bulletLive = true;
      s.matrixFollow = !!c.matrixFire;
      s.tSinceFire = 0;

      // Ondas de choque: clarão na boca (ação) e recuo na arma (reação).
      s.events.push({ at: muzzle, kind: "blast", color: "#ff4d5e", maxRadius: 2.6, life: 0.45 });
      s.events.push({ at: vec(s.gunX - 0.2 * dx, 0.45 + s.gunY, 0), kind: "blast", color: "#4d9fff", maxRadius: 1.8, life: 0.5 });
      if (!space) {
        s.events.push({ at: vec(s.gunX, 0.05, 0), kind: "ring", color: "#9fc3ff", maxRadius: 2.4, life: 0.6 });
      }

      // Recuo: impulso -p ao longo do cano (3ª lei).
      const recoil = p / mG;
      if (c.hold) {
        // Segurando: o braço absorve quase todo o recuo; sobra o muzzle climb.
        s.gunVx += -recoil * dx * 0.06;
        s.gunOmega += ((p * BARREL_ABOVE_COM) / (mG * I_GUN_FACTOR)) * 0.5;
      } else if (space) {
        // Vácuo (corpo livre): recuo 2D completo + giro pelo torque do offset.
        s.gunVx += -recoil * dx;
        s.gunVy += -recoil * dy;
        s.gunOmega += (p * BARREL_ABOVE_COM) / (mG * I_GUN_FACTOR);
      } else {
        // Carrinho no chão: só recuo horizontal; vertical vai para o solo. Cano sobe.
        s.gunVx += -recoil * dx;
        s.gunOmega += ((p * BARREL_ABOVE_COM) / (mG * I_GUN_FACTOR)) * 0.45;
      }
    }
    // Rastreia ambos os gatilhos para não re-disparar a cada substep.
    s.prevFire = c.fire || !!c.matrixFire;

    // --- Integração da arma ---
    if (!space) {
      // Atrito cinético freia o recuo horizontal.
      const fricA = env.muK * env.g;
      const vNew = s.gunVx + Math.sign(-s.gunVx) * fricA * dt;
      s.gunVx = Math.sign(vNew) !== Math.sign(s.gunVx) ? 0 : vNew;
      s.gunVy = 0;
      s.gunY = 0;
    }
    s.gunX += s.gunVx * dt;
    s.gunY += s.gunVy * dt;

    // Rotação: no chão/segurando o braço/estrutura é uma mola torcional amortecida
    // (o cano sobe e volta). No vácuo gira livremente.
    if (c.hold || !space) {
      const k = 120;
      const cd = 14;
      const torque = -k * s.gunAngle - cd * s.gunOmega;
      s.gunOmega += torque * dt;
    }
    s.gunAngle += s.gunOmega * dt;

    // --- Integração da bala ---
    if (s.bulletLive) {
      const speed = Math.hypot(s.bulletVx, s.bulletVy);
      
      // Arrasto do ar na bala
      if (env.airDensity > 0 && speed > 0) {
        // Drag = 0.5 * rho * v^2 * Cd * A
        // A bala tem diâmetro de ~9mm (0.009m), raio 0.0045m
        // Area = pi * r^2 ≈ 6.36e-5 m^2. Cd bala = ~0.3
        const area = 6.36e-5;
        const dragForce = 0.5 * env.airDensity * speed * speed * 0.3 * area;
        const dragAcc = dragForce / mB;
        s.bulletVx -= (dragAcc * (s.bulletVx / speed)) * dt;
        s.bulletVy -= (dragAcc * (s.bulletVy / speed)) * dt;
      }

      if (env.g > 0) s.bulletVy -= env.g * dt;
      
      s.bulletX += s.bulletVx * dt;
      s.bulletY += s.bulletVy * dt;
      s.bulletDist += speed * dt;

      // Onda de choque supersônica (v > velocidade do som local): domos em
      // cadência fixa, formando um rastro de choque liso (sem flashes aleatórios).
      const mach = speed / env.soundSpeed;
      if (mach > 1 && env.airDensity > 0) {
        s.bulletShockT += dt;
        if (s.bulletShockT >= 0.04) {
          s.bulletShockT = 0;
          s.events.push({ at: vec(s.bulletX, s.bulletY, 0), kind: "blast", color: "#bfe0ff", maxRadius: 1.1, life: 0.4 });
        }
      } else {
        s.bulletShockT = 0;
      }

      const far = Math.hypot(s.bulletX - s.gunX, s.bulletY - s.gunY) > 50000;
      if (far || (env.g > 0 && s.bulletY < 0)) s.bulletLive = false;
    }

    // Encerra o bullet-time (e o follow) após um trecho — evita ficar preso em
    // câmera lenta enquanto a bala viaja dezenas de km no vácuo.
    if (s.matrixFollow && (!s.bulletLive || s.bulletDist > 250)) {
      s.matrixFollow = false;
    }
  },

  view(s, env, params): SceneView {
    const mB = (params.massaBala ?? 8) / 1000;
    const vB = params.velBala ?? 380;
    const mG = params.massaArma ?? 1.5;
    const fired = s.firedMomentum;
    const hasFired = fired > 0;
    const pBullet = fired;
    const vRecoil0 = hasFired ? fired / mG : 0;
    const keBullet = hasFired ? 0.5 * mB * vB * vB : 0;
    const keGun = 0.5 * mG * vRecoil0 * vRecoil0;
    const recoilSpeed = Math.hypot(s.gunVx, s.gunVy);

    const showShot = s.tSinceFire < SHOT_WINDOW;
    const avgForce = pBullet / SHOT_WINDOW;
    const muzzle = muzzlePos(s);
    const dx = Math.cos(s.gunAngle);
    const dy = Math.sin(s.gunAngle);
    const shocks = s.events;
    s.events = [];

    const comY = 0.4 + s.gunY;
    const bodies = [{ id: "gun", position: vec(s.gunX, comY, 0), rotation: s.gunAngle }];
    if (s.bulletLive) bodies.push({ id: "bullet", position: vec(s.bulletX, s.bulletY, 0), rotation: Math.atan2(s.bulletVy, s.bulletVx) });

    const forces: ForceArrow[] = [];
    if (showShot) {
      forces.push({ kind: "action", label: "AÇÃO — gás empurra a bala", origin: muzzle, dir: vec(dx, dy, 0), magnitude: avgForce });
      forces.push({ kind: "reaction", label: "REAÇÃO — gás empurra a arma", origin: vec(s.gunX - 0.3 * dx, comY + 0.15, 0), dir: vec(-dx, -dy, 0), magnitude: avgForce });
    }

    const readouts: Readout[] = [];
    const metrics: Metric[] = [];

    if (s.bulletLive) {
      const bSpeed = Math.hypot(s.bulletVx, s.bulletVy);
      const bDrag = env.airDensity > 0 ? 0.5 * env.airDensity * bSpeed * bSpeed * 0.3 * 6.36e-5 : 0;
      const bWeight = mB * env.g;
      
      if (env.g > 0) {
        forces.push({ kind: "weight", label: "PESO", origin: vec(s.bulletX, s.bulletY, 0), dir: vec(0, -1, 0), magnitude: bWeight });
      }
      if (bDrag > 0 && bSpeed > 1e-6) {
        forces.push({ kind: "drag", label: "ARRASTO", origin: vec(s.bulletX, s.bulletY, 0), dir: vec(-s.bulletVx / bSpeed, -s.bulletVy / bSpeed, 0), magnitude: bDrag });
      }

      readouts.push(
        { label: L("Velocidade da bala", "Bullet speed"), value: fmt(bSpeed, 1), unit: "m/s", highlight: true },
        { label: L("Distância percorrida", "Distance traveled"), value: fmt(s.bulletDist, 1), unit: "m" },
        { label: L("Altitude da bala", "Bullet altitude"), value: fmt(s.bulletY, 2), unit: "m" }
      );
      if (env.airDensity > 0) readouts.push({ label: L("Arrasto do ar na bala", "Air drag on bullet"), value: fmt(bDrag, 2), unit: "N" });
      if (env.g > 0) readouts.push({ label: L("Caimento por gravidade", "Gravity drop"), value: fmt(muzzle.y - s.bulletY, 2), unit: "m" });

      metrics.push(
        { label: L("Velocidade", "Speed"), value: bSpeed, unit: "m/s", color: "#e7c96a" },
        { label: L("Distância", "Distance"), value: s.bulletDist, unit: "m", color: "#4d9fff" }
      );
    } else {
      readouts.push(
        { label: L("Momento da arma (recuo)", "Gun momentum (recoil)"), value: fmt(fired, 2), unit: "kg·m/s" },
        { label: L("Momento total no disparo", "Total momentum at the shot"), value: fmt(pBullet - fired, 2), unit: "kg·m/s", highlight: true },
        { label: L("Velocidade da bala", "Bullet speed"), value: fmt(hasFired ? vB : 0, 0), unit: "m/s" },
        { label: L("Veloc. de recuo atual", "Current recoil speed"), value: fmt(recoilSpeed, 2), unit: "m/s" },
        { label: L("E. cinética bala", "Bullet kinetic energy"), value: fmt(keBullet, 0), unit: "J" },
        { label: L("E. cinética arma", "Gun kinetic energy"), value: fmt(keGun, 1), unit: "J" }
      );
      metrics.push({ label: L("Veloc. de recuo", "Recoil speed"), value: recoilSpeed, unit: "m/s", color: "#4D9FFF" });
    }

    return {
      bodies,
      forces,
      readouts,
      bars: [],
      metrics,
      note: s.tSinceFire > 900
        ? L("Pressione DISPARAR para atirar.", "Press FIRE to shoot.")
        : env.g <= 0
          ? L(
              "No vácuo: a arma recua E gira (1ª lei). Cada tiro sai na direção do cano — atire de novo.",
              "In vacuum: the gun recoils AND spins (1st law). Each shot leaves along the barrel — fire again.",
            )
          : L(
              "O atrito do carrinho freia o recuo. Ative “segurar arma” para o braço absorver o momento.",
              "The cart's friction stops the recoil. Enable “hold the gun” so the arm absorbs the momentum.",
            ),
      source: L(
        "O gás da pólvora empurra a bala para frente e o fundo do cano (a arma) para trás, com a mesma força. " +
          "Os momentos são iguais e opostos e somam zero. A energia cinética NÃO se conserva — ela vem da pólvora, " +
          "e a bala leve fica com quase toda ela.",
        "The powder gas pushes the bullet forward and the back of the barrel (the gun) backward, with the same force. " +
          "The momenta are equal and opposite and sum to zero. Kinetic energy is NOT conserved — it comes from the powder, " +
          "and the light bullet keeps almost all of it.",
      ),
      particles: showShot
        ? [
            { at: muzzle, dir: vec(dx, dy + 0.1, 0), speed: 8, spread: 0.35, count: 6, kind: "exhaust" },
            { at: vec(s.gunX - 0.2 * dx, comY + 0.15, 0), dir: vec(-dx, 0.2, 0), speed: 3, spread: 0.5, count: 3, kind: "smoke" },
          ]
        : [],
      shocks,
      cameraTarget: (s.bulletLive && s.matrixFollow) ? vec(s.bulletX, s.bulletY, 0) : vec(s.gunX, 0.7 + s.gunY, 0),
      // Bullet time: enquanto a câmera acompanha a bala, roda em câmera lenta.
      timeScale: s.bulletLive && s.matrixFollow ? 0.1 : 1,
    };
  },
};

// Posição da boca do cano, girando em torno do centro de massa (cano sobe).
function muzzlePos(s: RevolverState) {
  const pivotY = 0.4 + s.gunY;
  const dx = 0.55; // boca à frente do CdM
  const dy = 0.15; // boca acima do CdM
  const ca = Math.cos(s.gunAngle);
  const sa = Math.sin(s.gunAngle);
  return vec(s.gunX + dx * ca - dy * sa, pivotY + dx * sa + dy * ca, 0);
}
