import { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { L } from "./physics";
import { Engine } from "./scene/Engine";
import { Experience } from "./scene/Experience";
import { BottomBar, SidePanel, TopBar } from "./ui/Controls";
import { Hud } from "./ui/Hud";
import { runtime } from "./scene/runtime";
import { useStore } from "./state/store";
import "./ui/styles.css";

function useKeyboard() {
  const togglePause = useStore((s) => s.togglePause);
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => (e.target as HTMLElement)?.tagName === "INPUT";
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.code === "ArrowLeft") runtime.input.left = true;
      else if (e.code === "ArrowRight") runtime.input.right = true;
      else if (e.code === "Space") {
        e.preventDefault();
        runtime.input.fire = true;
      } else if (e.code === "KeyP") togglePause();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft") runtime.input.left = false;
      else if (e.code === "ArrowRight") runtime.input.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [togglePause]);
}

export default function App() {
  useKeyboard();
  const panelsOpen = useStore((s) => s.panelsOpen);
  const togglePanels = useStore((s) => s.togglePanels);
  useStore((s) => s.lang); // re-renderiza o rótulo de acessibilidade ao trocar idioma
  return (
    <>
      <div className="canvas-wrap">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [4, 2, 8], fov: 50 }}
          gl={{ antialias: false, powerPreference: "high-performance" }}
        >
          <Engine />
          <Experience />
        </Canvas>
      </div>

      <div className="overlay">
        <TopBar />
        <div className={`cols ${panelsOpen ? "" : "collapsed"}`}>
          <SidePanel />
          <div className="mid" />
          <Hud />
        </div>
        <BottomBar />
      </div>

      {/* Recolher/mostrar painéis — visível só no mobile (CSS) */}
      <button
        className="panel-toggle"
        onClick={togglePanels}
        aria-label={panelsOpen ? L("Fechar painéis", "Close panels") : L("Abrir painéis", "Open panels")}
      >
        {panelsOpen ? "✕" : "☰"}
      </button>
    </>
  );
}
