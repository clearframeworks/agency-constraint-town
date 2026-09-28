"use client";

import { ContactShadows, Line, OrbitControls, Text } from "@react-three/drei";
import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import * as THREE from "three";
import type { AgentSnapshot } from "@/lib/simulation";
import { getAgentStatus } from "@/lib/simulation";

const STATUS_COLORS = {
  stable: "#75e0a7",
  "under pressure": "#f3b562",
  "compound failure": "#f26f67",
  displaced: "#838899",
} as const;

export type ViewCommand = {
  id: number;
  action: "zoom-in" | "zoom-out" | "reset" | "overhead";
};

export function homePosition(id: number): [number, number, number] {
  const row = Math.floor(id / 12);
  const column = id % 12;
  const roadOffset = column >= 6 ? 2.5 : 0;
  return [column * 2.15 - 13 + roadOffset, 0, row * 2.15 - 1.5];
}

function Ground() {
  const laneLines = useMemo(() => {
    const lines: Array<[number, number, number]> = [];
    for (let z = -22; z <= 22; z += 3) lines.push([0, 0.024, z]);
    return lines;
  }, []);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[74, 66, 1, 1]} />
        <meshStandardMaterial color="#171a20" roughness={0.94} metalness={0.02} />
      </mesh>
      <mesh position={[0, 0.04, 9]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[5.1, 44]} />
        <meshStandardMaterial color="#252930" roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.05, -8]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[62, 5.5]} />
        <meshStandardMaterial color="#272b32" roughness={0.88} />
      </mesh>
      {laneLines.map(([x, y, z]) => (
        <mesh key={z} position={[x, y, z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.12, 1.35]} />
          <meshBasicMaterial color="#c3aa70" transparent opacity={0.5} />
        </mesh>
      ))}
      <gridHelper args={[66, 66, "#323946", "#242b34"]} position={[0, 0.015, 0]} />
    </group>
  );
}

function CivicBuilding({
  position,
  size,
  color,
  label,
  windows = 4,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  label: string;
  windows?: number;
}) {
  return (
    <group position={position}>
      <mesh position={[0, size[1] / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.72} metalness={0.08} />
      </mesh>
      {Array.from({ length: windows }, (_, index) => (
        <mesh key={index} position={[-size[0] / 2 + 0.65 + index * ((size[0] - 1.3) / Math.max(1, windows - 1)), size[1] * 0.58, size[2] / 2 + 0.012]}>
          <planeGeometry args={[0.42, 0.7]} />
          <meshStandardMaterial color="#dfc88b" emissive="#a8792b" emissiveIntensity={1.1} />
        </mesh>
      ))}
      <Text
        position={[0, size[1] + 0.45, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.52}
        color="#dce8df"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
}

function Home({ agent, selected, onSelect }: { agent: AgentSnapshot; selected: boolean; onSelect: () => void }) {
  const position = homePosition(agent.id);
  const status = getAgentStatus(agent);
  const color = STATUS_COLORS[status];
  const height = 0.58 + (agent.id % 3) * 0.12;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect();
  };

  return (
    <group position={position} onClick={handleClick}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.42, height, 1.36]} />
        <meshStandardMaterial
          color={status === "displaced" ? "#3c4143" : selected ? "#d6e0ef" : "#647080"}
          roughness={0.84}
          emissive={selected ? "#677f9c" : "#000000"}
          emissiveIntensity={selected ? 0.55 : 0}
        />
      </mesh>
      <mesh position={[0, height + 0.24, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.02, 0.52, 4]} />
        <meshStandardMaterial color={status === "displaced" ? "#292d2e" : "#303944"} roughness={0.88} />
      </mesh>
      <mesh position={[0, height * 0.55, 0.691]}>
        <planeGeometry args={[0.34, 0.28]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={status === "stable" ? 0.5 : 1.25} />
      </mesh>
      <mesh position={[0.43, 0.15, 0.72]}>
        <boxGeometry args={[0.24, 0.3, 0.05]} />
        <meshStandardMaterial color="#1d242e" />
      </mesh>
      <mesh position={[0, height + 1.03, 0]}>
        <sphereGeometry args={[selected ? 0.19 : 0.12, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Trees() {
  const trees = useMemo(
    () => Array.from({ length: 52 }, (_, index) => ({
      x: ((index * 7) % 31) - 15,
      z: ((index * 13) % 47) - 22,
      scale: 0.72 + (index % 5) * 0.09,
    })).filter((tree) => Math.abs(tree.x) > 3 && !(tree.z < -5 && tree.z > -12)),
    [],
  );
  return (
    <group>
      {trees.map((tree, index) => (
        <group key={index} position={[tree.x, 0, tree.z]} scale={tree.scale}>
          <mesh position={[0, 0.52, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.1, 1.04, 8]} />
            <meshStandardMaterial color="#473b2e" roughness={1} />
          </mesh>
          <mesh position={[0, 1.28, 0]} castShadow>
            <dodecahedronGeometry args={[0.55, 1]} />
            <meshStandardMaterial color="#293b37" roughness={0.96} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function StreetLights() {
  return (
    <group>
      {Array.from({ length: 14 }, (_, index) => {
        const z = -18 + index * 3;
        return (
          <group key={z} position={[index % 2 === 0 ? -3.3 : 3.3, 0, z]}>
            <mesh position={[0, 1.4, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.055, 2.8, 8]} />
              <meshStandardMaterial color="#353e3c" metalness={0.5} roughness={0.45} />
            </mesh>
            <mesh position={[0, 2.83, 0]}>
              <sphereGeometry args={[0.12, 12, 12]} />
              <meshStandardMaterial color="#ffe2a4" emissive="#ffbe55" emissiveIntensity={2.5} toneMapped={false} />
            </mesh>
            <pointLight position={[0, 2.72, 0]} intensity={0.75} distance={5} color="#ffc66b" />
          </group>
        );
      })}
    </group>
  );
}

function Commuters({ agents, day }: { agents: AgentSnapshot[]; day: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const active = useMemo(() => agents.slice(0, 42), [agents]);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const time = clock.getElapsedTime();
    active.forEach((agent, index) => {
      const home = homePosition(agent.id);
      const progress = (Math.sin(time * 0.28 + index * 0.73 + day * 0.02) + 1) / 2;
      const destinationX = agent.id % 2 === 0 ? 15 : -13;
      const destinationZ = -13 + (agent.zone % 3) * 2.4;
      dummy.position.set(
        THREE.MathUtils.lerp(home[0], destinationX, progress),
        0.16,
        THREE.MathUtils.lerp(home[2], destinationZ, progress),
      );
      dummy.scale.setScalar(agent.employed ? 1 : 0.45);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, active.length]} castShadow>
      <capsuleGeometry args={[0.055, 0.18, 4, 8]} />
      <meshStandardMaterial color="#b9cfc2" emissive="#567668" emissiveIntensity={0.25} />
    </instancedMesh>
  );
}

function TownScene({
  agents,
  day,
  selectedId,
  onSelect,
  viewCommand,
}: {
  agents: AgentSnapshot[];
  day: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
  viewCommand: ViewCommand;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const selectedHome = selectedId === null ? null : homePosition(selectedId);

  useEffect(() => {
    const orbit = controls.current;
    if (!orbit || viewCommand.id === 0) return;

    if (viewCommand.action === "reset") {
      orbit.target.set(0, 0, 5);
      camera.position.set(27, 29, 37);
    } else if (viewCommand.action === "overhead") {
      orbit.target.set(0, 0, 4);
      camera.position.set(0.01, 69, 10);
    } else {
      const offset = camera.position.clone().sub(orbit.target);
      const nextDistance = THREE.MathUtils.clamp(
        offset.length() * (viewCommand.action === "zoom-in" ? 0.72 : 1.38),
        10,
        90,
      );
      camera.position.copy(orbit.target).add(offset.setLength(nextDistance));
    }
    camera.updateProjectionMatrix();
    orbit.update();
  }, [camera, viewCommand]);

  return (
    <>
      <color attach="background" args={["#090b0e"]} />
      <fog attach="fog" args={["#090b0e", 45, 95]} />
      <ambientLight intensity={0.8} color="#c4d2e6" />
      <hemisphereLight args={["#bacbdf", "#15181f", 1.25]} />
      <directionalLight
        castShadow
        position={[-14, 28, -10]}
        intensity={2.4}
        color="#e1e8f5"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={80}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
      />
      <Ground />
      <Trees />
      <StreetLights />

      <CivicBuilding position={[15, 0, -15]} size={[8, 4.6, 7]} color="#485463" label="WORK" windows={7} />
      <CivicBuilding position={[-14, 0, -15]} size={[6.5, 3.2, 5]} color="#59616c" label="FOOD" windows={5} />
      <CivicBuilding position={[-5.5, 0, -15.2]} size={[5.2, 4.2, 4.7]} color="#435365" label="CLINIC" windows={4} />
      <CivicBuilding position={[6.5, 0, -15]} size={[5.5, 3.7, 5.2]} color="#4b5363" label="SERVICES" windows={4} />

      <group position={[0, 0, -4.5]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[4.1, 0.7, 1.2]} />
          <meshStandardMaterial color="#374351" metalness={0.35} roughness={0.58} />
        </mesh>
        <mesh position={[0, 0.83, 0]}>
          <boxGeometry args={[3.25, 0.34, 1]} />
          <meshStandardMaterial color="#65758b" />
        </mesh>
        <Text position={[0, 1.3, 0]} fontSize={0.36} color="#d6e1f0" rotation={[-Math.PI / 2, 0, 0]}>
          TRANSIT
        </Text>
      </group>

      {agents.map((agent) => (
        <Home key={agent.id} agent={agent} selected={agent.id === selectedId} onSelect={() => onSelect(agent.id)} />
      ))}

      {selectedHome && (
        <Line
          points={[
            [selectedHome[0], 0.16, selectedHome[2]],
            [0, 0.18, -8],
            [15, 0.2, -12],
          ]}
          color="#bfdaff"
          lineWidth={1.4}
          dashed
          dashSize={0.45}
          gapSize={0.28}
          transparent
          opacity={0.9}
        />
      )}

      <Commuters agents={agents} day={day} />
      <ContactShadows position={[0, 0.03, 0]} opacity={0.42} scale={62} blur={2.6} far={22} />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.055}
        minDistance={10}
        maxDistance={90}
        minPolarAngle={0.16}
        maxPolarAngle={1.42}
        target={[0, 0, 5]}
      />
    </>
  );
}

export function TownCanvas({
  agents,
  day,
  selectedId,
  onSelect,
  viewCommand,
}: {
  agents: AgentSnapshot[];
  day: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
  viewCommand: ViewCommand;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(element);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(preference.matches);
    updateMotion();
    preference.addEventListener("change", updateMotion);
    return () => { observer.disconnect(); preference.removeEventListener("change", updateMotion); };
  }, []);
  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
    <Canvas
      shadows
      frameloop={!visible ? "never" : reducedMotion ? "demand" : "always"}
      dpr={[1, 1.5]}
      camera={{ position: [27, 29, 37], fov: 38, near: 0.1, far: 120 }}
      gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping }}
      onPointerMissed={() => onSelect(-1)}
    >
      <TownScene agents={agents} day={day} selectedId={selectedId} onSelect={onSelect} viewCommand={viewCommand} />
    </Canvas>
    </div>
  );
}
