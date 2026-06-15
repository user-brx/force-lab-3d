import { useEffect, useRef } from "react";
import { L } from "../physics";
import { useStore } from "../state/store";
import { runtime } from "../scene/runtime";

// Gráfico em tempo real das grandezas do cenário (velocidade, altitude…).
// Lê runtime.view.metrics num loop próprio (~18 Hz) e desenha no canvas.
const MAXN = 200;
const PAD_TOP = 22;
const PAD_BOT = 6;

export function Graph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buffers = useRef<number[][]>([]);
  const maxes = useRef<number[]>([]);
  const scenarioId = useStore((s) => s.scenarioId);
  const resetToken = useStore((s) => s.resetToken);
  useStore((s) => s.lang); // re-render do título ao trocar idioma

  // Limpa as séries ao trocar de cenário / reiniciar.
  useEffect(() => {
    buffers.current = [];
    maxes.current = [];
  }, [scenarioId, resetToken]);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const cv = canvasRef.current;
      if (!cv) return;
      const metrics = runtime.view?.metrics ?? [];
      if (metrics.length && t - last > 55) {
        last = t;
        metrics.forEach((m, i) => {
          const b = (buffers.current[i] ??= []);
          b.push(m.value);
          if (b.length > MAXN) b.shift();
          maxes.current[i] = Math.max(maxes.current[i] ?? 0, Math.abs(m.value), 1e-6);
        });
      }
      draw(cv, metrics);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  function draw(cv: HTMLCanvasElement, metrics: { label: string; value: number; unit: string; color: string }[]) {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (cv.width !== Math.floor(w * dpr) || cv.height !== Math.floor(h * dpr)) {
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // linhas-guia horizontais
    ctx.strokeStyle = "rgba(143,162,194,0.12)";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 2; g++) {
      const y = PAD_TOP + ((h - PAD_TOP - PAD_BOT) * g) / 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // séries (cada uma normalizada pelo próprio máximo)
    buffers.current.forEach((b, i) => {
      if (b.length < 2) return;
      const mx = maxes.current[i] || 1;
      ctx.strokeStyle = metrics[i]?.color ?? "#4D9FFF";
      ctx.lineWidth = 2;
      ctx.beginPath();
      b.forEach((v, j) => {
        const x = (j / (MAXN - 1)) * w;
        const y = PAD_TOP + (h - PAD_TOP - PAD_BOT) * (1 - Math.abs(v) / mx);
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // legenda com valor atual
    ctx.font = "600 11px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.textBaseline = "middle";
    let lx = 6;
    for (const m of metrics) {
      const txt = `● ${m.label} ${m.value.toFixed(1)} ${m.unit}`;
      ctx.fillStyle = m.color;
      ctx.fillText(txt, lx, 11);
      lx += ctx.measureText(txt).width + 14;
    }
  }

  return (
    <div className="panel">
      <h2>{L("Gráfico em tempo real", "Live graph")}</h2>
      <canvas ref={canvasRef} className="graph" />
    </div>
  );
}
