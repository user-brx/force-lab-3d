import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../state/store";
import { toScene } from "./transform";
import { runtime } from "./runtime";

// Rótulos flutuantes 3D ancorados a um ponto da cena (ex.: velocidade/distância
// sobre a bala em voo). Pool de sprites reutilizados, sem alocação por frame.
const POOL = 6;

interface Label {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  last: string;
}

function createLabel(): Label {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }),
  );
  sprite.scale.set(2.2, 1.1, 1);
  sprite.renderOrder = 999;
  sprite.visible = false;
  return { sprite, canvas, texture, last: "" };
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

function draw(label: Label, title: string, subtitle: string, color: string) {
  const key = `${title}|${subtitle}|${color}`;
  if (label.last === key) return;
  label.last = key;
  const ctx = label.canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 128);

  ctx.fillStyle = "rgba(10,16,28,0.85)";
  roundRect(ctx, 6, 26, 244, 76, 16);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  roundRect(ctx, 6, 26, 244, 76, 16);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.font = "bold 40px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(title, 128, subtitle ? 54 : 64);
  if (subtitle) {
    ctx.fillStyle = "#9fc3ff";
    ctx.font = "bold 26px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(subtitle, 128, 86);
  }
  label.texture.needsUpdate = true;
}

export function Labels() {
  const pool = useMemo(() => Array.from({ length: POOL }, createLabel), []);
  const scenarioId = useStore((s) => s.scenarioId);

  useFrame(() => {
    const labels = runtime.view?.labels ?? [];
    for (let i = 0; i < POOL; i++) {
      const item = pool[i];
      const l = labels[i];
      if (!l) {
        item.sprite.visible = false;
        continue;
      }
      item.sprite.visible = true;
      const [x, y, z] = toScene(l.at, scenarioId);
      item.sprite.position.set(x, y + 0.9, z);
      draw(item, l.title, l.subtitle ?? "", l.color ?? "#e7c96a");
    }
  });

  return (
    <>
      {pool.map((l, i) => (
        <primitive key={i} object={l.sprite} />
      ))}
    </>
  );
}
