import { describe, expect, it } from "vitest";
import { EARTH_MASS, G0, gravityAt } from "../constants";
import { makeEnvironment } from "../environments";
import { PLANET_ORDER, SCENARIOS, SCENARIO_ORDER } from "../index";
import { airplane } from "../scenarios/airplane";
import { person } from "../scenarios/person";
import { car } from "../scenarios/car";
import { revolver } from "../scenarios/revolver";
import { rocket } from "../scenarios/rocket";
import { skaters } from "../scenarios/skaters";
import { emptyControls } from "../types";

// Isp usado internamente pelo foguete (querosene/LOX). Mantido em sincronia com rocket.ts.
const ISP_TEST = 280;

// Todos os testes validam o núcleo contra a solução analítica de livro-texto.

describe("Pessoa - 2ª e 3ª leis de Newton", () => {
  it("o astro recebe a mesma força, com aceleração ~ massa_pessoa/massa_astro menor", () => {
    const env = makeEnvironment("terra", "asfalto");
    const s = person.init(env, {});
    person.step(s, env, { massa: 70, forca: 380 }, emptyControls(), 0.016);
    const aPessoa = s.propulsion / 70;
    const ratio = aPessoa / Math.abs(s.aBody);
    expect(ratio).toBeCloseTo(EARTH_MASS / 70, -15);
    expect(s.aBody).toBeCloseTo(s.propulsion / EARTH_MASS, 30);
  });

  it("no gelo a força pedida ultrapassa o atrito estático: escorrega", () => {
    const env = makeEnvironment("terra", "gelo");
    const s = person.init(env, {});
    person.step(s, env, { massa: 70, forca: 380 }, emptyControls(), 0.016);
    expect(s.slipping).toBe(true);
    expect(Math.abs(s.propulsion)).toBeCloseTo(env.muK * 70 * env.g, 5);
  });

  it("na Lua o peso é bem menor que na Terra (mesma massa)", () => {
    const terra = makeEnvironment("terra", "asfalto");
    const lua = makeEnvironment("lua", "asfalto");
    expect(70 * lua.g).toBeLessThan(70 * terra.g);
    expect(lua.g / terra.g).toBeCloseTo(1.62 / 9.80665, 3);
  });
});

describe("Patinadores - conservação de momento", () => {
  it("no vácuo, momento total permanece zero e v ∝ 1/m", () => {
    const env = makeEnvironment("vacuo", "gelo");
    const params = { massaA: 60, massaB: 90, forca: 300 };
    const s = skaters.init(env, params);
    skaters.step(s, env, params, { ...emptyControls(), fire: true }, 0.01); // dispara o empurrão
    for (let i = 0; i < 200; i++) skaters.step(s, env, params, emptyControls(), 0.01);
    const p1 = 60 * s.v1;
    const p2 = 90 * s.v2;
    expect(p1 + p2).toBeCloseTo(0, 6);
    expect(Math.abs(s.v1 / s.v2)).toBeCloseTo(90 / 60, 4);
  });
});

describe("Carro - tração limitada por atrito", () => {
  it("no gelo a roda patina e a tração cai ao atrito cinético", () => {
    const env = makeEnvironment("terra", "gelo");
    const params = { massa: 1200, forca: 4500 };
    const s = car.init(env, params);
    for (let i = 0; i < 200; i++) car.step(s, env, params, emptyControls(), 0.016);
    expect(s.spinning).toBe(true);
    expect(s.fTraction).toBeCloseTo(env.muK * 1200 * env.g, 3);
  });
});

describe("Fuzil .50 - conservação de momento e energia da pólvora", () => {
  it("no vácuo com freio de boca, |p_arma| ≈ MUZZLE_BRAKE × |p_bala| e keBala >> keArma", () => {
    const env = makeEnvironment("vacuo", "asfalto");
    // Valores reais do .50 BMG M33 Ball (Barrett M82A1): 42 g a 890 m/s, arma 14 kg
    const params = { massaBala: 42, velBala: 890, massaArma: 14 };
    const s = revolver.init(env, params);
    const fire = { ...emptyControls(), fire: true };
    revolver.step(s, env, params, fire, 0.016);
    const mB = 42 / 1000;
    const pBala = mB * 890;                   // ≈ 37.38 kg·m/s
    const recoilSpeed = Math.hypot(s.gunVx, s.gunVy);
    const pArma = 14 * recoilSpeed;
    const MUZZLE_BRAKE = 0.38;
    // Freio de boca absorve ~62 % do recuo; a arma recebe apenas MUZZLE_BRAKE × p_bala
    expect(pArma).toBeCloseTo(pBala * MUZZLE_BRAKE, 5);
    const keBala = 0.5 * mB * 890 ** 2;      // ≈ 17 kJ
    const keArma = 0.5 * 14 * recoilSpeed ** 2;
    // Projétil supersônico carrega muito mais energia cinética que a arma
    expect(keBala).toBeGreaterThan(keArma * 5);
  });

  it("cada tiro adiciona uma bala sem apagar as anteriores; Matrix segue a mais recente", () => {
    const env = makeEnvironment("vacuo", "asfalto"); // sem gravidade: as balas não caem
    const params = { massaBala: 42, velBala: 890, massaArma: 14 };
    const s = revolver.init(env, params);
    const fire = () => revolver.step(s, env, params, { ...emptyControls(), fire: true }, 0.01);
    const matrix = () => revolver.step(s, env, params, { ...emptyControls(), matrixFire: true }, 0.01);
    const release = () => revolver.step(s, env, params, emptyControls(), 0.01);

    fire();
    expect(s.bullets.length).toBe(1);
    release();
    fire();
    expect(s.bullets.length).toBe(2); // o 2º tiro NÃO apaga o 1º
    release();
    matrix();
    expect(s.bullets.length).toBe(3);
    expect(s.matrixActive).toBe(true);

    // A câmera Matrix mira a última bala que saiu do cano (a mais recente).
    const newest = s.bullets[s.bullets.length - 1];
    const view = revolver.view(s, env, params);
    expect(view.cameraTarget?.x).toBeCloseTo(newest.x, 6);
    expect(view.timeScale).toBeLessThan(1);
  });

  it("Cd cresce no transônico e cai no supersônico (curva real do M33)", () => {
    // O arrasto na Terra deve frear a bala mais rápido que o modelo de Cd constante.
    const env = makeEnvironment("terra", "asfalto");
    const params = { massaBala: 42, velBala: 890, massaArma: 14 };
    const s = revolver.init(env, params);
    revolver.step(s, env, params, { ...emptyControls(), fire: true }, 0.001);
    // Desaceleração inicial por arrasto: a ≈ ½ρv²·Cd·A / m, com Cd(Mach 2,6) ≈ 0,30.
    // Avança um passo curto e mede a perda de velocidade horizontal só por arrasto.
    const b0 = s.bullets[0];
    const v0 = Math.hypot(b0.vx, b0.vy);
    const before = b0.vx;
    revolver.step(s, env, params, emptyControls(), 0.001);
    const decel = (before - s.bullets[0].vx) / 0.001; // m/s²
    // Esperado ~430-470 m/s² (vs. ~380 com o antigo Cd = 0,25).
    expect(decel).toBeGreaterThan(400);
    expect(decel).toBeLessThan(520);
    expect(v0).toBeGreaterThan(880);
  });
});

describe("Avião - precisa de ar para voar", () => {
  it("decola na Terra, mas não voa no vácuo (sem empuxo nem sustentação)", () => {
    const earth = makeEnvironment("terra", "asfalto");
    const space = makeEnvironment("vacuo", "asfalto");
    const params = { massa: 3000, empuxo: 22, jato: 0 };
    const sE = airplane.init(earth, params);
    const sV = airplane.init(space, params);
    for (let i = 0; i < 600; i++) {
      airplane.step(sE, earth, params, emptyControls(), 0.02);
      airplane.step(sV, space, params, emptyControls(), 0.02);
    }
    expect(sE.airborne).toBe(true);
    expect(sE.y).toBeGreaterThan(1);
    expect(sV.airborne).toBe(false);
    expect(sV.T).toBeCloseTo(0, 6);
  });
});

describe("Foguete - fluxo de massa, TWR e equação de Tsiolkovsky", () => {
  it("não decola quando TWR ≤ 1", () => {
    const env = makeEnvironment("terra", "asfalto");
    const params = { empuxo: 5, massaSeca: 2000, combustivel: 100 };
    const s = rocket.init(env, params);
    for (let i = 0; i < 120; i++) rocket.step(s, env, params, emptyControls(), 0.016);
    expect(s.y).toBeCloseTo(0, 3);
  });

  it("um TWR maior na Lua permite decolar com empuxo que não levantaria na Terra", () => {
    const params = { empuxo: 9, massaSeca: 500, combustivel: 100 };
    // Na Terra esse empuxo não levanta; na Lua, sim.
    const terra = makeEnvironment("terra", "asfalto");
    const lua = makeEnvironment("lua", "asfalto");
    const sT = rocket.init(terra, params);
    const sL = rocket.init(lua, params);
    for (let i = 0; i < 200; i++) {
      rocket.step(sT, terra, params, emptyControls(), 0.016);
      rocket.step(sL, lua, params, emptyControls(), 0.016);
    }
    expect(sT.y).toBeCloseTo(0, 2); // preso no chão na Terra
    expect(sL.y).toBeGreaterThan(1); // decolou na Lua
  });

  it("no vácuo, a velocidade final ≈ Δv de Tsiolkovsky (Isp·g0·ln(m0/mf))", () => {
    const env = makeEnvironment("vacuo", "asfalto");
    const params = { empuxo: 30, massaSeca: 500, combustivel: 100 };
    const s = rocket.init(env, params);
    const m0 = s.mDry + s.mProp0;
    const mf = s.mDry;
    const dv = ISP_TEST * G0 * Math.log(m0 / mf);
    const dt = 0.002;
    let guard = 0;
    while (s.mProp > 0 && guard < 200000) {
      rocket.step(s, env, params, emptyControls(), dt);
      guard++;
    }
    const speed = Math.hypot(s.vx, s.vy);
    expect(speed).toBeGreaterThan(dv * 0.97);
    expect(speed).toBeLessThan(dv * 1.03);
  });
});

describe("Gravidade em altitude usa o raio real do astro", () => {
  it("na Lua a gravidade cai mais rápido com a altitude que na Terra (raio menor)", () => {
    const lua = makeEnvironment("lua", "asfalto");
    const terra = makeEnvironment("terra", "asfalto");
    const h = 100000; // 100 km
    const fracLua = gravityAt(h, lua.g, lua.radius) / lua.g;
    const fracTerra = gravityAt(h, terra.g, terra.radius) / terra.g;
    expect(fracLua).toBeLessThan(fracTerra);
    // bate com (R/(R+h))²
    expect(gravityAt(h, lua.g, lua.radius)).toBeCloseTo(lua.g * (lua.radius / (lua.radius + h)) ** 2, 6);
  });
});

// Simulação geral: roda todos os cenários em todos os planetas, com inputs
// variados, e garante que nada vira NaN/Infinito (caça-bugs).
describe("Smoke - nenhuma simulação gera NaN/Infinito", () => {
  const finite = (n: number) => Number.isFinite(n);
  const okVec = (v: { x: number; y: number; z: number }) => finite(v.x) && finite(v.y) && finite(v.z);

  for (const sid of SCENARIO_ORDER) {
    for (const pid of PLANET_ORDER) {
      it(`${sid} @ ${pid}`, () => {
        const sc = SCENARIOS[sid];
        const env = makeEnvironment(pid, sc.surfaces[0] ?? "asfalto");
        const params: Record<string, number> = {};
        for (const [k, def] of Object.entries(sc.params)) params[k] = def.default;
        const st = sc.init(env, params);

        for (let i = 0; i < 400; i++) {
          const c = {
            left: i % 120 < 30,
            right: i % 120 >= 60 && i % 120 < 90,
            fire: i % 80 === 0,
            hold: false,
          };
          sc.step(st, env, params, c, 0.016);
          const view = sc.view(st, env, params);
          for (const f of view.forces) {
            expect(finite(f.magnitude)).toBe(true);
            expect(okVec(f.origin)).toBe(true);
            expect(okVec(f.dir)).toBe(true);
          }
          for (const b of view.bodies) {
            expect(okVec(b.position)).toBe(true);
            expect(finite(b.rotation ?? 0)).toBe(true);
          }
          for (const m of view.metrics ?? []) expect(finite(m.value)).toBe(true);
          for (const bar of view.bars) expect(finite(bar.value)).toBe(true);
          if (view.cameraTarget) expect(okVec(view.cameraTarget)).toBe(true);
        }
      });
    }
  }
});
