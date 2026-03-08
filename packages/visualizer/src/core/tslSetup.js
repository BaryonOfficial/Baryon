import { createTSLBuffers } from './tsl/buffers.js';
import { createTSLUniforms } from './tsl/uniforms.js';
import { createComputeNodes } from './tsl/computeNodes.js';
import { createParticlePoints } from './tsl/material.js';
import { createAuditState } from './tsl/auditMirror.js';
import { tickTSLRuntime } from './tsl/runtime.js';

export function setupTSL(baryonGeometry, parameters, audioConfig) {
  const buffers = createTSLBuffers(baryonGeometry, parameters, audioConfig);
  const uniforms = createTSLUniforms(parameters);
  const compute = createComputeNodes({
    count: buffers.count,
    capacity: buffers.capacity,
    buffers,
    uniforms,
  });
  const points = createParticlePoints({
    count: buffers.count,
    particlesBuffer: buffers.particlesBuffer,
    uniforms,
  });

  return {
    points,
    uniforms,
    compute,
    audit: createAuditState(
      buffers.basePositions,
      buffers.initialParticlePositions,
      buffers.baryonBuffer.value.array
    ),
    modeBuffer: buffers.modeBuffer,
    fftBuffer: buffers.fftBuffer,
    particlesBuffer: buffers.particlesBuffer,
    zeroPointsBuffer: buffers.zeroPointsBuffer,
    basePositions: buffers.basePositions,
    baseThreshold: parameters.threshold,
    fftSize: audioConfig.fftSize,
    capacity: buffers.capacity,
    prevModeSlots: new Float32Array(buffers.capacity * 4),
    prevFieldState: 'idle',
  };
}

export function tickTSL(renderer, tslState, featureFrame, time, deltaTime) {
  tickTSLRuntime(renderer, tslState, featureFrame, time, deltaTime);
}

export function disposeTSL(tslState) {
  if (!tslState?.points) return;
  tslState.points.geometry?.dispose?.();
  tslState.points.material?.dispose?.();
}
