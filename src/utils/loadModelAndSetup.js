export async function loadModelAndSetup({
  gltfLoader,
  scene,
  renderer,
  parameters,
  baseGeometry,
  colors,
  sizes,
  gpgpuSetup,
  particlesSetup,
}) {
  const baseGeometry2 = {};

  // Load the GLTF model
  const gltf = await gltfLoader.loadAsync('./glb/Baryon_v2.glb');
  baseGeometry2.instance = gltf.scene.children[0];

  // Apply transformations
  baseGeometry2.instance.scale.set(0.2, 0.2, 0.2);
  baseGeometry2.instance.updateMatrix();
  baseGeometry2.instance.geometry.applyMatrix4(baseGeometry2.instance.matrix);
  baseGeometry2.instance.matrix.identity();
  baseGeometry2.instance.matrix.decompose(
    baseGeometry2.instance.position,
    baseGeometry2.instance.quaternion,
    baseGeometry2.instance.scale
  );

  baseGeometry2.geometry = baseGeometry2.instance.geometry;
  baseGeometry2.count = baseGeometry2.geometry.attributes.position.count;

  // Setup GPGPU
  const { gpgpu, essentiaData } = gpgpuSetup(scene, baseGeometry, renderer, parameters, baseGeometry2);

  // Setup Particles
  const { particles, materialParameters } = particlesSetup(parameters, sizes, gpgpu, baseGeometry, colors, scene);

  return {
    baseGeometry2,
    gpgpu,
    essentiaData,
    particles,
    materialParameters,
  };
}
