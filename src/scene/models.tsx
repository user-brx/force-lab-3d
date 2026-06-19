import { forwardRef, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BARRIER_CENTER_Y, BARRIER_HEIGHT, BARRIER_MATERIALS, PLANETS } from "../physics";
import { useStore } from "../state/store";
import { runtime } from "./runtime";

// Modelos procedurais. Cada um é um <group> cuja transform o Engine atualiza
// a cada frame a partir do snapshot da física. Centro de cada grupo conforme
// a convenção do cenário (pés no chão; foguete e arma centrados no CdM).

const skin = "#e8b48c";
const SKIRT = "#222a3a";

interface HumanoidProps {
  color?: string;
  skates?: boolean;
  /** id do corpo no snapshot (para ler a fase da passada). */
  bodyId?: string;
  /** anima as pernas/braços andando. */
  walk?: boolean;
}

export const Humanoid = forwardRef<THREE.Group, HumanoidProps>(
  ({ color = "#4d9fff", skates = false, bodyId, walk = false }, ref) => {
    const inner = useRef<THREE.Group>(null);
    const legL = useRef<THREE.Group>(null);
    const legR = useRef<THREE.Group>(null);
    const armL = useRef<THREE.Group>(null);
    const armR = useRef<THREE.Group>(null);
    const phaseRef = useRef(0);

    useFrame(() => {
      const target =
        walk && bodyId ? (runtime.view?.bodies.find((b) => b.id === bodyId)?.phase ?? 0) : 0;
      phaseRef.current += (target - phaseRef.current) * 0.5;
      const sw = Math.sin(phaseRef.current) * 0.45;
      if (legL.current) legL.current.rotation.x = sw;
      if (legR.current) legR.current.rotation.x = -sw;
      if (armL.current) armL.current.rotation.x = -sw * 0.7;
      if (armR.current) armR.current.rotation.x = sw * 0.7;
      if (inner.current) inner.current.position.y = walk ? Math.abs(Math.sin(phaseRef.current)) * 0.04 : 0;
    });

    return (
      <group ref={ref}>
        <group ref={inner} rotation={[0, Math.PI / 2, 0]}>
          {/* perna esquerda (pivô no quadril) */}
          <group ref={legL} position={[-0.13, 0.85, 0]}>
            <mesh position={[0, -0.38, 0]} castShadow>
              <capsuleGeometry args={[0.1, 0.55, 6, 12]} />
              <meshStandardMaterial color={SKIRT} roughness={0.8} />
            </mesh>
            {skates && (
              <mesh position={[0.04, -0.74, 0]} castShadow>
                <boxGeometry args={[0.5, 0.06, 0.16]} />
                <meshStandardMaterial color="#cfd8e6" metalness={0.6} roughness={0.3} />
              </mesh>
            )}
          </group>
          {/* perna direita */}
          <group ref={legR} position={[0.13, 0.85, 0]}>
            <mesh position={[0, -0.38, 0]} castShadow>
              <capsuleGeometry args={[0.1, 0.55, 6, 12]} />
              <meshStandardMaterial color={SKIRT} roughness={0.8} />
            </mesh>
            {skates && (
              <mesh position={[0.04, -0.74, 0]} castShadow>
                <boxGeometry args={[0.5, 0.06, 0.16]} />
                <meshStandardMaterial color="#cfd8e6" metalness={0.6} roughness={0.3} />
              </mesh>
            )}
          </group>
          {/* tronco */}
          <mesh position={[0, 1.12, 0]} castShadow>
            <capsuleGeometry args={[0.22, 0.5, 8, 16]} />
            <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
          </mesh>
          {/* braço esquerdo (pivô no ombro) */}
          <group ref={armL} position={[-0.3, 1.3, 0]}>
            <mesh position={[0, -0.26, 0]} castShadow>
              <capsuleGeometry args={[0.07, 0.45, 6, 12]} />
              <meshStandardMaterial color={color} roughness={0.55} />
            </mesh>
          </group>
          {/* braço direito */}
          <group ref={armR} position={[0.3, 1.3, 0]}>
            <mesh position={[0, -0.26, 0]} castShadow>
              <capsuleGeometry args={[0.07, 0.45, 6, 12]} />
              <meshStandardMaterial color={color} roughness={0.55} />
            </mesh>
          </group>
          {/* cabeça */}
          <mesh position={[0, 1.62, 0]} castShadow>
            <sphereGeometry args={[0.17, 24, 24]} />
            <meshStandardMaterial color={skin} roughness={0.6} />
          </mesh>
          {/* rosto na frente do boneco (+z local = direção em que ele anda) */}
          <group position={[0, 1.62, 0]}>
            {/* olhos */}
            <mesh position={[-0.062, 0.05, 0.14]} castShadow>
              <sphereGeometry args={[0.028, 12, 12]} />
              <meshStandardMaterial color="#10151f" roughness={0.4} />
            </mesh>
            <mesh position={[0.062, 0.05, 0.14]} castShadow>
              <sphereGeometry args={[0.028, 12, 12]} />
              <meshStandardMaterial color="#10151f" roughness={0.4} />
            </mesh>
            {/* nariz */}
            <mesh position={[0, 0, 0.16]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <coneGeometry args={[0.03, 0.07, 10]} />
              <meshStandardMaterial color="#d89a6e" roughness={0.6} />
            </mesh>
            {/* boca */}
            <mesh position={[0, -0.075, 0.145]} castShadow>
              <boxGeometry args={[0.08, 0.018, 0.02]} />
              <meshStandardMaterial color="#7a3b3b" roughness={0.5} />
            </mesh>
          </group>
        </group>
      </group>
    );
  },
);
Humanoid.displayName = "Humanoid";

export const CarModel = forwardRef<THREE.Group, object>((_, ref) => (
  <group ref={ref}>
    {/* chassi */}
    <mesh position={[0, 0.55, 0]} castShadow>
      <boxGeometry args={[3.8, 0.55, 1.7]} />
      <meshStandardMaterial color="#d8443a" metalness={0.6} roughness={0.3} />
    </mesh>
    {/* cabine */}
    <mesh position={[-0.15, 1.02, 0]} castShadow>
      <boxGeometry args={[2.0, 0.55, 1.5]} />
      <meshStandardMaterial color="#b8362e" metalness={0.6} roughness={0.3} />
    </mesh>
    {/* vidros - escuro reflexivo, leve */}
    <mesh position={[-0.15, 1.03, 0]}>
      <boxGeometry args={[2.02, 0.4, 1.52]} />
      <meshStandardMaterial color="#0a1420" metalness={0.95} roughness={0.05} />
    </mesh>
    {/* faróis */}
    <mesh position={[1.9, 0.6, 0.55]}>
      <sphereGeometry args={[0.12, 16, 16]} />
      <meshStandardMaterial color="#fff6d8" emissive="#fff0b0" emissiveIntensity={1.4} />
    </mesh>
    <mesh position={[1.9, 0.6, -0.55]}>
      <sphereGeometry args={[0.12, 16, 16]} />
      <meshStandardMaterial color="#fff6d8" emissive="#fff0b0" emissiveIntensity={1.4} />
    </mesh>
    {/* lanternas traseiras */}
    <mesh position={[-1.9, 0.6, 0.6]}>
      <sphereGeometry args={[0.09, 12, 12]} />
      <meshStandardMaterial color="#ff2020" emissive="#ff1010" emissiveIntensity={1.2} />
    </mesh>
    <mesh position={[-1.9, 0.6, -0.6]}>
      <sphereGeometry args={[0.09, 12, 12]} />
      <meshStandardMaterial color="#ff2020" emissive="#ff1010" emissiveIntensity={1.2} />
    </mesh>
    {/* rodas */}
    {[
      [-1.2, 0.33, 0.85],
      [-1.2, 0.33, -0.85],
      [1.2, 0.33, 0.85],
      [1.2, 0.33, -0.85],
    ].map((p, i) => (
      <mesh key={i} position={p as [number, number, number]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.33, 0.33, 0.3, 24]} />
        <meshStandardMaterial color="#15171c" roughness={0.85} />
      </mesh>
    ))}
  </group>
));
CarModel.displayName = "CarModel";

export const RocketModel = forwardRef<THREE.Group, object>((_, ref) => {
  const diamonds = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.PointLight>(null);
  const planetAir = useStore((s) => PLANETS[s.planetId].airDensity);
  const planetSH = useStore((s) => PLANETS[s.planetId].scaleHeight);

  useFrame(({ clock }) => {
    const firing = (runtime.view?.particles?.length ?? 0) > 0;
    if (glowRef.current) {
      glowRef.current.intensity = firing ? 3 + Math.sin(clock.elapsedTime * 20) * 1 : 0;
    }
    if (!diamonds.current) return;
    const alt = Math.max(0, runtime.view?.cameraTarget?.y ?? 0);
    const localRho = planetAir * Math.exp(-alt / planetSH);
    diamonds.current.visible = firing && localRho > 0.25;
    if (diamonds.current.visible) {
      const p = 1 + Math.sin(clock.elapsedTime * 30) * 0.08;
      diamonds.current.scale.set(p, 1, p);
    }
  });

  return (
  <group ref={ref}>
    {/* corpo (centrado no CdM, y=0) */}
    <mesh position={[0, 0, 0]} castShadow>
      <cylinderGeometry args={[0.5, 0.5, 6, 32]} />
      <meshStandardMaterial color="#eef2f7" metalness={0.7} roughness={0.25} />
    </mesh>
    {/* faixa */}
    <mesh position={[0, 1.4, 0]}>
      <cylinderGeometry args={[0.51, 0.51, 0.6, 32]} />
      <meshStandardMaterial color="#d8443a" metalness={0.3} roughness={0.4} />
    </mesh>
    {/* nosecone */}
    <mesh position={[0, 3.6, 0]} castShadow>
      <coneGeometry args={[0.5, 1.2, 32]} />
      <meshStandardMaterial color="#d8443a" metalness={0.3} roughness={0.4} />
    </mesh>
    {/* janela */}
    <mesh position={[0, 2.2, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.16, 0.16, 0.08, 24]} />
      <meshStandardMaterial color="#7fd4ff" emissive="#2aa0ff" emissiveIntensity={0.6} metalness={0.6} roughness={0.1} />
    </mesh>
    {/* bocal (sino) na base */}
    <mesh position={[0, -3.4, 0]} castShadow>
      <cylinderGeometry args={[0.46, 0.26, 0.9, 28, 1, true]} />
      <meshStandardMaterial color="#3a3f4a" metalness={0.8} roughness={0.35} side={THREE.DoubleSide} />
    </mesh>
    {/* aletas */}
    {[0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((a, i) => (
      <mesh
        key={i}
        position={[Math.sin(a) * 0.55, -2.6, Math.cos(a) * 0.55]}
        rotation={[0, -a, 0]}
        castShadow
      >
        <boxGeometry args={[0.06, 1.1, 0.7]} />
        <meshStandardMaterial color="#d8443a" metalness={0.3} roughness={0.45} />
      </mesh>
    ))}
    {/* Luz pontual para simular o brilho do motor */}
    <pointLight
      ref={glowRef}
      position={[0, -4.2, 0]}
      color="#ff8030"
      intensity={0}
      decay={2}
      distance={18}
    />
    {/* Mach diamonds (nós de choque) abaixo do bocal - só na atmosfera */}
    <group ref={diamonds} position={[0, -4.3, 0]} visible={false}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[0, -i * 0.7, 0]}>
          <sphereGeometry args={[Math.max(0.08, 0.33 - i * 0.04), 12, 12]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? "#fff0c0" : "#ff8a3c"}
            transparent
            opacity={0.9 - i * 0.12}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  </group>
  );
});
RocketModel.displayName = "RocketModel";

export const RevolverModel = forwardRef<THREE.Group, object>((_, ref) => (
  <group ref={ref}>
    {/* Plataforma do carrinho */}
    <mesh position={[0, -0.18, 0]} castShadow>
      <boxGeometry args={[1.5, 0.15, 0.65]} />
      <meshStandardMaterial color="#566385" metalness={0.4} roughness={0.5} />
    </mesh>
    {/* Rodas */}
    {([ [-0.55, -0.34, 0.36], [-0.55, -0.34, -0.36], [0.55, -0.34, 0.36], [0.55, -0.34, -0.36] ] as [number,number,number][]).map((p, i) => (
      <mesh key={i} position={p} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.12, 20]} />
        <meshStandardMaterial color="#2a2e38" roughness={0.85} />
      </mesh>
    ))}
    {/* Receptor / corpo principal */}
    <mesh position={[0, 0.13, 0]} castShadow>
      <boxGeometry args={[0.70, 0.17, 0.16]} />
      <meshStandardMaterial color="#1e2430" metalness={0.75} roughness={0.4} />
    </mesh>
    {/* Cano longo do .50 BMG (≈ 73 cm) - tip at x ≈ 1.05 */}
    <mesh position={[0.70, 0.15, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.022, 0.022, 0.70, 16]} />
      <meshStandardMaterial color="#aab2c4" metalness={0.92} roughness={0.22} />
    </mesh>
    {/* Freio de boca (muzzle brake) */}
    <mesh position={[1.07, 0.15, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.038, 0.038, 0.06, 12]} />
      <meshStandardMaterial color="#ccd3e0" metalness={0.88} roughness={0.28} />
    </mesh>
    {/* Ranhuras do freio de boca */}
    {([-0.015, 0.015] as number[]).map((xOff, i) => (
      <mesh key={i} position={[1.07 + xOff, 0.15, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.042, 0.042, 0.007, 12]} />
        <meshStandardMaterial color="#9aa2b0" metalness={0.85} roughness={0.3} />
      </mesh>
    ))}
    {/* Luneta */}
    <mesh position={[0.06, 0.265, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.030, 0.030, 0.44, 14]} />
      <meshStandardMaterial color="#1a1e26" metalness={0.65} roughness={0.5} />
    </mesh>
    {/* Montagens da luneta */}
    {([0.0, 0.18] as number[]).map((x, i) => (
      <mesh key={i} position={[x, 0.213, 0]} castShadow>
        <boxGeometry args={[0.04, 0.07, 0.055]} />
        <meshStandardMaterial color="#1a1e26" metalness={0.7} roughness={0.4} />
      </mesh>
    ))}
    {/* Bipé - perna esquerda */}
    <mesh position={[0.50, -0.06, 0.16]} rotation={[0.28, 0, 0.08]} castShadow>
      <boxGeometry args={[0.022, 0.38, 0.022]} />
      <meshStandardMaterial color="#2a2e38" metalness={0.6} roughness={0.5} />
    </mesh>
    {/* Bipé - perna direita */}
    <mesh position={[0.50, -0.06, -0.16]} rotation={[-0.28, 0, 0.08]} castShadow>
      <boxGeometry args={[0.022, 0.38, 0.022]} />
      <meshStandardMaterial color="#2a2e38" metalness={0.6} roughness={0.5} />
    </mesh>
    {/* Punho de pistola */}
    <mesh position={[0.20, -0.01, 0]} rotation={[0, 0, 0.28]} castShadow>
      <boxGeometry args={[0.10, 0.25, 0.11]} />
      <meshStandardMaterial color="#2e2018" roughness={0.8} />
    </mesh>
    {/* Coronha (stock) */}
    <mesh position={[-0.60, 0.12, 0]} castShadow>
      <boxGeometry args={[0.32, 0.13, 0.14]} />
      <meshStandardMaterial color="#1a1e26" metalness={0.5} roughness={0.55} />
    </mesh>
    {/* Descanso de bochecha */}
    <mesh position={[-0.54, 0.215, 0]} castShadow>
      <boxGeometry args={[0.26, 0.065, 0.10]} />
      <meshStandardMaterial color="#252a36" metalness={0.4} roughness={0.65} />
    </mesh>
  </group>
));
RevolverModel.displayName = "RevolverModel";

export const BulletModel = forwardRef<THREE.Group, object>((_, ref) => (
  <group ref={ref}>
    <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
      <capsuleGeometry args={[0.06, 0.14, 8, 16]} />
      <meshStandardMaterial color="#e7c96a" metalness={0.9} roughness={0.2} emissive="#a8761f" emissiveIntensity={0.3} />
    </mesh>
  </group>
));
BulletModel.displayName = "BulletModel";

// Barreira-alvo do Fuzil .50. Lê material/espessura/distância do store e se
// posiciona sozinha (não é um corpo posicionado pela física).
export function BarrierModel() {
  const params = useStore((s) => s.params.revolver);
  const on = (params?.barreira ?? 1) >= 0.5;
  const matIdx = Math.round(params?.material ?? 0);
  const T = (params?.espessura ?? 10) / 100; // m
  const D = params?.distancia ?? 25; // m
  if (!on) return null;
  const mat = BARRIER_MATERIALS[matIdx] ?? BARRIER_MATERIALS[0];
  const translucent = mat.id === "vidro" || mat.id === "gel";
  return (
    <group position={[D + T / 2, BARRIER_CENTER_Y, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[T, BARRIER_HEIGHT, 2.2]} />
        <meshStandardMaterial
          color={mat.color}
          metalness={mat.id === "aco" ? 0.8 : 0.05}
          roughness={mat.id === "aco" ? 0.35 : mat.id === "vidro" ? 0.08 : 0.85}
          transparent={translucent}
          opacity={mat.id === "vidro" ? 0.35 : mat.id === "gel" ? 0.55 : 1}
        />
      </mesh>
    </group>
  );
}

export const AirplaneModel = forwardRef<THREE.Group, { jet?: boolean }>(({ jet = false }, ref) => {
  const prop = useRef<THREE.Group>(null);
  const streams = useRef<THREE.Group>(null);
  const machCone = useRef<THREE.Mesh>(null);
  const vapor = useRef<THREE.Mesh>(null);
  const soundSpeed = useStore((s) => PLANETS[s.planetId].soundSpeed);

  const streamGeo = useMemo(() => {
    return [-1.6, 0, 1.6].map((z) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(1.6, 0.05, z),
        new THREE.Vector3(0.65, 0.34, z),
        new THREE.Vector3(0.1, 0.42, z),
        new THREE.Vector3(-0.45, 0.3, z),
        new THREE.Vector3(-1.1, -0.05, z),
        new THREE.Vector3(-2.0, -0.5, z),
      ]);
      return new THREE.TubeGeometry(curve, 40, 0.025, 8, false);
    });
  }, []);

  useFrame(() => {
    const phase = runtime.view?.bodies.find((b) => b.id === "plane")?.phase ?? 0;
    if (!jet && prop.current) prop.current.rotation.x = phase;

    const speed = runtime.view?.metrics?.[0]?.value ?? 0;
    const mach = speed / soundSpeed;

    if (streams.current) {
      const op = THREE.MathUtils.clamp(speed / 45, 0, 1) * 0.6;
      for (const c of streams.current.children) {
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = op;
      }
    }

    if (machCone.current) {
      if (mach >= 1) {
        machCone.current.visible = true;
        const mu = Math.asin(Math.min(1, 1 / mach));
        const r = THREE.MathUtils.clamp(2.5 * Math.tan(mu), 0.4, 3.2);
        machCone.current.scale.set(r, 1, r);
        (machCone.current.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp((mach - 1) * 1.2, 0, 0.5);
      } else {
        machCone.current.visible = false;
      }
    }

    if (vapor.current) {
      const band = mach > 0.86 && mach < 1.12;
      vapor.current.visible = band;
      if (band) {
        (vapor.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - Math.abs(mach - 0.99) / 0.13) * 0.4;
      }
    }
  });

  return (
    <group ref={ref}>
      <group ref={streams}>
        {streamGeo.map((g, i) => (
          <mesh key={i} geometry={g}>
            <meshBasicMaterial
              color="#8fd4ff"
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      <group position={[1.9, 0, 0]}>
        <mesh ref={machCone} rotation={[0, 0, -Math.PI / 2]} position={[-2.5, 0, 0]} visible={false}>
          <coneGeometry args={[1, 5, 30, 1, true]} />
          <meshBasicMaterial
            color="#cfe6ff"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      <mesh ref={vapor} position={[-0.2, 0, 0]} scale={[0.25, 1.4, 1.4]} visible={false}>
        <sphereGeometry args={[1, 20, 16]} />
        <meshBasicMaterial
          color="#eaf3ff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* fuselagem */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.32, 0.26, 3.2, 24]} />
        <meshStandardMaterial color="#e3e9f2" metalness={0.4} roughness={0.4} />
      </mesh>
      {/* nariz */}
      <mesh position={[1.7, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <coneGeometry args={[0.26, 0.5, 24]} />
        <meshStandardMaterial color="#cdd6e4" metalness={0.4} roughness={0.4} />
      </mesh>
      {/* janelas */}
      <mesh position={[0.4, 0.18, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.2, 0.2, 1.2, 16]} />
        <meshStandardMaterial color="#16202e" metalness={0.8} roughness={0.15} />
      </mesh>
      {/* asas */}
      <mesh position={[0.1, -0.05, 0]} castShadow>
        <boxGeometry args={[1.1, 0.08, 4.6]} />
        <meshStandardMaterial color="#c2ccdd" metalness={0.3} roughness={0.5} />
      </mesh>
      {/* estabilizador horizontal */}
      <mesh position={[-1.5, 0.12, 0]} castShadow>
        <boxGeometry args={[0.5, 0.06, 1.7]} />
        <meshStandardMaterial color="#d8443a" metalness={0.3} roughness={0.5} />
      </mesh>
      {/* estabilizador vertical */}
      <mesh position={[-1.5, 0.42, 0]} castShadow>
        <boxGeometry args={[0.5, 0.6, 0.07]} />
        <meshStandardMaterial color="#d8443a" metalness={0.3} roughness={0.5} />
      </mesh>

      {jet ? (
        [-1.4, 1.4].map((z, i) => (
          <group key={i} position={[0.1, -0.28, z]}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.22, 0.22, 0.95, 20]} />
              <meshStandardMaterial color="#5a6477" metalness={0.85} roughness={0.3} />
            </mesh>
            <mesh position={[-0.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.18, 0.18, 0.06, 20]} />
              <meshStandardMaterial color="#ff8a3c" emissive="#ff5a1c" emissiveIntensity={1.2} />
            </mesh>
          </group>
        ))
      ) : (
        <group ref={prop} position={[1.98, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.12, 12]} />
            <meshStandardMaterial color="#33404f" metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh rotation={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.04, 1.7, 0.14]} />
            <meshStandardMaterial color="#222a3a" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <boxGeometry args={[0.04, 1.7, 0.14]} />
            <meshStandardMaterial color="#222a3a" metalness={0.5} roughness={0.5} />
          </mesh>
        </group>
      )}
    </group>
  );
});
AirplaneModel.displayName = "AirplaneModel";
