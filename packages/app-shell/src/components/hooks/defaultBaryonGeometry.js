import * as THREE from "three";

function findFirstMesh(root) {
  let mesh = null;
  root?.traverse((child) => {
    if (!mesh && child?.isMesh && child.geometry) {
      mesh = child;
    }
  });
  return mesh;
}

export function prepareBaryonGeometryFromScene(scene) {
  const sourceMesh = findFirstMesh(scene);
  if (!sourceMesh) {
    throw new Error("Default logo scene does not contain a mesh geometry");
  }

  const geometry = sourceMesh.geometry.clone();
  const transform = new THREE.Matrix4().makeScale(0.2, 0.2, 0.2);
  geometry.applyMatrix4(transform);

  if (!geometry.attributes.position?.count) {
    geometry.dispose();
    throw new Error("Prepared logo geometry is missing position data");
  }

  return geometry;
}
