/** Compile the real attachment layout without drawing or retaining renderer state.
 * Renderer.init must already have completed: compileAsync captures this target
 * synchronously before yielding to shader construction/driver compilation. */
export function compileRenderPass(
  renderer,
  { scene, camera, object = scene, target = null, mrt = null },
) {
  if (renderer.initialized === false)
    throw new Error("Renderer must be initialized before pass compilation");
  const previousTarget = renderer.getRenderTarget();
  const previousMrt = renderer.getMRT?.() ?? null;
  try {
    renderer.setRenderTarget(target);
    renderer.setMRT?.(mrt);
    return renderer.compileAsync(object, camera, scene);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setMRT?.(previousMrt);
  }
}
