export function handleResize({ sizes, camera, renderer, effectComposer, particles }) {
  // Dimensions
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  sizes.pixelRatio = Math.min(window.devicePixelRatio, 2);

  // Camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(sizes.pixelRatio);

  // Effect Composer
  effectComposer.setSize(sizes.width, sizes.height);
  effectComposer.setPixelRatio(sizes.pixelRatio);

  // Shader uniforms
  if (particles?.material?.uniforms?.uResolution?.value) {
    particles.material.uniforms.uResolution.value.set(
      sizes.width * sizes.pixelRatio,
      sizes.height * sizes.pixelRatio
    );
  }
}
