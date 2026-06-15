import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { G0, PLANETS } from "../physics";
import { useStore } from "../state/store";
import { runtime } from "./runtime";
import { toScene } from "./transform";

// Ondas de choque: anéis suaves que se abrem no chão e domos de pressão no ar.
// O tamanho e a duração dependem da gravidade do planeta (efeito gravitacional):
// em gravidade baixa as ondas se espalham mais e demoram a assentar.

const RINGS = 16;
const BLASTS = 12;

// Textura de anel suave (gradiente radial em forma de aro).
function ringTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,0)");
  g.addColorStop(0.74, "rgba(255,255,255,0.5)");
  g.addColorStop(0.84, "rgba(255,255,255,1)");
  g.addColorStop(0.93, "rgba(255,255,255,0.35)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Textura de disco suave (para o domo/sprite de pressão).
function discTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.35, "rgba(255,255,255,0.4)");
  g.addColorStop(0.7, "rgba(255,255,255,0.1)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

interface RingSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  life: number;
  maxR: number;
}
interface BlastSlot {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  t: number;
  life: number;
  maxR: number;
  vy: number;
}

// easeOut: rápido no começo, desacelera (frente de choque).
const easeOut = (p: number) => 1 - (1 - p) * (1 - p);

// Fator gravitacional: gravidade baixa => ondas maiores e mais lentas.
function gravFactor(g: number): number {
  if (g <= 0.01) return 2.2; // vácuo: espalha livremente
  return THREE.MathUtils.clamp(Math.sqrt(G0 / g), 0.6, 2.2);
}

export function ShockWaves() {
  const scenarioId = useStore((s) => s.scenarioId);
  const planetId = useStore((s) => s.planetId);
  const showParticles = useStore((s) => s.showParticles);

  const sys = useMemo(() => {
    const ringTex = ringTexture();
    const discTex = discTexture();

    const rings: RingSlot[] = Array.from({ length: RINGS }, () => {
      const mat = new THREE.MeshBasicMaterial({
        map: ringTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      return { mesh, mat, t: 0, life: 0, maxR: 1 };
    });

    const blasts: BlastSlot[] = Array.from({ length: BLASTS }, () => {
      const mat = new THREE.SpriteMaterial({
        map: discTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      return { sprite, mat, t: 0, life: 0, maxR: 1, vy: 0 };
    });

    return { rings, blasts, ringHead: 0, blastHead: 0 };
  }, []);

  useFrame((_, dtRaw) => {
    // Acompanha a câmera lenta (bullet time): as ondas de choque expandem no
    // mesmo ritmo da bala, sem "piscar".
    const dt = Math.min(dtRaw, 0.05) * (runtime.view?.timeScale ?? 1);
    const gf = gravFactor(PLANETS[planetId]?.g ?? G0);

    // Disparar novas ondas (já "drenadas" do cenário, uma vez cada).
    if (showParticles && runtime.view?.shocks) {
      for (const sh of runtime.view.shocks) {
        const [x, y, z] = toScene(sh.at, scenarioId);
        if (sh.kind === "ring") {
          const slot = sys.rings[sys.ringHead];
          sys.ringHead = (sys.ringHead + 1) % RINGS;
          slot.mesh.position.set(x, Math.max(0.04, y), z);
          slot.mat.color.set(sh.color);
          slot.t = 0;
          slot.life = sh.life * (0.7 + 0.5 * gf);
          slot.maxR = sh.maxRadius * gf;
          slot.mesh.visible = true;
        } else {
          const slot = sys.blasts[sys.blastHead];
          sys.blastHead = (sys.blastHead + 1) % BLASTS;
          slot.sprite.position.set(x, y, z);
          slot.mat.color.set(sh.color);
          slot.t = 0;
          slot.life = sh.life * (0.7 + 0.5 * gf);
          slot.maxR = sh.maxRadius * gf;
          // assenta sob a gravidade (mais forte = cai mais)
          slot.vy = -(PLANETS[planetId]?.g ?? G0) * 0.03;
          slot.sprite.visible = true;
        }
      }
    }

    for (const s of sys.rings) {
      if (s.life <= 0) continue;
      s.t += dt;
      const p = s.t / s.life;
      if (p >= 1) {
        s.life = 0;
        s.mesh.visible = false;
        continue;
      }
      const d = easeOut(p) * s.maxR * 2.4; // diâmetro do plano (aro fica ~ maxR)
      s.mesh.scale.set(d, d, 1);
      s.mat.opacity = (1 - p) * 0.85;
    }

    for (const s of sys.blasts) {
      if (s.life <= 0) continue;
      s.t += dt;
      const p = s.t / s.life;
      if (p >= 1) {
        s.life = 0;
        s.sprite.visible = false;
        continue;
      }
      const d = easeOut(p) * s.maxR * 2;
      s.sprite.scale.set(d, d, 1);
      s.sprite.position.y += s.vy * dt;
      s.mat.opacity = (1 - p) * 0.7;
    }
  });

  return (
    <>
      {sys.rings.map((s, i) => (
        <primitive key={`r${i}`} object={s.mesh} />
      ))}
      {sys.blasts.map((s, i) => (
        <primitive key={`b${i}`} object={s.sprite} />
      ))}
    </>
  );
}
