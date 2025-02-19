import * as THREE from 'three';
import { Text } from '@react-three/drei';

export function DebugPlane({
  texture,
  position,
  size = [3, 3],
  label,
}: {
  texture: THREE.Texture;
  position: [number, number, number];
  size?: [number, number];
  label?: string;
}) {
  // Determine if label should be above or below based on y position
  const isTopPlane = position[1] > 0;
  const labelOffset = isTopPlane ? size[1] / 2 + 0.3 : -size[1] / 2 - 0.3;

  return (
    <group position={position}>
      <mesh>
        <planeGeometry args={size} />
        <meshBasicMaterial>
          <primitive attach="map" object={texture} />
        </meshBasicMaterial>
      </mesh>
      {label && (
        <Text
          position={[0, labelOffset, 0]}
          fontSize={0.3}
          color="white"
          anchorX="center"
          anchorY={isTopPlane ? 'bottom' : 'top'}
        >
          {label}
        </Text>
      )}
    </group>
  );
}
