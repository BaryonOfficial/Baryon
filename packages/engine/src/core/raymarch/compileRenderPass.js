/** The caller must keep this renderer idle until preparation settles. Three's
 * asynchronous node builder can revisit the attachment state after yielding. */
export async function compileRenderPass(
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
    return await renderer.compileAsync(object, camera, scene);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setMRT?.(previousMrt);
  }
}
