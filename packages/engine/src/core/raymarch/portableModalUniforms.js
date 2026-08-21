import * as THREE from "three";
import { uniformArray } from "three/tsl";

function normalizeCapacity(capacity) {
  return Math.max(1, Math.floor(Number.isFinite(capacity) ? capacity : 1));
}

/**
 * CPU-owned vec4 packet with a WebGL2/WebGPU portable uniform-buffer view.
 *
 * `value.array` intentionally preserves the existing packet-upload contract.
 * It is staging memory, not a sampled spatial cache. `uniforms` is the only
 * GPU representation and is refreshed from the staging packet after a write.
 */
export function createPortableModalUniformBuffer(capacity) {
  const normalizedCapacity = normalizeCapacity(capacity);
  const stagingArray = new Float32Array(normalizedCapacity * 4);
  const values = Array.from(
    { length: normalizedCapacity },
    () => new THREE.Vector4(),
  );
  const uniforms = uniformArray(values, "vec4");

  const buffer = {
    representation: "portable-uniform-array",
    value: {
      array: stagingArray,
      needsUpdate: true,
    },
    uniforms,
    syncUniforms() {
      for (let index = 0; index < normalizedCapacity; index += 1) {
        const offset = index * 4;
        values[index].set(
          stagingArray[offset],
          stagingArray[offset + 1],
          stagingArray[offset + 2],
          stagingArray[offset + 3],
        );
      }
      buffer.value.needsUpdate = false;
    },
    dispose() {
      uniforms.dispose?.();
    },
  };

  buffer.syncUniforms();
  return buffer;
}

export function syncPortableModalUniformBuffer(buffer) {
  buffer?.syncUniforms?.();
}
