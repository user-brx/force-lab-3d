import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../state/store";
import { runtime } from "./runtime";
import { toScene } from "./transform";
import { AirplaneModel, BarrierModel, BulletModel, CarModel, Humanoid, RevolverModel, RocketModel } from "./models";

// Renderiza os modelos do cenário ativo e atualiza a transform de cada um
// a cada frame, a partir do snapshot da física.
export function Bodies() {
  const scenarioId = useStore((s) => s.scenarioId);
  const planeJet = useStore((s) => (s.params.aviao?.jato ?? 0) >= 0.5);
  const groups = useRef<Record<string, THREE.Group>>({});

  useFrame(() => {
    const view = runtime.view;
    if (!view) return;
    for (const key in groups.current) {
      const g = groups.current[key];
      if (g) g.visible = false;
    }
    for (const b of view.bodies) {
      const g = groups.current[b.id];
      if (!g) continue;
      const [x, y, z] = toScene(b.position, scenarioId);
      g.position.set(x, y, z);
      g.rotation.z = b.rotation ?? 0;
      g.scale.setScalar(b.scale ?? 1);
      g.visible = true;
    }
  });

  const reg = (id: string) => (el: THREE.Group | null) => {
    if (el) groups.current[id] = el;
    else delete groups.current[id];
  };

  return (
    <>
      {scenarioId === "pessoa" && <Humanoid ref={reg("person")} bodyId="person" walk color="#4d9fff" />}
      {scenarioId === "carro" && <CarModel ref={reg("car")} />}
      {scenarioId === "aviao" && <AirplaneModel ref={reg("plane")} jet={planeJet} />}
      {scenarioId === "foguete" && <RocketModel ref={reg("rocket")} />}
      {scenarioId === "revolver" && (
        <>
          <RevolverModel ref={reg("gun")} />
          {/* Pool de balas: várias podem estar no ar ao mesmo tempo (= MAX_BULLETS). */}
          {Array.from({ length: 16 }, (_, i) => (
            <BulletModel key={i} ref={reg(`bullet${i}`)} />
          ))}
          <BarrierModel />
        </>
      )}
      {scenarioId === "patinadores" && (
        <>
          <Humanoid ref={reg("skaterA")} bodyId="skaterA" color="#4d9fff" skates />
          <Humanoid ref={reg("skaterB")} bodyId="skaterB" color="#ff5a4d" skates />
        </>
      )}
    </>
  );
}
