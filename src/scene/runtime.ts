import type { SceneView } from "../physics";

// Estado compartilhado de alta frequência entre o Engine (escreve) e os
// componentes de renderização (leem), fora do React por performance.
export const runtime = {
  /** Último snapshot produzido pela física neste frame. */
  view: null as SceneView | null,
  /** Entradas momentâneas do usuário (gimbal, disparo). */
  input: { left: false, right: false, fire: false, matrixFire: false },
};
