import { instancedArray, attributeArray } from "three/tsl";

const VEC3_STRIDE = 3;
const VEC4_STRIDE = 4;

/**
 * CPU-side staging arrays are kept alongside TSL buffers because audit/debug
 * initialization still samples from the raw xyz positions during setup.
 *
 * @typedef {Object} TSLBufferBundle
 * @property {number} count Runtime particle count used by compute/material setup.
 * @property {number} capacity Modal stack capacity used for mode storage.
 * @property {number} fftHalfSize FFT bin count mirrored into the runtime buffer.
 * @property {*} modeBuffer TSL modal-slot buffer consumed by runtime updates.
 * @property {*} fftBuffer TSL FFT buffer consumed by runtime updates.
 * @property {Float32Array} basePositions CPU-side xyz staging array used by audit setup.
 * @property {*} basePositionBuffer TSL vec4 base-position buffer consumed by compute.
 * @property {*} baryonBuffer TSL vec4 logo-position buffer consumed by compute and audit setup.
 * @property {*} scalarFieldBuffer TSL vec4 scalar-field scratch buffer consumed by compute.
 * @property {*} zeroPointsBuffer TSL vec4 zero-point buffer consumed by compute.
 * @property {Float32Array} initialParticlePositions CPU-side xyz staging array used by audit setup.
 * @property {*} particlesBuffer TSL vec4 particle state buffer consumed by compute/material setup.
 * @property {*} velocityBuffer TSL vec4 velocity state buffer consumed by compute.
 */

function createSamplingContext(options = {}) {
  return {
    rng: options.rng ?? Math.random,
  };
}

function createVec4InstancedBuffer(count) {
  return instancedArray(count, "vec4");
}

function createVec4AttributeBuffer(count) {
  return attributeArray(count, "vec4");
}

function markBufferForUpload(buffer) {
  buffer.value.needsUpdate = true;
  return buffer;
}

function fillVec4BufferFromVec3Positions(buffer, positions, w) {
  const target = buffer.value.array;

  for (let i = 0; i < positions.length / VEC3_STRIDE; i++) {
    const sourceOffset = i * VEC3_STRIDE;
    const targetOffset = i * VEC4_STRIDE;
    target[targetOffset] = positions[sourceOffset];
    target[targetOffset + 1] = positions[sourceOffset + 1];
    target[targetOffset + 2] = positions[sourceOffset + 2];
    target[targetOffset + 3] = w;
  }

  return markBufferForUpload(buffer);
}

function fillRepeatedLogoBuffer(buffer, logoPositions, samplingContext) {
  const target = buffer.value.array;
  const logoCount = logoPositions.count;
  const source = logoPositions.array;
  const { rng } = samplingContext;

  for (let i = 0; i < target.length / VEC4_STRIDE; i++) {
    const sourceIndex = i % logoCount;
    const sourceOffset = sourceIndex * VEC3_STRIDE;
    const targetOffset = i * VEC4_STRIDE;
    target[targetOffset] = source[sourceOffset];
    target[targetOffset + 1] = source[sourceOffset + 1];
    target[targetOffset + 2] = source[sourceOffset + 2];
    target[targetOffset + 3] = rng();
  }

  return markBufferForUpload(buffer);
}

function fillParticlesAndVelocities(
  particlesBuffer,
  velocityBuffer,
  initialParticlePositions,
) {
  const particleTarget = particlesBuffer.value.array;
  const velocityTarget = velocityBuffer.value.array;

  for (let i = 0; i < initialParticlePositions.length / VEC3_STRIDE; i++) {
    const sourceOffset = i * VEC3_STRIDE;
    const targetOffset = i * VEC4_STRIDE;
    particleTarget[targetOffset] = initialParticlePositions[sourceOffset];
    particleTarget[targetOffset + 1] =
      initialParticlePositions[sourceOffset + 1];
    particleTarget[targetOffset + 2] =
      initialParticlePositions[sourceOffset + 2];
    particleTarget[targetOffset + 3] = 0.0;
    velocityTarget[targetOffset] = 0.0;
    velocityTarget[targetOffset + 1] = 0.0;
    velocityTarget[targetOffset + 2] = 0.0;
    velocityTarget[targetOffset + 3] = 0.0;
  }

  markBufferForUpload(particlesBuffer);
  return markBufferForUpload(velocityBuffer);
}

function writeRandomVolumePosition(target, offset, radius, rng) {
  const radialDistance = Math.pow(rng(), 1 / 3) * radius;
  const theta = rng() * Math.PI * 2;
  const phi = Math.acos(2 * rng() - 1);

  target[offset] = radialDistance * Math.sin(phi) * Math.cos(theta);
  target[offset + 1] = radialDistance * Math.sin(phi) * Math.sin(theta);
  target[offset + 2] = radialDistance * Math.cos(phi);
}

function sampleSurfaceAndVolumePositions(
  count,
  radius,
  surfaceRatio,
  samplingContext,
) {
  const positions = new Float32Array(count * VEC3_STRIDE);
  const surfaceCount = Math.floor(count * surfaceRatio);
  const { rng } = samplingContext;

  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const angleIncrement = Math.PI * 2 * goldenRatio;
  for (let i = 0; i < surfaceCount; i++) {
    const t = i / surfaceCount;
    const inclination = Math.acos(1 - 2 * t);
    const azimuth = angleIncrement * i;
    const offset = i * VEC3_STRIDE;
    positions[offset] = radius * Math.sin(inclination) * Math.cos(azimuth);
    positions[offset + 1] = radius * Math.sin(inclination) * Math.sin(azimuth);
    positions[offset + 2] = radius * Math.cos(inclination);
  }
  for (let i = surfaceCount; i < count; i++) {
    const offset = i * VEC3_STRIDE;
    writeRandomVolumePosition(positions, offset, radius, rng);
  }
  return positions;
}

function sampleInitialParticlePositions(count, radius, samplingContext) {
  const scaledRadius = radius / 10;
  const sampledPositions = new Float32Array(count * VEC3_STRIDE);
  const { rng } = samplingContext;

  for (let i = 0; i < count; i++) {
    const offset = i * VEC3_STRIDE;
    writeRandomVolumePosition(sampledPositions, offset, scaledRadius, rng);
  }

  return sampledPositions;
}

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`[buffers] ${name} must be a positive integer`);
  }
}

function validateTSLBufferInputs(baryonGeometry, parameters, audioConfig) {
  assertPositiveInteger("parameters.count", parameters?.count);
  assertPositiveInteger("audioConfig.capacity", audioConfig?.capacity);
  assertPositiveInteger("audioConfig.fftSize", audioConfig?.fftSize);

  const logoPositions = baryonGeometry?.attributes?.position;
  if (!logoPositions?.count || !logoPositions?.array?.length) {
    throw new Error(
      "[buffers] baryonGeometry must include a non-empty position attribute",
    );
  }
}

/**
 * Builds the TSL runtime buffers and CPU-side staging arrays needed by both
 * compute/material setup and audit shadow-state initialization.
 *
 * @param {import("three").BufferGeometry} baryonGeometry
 * @param {{ count: number, radius: number, surfaceRatio: number }} parameters
 * @param {{ capacity: number, fftSize: number }} audioConfig
 * @param {{ rng?: () => number }} [options]
 * @returns {TSLBufferBundle}
 */
export function createTSLBuffers(
  baryonGeometry,
  parameters,
  audioConfig,
  options = undefined,
) {
  validateTSLBufferInputs(baryonGeometry, parameters, audioConfig);
  const samplingContext = createSamplingContext(options);

  const count = parameters.count;
  const capacity = audioConfig.capacity;
  const fftHalfSize = audioConfig.fftSize / 2;

  const modeBuffer = createVec4InstancedBuffer(capacity);
  modeBuffer.value.array.fill(0);
  markBufferForUpload(modeBuffer);

  const fftBuffer = instancedArray(fftHalfSize, "float");

  const basePositions = sampleSurfaceAndVolumePositions(
    count,
    parameters.radius,
    parameters.surfaceRatio,
    samplingContext,
  );
  const basePositionBuffer = fillVec4BufferFromVec3Positions(
    createVec4InstancedBuffer(count),
    basePositions,
    1.0,
  );

  const baryonBuffer = fillRepeatedLogoBuffer(
    createVec4InstancedBuffer(count),
    baryonGeometry.attributes.position,
    samplingContext,
  );

  const scalarFieldBuffer = createVec4InstancedBuffer(count);
  const zeroPointsBuffer = fillVec4BufferFromVec3Positions(
    createVec4InstancedBuffer(count),
    basePositions,
    2.0,
  );

  const initialParticlePositions = sampleInitialParticlePositions(
    count,
    parameters.radius,
    samplingContext,
  );
  const particlesBuffer = createVec4AttributeBuffer(count);
  const velocityBuffer = createVec4AttributeBuffer(count);
  fillParticlesAndVelocities(
    particlesBuffer,
    velocityBuffer,
    initialParticlePositions,
  );

  return {
    count,
    capacity,
    fftHalfSize,
    modeBuffer,
    fftBuffer,
    basePositions,
    basePositionBuffer,
    baryonBuffer,
    scalarFieldBuffer,
    zeroPointsBuffer,
    initialParticlePositions,
    particlesBuffer,
    velocityBuffer,
  };
}
