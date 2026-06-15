import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../state/store";
import { runtime } from "./runtime";
import { toScene } from "./transform";

const N = 600;
const FAR = -99999;

// 0 = fumaça, 1 = gás quente (exhaust), 2 = poeira, 3 = ar (fluxo/downwash)
type Kind = 0 | 1 | 2 | 3;
const KIND_CODE: Record<string, Kind> = { smoke: 0, exhaust: 1, dust: 2, air: 3 };

function softTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export function Particles() {
  const showParticles = useStore((s) => s.showParticles);
  const scenarioId = useStore((s) => s.scenarioId);

  const sys = useMemo(() => {
    const positions = new Float32Array(N * 3).fill(FAR);
    const colors = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    const life = new Float32Array(N);
    const maxLife = new Float32Array(N);
    const kind = new Uint8Array(N);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.5,
      map: softTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return { positions, colors, vel, life, maxLife, kind, geo, points, head: 0 };
  }, []);

  useFrame((_, dtRaw) => {
    // Acompanha a câmera lenta (bullet time) para um efeito coeso e liso.
    const dt = Math.min(dtRaw, 0.05) * (runtime.view?.timeScale ?? 1);
    const { positions, colors, vel, life, maxLife, kind, geo } = sys;

    // Emissão a partir dos pedidos da física.
    if (showParticles && runtime.view) {
      for (const emit of runtime.view.particles) {
        const [ox, oy, oz] = toScene(emit.at, scenarioId);
        const code = KIND_CODE[emit.kind] ?? 0;
        for (let k = 0; k < emit.count; k++) {
          const i = sys.head;
          sys.head = (sys.head + 1) % N;
          const dir = new THREE.Vector3(emit.dir.x, emit.dir.y, emit.dir.z).normalize();
          // dispersão em cone
          dir.x += (Math.random() - 0.5) * emit.spread;
          dir.y += (Math.random() - 0.5) * emit.spread;
          dir.z += (Math.random() - 0.5) * emit.spread;
          dir.normalize().multiplyScalar(emit.speed * (0.6 + Math.random() * 0.6));
          positions[i * 3] = ox;
          positions[i * 3 + 1] = oy;
          positions[i * 3 + 2] = oz;
          vel[i * 3] = dir.x;
          vel[i * 3 + 1] = dir.y;
          vel[i * 3 + 2] = dir.z;
          kind[i] = code;
          maxLife[i] = code === 1 ? 0.9 : code === 0 ? 1.6 : code === 3 ? 0.7 : 1.1;
          life[i] = maxLife[i];
        }
      }
    }

    // Integração e cor.
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        positions[i * 3 + 1] = FAR;
        colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 0;
        continue;
      }
      const k = kind[i];
      // dinâmica simples por tipo
      if (k === 0) vel[i * 3 + 1] += 0.6 * dt; // fumaça sobe
      else if (k === 2) vel[i * 3 + 1] -= 2.0 * dt; // poeira cai
      const drag = k === 1 ? 0.94 : k === 3 ? 0.99 : 0.97; // ar mantém o fluxo
      vel[i * 3] *= drag;
      vel[i * 3 + 1] *= drag;
      vel[i * 3 + 2] *= drag;
      positions[i * 3] += vel[i * 3] * dt;
      positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
      positions[i * 3 + 2] += vel[i * 3 + 2] * dt;

      const t = life[i] / maxLife[i]; // 1 -> 0
      if (k === 1) {
        // gás quente: laranja brilhante esfriando para vermelho/escuro
        colors[i * 3] = 1.0 * t + 0.1;
        colors[i * 3 + 1] = 0.45 * t * t;
        colors[i * 3 + 2] = 0.08 * t * t;
      } else if (k === 0) {
        const v = 0.5 * t;
        colors[i * 3] = v;
        colors[i * 3 + 1] = v;
        colors[i * 3 + 2] = v * 1.1;
      } else if (k === 3) {
        // fluxo de ar: azul claro suave
        colors[i * 3] = 0.35 * t;
        colors[i * 3 + 1] = 0.6 * t;
        colors[i * 3 + 2] = 0.95 * t;
      } else {
        colors[i * 3] = 0.6 * t;
        colors[i * 3 + 1] = 0.5 * t;
        colors[i * 3 + 2] = 0.35 * t;
      }
    }

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });

  return <primitive object={sys.points} />;
}
