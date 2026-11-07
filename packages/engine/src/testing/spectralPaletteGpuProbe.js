import * as THREE from "three";
import { MeshBasicNodeMaterial, WebGPURenderer } from "three/webgpu";
import { Fn, ivec2, screenCoordinate, textureLoad, vec4 } from "three/tsl";
import { resolveSpectralChromaticityNode } from "../core/raymarch/spectralColorimetry.js";

/** Execute the production palette helper in a Float32 fragment shader. */
export async function runSpectralPaletteGpuProbe(fixtures) {
  const renderer = new WebGPURenderer({ antialias: false });
  const target = new THREE.RenderTarget(fixtures.length, 1, {
    type: THREE.FloatType,
    depthBuffer: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  const data = Float32Array.from(
    fixtures.flatMap(({ direction }) => [...direction, 0, 0]),
  );
  const input = new THREE.DataTexture(
    data,
    fixtures.length,
    1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  input.minFilter = input.magFilter = THREE.NearestFilter;
  input.generateMipmaps = false;
  input.needsUpdate = true;
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new MeshBasicNodeMaterial();
  material.depthTest = material.depthWrite = material.toneMapped = false;
  // Signed unit-vector components are data, not nonnegative material color.
  material.fragmentNode = Fn(() => {
    const fixture = textureLoad(input, ivec2(screenCoordinate.xy)).toVar();
    const rgb = resolveSpectralChromaticityNode(fixture.xy).toVar();
    return vec4(rgb, 1);
  })();
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = -1;
  mesh.frustumCulled = false;
  scene.add(mesh);
  try {
    await renderer.init();
    if (!("isWebGPUBackend" in renderer.backend))
      throw new Error("Native WebGPU required for palette regression");
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setRenderTarget(target);
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
    const pixels = await renderer.readRenderTargetPixelsAsync(
      target,
      0,
      0,
      fixtures.length,
      1,
    );
    const { adapterInfo } = /** @type {any} */ (renderer.backend).device;
    return {
      adapter: {
        vendor: adapterInfo.vendor,
        architecture: adapterInfo.architecture,
        device: adapterInfo.device,
        description: adapterInfo.description,
      },
      samples: fixtures.map((_, index) => ({
        rgb: [pixels[4 * index], pixels[4 * index + 1], pixels[4 * index + 2]],
      })),
    };
  } finally {
    renderer.setRenderTarget(null);
    target.dispose();
    input.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  }
}
