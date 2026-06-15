import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../state/store";
import { FORCE_COLORS, forceTag } from "../ui/theme";
import { toScene } from "./transform";
import { runtime } from "./runtime";
import type { ForceArrow } from "../physics";

const POOL = 6;
const UP = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();

interface Arrow {
  group: THREE.Group;
  shaft: THREE.Mesh;
  head: THREE.Mesh;
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  shaftMat: THREE.MeshStandardMaterial;
  headMat: THREE.MeshStandardMaterial;
  lastLabel: string;
}

function createArrow(): Arrow {
  const group = new THREE.Group();
  group.visible = false;

  const shaftMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 });
  const headMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 });
  // emissivo para brilhar no bloom
  shaftMat.emissiveIntensity = 0.5;
  headMat.emissiveIntensity = 0.6;

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 12), shaftMat);
  shaft.position.y = 0.5; // base na origem do grupo
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 16), headMat);
  head.position.y = 1;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }),
  );
  sprite.scale.set(1.5, 0.375, 1);
  sprite.position.y = 1.35;

  group.add(shaft, head, sprite);
  return { group, shaft, head, sprite, canvas, texture, shaftMat, headMat, lastLabel: "" };
}

function drawLabel(arrow: Arrow, text: string, color: string) {
  if (arrow.lastLabel === text) return;
  arrow.lastLabel = text;
  const ctx = arrow.canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = "rgba(10,16,28,0.82)";
  roundRect(ctx, 4, 8, 248, 48, 12);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(28, 32, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#E8EEF7";
  ctx.font = "bold 26px 'Segoe UI', system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 46, 34);
  arrow.texture.needsUpdate = true;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function arrowLength(magnitude: number): number {
  if (magnitude <= 0) return 0;
  return Math.min(4, Math.max(0.6, 0.5 + 0.6 * Math.log10(1 + magnitude)));
}

function forceText(f: ForceArrow): string {
  const tag = forceTag(f.kind);
  const m = f.magnitude;
  const val = m >= 1000 ? `${(m / 1000).toFixed(1)} kN` : `${Math.round(m)} N`;
  return `${tag}  ${val}`;
}

export function Arrows() {
  const pool = useMemo(() => Array.from({ length: POOL }, createArrow), []);
  const scenarioId = useStore((s) => s.scenarioId);
  const showVectors = useStore((s) => s.showVectors);

  useFrame(() => {
    const forces = runtime.view?.forces ?? [];
    for (let i = 0; i < POOL; i++) {
      const arrow = pool[i];
      const f = forces[i];
      if (!showVectors || !f || f.magnitude <= 1e-6) {
        arrow.group.visible = false;
        continue;
      }
      arrow.group.visible = true;
      const [ox, oy, oz] = toScene(f.origin, scenarioId);
      arrow.group.position.set(ox, oy, oz);
      tmpDir.set(f.dir.x, f.dir.y, f.dir.z).normalize();
      arrow.group.quaternion.setFromUnitVectors(UP, tmpDir);

      const len = arrowLength(f.magnitude);
      arrow.shaft.scale.y = len;
      arrow.shaft.position.y = len / 2;
      arrow.head.position.y = len + 0.15;
      arrow.sprite.position.y = len + 0.5;

      const color = FORCE_COLORS[f.kind];
      arrow.shaftMat.color.set(color);
      arrow.shaftMat.emissive.set(color);
      arrow.headMat.color.set(color);
      arrow.headMat.emissive.set(color);
      drawLabel(arrow, forceText(f), color);
    }
  });

  return (
    <>
      {pool.map((a, i) => (
        <primitive key={i} object={a.group} />
      ))}
    </>
  );
}
