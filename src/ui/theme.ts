import { L, type ForceKind } from "../physics";

// Paleta da interface.
export const UI = {
  bg: "#0E1626",
  panel: "rgba(20, 31, 54, 0.82)",
  panelSolid: "#141F36",
  border: "#27395B",
  ink: "#E8EEF7",
  inkSoft: "#8FA2C2",
  accent: "#4D9FFF",
};

// Cor de cada tipo de força (setas + legenda).
export const FORCE_COLORS: Record<ForceKind, string> = {
  action: "#FF4D5E",
  reaction: "#4D9FFF",
  weight: "#B07CFF",
  normal: "#2DD4A7",
  drag: "#FF8A3C",
  thrust: "#4DD0FF",
  lift: "#34E0C0",
  push: "#FFB13C",
};

// Rótulo curto por tipo de força (para a seta), traduzido.
export function forceTag(kind: ForceKind): string {
  switch (kind) {
    case "action":
      return L("AÇÃO", "ACTION");
    case "reaction":
      return L("REAÇÃO", "REACTION");
    case "weight":
      return L("PESO", "WEIGHT");
    case "normal":
      return L("NORMAL", "NORMAL");
    case "drag":
      return L("ARRASTO", "DRAG");
    case "thrust":
      return L("EMPUXO", "THRUST");
    case "lift":
      return L("SUSTENTAÇÃO", "LIFT");
    case "push":
      return L("FORÇA", "FORCE");
  }
}

// Legenda exibida no HUD, traduzida.
export function forceLegend(): { kind: ForceKind; label: string }[] {
  return [
    { kind: "action", label: L("Ação", "Action") },
    { kind: "reaction", label: L("Reação", "Reaction") },
    { kind: "weight", label: L("Peso", "Weight") },
    { kind: "normal", label: L("Normal", "Normal") },
    { kind: "drag", label: L("Arrasto", "Drag") },
    { kind: "thrust", label: L("Empuxo", "Thrust") },
    { kind: "lift", label: L("Sustentação", "Lift") },
  ];
}
