import { instancedArray, attributeArray } from 'three/tsl';

function initializeParticlesInSphereVolumeAndSurface(count, radius, surfaceRatio) {
  const positions = new Float32Array(count * 3);
  const surfaceCount = Math.floor(count * surfaceRatio);

  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const angleIncrement = Math.PI * 2 * goldenRatio;
  for (let i = 0; i < surfaceCount; i++) {
    const t = i / surfaceCount;
    const inclination = Math.acos(1 - 2 * t);
    const azimuth = angleIncrement * i;
    positions[i * 3] = radius * Math.sin(inclination) * Math.cos(azimuth);
    positions[i * 3 + 1] = radius * Math.sin(inclination) * Math.sin(azimuth);
    positions[i * 3 + 2] = radius * Math.cos(inclination);
  }
  for (let i = surfaceCount; i < count; i++) {
    const r = Math.pow(Math.random(), 1 / 3) * radius;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

function initializeParticlesInSphere(count, radius) {
  const scaledRadius = radius / 10;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = Math.pow(Math.random(), 1 / 3) * scaledRadius;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  return positions;
}

export function createTSLBuffers(baryonGeometry, parameters, audioConfig) {
  const count = parameters.count;
  const capacity = audioConfig.capacity;
  const fftHalfSize = audioConfig.fftSize / 2;

  const modeBuffer = instancedArray(capacity, 'vec4');
  modeBuffer.value.array.fill(0);
  modeBuffer.value.needsUpdate = true;

  const fftBuffer = instancedArray(fftHalfSize, 'float');

  const basePositions = initializeParticlesInSphereVolumeAndSurface(
    count,
    parameters.radius,
    parameters.surfaceRatio
  );
  const basePositionBuffer = instancedArray(count, 'vec4');
  for (let i = 0; i < count; i++) {
    basePositionBuffer.value.array[i * 4] = basePositions[i * 3];
    basePositionBuffer.value.array[i * 4 + 1] = basePositions[i * 3 + 1];
    basePositionBuffer.value.array[i * 4 + 2] = basePositions[i * 3 + 2];
    basePositionBuffer.value.array[i * 4 + 3] = 1.0;
  }
  basePositionBuffer.value.needsUpdate = true;

  const logoAttr = baryonGeometry.attributes.position;
  const logoCount = logoAttr.count;
  const baryonBuffer = instancedArray(count, 'vec4');
  for (let i = 0; i < count; i++) {
    const j = i % logoCount;
    baryonBuffer.value.array[i * 4] = logoAttr.array[j * 3];
    baryonBuffer.value.array[i * 4 + 1] = logoAttr.array[j * 3 + 1];
    baryonBuffer.value.array[i * 4 + 2] = logoAttr.array[j * 3 + 2];
    baryonBuffer.value.array[i * 4 + 3] = Math.random();
  }
  baryonBuffer.value.needsUpdate = true;

  const scalarFieldBuffer = instancedArray(count, 'vec4');
  const zeroPointsBuffer = instancedArray(count, 'vec4');
  for (let i = 0; i < count; i++) {
    zeroPointsBuffer.value.array[i * 4] = basePositions[i * 3];
    zeroPointsBuffer.value.array[i * 4 + 1] = basePositions[i * 3 + 1];
    zeroPointsBuffer.value.array[i * 4 + 2] = basePositions[i * 3 + 2];
    zeroPointsBuffer.value.array[i * 4 + 3] = 2.0;
  }
  zeroPointsBuffer.value.needsUpdate = true;

  const initialParticlePositions = initializeParticlesInSphere(count, parameters.radius);
  const particlesBuffer = attributeArray(count, 'vec4');
  const velocityBuffer = attributeArray(count, 'vec4');
  for (let i = 0; i < count; i++) {
    particlesBuffer.value.array[i * 4] = initialParticlePositions[i * 3];
    particlesBuffer.value.array[i * 4 + 1] = initialParticlePositions[i * 3 + 1];
    particlesBuffer.value.array[i * 4 + 2] = initialParticlePositions[i * 3 + 2];
    particlesBuffer.value.array[i * 4 + 3] = 0.0;
    velocityBuffer.value.array[i * 4] = 0.0;
    velocityBuffer.value.array[i * 4 + 1] = 0.0;
    velocityBuffer.value.array[i * 4 + 2] = 0.0;
    velocityBuffer.value.array[i * 4 + 3] = 0.0;
  }
  particlesBuffer.value.needsUpdate = true;
  velocityBuffer.value.needsUpdate = true;

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
