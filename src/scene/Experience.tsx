import { type ComponentRef, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Grid, Lightformer, OrbitControls, Sky, Stars } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { PLANETS, SURFACES } from "../physics";
import { useStore } from "../state/store";
import { runtime } from "./runtime";
import { toScene } from "./transform";
import { Bodies } from "./Bodies";
import { Arrows } from "./Arrows";
import { Labels } from "./Labels";
import { Particles } from "./Particles";
import { ShockWaves } from "./ShockWaves";

// Posição inicial da câmera por cenário (offset em relação ao alvo).
const CAM_OFFSET: Record<string, [number, number, number]> = {
  pessoa: [3.5, 1.5, 7],
  carro: [5, 2.5, 10],
  aviao: [6, 2.5, 12],
  foguete: [7, 3, 15],
  // Atrás do carrinho e um pouco de lado: o cano aponta para +x, então a bala
  // sai "para frente" (para o fundo da cena) e dá para acompanhar o tiro.
  revolver: [-6, 2.2, 3.5],
  patinadores: [4, 2.2, 9],
  queda: [5, 1, 9],
};

const SPACE = new THREE.Color("#05070d");
const PAD_COLOR = "#4a4f57"; // plataforma de concreto do foguete

// Suavização da câmera (1/s). Quanto maior, mais firme segue o corpo.
const CAM_FOLLOW = 11;
const _desired = new THREE.Vector3();
const _delta = new THREE.Vector3();

function CameraRig() {
  const { camera } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const headlight = useRef<THREE.PointLight>(null);
  const scenarioId = useStore((s) => s.scenarioId);
  const planetId = useStore((s) => s.planetId);
  const resetToken = useStore((s) => s.resetToken);
  const autoRotate = useStore((s) => s.autoRotate);
  const revolverParams = useStore((s) => s.params.revolver);
  const quedaParams = useStore((s) => s.params.queda);

  const airless = PLANETS[planetId].airDensity < 0.05;

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    // Queda/Energia: começa enquadrando o objeto lá no alto (na altura escolhida).
    if (scenarioId === "queda") {
      const hh = Math.max(2, quedaParams?.altura ?? 50);
      c.target.set(0, hh, 0);
      camera.position.set(5, hh + 2, 9);
      c.update();
      return;
    }
    // Fuzil .50 com barreira ligada: enquadra TODO o corredor arma → barreira,
    // para a parede aparecer junto com o fuzil ao ativar.
    if (scenarioId === "revolver" && (revolverParams?.barreira ?? 1) >= 0.5) {
      const D = Math.min(revolverParams?.distancia ?? 15, 35);
      const back = D * 0.7 + 6;
      c.target.set(D / 2, 0.6, 0);
      camera.position.set(-back * 0.4, 0.6 + back * 0.35, back * 0.6);
      c.update();
      return;
    }
    const off = CAM_OFFSET[scenarioId] ?? [5, 2.5, 9];
    c.target.set(0, scenarioId === "foguete" ? 2 : 0.9, 0);
    camera.position.set(off[0], (c.target.y ?? 1) + off[1], off[2]);
    c.update();
  }, [scenarioId, resetToken, camera, revolverParams, quedaParams]);

  useFrame((_, dt) => {
    const c = controls.current;
    const view = runtime.view;
    if (headlight.current) headlight.current.position.copy(camera.position);
    if (!c || !view?.cameraTarget) return;
    const [tx, ty, tz] = toScene(view.cameraTarget, scenarioId);
    _desired.set(tx, ty, tz);
    const k = 1 - Math.exp(-CAM_FOLLOW * Math.min(dt, 0.05));
    _delta.copy(_desired).sub(c.target).multiplyScalar(k);
    c.target.add(_delta);
    camera.position.add(_delta);
    c.update();
  });

  return (
    <>
      <pointLight
        ref={headlight}
        intensity={airless ? 0.9 : 0.3}
        decay={0}
        color="#cfe0ff"
      />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate}
        autoRotateSpeed={0.9}
        minDistance={2}
        maxDistance={120}
        maxPolarAngle={Math.PI / 2 + 0.15}
      />
    </>
  );
}

// Fundo do céu por planeta; no foguete escurece com a altitude.
function SkyDome() {
  const { scene } = useThree();
  const scenarioId = useStore((s) => s.scenarioId);
  const planetId = useStore((s) => s.planetId);
  const planet = PLANETS[planetId];
  const bg = useRef(new THREE.Color());
  const tint = new THREE.Color(planet.skyTint);

  useFrame(() => {
    let target = tint;
    if (scenarioId === "foguete") {
      const alt = runtime.view?.cameraTarget?.y ?? 0;
      // Escurece mais rápido para não atrapalhar a visão do foguete
      const t = THREE.MathUtils.clamp(alt / 60000, 0, 1);
      target = new THREE.Color(planet.skyTint).lerp(SPACE, t);
    }
    bg.current.lerp(target, 0.06);
    scene.background = bg.current;
  });

  // Céu procedural azul só na Terra (fora do foguete). Demais planetas: fundo chapado.
  const showSky = planetId === "terra" && scenarioId !== "foguete";
  const showStars = planet.airDensity < 0.05 || scenarioId === "foguete";

  return (
    <>
      {/* Sky mais escuro: turbidity menor e rayleigh menor para não estourar */}
      {showSky && <Sky sunPosition={[20, 12, 8]} turbidity={4} rayleigh={0.6} />}
      {showStars && <Stars radius={300} depth={80} count={4000} factor={6} fade speed={0.5} />}
    </>
  );
}

function GroundPlane() {
  const planetId = useStore((s) => s.planetId);
  const surfaceId = useStore((s) => s.surfaceId);
  const scenarioId = useStore((s) => s.scenarioId);
  const planet = PLANETS[planetId];
  if (planet.g <= 0) return null;

  const color = scenarioId === "foguete" ? PAD_COLOR : (SURFACES[surfaceId]?.color ?? PAD_COLOR);
  const surfRoughness = surfaceId === "gelo" ? 0.2 : surfaceId === "areia" ? 0.95 : 0.85;
  const surfMetalness = surfaceId === "gelo" ? 0.08 : 0;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[100000, 100000]} />
        <meshStandardMaterial color={color} roughness={surfRoughness} metalness={surfMetalness} />
      </mesh>
      <Grid
        args={[400, 400]}
        cellSize={2}
        cellThickness={0.8}
        cellColor="#212a40"
        sectionSize={10}
        sectionThickness={1.2}
        sectionColor="#33405f"
        fadeDistance={26}
        fadeStrength={3}
        position={[0, 0.012, 0]}
        infiniteGrid
      />
      <ContactShadows position={[0, 0.02, 0]} opacity={0.5} scale={40} blur={2.2} far={12} />
    </group>
  );
}

function SpaceReference() {
  const scenarioId = useStore((s) => s.scenarioId);
  const planetId = useStore((s) => s.planetId);
  if (scenarioId !== "foguete" || PLANETS[planetId].g > 0) return null;

  const rings = [];
  for (let i = 0; i < 28; i++) {
    rings.push(
      <mesh key={i} position={[0, i * 14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[7.7, 8, 72]} />
        <meshBasicMaterial color="#2b4a6a" transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>,
    );
  }
  return <group>{rings}</group>;
}

// Ambiente de reflexos 100 % procedural (sem rede): painéis de luz (Lightformers)
// geram o mapa de reflexão uma única vez (frames={1}). Antes usava HDRI de CDN,
// o que quebrava o offline e causava flicker no iPhone a cada troca de planeta.
function DynamicEnvironment() {
  return (
    <Environment resolution={256} frames={1} environmentIntensity={0.55}>
      {/* teto frio amplo (luz-chave) */}
      <Lightformer intensity={1.4} color="#cfe0ff" position={[0, 6, -8]} scale={[14, 10, 1]} />
      {/* preenchimento lateral esquerdo */}
      <Lightformer intensity={0.7} color="#ffffff" rotation={[0, Math.PI / 2, 0]} position={[-6, 1, 0]} scale={[12, 6, 1]} />
      {/* preenchimento lateral direito */}
      <Lightformer intensity={0.7} color="#ffffff" rotation={[0, -Math.PI / 2, 0]} position={[6, 1, 0]} scale={[12, 6, 1]} />
      {/* realce frontal azulado */}
      <Lightformer intensity={0.5} color="#a8c6ff" rotation={[Math.PI / 2, 0, 0]} position={[0, 4, 6]} scale={[10, 10, 1]} />
      {/* base escura para contraste embaixo */}
      <Lightformer intensity={0.25} color="#1a2740" rotation={[-Math.PI / 2, 0, 0]} position={[0, -4, 0]} scale={[14, 14, 1]} />
    </Environment>
  );
}

export function Experience() {
  return (
    <>
      <hemisphereLight args={["#bcd4ff", "#2a2f3a", 0.7]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[18, 24, 12]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />

      <SkyDome />
      <DynamicEnvironment />
      <GroundPlane />
      <SpaceReference />
      <Bodies />
      <Arrows />
      <Labels />
      <Particles />
      <ShockWaves />
      <CameraRig />

      <EffectComposer enableNormalPass={false} multisampling={4}>
        <Bloom intensity={0.6} luminanceThreshold={0.3} luminanceSmoothing={0.5} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.7} />
      </EffectComposer>
    </>
  );
}
