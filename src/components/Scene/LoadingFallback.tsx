import { Sphere } from '@react-three/drei';

export function LoadingFallback() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <Sphere args={[0.5, 32, 32]}>
        <meshStandardMaterial color="#ffffff" wireframe />
      </Sphere>
    </>
  );
}
