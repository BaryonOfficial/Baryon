import * as THREE from "three";
import { MeshBasicNodeMaterial, WebGPURenderer } from "three/webgpu";
import {
  Fn,
  Loop,
  float,
  int,
  ivec2,
  screenCoordinate,
  textureLoad,
  vec4,
} from "three/tsl";
import { deriveRadiativeTransferIntervalNode } from "../core/raymarch/SafeVolumetricLightingModel.js";

/** Execute the production interval helper in a Float32 fragment shader. */
export async function runRadiativeTransferGpuProbe(fixtures) {
  const renderer = new WebGPURenderer({ antialias: false });
  const target = new THREE.RenderTarget(fixtures.length, 1, {
    type: THREE.FloatType,
    depthBuffer: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  const data = Float32Array.from(
    fixtures.flatMap(({ extinction, distance, steps }) => [
      extinction,
      distance,
      steps,
      0,
    ]),
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
  material.colorNode = Fn(() => {
    const fixture = textureLoad(input, ivec2(screenCoordinate.xy)).toVar();
    const interval = fixture.y.div(fixture.z).toVar();
    const transmittance = float(1).toVar();
    const radiance = float(0).toVar();
    Loop({ start: int(0), end: int(fixture.z) }, () => {
      const { falloff, segmentIntegral } = deriveRadiativeTransferIntervalNode(
        fixture.x,
        interval,
      );
      // Unit emission isolates the optical integration weight from palette,
      // material calibration and postprocessing, using production recurrence.
      radiance.addAssign(transmittance.mul(segmentIntegral));
      transmittance.mulAssign(falloff);
    });
    return vec4(radiance, transmittance, 0, 1);
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
      throw new Error("Native WebGPU required for optical regression");
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
        radiance: pixels[4 * index],
        transmittance: pixels[4 * index + 1],
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
